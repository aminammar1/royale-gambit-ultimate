package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/cache"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/position"
)

// Limits from the contract.
const (
	defaultDepth  = 18
	maxDepth      = 30
	minMovetimeMs = 50
	maxMovetimeMs = 10000
	maxMultiPV    = 5
	maxFEN        = 100
	maxMoves      = 600
	maxPositions  = 300
	maxBody       = 1 << 20
)

var uciMove = regexp.MustCompile(`^[a-h][1-8][a-h][1-8][qrbn]?$`)

var cacheKey = cache.Key

// optInt is an optional number: absent is fine, `null` is not (the contract says integer).
type optInt struct {
	v   int
	set bool
}

func (o *optInt) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return errors.New("must be a number, not null")
	}
	o.set = true
	return json.Unmarshal(b, &o.v)
}

// moveList is an optional array of moves: absent is fine, `null` is not.
type moveList []string

func (m *moveList) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		return errors.New("moves must be an array, not null")
	}
	return json.Unmarshal(b, (*[]string)(m))
}

type searchIn struct {
	Depth      optInt `json:"depth"`
	MovetimeMs optInt `json:"movetime_ms"`
	MultiPV    optInt `json:"multipv"`
}

type positionIn struct {
	FEN   string   `json:"fen"`
	Moves moveList `json:"moves"`
}

type positionRequest struct {
	positionIn
	searchIn
}

type batchRequest struct {
	searchIn
	Positions []positionIn `json:"positions"`
}

// search is a checked search: exactly one of Depth or MovetimeMs drives it.
type search struct {
	Depth, MovetimeMs, MultiPV int
}

type checked = position.Position

// badRequest is shown to the caller as it is.
type badRequest struct {
	kind, title, detail string
}

func (e badRequest) Error() string { return e.detail }

func invalidRequest(format string, a ...any) error {
	return badRequest{"invalid-request", "Invalid request", fmt.Sprintf(format, a...)}
}

func (in searchIn) check() (search, error) {
	s := search{Depth: defaultDepth, MultiPV: 3}
	if in.Depth.set && in.MovetimeMs.set {
		return s, invalidRequest("give depth or movetime_ms, not both")
	}
	if in.Depth.set {
		if in.Depth.v < 1 || in.Depth.v > maxDepth {
			return s, invalidRequest("depth must be between 1 and %d", maxDepth)
		}
		s.Depth = in.Depth.v
	}
	if in.MovetimeMs.set {
		if in.MovetimeMs.v < minMovetimeMs || in.MovetimeMs.v > maxMovetimeMs {
			return s, invalidRequest("movetime_ms must be between %d and %d", minMovetimeMs, maxMovetimeMs)
		}
		s.Depth, s.MovetimeMs = 0, in.MovetimeMs.v
	}
	if in.MultiPV.set {
		if in.MultiPV.v < 1 || in.MultiPV.v > maxMultiPV {
			return s, invalidRequest("multipv must be between 1 and %d", maxMultiPV)
		}
		s.MultiPV = in.MultiPV.v
	}
	return s, nil
}

func (in positionIn) check() (checked, error) {
	if in.FEN == "" {
		return checked{}, invalidRequest("fen is required")
	}
	if len(in.FEN) > maxFEN {
		return checked{}, invalidRequest("fen is longer than %d characters", maxFEN)
	}
	if len(in.Moves) > maxMoves {
		return checked{}, invalidRequest("at most %d moves", maxMoves)
	}
	for i, m := range in.Moves {
		if !uciMove.MatchString(m) {
			return checked{}, invalidRequest("move %d (%q) is not a UCI move like e2e4 or e7e8q", i+1, m)
		}
	}
	p, err := position.Resolve(in.FEN, in.Moves)
	if err != nil {
		return checked{}, badRequest{"invalid-position", "Invalid position", err.Error()}
	}
	return p, nil
}

// decode reads a JSON body strictly: one object, no unknown fields, at most maxBody bytes.
func decode(c *gin.Context, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			return invalidRequest("the body is larger than %d bytes", maxBody)
		}
		return invalidRequest("the body is not valid JSON for this endpoint: %v", err)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return invalidRequest("the body holds more than one JSON value")
	}
	return nil
}

func writeBadRequest(c *gin.Context, err error) {
	var br badRequest
	if !errors.As(err, &br) {
		br = badRequest{"invalid-request", "Invalid request", err.Error()}
	}
	httpx.Abort(c, httpx.NewProblem(c, http.StatusBadRequest, br.kind, br.title, br.detail))
}
