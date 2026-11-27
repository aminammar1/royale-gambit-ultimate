// Package outbox publishes the events the store wrote with each change (the outbox pattern,
// SERVICES.md): oldest first, each marked once the broker confirmed it. A crash between the two
// publishes an event twice; consumers are idempotent by event id.
package outbox

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
)

// Publisher sends one event under its routing key.
type Publisher interface {
	Publish(ctx context.Context, routingKey, messageID string, body []byte) error
}

// Relay moves events from the outbox table to the broker.
type Relay struct {
	Store *store.Store
	Pub   Publisher
	Log   *slog.Logger
	// Every is the pause when there is nothing to send.
	Every time.Duration
}

// Run relays until ctx ends.
func (r *Relay) Run(ctx context.Context) {
	for ctx.Err() == nil {
		n, err := r.Once(ctx)
		if err != nil && ctx.Err() == nil {
			r.Log.WarnContext(ctx, "outbox relay", "error", err)
		}
		if n == 0 || err != nil {
			select {
			case <-ctx.Done():
			case <-time.After(r.Every):
			}
		}
	}
}

// Once publishes one batch and answers how many went out.
func (r *Relay) Once(ctx context.Context) (int, error) {
	events, err := r.Store.Unpublished(ctx, 100)
	if err != nil {
		return 0, err
	}
	sent := make([]uuid.UUID, 0, len(events))
	var pubErr error
	for _, e := range events {
		if pubErr = r.Pub.Publish(ctx, e.Type, e.ID.String(), e.Envelope); pubErr != nil {
			break // keep the order: the rest waits for the next round
		}
		sent = append(sent, e.ID)
	}
	if len(sent) > 0 {
		if err := r.Store.MarkPublished(ctx, sent); err != nil {
			return 0, err
		}
	}
	return len(sent), pubErr
}
