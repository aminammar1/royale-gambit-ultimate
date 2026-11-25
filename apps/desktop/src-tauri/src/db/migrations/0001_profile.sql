-- The player card for this machine (one row at most) and small app-wide flags.
-- Times are Unix milliseconds, UTC.
CREATE TABLE profile (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    card_no       TEXT    NOT NULL,
    username      TEXT    NOT NULL,
    country       TEXT    NOT NULL,
    registered_at INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE app_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;
