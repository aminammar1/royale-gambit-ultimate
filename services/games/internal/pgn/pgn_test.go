package pgn_test

import (
	"encoding/json"
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

// Found by the chess review, 2026-11-28.

func TestCastlingWrittenWithZeros(t *testing.T) {
	// Some tools write castling with zeros. Mid-game it must not be refused, and as the last
	// move it must not be dropped (the library's lexer reads 0-0 as a move number).
	mid := one(t, "[White \"a\"]\n[Black \"b\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. 0-0 Be7 6. Re1 0-0 *\n")
	if mid.PlyCount != 12 {
		t.Fatalf("mid-game castling: %d plies, want 12", mid.PlyCount)
	}
	last := one(t, "[White \"a\"]\n[Black \"b\"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5.0-0 *\n")
	if last.PlyCount != 9 {
		t.Fatalf("castling last: %d plies, want 9", last.PlyCount)
	}
	long := one(t, "[White \"a\"]\n[Black \"b\"]\n\n1. d4 d5 2. Nc3 Nc6 3. Bf4 Bf5 4. Qd2 Qd7 5. 0-0-0 0-0-0+ 1/2-1/2\n")
	if long.PlyCount != 10 {
		t.Fatalf("long castling: %d plies, want 10", long.PlyCount)
	}
	// Results and comments are left alone.
	if mid.Result != "*" || one(t, lichessGame).Result != "0-1" {
		t.Fatal("a result was rewritten")
	}
}

func TestPromotionWithoutEquals(t *testing.T) {
	g := one(t, "[FEN \"4k3/P7/8/8/8/8/8/4K3 w - - 0 1\"]\n[SetUp \"1\"]\n\n1. a8Q+ Kd7 *\n")
	if g.PlyCount != 2 || g.FirstMoves != "1. a8=Q+ Kd7" {
		t.Fatalf("ply %d first moves %q", g.PlyCount, g.FirstMoves)
	}
}

func TestOpeningsAreFoundByPositionNotMoveOrder(t *testing.T) {
	cases := []struct {
		name, moves, eco, contains string
	}{
		{"Najdorf by 1. Nf3", "1. Nf3 c5 2. e4 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6", "B90", "Najdorf"},
		{"King's Indian by 1. Nf3", "1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. d4 O-O", "E9", "King's Indian"},
		{"Nimzo-Indian by 1. c4", "1. c4 Nf6 2. Nc3 e6 3. d4 Bb4", "E2", "Nimzo-Indian"},
	}
	for _, c := range cases {
		g := one(t, "[White \"a\"]\n[Black \"b\"]\n\n"+c.moves+" *\n")
		if !strings.HasPrefix(g.ECO, c.eco) || !strings.Contains(g.Opening, c.contains) {
			t.Errorf("%s: %s %q", c.name, g.ECO, g.Opening)
		}
	}
}

func TestFirstMovesFromAPosition(t *testing.T) {
	g := one(t, "[FEN \"4k3/8/8/8/8/8/p7/4K3 b - - 0 40\"]\n[SetUp \"1\"]\n\n40... a1=N 41. Kd2 *\n")
	if g.FirstMoves != "40... a1=N 41. Kd2" {
		t.Fatalf("first moves %q", g.FirstMoves)
	}
}

func TestOnlyGameLinksAreLichessGames(t *testing.T) {
	for _, site := range []string{"https://lichess.org/tournament/abcd1234", "https://lichess.org/broadcast/round-1/abcd1234", "https://lichess.org/analysis"} {
		g := one(t, strings.Replace(lichessGame, "https://lichess.org/abcdEFGH", site, 1))
		if !strings.HasPrefix(g.Hash, "moves:") {
			t.Errorf("%s: hash %q, want a moves hash", site, g.Hash)
		}
	}
	// A 12-character id (the game seen from one side) is still the 8-character game.
	g := one(t, strings.Replace(lichessGame, "https://lichess.org/abcdEFGH", "https://lichess.org/abcdEFGHwxyz", 1))
	if g.Hash != "lichess:abcdEFGH" {
		t.Errorf("12-character id: %q", g.Hash)
	}
}

func TestOlderChessComLinks(t *testing.T) {
	for _, link := range []string{"https://www.chess.com/live/game/123456789", "https://www.chess.com/game/live/123456789"} {
		g := one(t, strings.Replace(chessComGame, "https://www.chess.com/game/live/123456789", link, 1))
		if g.Hash != "chesscom:live/123456789" {
			t.Errorf("%s: hash %q", link, g.Hash)
		}
	}
	g := one(t, strings.Replace(chessComGame, "https://www.chess.com/game/live/123456789", "https://www.chess.com/daily/game/42", 1))
	if g.Hash != "chesscom:daily/42" {
		t.Errorf("daily: %q", g.Hash)
	}
}

func TestByteOrderMark(t *testing.T) {
	got, err := pgn.Read(strings.NewReader("\ufeff[White \"a\"]\r\n[Black \"b\"]\r\n[Result \"1-0\"]\r\n\r\n1. e4 e5 1-0\r\n"), 10)
	if err != nil || len(got) != 1 || got[0].Err != nil || got[0].Game.White != "a" || got[0].Game.Black != "b" {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestSplitNeverDropsAGame(t *testing.T) {
	cases := map[string]string{
		"a brace in a tag":           "[Annotator \"x {\"]\n[White \"a\"]\n\n1. e4 e5 1-0\n\n[White \"c\"]\n\n1. d4 d5 0-1\n",
		"a brace in a line comment":  "[White \"a\"]\n\n1. e4 ; a { stray\ne5 1-0\n\n[White \"c\"]\n\n1. d4 d5 0-1\n",
		"a second game with no tags": "[White \"a\"]\n\n1. e4 e5 1-0\n\n1. d4 d5 0-1\n",
	}
	for name, text := range cases {
		got, err := pgn.Read(strings.NewReader(text), 10)
		if err != nil || len(got) != 2 {
			t.Errorf("%s: %d games, %v", name, len(got), err)
			continue
		}
		for _, p := range got {
			if p.Err != nil || p.Game.PlyCount != 2 {
				t.Errorf("%s: game %d %+v %v", name, p.Index, p.Game, p.Err)
			}
		}
	}
}

func TestECOTagKeptOnlyWhenWellFormed(t *testing.T) {
	// A position no opening names: the tag is kept, only as a plain code.
	g := one(t, "[FEN \"4k3/8/8/8/8/8/8/4K2R w K - 0 1\"]\n[SetUp \"1\"]\n[ECO \"C42a\"]\n[Opening \"Petrov\"]\n\n1. O-O *\n")
	if g.ECO != "C42" {
		t.Fatalf("eco %q", g.ECO)
	}
	g = one(t, "[FEN \"4k3/8/8/8/8/8/8/4K2R w K - 0 1\"]\n[SetUp \"1\"]\n[ECO \"?\"]\n\n1. O-O *\n")
	if g.ECO != "" {
		t.Fatalf("eco %q", g.ECO)
	}
}

// The shared opening table and golden lines (contracts/fixtures/openings): the desktop app names
// the same lines the same way.

func TestTheEmbeddedTableIsThePinnedOne(t *testing.T) {
	dir := os.Getenv("CONTRACTS_DIR")
	if dir == "" {
		dir = "/contracts"
	}
	for _, f := range []string{"a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv", "SOURCE_COMMIT"} {
		want, err := os.ReadFile(filepath.Join(dir, "fixtures", "openings", f))
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filepath.Join("openings", f))
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != string(want) {
			t.Errorf("internal/pgn/openings/%s differs from contracts/fixtures/openings/%s: copy it again", f, f)
		}
	}
}

func TestGoldenOpenings(t *testing.T) {
	dir := os.Getenv("CONTRACTS_DIR")
	if dir == "" {
		dir = "/contracts"
	}
	raw, err := os.ReadFile(filepath.Join(dir, "fixtures", "openings", "golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden []struct{ PGN, ECO, Name string }
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	for _, c := range golden {
		g := one(t, "[White \"a\"]\n[Black \"b\"]\n\n"+c.PGN+" *\n")
		if g.ECO != c.ECO || g.Opening != c.Name {
			t.Errorf("%s: %s %q, want %s %q", c.PGN, g.ECO, g.Opening, c.ECO, c.Name)
		}
	}
}

func TestOpeningsFromASetPosition(t *testing.T) {
	// Named by position from any start, as on the desktop: the Ruy Lopez set up, then 3... a6.
	g := one(t, "[FEN \"r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3\"]\n[SetUp \"1\"]\n\n3... a6 *\n")
	if g.ECO != "C70" || !strings.HasPrefix(g.Opening, "Ruy Lopez: Morphy Defense") {
		t.Fatalf("%s %q", g.ECO, g.Opening)
	}
}

func TestPositionKey(t *testing.T) {
	// Two move orders, one position, one key: the explorer's cache is shared by both.
	a, err := pgn.PositionKey("rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := pgn.PositionKey("rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 5 9")
	if a != b || a != "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1" {
		t.Fatalf("%q %q", a, b)
	}
	// An en passant square no capture can use is not part of the position.
	c, _ := pgn.PositionKey("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")
	if c != "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" {
		t.Fatalf("%q", c)
	}
	for _, bad := range []string{"", "not a fen", "8/8/8/8/8/8/8/8 w - - 0 1", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"} {
		if _, err := pgn.PositionKey(bad); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}
