package pool_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/pool"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// fake records the order of searches. A search blocks until gate is closed (when set), takes
// `took`, and dies once when die is set.
type fake struct {
	mu     *sync.Mutex
	order  *[]string
	gate   chan struct{}
	took   time.Duration
	die    *atomic.Bool
	refuse bool
	closed *atomic.Int32
}

func (f *fake) Search(ctx context.Context, req engine.Request, _ func(uci.Line)) (engine.Result, error) {
	if f.gate != nil {
		select {
		case <-f.gate:
		case <-ctx.Done():
			return engine.Result{}, ctx.Err()
		}
	}
	if f.die != nil && f.die.CompareAndSwap(true, false) {
		return engine.Result{}, engine.ErrDied
	}
	if f.refuse {
		return engine.Result{}, engine.ErrRejected
	}
	select {
	case <-time.After(f.took):
	case <-ctx.Done():
		return engine.Result{}, ctx.Err()
	}
	f.mu.Lock()
	*f.order = append(*f.order, req.FEN)
	f.mu.Unlock()
	return engine.Result{Bestmove: "e2e4", Depth: req.Depth}, nil
}
func (f *fake) ID() engine.ID { return engine.ID{Name: "Fake", Version: "1"} }
func (f *fake) Close() error  { f.closed.Add(1); return nil }

type rig struct {
	mu     sync.Mutex
	order  []string
	starts atomic.Int32
	closed atomic.Int32
	die    atomic.Bool
	gate   chan struct{}
	took   time.Duration
	refuse bool
}

func (r *rig) factory(context.Context) (pool.Searcher, error) {
	r.starts.Add(1)
	return &fake{mu: &r.mu, order: &r.order, gate: r.gate, took: r.took, die: &r.die, refuse: r.refuse, closed: &r.closed}, nil
}

func (r *rig) got() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.order...)
}

func req(name string) engine.Request { return engine.Request{FEN: name, Depth: 1} }

// One worker, busy; batch jobs queued, then a live one: the live job runs next.
func TestLiveJumpsTheBatchQueue(t *testing.T) {
	r := &rig{gate: make(chan struct{})}
	p, err := pool.New(context.Background(), 1, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	var wg sync.WaitGroup
	run := func(prio pool.Priority, name string) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := p.Do(context.Background(), prio, req(name), nil); err != nil {
				t.Error(err)
			}
		}()
		time.Sleep(20 * time.Millisecond) // keep the arrival order
	}
	run(pool.Batch, "b0") // taken by the worker, waits at the gate
	run(pool.Batch, "b1")
	run(pool.Batch, "b2")
	run(pool.Live, "live")
	close(r.gate)
	wg.Wait()
	got := r.got()
	if len(got) != 4 || got[0] != "b0" || got[1] != "live" {
		t.Fatalf("order %v, want b0 then live", got)
	}
}

func TestFullQueueIsBusy(t *testing.T) {
	r := &rig{gate: make(chan struct{})}
	p, err := pool.New(context.Background(), 1, 1, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { close(r.gate); p.Close() }()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _, _ = p.Do(ctx, pool.Batch, req("running"), nil) }()
	time.Sleep(20 * time.Millisecond)
	go func() { _, _ = p.Do(ctx, pool.Batch, req("queued"), nil) }()
	time.Sleep(20 * time.Millisecond)
	if _, err := p.Do(ctx, pool.Batch, req("one too many"), nil); !errors.Is(err, pool.ErrBusy) {
		t.Fatalf("want ErrBusy, got %v", err)
	}
	// The live queue is separate: a live request is still accepted.
	go func() { _, _ = p.Do(ctx, pool.Live, req("live"), nil) }()
}

// A dead engine is replaced and the job tried once more.
func TestDeadEngineIsRestartedAndJobRetried(t *testing.T) {
	r := &rig{}
	r.die.Store(true)
	p, err := pool.New(context.Background(), 1, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	res, err := p.Do(context.Background(), pool.Live, req("x"), nil)
	if err != nil || res.Bestmove != "e2e4" {
		t.Fatalf("%v %+v", err, res)
	}
	if r.starts.Load() != 2 || r.closed.Load() != 1 || p.Ready() != 1 {
		t.Fatalf("starts %d closed %d ready %d", r.starts.Load(), r.closed.Load(), p.Ready())
	}
}

// A caller that gives up while queued returns at once; the job never runs.
func TestAbandonedJobIsSkipped(t *testing.T) {
	r := &rig{gate: make(chan struct{})}
	p, err := pool.New(context.Background(), 1, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	go func() { _, _ = p.Do(context.Background(), pool.Batch, req("first"), nil) }()
	time.Sleep(20 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	began := time.Now()
	if _, err := p.Do(ctx, pool.Batch, req("abandoned"), nil); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want deadline, got %v", err)
	}
	if time.Since(began) > 500*time.Millisecond {
		t.Fatal("caller waited for the worker")
	}
	close(r.gate)
	time.Sleep(50 * time.Millisecond)
	for _, name := range r.got() {
		if name == "abandoned" {
			t.Fatal("abandoned job ran")
		}
	}
}

func TestCloseQuitsEveryEngine(t *testing.T) {
	r := &rig{}
	p, err := pool.New(context.Background(), 3, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	if p.Ready() != 3 || p.ID().Name != "Fake" {
		t.Fatalf("ready %d id %+v", p.Ready(), p.ID())
	}
	p.Close()
	p.Close()
	if r.closed.Load() != 3 || p.Ready() != 0 {
		t.Fatalf("closed %d ready %d", r.closed.Load(), p.Ready())
	}
	if _, err := p.Do(context.Background(), pool.Live, req("late"), nil); !errors.Is(err, pool.ErrClosed) {
		t.Fatalf("want ErrClosed, got %v", err)
	}
}

// Load: 50 concurrent batch requests of 10 positions keep two workers busy, yet a live request
// is answered within a couple of job lengths, never behind the whole batch queue.
func TestLiveStaysFastUnderBatchLoad(t *testing.T) {
	r := &rig{took: 10 * time.Millisecond}
	p, err := pool.New(context.Background(), 2, 1000, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var batches sync.WaitGroup
	for b := range 50 {
		batches.Add(1)
		go func() {
			defer batches.Done()
			for i := range 10 {
				if _, err := p.Do(ctx, pool.Batch, req("batch"), nil); err != nil && ctx.Err() == nil {
					t.Errorf("batch %d/%d: %v", b, i, err)
				}
			}
		}()
	}
	time.Sleep(50 * time.Millisecond) // let the batch queue fill
	var worst time.Duration
	for range 10 {
		began := time.Now()
		if _, err := p.Do(context.Background(), pool.Live, req("live"), nil); err != nil {
			t.Fatal(err)
		}
		worst = max(worst, time.Since(began))
	}
	// A live job waits at most for one running batch job, then takes its own 10 ms.
	if worst > 100*time.Millisecond {
		t.Fatalf("live took up to %s under load", worst)
	}
	cancel()
	batches.Wait()
}

// A refused position is the caller's fault: the dead engine is replaced, the job is not retried.
func TestRefusedPositionIsNotRetried(t *testing.T) {
	r := &rig{refuse: true}
	p, err := pool.New(context.Background(), 1, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	if _, err := p.Do(context.Background(), pool.Live, req("bad"), nil); !errors.Is(err, engine.ErrRejected) {
		t.Fatalf("want ErrRejected, got %v", err)
	}
	// The job ran once: one engine closed, and at most its one replacement started.
	time.Sleep(50 * time.Millisecond)
	if r.closed.Load() < 1 || r.starts.Load() > 2 {
		t.Fatalf("starts %d closed %d", r.starts.Load(), r.closed.Load())
	}
}

// After a refused position the worker starts a new engine at once: readiness comes back
// without waiting for another job.
func TestReadyComesBackWithoutANewJob(t *testing.T) {
	r := &rig{refuse: true}
	p, err := pool.New(context.Background(), 1, 10, r.factory, quiet)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	_, _ = p.Do(context.Background(), pool.Live, req("bad"), nil)
	deadline := time.Now().Add(2 * time.Second)
	for p.Ready() != 1 {
		if time.Now().After(deadline) {
			t.Fatalf("ready %d, starts %d", p.Ready(), r.starts.Load())
		}
		time.Sleep(10 * time.Millisecond)
	}
	if r.starts.Load() != 2 {
		t.Fatalf("starts %d, want the first engine and its replacement", r.starts.Load())
	}
}
