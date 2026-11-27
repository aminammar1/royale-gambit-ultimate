// Package app is the HTTP layer of contracts/openapi/games.yaml: health, metrics, saving and
// searching games, and imports (JSON, or their progress as server-sent events).
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
)

// Pinger is the broker as readiness sees it.
type Pinger interface{ Ping() error }

// Options wires the service.
type Options struct {
	Service  string
	Store    *store.Store
	Broker   Pinger
	Verifier *auth.Verifier
	Log      *slog.Logger
	// MaxImport caps max_games (config MAX_IMPORT_GAMES).
	MaxImport int
}

type server struct{ Options }

const (
	maxPGNBytes = 5 << 20
	maxPGNGames = 2000
	userKey     = "user_id"
)

// pollEvery is how often an import's stream looks for news; keepAliveEvery how often a quiet
// stream writes a comment so proxies keep it open.
var (
	pollEvery      = 300 * time.Millisecond
	keepAliveEvery = 5 * time.Second
)

// New returns the service router.
func New(opts Options) *gin.Engine {
	s := &server{opts}
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.HandleMethodNotAllowed = true
	r.Use(otelgin.Middleware(opts.Service), httpx.RequestID(), httpx.Observe(opts.Log), httpx.Recover(opts.Log))

	r.GET("/health/live", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/health/ready", s.ready)
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	v1 := r.Group("/v1", s.authenticate)
	v1.POST("/games", s.saveGames)
	v1.GET("/games", s.searchGames)
	v1.GET("/games/:id", s.getGame)
	v1.POST("/imports", s.startImport)
	v1.GET("/imports/:id", s.getImport)

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
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "postgres unavailable"})
		return
	}
	if err := s.Broker.Ping(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "rabbitmq unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// authenticate reads the owner from the token's `sub`; without a valid token, 401.
func (s *server) authenticate(c *gin.Context) {
	raw, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
	if !ok || raw == "" {
		s.unauthorized(c)
		return
	}
	claims, err := s.Verifier.Verify(raw)
	if err != nil {
		s.unauthorized(c)
		return
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		s.unauthorized(c)
		return
	}
	c.Set(userKey, id)
	c.Next()
}

func (s *server) unauthorized(c *gin.Context) {
	c.Header("WWW-Authenticate", `Bearer realm="royale-gambit"`)
	httpx.WriteProblem(c, http.StatusUnauthorized, "a valid bearer token is needed")
}

func owner(c *gin.Context) uuid.UUID { return c.MustGet(userKey).(uuid.UUID) }

func invalid(c *gin.Context, detail string) {
	httpx.Abort(c, httpx.NewProblem(c, http.StatusBadRequest, "invalid-request", "Invalid request", detail))
}

func tooLarge(c *gin.Context, detail string) {
	httpx.Abort(c, httpx.NewProblem(c, http.StatusRequestEntityTooLarge, "too-large", "Too large", detail))
}

func (s *server) internal(c *gin.Context, err error) {
	if errors.Is(err, context.Canceled) {
		c.Abort()
		return
	}
	s.Log.ErrorContext(c.Request.Context(), "request failed", "error", err)
	httpx.WriteProblem(c, http.StatusInternalServerError, "unexpected error")
}

// decode reads a JSON body strictly (no unknown fields), within limit bytes.
func decode(c *gin.Context, limit int64, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, limit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			tooLarge(c, fmt.Sprintf("the body is over %d MB", limit>>20))
		} else {
			invalid(c, "the body is not the JSON this route takes: "+err.Error())
		}
		return false
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		invalid(c, "the body holds more than one JSON value")
		return false
	}
	return true
}

type rejected struct {
	Index  int    `json:"index"`
	Reason string `json:"reason"`
}

func (s *server) saveGames(c *gin.Context) {
	var req struct {
		PGN *string `json:"pgn"`
	}
	// The PGN plus its JSON escaping.
	if !decode(c, 2*maxPGNBytes, &req) {
		return
	}
	if req.PGN == nil {
		invalid(c, "pgn is required")
		return
	}
	if !plainText(*req.PGN) {
		invalid(c, "the PGN must be UTF-8 text without NUL characters")
		return
	}
	if len(*req.PGN) > maxPGNBytes {
		tooLarge(c, "the PGN is over 5 MB")
		return
	}
	parsed, err := pgn.Read(strings.NewReader(*req.PGN), maxPGNGames)
	if errors.Is(err, pgn.ErrTooMany) {
		tooLarge(c, fmt.Sprintf("the PGN holds more than %d games", maxPGNGames))
		return
	}
	if err != nil {
		invalid(c, err.Error())
		return
	}
	if len(parsed) == 0 {
		invalid(c, "there is no game in the PGN")
		return
	}
	var good []*pgn.Game
	bad := []rejected{}
	for _, p := range parsed {
		if p.Err != nil {
			bad = append(bad, rejected{Index: p.Index, Reason: p.Err.Error()})
			continue
		}
		good = append(good, p.Game)
	}
	res := store.SaveResult{Saved: []store.Summary{}}
	if len(good) > 0 {
		if res, err = s.Store.SaveGames(c.Request.Context(), owner(c), "pgn", nil, good); err != nil {
			s.internal(c, err)
			return
		}
	}
	if res.Saved == nil {
		res.Saved = []store.Summary{}
	}
	c.JSON(http.StatusOK, gin.H{"saved": len(res.Saved), "duplicates": res.Duplicates, "rejected": bad, "games": res.Saved})
}

var (
	ecoPattern      = regexp.MustCompile(`^[A-E][0-9]{0,2}$`)
	usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{2,30}$`)
	enums           = map[string][]string{
		"color": {"white", "black"}, "result": {"win", "loss", "draw"}, "source": {"lichess", "chesscom", "pgn"},
	}
)

func (s *server) searchGames(c *gin.Context) {
	q := c.Request.URL.Query()
	f := store.Filter{
		Q: q.Get("q"), Player: q.Get("player"), Color: q.Get("color"), Result: q.Get("result"),
		ECO: q.Get("eco"), Source: q.Get("source"), Cursor: q.Get("cursor"), Limit: 50,
	}
	// A typed parameter that is present must be valid; empty is not a value.
	for name, allowed := range enums {
		if v := q.Get(name); q.Has(name) && !contains(allowed, v) {
			invalid(c, fmt.Sprintf("%s must be one of %s", name, strings.Join(allowed, ", ")))
			return
		}
	}
	switch {
	case !plainText(f.Q) || !plainText(f.Player) || !plainText(f.Cursor):
		invalid(c, "q, player and cursor must be UTF-8 text without NUL characters")
		return
	case len(f.Q) > 100, len(f.Player) > 60, len(f.Cursor) > 200:
		invalid(c, "q, player or cursor is too long")
		return
	case (f.Color != "" || f.Result != "") && f.Player == "":
		invalid(c, "color and result are read from a player's side: give player too")
		return
	case q.Has("eco") && !ecoPattern.MatchString(f.ECO):
		invalid(c, "eco is a code such as C95, or its first letters (C, C9)")
		return
	}
	for name, dst := range map[string]**time.Time{"from": &f.From, "to": &f.To} {
		if q.Has(name) {
			d, err := time.Parse(time.DateOnly, q.Get(name))
			if err != nil {
				invalid(c, name+" is a date such as 2026-11-28")
				return
			}
			*dst = &d
		}
	}
	if q.Has("limit") {
		n, err := strconv.Atoi(q.Get("limit"))
		if err != nil || n < 1 || n > 100 {
			invalid(c, "limit is a whole number from 1 to 100")
			return
		}
		f.Limit = n
	}
	games, next, err := s.Store.Search(c.Request.Context(), owner(c), f)
	if errors.Is(err, store.ErrBadCursor) {
		invalid(c, "cursor is not one this service gave")
		return
	}
	if err != nil {
		s.internal(c, err)
		return
	}
	var nextCursor *string
	if next != "" {
		nextCursor = &next
	}
	c.JSON(http.StatusOK, gin.H{"items": games, "next_cursor": nextCursor})
}

// plainText is UTF-8 without NUL, which Postgres text cannot hold.
func plainText(s string) bool { return utf8.ValidString(s) && !strings.ContainsRune(s, 0) }

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func idParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		invalid(c, "id is a UUID")
		return uuid.Nil, false
	}
	return id, true
}

func (s *server) getGame(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	g, err := s.Store.Get(c.Request.Context(), owner(c), id)
	if errors.Is(err, store.ErrNotFound) {
		httpx.WriteProblem(c, http.StatusNotFound, "no such game")
		return
	}
	if err != nil {
		s.internal(c, err)
		return
	}
	c.JSON(http.StatusOK, g)
}

func (s *server) startImport(c *gin.Context) {
	var req struct {
		Site     string          `json:"site"`
		Username string          `json:"username"`
		MaxGames json.RawMessage `json:"max_games"`
	}
	if !decode(c, 4096, &req) {
		return
	}
	limit := s.MaxImport
	var maxGames *int
	if req.MaxGames != nil {
		// Left out is the default; given, it is a whole number (null is not).
		var n int
		if err := json.Unmarshal(req.MaxGames, &n); err != nil || string(req.MaxGames) == "null" {
			invalid(c, "max_games is a whole number from 1 to 2000")
			return
		}
		maxGames = &n
	}
	switch {
	case req.Site != "lichess" && req.Site != "chesscom":
		invalid(c, "site is lichess or chesscom")
		return
	case !usernamePattern.MatchString(req.Username):
		invalid(c, "username is 2 to 30 letters, digits, - or _")
		return
	case maxGames != nil && (*maxGames < 1 || *maxGames > 2000):
		invalid(c, "max_games is from 1 to 2000")
		return
	case maxGames != nil:
		limit = min(*maxGames, s.MaxImport)
	}
	job, created, err := s.Store.CreateImport(c.Request.Context(), owner(c), req.Site, req.Username, limit)
	if errors.Is(err, store.ErrTooManyImports) {
		httpx.Abort(c, httpx.NewProblem(c, http.StatusTooManyRequests, "too-many-imports", "Too many imports",
			fmt.Sprintf("%d imports are already queued or running; wait for one to end", store.MaxLiveImports)))
		return
	}
	if err != nil {
		s.internal(c, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusAccepted
	}
	c.JSON(status, job)
}

func (s *server) getImport(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	job, err := s.Store.GetImport(ctx, owner(c), id)
	if errors.Is(err, store.ErrNotFound) {
		httpx.WriteProblem(c, http.StatusNotFound, "no such import")
		return
	}
	if err != nil {
		s.internal(c, err)
		return
	}
	if !strings.Contains(c.GetHeader("Accept"), "text/event-stream") {
		c.JSON(http.StatusOK, job)
		return
	}
	h := c.Writer.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	send := func(event string, v any) {
		data, _ := json.Marshal(v)
		_, _ = fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, data)
		c.Writer.Flush()
	}
	if job.Status == "queued" || job.Status == "running" {
		send("progress", job)
	}
	quiet := time.Now()
	for job.Status == "queued" || job.Status == "running" {
		select {
		case <-ctx.Done():
			return
		case <-time.After(pollEvery):
		}
		next, err := s.Store.GetImport(ctx, owner(c), id)
		if err != nil {
			if ctx.Err() == nil {
				s.Log.WarnContext(ctx, "import stream", "error", err)
				send("error", httpx.NewProblem(c, http.StatusInternalServerError, "", "", "unexpected error"))
			}
			return
		}
		if next.Status != job.Status || next.Fetched != job.Fetched || next.Saved != job.Saved || next.Duplicates != job.Duplicates {
			job = next
			if job.Status == "queued" || job.Status == "running" {
				send("progress", job)
			}
			quiet = time.Now()
		} else if time.Since(quiet) > keepAliveEvery {
			// A quiet import may be a dead one: end it if it has not moved for too long, so
			// the stream (and the username) is never held forever.
			if _, err := s.Store.ExpireIfStale(ctx, id); err != nil && ctx.Err() == nil {
				s.Log.WarnContext(ctx, "import stream", "error", err)
			}
			_, _ = fmt.Fprint(c.Writer, ": importing\n\n")
			c.Writer.Flush()
			quiet = time.Now()
		}
	}
	send("done", job)
}
