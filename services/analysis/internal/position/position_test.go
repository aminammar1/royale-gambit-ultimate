package position_test

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/corentings/chess/v2"

	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/position"
	"github.com/aminammar1/royale-gambit-ultimate/services/analysis/internal/testdata"
)

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

func TestStartPosition(t *testing.T) {
	p, err := position.Resolve(start, nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.EPD != "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -" || p.SideToMove != 'w' || p.Terminal {
		t.Fatalf("%+v", p)
	}
}

func TestMovesAreReplayed(t *testing.T) {
	p, err := position.Resolve(start, []string{"e2e4", "e7e5", "g1f3"})
	if err != nil {
		t.Fatal(err)
	}
	if p.FEN != "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" {
		t.Fatalf("fen %s", p.FEN)
	}
	if p.SideToMove != 'b' || p.StartFEN != start || len(p.Moves) != 3 {
		t.Fatalf("%+v", p)
	}
}

// The shared PGN fixtures, replayed as UCI moves, must end on the FENs their README records.
func TestPGNFixturesEndWhereTheReadmeSays(t *testing.T) {
	dir := filepath.Join(testdata.Contracts(t), "fixtures/pgn")
	for file, want := range map[string]string{
		"opera-game.pgn": "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17",
		"rules-tour.pgn": "r1br2k1/5pp1/p1nb1n1p/4p3/2p5/2NPBN2/PPPQ1PPP/2KR3R b - - 1 12",
	} {
		t.Run(file, func(t *testing.T) {
			f, err := os.Open(filepath.Join(dir, file))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			opt, err := chess.PGN(f)
			if err != nil {
				t.Fatal(err)
			}
			var moves []string
			for _, m := range chess.NewGame(opt).Moves() {
				moves = append(moves, chess.UCINotation{}.Encode(nil, m))
			}
			p, err := position.Resolve(start, moves)
			if err != nil {
				t.Fatal(err)
			}
			if p.FEN != want {
				t.Fatalf("got  %s\nwant %s", p.FEN, want)
			}
		})
	}
}

func TestSpecialMoves(t *testing.T) {
	cases := []struct {
		name, fen string
		moves     []string
		want      string
	}{
		{"short castle", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", []string{"e1g1"}, "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1"},
		{"long castle", "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1", []string{"e8c8"}, "2kr3r/8/8/8/8/8/8/R3K2R w KQ - 1 2"},
		{"en passant", "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", []string{"e5d6"}, "4k3/8/3P4/8/8/8/8/4K3 b - - 0 1"},
		{"underpromotion", "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", []string{"b7b8n"}, "1N2k3/8/8/8/8/8/8/4K3 b - - 0 1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, err := position.Resolve(c.fen, c.moves)
			if err != nil {
				t.Fatal(err)
			}
			if p.FEN != c.want {
				t.Fatalf("got  %s\nwant %s", p.FEN, c.want)
			}
		})
	}
}

func TestTerminalPositions(t *testing.T) {
	for name, fen := range map[string]string{
		"fool's mate": "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
		"stalemate":   "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
	} {
		p, err := position.Resolve(fen, nil)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !p.Terminal {
			t.Fatalf("%s: not terminal", name)
		}
	}
}

// Nothing Stockfish could crash on, and nothing illegal, gets through.
func TestRefused(t *testing.T) {
	cases := map[string]struct {
		fen   string
		moves []string
	}{
		"not a FEN":                 {"hello", nil},
		"five fields":               {"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0", nil},
		"bad board":                 {"rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", nil},
		"no black king":             {"8/8/8/8/8/8/8/4K3 w - - 0 1", nil},
		"two white kings":           {"4k3/8/8/8/8/8/8/3KK3 w - - 0 1", nil},
		"pawn on the last rank":     {"P3k3/8/8/8/8/8/8/4K3 w - - 0 1", nil},
		"pawn on the first rank":    {"4k3/8/8/8/8/8/8/p3K3 b - - 0 1", nil},
		"side not to move in check": {"4k3/8/8/8/8/8/8/K3R3 w - - 0 1", nil},
		"illegal move":              {start, []string{"e2e5"}},
		"move after mate":           {"rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", []string{"e1f2"}},
		"bad promotion letter":      {"4k3/1P6/8/8/8/8/8/4K3 w - - 0 1", []string{"b7b8k"}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := position.Resolve(c.fen, c.moves)
			if !errors.Is(err, position.ErrInvalid) {
				t.Fatalf("want ErrInvalid, got %v", err)
			}
		})
	}
}

// A right the board cannot use is dropped, not passed to the engine.
func TestCastlingRightsFollowTheBoard(t *testing.T) {
	p, err := position.Resolve("4k3/8/8/8/8/8/8/4K2R w KQkq - 0 1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Fields(p.StartFEN)[2]; got != "K" {
		t.Fatalf("castling %q, want K", got)
	}
	p, err = position.Resolve("4k3/8/8/8/8/8/8/3K3R w KQkq - 0 1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Fields(p.StartFEN)[2]; got != "-" {
		t.Fatalf("castling %q, want -", got)
	}
}

// The EPD (the cache key) names an en passant square only when a capture can use it, so a
// position reached by a double step and by a FEN without the square share one entry.
func TestEPDEnPassantOnlyWhenCapturable(t *testing.T) {
	p, err := position.Resolve(start, []string{"e2e4"})
	if err != nil {
		t.Fatal(err)
	}
	if p.EPD != "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -" {
		t.Fatalf("epd %s", p.EPD)
	}
	p, err = position.Resolve("4k3/8/8/4P3/8/8/8/4K3 b - - 0 1", []string{"d7d5"})
	if err == nil {
		t.Fatal("d7d5 without a pawn on d7 must be refused")
	}
	p, err = position.Resolve("4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", []string{"d7d5"})
	if err != nil {
		t.Fatal(err)
	}
	if p.EPD != "4k3/8/8/3pP3/8/8/8/4K3 w - d6" {
		t.Fatalf("epd %s", p.EPD)
	}
}
