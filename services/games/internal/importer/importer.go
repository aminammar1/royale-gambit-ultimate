// Package importer runs import jobs: it consumes import.requested, reads the username's games
// from the site, saves the new ones in batches and keeps the job's counts up to date, then ends
// the job as done or failed (which writes game.imported).
package importer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/sites"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
)

// Queue and Event name what the worker consumes.
const (
	Queue = "games.import-requested"
	Event = "import.requested"
)

var siteNames = map[string]string{"lichess": "Lichess", "chesscom": "Chess.com"}

// Worker imports games for jobs.
type Worker struct {
	Store *store.Store
	Sites map[string]sites.Fetcher
	Log   *slog.Logger
	// Batch is how many games are saved per transaction (and per progress update).
	Batch int
}

// Handle is the broker handler: it reads the envelope and runs the job. An error asks for a
// retry; a job that cannot succeed (no such player) ends as failed and is not an error.
func (w *Worker) Handle(ctx context.Context, d amqp.Delivery) error {
	var env struct {
		ID   uuid.UUID `json:"id"`
		Type string    `json:"type"`
		Data struct {
			JobID uuid.UUID `json:"job_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(d.Body, &env); err != nil || env.Type != Event || env.Data.JobID == uuid.Nil {
		w.Log.WarnContext(ctx, "dropped a message that is not an import.requested", "message_id", d.MessageId)
		return nil
	}
	_, retried := d.Headers["x-retries"]
	return w.Run(ctx, env.ID, env.Data.JobID, d.Redelivered || retried)
}

// Run imports job. eventID makes a repeated event a no-op; retry says this delivery follows a
// failed one, so an import left running (its worker died) is taken up again.
func (w *Worker) Run(ctx context.Context, eventID, jobID uuid.UUID, retry bool) error {
	job, err := w.Store.Import(ctx, jobID)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	switch job.Status {
	case "done", "failed":
		_, err := w.Store.MarkProcessed(ctx, eventID)
		return err
	case "queued":
		started, err := w.Store.StartImport(ctx, jobID)
		if err != nil {
			return err
		}
		if !started && !retry {
			return nil // another worker took it a moment ago
		}
	case "running":
		if !retry {
			return nil // another copy of the event is being worked on
		}
	}

	fetcher, ok := w.Sites[job.Site]
	if !ok {
		return w.Store.FinishImport(ctx, jobID, "failed", "This site is not supported.")
	}
	log := w.Log.With("job_id", jobID, "site", job.Site)
	batch := max(w.Batch, 1)
	var pending []*pgn.Game
	fetched, saved, duplicates := 0, 0, 0
	flush := func() error {
		if len(pending) > 0 {
			res, err := w.Store.SaveGames(ctx, job.Owner, job.Site, &jobID, pending)
			if err != nil {
				return err
			}
			saved += len(res.Saved)
			duplicates += res.Duplicates
			pending = pending[:0]
		}
		return w.Store.ImportProgress(ctx, jobID, fetched, saved, duplicates)
	}
	// A failure to save (the database) is retried; a failure of the site ends the job.
	var saveErr error
	fetchErr := fetcher.Fetch(ctx, job.Username, job.MaxGames, func(text string) error {
		fetched++
		g, err := pgn.One(text)
		if err != nil {
			log.WarnContext(ctx, "skipped a game the site sent", "error", err)
		} else {
			pending = append(pending, g)
		}
		if len(pending) >= batch {
			saveErr = flush()
			return saveErr
		}
		return nil
	})
	if saveErr != nil {
		return saveErr
	}
	if err := flush(); err != nil {
		return err
	}
	if fetchErr != nil {
		reason, final := explain(fetchErr, job)
		if !final {
			return fetchErr // the database or the network: try again
		}
		log.InfoContext(ctx, "import failed", "reason", reason)
		if err := w.Store.FinishImport(ctx, jobID, "failed", reason); err != nil {
			return err
		}
	} else {
		log.InfoContext(ctx, "import done", "fetched", fetched, "saved", saved, "duplicates", duplicates)
		if err := w.Store.FinishImport(ctx, jobID, "done", ""); err != nil {
			return err
		}
	}
	_, err = w.Store.MarkProcessed(ctx, eventID)
	return err
}

// explain turns a site's error into words for the player; final is false only when this service
// is stopping, so the import is retried rather than failed.
func explain(err error, job store.Job) (reason string, final bool) {
	name := siteNames[job.Site]
	switch {
	case errors.Is(err, sites.ErrNoSuchPlayer):
		return fmt.Sprintf("No player named %s on %s.", job.Username, name), true
	case errors.Is(err, sites.ErrRateLimited):
		return fmt.Sprintf("%s is asking us to slow down. Try again in a few minutes.", name), true
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return "", false // shutting down: the import is taken up again
	}
	return fmt.Sprintf("%s could not be read just now. Try again later.", name), true
}
