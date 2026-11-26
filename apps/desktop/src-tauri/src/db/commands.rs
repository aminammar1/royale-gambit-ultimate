//! The web layer's door to the local store (through `src/db/` in TypeScript).

use std::collections::BTreeMap;

use tauri::State;

use super::profile::{self, Adopt, Card, Welcome};
use super::settings;
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
pub fn profile_claim(db: State<'_, Database>, user_id: String, label: String) -> Result<Welcome> {
    profile::claim(&db, &user_id, &label)
}

#[tauri::command]
pub fn profile_adopt(db: State<'_, Database>, card: Adopt) -> Result<Card> {
    profile::adopt(&db, &card)
}

#[tauri::command]
pub fn profile_mark_synced(
    db: State<'_, Database>,
    owner_id: String,
    updated_at: i64,
) -> Result<Welcome> {
    profile::mark_synced(&db, &owner_id, updated_at)
}

#[tauri::command]
pub fn settings_get(db: State<'_, Database>) -> Result<BTreeMap<String, String>> {
    settings::all(&db)
}

#[tauri::command]
pub fn settings_set(db: State<'_, Database>, key: String, value: String) -> Result<()> {
    settings::set(&db, &key, &value)
}
