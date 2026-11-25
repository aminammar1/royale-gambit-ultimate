// Package limit counts requests per caller in Redis, in fixed one-minute windows.
package limit

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limits are requests per minute.
type Limits struct {
	IP     int // per client address, every route
	SignIn int // per client address, routes that hand out tokens
	Guest  int // per guest account
	User   int // per signed-in account
}

// Budget is how long a rate-limit check may take before the request goes on without it.
const Budget = 100 * time.Millisecond

// Limiter is a fixed-window counter. Fixed windows allow a burst of up to twice the limit
// across a window edge; that is fine for abuse protection and costs one round trip.
type Limiter struct {
	rdb *redis.Client
}

// New builds the Redis client itself, with timeouts sized for a check that sits in front
// of every request: a Redis that is slow or silent must cost milliseconds, not the
// library's default seconds and retries.
func New(opts *redis.Options) *Limiter {
	tuned := *opts
	tuned.DialTimeout = Budget
	tuned.ReadTimeout = Budget
	tuned.WriteTimeout = Budget
	tuned.PoolTimeout = Budget
	tuned.MaxRetries = -1 // no retries: the next request is the retry
	tuned.ContextTimeoutEnabled = true
	return &Limiter{rdb: redis.NewClient(&tuned)}
}

// Close releases the connection pool.
func (l *Limiter) Close() error { return l.rdb.Close() }

// Allow counts one request for key. When the budget is spent it says how long until the
// window resets. An error means Redis could not be asked; the caller decides what that means.
func (l *Limiter) Allow(ctx context.Context, key string, limit int) (bool, time.Duration, error) {
	ctx, cancel := context.WithTimeout(ctx, Budget)
	defer cancel()
	now := time.Now()
	window := now.Unix() / 60
	counter := "rl:" + key + ":" + strconv.FormatInt(window, 10)
	pipe := l.rdb.TxPipeline()
	count := pipe.Incr(ctx, counter)
	pipe.Expire(ctx, counter, 2*time.Minute)
	if _, err := pipe.Exec(ctx); err != nil {
		return true, 0, err
	}
	if count.Val() <= int64(limit) {
		return true, 0, nil
	}
	return false, time.Unix((window+1)*60, 0).Sub(now), nil
}
