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

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/config"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/telemetry"
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

	verifier, err := auth.NewVerifier(ctx, cfg.JWKSURL, cfg.Issuer)
	if err != nil {
		return err
	}
	limiter := limit.New(cfg.Redis)
	defer limiter.Close()

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: app.New(app.Options{
			Service:         cfg.ServiceName,
			Log:             log,
			Routes:          routes.Build(routes.Upstreams{AuthProfile: cfg.AuthProfile, Analysis: cfg.Analysis, Games: cfg.Games}),
			Verifier:        verifier,
			Limiter:         limiter,
			Limits:          cfg.Limits,
			CORSOrigins:     cfg.CORSOrigins,
			UpstreamTimeout: cfg.UpstreamTimeout,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		// Idle keep-alive connections are closed after a while. No WriteTimeout: server-sent
		// events stream for as long as the client listens.
		IdleTimeout: 2 * time.Minute,
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
		if err := srv.Shutdown(sctx); err != nil {
			// Long-lived streams outlast the grace period; cutting them is the plan, not a crash.
			log.Warn("closing connections that outlived the shutdown grace period", "error", err)
			return srv.Close()
		}
	}
	return nil
}

func healthcheck() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
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
