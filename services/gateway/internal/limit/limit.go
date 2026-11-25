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

// Limiter is a fixed-window counter. Fixed windows allow a burst of up to twice the limit
// across a window edge; that is fine for abuse protection and costs one round trip.
type Limiter struct {
	rdb *redis.Client
}

// New wraps a Redis client. Counters are rebuildable data, as ADR-06 wants for Redis.
func New(rdb *redis.Client) *Limiter {
	return &Limiter{rdb: rdb}
}

// Allow counts one request for key. When the budget is spent it says how long until the
// window resets. An error means Redis could not be asked; the caller decides what that means.
func (l *Limiter) Allow(ctx context.Context, key string, limit int) (bool, time.Duration, error) {
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
