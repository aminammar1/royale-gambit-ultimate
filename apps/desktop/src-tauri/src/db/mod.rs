//! The app's local store: SQLite in the app data folder, owned by the Rust core. Local
//! actions write here first (ARCHITECTURE § Local data); the web layer reaches it only
//! through the commands in `commands`, via `src/db/` on the TypeScript side.

pub mod commands;
pub mod profile;

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use rusqlite_migration::{M, Migrations};
use serde::Serialize;

/// Append only: a shipped migration is never edited, the next change is a new entry.
const MIGRATIONS: &[M<'static>] = &[M::up(include_str!("migrations/0001_profile.sql"))];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DbError {
    /// The player's input breaks a rule; `field` says which box to mark.
    #[error("{field}: {message}")]
    Invalid { field: String, message: String },
    #[error("this machine already holds a player card")]
    AlreadyRegistered,
    #[error("local storage failed: {message}")]
    Storage { message: String },
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        Self::Storage {
            message: err.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, DbError>;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Opens (or creates) the database file and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Self> {
        Self::migrated(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> Self {
        Self::migrated(Connection::open_in_memory().expect("in-memory sqlite")).expect("migrations")
    }

    fn migrated(mut conn: Connection) -> Result<Self> {
        // WAL keeps a read from waiting on a write once games land here too.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Migrations::from_slice(MIGRATIONS)
            .to_latest(&mut conn)
            .map_err(|err| DbError::Storage {
                message: format!("could not migrate the local database: {err}"),
            })?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub(crate) fn conn(&self) -> Result<MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| DbError::Storage {
            message: "the local database lock was poisoned".into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(Migrations::from_slice(MIGRATIONS).validate().is_ok());
    }
}
