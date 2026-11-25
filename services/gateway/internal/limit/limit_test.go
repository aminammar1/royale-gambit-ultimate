package limit_test

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
)

func TestAWindowLetsTheLimitThroughThenRefuses(t *testing.T) {
	ctx := context.Background()
	container, err := tcredis.Run(ctx, "redis:8.8.4-trixie")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })
	url, err := container.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	opts, _ := redis.ParseURL(url)
	l := limit.New(redis.NewClient(opts))

	for i := 1; i <= 3; i++ {
		if ok, _, err := l.Allow(ctx, "ip:1.2.3.4", 3); err != nil || !ok {
			t.Fatalf("call %d refused (err %v)", i, err)
		}
	}
	ok, retryAfter, err := l.Allow(ctx, "ip:1.2.3.4", 3)
	if err != nil || ok {
		t.Fatalf("4th call allowed=%v err=%v, want refused", ok, err)
	}
	if retryAfter <= 0 || retryAfter > time.Minute {
		t.Fatalf("retryAfter %v, want within the current minute", retryAfter)
	}
	// Another key has its own budget.
	if ok, _, _ := l.Allow(ctx, "ip:5.6.7.8", 3); !ok {
		t.Fatal("a different caller was refused")
	}
}
