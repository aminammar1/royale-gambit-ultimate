//! Rust core of the desktop app. The engine manager (M3), SQLite (M1) and the keychain (M7)
//! are added in their milestones; for now the core only hosts the window.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("error while running Royal Gambit Ultimate: {err}");
        std::process::exit(1);
    }
}
