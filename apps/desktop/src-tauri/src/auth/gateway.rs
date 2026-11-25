use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;
use url::Url;

use super::error::{AuthError, Result};

const DEFAULT_URL: &str = "http://localhost:8080";

/// What a sign-in or refresh hands back (contract: TokenPair). The refresh token stays
/// in the Rust core; only the rest is ever shown to the web layer.
#[derive(Debug, Clone, Deserialize)]
pub struct TokenPair {
    pub access_token: String,
    pub expires_in: u64,
    pub refresh_token: String,
    pub user_id: String,
    pub role: String,
}

/// Where to send the player for Lichess (contract: LichessAuthorization).
#[derive(Debug, Clone, Deserialize)]
pub struct LichessAuthorization {
    pub authorize_url: String,
    pub state: String,
}

/// The auth calls that carry a refresh token or create one. Everything goes through the
/// gateway, never to a service directly.
pub struct Gateway {
    base: Url,
    http: Client,
}

impl Gateway {
    pub fn new(base: Url) -> Self {
        // A gateway that hangs must not hang the Settings page: past this the player
        // sees "needs connection" and can try again.
        let http = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();
        Self { base, http }
    }

    /// `RG_GATEWAY_URL`, or the local stack's gateway.
    pub fn from_env() -> Self {
        let configured = std::env::var("RG_GATEWAY_URL").ok();
        let base = configured
            .as_deref()
            .and_then(|raw| Url::parse(raw).ok())
            .unwrap_or_else(|| {
                if let Some(raw) = &configured {
                    eprintln!("RG_GATEWAY_URL={raw} is not a URL; using {DEFAULT_URL}");
                }
                Url::parse(DEFAULT_URL)
                    .unwrap_or_else(|_| unreachable!("the default gateway URL parses"))
            });
        Self::new(base)
    }

    pub fn base_url(&self) -> &Url {
        &self.base
    }

    pub async fn email_start(&self, email: &str) -> Result<()> {
        self.send(
            self.post("/v1/auth/email/start", None)
                .json(&json!({ "email": email })),
        )
        .await
        .map(drop)
    }

    /// With a user's bearer this links the address to that account (see the contract).
    pub async fn email_verify(
        &self,
        email: &str,
        code: &str,
        bearer: Option<&str>,
    ) -> Result<TokenPair> {
        let request = self
            .post("/v1/auth/email/verify", bearer)
            .json(&json!({ "email": email, "code": code }));
        read(self.send(request).await?).await
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<TokenPair> {
        let request = self
            .post("/v1/auth/refresh", None)
            .json(&json!({ "refresh_token": refresh_token }));
        read(self.send(request).await?).await
    }

    pub async fn logout(&self, refresh_token: &str) -> Result<()> {
        let request = self
            .post("/v1/auth/logout", None)
            .json(&json!({ "refresh_token": refresh_token }));
        self.send(request).await.map(drop)
    }

    pub async fn lichess_start(
        &self,
        redirect_uri: &str,
        bearer: Option<&str>,
    ) -> Result<LichessAuthorization> {
        let request = self
            .post("/v1/auth/lichess/start", bearer)
            .json(&json!({ "redirect_uri": redirect_uri }));
        read(self.send(request).await?).await
    }

    pub async fn lichess_complete(
        &self,
        code: &str,
        state: &str,
        bearer: Option<&str>,
    ) -> Result<TokenPair> {
        let request = self
            .post("/v1/auth/lichess/complete", bearer)
            .json(&json!({ "code": code, "state": state }));
        read(self.send(request).await?).await
    }

    pub async fn unlink_lichess(&self, bearer: &str) -> Result<()> {
        let request = self
            .http
            .delete(self.url("/v1/auth/identities/lichess"))
            .bearer_auth(bearer);
        self.send(request).await.map(drop)
    }

    fn url(&self, path: &str) -> Url {
        let mut url = self.base.clone();
        url.set_path(path);
        url
    }

    fn post(&self, path: &str, bearer: Option<&str>) -> RequestBuilder {
        let request = self.http.post(self.url(path));
        match bearer {
            Some(token) => request.bearer_auth(token),
            None => request,
        }
    }

    async fn send(&self, request: RequestBuilder) -> Result<Response> {
        // Any failure to get an answer at all (refused, DNS, timeout) reads as offline:
        // the session is kept and the player can retry.
        let response = request.send().await.map_err(|_| AuthError::Offline)?;
        if response.status().is_success() {
            return Ok(response);
        }
        Err(problem(response).await)
    }
}

/// The fields of an RFC 9457 problem the app acts on.
#[derive(Deserialize)]
struct ProblemBody {
    #[serde(rename = "type")]
    kind: Option<String>,
    title: Option<String>,
    detail: Option<String>,
    attempts_left: Option<u32>,
}

async fn problem(response: Response) -> AuthError {
    let status = response.status();
    // A proxy in the way may answer with HTML; the status still says enough.
    let body = response.json::<ProblemBody>().await.ok();
    let kind = body
        .as_ref()
        .and_then(|b| b.kind.as_deref())
        .unwrap_or("about:blank");
    AuthError::Problem {
        status: status.as_u16(),
        problem_type: kind.rsplit('/').next().unwrap_or(kind).to_owned(),
        title: body
            .as_ref()
            .and_then(|b| b.title.clone())
            .unwrap_or_else(|| status.canonical_reason().unwrap_or("Error").to_owned()),
        detail: body.as_ref().and_then(|b| b.detail.clone()),
        attempts_left: body.and_then(|b| b.attempts_left),
    }
}

async fn read<T: DeserializeOwned>(response: Response) -> Result<T> {
    response.json().await.map_err(|err| {
        AuthError::unexpected(format!("the gateway sent an unreadable answer: {err}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn pair(refresh: &str) -> serde_json::Value {
        json!({
            "access_token": format!("access-for-{refresh}"), "token_type": "Bearer", "expires_in": 900,
            "refresh_token": refresh, "refresh_expires_in": 2_592_000,
            "user_id": "01a212c1-93be-7974-9882-3a8bb121d09b", "role": "user"
        })
    }

    fn gateway(server: &MockServer) -> Gateway {
        Gateway::new(Url::parse(&server.uri()).expect("mock url"))
    }

    #[tokio::test]
    async fn verify_sends_the_code_and_reads_the_pair() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/email/verify"))
            .and(body_json(
                json!({"email": "amine@example.com", "code": "123456"}),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("r1")))
            .expect(1)
            .mount(&server)
            .await;

        let pair = gateway(&server)
            .email_verify("amine@example.com", "123456", None)
            .await
            .expect("pair");
        assert_eq!(pair.refresh_token, "r1");
        assert_eq!(pair.expires_in, 900);
        assert_eq!(pair.role, "user");
    }

    #[tokio::test]
    async fn a_bearer_rides_along_when_linking() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/email/verify"))
            .and(header("authorization", "Bearer user-token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(pair("r1")))
            .expect(1)
            .mount(&server)
            .await;

        gateway(&server)
            .email_verify("a@example.com", "123456", Some("user-token"))
            .await
            .expect("linked");
    }

    #[tokio::test]
    async fn a_problem_comes_back_typed() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/email/verify"))
            .respond_with(
                ResponseTemplate::new(401)
                    .insert_header("content-type", "application/problem+json")
                    .set_body_string(
                        r#"{"type":"https://royal-gambit.dev/problems/code-invalid","title":"Wrong code","status":401,"detail":"that code is not right","attempts_left":3,"trace_id":"x"}"#,
                    ),
            )
            .mount(&server)
            .await;

        let err = gateway(&server)
            .email_verify("a@example.com", "000000", None)
            .await
            .expect_err("401");
        assert_eq!(
            err,
            AuthError::Problem {
                status: 401,
                problem_type: "code-invalid".into(),
                title: "Wrong code".into(),
                detail: Some("that code is not right".into()),
                attempts_left: Some(3),
            }
        );
    }

    #[tokio::test]
    async fn a_body_that_is_not_a_problem_still_reads_as_one() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/refresh"))
            .respond_with(ResponseTemplate::new(502).set_body_string("<html>bad gateway</html>"))
            .mount(&server)
            .await;

        let err = gateway(&server).refresh("r1").await.expect_err("502");
        assert!(err.has_status(502), "{err:?}");
    }

    #[tokio::test]
    async fn no_gateway_means_offline() {
        // Port 1 is reserved and nothing listens there.
        let gateway = Gateway::new(Url::parse("http://127.0.0.1:1").expect("url"));
        assert_eq!(
            gateway.refresh("r1").await.expect_err("offline"),
            AuthError::Offline
        );
    }

    #[tokio::test]
    async fn unlink_and_logout_expect_no_body() {
        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path("/v1/auth/identities/lichess"))
            .and(header("authorization", "Bearer t"))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/v1/auth/logout"))
            .and(body_json(json!({"refresh_token": "r1"})))
            .respond_with(ResponseTemplate::new(204))
            .expect(1)
            .mount(&server)
            .await;

        let gateway = gateway(&server);
        gateway.unlink_lichess("t").await.expect("unlinked");
        gateway.logout("r1").await.expect("logged out");
    }
}
