package importer_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/importer"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/sites"
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
		fmt.Println(err)
		os.Exit(1)
	}
	if db, err = store.Open(ctx, url); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	code := m.Run()
	db.Close()
	_ = testcontainers.TerminateContainer(pg)
	os.Exit(code)
}

// site is a fake site that hands out the games it holds, or fails.
type site struct {
	games []string
	err   error
}

func (s site) Fetch(_ context.Context, _ string, max int, emit func(string) error) error {
	if s.err != nil {
		return s.err
	}
	for i, g := range s.games {
		if i == max {
			break
		}
		if err := emit(g); err != nil {
			return err
		}
	}
	return nil
}

func lichessGame(id, moves string) string {
	return fmt.Sprintf("[Site \"https://lichess.org/%s\"]\n[White \"DrNykterstein\"]\n[Black \"opp\"]\n[Result \"1-0\"]\n\n%s 1-0\n", id, moves)
}

func worker(s sites.Fetcher) *importer.Worker {
	return &importer.Worker{
		Store: db, Sites: map[string]sites.Fetcher{"lichess": s, "chesscom": s},
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Batch: 2,
	}
}

func TestImportSavesNewGamesAndCountsDuplicates(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	// One game is already in the library.
	have, err := pgn.One(lichessGame("aaaaaaaa", "1. e4 e5"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.SaveGames(ctx, owner, "lichess", nil, []*pgn.Game{have}); err != nil {
		t.Fatal(err)
	}
	job, _, err := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 10)
	if err != nil {
		t.Fatal(err)
	}
	s := site{games: []string{
		lichessGame("aaaaaaaa", "1. e4 e5"),
		lichessGame("bbbbbbbb", "1. d4 d5"),
		"not a game at all",
		lichessGame("cccccccc", "1. c4 e5"),
	}}
	if err := worker(s).Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: false}); err != nil {
		t.Fatal(err)
	}
	got, err := db.GetImport(ctx, owner, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Four read; two new, one already there; the unreadable one is neither.
	if got.Status != "done" || got.Fetched != 4 || got.Saved != 2 || got.Duplicates != 1 {
		t.Fatalf("job %+v", got)
	}
	list, _, err := db.Search(ctx, owner, store.Filter{Source: "lichess", Limit: 50})
	if err != nil || len(list) != 3 {
		t.Fatalf("library %d %v", len(list), err)
	}
}

func TestUnknownPlayerFailsInWords(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, owner, "chesscom", "nobody", 10)
	if err := worker(site{err: sites.ErrNoSuchPlayer}).Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: false}); err != nil {
		t.Fatal(err)
	}
	got, _ := db.GetImport(ctx, owner, job.ID)
	if got.Status != "failed" || got.Error == nil || !strings.Contains(*got.Error, "No player named nobody on Chess.com") {
		t.Fatalf("job %+v error %v", got, got.Error)
	}
}

func TestFinishedImportIsNotRunAgain(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 10)
	event := uuid.Must(uuid.NewV7())
	w := worker(site{games: []string{lichessGame("dddddddd", "1. e4 c5")}})
	if err := w.Run(ctx, importer.Task{EventID: event, JobID: job.ID, Retry: false}); err != nil {
		t.Fatal(err)
	}
	// The same event delivered again, as at-least-once delivery allows.
	w.Sites["lichess"] = site{games: []string{lichessGame("eeeeeeee", "1. e4 e6")}}
	if err := w.Run(ctx, importer.Task{EventID: event, JobID: job.ID, Retry: true}); err != nil {
		t.Fatal(err)
	}
	got, _ := db.GetImport(ctx, owner, job.ID)
	if got.Saved != 1 {
		t.Fatalf("saved %d, want 1: the redelivery imported again", got.Saved)
	}
}

func TestInterruptedImportResumesOnRetry(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 10)
	// A worker started it and died.
	if ok, err := db.StartImport(ctx, job.ID); err != nil || !ok {
		t.Fatal(ok, err)
	}
	w := worker(site{games: []string{lichessGame("ffffffff", "1. Nf3 d5")}})
	// A first copy of the event (not a retry) leaves a running import to whoever runs it.
	if err := w.Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: false}); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.GetImport(ctx, owner, job.ID); got.Status != "running" {
		t.Fatalf("status %s", got.Status)
	}
	// The retry of the dead worker's message picks it up.
	if err := w.Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: true}); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.GetImport(ctx, owner, job.ID); got.Status != "done" || got.Saved != 1 {
		t.Fatalf("job %+v", got)
	}
}

func TestSiteTroubleEndsTheJobInWords(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 10)
	if err := worker(site{err: fmt.Errorf("the site answered 502 Bad Gateway")}).Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: false}); err != nil {
		t.Fatal(err)
	}
	got, _ := db.GetImport(ctx, owner, job.ID)
	if got.Status != "failed" || got.Error == nil || !strings.Contains(*got.Error, "Lichess could not be read") {
		t.Fatalf("job %+v", got)
	}
}

// Found by the code review, 2026-11-28.

// blocking is a site that never answers until the import's context ends.
type blocking struct{}

func (blocking) Fetch(ctx context.Context, _ string, _ int, _ func(string) error) error {
	<-ctx.Done()
	return ctx.Err()
}

func TestTheLastTryEndsTheImportAsFailed(t *testing.T) {
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(context.Background(), owner, "lichess", "DrNykterstein", 10)
	w := worker(blocking{})
	// A try that is not the last leaves the import to be tried again.
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	err := w.Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID})
	cancel()
	if err == nil {
		t.Fatal("a stopped import must ask for a retry")
	}
	if got, _ := db.GetImport(context.Background(), owner, job.ID); got.Status != "running" {
		t.Fatalf("status %s", got.Status)
	}
	// The last one may not leave it running: nothing would ever end it.
	ctx, cancel = context.WithTimeout(context.Background(), 200*time.Millisecond)
	err = w.Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID, Retry: true, Last: true})
	cancel()
	if err != nil {
		t.Fatalf("the last try ended it, so no error: %v", err)
	}
	got, _ := db.GetImport(context.Background(), owner, job.ID)
	if got.Status != "failed" || got.Error == nil || !strings.Contains(*got.Error, "Lichess could not be read") {
		t.Fatalf("job %+v", got)
	}
}

// counting is a site that records how many fetches run at once.
type counting struct {
	now, most atomic.Int32
	mu        sync.Mutex
}

func (c *counting) Fetch(_ context.Context, _ string, _ int, emit func(string) error) error {
	n := c.now.Add(1)
	defer c.now.Add(-1)
	c.mu.Lock()
	if n > c.most.Load() {
		c.most.Store(n)
	}
	c.mu.Unlock()
	time.Sleep(100 * time.Millisecond)
	return emit(lichessGame(fmt.Sprintf("%08d", n), "1. e4 e5"))
}

func TestOneFetchAtATimePerSite(t *testing.T) {
	ctx := context.Background()
	site := &counting{}
	w := worker(site)
	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		job, _, err := db.CreateImport(ctx, uuid.Must(uuid.NewV7()), "lichess", "DrNykterstein", 10)
		if err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = w.Run(ctx, importer.Task{EventID: uuid.Must(uuid.NewV7()), JobID: job.ID})
		}()
	}
	wg.Wait()
	if site.most.Load() != 1 {
		t.Fatalf("%d fetches from the same site at once, want 1", site.most.Load())
	}
}

func TestAnEventHandledOnceIsNotHandledAgain(t *testing.T) {
	ctx := context.Background()
	owner := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, owner, "lichess", "DrNykterstein", 10)
	event := uuid.Must(uuid.NewV7())
	if _, err := db.MarkProcessed(ctx, event); err != nil {
		t.Fatal(err)
	}
	if err := worker(site{err: errors.New("never called")}).Run(ctx, importer.Task{EventID: event, JobID: job.ID}); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.GetImport(ctx, owner, job.ID); got.Status != "queued" {
		t.Fatalf("status %s: a handled event ran again", got.Status)
	}
}
