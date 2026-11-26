package config_test

import (
	"strings"
	"testing"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/config"
)

func TestDefaults(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://redis:6379/0")
	c, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8084" || c.PoolSize != 2 || c.Threads != 1 || c.HashMB != 64 || c.QueueLimit != 500 ||
		c.SearchLimitMs != 20000 || c.CacheTTL != 168*time.Hour || c.EnginePath != "/usr/local/bin/stockfish" {
		t.Fatalf("%+v", c)
	}
}

func TestEveryProblemIsReported(t *testing.T) {
	t.Setenv("REDIS_URL", "")
	t.Setenv("ENGINE_POOL_SIZE", "0")
	t.Setenv("CACHE_TTL", "soon")
	_, err := config.Load()
	if err == nil {
		t.Fatal("no error")
	}
	for _, want := range []string{"REDIS_URL", "ENGINE_POOL_SIZE", "CACHE_TTL"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("%q does not mention %s", err, want)
		}
	}
}
