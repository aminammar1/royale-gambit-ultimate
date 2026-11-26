package cache_test

import (
	"context"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/cache"
)

func TestKey(t *testing.T) {
	got := cache.Key("19", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -", 0, "-", 18, 3)
	want := "analysis:v2:19:rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR_w_KQkq_-:0:-:18:3"
	if got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
	base := cache.Key("19", "x", 0, "-", 18, 3)
	for _, other := range []string{
		cache.Key("18", "x", 0, "-", 18, 3),
		cache.Key("19", "y", 0, "-", 18, 3),
		cache.Key("19", "x", 1, "-", 18, 3),
		cache.Key("19", "x", 0, "ab12", 18, 3),
		cache.Key("19", "x", 0, "-", 17, 3),
		cache.Key("19", "x", 0, "-", 18, 1),
	} {
		if other == base {
			t.Fatalf("%s should differ from %s", other, base)
		}
	}
}

// Against a real Redis (Testcontainers): round trip, miss, expiry, and a dead Redis is a miss.
func TestAgainstRedis(t *testing.T) {
	ctx := context.Background()
	r, err := tcredis.Run(ctx, "redis:8.8.4-trixie")
	testcontainers.CleanupContainer(t, r)
	if err != nil {
		t.Fatal(err)
	}
	url, err := r.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c, err := cache.New(url, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if err := c.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.Get(ctx, "k"); ok {
		t.Fatal("hit on an empty cache")
	}
	if err := c.Set(ctx, "k", []byte(`{"depth":18}`)); err != nil {
		t.Fatal(err)
	}
	if v, ok := c.Get(ctx, "k"); !ok || string(v) != `{"depth":18}` {
		t.Fatalf("got %q %v", v, ok)
	}
	time.Sleep(1500 * time.Millisecond)
	if _, ok := c.Get(ctx, "k"); ok {
		t.Fatal("entry outlived its TTL")
	}

	if err := r.Terminate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.Get(ctx, "k"); ok {
		t.Fatal("hit with Redis down")
	}
	if err := c.Ping(ctx); err == nil {
		t.Fatal("ping succeeded with Redis down")
	}
}
