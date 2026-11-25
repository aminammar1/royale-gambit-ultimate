-- When the server last took this card (the edit time it holds). The card is in step with the
-- server when synced_at is the card's own updated_at; NULL means it never reached the server.
ALTER TABLE profile ADD COLUMN synced_at INTEGER;
