package httpx

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	requests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total", Help: "HTTP requests by route, method and status.",
	}, []string{"route", "method", "status"})
	latency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name: "http_request_duration_seconds", Help: "HTTP request latency by route and method.",
		Buckets: prometheus.DefBuckets,
	}, []string{"route", "method"})
)

// RequestID keeps an incoming X-Request-ID or creates one, and echoes it back.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set("request_id", id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// Observe records Prometheus metrics and writes one JSON access-log line per request.
func Observe(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		status := c.Writer.Status()
		requests.WithLabelValues(route, c.Request.Method, strconv.Itoa(status)).Inc()
		latency.WithLabelValues(route, c.Request.Method).Observe(time.Since(start).Seconds())
		if route == "/health/live" || route == "/health/ready" || route == "/metrics" {
			return
		}
		log.InfoContext(c.Request.Context(), "request",
			"method", c.Request.Method, "route", route, "status", status,
			"duration_ms", time.Since(start).Milliseconds(), "request_id", c.GetString("request_id"))
	}
}

// Recover turns a panic into a logged 500 problem.
func Recover(log *slog.Logger) gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, err any) {
		log.ErrorContext(c.Request.Context(), "panic", "error", err)
		WriteProblem(c, http.StatusInternalServerError, "unexpected error")
	})
}
