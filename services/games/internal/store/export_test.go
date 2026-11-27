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
