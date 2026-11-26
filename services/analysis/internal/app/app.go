// Package app is the HTTP layer: health, metrics and the two analysis endpoints of
// contracts/openapi/analysis.yaml, answered as JSON or as server-sent events.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/pool"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

// Engines runs searches: the pool, or a fake in tests.
type Engines interface {
	Do(ctx context.Context, prio pool.Priority, req engine.Request, onInfo func(uci.Line)) (engine.Result, error)
	ID() engine.ID
	Ready() int
}

// Store keeps finished analyses: the Redis cache, or a map in tests.
type Store interface {
	Get(ctx context.Context, key string) ([]byte, bool)
	Set(ctx context.Context, key string, value []byte) error
	Ping(ctx context.Context) error
}

// Options wires the service.
type Options struct {
	Service string
	Engines Engines
	Store   Store
	Log     *slog.Logger
	// Parallel is how many positions of one batch request run at the same time; the pool size.
	Parallel int
	// LimitMs caps one depth search (the gateway gives analysis 30 s to answer).
	LimitMs int
}

type server struct{ Options }

// New returns the service router.
func New(opts Options) *gin.Engine {
	if opts.Parallel < 1 {
		opts.Parallel = 1
	}
	s := &server{opts}
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.Use(otelgin.Middleware(opts.Service), httpx.RequestID(), httpx.Observe(opts.Log), httpx.Recover(opts.Log))

	r.GET("/health/live", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/health/ready", s.ready)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))
	r.POST("/v1/analysis/positions", s.positions)
	r.POST("/v1/analysis/batch", s.batch)

	r.NoRoute(func(c *gin.Context) { httpx.WriteProblem(c, http.StatusNotFound, "no such route") })
	r.NoMethod(func(c *gin.Context) {
		httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed on this route")
	})
	return r
}

func (s *server) ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Second)
	defer cancel()
	if err := s.Store.Ping(ctx); err != nil {
		s.Log.WarnContext(ctx, "not ready: redis", "error", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "redis unavailable"})
		return
	}
	if s.Engines.Ready() == 0 {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "no engine ready"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Analysis is the answer for one position (contract: Analysis).
type Analysis struct {
	Index      *int       `json:"index,omitempty"`
	EPD        string     `json:"epd"`
	SideToMove string     `json:"side_to_move"`
	Depth      int        `json:"depth"`
	Lines      []uci.Line `json:"lines"`
	Bestmove   *string    `json:"bestmove"`
	Engine     engine.ID  `json:"engine"`
	Cached     bool       `json:"cached"`
}

// analyse answers one checked position: a terminal position at once, a cached result if there
// is one, else a search (cached when it reached the depth asked).
func (s *server) analyse(ctx context.Context, prio pool.Priority, p checked, opt search, onInfo func(uci.Line)) (Analysis, error) {
	id := s.Engines.ID()
	a := Analysis{EPD: p.EPD, SideToMove: string(p.SideToMove), Lines: []uci.Line{}, Engine: id}
	if p.Terminal {
		return a, nil
	}
	key := ""
	if opt.MovetimeMs == 0 {
		key = cacheKey(id.Version, p.EPD, p.Halfmove, p.History, opt.Depth, opt.MultiPV)
		if raw, ok := s.Store.Get(ctx, key); ok {
			var hit Analysis
			if err := json.Unmarshal(raw, &hit); err == nil {
				hit.Cached = true
				return hit, nil
			}
		}
	}
	res, err := s.Engines.Do(ctx, prio, engine.Request{
		FEN: p.StartFEN, Moves: p.Moves, SideToMove: p.SideToMove,
		Depth: opt.Depth, MovetimeMs: opt.MovetimeMs, MultiPV: opt.MultiPV, LimitMs: s.LimitMs,
	}, onInfo)
	if err != nil {
		return Analysis{}, err
	}
	a.Depth = res.Depth
	if len(res.Lines) > 0 {
		a.Lines = res.Lines
	}
	if res.Bestmove != "" {
		a.Bestmove = &res.Bestmove
	}
	if key != "" && complete(res, opt.Depth) {
		if raw, err := json.Marshal(a); err == nil {
			if err := s.Store.Set(context.WithoutCancel(ctx), key, raw); err != nil {
				s.Log.WarnContext(ctx, "cache write failed", "error", err)
			}
		}
	}
	return a, nil
}

// complete is true when the search reached the depth asked on every line: only such a result
// may be served again from the cache.
func complete(res engine.Result, depth int) bool {
	if res.Capped || len(res.Lines) == 0 {
		return false
	}
	for _, l := range res.Lines {
		if l.Depth < depth {
			return false
		}
	}
	return true
}

// failure turns an analysis error into a problem; ok is false when the client is gone and
// nothing should be written.
func failure(c *gin.Context, err error) (p httpx.Problem, retryAfter string, ok bool) {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return p, "", false
	case errors.Is(err, engine.ErrRejected):
		return httpx.NewProblem(c, http.StatusBadRequest, "invalid-position", "Invalid position",
			"the engine refused this position"), "", true
	case errors.Is(err, pool.ErrBusy):
		return httpx.NewProblem(c, http.StatusServiceUnavailable, "engine-busy", "Engines busy",
			"every engine is busy and the queue is full; try again shortly"), "2", true
	case errors.Is(err, pool.ErrUnavailable), errors.Is(err, pool.ErrClosed), errors.Is(err, engine.ErrDied):
		return httpx.NewProblem(c, http.StatusServiceUnavailable, "engine-unavailable", "Engine unavailable",
			"no engine is running right now; try again shortly"), "5", true
	}
	return httpx.NewProblem(c, http.StatusInternalServerError, "", "", "unexpected error"), "", true
}

func (s *server) fail(c *gin.Context, err error) {
	p, retry, ok := failure(c, err)
	if !ok {
		c.Abort()
		return
	}
	if p.Status == http.StatusInternalServerError {
		s.Log.ErrorContext(c.Request.Context(), "analysis failed", "error", err)
	}
	if retry != "" {
		c.Header("Retry-After", retry)
	}
	httpx.Abort(c, p)
}
