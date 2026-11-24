// Package app wires the HTTP router. Tests build the same router against a real database.
package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/db"
	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/items"
)

// New returns the service router.
func New(service string, pool *pgxpool.Pool, log *slog.Logger) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.Use(otelgin.Middleware(service), httpx.RequestID(), httpx.Observe(log), httpx.Recover(log))

	r.GET("/health/live", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/health/ready", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			log.WarnContext(c.Request.Context(), "not ready", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	items.Handler{Q: db.New(pool)}.Register(r)

	r.NoRoute(func(c *gin.Context) { httpx.WriteProblem(c, http.StatusNotFound, "no such route") })
	r.NoMethod(func(c *gin.Context) {
		httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed on this route")
	})
	return r
}
