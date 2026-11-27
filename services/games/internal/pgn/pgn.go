// Package pgn reads PGN text into the fields the games table indexes. The moves are read and
// checked by corentings/chess (ADR-03: rules are never hand-written here); the opening comes
// from the CC0 lichess-org/chess-openings table bundled with it.
package pgn

import (
	"bufio"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/corentings/chess/v2"
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
	// Steps are the first IndexedPlies moves with the position each was played from, for the
	// player's own explorer.
	Steps []Step
	// Hash names the game across saves: the site's own id when it has one (so the same game
	// linked from either side is one game), else the players, the day and the moves.
	Hash string
}

// Step is one move and the position it was played from (an opening-table key: board, side to
// move, castling, en passant when a capture is legal).
type Step struct {
	Position string
	UCI      string
	SAN      string
}

// IndexedPlies is how deep a game is indexed for "My games": the opening, not the whole game.
const IndexedPlies = 30

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
	// A byte-order mark (Windows and ChessBase exports) is not part of the first tag.
	chunks := split(strings.TrimPrefix(string(text), "\ufeff"))
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
// text only, no chess: a game ends at a tag line that follows move text, or after its result;
// braces open comments only in move text, and a ';' comment runs to the end of its line.
func split(text string) []string {
	var games []string
	var cur strings.Builder
	sawMoves, ended, depth := false, false, 0
	flush := func() {
		if g := strings.TrimSpace(cur.String()); g != "" {
			games = append(games, g)
		}
		cur.Reset()
		sawMoves, ended = false, false
	}
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case depth == 0 && strings.HasPrefix(trimmed, "["):
			if sawMoves {
				flush()
			}
		case depth == 0 && trimmed != "" && !strings.HasPrefix(trimmed, "%"):
			if ended {
				flush() // a game after a finished one, with or without tags
			}
			sawMoves = true
			var last string
			depth, last = scanMoveText(line, depth)
			ended = depth == 0 && isResult(last)
		case depth > 0:
			var last string
			depth, last = scanMoveText(line, depth)
			ended = depth == 0 && isResult(last)
		}
		cur.WriteString(line)
		cur.WriteByte('\n')
	}
	flush()
	return games
}

// scanMoveText follows the comment depth through one line of move text and gives back the
// last token outside comments.
func scanMoveText(line string, depth int) (int, string) {
	var plain strings.Builder
	for _, r := range line {
		switch {
		case depth == 0 && r == ';':
			return 0, lastToken(plain.String())
		case r == '{':
			depth++
		case r == '}':
			if depth > 0 {
				depth--
			}
			plain.WriteByte(' ')
		case depth == 0:
			plain.WriteRune(r)
		}
	}
	return depth, lastToken(plain.String())
}

func lastToken(s string) string {
	f := strings.Fields(s)
	if len(f) == 0 {
		return ""
	}
	return f[len(f)-1]
}

func isResult(tok string) bool {
	return tok == "1-0" || tok == "0-1" || tok == "1/2-1/2" || tok == "*"
}

var (
	moveNumber = regexp.MustCompile(`^[0-9]+\.+`)
	annotation = regexp.MustCompile(`[+#!?]+$`)
	barePromo  = regexp.MustCompile(`^((?:[a-h]x)?[a-h][18])([QRBN])$`)
)

// normalize rewrites, in move text only (never in tags or comments), what the library's lexer
// misreads: castling with zeros (0-0, 0-0-0), read as a move number; a promotion without "="
// (e8Q); and a ";" comment, which holds no moves and is dropped (a brace in one confuses the
// lexer). This is spelling, not rules: the library still checks each move. The stored PGN is the
// text as given.
func normalize(text string) string {
	var out strings.Builder
	depth := 0
	for _, line := range strings.SplitAfter(text, "\n") {
		if depth == 0 && strings.HasPrefix(strings.TrimSpace(line), "[") {
			out.WriteString(line)
			continue
		}
		var plain strings.Builder
		emit := func() {
			out.WriteString(fixTokens(plain.String()))
			plain.Reset()
		}
		for i, r := range line {
			switch {
			case depth == 0 && r == ';':
				emit()
				if strings.HasSuffix(line[i:], "\n") {
					out.WriteByte('\n')
				}
				goto next
			case r == '{':
				emit()
				depth++
				out.WriteRune(r)
			case r == '}' && depth > 0:
				depth--
				out.WriteRune(r)
			case depth > 0:
				out.WriteRune(r)
			default:
				plain.WriteRune(r)
			}
		}
		emit()
	next:
	}
	return out.String()
}

// fixTokens rewrites each whitespace-separated token of plain move text, keeping the spacing.
func fixTokens(s string) string {
	return regexp.MustCompile(`\S+`).ReplaceAllStringFunc(s, func(tok string) string {
		num := moveNumber.FindString(tok)
		rest := tok[len(num):]
		suffix := annotation.FindString(rest)
		core := rest[:len(rest)-len(suffix)]
		switch core {
		case "0-0":
			core = "O-O"
		case "0-0-0":
			core = "O-O-O"
		default:
			if m := barePromo.FindStringSubmatch(core); m != nil {
				core = m[1] + "=" + m[2]
			}
		}
		return num + core + suffix
	})
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
	sc := chess.NewScanner(strings.NewReader(normalize(text)))
	if !sc.HasNext() {
		return nil, errors.New("no game in the text")
	}
	scanned, err := sc.ScanGame()
	if err != nil {
		return nil, fmt.Errorf("unreadable PGN: %w", err)
	}
	// Never drop a game silently: text left over is this part's error.
	if sc.HasNext() {
		return nil, errors.New("more than one game ran together here; leave a blank line and tags between games")
	}
	g, err = parse(scanned)
	if g != nil {
		g.Raw = strings.TrimSpace(text) // as given, not as normalized
	}
	return g, err
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
		u := chess.UCINotation{}.Encode(nil, m)
		if i < len(positions) && (i < firstPlies || i < IndexedPlies) {
			s := chess.AlgebraicNotation{}.Encode(positions[i], m)
			if i < firstPlies {
				san = append(san, s)
			}
			if i < IndexedPlies {
				g.Steps = append(g.Steps, Step{Position: epd(positions[i]), UCI: u, SAN: s})
			}
		}
		uci = append(uci, u)
	}
	g.FirstMoves = numbered(san, positions)

	// Openings are named by position, the deepest the game reaches from wherever it starts, so
	// another move order (1. Nf3 c5 2. e4 into a Najdorf) finds the same name.
	for i := len(positions) - 1; i >= 0; i-- {
		if o, ok := openings()[epd(positions[i])]; ok {
			g.ECO, g.Opening = o.code, o.title
			break
		}
	}
	if g.ECO == "" {
		// The PGN's own tag, kept only as a plain code (some exports write C42a).
		if code := ecoCode.FindString(tag("ECO")); code != "" {
			g.ECO, g.Opening = code, tag("Opening")
		}
	}

	if g.Hash == "" {
		sum := sha256.Sum256([]byte(strings.Join([]string{
			strings.ToLower(g.White), strings.ToLower(g.Black), tag("Date"), tag("FEN"), strings.Join(uci, " "),
		}, "\x00")))
		g.Hash = "moves:" + hex.EncodeToString(sum[:16])
	}
	return g, nil
}

type named struct{ code, title string }

// The lichess-org/chess-openings table (CC0), pinned in contracts/fixtures/openings and copied
// here; the desktop app builds its own lookup from the same files, with the same key.
//
//go:embed openings/*.tsv
var openingFiles embed.FS

var (
	bookOnce sync.Once
	byEPD    map[string]named
	ecoCode  = regexp.MustCompile(`^[A-E][0-9]{2}`)
)

// openings indexes the table by the position each line reaches, once: each line is read by the
// chess library, as any game is.
func openings() map[string]named {
	bookOnce.Do(func() {
		byEPD = map[string]named{}
		for _, f := range []string{"a", "b", "c", "d", "e"} {
			file, err := openingFiles.Open("openings/" + f + ".tsv")
			if err != nil {
				panic(err) // embedded at build time: never missing
			}
			sc := bufio.NewScanner(file)
			sc.Scan() // eco, name, pgn
			for sc.Scan() {
				cols := strings.Split(sc.Text(), "\t")
				if len(cols) != 3 {
					continue
				}
				lib := chess.NewScanner(strings.NewReader(cols[2] + " *"))
				if !lib.HasNext() {
					continue
				}
				cg, err := lib.ParseNext()
				if err != nil {
					continue
				}
				positions := cg.Positions()
				key := epd(positions[len(positions)-1])
				if _, seen := byEPD[key]; !seen {
					byEPD[key] = named{cols[0], cols[1]}
				}
			}
			_ = file.Close()
		}
	})
	return byEPD
}

// StandardCastling turns lichess's castling, written as the king taking its own rook (e1h1),
// into standard UCI (e1g1), when fen has the king and rook of the side to move on those squares.
// Any other
// move comes back unchanged. The board is read by the chess library.
func StandardCastling(fen, uci string) string {
	if len(uci) != 4 {
		return uci
	}
	from, to := uci[:2], uci[2:]
	rank := from[1:]
	if (from != "e1" && from != "e8") || to[1:] != rank || (to[0] != 'a' && to[0] != 'h') {
		return uci
	}
	opt, err := chess.FEN(fen)
	if err != nil {
		return uci
	}
	pos := chess.NewGame(opt).Position()
	board := pos.Board().SquareMap()
	at := func(name string) chess.Piece {
		for sq, p := range board {
			if sq.String() == name {
				return p
			}
		}
		return chess.NoPiece
	}
	king, rook := at(from), at(to)
	if king.Type() != chess.King || rook.Type() != chess.Rook || king.Color() != rook.Color() || king.Color() != pos.Turn() {
		return uci
	}
	if to[0] == 'h' {
		return from + "g" + rank
	}
	return from + "c" + rank
}

// OpeningOf names a position key (board, side to move, castling, en passant), when the
// opening table does.
func OpeningOf(position string) (eco, name string, ok bool) {
	o, ok := openings()[position]
	return o.code, o.title, ok
}

// PositionKey checks fen with the chess library and gives the position back as a FEN with
// neutral counters ("... 0 1") and an en passant square only when a capture is legal: the same
// position reached by any move order has the same key (the explorer's cache key).
func PositionKey(fen string) (key string, err error) {
	defer func() {
		if r := recover(); r != nil {
			key, err = "", fmt.Errorf("not a legal position: %v", r)
		}
	}()
	opt, err := chess.FEN(fen)
	if err != nil {
		return "", fmt.Errorf("not a legal position: %w", err)
	}
	pos := chess.NewGame(opt).Position()
	// The library reads a board without kings; chess does not.
	board := strings.Fields(pos.String())[0]
	if strings.Count(board, "K") != 1 || strings.Count(board, "k") != 1 {
		return "", errors.New("not a legal position: each side has one king")
	}
	return epd(pos) + " 0 1", nil
}

// epd keys a position for the opening table, as the desktop does: board, side to move, castling,
// and the en passant square only when an en passant capture is legal. The library writes that
// square after any double pawn step; kept as it is, 5. d4 into a position would not match the
// same position reached by 5. Nf3. Legality is the library's answer, never ours.
func epd(p *chess.Position) string {
	f := strings.Fields(p.String())
	if len(f) < 4 {
		return strings.Join(f, " ")
	}
	if f[3] != "-" {
		legal := false
		for _, m := range p.ValidMoves() {
			if m.HasTag(chess.EnPassant) {
				legal = true
				break
			}
		}
		if !legal {
			f[3] = "-"
		}
	}
	return strings.Join(f[:4], " ")
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

var (
	lichessID = regexp.MustCompile(`^[A-Za-z0-9]{8}([A-Za-z0-9]{4})?$`)
	// Lichess pages whose name has the shape of a game id.
	lichessPages = map[string]bool{"analysis": true, "training": true, "practice": true, "streamer": true,
		"insights": true, "calendar": true, "research": true, "patron": true}
	chessComID = regexp.MustCompile(`^[0-9]+$`)
)

// siteOf finds the game's page and its id on the site. Lichess: lichess.org/<id>, also written
// lichess.org/game/<id> or with a side after it; an id is 8 letters and digits (12 when it names a
// side), so a tournament or broadcast page is no game. The page given back is the plain one.
// Chess.com, in the Link tag: chess.com/game/<live|daily>/<number>, or the older
// chess.com/<live|daily>/game/<number>.
func siteOf(site, link string) (pageURL, hash string) {
	for _, raw := range []string{link, site} {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
			continue
		}
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		host := strings.TrimPrefix(u.Host, "www.")
		switch host {
		case "lichess.org":
			id := parts[0]
			if id == "game" && len(parts) >= 2 {
				id = parts[1]
			}
			if !lichessID.MatchString(id) || lichessPages[strings.ToLower(id)] {
				return raw, ""
			}
			return "https://lichess.org/" + id[:8], "lichess:" + id[:8]
		case "chess.com":
			if len(parts) < 3 {
				return raw, ""
			}
			kind, id := "", parts[2]
			switch {
			case parts[0] == "game" && (parts[1] == "live" || parts[1] == "daily"):
				kind = parts[1]
			case parts[1] == "game" && (parts[0] == "live" || parts[0] == "daily"):
				kind = parts[0]
			}
			if kind == "" || !chessComID.MatchString(id) {
				return raw, ""
			}
			return raw, "chesscom:" + kind + "/" + id
		}
		return raw, ""
	}
	return "", ""
}

// numbered writes SAN with move numbers, from where the game starts: "1. e4 e5", or from a
// position with Black to move at move 40, "40... a1=N 41. Kd2".
func numbered(san []string, positions []*chess.Position) string {
	move, black := 1, false
	if len(positions) > 0 {
		f := strings.Fields(positions[0].String())
		if len(f) >= 6 {
			black = f[1] == "b"
			if n, err := strconv.Atoi(f[5]); err == nil && n > 0 {
				move = n
			}
		}
	}
	var b strings.Builder
	for i, m := range san {
		if i > 0 {
			b.WriteByte(' ')
		}
		switch {
		case i == 0 && black:
			fmt.Fprintf(&b, "%d... ", move)
		case !black:
			fmt.Fprintf(&b, "%d. ", move)
		}
		b.WriteString(m)
		if black {
			move++
		}
		black = !black
	}
	return b.String()
}
