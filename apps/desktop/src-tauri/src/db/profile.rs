//! The player card: who plays on this machine. Registered on the Welcome page, held
//! locally; syncing it to auth-profile comes with the outbox.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, params};
use serde::Serialize;

use super::{Database, DbError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    /// Six digits, printed as "No. 000215".
    pub card_no: String,
    pub username: String,
    /// ISO 3166-1 alpha-2, the same codes the profile contract takes.
    pub country: String,
    /// Unix milliseconds.
    pub registered_at: i64,
}

/// Where the machine stands on first run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Welcome {
    /// Never opened: show the Welcome page.
    New,
    /// Chose "Continue as guest": no card, and no Welcome page again.
    Guest,
    Registered(Card),
}

pub fn status(db: &Database) -> Result<Welcome> {
    let conn = db.conn()?;
    let card = conn
        .query_row(
            "SELECT card_no, username, country, registered_at FROM profile WHERE id = 1",
            [],
            |row| {
                Ok(Card {
                    card_no: row.get(0)?,
                    username: row.get(1)?,
                    country: row.get(2)?,
                    registered_at: row.get(3)?,
                })
            },
        )
        .optional()?;
    if let Some(card) = card {
        return Ok(Welcome::Registered(card));
    }
    let guest = conn
        .query_row(
            "SELECT 1 FROM app_state WHERE key = 'welcome' AND value = 'guest'",
            [],
            |_| Ok(()),
        )
        .optional()?;
    Ok(if guest.is_some() {
        Welcome::Guest
    } else {
        Welcome::New
    })
}

pub fn register(db: &Database, username: &str, country: &str) -> Result<Card> {
    let username = username.trim();
    if !valid_username(username) {
        return Err(invalid(
            "username",
            "3 to 20 characters: letters, digits, _ and - only",
        ));
    }
    if !(country.len() == 2 && country.bytes().all(|b| b.is_ascii_uppercase())) {
        return Err(invalid("country", "pick a country from the list"));
    }
    let card = Card {
        card_no: card_number()?,
        username: username.to_owned(),
        country: country.to_owned(),
        registered_at: now_ms(),
    };
    let conn = db.conn()?;
    // The id = 1 check makes a second card a constraint error rather than a race.
    let inserted = conn.execute(
        "INSERT INTO profile (id, card_no, username, country, registered_at, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?4) ON CONFLICT (id) DO NOTHING",
        params![
            card.card_no,
            card.username,
            card.country,
            card.registered_at
        ],
    )?;
    if inserted == 0 {
        return Err(DbError::AlreadyRegistered);
    }
    Ok(card)
}

pub fn continue_as_guest(db: &Database) -> Result<Welcome> {
    db.conn()?.execute(
        "INSERT INTO app_state (key, value) VALUES ('welcome', 'guest')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [],
    )?;
    // A card already registered stays the answer: guest only means "no card yet".
    status(db)
}

/// The profile contract's rule: `^[A-Za-z0-9_-]{3,20}$`.
fn valid_username(name: &str) -> bool {
    (3..=20).contains(&name.len())
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn invalid(field: &str, message: &str) -> DbError {
    DbError::Invalid {
        field: field.into(),
        message: message.into(),
    }
}

/// Six random digits. Only printed on the card, never used to look anything up.
fn card_number() -> Result<String> {
    let mut bytes = [0u8; 4];
    getrandom::fill(&mut bytes).map_err(|err| DbError::Storage {
        message: format!("no randomness: {err}"),
    })?;
    Ok(format!("{:06}", u32::from_le_bytes(bytes) % 1_000_000))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn invalid_field(result: Result<Card>) -> String {
        match result {
            Err(DbError::Invalid { field, .. }) => field,
            other => panic!("expected an invalid field, got {other:?}"),
        }
    }

    #[test]
    fn a_fresh_machine_is_a_first_run() {
        assert_eq!(
            status(&Database::in_memory()).expect("status"),
            Welcome::New
        );
    }

    #[test]
    fn registering_fills_the_card() {
        let db = Database::in_memory();
        let card = register(&db, "kingside_tal", "TN").expect("registered");

        assert_eq!(card.username, "kingside_tal");
        assert_eq!(card.country, "TN");
        assert_eq!(card.card_no.len(), 6);
        assert!(
            card.card_no.chars().all(|c| c.is_ascii_digit()),
            "{}",
            card.card_no
        );
        assert!(card.registered_at > 1_700_000_000_000);
        assert_eq!(status(&db).expect("status"), Welcome::Registered(card));
    }

    #[test]
    fn the_card_outlives_the_app() {
        let path = std::env::temp_dir().join(format!("rg-test-{}.sqlite3", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let card =
            register(&Database::open(&path).expect("open"), "Tal-1", "LV").expect("registered");

        let reopened = Database::open(&path).expect("reopen");
        assert_eq!(
            status(&reopened).expect("status"),
            Welcome::Registered(card)
        );
        drop(reopened);
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
    }

    #[test]
    fn usernames_follow_the_profile_contract() {
        let db = Database::in_memory();
        for bad in [
            "ab",
            "a_name_that_is_far_too_long",
            "two words",
            "émile",
            "",
        ] {
            assert_eq!(invalid_field(register(&db, bad, "TN")), "username", "{bad}");
        }
        assert!(
            register(&db, "  Kingside_Tal-2 ", "TN").is_ok(),
            "trimmed and accepted"
        );
    }

    #[test]
    fn the_country_is_a_two_letter_code() {
        let db = Database::in_memory();
        for bad in ["tn", "TUN", "T", ""] {
            assert_eq!(
                invalid_field(register(&db, "kingside_tal", bad)),
                "country",
                "{bad}"
            );
        }
    }

    #[test]
    fn one_card_per_machine() {
        let db = Database::in_memory();
        register(&db, "first", "TN").expect("registered");
        assert_eq!(
            register(&db, "second", "FR").expect_err("second"),
            DbError::AlreadyRegistered
        );
    }

    #[test]
    fn a_guest_is_remembered_and_can_still_register() {
        let db = Database::in_memory();
        assert_eq!(continue_as_guest(&db).expect("guest"), Welcome::Guest);
        assert_eq!(status(&db).expect("status"), Welcome::Guest);

        let card = register(&db, "late_starter", "DE").expect("registered later");
        assert_eq!(status(&db).expect("status"), Welcome::Registered(card));
    }

    #[test]
    fn going_guest_after_registering_keeps_the_card() {
        let db = Database::in_memory();
        let card = register(&db, "kept", "TN").expect("registered");
        assert_eq!(
            continue_as_guest(&db).expect("status"),
            Welcome::Registered(card)
        );
    }
}
