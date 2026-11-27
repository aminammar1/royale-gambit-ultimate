package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
)

var db *store.Store

func TestMain(m *testing.M) {
	ctx := context.Background()
	pg, err := tcpostgres.Run(ctx, "postgres:19.0-trixie",
		tcpostgres.WithDatabase("games"), tcpostgres.WithUsername("games"), tcpostgres.WithPassword("games"),
		tcpostgres.BasicWaitStrategies())
	if err != nil {
		fmt.Println("postgres:", err)
		os.Exit(1)
	}
	url, _ := pg.ConnectionString(ctx, "sslmode=disable")
	if err := store.Migrate(url); err != nil {
		fmt.Println("migrate:", err)
		os.Exit(1)
	}
	if db, err = store.Open(ctx, url); err != nil {
		fmt.Println("open:", err)
		os.Exit(1)
	}
	code := m.Run()
	db.Close()
	_ = testcontainers.TerminateContainer(pg)
	os.Exit(code)
}

func games(t *testing.T, texts ...string) []*pgn.Game {
	t.Helper()
	var out []*pgn.Game
	for _, text := range texts {
		g, err := pgn.One(text)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, g)
	}
	return out
}

func pgnOf(white, black, result, date, moves string) string {
	return fmt.Sprintf("[White %q]\n[Black %q]\n[Result %q]\n[UTCDate %q]\n[UTCTime \"12:00:00\"]\n\n%s %s\n",
		white, black, result, date, moves, result)
}

// validEvent checks an outbox envelope and its data against contracts/events.
func validEvent(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	dir := os.Getenv("CONTRACTS_DIR")
	if dir == "" {
		dir = "/contracts"
	}
	var env map[string]any
	if err := json.Unmarshal(raw, &env); err != nil {
		t.Fatal(err)
	}
	c := jsonschema.NewCompiler()
	c.AssertFormat()
	for _, name := range []string{"envelope", env["type"].(string)} {
		s, err := c.Compile(filepath.Join(dir, "events", name+".schema.json"))
		if err != nil {
			t.Fatal(err)
		}
		v := any(env)
		if name != "envelope" {
			v = env["data"]
		}
		// Round-trip through JSON so numbers are what the validator expects.
		b, _ := json.Marshal(v)
		inst, _ := jsonschema.UnmarshalJSON(strings.NewReader(string(b)))
		if err := s.Validate(inst); err != nil {
			t.Fatalf("%s does not match its schema: %v\n%s", name, err, raw)
		}
	}
	return env
}

func TestSaveCountsDuplicatesAndWritesEvents(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	a := pgnOf("Alice", "Bob", "1-0", "2025.01.01", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6")
	b := pgnOf("Bob", "Alice", "0-1", "2025.01.02", "1. d4 d5")

	first, err := db.SaveGames(ctx, owner, "pgn", nil, games(t, a, b))
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Saved) != 2 || first.Duplicates != 0 {
		t.Fatalf("first save %+v", first)
	}
	if first.Saved[0].Opening == nil || !strings.Contains(*first.Saved[0].Opening, "Ruy Lopez") {
		t.Fatalf("opening %v", first.Saved[0].Opening)
	}
	again, err := db.SaveGames(ctx, owner, "pgn", nil, games(t, a))
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Saved) != 0 || again.Duplicates != 1 {
		t.Fatalf("second save %+v", again)
	}
	// The same game is another player's own copy, not a duplicate.
	other, err := db.SaveGames(ctx, uuid.Must(uuid.NewV7()), "pgn", nil, games(t, a))
	if err != nil || len(other.Saved) != 1 {
		t.Fatalf("other owner %+v %v", other, err)
	}

	pending, err := db.Unpublished(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range pending {
		env := validEvent(t, e.Envelope)
		data := env["data"].(map[string]any)
		if env["type"] == "game.saved" && data["user_id"] == owner.String() {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("want 2 game.saved events for the owner, got %d", n)
	}
}

func TestSearchFiltersAndPages(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	_, err := db.SaveGames(ctx, owner, "pgn", nil, games(t,
		pgnOf("kingside_tal", "Guest", "1-0", "2025.03.01", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"),
		pgnOf("Guest", "kingside_tal", "1/2-1/2", "2025.03.02", "1. e4 c5 2. Nf3 d6"),
		pgnOf("kingside_tal", "Guest", "0-1", "2025.03.03", "1. d4 d5 2. c4 e6"),
		pgnOf("Guest", "Kingside_Tal", "0-1", "2025.03.04", "1. e4 e6 2. d4 d5"),
		pgnOf("Someone", "Else", "1-0", "2025.03.05", "1. c4 e5"),
	))
	if err != nil {
		t.Fatal(err)
	}
	all, next, err := db.Search(ctx, owner, store.Filter{Limit: 50})
	if err != nil || len(all) != 5 || next != "" {
		t.Fatalf("all %d next %q %v", len(all), next, err)
	}
	if all[0].White != "Someone" {
		t.Fatalf("newest first: got %s first", all[0].White)
	}
	cases := []struct {
		name string
		f    store.Filter
		want int
	}{
		{"player, any case", store.Filter{Player: "KINGSIDE_TAL"}, 4},
		{"wins", store.Filter{Player: "kingside_tal", Result: "win"}, 2},
		{"losses", store.Filter{Player: "kingside_tal", Result: "loss"}, 1},
		{"draws", store.Filter{Player: "kingside_tal", Result: "draw"}, 1},
		{"as black", store.Filter{Player: "kingside_tal", Color: "black"}, 2},
		{"eco letter: the Ruy Lopez and the French", store.Filter{ECO: "C"}, 2},
		{"words", store.Filter{Q: "sicilian"}, 1},
		{"words in two fields", store.Filter{Q: "tal ruy"}, 1},
		{"source", store.Filter{Source: "lichess"}, 0},
		{"dates", store.Filter{From: day(t, "2025-03-02"), To: day(t, "2025-03-03")}, 2},
	}
	for _, c := range cases {
		c.f.Limit = 50
		got, _, err := db.Search(ctx, owner, c.f)
		if err != nil || len(got) != c.want {
			t.Errorf("%s: got %d, want %d (%v)", c.name, len(got), c.want, err)
		}
	}
	// Pages of two, newest first, never repeating a game.
	seen := map[uuid.UUID]bool{}
	cursor := ""
	for page := 0; page < 3; page++ {
		got, nextCursor, err := db.Search(ctx, owner, store.Filter{Limit: 2, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		for _, g := range got {
			if seen[g.ID] {
				t.Fatalf("game %s twice", g.ID)
			}
			seen[g.ID] = true
		}
		cursor = nextCursor
	}
	if len(seen) != 5 || cursor != "" {
		t.Fatalf("paged %d games, last cursor %q", len(seen), cursor)
	}
	if _, _, err := db.Search(ctx, owner, store.Filter{Limit: 2, Cursor: "garbage"}); !errors.Is(err, store.ErrBadCursor) {
		t.Fatalf("want ErrBadCursor, got %v", err)
	}
}

func day(t *testing.T, s string) *time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return &d
}

func TestGetIsOwnersOnly(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	res, err := db.SaveGames(ctx, owner, "pgn", nil, games(t, pgnOf("A", "B", "1-0", "2025.01.01", "1. e4 e5")))
	if err != nil {
		t.Fatal(err)
	}
	g, err := db.Get(ctx, owner, res.Saved[0].ID)
	if err != nil || !strings.Contains(g.PGN, "1. e4 e5") {
		t.Fatalf("get %+v %v", g, err)
	}
	if _, err := db.Get(ctx, uuid.Must(uuid.NewV7()), res.Saved[0].ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("another owner: want ErrNotFound, got %v", err)
	}
}

func TestImportLifecycle(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, created, err := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 100)
	if err != nil || !created || job.Status != "queued" {
		t.Fatalf("create %+v %v %v", job, created, err)
	}
	// The same import, any case, while it is live: the same job back.
	same, created, err := db.CreateImport(ctx, owner, "lichess", "drnykterstein", 100)
	if err != nil || created || same.ID != job.ID {
		t.Fatalf("again %+v %v %v", same, created, err)
	}
	ok, err := db.StartImport(ctx, job.ID)
	if err != nil || !ok {
		t.Fatalf("start %v %v", ok, err)
	}
	if ok, _ := db.StartImport(ctx, job.ID); ok {
		t.Fatal("a running import started twice")
	}
	if err := db.ImportProgress(ctx, job.ID, 10, 8, 2); err != nil {
		t.Fatal(err)
	}
	if err := db.FinishImport(ctx, job.ID, "done", ""); err != nil {
		t.Fatal(err)
	}
	got, err := db.GetImport(ctx, owner, job.ID)
	if err != nil || got.Status != "done" || got.Fetched != 10 || got.Saved != 8 || got.Duplicates != 2 || got.FinishedAt == nil {
		t.Fatalf("finished %+v %v", got, err)
	}
	if _, err := db.GetImport(ctx, uuid.Must(uuid.NewV7()), job.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("another owner: want ErrNotFound, got %v", err)
	}
	// Once finished, the same username may be imported again.
	if _, created, err := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 100); err != nil || !created {
		t.Fatalf("re-import %v %v", created, err)
	}

	pending, err := db.Unpublished(ctx, 1000)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]int{}
	for _, e := range pending {
		env := validEvent(t, e.Envelope)
		if env["data"].(map[string]any)["user_id"] == owner.String() {
			kinds[e.Type]++
		}
	}
	if kinds["import.requested"] != 2 || kinds["game.imported"] != 1 {
		t.Fatalf("events %v", kinds)
	}
	ids := make([]uuid.UUID, 0, len(pending))
	for _, e := range pending {
		ids = append(ids, e.ID)
	}
	if err := db.MarkPublished(ctx, ids); err != nil {
		t.Fatal(err)
	}
	if left, _ := db.Unpublished(ctx, 1000); len(left) != 0 {
		t.Fatalf("%d events still unpublished", len(left))
	}
}

func TestProcessedOnce(t *testing.T) {
	ctx := context.Background()
	id := uuid.Must(uuid.NewV7())
	first, err := db.MarkProcessed(ctx, id)
	if err != nil || !first {
		t.Fatalf("first %v %v", first, err)
	}
	if again, _ := db.MarkProcessed(ctx, id); again {
		t.Fatal("an event handled twice")
	}
}

// Found by the code review, 2026-11-28.

func TestAStuckImportNeverBlocksTheUsername(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, err := db.CreateImport(ctx, owner, "lichess", "stuck_player", 10)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := db.StartImport(ctx, job.ID); !ok {
		t.Fatal("not started")
	}
	// Still fresh: the same import comes back, and it is not stale.
	if again, created, _ := db.CreateImport(ctx, owner, "lichess", "stuck_player", 10); created || again.ID != job.ID {
		t.Fatal("a fresh live import was replaced")
	}
	if ended, _ := db.ExpireIfStale(ctx, job.ID); ended {
		t.Fatal("a fresh import was ended")
	}
	// Its worker died long ago: no progress for longer than StaleAfter.
	if err := db.Backdate(ctx, job.ID, store.StaleAfter+time.Minute); err != nil {
		t.Fatal(err)
	}
	next, created, err := db.CreateImport(ctx, owner, "lichess", "stuck_player", 10)
	if err != nil || !created || next.ID == job.ID {
		t.Fatalf("a new import: %v %v %v", next.ID, created, err)
	}
	old, _ := db.GetImport(ctx, owner, job.ID)
	if old.Status != "failed" || old.Error == nil || !strings.Contains(*old.Error, "stopped") {
		t.Fatalf("the stuck import: %+v", old)
	}
	// The stream's check ends one the same way.
	if err := db.Backdate(ctx, next.ID, store.StaleAfter+time.Minute); err != nil {
		t.Fatal(err)
	}
	if ended, err := db.ExpireIfStale(ctx, next.ID); err != nil || !ended {
		t.Fatalf("expire: %v %v", ended, err)
	}
}

func TestAtMostThreeLiveImports(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	for _, name := range []string{"one", "two", "three"} {
		if _, created, err := db.CreateImport(ctx, owner, "chesscom", name, 10); err != nil || !created {
			t.Fatalf("%s: %v %v", name, created, err)
		}
	}
	if _, _, err := db.CreateImport(ctx, owner, "chesscom", "four", 10); !errors.Is(err, store.ErrTooManyImports) {
		t.Fatalf("a fourth: want ErrTooManyImports, got %v", err)
	}
	// Asking again for one already live is not a new import.
	if _, created, err := db.CreateImport(ctx, owner, "chesscom", "two", 10); err != nil || created {
		t.Fatalf("again: %v %v", created, err)
	}
	// Someone else is not limited by you.
	if _, _, err := db.CreateImport(ctx, uuid.Must(uuid.NewV7()), "chesscom", "four", 10); err != nil {
		t.Fatal(err)
	}
}

func TestProcessedIsRead(t *testing.T) {
	ctx := context.Background()
	id := uuid.Must(uuid.NewV7())
	if done, _ := db.Processed(ctx, id); done {
		t.Fatal("processed before handling")
	}
	_, _ = db.MarkProcessed(ctx, id)
	if done, _ := db.Processed(ctx, id); !done {
		t.Fatal("not processed after handling")
	}
}
