-- What the Settings cards show for an identity. Lichess ids are lowercase while players
-- know themselves by their username's case, so the username is kept beside the id and
-- refreshed on every sign-in. NULL means "show the subject" (an email address is its own
-- label, and Lichess rows linked before this migration get their name on the next sign-in).
ALTER TABLE identities ADD COLUMN display_name text;
