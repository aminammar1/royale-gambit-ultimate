// Package app wires the gateway's router: its own health and metrics routes, then the
// middleware every proxied request goes through.
package app

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
)

// New returns the gateway router.
func New(service string, log *slog.Logger) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.Use(otelgin.Middleware(service), httpx.RequestID(), httpx.Observe(log), httpx.Recover(log))

	ok := func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) }
	r.GET("/health/live", ok)
	r.GET("/health/ready", ok)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	r.NoRoute(func(c *gin.Context) { httpx.WriteProblem(c, http.StatusNotFound, "no such route") })
	r.NoMethod(func(c *gin.Context) {
		httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed on this route")
	})
	return r
}
