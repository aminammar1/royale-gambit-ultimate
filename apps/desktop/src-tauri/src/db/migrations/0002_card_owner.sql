-- The account the card belongs to, set the first time someone is signed in while the card
-- exists. Signed out, the app hides an owned card instead of showing it to whoever sits down.
ALTER TABLE profile ADD COLUMN owner_user_id TEXT;
