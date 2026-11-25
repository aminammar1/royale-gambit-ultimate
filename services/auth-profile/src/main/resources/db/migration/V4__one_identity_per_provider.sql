-- Review fixes for Lichess linking.
-- One identity per provider per account: with two Lichess users on one account, "unlink
-- Lichess" could remove every way in at once.
CREATE UNIQUE INDEX identities_one_per_provider ON identities (user_id, provider);

-- A link flow belongs to the user who started it; only that user's token can finish it.
-- NULL means a plain sign-in flow.
ALTER TABLE oauth_states ADD COLUMN link_user_id uuid REFERENCES users (id) ON DELETE CASCADE;
