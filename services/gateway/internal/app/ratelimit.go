package app

import (
	"log/slog"
	"math"
	"net/http"
	"net/netip"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

var limiterErrors = promauto.NewCounter(prometheus.CounterOpts{
	Name: "gateway_rate_limit_errors_total",
	Help: "Rate-limit checks that could not reach Redis; those requests went through unchecked.",
})

// budget is one counter a request spends from, and how much it holds per minute.
type budget struct {
	key   string
	limit int
}

// rateLimit spends a request's budgets in two steps around the token check. If Redis
// cannot be reached the request goes through: locking everyone out of sign-in is worse
// than a few minutes without limits, and auth-profile still caps codes per email address.
type rateLimit struct {
	limiter *limit.Limiter
	limits  limit.Limits
	log     *slog.Logger
	// lastWarned throttles the "Redis is down" warning to one line per interval instead
	// of one per request; the metric counts every occurrence.
	lastWarned atomic.Int64
}

func newRateLimit(limiter *limit.Limiter, limits limit.Limits, log *slog.Logger) *rateLimit {
	return &rateLimit{limiter: limiter, limits: limits, log: log}
}

// perAddress runs before the token check, so even refused requests cost the caller.
func (rl *rateLimit) perAddress(c *gin.Context) {
	address := AddressKey(c.ClientIP())
	budgets := []budget{{"ip:" + address, rl.limits.IP}}
	if c.MustGet(routeKey).(routes.Route).SignIn {
		budgets = append(budgets, budget{"signin:" + address, rl.limits.SignIn})
	}
	rl.spend(c, budgets)
}

// perAccount runs after the token check: guests get a smaller budget than users.
func (rl *rateLimit) perAccount(c *gin.Context) {
	v, ok := c.Get(claimsKey)
	if !ok {
		c.Next()
		return
	}
	claims := v.(auth.Claims)
	perUser := rl.limits.User
	if claims.Role == "guest" {
		perUser = rl.limits.Guest
	}
	rl.spend(c, []budget{{"user:" + claims.Subject, perUser}})
}

func (rl *rateLimit) spend(c *gin.Context, budgets []budget) {
	if rl.limiter == nil {
		c.Next()
		return
	}
	for _, b := range budgets {
		allowed, retryAfter, err := rl.limiter.Allow(c.Request.Context(), b.key, b.limit)
		if err != nil {
			rl.unavailable(c, err)
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

func (rl *rateLimit) unavailable(c *gin.Context, err error) {
	limiterErrors.Inc()
	now := time.Now().Unix()
	if last := rl.lastWarned.Load(); now-last >= 30 && rl.lastWarned.CompareAndSwap(last, now) {
		rl.log.WarnContext(c.Request.Context(), "rate limits unavailable, requests pass unchecked", "error", err)
	}
}

// AddressKey is the rate-limit identity of a client address. An IPv6 user usually
// controls a whole /64, so per-address budgets for IPv6 apply to the /64; IPv4 (also
// when mapped into IPv6) is taken as is.
func AddressKey(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	addr = addr.Unmap()
	if addr.Is4() {
		return addr.String()
	}
	return netip.PrefixFrom(addr, 64).Masked().String()
}
