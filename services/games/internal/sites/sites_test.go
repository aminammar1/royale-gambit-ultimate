package sites_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/sites"
)

const ua = "RoyaleGambitUltimate/test (+https://github.com/aminammar1/royale-gambit-ultimate)"

func game(n int) string {
	return fmt.Sprintf("[White \"w%d\"]\n[Black \"b%d\"]\n\n1. e4 e5 1-0\n", n, n)
}

func collect(t *testing.T, f sites.Fetcher, user string, max int) ([]string, error) {
	t.Helper()
	var got []string
	err := f.Fetch(context.Background(), user, max, func(pgn string) error {
		got = append(got, pgn)
		return nil
	})
	return got, err
}

func noWait(context.Context, time.Duration) error { return nil }

func TestLichessStreamsStandardGames(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/games/user/alice" || r.URL.Query().Get("max") != "3" || r.URL.Query().Get("pgnInJson") != "true" {
			t.Errorf("unexpected request %s", r.URL)
		}
		if r.Header.Get("User-Agent") != ua || r.Header.Get("Accept") != "application/x-ndjson" {
			t.Errorf("headers %v", r.Header)
		}
		for i, v := range []string{"standard", "chess960", "standard", "fromPosition"} {
			_ = json.NewEncoder(w).Encode(map[string]any{"id": fmt.Sprint(i), "variant": v, "pgn": game(i)})
		}
	}))
	defer srv.Close()
	got, err := collect(t, &sites.Lichess{Base: srv.URL, UserAgent: ua, Wait: noWait}, "alice", 3)
	if err != nil {
		t.Fatal(err)
	}
	// Chess960 is not standard chess; a standard game from a set position is.
	if len(got) != 3 || !strings.Contains(got[0], "w0") || !strings.Contains(got[1], "w2") || !strings.Contains(got[2], "w3") {
		t.Fatalf("got %q", got)
	}
}

func TestLichessUnknownPlayer(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()
	_, err := collect(t, &sites.Lichess{Base: srv.URL, UserAgent: ua, Wait: noWait}, "nobody", 10)
	if !errors.Is(err, sites.ErrNoSuchPlayer) {
		t.Fatalf("want ErrNoSuchPlayer, got %v", err)
	}
}

func TestLichessWaitsOnRateLimit(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "x", "variant": "standard", "pgn": game(1)})
	}))
	defer srv.Close()
	var waited time.Duration
	l := &sites.Lichess{Base: srv.URL, UserAgent: ua, Wait: func(_ context.Context, d time.Duration) error { waited += d; return nil }}
	got, err := collect(t, l, "alice", 10)
	if err != nil || len(got) != 1 {
		t.Fatalf("got %d games, err %v", len(got), err)
	}
	// Lichess asks for a full minute after a 429.
	if waited != time.Minute {
		t.Fatalf("waited %v", waited)
	}
}

func TestLichessGivesUpAfterRepeatedRateLimits(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()
	_, err := collect(t, &sites.Lichess{Base: srv.URL, UserAgent: ua, Wait: noWait}, "alice", 10)
	if !errors.Is(err, sites.ErrRateLimited) {
		t.Fatalf("want ErrRateLimited, got %v", err)
	}
}

func chessCom(t *testing.T) *httptest.Server {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != ua {
			t.Errorf("user agent %q", r.Header.Get("User-Agent"))
		}
		switch r.URL.Path {
		case "/pub/player/carol/games/archives":
			_ = json.NewEncoder(w).Encode(map[string]any{"archives": []string{
				srv.URL + "/pub/player/carol/games/2024/12",
				srv.URL + "/pub/player/carol/games/2025/01",
				"https://evil.example/pub/player/carol/games/2025/02", // never followed
			}})
		case "/pub/player/carol/games/2025/01":
			_ = json.NewEncoder(w).Encode(map[string]any{"games": []map[string]any{
				{"rules": "chess", "pgn": game(1)},
				{"rules": "chess960", "pgn": game(2)},
				{"rules": "chess", "pgn": game(3)},
			}})
		case "/pub/player/carol/games/2024/12":
			_ = json.NewEncoder(w).Encode(map[string]any{"games": []map[string]any{
				{"rules": "chess", "pgn": game(4)},
				{"rules": "chess", "pgn": game(5)},
			}})
		default:
			http.NotFound(w, r)
		}
	}))
	return srv
}

func TestChessComNewestMonthFirstNewestGameFirst(t *testing.T) {
	srv := chessCom(t)
	defer srv.Close()
	got, err := collect(t, &sites.ChessCom{Base: srv.URL, UserAgent: ua, Wait: noWait}, "Carol", 3)
	if err != nil {
		t.Fatal(err)
	}
	// January (3, then 1; 2 is Chess960), then December's newest (5); the cap stops there.
	want := []string{"w3", "w1", "w5"}
	if len(got) != len(want) {
		t.Fatalf("got %q", got)
	}
	for i := range want {
		if !strings.Contains(got[i], want[i]) {
			t.Fatalf("game %d is %q, want %s", i, got[i], want[i])
		}
	}
}

func TestChessComUnknownPlayer(t *testing.T) {
	srv := chessCom(t)
	defer srv.Close()
	_, err := collect(t, &sites.ChessCom{Base: srv.URL, UserAgent: ua, Wait: noWait}, "nobody", 10)
	if !errors.Is(err, sites.ErrNoSuchPlayer) {
		t.Fatalf("want ErrNoSuchPlayer, got %v", err)
	}
}

func TestStopsWhenTheCallerSaysSo(t *testing.T) {
	srv := chessCom(t)
	defer srv.Close()
	stop := errors.New("stop")
	n := 0
	err := (&sites.ChessCom{Base: srv.URL, UserAgent: ua, Wait: noWait}).Fetch(context.Background(), "carol", 10,
		func(string) error { n++; return stop })
	if !errors.Is(err, stop) || n != 1 {
		t.Fatalf("n %d err %v", n, err)
	}
}
