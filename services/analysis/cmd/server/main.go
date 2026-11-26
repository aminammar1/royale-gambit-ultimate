// Command server runs the service. `server healthcheck` is used by the Docker HEALTHCHECK.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/cache"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/config"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/pool"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/telemetry"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := telemetry.NewLogger(os.Stdout, cfg.ServiceName)
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	shutdownTracing, err := telemetry.SetupTracing(ctx, cfg.ServiceName)
	if err != nil {
		return fmt.Errorf("tracing: %w", err)
	}
	defer func() { _ = shutdownTracing(context.Background()) }()

	store, err := cache.New(cfg.RedisURL, cfg.CacheTTL)
	if err != nil {
		return err
	}
	defer store.Close()

	opts := engine.Options{Threads: cfg.Threads, HashMB: cfg.HashMB, Reply: 10 * time.Second}
	engines, err := pool.New(ctx, cfg.PoolSize, cfg.QueueLimit, func(ctx context.Context) (pool.Searcher, error) {
		return engine.Start(ctx, cfg.EnginePath, opts)
	}, log)
	if err != nil {
		return fmt.Errorf("engine: %w", err)
	}
	defer engines.Close()
	id := engines.ID()
	if cfg.EngineVersion != "" && id.Version != cfg.EngineVersion {
		return fmt.Errorf("engine reports %s %s, the image pins %s", id.Name, id.Version, cfg.EngineVersion)
	}
	log.Info("engines ready", "engine", id.Name, "version", id.Version, "pool", cfg.PoolSize,
		"threads", cfg.Threads, "hash_mb", cfg.HashMB)

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: app.New(app.Options{
			Service: cfg.ServiceName, Engines: engines, Store: store, Log: log,
			Parallel: cfg.PoolSize, LimitMs: cfg.SearchLimitMs,
		}),
		ReadHeaderTimeout: 5 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	log.Info("listening", "port", cfg.Port)

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		// Answer the requests in flight, then the deferred Close quits every engine.
		return srv.Shutdown(sctx)
	}
	return nil
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8084"
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health/live")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
