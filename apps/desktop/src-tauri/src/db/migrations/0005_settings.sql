-- Player settings, one row per key (Board & pieces, the edition). Values are checked by
-- settings.rs before they are written; an unknown key is never stored.
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
