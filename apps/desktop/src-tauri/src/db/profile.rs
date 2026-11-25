//! The player card: who plays on this machine. Registered on the Welcome page, held
//! locally; syncing it to auth-profile comes with the outbox.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

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
    /// The account that claimed the card; `None` for a card nobody has signed in with.
    pub owner_id: Option<String>,
    /// How the owner signs in, for the sign-in page: "Lichess · amineammar".
    pub owner_label: Option<String>,
    /// Unix milliseconds of the last edit; the server keeps the newest (last write wins).
    pub updated_at: i64,
    /// The server holds this very edit.
    pub synced: bool,
}

/// A card for a signed-in account: taken from the server (`synced`), or registered for the
/// account on this machine and still to be sent.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Adopt {
    pub username: String,
    pub country: String,
    pub owner_id: String,
    pub owner_label: String,
    pub updated_at: i64,
    pub synced: bool,
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
            "SELECT card_no, username, country, registered_at, owner_user_id, owner_label, updated_at,
                    synced_at IS NOT NULL AND synced_at >= updated_at
             FROM profile WHERE id = 1",
            [],
            |row| {
                Ok(Card {
                    card_no: row.get(0)?,
                    username: row.get(1)?,
                    country: row.get(2)?,
                    registered_at: row.get(3)?,
                    owner_id: row.get(4)?,
                    owner_label: row.get(5)?,
                    updated_at: row.get(6)?,
                    synced: row.get(7)?,
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
    check(username, country)?;
    let now = now_ms();
    let card = Card {
        card_no: card_number()?,
        username: username.to_owned(),
        country: country.to_owned(),
        registered_at: now,
        owner_id: None,
        owner_label: None,
        updated_at: now,
        synced: false,
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

/// The profile contract's rules for a card's name and country.
fn check(username: &str, country: &str) -> Result<()> {
    if !valid_username(username) {
        return Err(invalid(
            "username",
            "3 to 20 characters: letters, digits, _ and - only",
        ));
    }
    if !(country.len() == 2 && country.bytes().all(|b| b.is_ascii_uppercase())) {
        return Err(invalid("country", "pick a country from the list"));
    }
    Ok(())
}

/// Puts a signed-in account's card on this machine. The same owner keeps the card number and
/// registration date; any other card (a guest's, another account's) gives way to a new one,
/// since the server holds every account's card and gives it back on sign-in.
pub fn adopt(db: &Database, card: &Adopt) -> Result<Card> {
    let username = card.username.trim();
    check(username, &card.country)?;
    let synced_at = card.synced.then_some(card.updated_at);
    let conn = db.conn()?;
    let same_owner = conn
        .query_row(
            "SELECT 1 FROM profile WHERE id = 1 AND owner_user_id = ?1",
            params![card.owner_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if same_owner {
        conn.execute(
            "UPDATE profile SET username = ?1, country = ?2, owner_label = ?3, updated_at = ?4,
                    synced_at = ?5
             WHERE id = 1",
            params![
                username,
                card.country,
                card.owner_label,
                card.updated_at,
                synced_at
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO profile (id, card_no, username, country, registered_at, updated_at,
                                  owner_user_id, owner_label, synced_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (id) DO UPDATE SET
                card_no = excluded.card_no, username = excluded.username,
                country = excluded.country, registered_at = excluded.registered_at,
                updated_at = excluded.updated_at, owner_user_id = excluded.owner_user_id,
                owner_label = excluded.owner_label, synced_at = excluded.synced_at",
            params![
                card_number()?,
                username,
                card.country,
                now_ms(),
                card.updated_at,
                card.owner_id,
                card.owner_label,
                synced_at
            ],
        )?;
    }
    drop(conn);
    match status(db)? {
        Welcome::Registered(stored) => Ok(stored),
        _ => Err(DbError::Storage {
            message: "the card was not stored".into(),
        }),
    }
}

/// Records that the server holds the owner's card as edited at `updated_at`.
pub fn mark_synced(db: &Database, owner_id: &str, updated_at: i64) -> Result<Welcome> {
    db.conn()?.execute(
        "UPDATE profile SET synced_at = ?2 WHERE id = 1 AND owner_user_id = ?1",
        params![owner_id, updated_at],
    )?;
    status(db)
}

/// Ties an unclaimed card to the signed-in account, with how that account signs in. The first
/// owner stays: a second account signing in on this machine does not take the card over. The
/// owner signing in again refreshes the label (a newly linked Lichess, say).
pub fn claim(db: &Database, user_id: &str, label: &str) -> Result<Welcome> {
    db.conn()?.execute(
        "UPDATE profile SET owner_user_id = ?1, owner_label = ?2, updated_at = ?3
         WHERE id = 1 AND (owner_user_id IS NULL OR owner_user_id = ?1)",
        params![user_id, label, now_ms()],
    )?;
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
    fn a_new_card_belongs_to_nobody_until_claimed() {
        let db = Database::in_memory();
        let card = register(&db, "kingside_tal", "TN").expect("registered");
        assert_eq!(card.owner_id, None);

        let Welcome::Registered(claimed) =
            claim(&db, "user-1", "Lichess · amineammar").expect("claimed")
        else {
            panic!("expected the card");
        };
        assert_eq!(claimed.owner_id.as_deref(), Some("user-1"));
        assert_eq!(claimed.owner_label.as_deref(), Some("Lichess · amineammar"));
        assert_eq!(status(&db).expect("status"), Welcome::Registered(claimed));
    }

    #[test]
    fn a_claimed_card_keeps_its_first_owner() {
        let db = Database::in_memory();
        register(&db, "kingside_tal", "TN").expect("registered");
        claim(&db, "user-1", "Lichess · amineammar").expect("claimed");

        let Welcome::Registered(card) =
            claim(&db, "user-2", "Email · someone@example.com").expect("second claim")
        else {
            panic!("expected the card");
        };
        assert_eq!(card.owner_id.as_deref(), Some("user-1"));
        assert_eq!(card.owner_label.as_deref(), Some("Lichess · amineammar"));
    }

    #[test]
    fn the_owner_signing_in_again_refreshes_the_label() {
        let db = Database::in_memory();
        register(&db, "kingside_tal", "TN").expect("registered");
        claim(&db, "user-1", "Email · a@example.com").expect("claimed");

        let Welcome::Registered(card) =
            claim(&db, "user-1", "Lichess · amineammar").expect("again")
        else {
            panic!("expected the card");
        };
        assert_eq!(card.owner_label.as_deref(), Some("Lichess · amineammar"));
    }

    #[test]
    fn claiming_without_a_card_changes_nothing() {
        let db = Database::in_memory();
        assert_eq!(
            claim(&db, "user-1", "Lichess · amineammar").expect("claim"),
            Welcome::New
        );
    }

    fn adopt_for(db: &Database, owner: &str, name: &str, at: i64, synced: bool) -> Card {
        adopt(
            db,
            &Adopt {
                username: name.into(),
                country: "TN".into(),
                owner_id: owner.into(),
                owner_label: format!("Lichess · {name}"),
                updated_at: at,
                synced,
            },
        )
        .expect("adopted")
    }

    #[test]
    fn adopting_fills_an_empty_machine_with_the_accounts_card() {
        let db = Database::in_memory();
        let card = adopt_for(&db, "user-1", "amineammar", 1_000, true);

        assert_eq!(card.username, "amineammar");
        assert_eq!(card.owner_id.as_deref(), Some("user-1"));
        assert_eq!(card.updated_at, 1_000);
        assert!(card.synced);
        assert_eq!(status(&db).expect("status"), Welcome::Registered(card));
    }

    #[test]
    fn the_same_owner_keeps_the_card_number_when_the_card_changes() {
        let db = Database::in_memory();
        let first = adopt_for(&db, "user-1", "amineammar", 1_000, true);
        let second = adopt_for(&db, "user-1", "amine_ammar", 2_000, false);

        assert_eq!(second.card_no, first.card_no);
        assert_eq!(second.registered_at, first.registered_at);
        assert_eq!(second.username, "amine_ammar");
        assert!(!second.synced, "a local edit waits for the server");
    }

    #[test]
    fn another_account_gets_a_card_of_its_own() {
        let db = Database::in_memory();
        register(&db, "guest_card", "FR").expect("registered");
        claim(&db, "user-1", "Email · a@example.com").expect("claimed");

        let card = adopt_for(&db, "user-2", "other_player", 5_000, true);
        assert_eq!(card.owner_id.as_deref(), Some("user-2"));
        assert_eq!(card.username, "other_player");
    }

    #[test]
    fn adopting_checks_the_same_rules_as_registering() {
        let db = Database::in_memory();
        let result = adopt(
            &db,
            &Adopt {
                username: "no spaces".into(),
                country: "TN".into(),
                owner_id: "user-1".into(),
                owner_label: "Lichess · x".into(),
                updated_at: 1,
                synced: true,
            },
        );
        assert_eq!(invalid_field(result), "username");
    }

    #[test]
    fn a_card_is_synced_once_the_server_has_its_latest_edit() {
        let db = Database::in_memory();
        register(&db, "kingside_tal", "TN").expect("registered");
        let Welcome::Registered(claimed) = claim(&db, "user-1", "Lichess · tal").expect("claimed")
        else {
            panic!("expected the card");
        };
        assert!(!claimed.synced);

        let Welcome::Registered(card) =
            mark_synced(&db, "user-1", claimed.updated_at).expect("synced")
        else {
            panic!("expected the card");
        };
        assert!(card.synced);
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
