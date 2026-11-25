// Package app wires the gateway's router: its own health and metrics routes, then the
// steps every proxied request goes through.
package app

import (
	"log/slog"
	"math"
	"net/http"
	"path"
	"slices"
	"strconv"
	"strings"
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

	fwd := proxy.New(opts.UpstreamTimeout, opts.Log)
	// Everything that is not one of our own routes is a candidate for forwarding.
	r.NoRoute(route(opts.Routes), authenticate(opts.Verifier), rateLimit(opts.Limiter, opts.Limits, opts.Log), func(c *gin.Context) {
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

// authenticate checks the bearer token. A route that needs one gets 401 without it; on
// any route a token that is sent must be valid, so a bad token never reaches a service.
// The token itself is forwarded unchanged: services verify it again (defence in depth).
func authenticate(verifier TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			if c.MustGet(routeKey).(routes.Route).Auth == routes.Required {
				unauthorized(c, "a bearer token is required")
				return
			}
			c.Next()
			return
		}
		raw, isBearer := strings.CutPrefix(header, "Bearer ")
		if !isBearer || verifier == nil {
			unauthorized(c, "a valid bearer token is required")
			return
		}
		claims, err := verifier.Verify(raw)
		if err != nil {
			unauthorized(c, "a valid bearer token is required")
			return
		}
		c.Set(claimsKey, claims)
		c.Next()
	}
}

func unauthorized(c *gin.Context, detail string) {
	c.Header("WWW-Authenticate", `Bearer realm="royal-gambit"`)
	httpx.WriteProblem(c, http.StatusUnauthorized, detail)
}

// budget is one counter a request spends from, and how much it holds per minute.
type budget struct {
	key   string
	limit int
}

// rateLimit spends the caller's budgets: per address always, per address again on
// sign-in routes, and per account when a token came with the request. If Redis cannot be
// reached the request goes through: locking everyone out of sign-in is worse than a few
// minutes without limits, and auth-profile caps codes per address on its own.
func rateLimit(limiter *limit.Limiter, limits limit.Limits, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if limiter == nil {
			c.Next()
			return
		}
		ip := c.ClientIP()
		budgets := []budget{{"ip:" + ip, limits.IP}}
		if c.MustGet(routeKey).(routes.Route).SignIn {
			budgets = append(budgets, budget{"signin:" + ip, limits.SignIn})
		}
		if v, ok := c.Get(claimsKey); ok {
			claims := v.(auth.Claims)
			perUser := limits.User
			if claims.Role == "guest" {
				perUser = limits.Guest
			}
			budgets = append(budgets, budget{"user:" + claims.Subject, perUser})
		}
		for _, b := range budgets {
			allowed, retryAfter, err := limiter.Allow(c.Request.Context(), b.key, b.limit)
			if err != nil {
				log.WarnContext(c.Request.Context(), "rate limit unavailable, letting the request through", "error", err)
				break
			}
			if !allowed {
				c.Header("Retry-After", strconv.Itoa(int(math.Ceil(retryAfter.Seconds()))))
				httpx.WriteProblem(c, http.StatusTooManyRequests, "too many requests; slow down")
				return
			}
		}
		c.Next()
	}
}

// cors lets the desktop app's web view call us. Only listed origins get the headers; a
// preflight is answered here and never bothers a service.
func cors(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" || !slices.Contains(origins, origin) {
			c.Next()
			return
		}
		h := c.Writer.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Add("Vary", "Origin")
		h.Set("Access-Control-Expose-Headers", "Retry-After, X-Request-ID, Location")
		if c.Request.Method == http.MethodOptions && c.GetHeader("Access-Control-Request-Method") != "" {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
			h.Set("Access-Control-Max-Age", "600")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
