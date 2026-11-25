//! Rust core of the desktop app. The engine manager (M3) and SQLite (M1) are added in
//! their milestones; `auth` holds the session and the keychain.

pub mod auth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session = auth::session::Session::new(
        auth::keychain::OsKeychain::new(),
        auth::gateway::Gateway::from_env(),
    );
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(session)
        .invoke_handler(tauri::generate_handler![
            auth::commands::auth_restore,
            auth::commands::auth_email_start,
            auth::commands::auth_email_verify,
            auth::commands::auth_lichess,
            auth::commands::auth_unlink_lichess,
            auth::commands::auth_sign_out,
            auth::commands::auth_gateway_url,
        ]);
    if let Err(err) = app.run(tauri::generate_context!()) {
        eprintln!("error while running Royal Gambit Ultimate: {err}");
        std::process::exit(1);
    }
}
