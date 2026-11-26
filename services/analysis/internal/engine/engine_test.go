package engine_test

import (
	"context"
	"errors"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/position"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

// These tests run the real Stockfish that the Dockerfile puts in the toolchain image.
func start(t *testing.T) *engine.Engine {
	t.Helper()
	path := os.Getenv("ENGINE_PATH")
	if path == "" {
		path = "/usr/local/bin/stockfish"
	}
	if _, err := os.Stat(path); err != nil {
		t.Skipf("no engine at %s: run through `make check-svc S=analysis`", path)
	}
	e, err := engine.Start(context.Background(), path, engine.Options{Threads: 1, HashMB: 16, Reply: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = e.Close() })
	return e
}

func request(t *testing.T, fen string, moves []string, depth, multipv int) engine.Request {
	t.Helper()
	p, err := position.Resolve(fen, moves)
	if err != nil {
		t.Fatal(err)
	}
	return engine.Request{FEN: p.StartFEN, Moves: p.Moves, SideToMove: p.SideToMove, Depth: depth, MultiPV: multipv}
}

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

func TestIdentifiesItself(t *testing.T) {
	e := start(t)
	if id := e.ID(); id.Name != "Stockfish" || id.Version == "" {
		t.Fatalf("id %+v", id)
	}
}

func TestStartPositionThreeLines(t *testing.T) {
	e := start(t)
	var infos int
	last := map[int]uci.Line{}
	res, err := e.Search(context.Background(), request(t, startFEN, nil, 10, 3), func(l uci.Line) {
		infos++
		last[l.MultiPV] = l
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Lines) != 3 || res.Depth != 10 || infos == 0 {
		t.Fatalf("lines %d depth %d infos %d", len(res.Lines), res.Depth, infos)
	}
	for i, l := range res.Lines {
		if l.MultiPV != i+1 || len(l.PV) == 0 || l.Score.CP == nil || len(l.WDL) != 3 {
			t.Fatalf("line %d: %+v", i, l)
		}
	}
	// The last info reported for each line is the line in the result.
	for _, l := range res.Lines {
		if got := last[l.MultiPV]; got.Depth != l.Depth || !slices.Equal(got.PV, l.PV) {
			t.Fatalf("last info for line %d: %+v, result %+v", l.MultiPV, got, l)
		}
	}
	// The best move must be legal in the position, and be the first move of line 1.
	if _, err := position.Resolve(startFEN, []string{res.Bestmove}); err != nil {
		t.Fatalf("bestmove %q: %v", res.Bestmove, err)
	}
	if res.Lines[0].PV[0] != res.Bestmove {
		t.Fatalf("bestmove %s, line 1 starts %s", res.Bestmove, res.Lines[0].PV[0])
	}
}

// White is a queen up in both positions; only the side to move differs. White's view must say
// "White is winning" either way.
func TestScoresAreFromWhitesView(t *testing.T) {
	e := start(t)
	for _, fen := range []string{
		"4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
		"4k3/8/8/8/8/8/8/3QK3 b - - 0 1",
	} {
		res, err := e.Search(context.Background(), request(t, fen, nil, 8, 1), nil)
		if err != nil {
			t.Fatal(err)
		}
		s := res.Lines[0].Score
		if (s.CP == nil || *s.CP < 500) && (s.Mate == nil || *s.Mate <= 0) {
			t.Fatalf("%s: score %+v is not winning for White", fen, s)
		}
		if w := res.Lines[0].WDL; w[0] < w[2] {
			t.Fatalf("%s: wdl %v not in White's favour", fen, w)
		}
	}
}

func TestMateForBlackIsNegative(t *testing.T) {
	e := start(t)
	// Black to move mates at once with Qh4# (the fool's mate, one move early).
	res, err := e.Search(context.Background(), request(t, startFEN, []string{"f2f3", "e7e5", "g2g4"}, 6, 1), nil)
	if err != nil {
		t.Fatal(err)
	}
	if m := res.Lines[0].Score.Mate; m == nil || *m != -1 {
		t.Fatalf("score %+v, want mate -1", res.Lines[0].Score)
	}
	if res.Bestmove != "d8h4" {
		t.Fatalf("bestmove %s", res.Bestmove)
	}
}

// Stop, wait for bestmove, and the engine serves the next search normally (ENGINE.md, step 5).
func TestCancelStopsAndEngineStaysUsable(t *testing.T) {
	e := start(t)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	began := time.Now()
	_, err := e.Search(ctx, request(t, startFEN, nil, 30, 3), nil)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want deadline error, got %v", err)
	}
	if d := time.Since(began); d > 3*time.Second {
		t.Fatalf("stop took %s", d)
	}
	res, err := e.Search(context.Background(), request(t, startFEN, []string{"e2e4"}, 6, 1), nil)
	if err != nil || res.Bestmove == "" {
		t.Fatalf("next search: %v %+v", err, res)
	}
}

func TestCrashIsReported(t *testing.T) {
	e := start(t)
	go func() {
		time.Sleep(100 * time.Millisecond)
		_ = e.Kill()
	}()
	_, err := e.Search(context.Background(), request(t, startFEN, nil, 30, 1), nil)
	if !errors.Is(err, engine.ErrDied) {
		t.Fatalf("want ErrDied, got %v", err)
	}
}

// Close reaps the process: no zombie is left, also after a crash.
func TestCloseLeavesNoProcess(t *testing.T) {
	e := start(t)
	if err := e.Close(); err != nil {
		t.Fatal(err)
	}
	if !e.Exited() {
		t.Fatal("process not reaped")
	}
	if err := e.Close(); err != nil {
		t.Fatal(err)
	}

	crashed := start(t)
	_ = crashed.Kill()
	if err := crashed.Close(); err != nil {
		t.Fatal(err)
	}
	if !crashed.Exited() {
		t.Fatal("crashed process not reaped")
	}
}

func TestTerminalPositionHasNoBestmove(t *testing.T) {
	e := start(t)
	res, err := e.Search(context.Background(),
		engine.Request{FEN: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", SideToMove: 'b', Depth: 4, MultiPV: 1}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.Bestmove != "" || len(res.Lines) != 0 {
		t.Fatalf("%+v", res)
	}
}

// A depth search with a time cap stops at the cap and still answers, from the depth it reached.
func TestTimeCapEndsADeepSearch(t *testing.T) {
	e := start(t)
	r := request(t, startFEN, nil, 30, 1)
	r.LimitMs = 300
	began := time.Now()
	res, err := e.Search(context.Background(), r, nil)
	if err != nil {
		t.Fatal(err)
	}
	if d := time.Since(began); d > 3*time.Second {
		t.Fatalf("cap ignored: %s", d)
	}
	if res.Bestmove == "" || res.Depth < 1 || res.Depth >= 30 || !res.Capped {
		t.Fatalf("%+v", res)
	}
	full, err := e.Search(context.Background(), request(t, startFEN, nil, 6, 1), nil)
	if err != nil || full.Capped {
		t.Fatalf("an uncapped search reads as capped: %v %+v", err, full)
	}
}

// A position the engine refuses ends as ErrRejected (the caller's fault), not ErrDied.
func TestRefusedPositionIsRejected(t *testing.T) {
	e := start(t)
	// Nine white pawns: package position refuses this; sent raw, Stockfish exits on it.
	_, err := e.Search(context.Background(),
		engine.Request{FEN: "4k3/8/8/8/P7/8/PPPPPPPP/4K3 w - - 0 1", SideToMove: 'w', Depth: 4, MultiPV: 1}, nil)
	if !errors.Is(err, engine.ErrRejected) {
		t.Fatalf("want ErrRejected, got %v", err)
	}
}
