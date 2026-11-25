-- How the card's owner signs in ("Lichess · amineammar", "Email · a@example.com"), so the
-- sign-in page can say which way leads back to the card. Shown only on this machine.
ALTER TABLE profile ADD COLUMN owner_label TEXT;
