// Package pool runs a fixed number of engines, one search each at a time. Jobs wait in two
// queues, live and batch; a free worker always takes a live job first, so a player's request
// never waits behind a game review. A worker whose engine dies starts a new one and gives the
// job one more try.
package pool

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/engine"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

// Priority picks the queue.
type Priority int

const (
	Live Priority = iota
	Batch
)

func (p Priority) String() string {
	if p == Live {
		return "live"
	}
	return "batch"
}

var (
	// ErrBusy means the job's queue is full; the caller should answer 503 with Retry-After.
	ErrBusy = errors.New("engine queue is full")
	// ErrUnavailable means no engine could be (re)started for the job.
	ErrUnavailable = errors.New("no engine is running")
	// ErrClosed means the pool is shutting down.
	ErrClosed = errors.New("engine pool is closed")
)

var (
	queued = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "analysis_queue_jobs", Help: "Jobs waiting for an engine, by priority.",
	}, []string{"priority"})
	jobTime = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name: "analysis_job_seconds", Help: "Time from a job's arrival to its answer, by priority.",
		Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30},
	}, []string{"priority"})
	restarts = promauto.NewCounter(prometheus.CounterOpts{
		Name: "analysis_engine_restarts_total", Help: "Engines started again after dying.",
	})
)

// Searcher is what a worker drives: an *engine.Engine, or a fake in tests.
type Searcher interface {
	Search(ctx context.Context, req engine.Request, onInfo func(uci.Line)) (engine.Result, error)
	ID() engine.ID
	Close() error
}

// Factory starts a new searcher.
type Factory func(ctx context.Context) (Searcher, error)

// Job states: a queued job is either taken by a worker or abandoned by its caller, never both.
const (
	queuedJob int32 = iota
	runningJob
	abandonedJob
)

type job struct {
	state  atomic.Int32
	ctx    context.Context
	req    engine.Request
	onInfo func(uci.Line)
	prio   Priority
	done   chan outcome
	added  time.Time
}

type outcome struct {
	res engine.Result
	err error
}

// Pool is the set of workers.
type Pool struct {
	live, batch chan *job
	factory     Factory
	log         *slog.Logger
	ready       atomic.Int32
	id          atomic.Value // engine.ID
	quit        chan struct{}
	wg          sync.WaitGroup
	closeOnce   sync.Once
}

// New starts size workers, each with its own searcher, and waits for the first to be ready so
// the engine's ID is known. queueLimit bounds each queue.
func New(ctx context.Context, size, queueLimit int, factory Factory, log *slog.Logger) (*Pool, error) {
	if size < 1 {
		size = 1
	}
	if queueLimit < 1 {
		queueLimit = 1
	}
	p := &Pool{
		live:    make(chan *job, queueLimit),
		batch:   make(chan *job, queueLimit),
		factory: factory,
		log:     log,
		quit:    make(chan struct{}),
	}
	first, err := factory(ctx)
	if err != nil {
		return nil, err
	}
	p.id.Store(first.ID())
	for i := range size {
		s := first
		if i > 0 {
			if s, err = factory(ctx); err != nil {
				log.Error("engine did not start", "worker", i, "error", err)
				s = nil // the worker keeps trying
			}
		}
		if s != nil {
			p.ready.Add(1) // counted before New returns
		}
		p.wg.Add(1)
		go p.work(i, s)
	}
	return p, nil
}

// ID is the engine's name and version.
func (p *Pool) ID() engine.ID { return p.id.Load().(engine.ID) }

// Ready is the number of workers with a running engine.
func (p *Pool) Ready() int { return int(p.ready.Load()) }

// Do queues a search and waits for it. It fails at once with ErrBusy when the queue is full.
// When ctx ends while the job waits, the job is dropped; while it runs, the search is stopped.
func (p *Pool) Do(ctx context.Context, prio Priority, req engine.Request, onInfo func(uci.Line)) (engine.Result, error) {
	select {
	case <-p.quit:
		return engine.Result{}, ErrClosed
	default:
	}
	j := &job{ctx: ctx, req: req, onInfo: onInfo, prio: prio, done: make(chan outcome, 1), added: time.Now()}
	q := p.batch
	if prio == Live {
		q = p.live
	}
	select {
	case q <- j:
		queued.WithLabelValues(prio.String()).Inc()
	default:
		return engine.Result{}, ErrBusy
	}
	select {
	case o := <-j.done:
		return o.res, o.err
	case <-ctx.Done():
		if j.state.CompareAndSwap(queuedJob, abandonedJob) {
			return engine.Result{}, ctx.Err() // no worker took it, and none will
		}
		// Running: the search sees the same ctx and stops. Wait for it, so the caller never
		// returns while onInfo can still be called.
		o := <-j.done
		if o.err == nil {
			return o.res, nil
		}
		return engine.Result{}, ctx.Err()
	}
}

func (p *Pool) next() (*job, bool) {
	select {
	case j := <-p.live:
		return j, true
	default:
	}
	select {
	case j := <-p.live:
		return j, true
	case j := <-p.batch:
		return j, true
	case <-p.quit:
		return nil, false
	}
}

func (p *Pool) work(n int, s Searcher) {
	defer p.wg.Done()
	defer func() {
		if s != nil {
			p.ready.Add(-1)
			_ = s.Close()
		}
	}()
	for {
		j, ok := p.next()
		if !ok {
			return
		}
		queued.WithLabelValues(j.prio.String()).Dec()
		if !j.state.CompareAndSwap(queuedJob, runningJob) {
			continue // the caller gave up while it waited
		}
		if err := j.ctx.Err(); err != nil {
			j.done <- outcome{err: err}
			continue
		}
		var res engine.Result
		var err error
		for attempt := 0; attempt < 2; attempt++ {
			if s == nil {
				if s = p.restart(n); s == nil {
					err = ErrUnavailable
					break
				}
			}
			res, err = s.Search(j.ctx, j.req, j.onInfo)
			if !errors.Is(err, engine.ErrDied) {
				break
			}
			p.log.Warn("engine died", "worker", n, "error", err)
			p.ready.Add(-1)
			_ = s.Close()
			s = nil
		}
		jobTime.WithLabelValues(j.prio.String()).Observe(time.Since(j.added).Seconds())
		j.done <- outcome{res: res, err: err}
	}
}

// restart starts a new searcher for worker n, or returns nil when that fails.
func (p *Pool) restart(n int) Searcher {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	s, err := p.factory(ctx)
	if err != nil {
		p.log.Error("engine did not restart", "worker", n, "error", err)
		return nil
	}
	restarts.Inc()
	p.ready.Add(1)
	return s
}

// Close stops taking jobs, fails the queued ones and quits every engine.
func (p *Pool) Close() {
	p.closeOnce.Do(func() {
		close(p.quit)
		p.wg.Wait()
		for _, q := range []chan *job{p.live, p.batch} {
			for {
				select {
				case j := <-q:
					queued.WithLabelValues(j.prio.String()).Dec()
					if j.state.CompareAndSwap(queuedJob, runningJob) {
						j.done <- outcome{err: ErrClosed}
					}
					continue
				default:
				}
				break
			}
		}
	})
}
