package app_test

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

var (
	redisOnce sync.Once
	redisAddr string
)

// freshRedis gives each test an empty logical database on one shared Redis container.
func freshRedis(t *testing.T) *redis.Client {
	t.Helper()
	redisOnce.Do(func() {
		c, err := tcredis.Run(context.Background(), "redis:8.8.4-trixie")
		if err != nil {
			t.Fatal(err)
		}
		u, _ := c.ConnectionString(context.Background())
		opts, _ := redis.ParseURL(u)
		redisAddr = opts.Addr
	})
	client := redis.NewClient(&redis.Options{Addr: redisAddr})
	if err := client.FlushAll(context.Background()).Err(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}

func limitedGateway(t *testing.T, client *redis.Client, limits limit.Limits, up *upstream, verifier app.TokenVerifier) string {
	t.Helper()
	u, _ := url.Parse(up.URL)
	return startGateway(t, app.Options{
		Verifier: verifier,
		Limiter:  limit.New(client),
		Limits:   limits,
		Routes: routes.Table{
			{Prefix: "/v1/auth", Upstream: u},
			{Prefix: "/v1/auth/email", Upstream: u, SignIn: true},
			{Prefix: "/v1/profile", Upstream: u, Auth: routes.Required},
		},
	}).URL
}

func TestSignInCallsHaveATighterPerIPBudget(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := limitedGateway(t, freshRedis(t), limit.Limits{IP: 100, SignIn: 3, Guest: 100, User: 100}, up, nil)

	for i := 0; i < 3; i++ {
		if resp := get(t, gw+"/v1/auth/email/start", ""); resp.StatusCode != http.StatusAccepted {
			t.Fatalf("call %d: status %d", i+1, resp.StatusCode)
		}
	}
	resp := get(t, gw+"/v1/auth/email/start", "")
	assertProblem(t, resp, http.StatusTooManyRequests)
	if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err != nil || s < 1 || s > 60 {
		t.Fatalf("Retry-After %q, want 1..60 seconds", resp.Header.Get("Retry-After"))
	}
	// Refreshing a session is not a sign-in: it still goes through.
	if resp := get(t, gw+"/v1/auth/refresh", ""); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("refresh: status %d", resp.StatusCode)
	}
	if up.hits.Load() != 4 {
		t.Fatalf("service saw %d calls, want 4", up.hits.Load())
	}
}

func TestGuestsGetASmallerBudgetThanUsers(t *testing.T) {
	key := newKey(t, "k1")
	verifier, err := auth.NewVerifier(context.Background(), newJWKS(t, key).URL, issuer)
	if err != nil {
		t.Fatal(err)
	}
	up := newUpstream(t, okJSON)
	gw := limitedGateway(t, freshRedis(t), limit.Limits{IP: 100, SignIn: 100, Guest: 1, User: 3}, up, verifier)

	guest := "Bearer " + token(t, key, claims("guest", time.Minute))
	get(t, gw+"/v1/auth/refresh", guest)
	assertProblem(t, get(t, gw+"/v1/auth/refresh", guest), http.StatusTooManyRequests)

	user := "Bearer " + token(t, key, claimsFor("01a21268-0000-7000-8000-000000000002", "user"))
	for i := 0; i < 3; i++ {
		if resp := get(t, gw+"/v1/profile", user); resp.StatusCode != http.StatusAccepted {
			t.Fatalf("user call %d: status %d", i+1, resp.StatusCode)
		}
	}
	assertProblem(t, get(t, gw+"/v1/profile", user), http.StatusTooManyRequests)
}

func TestRedisBeingDownDoesNotLockEveryoneOut(t *testing.T) {
	up := newUpstream(t, okJSON)
	dead := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", DialTimeout: 100 * time.Millisecond, MaxRetries: -1})
	gw := limitedGateway(t, dead, limit.Limits{IP: 1, SignIn: 1, Guest: 1, User: 1}, up, nil)

	for i := 0; i < 3; i++ {
		if resp := get(t, gw+"/v1/auth/email/start", ""); resp.StatusCode != http.StatusAccepted {
			t.Fatalf("call %d with Redis down: status %d", i+1, resp.StatusCode)
		}
	}
}

func claimsFor(sub, role string) map[string]any {
	c := claims(role, time.Minute)
	c["sub"] = sub
	return c
}
