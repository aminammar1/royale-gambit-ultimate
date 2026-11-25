-- The signed-in player's profile. Settings are the client's synced preferences, kept as
-- the client sent them; the server only checks their size.
CREATE TABLE profiles (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    username   text        NOT NULL CHECK (username ~ '^[A-Za-z0-9_-]{3,20}$'),
    country    char(2)     NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    settings   jsonb       NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
    updated_at timestamptz NOT NULL
);
-- "Magnus" and "magnus" are the same player name.
CREATE UNIQUE INDEX profiles_username_ci ON profiles (lower(username));
