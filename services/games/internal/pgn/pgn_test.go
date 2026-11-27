package pgn_test

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
)

// fixture reads contracts/fixtures/pgn/<name>, mounted at /contracts by `make check-svc`.
func fixture(t *testing.T, name string) string {
	t.Helper()
	dir := os.Getenv("CONTRACTS_DIR")
	if dir == "" {
		dir = "/contracts"
	}
	b, err := os.ReadFile(filepath.Join(dir, "fixtures", "pgn", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func one(t *testing.T, text string) *pgn.Game {
	t.Helper()
	got, err := pgn.Read(strings.NewReader(text), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Err != nil {
		t.Fatalf("want one good game, got %+v", got)
	}
	return got[0].Game
}

func TestOperaGame(t *testing.T) {
	g := one(t, fixture(t, "opera-game.pgn"))
	if g.White != "Paul Morphy" || g.Black != "Duke Karl of Brunswick and Count Isouard" || g.Result != "1-0" {
		t.Fatalf("%+v", g)
	}
	if g.PlyCount != 33 {
		t.Fatalf("ply count %d, want 33 (17. Rd8#)", g.PlyCount)
	}
	if g.FirstMoves != "1. e4 e5 2. Nf3 d6 3. d4 Bg4" {
		t.Fatalf("first moves %q", g.FirstMoves)
	}
	// Philidor Defence after 2...d6, from the CC0 lichess-org/chess-openings table.
	if !strings.HasPrefix(g.ECO, "C41") || !strings.Contains(g.Opening, "Philidor") {
		t.Fatalf("opening %s %q", g.ECO, g.Opening)
	}
	if g.Event != "Paris Opera" || g.PlayedAt != nil || g.SiteURL != "" {
		t.Fatalf("event %q played %v site %q: an unknown day is no date", g.Event, g.PlayedAt, g.SiteURL)
	}
	if !strings.HasPrefix(g.Hash, "moves:") || g.Raw == "" {
		t.Fatalf("hash %q, raw kept: %v", g.Hash, g.Raw != "")
	}
}

func TestRulesTour(t *testing.T) {
	// En passant, both castlings and an underpromotion must all be read as legal.
	g := one(t, fixture(t, "rules-tour.pgn"))
	if g.PlyCount != 23 || g.Result != "*" {
		t.Fatalf("ply %d result %q", g.PlyCount, g.Result)
	}
	if g.FirstMoves != "1. e4 Nf6 2. e5 d5 3. exd6 Nc6" {
		t.Fatalf("first moves %q", g.FirstMoves)
	}
}

const lichessGame = `[Event "Rated blitz game"]
[Site "https://lichess.org/abcdEFGH"]
[Date "2024.03.05"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[UTCDate "2024.03.05"]
[UTCTime "18:04:22"]
[WhiteElo "1800"]
[BlackElo "1850"]
[Variant "Standard"]
[TimeControl "180+2"]

1. e4 e6 2. d4 d5 3. Nc3 Bb4 0-1
`

func TestLichessTags(t *testing.T) {
	g := one(t, lichessGame)
	want := time.Date(2024, 3, 5, 18, 4, 22, 0, time.UTC)
	if g.PlayedAt == nil || !g.PlayedAt.Equal(want) {
		t.Fatalf("played at %v, want %v", g.PlayedAt, want)
	}
	if g.WhiteElo == nil || *g.WhiteElo != 1800 || g.BlackElo == nil || *g.BlackElo != 1850 {
		t.Fatalf("elo %v %v", g.WhiteElo, g.BlackElo)
	}
	if g.SiteURL != "https://lichess.org/abcdEFGH" || g.Hash != "lichess:abcdEFGH" || g.TimeControl != "180+2" {
		t.Fatalf("site %q hash %q tc %q", g.SiteURL, g.Hash, g.TimeControl)
	}
	if g.ECO != "C15" || !strings.Contains(g.Opening, "French") {
		t.Fatalf("opening %s %q", g.ECO, g.Opening)
	}
}

func TestLichessHashIgnoresSide(t *testing.T) {
	// The same game linked from Black's side is still the same game.
	g := one(t, strings.Replace(lichessGame, "https://lichess.org/abcdEFGH", "https://lichess.org/abcdEFGH/black", 1))
	if g.Hash != "lichess:abcdEFGH" {
		t.Fatalf("hash %q", g.Hash)
	}
}

const chessComGame = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.01.02"]
[White "Carol"]
[Black "Dave"]
[Result "1/2-1/2"]
[WhiteElo "1500"]
[BlackElo "1490"]
[TimeControl "600"]
[UTCDate "2025.01.02"]
[UTCTime "07:30:00"]
[Link "https://www.chess.com/game/live/123456789"]

1. d4 d5 2. c4 e6 1/2-1/2
`

func TestChessComTags(t *testing.T) {
	g := one(t, chessComGame)
	if g.SiteURL != "https://www.chess.com/game/live/123456789" || g.Hash != "chesscom:live/123456789" {
		t.Fatalf("site %q hash %q", g.SiteURL, g.Hash)
	}
	if g.Result != "1/2-1/2" || g.PlyCount != 4 {
		t.Fatalf("result %q ply %d", g.Result, g.PlyCount)
	}
}

func TestSameMovesSameHash(t *testing.T) {
	// Without a site link, the players, the day and the moves name the game: saving the same
	// PGN twice is a duplicate, whatever the headers' order or spacing.
	a := one(t, "[White \"A\"]\n[Black \"B\"]\n[Date \"2020.01.01\"]\n\n1. e4 e5 *\n")
	b := one(t, "[Date \"2020.01.01\"]\n[Black \"B\"]\n[White \"A\"]\n\n1.e4   e5\n*\n")
	c := one(t, "[White \"A\"]\n[Black \"B\"]\n[Date \"2020.01.01\"]\n\n1. e4 c5 *\n")
	if a.Hash != b.Hash || a.Hash == c.Hash {
		t.Fatalf("a %s b %s c %s", a.Hash, b.Hash, c.Hash)
	}
}

func TestBadGamesAreRejectedOneByOne(t *testing.T) {
	text := lichessGame + "\n" +
		"[White \"X\"]\n[Black \"Y\"]\n\n1. e4 e5 2. Ke3 *\n\n" + // illegal: the king cannot go to e3
		"[Variant \"Chess960\"]\n[White \"X\"]\n[Black \"Y\"]\n\n1. e4 *\n\n" +
		chessComGame
	got, err := pgn.Read(strings.NewReader(text), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 {
		t.Fatalf("want 4 results, got %d", len(got))
	}
	if got[0].Err != nil || got[3].Err != nil {
		t.Fatalf("good games rejected: %v, %v", got[0].Err, got[3].Err)
	}
	if got[1].Err == nil || got[2].Err == nil {
		t.Fatalf("bad games accepted: %+v %+v", got[1], got[2])
	}
	if !strings.Contains(got[2].Err.Error(), "standard chess") {
		t.Fatalf("variant reason %q", got[2].Err)
	}
	for i, p := range got {
		if p.Index != i {
			t.Fatalf("index %d at %d", p.Index, i)
		}
	}
}

func TestTooManyGames(t *testing.T) {
	_, err := pgn.Read(strings.NewReader(strings.Repeat(lichessGame+"\n", 3)), 2)
	if !errors.Is(err, pgn.ErrTooMany) {
		t.Fatalf("want ErrTooMany, got %v", err)
	}
}

func TestEmpty(t *testing.T) {
	got, err := pgn.Read(strings.NewReader("   \n"), 10)
	if err != nil || len(got) != 0 {
		t.Fatalf("got %v %v", got, err)
	}
}

func TestBracketInsideACommentIsNotANewGame(t *testing.T) {
	text := "[White \"A\"]\n[Black \"B\"]\n\n1. e4 { a note\n[not a tag] still the note } e5 *\n"
	got, err := pgn.Read(strings.NewReader(text), 10)
	if err != nil || len(got) != 1 || got[0].Err != nil || got[0].Game.PlyCount != 2 {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestNonsenseIsRejectedNotACrash(t *testing.T) {
	// Found by the contract fuzzer: text that is no game must be refused, never panic.
	for _, text := range []string{"01", "1.", "[", "]", "{", "1-0", "e4", "[White \"x\"]", "0-0-0"} {
		got, err := pgn.Read(strings.NewReader(text), 10)
		if err != nil {
			continue
		}
		for _, p := range got {
			if p.Err == nil && p.Game == nil {
				t.Errorf("%q: neither a game nor an error", text)
			}
		}
	}
}

func TestLichessGamePathIsTheSameGame(t *testing.T) {
	// Lichess's export writes the Site as lichess.org/game/<id> (seen importing real games,
	// 2026-11-28); the page is lichess.org/<id>, and the game is the same either way.
	for _, site := range []string{"https://lichess.org/game/L07dBpjM", "https://lichess.org/L07dBpjM", "https://lichess.org/L07dBpjM/black"} {
		g := one(t, strings.Replace(lichessGame, "https://lichess.org/abcdEFGH", site, 1))
		if g.Hash != "lichess:L07dBpjM" || g.SiteURL != "https://lichess.org/L07dBpjM" {
			t.Errorf("%s: hash %q url %q", site, g.Hash, g.SiteURL)
		}
	}
}
