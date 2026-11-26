// Package engine drives one Stockfish process over UCI (ENGINE.md, "Process lifecycle"): one
// search at a time, `stop` then wait for `bestmove` before the next, and a clean quit that
// leaves no zombie behind.
package engine

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

// ErrDied means the process exited or stopped answering; the engine cannot be used again.
var ErrDied = errors.New("engine died")

// ErrRejected means Stockfish refused the position or a move (`info string CRITICAL ERROR`)
// and exited. The input is at fault, not the engine: retrying would only kill another one.
var ErrRejected = errors.New("engine refused the position")

// Options are set once at start.
type Options struct {
	Threads int
	HashMB  int
	// Reply bounds every wait for an answer that should come at once (uciok, readyok, the
	// bestmove after stop).
	Reply time.Duration
}

// ID names the engine, from its `id name` line: "Stockfish 19" gives Stockfish, 19.
type ID struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// Request is one search. FEN and Moves must already be checked (package position).
type Request struct {
	FEN        string
	Moves      []string
	SideToMove byte
	Depth      int // used when MovetimeMs is 0
	MovetimeMs int
	MultiPV    int
	// LimitMs caps a depth search's time; the result then comes from the depth reached and
	// is marked Capped.
	LimitMs int
}

// Result is a finished search. Lines are the last line reported per MultiPV slot, best first,
// from White's point of view.
type Result struct {
	Depth    int
	Lines    []uci.Line
	Bestmove string // empty when there is no legal move
	// Capped is true when LimitMs stopped the search before the depth asked: its last lines
	// may be labelled with a depth the engine never finished.
	Capped bool
}

// Engine is one running Stockfish. It is not safe for concurrent searches: the pool gives each
// worker its own.
type Engine struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	lines   chan string // stdout, closed when the process exits
	exited  chan struct{}
	id      ID
	opts    Options
	multipv int
	mu      sync.Mutex // guards writes to stdin
	closed  bool
}

// Start launches the engine at path and waits until it is ready.
func Start(ctx context.Context, path string, opts Options) (*Engine, error) {
	if opts.Threads < 1 {
		opts.Threads = 1
	}
	if opts.HashMB < 1 {
		opts.HashMB = 16
	}
	if opts.Reply <= 0 {
		opts.Reply = 10 * time.Second
	}
	cmd := exec.Command(path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %s: %w", path, err)
	}
	e := &Engine{cmd: cmd, stdin: stdin, lines: make(chan string, 256), exited: make(chan struct{}), opts: opts}
	go e.read(stdout)

	if err := e.handshake(ctx); err != nil {
		_ = e.Close()
		return nil, err
	}
	return e, nil
}

// read forwards stdout line by line. At end of output it reaps the process: os/exec wants Wait
// only after every read from the pipe is done.
func (e *Engine) read(r io.Reader) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		e.lines <- sc.Text()
	}
	close(e.lines)
	_ = e.cmd.Wait()
	close(e.exited)
}

func (e *Engine) handshake(ctx context.Context) error {
	if err := e.send("uci"); err != nil {
		return err
	}
	if err := e.waitFor(ctx, func(l string) bool {
		if name, ok := strings.CutPrefix(l, "id name "); ok {
			e.id = parseID(name)
		}
		return l == "uciok"
	}); err != nil {
		return fmt.Errorf("uci handshake: %w", err)
	}
	for _, opt := range []string{
		fmt.Sprintf("setoption name Threads value %d", e.opts.Threads),
		fmt.Sprintf("setoption name Hash value %d", e.opts.HashMB),
		"setoption name UCI_ShowWDL value true",
	} {
		if err := e.send(opt); err != nil {
			return err
		}
	}
	return e.ready(ctx)
}

// parseID splits "Stockfish 19" into name and version; a name without a version keeps it whole.
func parseID(s string) ID {
	s = strings.TrimSpace(s)
	if i := strings.LastIndexByte(s, ' '); i > 0 {
		return ID{Name: s[:i], Version: s[i+1:]}
	}
	return ID{Name: s}
}

// ID is the engine's name and version.
func (e *Engine) ID() ID { return e.id }

func (e *Engine) ready(ctx context.Context) error {
	if err := e.send("isready"); err != nil {
		return err
	}
	return e.waitFor(ctx, func(l string) bool { return l == "readyok" })
}

// waitFor reads lines until match returns true, the reply time runs out, or the process ends.
func (e *Engine) waitFor(ctx context.Context, match func(string) bool) error {
	timer := time.NewTimer(e.opts.Reply)
	defer timer.Stop()
	for {
		select {
		case l, ok := <-e.lines:
			if !ok {
				return ErrDied
			}
			if match(l) {
				return nil
			}
		case <-timer.C:
			return fmt.Errorf("%w: no answer within %s", ErrDied, e.opts.Reply)
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (e *Engine) send(cmd string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed {
		return ErrDied
	}
	if _, err := io.WriteString(e.stdin, cmd+"\n"); err != nil {
		return fmt.Errorf("%w: %v", ErrDied, err)
	}
	return nil
}

// throttle is how often a still-changing line may be reported while searching.
const throttle = 100 * time.Millisecond

// Search runs one search. onInfo, when set, gets lines as the search deepens: at most about ten
// a second per MultiPV slot, and always the last line of each depth. When ctx ends the search
// is stopped, its bestmove awaited and discarded, and ctx.Err() returned: the engine is ready
// for the next search.
func (e *Engine) Search(ctx context.Context, req Request, onInfo func(uci.Line)) (Result, error) {
	if req.MultiPV < 1 {
		req.MultiPV = 1
	}
	if req.MultiPV != e.multipv {
		if err := e.send(fmt.Sprintf("setoption name MultiPV value %d", req.MultiPV)); err != nil {
			return Result{}, err
		}
		e.multipv = req.MultiPV
	}
	// Settle anything left from a previous search before starting this one.
	if err := e.ready(context.WithoutCancel(ctx)); err != nil {
		return Result{}, err
	}
	pos := "position fen " + req.FEN
	if len(req.Moves) > 0 {
		pos += " moves " + strings.Join(req.Moves, " ")
	}
	goCmd := fmt.Sprintf("go depth %d", max(req.Depth, 1))
	// The cap is our own timer, not UCI movetime, so we know when it cut the search short.
	var capTimer <-chan time.Time
	if req.MovetimeMs > 0 {
		goCmd = fmt.Sprintf("go movetime %d", req.MovetimeMs)
	} else if req.LimitMs > 0 {
		t := time.NewTimer(time.Duration(req.LimitMs) * time.Millisecond)
		defer t.Stop()
		capTimer = t.C
	}
	if err := e.send(pos); err != nil {
		return Result{}, err
	}
	if err := e.send(goCmd); err != nil {
		return Result{}, err
	}

	best := map[int]uci.Line{}  // latest line per slot
	shown := map[int]uci.Line{} // last line handed to onInfo per slot
	lastShown := map[int]time.Time{}
	report := func(l uci.Line) {
		if onInfo == nil {
			return
		}
		onInfo(l)
		shown[l.MultiPV], lastShown[l.MultiPV] = l, time.Now()
	}
	var stopErr error // set once the search was asked to stop
	var stopDeadline <-chan time.Time
	capped := false
	rejected := "" // Stockfish's own reason, when it refuses the input
	for {
		select {
		case raw, ok := <-e.lines:
			if !ok {
				if rejected != "" {
					return Result{}, fmt.Errorf("%w: %s", ErrRejected, rejected)
				}
				return Result{}, ErrDied
			}
			if msg, isCritical := strings.CutPrefix(raw, "info string CRITICAL ERROR"); isCritical {
				rejected = strings.TrimLeft(msg, " :")
				continue
			}
			if move, isBest := uci.ParseBestmove(raw); isBest {
				if stopErr != nil {
					return Result{}, stopErr
				}
				r := result(best, move)
				r.Capped = capped
				return r, nil
			}
			l, ok := uci.ParseInfo(raw)
			if !ok || l.MultiPV > req.MultiPV {
				continue
			}
			l = l.ForWhite(req.SideToMove)
			prev, had := best[l.MultiPV]
			best[l.MultiPV] = l
			// A deeper line closes the previous depth: make sure its last line was shown.
			if had && l.Depth > prev.Depth && !sameLine(shown[l.MultiPV], prev) {
				report(prev)
			}
			if time.Since(lastShown[l.MultiPV]) >= throttle {
				report(l)
			}
		case <-ctx.Done():
			stopErr = ctx.Err()
			if err := e.send("stop"); err != nil {
				return Result{}, err
			}
			stopDeadline = time.After(e.opts.Reply)
			ctx = context.WithoutCancel(ctx) // its Done never fires: wait for bestmove only
		case <-capTimer:
			capped, capTimer = true, nil
			if err := e.send("stop"); err != nil {
				return Result{}, err
			}
			stopDeadline = time.After(e.opts.Reply)
		case <-stopDeadline:
			return Result{}, fmt.Errorf("%w: no bestmove within %s of stop", ErrDied, e.opts.Reply)
		}
	}
}

func sameLine(a, b uci.Line) bool {
	return a.MultiPV == b.MultiPV && a.Depth == b.Depth && slices.Equal(a.PV, b.PV)
}

func result(best map[int]uci.Line, move string) Result {
	r := Result{Bestmove: move}
	first := map[string]bool{}
	for slot := 1; slot <= len(best)+1; slot++ {
		l, ok := best[slot]
		// Lines of one report are not always from one batch: never list a first move twice.
		if !ok || first[l.PV[0]] {
			continue
		}
		first[l.PV[0]] = true
		r.Lines = append(r.Lines, l)
	}
	if len(r.Lines) > 0 {
		r.Depth = r.Lines[0].Depth
	}
	return r
}

// Close quits the engine: `quit`, then a kill after half a second, and always waits for the
// process so no zombie is left. Safe to call more than once.
func (e *Engine) Close() error {
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		<-e.exited
		return nil
	}
	_, _ = io.WriteString(e.stdin, "quit\n")
	e.closed = true
	_ = e.stdin.Close()
	e.mu.Unlock()
	// Keep reading stdout, or a full buffer would stop the reader before it reaps the process.
	drained := make(chan struct{})
	go func() {
		for range e.lines {
		}
		close(drained)
	}()
	select {
	case <-e.exited:
	case <-time.After(500 * time.Millisecond):
		_ = e.cmd.Process.Kill()
		<-e.exited
	}
	<-drained
	return nil
}

// Kill ends the process at once; tests use it to play a crash.
func (e *Engine) Kill() error { return e.cmd.Process.Kill() }

// Exited reports whether the process has ended and been reaped.
func (e *Engine) Exited() bool {
	select {
	case <-e.exited:
		return true
	default:
		return false
	}
}
