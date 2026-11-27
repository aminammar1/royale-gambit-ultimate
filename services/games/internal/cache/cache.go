// Package cache keeps explorer answers in Redis (ADR-06: only what can be fetched again). A miss,
// a Redis error or no Redis at all just means asking lichess again.
package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"
)

var lookups = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "games_explorer_cache_lookups_total", Help: "Explorer cache lookups by result: hit, miss or error.",
}, []string{"result"})

// Redis is the cache; nil Redis (no REDIS_URL) caches nothing.
type Redis struct{ rdb *redis.Client }

// New connects to url (redis://host:port/db); an empty url caches nothing.
func New(url string) (*Redis, error) {
	if url == "" {
		return &Redis{}, nil
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("REDIS_URL: %w", err)
	}
	opts.DialTimeout, opts.ReadTimeout, opts.WriteTimeout = time.Second, 300*time.Millisecond, 300*time.Millisecond
	return &Redis{rdb: redis.NewClient(opts)}, nil
}

// Get reads key.
func (r *Redis) Get(ctx context.Context, key string) ([]byte, bool) {
	if r.rdb == nil {
		return nil, false
	}
	v, err := r.rdb.Get(ctx, key).Bytes()
	switch {
	case err == redis.Nil:
		lookups.WithLabelValues("miss").Inc()
		return nil, false
	case err != nil:
		lookups.WithLabelValues("error").Inc()
		return nil, false
	}
	lookups.WithLabelValues("hit").Inc()
	return v, true
}

// Set writes key for ttl; a failure is only a later miss.
func (r *Redis) Set(ctx context.Context, key string, value []byte, ttl time.Duration) {
	if r.rdb != nil {
		_ = r.rdb.Set(ctx, key, value, ttl).Err()
	}
}

// Close ends the connection.
func (r *Redis) Close() {
	if r.rdb != nil {
		_ = r.rdb.Close()
	}
}
