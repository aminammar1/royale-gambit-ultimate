//! Player settings: the board theme, the display switches and the edition. Only known keys
//! with allowed values are written, so the web layer cannot fill the table with anything else.

use std::collections::BTreeMap;

use rusqlite::params;

use super::{Database, DbError, Result};

const ON_OFF: &[&str] = &["on", "off"];

/// Every key the app stores, with the values it accepts.
const ALLOWED: &[(&str, &[&str])] = &[
    (
        "board_theme",
        &["newspaper", "newsprint", "tournament", "green", "ocean", "wood", "walnut", "champion", "freestyle", "arcade", "sakura", "contrast"],
    ),
    ("board_pieces", &["classic", "chessnut", "fantasy", "spatial", "celtic", "rhosgfx"]),
    ("board_coordinates", ON_OFF),
    ("board_last_move", ON_OFF),
    ("board_legal_moves", ON_OFF),
    ("board_arrows", ON_OFF),
    ("edition", &["system", "day", "night"]),
];

/// All stored settings; keys never set are absent (the app uses its defaults).
pub fn all(db: &Database) -> Result<BTreeMap<String, String>> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = BTreeMap::new();
    for row in rows {
        let (key, value) = row?;
        out.insert(key, value);
    }
    Ok(out)
}

/// Stores one setting, or refuses an unknown key or value.
pub fn set(db: &Database, key: &str, value: &str) -> Result<()> {
    let Some((_, values)) = ALLOWED.iter().find(|(k, _)| *k == key) else {
        return Err(DbError::Invalid {
            field: key.into(),
            message: "not a setting".into(),
        });
    };
    if !values.contains(&value) {
        return Err(DbError::Invalid {
            field: key.into(),
            message: format!("must be one of {}", values.join(", ")),
        });
    }
    db.conn()?.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_machine_has_no_settings() {
        assert!(all(&Database::in_memory()).unwrap().is_empty());
    }

    #[test]
    fn a_setting_is_stored_and_replaced() {
        let db = Database::in_memory();
        set(&db, "board_theme", "wood").unwrap();
        set(&db, "board_theme", "newspaper").unwrap();
        set(&db, "board_arrows", "off").unwrap();
        let s = all(&db).unwrap();
        assert_eq!(s.get("board_theme").map(String::as_str), Some("newspaper"));
        assert_eq!(s.get("board_arrows").map(String::as_str), Some("off"));
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn unknown_keys_and_values_are_refused() {
        let db = Database::in_memory();
        assert!(matches!(set(&db, "favourite_colour", "red"), Err(DbError::Invalid { .. })));
        assert!(matches!(set(&db, "board_theme", "neon"), Err(DbError::Invalid { .. })));
        assert!(matches!(set(&db, "edition", ""), Err(DbError::Invalid { .. })));
        assert!(all(&db).unwrap().is_empty());
    }
}
