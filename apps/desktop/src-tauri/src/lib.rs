//! Rust core of the desktop app: `auth` holds the session and the keychain, `db` the local
//! SQLite store. The engine manager arrives with the analysis board.

pub mod auth;
pub mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session = auth::session::Session::new(
        auth::keychain::OsKeychain::new(),
        auth::gateway::Gateway::from_env(),
    );
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(session)
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(db::Database::open(&dir.join("royal-gambit.sqlite3"))?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::commands::auth_restore,
            auth::commands::auth_email_start,
            auth::commands::auth_email_verify,
            auth::commands::auth_lichess,
            auth::commands::auth_unlink_lichess,
            auth::commands::auth_sign_out,
            auth::commands::auth_gateway_url,
            db::commands::profile_get,
            db::commands::profile_register,
            db::commands::profile_continue_as_guest,
            db::commands::profile_claim,
        ]);
    if let Err(err) = app.run(tauri::generate_context!()) {
        eprintln!("error while running Royal Gambit Ultimate: {err}");
        std::process::exit(1);
    }
}
