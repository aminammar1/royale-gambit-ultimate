//! The Lichess redirect lands here: a one-shot HTTP listener on 127.0.0.1 that waits for
//! `code` and `state`, answers the browser with a short page, and hands the code over.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

use super::error::{AuthError, Result};

pub const CALLBACK_PATH: &str = "/callback";

/// Binds a free port on the loopback interface. Returns the listener and the
/// `redirect_uri` to hand to /lichess/start.
pub async fn bind() -> Result<(TcpListener, String)> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|err| {
        AuthError::unexpected(format!("could not listen for the Lichess redirect: {err}"))
    })?;
    let port = listener
        .local_addr()
        .map_err(|err| AuthError::unexpected(err.to_string()))?
        .port();
    Ok((listener, format!("http://127.0.0.1:{port}{CALLBACK_PATH}")))
}

/// Waits for the browser to come back with a code for `expected_state`.
///
/// Anything else that knocks (a favicon request, a page with someone else's state) is
/// answered and ignored, so it can neither end the wait nor slip a foreign code in.
pub async fn await_redirect(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<String> {
    let (outcomes, mut received) = mpsc::channel::<Result<String>>(4);
    let expected = expected_state.to_owned();
    let accepting = tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let outcomes = outcomes.clone();
            let expected = expected.clone();
            // One task per connection: a client that connects and never speaks must not
            // hold the door shut for the browser.
            tokio::spawn(async move {
                if let Some(outcome) = answer(stream, &expected).await {
                    let _ = outcomes.send(outcome).await;
                }
            });
        }
    });
    let outcome = tokio::time::timeout(timeout, received.recv()).await;
    accepting.abort();
    match outcome {
        Ok(Some(outcome)) => outcome,
        Ok(None) => Err(AuthError::unexpected("the redirect listener stopped")),
        Err(_) => Err(AuthError::TimedOut),
    }
}

/// Reads one request, answers it, and says what it meant for the flow (None: ignore it).
async fn answer(mut stream: TcpStream, expected_state: &str) -> Option<Result<String>> {
    let target = tokio::time::timeout(Duration::from_secs(10), request_target(&mut stream))
        .await
        .ok()
        .flatten()?;
    let Some((path, query)) = split(&target) else {
        respond(&mut stream, 400, "That was not a sign-in link.").await;
        return None;
    };
    if path != CALLBACK_PATH {
        respond(&mut stream, 404, "Nothing here.").await;
        return None;
    }
    let param = |name: &str| {
        url::form_urlencoded::parse(query.as_bytes())
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
    };
    if param("state").as_deref() != Some(expected_state) {
        respond(
            &mut stream,
            400,
            "This sign-in link was not started by Royal Gambit on this machine.",
        )
        .await;
        return None;
    }
    if param("error").is_some() {
        respond(
            &mut stream,
            200,
            "Sign-in cancelled. You can close this tab and return to Royal Gambit.",
        )
        .await;
        return Some(Err(AuthError::Cancelled));
    }
    let Some(code) = param("code").filter(|code| !code.is_empty()) else {
        respond(
            &mut stream,
            400,
            "Lichess sent no code. Start the sign-in again from Royal Gambit.",
        )
        .await;
        return None;
    };
    respond(
        &mut stream,
        200,
        "Signed in. You can close this tab and return to Royal Gambit.",
    )
    .await;
    Some(Ok(code))
}

/// The request target of the first line, read without trusting the client to be quick
/// or small.
async fn request_target(stream: &mut TcpStream) -> Option<String> {
    let mut head = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
        let read = stream.read(&mut chunk).await.ok()?;
        if read == 0 || head.len() + read > 8 * 1024 {
            return None;
        }
        head.extend_from_slice(&chunk[..read]);
    }
    let line = head.split(|b| *b == b'\n').next()?;
    let mut parts = std::str::from_utf8(line).ok()?.split_whitespace();
    match (parts.next(), parts.next()) {
        (Some("GET"), Some(target)) => Some(target.to_owned()),
        _ => None,
    }
}

fn split(target: &str) -> Option<(&str, &str)> {
    if !target.starts_with('/') {
        return None;
    }
    Some(target.split_once('?').unwrap_or((target, "")))
}

async fn respond(stream: &mut TcpStream, status: u16, message: &str) {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Bad Request",
    };
    let body = format!(
        "<!doctype html><meta charset=utf-8><title>Royal Gambit</title>\
         <body style=\"font:18px Georgia,serif;margin:4rem;color:#1b1a17;background:#f2eee6\">\
         <p>{message}</p></body>"
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn get(redirect: &str, path_and_query: &str) -> (u16, String) {
        let base = url::Url::parse(redirect).expect("redirect");
        let url = format!(
            "http://127.0.0.1:{}{path_and_query}",
            base.port().expect("port")
        );
        let response = reqwest::get(url).await.expect("loopback answers");
        (
            response.status().as_u16(),
            response.text().await.expect("body"),
        )
    }

    async fn waiting(
        state: &str,
        timeout: Duration,
    ) -> (String, tokio::task::JoinHandle<Result<String>>) {
        let (listener, redirect) = bind().await.expect("bind");
        let state = state.to_owned();
        let handle = tokio::spawn(async move { await_redirect(listener, &state, timeout).await });
        (redirect, handle)
    }

    #[tokio::test]
    async fn the_redirect_uri_is_loopback_with_a_real_port() {
        let (_listener, redirect) = bind().await.expect("bind");
        let url = url::Url::parse(&redirect).expect("redirect");
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_ne!(url.port(), Some(0));
        assert_eq!(url.path(), CALLBACK_PATH);
    }

    #[tokio::test]
    async fn the_code_comes_back_when_the_state_matches() {
        let (redirect, handle) = waiting("s-123", Duration::from_secs(5)).await;
        let (status, page) = get(&redirect, "/callback?code=c%2D1&state=s-123").await;

        assert_eq!(status, 200);
        assert!(page.contains("close this tab"), "{page}");
        assert_eq!(handle.await.expect("task").expect("code"), "c-1");
    }

    #[tokio::test]
    async fn a_foreign_state_is_refused_and_the_real_redirect_still_works() {
        let (redirect, handle) = waiting("mine", Duration::from_secs(5)).await;

        let (status, _) = get(&redirect, "/callback?code=stolen&state=theirs").await;
        assert_eq!(status, 400);
        let (status, _) = get(&redirect, "/callback?code=good&state=mine").await;
        assert_eq!(status, 200);

        assert_eq!(handle.await.expect("task").expect("code"), "good");
    }

    #[tokio::test]
    async fn other_paths_are_ignored() {
        let (redirect, handle) = waiting("s", Duration::from_secs(5)).await;

        assert_eq!(get(&redirect, "/favicon.ico").await.0, 404);
        assert_eq!(get(&redirect, "/callback?code=ok&state=s").await.0, 200);
        assert_eq!(handle.await.expect("task").expect("code"), "ok");
    }

    #[tokio::test]
    async fn denying_on_lichess_cancels() {
        let (redirect, handle) = waiting("s", Duration::from_secs(5)).await;
        let (status, page) = get(&redirect, "/callback?error=access_denied&state=s").await;

        assert_eq!(status, 200);
        assert!(page.contains("cancelled"), "{page}");
        assert_eq!(
            handle.await.expect("task").expect_err("cancelled"),
            AuthError::Cancelled
        );
    }

    #[tokio::test]
    async fn nobody_coming_back_times_out() {
        let (_redirect, handle) = waiting("s", Duration::from_millis(200)).await;
        assert_eq!(
            handle.await.expect("task").expect_err("timeout"),
            AuthError::TimedOut
        );
    }

    #[tokio::test]
    async fn a_client_that_never_sends_does_not_block_the_real_one() {
        let (redirect, handle) = waiting("s", Duration::from_secs(5)).await;
        let port = url::Url::parse(&redirect)
            .expect("redirect")
            .port()
            .expect("port");
        let _silent = TcpStream::connect(("127.0.0.1", port))
            .await
            .expect("connect");

        assert_eq!(get(&redirect, "/callback?code=ok&state=s").await.0, 200);
        assert_eq!(handle.await.expect("task").expect("code"), "ok");
    }
}
