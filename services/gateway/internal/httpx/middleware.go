package httpx

import (
	"errors"
	"log/slog"
	"net/http"
	"regexp"
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

	// A request id we pass on must be safe in logs and headers.
	requestIDShape = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

	// Metric labels come from this fixed set; a client inventing methods must not be able
	// to create new time series.
	knownMethods = map[string]bool{
		http.MethodGet: true, http.MethodHead: true, http.MethodPost: true, http.MethodPut: true,
		http.MethodPatch: true, http.MethodDelete: true, http.MethodOptions: true, "QUERY": true,
	}
)

const routeLabelKey = "route_label"

// SetRouteLabel names the request in metrics and logs, for requests gin did not route
// itself (everything the gateway forwards).
func SetRouteLabel(c *gin.Context, label string) { c.Set(routeLabelKey, label) }

// RequestID keeps a well-formed incoming X-Request-ID or creates one, echoes it back, and
// puts it on the request so it travels on to the service.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if !requestIDShape.MatchString(id) {
			id = uuid.NewString()
		}
		c.Request.Header.Set("X-Request-ID", id)
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
			route = c.GetString(routeLabelKey)
		}
		if route == "" {
			route = "noroute"
		}
		method := c.Request.Method
		if !knownMethods[method] {
			method = "OTHER"
		}
		status := c.Writer.Status()
		requests.WithLabelValues(route, method, strconv.Itoa(status)).Inc()
		latency.WithLabelValues(route, method).Observe(time.Since(start).Seconds())
		if route == "/health/live" || route == "/health/ready" || route == "/metrics" {
			return
		}
		log.InfoContext(c.Request.Context(), "request",
			"method", method, "route", route, "status", status,
			"duration_ms", time.Since(start).Milliseconds(), "request_id", c.GetString("request_id"))
	}
}

// Recover turns a panic into a logged 500 problem. The one exception is
// http.ErrAbortHandler, the proxy's way of saying a stream broke mid-way: it must reach
// net/http, which then cuts the connection so the client sees a broken response instead
// of one that merely looks short. gin's own recovery swallows that panic, so this one is
// hand-written.
func Recover(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			err := recover()
			if err == nil {
				return
			}
			if e, ok := err.(error); ok && errors.Is(e, http.ErrAbortHandler) {
				panic(err)
			}
			log.ErrorContext(c.Request.Context(), "panic", "error", err)
			if !c.Writer.Written() {
				WriteProblem(c, http.StatusInternalServerError, "unexpected error")
			}
		}()
		c.Next()
	}
}
