use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::Mutex;

use super::error::{AuthError, Result};
use super::gateway::{Gateway, TokenPair};
use super::keychain::Keychain;
use super::loopback;

/// How long the player has on lichess.org before the loopback gives up.
pub const LICHESS_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// What the web layer may know about the signed-in account: no refresh token, ever.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub user_id: String,
    pub role: String,
    pub access_token: String,
    /// Unix milliseconds.
    pub expires_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SessionView {
    /// Nothing in the keychain: reading as a guest, everything saved on this machine.
    Guest,
    SignedIn(Account),
    /// A session is in the keychain but the gateway cannot be reached right now.
    Offline,
}

/// The signed-in session. The mutex holds the current account and also lines up token
/// rotations: two refreshes racing with one refresh token would look like theft to
/// auth-profile, which then ends the session.
pub struct Session<K> {
    keychain: K,
    gateway: Gateway,
    account: Mutex<Option<Account>>,
}

impl<K: Keychain> Session<K> {
    pub fn new(keychain: K, gateway: Gateway) -> Self {
        Self {
            keychain,
            gateway,
            account: Mutex::new(None),
        }
    }

    pub fn gateway_url(&self) -> String {
        self.gateway
            .base_url()
            .as_str()
            .trim_end_matches('/')
            .to_owned()
    }

    /// At start-up, and whenever the access token is turned away: trades the keychain's
    /// refresh token for a fresh pair.
    pub async fn restore(&self) -> Result<SessionView> {
        let mut account = self.account.lock().await;
        self.rotate(&mut account).await
    }

    pub async fn email_start(&self, email: &str) -> Result<()> {
        self.gateway.email_start(email).await
    }

    /// Signs in with the code, or links the address when a user is already signed in.
    pub async fn email_verify(&self, email: &str, code: &str) -> Result<SessionView> {
        let mut account = self.account.lock().await;
        let bearer = self.user_bearer(&mut account).await?;
        let pair = self
            .gateway
            .email_verify(email, code, bearer.as_deref())
            .await?;
        self.replace(&mut account, pair)
            .await
            .map(SessionView::SignedIn)
    }

    /// The whole Lichess round: loopback, start, browser, redirect, complete.
    pub async fn lichess<F>(&self, open_browser: F, timeout: Duration) -> Result<SessionView>
    where
        F: FnOnce(&str) -> Result<()>,
    {
        let (listener, redirect_uri) = loopback::bind().await?;
        let bearer = self.user_bearer(&mut *self.account.lock().await).await?;
        let flow = self
            .gateway
            .lichess_start(&redirect_uri, bearer.as_deref())
            .await?;
        open_browser(&flow.authorize_url)?;
        // No lock while the player is on lichess.org: refreshes go on meanwhile.
        let code = loopback::await_redirect(listener, &flow.state, timeout).await?;

        let mut account = self.account.lock().await;
        // The same user as at /start, with a token that has not expired in the meantime.
        let bearer = match bearer {
            Some(_) => self.user_bearer(&mut account).await?,
            None => None,
        };
        let pair = self
            .gateway
            .lichess_complete(&code, &flow.state, bearer.as_deref())
            .await?;
        self.replace(&mut account, pair)
            .await
            .map(SessionView::SignedIn)
    }

    pub async fn unlink_lichess(&self) -> Result<()> {
        let mut account = self.account.lock().await;
        let bearer = self
            .user_bearer(&mut account)
            .await?
            .ok_or(AuthError::SignedOut)?;
        self.gateway.unlink_lichess(&bearer).await
    }

    /// Ends the session here and, when the gateway answers, on the server too.
    pub async fn sign_out(&self) -> Result<SessionView> {
        let mut account = self.account.lock().await;
        if let Some(refresh) = self.keychain.load()? {
            // Offline is fine: the token is gone from this machine either way and the
            // server forgets it when it expires.
            let _ = self.gateway.logout(&refresh).await;
        }
        self.keychain.clear()?;
        *account = None;
        Ok(SessionView::Guest)
    }

    async fn rotate(&self, account: &mut Option<Account>) -> Result<SessionView> {
        let Some(refresh) = self.keychain.load()? else {
            *account = None;
            return Ok(SessionView::Guest);
        };
        match self.gateway.refresh(&refresh).await {
            Ok(pair) => self.keep(account, pair).map(SessionView::SignedIn),
            Err(AuthError::Offline) => Ok(SessionView::Offline),
            // Expired, revoked, or reused elsewhere: this machine is no longer signed in.
            Err(err) if err.has_status(401) => {
                self.keychain.clear()?;
                *account = None;
                Ok(SessionView::Guest)
            }
            Err(err) => Err(err),
        }
    }

    /// The signed-in user's access token, refreshed first when it is about to run out.
    /// None for guests and signed-out players: their calls sign in rather than link.
    async fn user_bearer(&self, account: &mut Option<Account>) -> Result<Option<String>> {
        let expiring = account
            .as_ref()
            .is_some_and(|a| a.expires_at < now_ms() + 60_000);
        if expiring {
            self.rotate(account).await?;
        }
        Ok(account
            .as_ref()
            .filter(|a| a.role == "user")
            .map(|a| a.access_token.clone()))
    }

    /// A rotated pair of the same session.
    fn keep(&self, account: &mut Option<Account>, pair: TokenPair) -> Result<Account> {
        self.keychain.store(&pair.refresh_token)?;
        let fresh = Account::from(pair);
        *account = Some(fresh.clone());
        Ok(fresh)
    }

    /// A new session from a sign-in or link: the one it replaces is ended on the server
    /// so it does not linger there for its remaining 30 days.
    async fn replace(&self, account: &mut Option<Account>, pair: TokenPair) -> Result<Account> {
        let previous = self.keychain.load()?;
        let fresh = self.keep(account, pair)?;
        if let Some(previous) = previous {
            let _ = self.gateway.logout(&previous).await;
        }
        Ok(fresh)
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

impl From<TokenPair> for Account {
    fn from(pair: TokenPair) -> Self {
        Self {
            expires_at: now_ms() + pair.expires_in * 1000,
            user_id: pair.user_id,
            role: pair.role,
            access_token: pair.access_token,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use url::Url;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::auth::keychain::MemoryKeychain;

    fn pair(refresh: &str, role: &str) -> serde_json::Value {
        json!({
            "access_token": format!("access-for-{}", refresh.replace("refresh", "r")), "token_type": "Bearer", "expires_in": 900,
            "refresh_token": refresh, "refresh_expires_in": 2_592_000,
            "user_id": "01a212c1-93be-7974-9882-3a8bb121d09b", "role": role
        })
    }

    fn problem(status: u16, kind: &str) -> ResponseTemplate {
        ResponseTemplate::new(status).insert_header("content-type", "application/problem+json").set_body_string(
            json!({"type": format!("https://royale-gambit.dev/problems/{kind}"), "title": kind, "status": status})
                .to_string(),
        )
    }

    async fn refresh_answers(server: &MockServer, from: &str, to: &str) {
        Mock::given(method("POST"))
            .and(path("/v1/auth/refresh"))
            .and(body_json(json!({"refresh_token": from})))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair(to, "user")))
            .up_to_n_times(1)
            .mount(server)
            .await;
    }

    fn session(server: &MockServer, keychain: MemoryKeychain) -> Session<MemoryKeychain> {
        Session::new(
            keychain,
            Gateway::new(Url::parse(&server.uri()).expect("mock url")),
        )
    }

    fn stored(session: &Session<MemoryKeychain>) -> Option<String> {
        session.keychain.load().expect("load")
    }

    #[tokio::test]
    async fn no_token_in_the_keychain_is_a_guest_without_a_call() {
        let server = MockServer::start().await;
        let session = session(&server, MemoryKeychain::default());

        assert_eq!(
            session.restore().await.expect("restore"),
            SessionView::Guest
        );
        assert!(
            server
                .received_requests()
                .await
                .expect("recorded")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn restoring_rotates_and_keeps_only_the_new_token() {
        let server = MockServer::start().await;
        refresh_answers(&server, "old", "new").await;
        let session = session(&server, MemoryKeychain::holding("old"));

        let SessionView::SignedIn(account) = session.restore().await.expect("restore") else {
            panic!("expected a signed-in session");
        };
        assert_eq!(account.access_token, "access-for-new");
        assert!(account.expires_at > now_ms() + 800_000);
        assert_eq!(stored(&session).as_deref(), Some("new"));
    }

    #[tokio::test]
    async fn the_web_layer_never_sees_the_refresh_token() {
        let server = MockServer::start().await;
        refresh_answers(&server, "old", "secret-refresh").await;
        let session = session(&server, MemoryKeychain::holding("old"));

        let shown =
            serde_json::to_string(&session.restore().await.expect("restore")).expect("json");
        assert!(!shown.contains(r#""secret-refresh""#), "{shown}");
        assert!(
            !shown.to_lowercase().contains("refresh"),
            "no refresh field at all: {shown}"
        );
        assert!(shown.contains(r#""state":"signedIn""#), "{shown}");
    }

    #[tokio::test]
    async fn a_revoked_session_is_forgotten() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/auth/refresh"))
            .respond_with(problem(401, "refresh-reused"))
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::holding("stolen"));

        assert_eq!(
            session.restore().await.expect("restore"),
            SessionView::Guest
        );
        assert_eq!(stored(&session), None);
    }

    #[tokio::test]
    async fn being_offline_keeps_the_session_for_later() {
        let session = Session::new(
            MemoryKeychain::holding("kept"),
            Gateway::new(Url::parse("http://127.0.0.1:1").expect("url")),
        );

        assert_eq!(
            session.restore().await.expect("restore"),
            SessionView::Offline
        );
        assert_eq!(
            session.keychain.load().expect("load").as_deref(),
            Some("kept")
        );
    }

    #[tokio::test]
    async fn racing_restores_rotate_one_after_the_other() {
        let server = MockServer::start().await;
        refresh_answers(&server, "a", "b").await;
        refresh_answers(&server, "b", "c").await;
        // Anything else would be a reuse, which ends the session for real.
        Mock::given(path("/v1/auth/refresh"))
            .respond_with(problem(401, "refresh-reused"))
            .mount(&server)
            .await;
        let session = Arc::new(session(&server, MemoryKeychain::holding("a")));

        let (first, second) = tokio::join!(session.restore(), session.restore());
        assert!(matches!(first, Ok(SessionView::SignedIn(_))), "{first:?}");
        assert!(matches!(second, Ok(SessionView::SignedIn(_))), "{second:?}");
        assert_eq!(stored(&session).as_deref(), Some("c"));
    }

    #[tokio::test]
    async fn an_email_code_signs_in_and_fills_the_keychain() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/auth/email/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("fresh", "user")))
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::default());

        assert!(matches!(
            session.email_verify("a@example.com", "123456").await,
            Ok(SessionView::SignedIn(_))
        ));
        assert_eq!(stored(&session).as_deref(), Some("fresh"));
    }

    #[tokio::test]
    async fn a_wrong_code_leaves_everything_as_it_was() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/auth/email/verify"))
            .respond_with(problem(401, "code-invalid"))
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::default());

        let err = session
            .email_verify("a@example.com", "000000")
            .await
            .expect_err("wrong code");
        assert!(err.has_status(401));
        assert_eq!(stored(&session), None);
    }

    #[tokio::test]
    async fn linking_an_email_carries_the_user_and_retires_the_old_session() {
        let server = MockServer::start().await;
        refresh_answers(&server, "lichess-session", "lichess-session-2").await;
        Mock::given(path("/v1/auth/email/verify"))
            .and(header(
                "authorization",
                "Bearer access-for-lichess-session-2",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("linked", "user")))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(path("/v1/auth/logout"))
            .and(body_json(json!({"refresh_token": "lichess-session-2"})))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::holding("lichess-session"));
        session.restore().await.expect("restore");

        session
            .email_verify("a@example.com", "123456")
            .await
            .expect("linked");
        assert_eq!(stored(&session).as_deref(), Some("linked"));
    }

    #[tokio::test]
    async fn a_guest_role_token_does_not_link() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/auth/refresh"))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("guest-2", "guest")))
            .mount(&server)
            .await;
        Mock::given(path("/v1/auth/email/verify"))
            .and(header("authorization", "Bearer access-for-guest-2"))
            .respond_with(problem(500, "should-not-carry-a-guest"))
            .mount(&server)
            .await;
        Mock::given(path("/v1/auth/email/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("user-1", "user")))
            .mount(&server)
            .await;
        Mock::given(path("/v1/auth/logout"))
            .respond_with(ResponseTemplate::new(204))
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::holding("guest-1"));
        session.restore().await.expect("restore");

        session
            .email_verify("a@example.com", "123456")
            .await
            .expect("signed in");
    }

    #[tokio::test]
    async fn unlinking_needs_someone_signed_in() {
        let server = MockServer::start().await;
        let session = session(&server, MemoryKeychain::default());
        assert_eq!(
            session.unlink_lichess().await.expect_err("guest"),
            AuthError::SignedOut
        );
    }

    #[tokio::test]
    async fn signing_out_ends_the_server_session_and_empties_the_keychain() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/auth/logout"))
            .and(body_json(json!({"refresh_token": "mine"})))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::holding("mine"));

        assert_eq!(
            session.sign_out().await.expect("signed out"),
            SessionView::Guest
        );
        assert_eq!(stored(&session), None);
    }

    #[tokio::test]
    async fn signing_out_offline_still_forgets_locally() {
        let session = Session::new(
            MemoryKeychain::holding("mine"),
            Gateway::new(Url::parse("http://127.0.0.1:1").expect("url")),
        );
        assert_eq!(
            session.sign_out().await.expect("signed out"),
            SessionView::Guest
        );
        assert_eq!(session.keychain.load().expect("load"), None);
    }

    #[tokio::test]
    async fn a_lichess_round_trip_signs_in() {
        let server = MockServer::start().await;
        let state = "st-42";
        Mock::given(method("POST"))
            .and(path("/v1/auth/lichess/start"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "authorize_url": "https://lichess.org/oauth?x=1", "state": state, "expires_in": 600
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/lichess/complete"))
            .and(body_json(json!({"code": "lichess-code", "state": state})))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("from-lichess", "user")))
            .expect(1)
            .mount(&server)
            .await;
        let session = session(&server, MemoryKeychain::default());

        // The "browser": follows the redirect Lichess would send, with the right state.
        let redirect = Arc::new(std::sync::Mutex::new(None::<String>));
        let seen = redirect.clone();
        let started = session.lichess(
            move |_authorize_url| {
                let requests = seen.clone();
                tokio::spawn(async move {
                    for _ in 0..50 {
                        let target = requests.lock().expect("lock").clone();
                        if let Some(target) = target {
                            let _ =
                                reqwest::get(format!("{target}?code=lichess-code&state={state}"))
                                    .await;
                            return;
                        }
                        tokio::time::sleep(Duration::from_millis(20)).await;
                    }
                });
                Ok(())
            },
            Duration::from_secs(5),
        );
        let watcher = async {
            loop {
                let requests = server.received_requests().await.unwrap_or_default();
                if let Some(start) = requests
                    .iter()
                    .find(|r| r.url.path() == "/v1/auth/lichess/start")
                {
                    let body: serde_json::Value =
                        serde_json::from_slice(&start.body).expect("json");
                    *redirect.lock().expect("lock") =
                        body["redirect_uri"].as_str().map(str::to_owned);
                    return;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        };
        let (result, ()) = tokio::join!(started, watcher);

        assert!(matches!(result, Ok(SessionView::SignedIn(_))), "{result:?}");
        assert_eq!(stored(&session).as_deref(), Some("from-lichess"));
    }
}
