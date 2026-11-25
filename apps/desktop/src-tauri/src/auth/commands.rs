//! The web layer's only door into sign-in. Each command answers with what the Settings
//! page may know: the session view (access token, never the refresh token) or a typed
//! error it can put into words.

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::error::{AuthError, Result};
use super::keychain::OsKeychain;
use super::session::{LICHESS_TIMEOUT, Session, SessionView};

pub type AppSession = Session<OsKeychain>;

#[tauri::command]
pub async fn auth_restore(session: State<'_, AppSession>) -> Result<SessionView> {
    session.restore().await
}

#[tauri::command]
pub async fn auth_email_start(session: State<'_, AppSession>, email: String) -> Result<()> {
    session.email_start(&email).await
}

#[tauri::command]
pub async fn auth_email_verify(
    session: State<'_, AppSession>,
    email: String,
    code: String,
) -> Result<SessionView> {
    session.email_verify(&email, &code).await
}

/// Opens lichess.org in the system browser from here, so the web layer needs no
/// opener permission of its own.
#[tauri::command]
pub async fn auth_lichess(app: AppHandle, session: State<'_, AppSession>) -> Result<SessionView> {
    let open = |url: &str| {
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|err| AuthError::unexpected(format!("could not open the browser: {err}")))
    };
    session.lichess(open, LICHESS_TIMEOUT).await
}

#[tauri::command]
pub async fn auth_unlink_lichess(session: State<'_, AppSession>) -> Result<()> {
    session.unlink_lichess().await
}

#[tauri::command]
pub async fn auth_sign_out(session: State<'_, AppSession>) -> Result<SessionView> {
    session.sign_out().await
}

/// Where the web layer sends its own calls (profile, identities) with the access token.
#[tauri::command]
pub fn auth_gateway_url(session: State<'_, AppSession>) -> String {
    session.gateway_url()
}
