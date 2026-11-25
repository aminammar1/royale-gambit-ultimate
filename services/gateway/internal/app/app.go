// Package app wires the gateway's router: its own health and metrics routes, then the
// steps every proxied request goes through.
package app

import (
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/proxy"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// Options is what the gateway is built from. Zero values get safe defaults.
type Options struct {
	Service         string
	Log             *slog.Logger
	Routes          routes.Table
	UpstreamTimeout time.Duration
}

const routeKey = "route"

// New returns the gateway router.
func New(opts Options) *gin.Engine {
	if opts.UpstreamTimeout == 0 {
		opts.UpstreamTimeout = 10 * time.Second
	}
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	// Nobody sits in front of us whose X-Forwarded-For we could believe: the client's
	// address is the TCP peer. Without this gin would let any caller pick its own IP.
	_ = r.SetTrustedProxies(nil)
	r.HandleMethodNotAllowed = true
	r.Use(otelgin.Middleware(opts.Service), httpx.RequestID(), httpx.Observe(opts.Log), httpx.Recover(opts.Log))

	ok := func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) }
	r.GET("/health/live", ok)
	r.GET("/health/ready", ok)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	fwd := proxy.New(opts.UpstreamTimeout, opts.Log)
	// Everything that is not one of our own routes is a candidate for forwarding.
	r.NoRoute(route(opts.Routes), func(c *gin.Context) {
		fwd.Forward(c.Writer, c.Request, c.MustGet(routeKey).(routes.Route), c.GetString("request_id"))
	})
	r.NoMethod(func(c *gin.Context) {
		httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed on this route")
	})
	return r
}

// route finds the request's route, or answers 404. Paths that are not in canonical form
// are refused outright: "/v1/auth/../profile" or an encoded slash could mean one path to
// us and another to the service, which is how auth checks get skipped.
func route(table routes.Table) gin.HandlerFunc {
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		raw := strings.ToLower(c.Request.URL.EscapedPath())
		if path.Clean(p) != p || strings.Contains(raw, "%2f") || strings.Contains(raw, "%5c") {
			httpx.WriteProblem(c, http.StatusBadRequest, "the path is not in canonical form")
			return
		}
		match, ok := table.Match(p)
		if !ok {
			httpx.WriteProblem(c, http.StatusNotFound, "no such route")
			return
		}
		c.Set(routeKey, match)
		c.Next()
	}
}
