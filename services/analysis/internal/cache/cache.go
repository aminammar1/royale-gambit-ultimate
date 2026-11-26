// Package cache keeps finished analyses in Redis, keyed by engine version, EPD, depth and
// MultiPV. Redis only holds what can be rebuilt (ADR-06): a miss or a Redis error just means the
// engine searches again.
package cache

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"
)

var lookups = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "analysis_cache_lookups_total", Help: "Cache lookups by result: hit, miss or error.",
}, []string{"result"})

// Cache is a Redis-backed store of encoded analyses.
type Cache struct {
	rdb *redis.Client
	ttl time.Duration
}

// New connects to Redis at url (redis://host:port/db).
func New(url string, ttl time.Duration) (*Cache, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL: %w", err)
	}
	opts.DialTimeout, opts.ReadTimeout, opts.WriteTimeout = time.Second, 500*time.Millisecond, 500*time.Millisecond
	return &Cache{rdb: redis.NewClient(opts), ttl: ttl}, nil
}

// Key names one result: everything the engine's answer depends on. The engine version, so an
// upgrade never serves old numbers; the board (EPD); the 50-move counter, which Stockfish's
// evaluation scales by; and the history fingerprint (package position), since a repetition
// changes the answer. The same board reached the same way shares one entry.
func Key(engineVersion, epd string, halfmove int, history string, depth, multipv int) string {
	return fmt.Sprintf("analysis:v2:%s:%s:%d:%s:%d:%d",
		engineVersion, strings.ReplaceAll(epd, " ", "_"), halfmove, history, depth, multipv)
}

// Get returns the stored value; ok is false on a miss or a Redis error.
func (c *Cache) Get(ctx context.Context, key string) (value []byte, ok bool) {
	v, err := c.rdb.Get(ctx, key).Bytes()
	switch {
	case err == nil:
		lookups.WithLabelValues("hit").Inc()
		return v, true
	case errors.Is(err, redis.Nil):
		lookups.WithLabelValues("miss").Inc()
	default:
		lookups.WithLabelValues("error").Inc()
	}
	return nil, false
}

// Set stores value; a Redis error is returned for logging only.
func (c *Cache) Set(ctx context.Context, key string, value []byte) error {
	return c.rdb.Set(ctx, key, value, c.ttl).Err()
}

// Ping checks Redis, for readiness.
func (c *Cache) Ping(ctx context.Context) error { return c.rdb.Ping(ctx).Err() }

// Close releases the connections.
func (c *Cache) Close() error { return c.rdb.Close() }
