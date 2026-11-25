// Package app wires the gateway: its own health and metrics routes, then the steps every
// proxied request goes through, in this order:
//
//	route → address budget → token check → account budget → forward
//
// The address budget comes before the token check on purpose: a refused token costs an
// RSA verification, and refusals must not be free.
package app

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/proxy"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// TokenVerifier checks a bearer token; *auth.Verifier is the real one.
type TokenVerifier interface {
	Verify(raw string) (auth.Claims, error)
}

// Options is what the gateway is built from. Zero values get safe defaults.
type Options struct {
	Service         string
	Log             *slog.Logger
	Routes          routes.Table
	Verifier        TokenVerifier
	Limiter         *limit.Limiter // nil: no rate limits (tests that are not about them)
	Limits          limit.Limits
	CORSOrigins     []string
	UpstreamTimeout time.Duration
}

// Keys for values the steps hand to each other through the gin context.
const (
	routeKey  = "route"
	claimsKey = "claims"
)

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
	r.Use(otelgin.Middleware(opts.Service), httpx.RequestID(), httpx.Observe(opts.Log), httpx.Recover(opts.Log),
		cors(opts.CORSOrigins))

	ok := func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) }
	r.GET("/health/live", ok)
	r.GET("/health/ready", ok)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	budgets := newRateLimit(opts.Limiter, opts.Limits, opts.Log)
	fwd := proxy.New(opts.Routes, opts.UpstreamTimeout, opts.Log)
	// Everything that is not one of our own routes is a candidate for forwarding.
	r.NoRoute(route(opts.Routes), budgets.perAddress, authenticate(opts.Verifier), budgets.perAccount,
		func(c *gin.Context) { fwd.Forward(c.Writer, c.Request, c.MustGet(routeKey).(routes.Route)) })
	r.NoMethod(func(c *gin.Context) {
		httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed on this route")
	})
	return r
}
