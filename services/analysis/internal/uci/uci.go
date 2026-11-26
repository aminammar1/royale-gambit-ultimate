// Package uci reads Stockfish's UCI output: `info` lines and `bestmove`. It knows nothing about
// chess rules; scores come out from White's point of view (ENGINE.md, "Parsing info lines").
package uci

import (
	"strconv"
	"strings"
)

// Score is an evaluation. Exactly one field is set: centipawns, or moves to mate (positive when
// the side it belongs to mates).
type Score struct {
	CP   *int `json:"cp,omitempty"`
	Mate *int `json:"mate,omitempty"`
}

// CP returns a centipawn score.
func CP(n int) Score { return Score{CP: &n} }

// Mate returns a mate score.
func Mate(n int) Score { return Score{Mate: &n} }

func (s Score) negated() Score {
	switch {
	case s.CP != nil:
		return CP(-*s.CP)
	case s.Mate != nil:
		return Mate(-*s.Mate)
	}
	return s
}

// Line is one principal variation as the engine reported it.
type Line struct {
	MultiPV int      `json:"multipv"`
	Depth   int      `json:"depth"`
	Score   Score    `json:"score"`
	WDL     []int    `json:"wdl,omitempty"` // win, draw, loss per mille
	PV      []string `json:"pv"`
}

// ParseInfo reads an `info` line. ok is false for lines that are not shown: `info string`,
// lines without a pv or a score (currmove reports, the mated-at-root line), and bound scores.
// The score is still from the side to move's point of view; see Line.ForWhite.
func ParseInfo(line string) (l Line, ok bool) {
	f := strings.Fields(line)
	if len(f) < 2 || f[0] != "info" || f[1] == "string" {
		return Line{}, false
	}
	l.MultiPV = 1
	scored := false
	for i := 1; i < len(f); i++ {
		switch f[i] {
		case "depth":
			if n, good := intAt(f, i+1); good {
				l.Depth, i = n, i+1
			}
		case "multipv":
			if n, good := intAt(f, i+1); good {
				l.MultiPV, i = n, i+1
			}
		case "score":
			if i+2 >= len(f) {
				return Line{}, false
			}
			n, good := intAt(f, i+2)
			if !good {
				return Line{}, false
			}
			switch f[i+1] {
			case "cp":
				l.Score = CP(n)
			case "mate":
				l.Score = Mate(n)
			default:
				return Line{}, false
			}
			scored, i = true, i+2
			if i+1 < len(f) && (f[i+1] == "lowerbound" || f[i+1] == "upperbound") {
				return Line{}, false // a bound is not an evaluation; never shown
			}
		case "wdl":
			if i+3 >= len(f) {
				return Line{}, false
			}
			wdl := make([]int, 3)
			for k := range 3 {
				n, good := intAt(f, i+1+k)
				if !good {
					return Line{}, false
				}
				wdl[k] = n
			}
			l.WDL, i = wdl, i+3
		case "pv":
			l.PV = append([]string(nil), f[i+1:]...)
			i = len(f)
		}
	}
	if !scored || len(l.PV) == 0 {
		return Line{}, false
	}
	return l, true
}

// ForWhite turns a line read in a position with sideToMove ('w' or 'b') to White's view: for
// Black to move the score changes sign and the win/draw/loss triple is reversed.
func (l Line) ForWhite(sideToMove byte) Line {
	if sideToMove != 'b' {
		return l
	}
	out := l
	out.Score = l.Score.negated()
	if len(l.WDL) == 3 {
		out.WDL = []int{l.WDL[2], l.WDL[1], l.WDL[0]}
	}
	return out
}

// ParseBestmove reads a `bestmove` line. isBestmove is false for any other line; move is empty
// for `bestmove (none)` (no legal move).
func ParseBestmove(line string) (move string, isBestmove bool) {
	f := strings.Fields(line)
	if len(f) < 2 || f[0] != "bestmove" {
		return "", false
	}
	if f[1] == "(none)" {
		return "", true
	}
	return f[1], true
}

func intAt(f []string, i int) (int, bool) {
	if i >= len(f) {
		return 0, false
	}
	n, err := strconv.Atoi(f[i])
	return n, err == nil
}
