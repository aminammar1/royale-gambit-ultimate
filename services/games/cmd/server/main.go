// Command server runs the service. `server healthcheck` is used by the Docker HEALTHCHECK.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/app"
	"github.com/google/uuid"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/authprofile"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/broker"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/cache"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/config"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/explorer"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/importer"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/outbox"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/sites"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/telemetry"
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

	if cfg.MigrateOnStart {
		if err := store.Migrate(cfg.DatabaseURL); err != nil {
			return err
		}
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	mq, err := broker.Dial(cfg.RabbitURL)
	if err != nil {
		return err
	}
	defer mq.Close()
	// Bound before the relay can publish an import, so none is dropped on a first start.
	if err := mq.Declare(importer.Queue, importer.Event); err != nil {
		return fmt.Errorf("rabbitmq: %w", err)
	}
	verifier, err := auth.NewVerifier(ctx, cfg.JWKSURL, cfg.Issuer)
	if err != nil {
		return err
	}
	answers, err := cache.New(cfg.RedisURL)
	if err != nil {
		return err
	}
	defer answers.Close()
	// A player's Lichess token comes from auth-profile, directly, never through the gateway.
	tokens := authprofile.New(cfg.AuthProfileURL, cfg.InternalToken)
	explore := &explorer.Explorer{
		Base: cfg.ExplorerURL, Lichess: cfg.LichessURL, UserAgent: cfg.UserAgent, Cache: answers,
		Tokens: explorer.TokensFunc(func(ctx context.Context, user uuid.UUID) (string, error) {
			t, err := tokens.LichessToken(ctx, user)
			if errors.Is(err, authprofile.ErrNoLichess) {
				return "", explorer.ErrNoToken
			}
			return t, err
		}),
	}

	// The relay, the import workers and the HTTP server run together; if one stops, all stop.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	errc := make(chan error, cfg.ImportWorkers+1)
	// Everything that uses the database and the broker, waited for before they close.
	var running sync.WaitGroup
	running.Add(1 + cfg.ImportWorkers)
	go func() {
		defer running.Done()
		(&outbox.Relay{Store: db, Pub: mq, Log: log, Every: 500 * time.Millisecond}).Run(ctx)
	}()
	worker := &importer.Worker{Store: db, Log: log, Batch: 50, Sites: map[string]sites.Fetcher{
		"lichess":  &sites.Lichess{Base: cfg.LichessURL, UserAgent: cfg.UserAgent},
		"chesscom": &sites.ChessCom{Base: cfg.ChessComURL, UserAgent: cfg.UserAgent},
	}}
	for i := 0; i < cfg.ImportWorkers; i++ {
		go func() {
			defer running.Done()
			errc <- fmt.Errorf("import worker: %w", mq.Consume(ctx, importer.Queue, importer.Event, 1, worker.Handle))
		}()
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: app.New(app.Options{
			Service: cfg.ServiceName, Store: db, Broker: mq, Verifier: verifier, Log: log, MaxImport: cfg.MaxImport,
			Explorer: explore,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		// Requests live in ctx, so stopping ends the import streams instead of waiting on them.
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	go func() { errc <- srv.ListenAndServe() }()
	log.Info("listening", "port", cfg.Port, "import_workers", cfg.ImportWorkers)

	var runErr error
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) && ctx.Err() == nil {
			runErr = err
		}
	case <-ctx.Done():
		log.Info("shutting down")
	}
	// Cancelling ends the workers, the relay and the import streams; then the server answers
	// what is left in flight, and the workers finish before the database and broker close.
	cancel()
	sctx, done := context.WithTimeout(context.Background(), 8*time.Second)
	defer done()
	if err := srv.Shutdown(sctx); err != nil && runErr == nil {
		runErr = err
	}
	running.Wait()
	return runErr
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
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
