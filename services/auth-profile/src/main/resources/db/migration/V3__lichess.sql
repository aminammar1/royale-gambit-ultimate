-- Lichess sign-in (the server half of M11). A Lichess identity also keeps the player's
-- Lichess token: the opening explorer will need it later (ADR-16), and it never leaves the
-- service.
ALTER TABLE identities DROP CONSTRAINT identities_provider_check;
ALTER TABLE identities ADD CONSTRAINT identities_provider_check CHECK (provider IN ('email', 'lichess'));
ALTER TABLE identities ADD COLUMN access_token text;
ALTER TABLE identities ADD COLUMN access_token_expires_at timestamptz;

-- One row per OAuth flow in progress: the PKCE verifier waits here while the player is on
-- lichess.org. Only the state's hash is stored; the state itself is the lookup secret.
CREATE TABLE oauth_states (
    state_hash    bytea PRIMARY KEY,
    provider      text        NOT NULL CHECK (provider IN ('lichess')),
    code_verifier text        NOT NULL,
    redirect_uri  text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    consumed_at   timestamptz
);
