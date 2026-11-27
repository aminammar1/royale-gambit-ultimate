package explorer_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/explorer"
)

const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

const mastersAnswer = `{"white":10,"draws":20,"black":5,"opening":{"eco":"B00","name":"King's Pawn Game"},
"moves":[{"uci":"c7c5","san":"c5","averageRating":2396,"white":6,"draws":10,"black":4,"game":null},
{"uci":"e7e5","san":"e5","averageRating":null,"white":4,"draws":10,"black":1,"game":null}],
"topGames":[{"uci":"e7e5","id":"bjSF8DMw","winner":null,"black":{"name":"Carlsen, M.","rating":2839},"white":{"name":"Nakamura, Hi","rating":2816},"year":2025,"month":"2025-10"}]}`

type mapCache struct {
	mu sync.Mutex
	m  map[string][]byte
}

func (c *mapCache) Get(_ context.Context, k string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.m[k]
	return v, ok
}
func (c *mapCache) Set(_ context.Context, k string, v []byte, _ time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[k] = v
}

type tokens struct {
	token string
	err   error
}

func (t tokens) LichessToken(context.Context, uuid.UUID) (string, error) { return t.token, t.err }

func site(t *testing.T, hits *atomic.Int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		switch r.URL.Path {
		case "/masters":
			if r.URL.Query().Get("fen") != afterE4 || r.Header.Get("Authorization") != "" {
				t.Errorf("masters %s %v", r.URL, r.Header)
			}
			_, _ = w.Write([]byte(mastersAnswer))
		case "/lichess":
			if r.Header.Get("Authorization") != "Bearer lip_tok" || r.URL.Query().Get("speeds") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(mastersAnswer))
		case "/masters/pgn/bjSF8DMw":
			_, _ = w.Write([]byte("[White \"Nakamura, Hi\"]\n\n1. e4 e5 1/2-1/2\n"))
		case "/game/export/abcdEFGH":
			_, _ = w.Write([]byte("[White \"a\"]\n\n1. e4 1-0\n"))
		case "/busy":
		default:
			http.NotFound(w, r)
		}
	}))
}

func explorerFor(srv *httptest.Server, tok tokens) (*explorer.Explorer, *mapCache) {
	c := &mapCache{m: map[string][]byte{}}
	return &explorer.Explorer{Base: srv.URL, Lichess: srv.URL, UserAgent: "test", Tokens: tok, Cache: c}, c
}

func TestMastersIsReshapedAndCached(t *testing.T) {
	var hits atomic.Int32
	srv := site(t, &hits)
	defer srv.Close()
	e, _ := explorerFor(srv, tokens{})
	user := uuid.Must(uuid.NewV7())
	r, cached, err := e.Explore(context.Background(), "masters", afterE4, user)
	if err != nil || cached {
		t.Fatal(err, cached)
	}
	if r.DB != "masters" || r.White != 10 || r.Draws != 20 || r.Black != 5 || r.Opening == nil || r.Opening.ECO != "B00" {
		t.Fatalf("%+v", r)
	}
	if len(r.Moves) != 2 || r.Moves[0].SAN != "c5" || *r.Moves[0].AverageRating != 2396 || r.Moves[1].AverageRating != nil {
		t.Fatalf("moves %+v", r.Moves)
	}
	g := r.TopGames[0]
	if g.ID != "bjSF8DMw" || g.White.Name != "Nakamura, Hi" || *g.Black.Rating != 2839 || g.Winner != nil || *g.Year != 2025 || g.UCI != "e7e5" {
		t.Fatalf("top game %+v", g)
	}
	if _, cached, _ := e.Explore(context.Background(), "masters", afterE4, user); !cached || hits.Load() != 1 {
		t.Fatalf("second ask: cached %v, %d requests", cached, hits.Load())
	}
}

func TestLichessNeedsThePlayersToken(t *testing.T) {
	var hits atomic.Int32
	srv := site(t, &hits)
	defer srv.Close()
	e, _ := explorerFor(srv, tokens{err: explorer.ErrNoToken})
	if _, _, err := e.Explore(context.Background(), "lichess", afterE4, uuid.Must(uuid.NewV7())); !errors.Is(err, explorer.ErrLichessNeeded) {
		t.Fatalf("want ErrLichessNeeded, got %v", err)
	}
	e, _ = explorerFor(srv, tokens{token: "lip_tok"})
	if r, _, err := e.Explore(context.Background(), "lichess", afterE4, uuid.Must(uuid.NewV7())); err != nil || r.DB != "lichess" {
		t.Fatalf("%+v %v", r, err)
	}
	// A token Lichess refuses (revoked) is the same as none.
	e, _ = explorerFor(srv, tokens{token: "revoked"})
	if _, _, err := e.Explore(context.Background(), "lichess", "8/8/8/8/8/8/8/K6k w - - 0 1", uuid.Must(uuid.NewV7())); !errors.Is(err, explorer.ErrLichessNeeded) {
		t.Fatalf("revoked: %v", err)
	}
}

func TestBusySiteIsUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()
	e, _ := explorerFor(srv, tokens{})
	if _, _, err := e.Explore(context.Background(), "masters", afterE4, uuid.Nil); !errors.Is(err, explorer.ErrUnavailable) {
		t.Fatalf("want ErrUnavailable, got %v", err)
	}
}

func TestTopGamePGN(t *testing.T) {
	var hits atomic.Int32
	srv := site(t, &hits)
	defer srv.Close()
	e, _ := explorerFor(srv, tokens{})
	for db, id := range map[string]string{"masters": "bjSF8DMw", "lichess": "abcdEFGH"} {
		pgn, err := e.GamePGN(context.Background(), db, id)
		if err != nil || pgn == "" {
			t.Fatalf("%s: %q %v", db, pgn, err)
		}
	}
	if _, err := e.GamePGN(context.Background(), "masters", "zzzzzzzz"); !errors.Is(err, explorer.ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}
