// Package config reads the service configuration from environment variables only (12-factor).
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config is everything the service needs at start-up.
type Config struct {
	ServiceName string
	Port        string
	RedisURL    string
	CacheTTL    time.Duration
	// EnginePath is the Stockfish binary; EngineVersion is the version it must report (the
	// image pins both, so a mismatch means a broken build).
	EnginePath    string
	EngineVersion string
	PoolSize      int
	Threads       int
	HashMB        int
	QueueLimit    int
	SearchLimitMs int
}

// Load reads the environment. REDIS_URL is required; the rest has defaults.
func Load() (Config, error) {
	c := Config{
		ServiceName:   getenv("SERVICE_NAME", "analysis"),
		Port:          getenv("PORT", "8084"),
		RedisURL:      os.Getenv("REDIS_URL"),
		EnginePath:    getenv("ENGINE_PATH", "/usr/local/bin/stockfish"),
		EngineVersion: os.Getenv("ENGINE_VERSION"),
	}
	var errs []error
	if c.RedisURL == "" {
		errs = append(errs, errors.New("REDIS_URL is required"))
	}
	ints := []struct {
		key      string
		def, min int
		dst      *int
	}{
		{"ENGINE_POOL_SIZE", 2, 1, &c.PoolSize},
		{"ENGINE_THREADS", 1, 1, &c.Threads},
		{"ENGINE_HASH_MB", 64, 1, &c.HashMB},
		{"QUEUE_LIMIT", 500, 1, &c.QueueLimit},
		{"SEARCH_LIMIT_MS", 20000, 100, &c.SearchLimitMs},
	}
	for _, v := range ints {
		n, err := strconv.Atoi(getenv(v.key, strconv.Itoa(v.def)))
		if err != nil || n < v.min {
			errs = append(errs, fmt.Errorf("%s must be a whole number of at least %d", v.key, v.min))
			continue
		}
		*v.dst = n
	}
	ttl, err := time.ParseDuration(getenv("CACHE_TTL", "168h"))
	if err != nil || ttl <= 0 {
		errs = append(errs, errors.New("CACHE_TTL must be a positive duration such as 168h"))
	}
	c.CacheTTL = ttl
	return c, errors.Join(errs...)
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
