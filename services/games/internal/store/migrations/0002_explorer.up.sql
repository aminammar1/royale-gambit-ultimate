-- The player's own explorer ("My games", M12) and the week's popular top games.

-- A game's first 30 moves are counted once; games saved before this were not, so a backfill
-- indexes those (indexed = false).
ALTER TABLE games ADD COLUMN indexed boolean NOT NULL DEFAULT false;
CREATE INDEX games_unindexed ON games (created_at) WHERE NOT indexed;

-- What each owner played from each position (an opening-table key), scored by game result.
CREATE TABLE position_moves (
    owner_id uuid    NOT NULL,
    position text    NOT NULL,
    uci      text    NOT NULL,
    san      text    NOT NULL,
    white    integer NOT NULL DEFAULT 0,
    draws    integer NOT NULL DEFAULT 0,
    black    integer NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, position, uci)
);

-- Which of an owner's games went through a position, and the move played there (first time).
CREATE TABLE game_positions (
    owner_id uuid    NOT NULL,
    position text    NOT NULL,
    game_id  uuid    NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    ply      integer NOT NULL,
    uci      text    NOT NULL,
    PRIMARY KEY (owner_id, position, game_id)
);

-- Top games opened from the explorer: one row a player, a game and a day.
CREATE TABLE game_views (
    day     date NOT NULL,
    db      text NOT NULL CHECK (db IN ('masters', 'lichess')),
    game_id text NOT NULL,
    viewer  uuid NOT NULL,
    white   text NOT NULL,
    black   text NOT NULL,
    result  text NOT NULL,
    year    integer,
    event   text,
    PRIMARY KEY (day, db, game_id, viewer)
);
CREATE INDEX game_views_day ON game_views (day);
