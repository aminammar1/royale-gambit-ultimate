// Package pgn reads PGN text into the fields the games table indexes. The moves are read and
// checked by corentings/chess (ADR-03: rules are never hand-written here); the opening comes
// from the CC0 lichess-org/chess-openings table bundled with it.
package pgn

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/corentings/chess/v2"
	"github.com/corentings/chess/v2/opening"
)

// Game is one game as stored: the PGN as given, and what is searched and shown on its card.
type Game struct {
	Raw         string
	White       string
	Black       string
	WhiteElo    *int
	BlackElo    *int
	Result      string // 1-0, 0-1, 1/2-1/2 or *
	PlayedAt    *time.Time
	Event       string
	SiteURL     string
	TimeControl string
	ECO         string
	Opening     string
	PlyCount    int
	// FirstMoves is the first three moves of each side in SAN, numbered, for an index card.
	FirstMoves string
	// Hash names the game across saves: the site's own id when it has one (so the same game
	// linked from either side is one game), else the players, the day and the moves.
	Hash string
}

// Parsed is one game of a PGN text: the game, or why it was refused. Index counts from 0.
type Parsed struct {
	Index int
	Game  *Game
	Err   error
}

// ErrTooMany is returned when a text holds more games than allowed.
var ErrTooMany = errors.New("too many games")

// firstPlies is how many half-moves an index card shows.
const firstPlies = 6

// Read splits text into games and reads each one. A bad game is reported in its Parsed and
// does not stop the others; more than limit games is an error for the whole text.
func Read(r io.Reader, limit int) ([]Parsed, error) {
	text, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("reading the PGN: %w", err)
	}
	chunks := split(string(text))
	if len(chunks) > limit {
		return nil, fmt.Errorf("%w: more than %d", ErrTooMany, limit)
	}
	out := make([]Parsed, 0, len(chunks))
	for i, chunk := range chunks {
		g, err := parseText(chunk)
		out = append(out, Parsed{Index: i, Game: g, Err: err})
	}
	return out, nil
}

// split cuts a PGN text into games. The library's own splitter ends a game at its result and
// does not count "*" as one, so an unfinished game would swallow the games after it. This is
// text only, no chess: a game starts at a tag line that comes after move text, outside
// {comments}.
func split(text string) []string {
	var games []string
	var cur strings.Builder
	sawMoves, depth := false, 0
	flush := func() {
		if g := strings.TrimSpace(cur.String()); g != "" {
			games = append(games, g)
		}
		cur.Reset()
		sawMoves = false
	}
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if depth == 0 && strings.HasPrefix(trimmed, "[") {
			if sawMoves {
				flush()
			}
		} else if depth == 0 && trimmed != "" && !strings.HasPrefix(trimmed, "%") {
			sawMoves = true
		}
		depth += strings.Count(line, "{") - strings.Count(line, "}")
		if depth < 0 {
			depth = 0
		}
		cur.WriteString(line)
		cur.WriteByte('\n')
	}
	flush()
	return games
}

// parseText reads one game's text with the library. The library can panic on some malformed
// text (corentings/chess v2.6.1 indexes past the end of "01" looking for a game without tags), so
// a panic is that game's error, never the request's.
func parseText(text string) (g *Game, err error) {
	defer func() {
		if r := recover(); r != nil {
			g, err = nil, fmt.Errorf("unreadable PGN: %v", r)
		}
	}()
	sc := chess.NewScanner(strings.NewReader(text))
	if !sc.HasNext() {
		return nil, errors.New("no game in the text")
	}
	scanned, err := sc.ScanGame()
	if err != nil {
		return nil, fmt.Errorf("unreadable PGN: %w", err)
	}
	return parse(scanned)
}

// One reads a single game, as a site sends it.
func One(text string) (*Game, error) {
	got, err := Read(strings.NewReader(text), 1)
	if err != nil {
		return nil, err
	}
	if len(got) == 0 {
		return nil, errors.New("no game in the text")
	}
	return got[0].Game, got[0].Err
}

func parse(scanned *chess.GameScanned) (*Game, error) {
	tokens, err := chess.TokenizeGame(scanned)
	if err != nil {
		return nil, fmt.Errorf("unreadable PGN: %w", err)
	}
	cg, err := chess.NewParser(tokens).Parse()
	if err != nil {
		return nil, fmt.Errorf("unreadable or illegal moves: %w", err)
	}
	tag := func(k string) string {
		v := strings.TrimSpace(cg.GetTagPair(k))
		if v == "?" || v == "-" {
			return ""
		}
		return v
	}
	switch v := strings.ToLower(tag("Variant")); v {
	case "", "standard", "from position":
	default:
		return nil, fmt.Errorf("only standard chess is kept (this game is %s)", tag("Variant"))
	}

	moves := cg.Moves()
	positions := cg.Positions()
	g := &Game{
		Raw:         strings.TrimSpace(scanned.Raw),
		White:       orUnknown(tag("White")),
		Black:       orUnknown(tag("Black")),
		WhiteElo:    elo(tag("WhiteElo")),
		BlackElo:    elo(tag("BlackElo")),
		Result:      result(tag("Result"), cg),
		PlayedAt:    playedAt(tag("UTCDate"), tag("UTCTime"), tag("Date")),
		Event:       tag("Event"),
		TimeControl: tag("TimeControl"),
		PlyCount:    len(moves),
	}
	g.SiteURL, g.Hash = siteOf(tag("Site"), tag("Link"))

	var san []string
	var uci []string
	for i, m := range moves {
		if i < firstPlies && i < len(positions) {
			san = append(san, chess.AlgebraicNotation{}.Encode(positions[i], m))
		}
		uci = append(uci, chess.UCINotation{}.Encode(nil, m))
	}
	g.FirstMoves = numbered(san)

	// Openings are named from the standard start only.
	if tag("FEN") == "" && tag("SetUp") != "1" {
		if o := book().Find(moves); o != nil {
			g.ECO, g.Opening = o.Code(), o.Title()
		}
	}
	if g.ECO == "" {
		g.ECO, g.Opening = tag("ECO"), tag("Opening")
	}

	if g.Hash == "" {
		sum := sha256.Sum256([]byte(strings.Join([]string{
			strings.ToLower(g.White), strings.ToLower(g.Black), tag("Date"), tag("FEN"), strings.Join(uci, " "),
		}, "\x00")))
		g.Hash = "moves:" + hex.EncodeToString(sum[:16])
	}
	return g, nil
}

var (
	bookOnce sync.Once
	ecoBook  *opening.BookECO
)

// book loads the opening table once; it is a few thousand lines.
func book() *opening.BookECO {
	bookOnce.Do(func() { ecoBook = opening.NewBookECO() })
	return ecoBook
}

func orUnknown(name string) string {
	if name == "" {
		return "?"
	}
	return name
}

func elo(v string) *int {
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return nil
	}
	return &n
}

func result(tagged string, cg *chess.Game) string {
	switch tagged {
	case "1-0", "0-1", "1/2-1/2", "*":
		return tagged
	}
	switch o := cg.Outcome().String(); o {
	case "1-0", "0-1", "1/2-1/2":
		return o
	}
	return "*"
}

// playedAt is the UTC date and time when both are known, the day at midnight when only the
// day is, else nothing (a PGN date like 1858.??.?? is no date).
func playedAt(utcDate, utcTime, date string) *time.Time {
	if t, err := time.Parse("2006.01.02 15:04:05", utcDate+" "+utcTime); err == nil {
		return &t
	}
	for _, d := range []string{utcDate, date} {
		if t, err := time.Parse("2006.01.02", d); err == nil {
			return &t
		}
	}
	return nil
}

// siteOf finds the game's page and its id on the site: lichess.org/<8-character id> (also
// written lichess.org/game/<id>, or with a side after it; the page given back is the plain one);
// chess.com/game/<live|daily>/<number>, given in the Link tag.
func siteOf(site, link string) (pageURL, hash string) {
	for _, raw := range []string{link, site} {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
			continue
		}
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		host := strings.TrimPrefix(u.Host, "www.")
		switch {
		case host == "lichess.org" && len(parts) >= 1:
			// lichess.org/<id>, lichess.org/<id>/black, or the export's lichess.org/game/<id>.
			id := parts[0]
			if id == "game" && len(parts) >= 2 {
				id = parts[1]
			}
			if len(id) < 8 {
				return raw, ""
			}
			return "https://lichess.org/" + id[:8], "lichess:" + id[:8]
		case host == "chess.com" && len(parts) >= 3 && parts[0] == "game":
			return raw, "chesscom:" + parts[1] + "/" + parts[2]
		}
		return raw, ""
	}
	return "", ""
}

func numbered(san []string) string {
	var b strings.Builder
	for i, m := range san {
		if i > 0 {
			b.WriteByte(' ')
		}
		if i%2 == 0 {
			fmt.Fprintf(&b, "%d. ", i/2+1)
		}
		b.WriteString(m)
	}
	return b.String()
}
