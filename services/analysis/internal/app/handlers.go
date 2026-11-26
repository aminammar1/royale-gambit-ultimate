package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/pool"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/uci"
)

func wantsStream(c *gin.Context) bool {
	return strings.Contains(c.GetHeader("Accept"), "text/event-stream")
}

// keepAlive is how often a quiet stream writes a comment. The first one also sends the
// headers, well inside the gateway's 30 s wait for them, while a refusal that comes at once
// (a full queue) is still answered as a plain 503.
var keepAlive = 5 * time.Second

// stream writes server-sent events. Headers go out with the first event or keep-alive, so an
// error that comes first can still be answered as a plain problem with its status.
type stream struct {
	c       *gin.Context
	started bool
}

// comment writes an SSE comment, which clients ignore: it keeps proxies from timing out.
func (s *stream) comment(text string) {
	s.start()
	_, _ = fmt.Fprintf(s.c.Writer, ": %s\n\n", text)
	s.c.Writer.Flush()
}

func (s *stream) start() {
	if !s.started {
		h := s.c.Writer.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache")
		h.Set("X-Accel-Buffering", "no")
		s.c.Status(http.StatusOK)
		s.started = true
	}
}

func (s *stream) event(name string, v any) {
	s.start()
	data, _ := json.Marshal(v)
	_, _ = fmt.Fprintf(s.c.Writer, "event: %s\ndata: %s\n\n", name, data)
	s.c.Writer.Flush()
}

// fail ends the request: a problem with its status before the stream started, an `error`
// event after.
func (srv *server) streamFail(st *stream, err error) {
	if !st.started {
		srv.fail(st.c, err)
		return
	}
	if p, _, ok := failure(st.c, err); ok {
		st.event("error", p)
	}
}

// positions answers one position at live priority.
func (srv *server) positions(c *gin.Context) {
	var in positionRequest
	if err := decode(c, &in); err != nil {
		writeBadRequest(c, err)
		return
	}
	opt, err := in.searchIn.check()
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	p, err := in.positionIn.check()
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	ctx := c.Request.Context()
	if !wantsStream(c) {
		a, err := srv.analyse(ctx, pool.Live, p, opt, nil)
		if err != nil {
			srv.fail(c, err)
			return
		}
		c.JSON(http.StatusOK, a)
		return
	}

	// Lines arrive on the engine's goroutine; only this one writes the response.
	infos := make(chan uci.Line, 64)
	type outcome struct {
		a   Analysis
		err error
	}
	done := make(chan outcome, 1)
	go func() {
		a, err := srv.analyse(ctx, pool.Live, p, opt, func(l uci.Line) {
			select {
			case infos <- l:
			default: // a slow reader misses a progress line, never the result
			}
		})
		done <- outcome{a, err}
	}()
	st := &stream{c: c}
	tick := time.NewTicker(keepAlive)
	defer tick.Stop()
	for {
		select {
		case <-tick.C:
			st.comment("searching")
		case l := <-infos:
			st.event("info", l)
		case o := <-done:
			// The pool calls onInfo only before Do returns: what is buffered comes first.
			for len(infos) > 0 {
				st.event("info", <-infos)
			}
			if o.err != nil {
				srv.streamFail(st, o.err)
				return
			}
			st.event("result", o.a)
			return
		}
	}
}

// batch answers many positions at batch priority, Parallel at a time.
func (srv *server) batch(c *gin.Context) {
	var in batchRequest
	if err := decode(c, &in); err != nil {
		writeBadRequest(c, err)
		return
	}
	if len(in.Positions) == 0 || len(in.Positions) > maxPositions {
		writeBadRequest(c, invalidRequest("positions must hold 1 to %d positions", maxPositions))
		return
	}
	opt, err := in.searchIn.check()
	if err != nil {
		writeBadRequest(c, err)
		return
	}
	ps := make([]checked, len(in.Positions))
	for i, raw := range in.Positions {
		p, err := raw.check()
		if err != nil {
			br, _ := err.(badRequest)
			br.detail = fmt.Sprintf("position %d: %s", i, br.detail)
			writeBadRequest(c, br)
			return
		}
		ps[i] = p
	}

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel() // on the first failure, or when we return, the rest stops
	type outcome struct {
		i   int
		a   Analysis
		err error
	}
	todo := make(chan int, len(ps))
	for i := range ps {
		todo <- i
	}
	close(todo)
	out := make(chan outcome, len(ps))
	for range min(srv.Parallel, len(ps)) {
		go func() {
			for i := range todo {
				if ctx.Err() != nil {
					out <- outcome{i: i, err: ctx.Err()}
					continue
				}
				a, err := srv.analyse(ctx, pool.Batch, ps[i], opt, nil)
				out <- outcome{i, a, err}
			}
		}()
	}

	if !wantsStream(c) {
		results := make([]Analysis, len(ps))
		for range ps {
			o := <-out
			if o.err != nil {
				cancel()
				srv.fail(c, o.err)
				return
			}
			results[o.i] = o.a
		}
		c.JSON(http.StatusOK, gin.H{"results": results})
		return
	}
	st := &stream{c: c}
	tick := time.NewTicker(keepAlive)
	defer tick.Stop()
	for left := len(ps); left > 0; {
		select {
		case <-tick.C:
			st.comment("searching")
		case o := <-out:
			left--
			if o.err != nil {
				cancel()
				srv.streamFail(st, o.err)
				return
			}
			i := o.i
			o.a.Index = &i
			st.event("result", o.a)
		}
	}
	st.event("done", gin.H{"count": len(ps)})
}
