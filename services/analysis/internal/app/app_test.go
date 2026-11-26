package app_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/cache"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/pool"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/telemetry"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// fakeEngines answers every search with one line, after sending two info lines.
type fakeEngines struct {
	calls  atomic.Int32
	err    error
	ready  int
	capped bool
	last   atomic.Value // engine.Request
}

func (f *fakeEngines) Do(_ context.Context, _ pool.Priority, req engine.Request, onInfo func(uci.Line)) (engine.Result, error) {
	f.calls.Add(1)
	f.last.Store(req)
	if f.err != nil {
		return engine.Result{}, f.err
	}
	l := uci.Line{MultiPV: 1, Depth: req.Depth, Score: uci.CP(31), WDL: []int{100, 850, 50}, PV: []string{"e2e4", "e7e5"}}
	if onInfo != nil {
		early := l
		early.Depth = 1
		onInfo(early)
		onInfo(l)
	}
	return engine.Result{Depth: req.Depth, Lines: []uci.Line{l}, Bestmove: "e2e4", Capped: f.capped}, nil
}
func (f *fakeEngines) ID() engine.ID { return engine.ID{Name: "Stockfish", Version: "19"} }
func (f *fakeEngines) Ready() int {
	if f.ready == 0 {
		return 1
	}
	return f.ready
}

type mapStore struct {
	mu   sync.Mutex
	m    map[string][]byte
	down bool
}

func (s *mapStore) Get(_ context.Context, k string) ([]byte, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.m[k]
	return v, ok
}
func (s *mapStore) Set(_ context.Context, k string, v []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[k] = v
	return nil
}
func (s *mapStore) Ping(context.Context) error {
	if s.down {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func serve(t *testing.T, eng app.Engines, store app.Store) *httptest.Server {
	t.Helper()
	shutdown, err := telemetry.SetupTracing(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = shutdown(context.Background()) })
	srv := httptest.NewServer(app.New(app.Options{Service: "test", Engines: eng, Store: store, Log: quiet, Parallel: 2, LimitMs: 5000}))
	t.Cleanup(srv.Close)
	return srv
}

func post(t *testing.T, url, body, accept string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func decode[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

type problem struct {
	Type, Title, Detail string
	Status              int
}

func expectProblem(t *testing.T, resp *http.Response, status int, kind string) problem {
	t.Helper()
	if resp.StatusCode != status {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status %d, want %d: %s", resp.StatusCode, status, b)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("content type %q", ct)
	}
	p := decode[problem](t, resp)
	if p.Type != "https://royale-gambit.dev/problems/"+kind || p.Status != status {
		t.Fatalf("problem %+v, want kind %s", p, kind)
	}
	return p
}

type analysis struct {
	Index      *int
	EPD        string `json:"epd"`
	SideToMove string `json:"side_to_move"`
	Depth      int
	Lines      []uci.Line
	Bestmove   *string
	Engine     engine.ID
	Cached     bool
}

func TestPositionJSONAndCache(t *testing.T) {
	eng := &fakeEngines{}
	srv := serve(t, eng, &mapStore{m: map[string][]byte{}})
	body := `{"fen":"` + startFEN + `","moves":["e2e4"],"depth":12,"multipv":1}`

	resp := post(t, srv.URL+"/v1/analysis/positions", body, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	a := decode[analysis](t, resp)
	if a.EPD != "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -" || a.SideToMove != "b" ||
		a.Depth != 12 || len(a.Lines) != 1 || *a.Bestmove != "e2e4" || a.Cached || a.Engine.Version != "19" {
		t.Fatalf("%+v", a)
	}
	// The engine gets the start FEN and the moves, so it knows the game's history.
	if req := eng.last.Load().(engine.Request); req.FEN != startFEN || !slices.Equal(req.Moves, []string{"e2e4"}) ||
		req.SideToMove != 'b' || req.LimitMs != 5000 {
		t.Fatalf("engine request %+v", req)
	}

	a = decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", body, ""))
	if !a.Cached || eng.calls.Load() != 1 {
		t.Fatalf("second call: cached %v, engine calls %d", a.Cached, eng.calls.Load())
	}
	// Same position by another route (a FEN instead of a move) shares the entry.
	same := `{"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","depth":12,"multipv":1}`
	if a = decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", same, "")); !a.Cached {
		t.Fatal("same EPD missed the cache")
	}
	// The same board reached through a repetition is another question: not served from cache.
	rep := `{"fen":"` + startFEN + `","moves":["g1f3","g8f6","f3g1","f6g8","g1f3"],"depth":12,"multipv":1}`
	first := `{"fen":"` + startFEN + `","moves":["g1f3"],"depth":12,"multipv":1}`
	decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", first, ""))
	if a = decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", rep, "")); a.Cached {
		t.Fatal("a repetition was answered from the plain position's cache entry")
	}
	// A movetime search is never cached.
	timed := `{"fen":"` + startFEN + `","movetime_ms":100}`
	decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", timed, ""))
	if a = decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", timed, "")); a.Cached {
		t.Fatal("movetime result was cached")
	}
}

func TestDefaults(t *testing.T) {
	eng := &fakeEngines{}
	srv := serve(t, eng, &mapStore{m: map[string][]byte{}})
	decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`"}`, ""))
	if req := eng.last.Load().(engine.Request); req.Depth != 18 || req.MultiPV != 3 || req.MovetimeMs != 0 {
		t.Fatalf("defaults %+v", req)
	}
}

// Checkmate and stalemate are answered without an engine.
func TestTerminalPositionNeedsNoEngine(t *testing.T) {
	eng := &fakeEngines{}
	srv := serve(t, eng, &mapStore{m: map[string][]byte{}})
	resp := post(t, srv.URL+"/v1/analysis/positions", `{"fen":"7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"}`, "")
	raw, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(raw), `"lines":[]`) || !strings.Contains(string(raw), `"bestmove":null`) || eng.calls.Load() != 0 {
		t.Fatalf("%s (engine calls %d)", raw, eng.calls.Load())
	}
}

func TestBadRequests(t *testing.T) {
	srv := serve(t, &fakeEngines{}, &mapStore{m: map[string][]byte{}})
	url := srv.URL + "/v1/analysis/positions"
	for name, c := range map[string]struct{ body, kind string }{
		"not json":           {`{`, "invalid-request"},
		"unknown field":      {`{"fen":"` + startFEN + `","colour":"w"}`, "invalid-request"},
		"two values":         {`{"fen":"` + startFEN + `"}{}`, "invalid-request"},
		"no fen":             {`{"depth":3}`, "invalid-request"},
		"depth and movetime": {`{"fen":"` + startFEN + `","depth":3,"movetime_ms":100}`, "invalid-request"},
		"depth too deep":     {`{"fen":"` + startFEN + `","depth":31}`, "invalid-request"},
		"movetime too short": {`{"fen":"` + startFEN + `","movetime_ms":10}`, "invalid-request"},
		"multipv 6":          {`{"fen":"` + startFEN + `","multipv":6}`, "invalid-request"},
		"move not uci":       {`{"fen":"` + startFEN + `","moves":["e4"]}`, "invalid-request"},
		"illegal move":       {`{"fen":"` + startFEN + `","moves":["e2e5"]}`, "invalid-position"},
		"no king":            {`{"fen":"8/8/8/8/8/8/8/4K3 w - - 0 1"}`, "invalid-position"},
		"moves null":         {`{"fen":"` + startFEN + `","moves":null}`, "invalid-request"},
		"depth null":         {`{"fen":"` + startFEN + `","depth":null}`, "invalid-request"},
		"multipv null":       {`{"fen":"` + startFEN + `","multipv":null}`, "invalid-request"},
		"depth not a number": {`{"fen":"` + startFEN + `","depth":"deep"}`, "invalid-request"},
	} {
		t.Run(name, func(t *testing.T) { expectProblem(t, post(t, url, c.body, ""), http.StatusBadRequest, c.kind) })
	}
	batch := srv.URL + "/v1/analysis/batch"
	expectProblem(t, post(t, batch, `{"positions":[]}`, ""), http.StatusBadRequest, "invalid-request")
	expectProblem(t, post(t, batch, `{"positions":[{"fen":"`+startFEN+`","moves":null}]}`, ""), http.StatusBadRequest, "invalid-request")
	p := expectProblem(t, post(t, batch, `{"positions":[{"fen":"`+startFEN+`"},{"fen":"bad"}]}`, ""),
		http.StatusBadRequest, "invalid-position")
	if !strings.HasPrefix(p.Detail, "position 1:") {
		t.Fatalf("detail %q should name the position", p.Detail)
	}
	resp := post(t, srv.URL+"/v1/nope", `{}`, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status %d", resp.StatusCode)
	}
}

func TestBusyAndUnavailable(t *testing.T) {
	for kind, err := range map[string]error{"engine-busy": pool.ErrBusy, "engine-unavailable": pool.ErrUnavailable} {
		srv := serve(t, &fakeEngines{err: err}, &mapStore{m: map[string][]byte{}})
		resp := post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`"}`, "")
		expectProblem(t, resp, http.StatusServiceUnavailable, kind)
		if resp.Header.Get("Retry-After") == "" {
			t.Fatalf("%s: no Retry-After", kind)
		}
		// Streaming asked for, but nothing streamed yet: still a plain problem with its status.
		expectProblem(t, post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`"}`, "text/event-stream"),
			http.StatusServiceUnavailable, kind)
	}
}

type event struct{ name, data string }

func readEvents(t *testing.T, resp *http.Response) []event {
	t.Helper()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	var out []event
	var cur event
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			cur.name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			cur.data = strings.TrimPrefix(line, "data: ")
		case line == "":
			out = append(out, cur)
			cur = event{}
		}
	}
	return out
}

func TestPositionStream(t *testing.T) {
	srv := serve(t, &fakeEngines{}, &mapStore{m: map[string][]byte{}})
	evs := readEvents(t, post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`","depth":9}`, "text/event-stream"))
	if len(evs) != 3 || evs[0].name != "info" || evs[1].name != "info" || evs[2].name != "result" {
		t.Fatalf("events %+v", evs)
	}
	var a analysis
	if err := json.Unmarshal([]byte(evs[2].data), &a); err != nil || a.Depth != 9 {
		t.Fatalf("result %s: %v", evs[2].data, err)
	}
}

func TestBatchJSONKeepsOrderAndStreamTagsIndex(t *testing.T) {
	srv := serve(t, &fakeEngines{}, &mapStore{m: map[string][]byte{}})
	body := `{"depth":5,"multipv":1,"positions":[{"fen":"` + startFEN + `"},{"fen":"` + startFEN + `","moves":["e2e4"]},{"fen":"7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"}]}`
	res := decode[struct{ Results []analysis }](t, post(t, srv.URL+"/v1/analysis/batch", body, ""))
	if len(res.Results) != 3 || res.Results[0].SideToMove != "w" || res.Results[1].SideToMove != "b" ||
		len(res.Results[2].Lines) != 0 || res.Results[0].Index != nil {
		t.Fatalf("%+v", res.Results)
	}

	evs := readEvents(t, post(t, srv.URL+"/v1/analysis/batch", body, "text/event-stream"))
	if len(evs) != 4 || evs[3].name != "done" {
		t.Fatalf("events %+v", evs)
	}
	var seen []int
	for _, e := range evs[:3] {
		var a analysis
		if err := json.Unmarshal([]byte(e.data), &a); err != nil || e.name != "result" || a.Index == nil {
			t.Fatalf("event %+v", e)
		}
		seen = append(seen, *a.Index)
	}
	sort.Ints(seen)
	if !slices.Equal(seen, []int{0, 1, 2}) {
		t.Fatalf("indexes %v", seen)
	}
}

func TestReadiness(t *testing.T) {
	store := &mapStore{m: map[string][]byte{}}
	srv := serve(t, &fakeEngines{}, store)
	get := func() int {
		resp, err := http.Get(srv.URL + "/health/ready")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if get() != http.StatusOK {
		t.Fatal("not ready")
	}
	store.down = true
	if get() != http.StatusServiceUnavailable {
		t.Fatal("ready with Redis down")
	}
}

// Through a real Redis, a repeated request is a cache hit answered in under 20 ms (p95 of 100).
func TestCacheHitIsFastOnRealRedis(t *testing.T) {
	ctx := context.Background()
	r, err := tcredis.Run(ctx, "redis:8.8.4-trixie")
	testcontainers.CleanupContainer(t, r)
	if err != nil {
		t.Fatal(err)
	}
	url, err := r.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	store, err := cache.New(url, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	eng := &fakeEngines{}
	srv := serve(t, eng, store)
	body := `{"fen":"` + startFEN + `","depth":14}`
	decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", body, ""))
	var took []time.Duration
	for range 100 {
		began := time.Now()
		a := decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", body, ""))
		took = append(took, time.Since(began))
		if !a.Cached {
			t.Fatal("miss")
		}
	}
	slices.Sort(took)
	if p95 := took[94]; p95 > 20*time.Millisecond {
		t.Fatalf("p95 %s", p95)
	}
	if eng.calls.Load() != 1 {
		t.Fatalf("engine calls %d", eng.calls.Load())
	}
}

// The real thing: Stockfish in the pool, JSON then a stream, from the start position.
func TestEndToEndWithStockfish(t *testing.T) {
	path := "/usr/local/bin/stockfish"
	if _, err := os.Stat(path); err != nil {
		t.Skip("no engine: run through `make check-svc S=analysis`")
	}
	p, err := pool.New(context.Background(), 2, 10, func(ctx context.Context) (pool.Searcher, error) {
		return engine.Start(ctx, path, engine.Options{Threads: 1, HashMB: 16})
	}, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	srv := serve(t, p, &mapStore{m: map[string][]byte{}})
	a := decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`","depth":8}`, ""))
	if a.Depth != 8 || len(a.Lines) != 3 || a.Bestmove == nil || a.Engine.Name != "Stockfish" {
		t.Fatalf("%+v", a)
	}
	evs := readEvents(t, post(t, srv.URL+"/v1/analysis/positions",
		`{"fen":"`+startFEN+`","moves":["e2e4"],"depth":10,"multipv":1}`, "text/event-stream"))
	if len(evs) < 2 || evs[len(evs)-1].name != "result" {
		t.Fatalf("events %+v", evs)
	}
}

// A search the time cap cut short is answered but never cached.
func TestCappedSearchIsNotCached(t *testing.T) {
	eng := &fakeEngines{capped: true}
	srv := serve(t, eng, &mapStore{m: map[string][]byte{}})
	body := `{"fen":"` + startFEN + `","depth":25}`
	decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", body, ""))
	if a := decode[analysis](t, post(t, srv.URL+"/v1/analysis/positions", body, "")); a.Cached || eng.calls.Load() != 2 {
		t.Fatalf("cached %v, engine calls %d", a.Cached, eng.calls.Load())
	}
}

func TestEngineRefusalIsABadPosition(t *testing.T) {
	srv := serve(t, &fakeEngines{err: engine.ErrRejected}, &mapStore{m: map[string][]byte{}})
	expectProblem(t, post(t, srv.URL+"/v1/analysis/positions", `{"fen":"`+startFEN+`"}`, ""),
		http.StatusBadRequest, "invalid-position")
}
