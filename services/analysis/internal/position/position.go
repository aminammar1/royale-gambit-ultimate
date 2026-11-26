// Package position checks a request's position before it reaches Stockfish, with a maintained
// chess library (ADR-03): the FEN must parse and be a position the engine can search, and every
// move must be legal. Stockfish trusts its input and can crash on a board without a king, so
// nothing unchecked is ever sent to it.
package position

import (
	"errors"
	"fmt"
	"strings"

	"github.com/corentings/chess/v2"
)

// Position is a checked request position.
type Position struct {
	// StartFEN is the request's FEN, with castling rights that the board cannot support removed.
	StartFEN string
	// Moves are the request's UCI moves, all legal, played from StartFEN.
	Moves []string
	// FEN is the position after the moves; EPD is the same without the move clocks.
	FEN string
	EPD string
	// SideToMove is 'w' or 'b' in the final position.
	SideToMove byte
	// Terminal is true when the side to move has no legal move (checkmate or stalemate).
	Terminal bool
}

// ErrInvalid wraps every reason a position is refused; the message is safe to show.
var ErrInvalid = errors.New("invalid position")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

// Resolve checks fen and plays moves on it.
func Resolve(fen string, moves []string) (Position, error) {
	fields := strings.Fields(fen)
	if len(fields) != 6 {
		return Position{}, invalid("a FEN has six fields, this one has %d", len(fields))
	}
	opt, err := chess.FEN(strings.Join(fields, " "))
	if err != nil {
		return Position{}, invalid("the FEN does not parse")
	}
	start := chess.NewGame(opt).Position()
	if err := searchable(start); err != nil {
		return Position{}, err
	}
	fields[2] = castling(start.Board(), fields[2])
	startFEN := strings.Join(fields, " ")

	opt, err = chess.FEN(startFEN)
	if err != nil {
		return Position{}, invalid("the FEN does not parse")
	}
	game := chess.NewGame(opt)
	for i, m := range moves {
		if err := game.PushNotationMove(m, chess.UCINotation{}, nil); err != nil {
			return Position{}, invalid("move %d (%s) is not legal in that position", i+1, m)
		}
	}
	final := game.Position()
	finalFEN := final.String()
	fields = strings.Fields(finalFEN)
	if fields[3] != "-" && !canTakeEnPassant(final) {
		fields[3] = "-" // the usual EPD convention: no square when no capture can use it
	}
	side := byte('w')
	if final.Turn() == chess.Black {
		side = 'b'
	}
	return Position{
		StartFEN:   startFEN,
		Moves:      append([]string(nil), moves...),
		FEN:        finalFEN,
		EPD:        strings.Join(fields[:4], " "),
		SideToMove: side,
		Terminal:   len(final.ValidMoves()) == 0,
	}, nil
}

func canTakeEnPassant(pos *chess.Position) bool {
	for _, m := range pos.ValidMoves() {
		if m.HasTag(chess.EnPassant) {
			return true
		}
	}
	return false
}

// searchable refuses boards Stockfish cannot search: not exactly one king a side, a pawn on
// the first or last rank, or the side that just moved left in check.
func searchable(pos *chess.Position) error {
	kings := map[chess.Color]chess.Square{}
	count := map[chess.Color]int{}
	for sq, p := range pos.Board().SquareMap() {
		switch p.Type() {
		case chess.King:
			kings[p.Color()] = sq
			count[p.Color()]++
		case chess.Pawn:
			if sq.Rank() == chess.Rank1 || sq.Rank() == chess.Rank8 {
				return invalid("a pawn stands on %s", sq)
			}
		}
	}
	if count[chess.White] != 1 || count[chess.Black] != 1 {
		return invalid("each side needs exactly one king")
	}
	// The side to move must not be able to take the other king: that king would be in check
	// with its own side not to move, which no game can reach.
	enemy := kings[pos.Turn().Other()]
	for _, list := range [][]chess.Move{pos.ValidMoves(), pos.UnsafeMoves()} {
		for _, m := range list {
			if m.S2() == enemy {
				return invalid("the side not to move is in check")
			}
		}
	}
	return nil
}

// castling keeps only the rights whose king and rook still stand on their starting squares.
func castling(b *chess.Board, rights string) string {
	has := func(sq chess.Square, p chess.Piece) bool { return b.Piece(sq) == p }
	keep := map[rune]bool{
		'K': has(chess.E1, chess.WhiteKing) && has(chess.H1, chess.WhiteRook),
		'Q': has(chess.E1, chess.WhiteKing) && has(chess.A1, chess.WhiteRook),
		'k': has(chess.E8, chess.BlackKing) && has(chess.H8, chess.BlackRook),
		'q': has(chess.E8, chess.BlackKing) && has(chess.A8, chess.BlackRook),
	}
	var out strings.Builder
	for _, r := range "KQkq" {
		if strings.ContainsRune(rights, r) && keep[r] {
			out.WriteRune(r)
		}
	}
	if out.Len() == 0 {
		return "-"
	}
	return out.String()
}
