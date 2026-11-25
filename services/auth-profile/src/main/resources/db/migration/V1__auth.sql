-- Accounts, sign-in codes, sessions, and the outbox for the events auth-profile publishes.
-- Times are timestamptz; expiry is always compared with the database clock (now()), so
-- app servers with drifting clocks cannot disagree about whether a code is still good.

CREATE TABLE users (
    id         uuid PRIMARY KEY,
    role       text        NOT NULL CHECK (role IN ('guest', 'user')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- How a user proves who they are. One row per (provider, subject); Lichess and Chess.com
-- join 'email' in M11.
CREATE TABLE identities (
    provider   text        NOT NULL CHECK (provider IN ('email')),
    subject    text        NOT NULL,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities (user_id);

-- Only a hash of each code is kept. consumed_at marks a code that can no longer be used:
-- signed in with, replaced by a newer code, or never delivered.
CREATE TABLE email_codes (
    id            uuid PRIMARY KEY,
    email         text        NOT NULL,
    code_hash     bytea       NOT NULL,
    attempts_left integer     NOT NULL CHECK (attempts_left >= 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    consumed_at   timestamptz
);
CREATE INDEX email_codes_latest ON email_codes (email, created_at DESC);

-- One row per refresh token ever handed out; only the SHA-256 of the token is stored.
-- A family is one sign-in and every rotation after it. A token used twice means it was
-- copied, so the whole family is revoked.
CREATE TABLE refresh_tokens (
    token_hash bytea PRIMARY KEY,
    family_id  uuid        NOT NULL,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    revoked_at timestamptz
);
CREATE INDEX refresh_tokens_family ON refresh_tokens (family_id);

-- Events written in the same transaction as the change they describe; a relay publishes
-- them to RabbitMQ afterwards (at least once).
CREATE TABLE outbox (
    id           uuid PRIMARY KEY,
    type         text        NOT NULL,
    trace_id     text        NOT NULL,
    data         jsonb       NOT NULL,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_pending ON outbox (occurred_at) WHERE published_at IS NULL;
