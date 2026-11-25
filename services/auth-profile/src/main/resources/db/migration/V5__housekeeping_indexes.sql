-- Indexes for housekeeping. Deleting a guest cascades to refresh_tokens and oauth_states
-- through their user columns, and without these every deleted guest scanned both tables.
CREATE INDEX refresh_tokens_user ON refresh_tokens (user_id, expires_at);
CREATE INDEX oauth_states_link_user ON oauth_states (link_user_id) WHERE link_user_id IS NOT NULL;
-- The hourly sweeps look rows up by age.
CREATE INDEX email_codes_created ON email_codes (created_at);
CREATE INDEX refresh_tokens_expires ON refresh_tokens (expires_at);
CREATE INDEX oauth_states_expires ON oauth_states (expires_at);
CREATE INDEX outbox_published ON outbox (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX users_guests ON users (created_at) WHERE role = 'guest';
