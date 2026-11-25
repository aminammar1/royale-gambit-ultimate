//! The web layer's door to the local store (through `src/db/` in TypeScript).

use tauri::State;

use super::profile::{self, Card, Welcome};
use super::{Database, Result};

#[tauri::command]
pub fn profile_get(db: State<'_, Database>) -> Result<Welcome> {
    profile::status(&db)
}

#[tauri::command]
pub fn profile_register(
    db: State<'_, Database>,
    username: String,
    country: String,
) -> Result<Card> {
    profile::register(&db, &username, &country)
}

#[tauri::command]
pub fn profile_continue_as_guest(db: State<'_, Database>) -> Result<Welcome> {
    profile::continue_as_guest(&db)
}

#[tauri::command]
pub fn profile_claim(db: State<'_, Database>, user_id: String) -> Result<Welcome> {
    profile::claim(&db, &user_id)
}
