DROP TABLE game_views;
DROP TABLE game_positions;
DROP TABLE position_moves;
DROP INDEX games_unindexed;
ALTER TABLE games DROP COLUMN indexed;
