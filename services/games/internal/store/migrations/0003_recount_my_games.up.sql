-- "My games" counted a game twice when it left a position by two moves, and kept castling
-- rights the board could not have: clear the counts, and the backfill recounts every game.
TRUNCATE position_moves, game_positions;
UPDATE games SET indexed = false;
