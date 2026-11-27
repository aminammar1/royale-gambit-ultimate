package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Backdate makes an import look as if it last moved `ago`, for the tests of stale imports.
func (s *Store) Backdate(ctx context.Context, id uuid.UUID, ago time.Duration) error {
	_, err := s.pool.Exec(ctx, `UPDATE import_jobs SET updated_at = now() - $2::interval WHERE id = $1`,
		id, ago.String())
	return err
}

// Seed adds n synthetic games for owner straight in SQL, for the search speed test: players
// cycle through 50 names, results and openings through a few each.
func (s *Store) Seed(ctx context.Context, owner uuid.UUID, n int) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO games (id, owner_id, game_hash, source, white, black, white_elo, black_elo, result,
			played_at, event, eco, opening, ply_count, first_moves, pgn)
		SELECT gen_random_uuid(), $1, 'seed:' || i, 'lichess', 'player' || (i % 50), 'rival' || (i % 37),
			1500 + i % 400, 1500 + i % 300, (ARRAY['1-0', '0-1', '1/2-1/2'])[1 + i % 3],
			now() - (i || ' minutes')::interval, 'Rated blitz game',
			(ARRAY['C65', 'B90', 'D37', 'B12', 'C18', 'A28'])[1 + i % 6],
			(ARRAY['Ruy Lopez: Berlin Defense', 'Sicilian Defense: Najdorf Variation', 'Queen''s Gambit Declined',
				'Caro-Kann Defense: Advance Variation', 'French Defense: Winawer Variation', 'English Opening: Four Knights'])[1 + i % 6],
			40 + i % 60, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6', '[White "x"]'
		FROM generate_series(1, $2) AS i`, owner, n)
	return err
}
