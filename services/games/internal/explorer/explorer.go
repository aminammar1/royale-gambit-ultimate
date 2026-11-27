// Package explorer answers what was played from a position, from lichess's opening explorer
// (M12): the masters database (anyone) or lichess.org's games (the player's own Lichess token,
// fetched from auth-profile, never sent to the app). Answers are cached by position and
// database; the cache only holds what can be fetched again (ADR-06).
package explorer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
)

var (
	// ErrLichessNeeded: the lichess database needs the player to sign in with Lichess.
	ErrLichessNeeded = errors.New("a lichess sign-in is needed")
	// ErrUnavailable: lichess's explorer is busy or down.
	ErrUnavailable = errors.New("the explorer is unavailable")
	// ErrNotFound: no such game.
	ErrNotFound = errors.New("no such game")
	// ErrInvalidPosition: lichess refuses the position (a check on the side not to move, a pawn
	// on the back rank...).
	ErrInvalidPosition = errors.New("lichess refuses this position")
	// ErrNoToken, from Tokens: the player has no Lichess token.
	ErrNoToken = errors.New("no lichess token")
)

// Tokens gives a player's Lichess token (auth-profile), or ErrNoToken.
type Tokens interface {
	LichessToken(ctx context.Context, user uuid.UUID) (string, error)
}

// Cache keeps answers; a miss or a failure just means asking lichess again.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, bool)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration)
}

// Explorer asks lichess.
type Explorer struct {
	Base      string // explorer.lichess.ovh
	Lichess   string // lichess.org, for a lichess game's PGN
	UserAgent string
	HTTP      *http.Client
	Tokens    Tokens
	Cache     Cache
}

// Player is one side of a top game.
type Player struct {
	Name   string `json:"name"`
	Rating *int   `json:"rating"`
}

// Move is a move played from the position (contract: Explorer.moves).
type Move struct {
	UCI           string `json:"uci"`
	SAN           string `json:"san"`
	White         int    `json:"white"`
	Draws         int    `json:"draws"`
	Black         int    `json:"black"`
	AverageRating *int   `json:"average_rating"`
}

// Game is a top game that reached the position.
type Game struct {
	ID     string  `json:"id"`
	White  Player  `json:"white"`
	Black  Player  `json:"black"`
	Winner *string `json:"winner"`
	Year   *int    `json:"year"`
	UCI    string  `json:"uci"`
}

// Opening names the position.
type Opening struct {
	ECO  string `json:"eco"`
	Name string `json:"name"`
}

// Result is the contract's Explorer.
type Result struct {
	DB       string   `json:"db"`
	White    int      `json:"white"`
	Draws    int      `json:"draws"`
	Black    int      `json:"black"`
	Opening  *Opening `json:"opening"`
	Moves    []Move   `json:"moves"`
	TopGames []Game   `json:"top_games"`
}

// How long an answer is kept: the masters change with each monthly update, lichess's daily.
var ttl = map[string]time.Duration{"masters": 7 * 24 * time.Hour, "lichess": 24 * time.Hour}

// Explore answers db ("masters" or "lichess") for fen, a legal FEN; key is the position's own
// key (pgn.PositionKey), shared by every move order that reaches it. cached says the answer
// came from the cache.
func (e *Explorer) Explore(ctx context.Context, db, fen string, user uuid.UUID) (Result, bool, error) {
	key := "explorer:v2:" + db + ":" + fen // v2: castling in standard UCI
	if raw, ok := e.Cache.Get(ctx, key); ok {
		var r Result
		if json.Unmarshal(raw, &r) == nil {
			return r, true, nil
		}
	}
	q := url.Values{"fen": {fen}, "moves": {"12"}, "topGames": {"8"}}
	token := ""
	if db == "lichess" {
		t, err := e.Tokens.LichessToken(ctx, user)
		if errors.Is(err, ErrNoToken) {
			return Result{}, false, ErrLichessNeeded
		}
		if err != nil {
			return Result{}, false, fmt.Errorf("%w: %v", ErrUnavailable, err)
		}
		token = t
		// Games people play: blitz to classical, rated 1800 and up.
		q.Set("speeds", "blitz,rapid,classical")
		q.Set("ratings", "1800,2000,2200,2500")
		q.Set("recentGames", "0")
	}
	body, err := e.get(ctx, e.Base+"/"+db+"?"+q.Encode(), token, "application/json")
	if err != nil {
		return Result{}, false, err
	}
	var raw struct {
		White, Draws, Black int
		Opening             *Opening
		Moves               []struct {
			UCI, SAN            string
			AverageRating       *int `json:"averageRating"`
			White, Draws, Black int
		}
		TopGames []struct {
			UCI, ID      string
			Winner       *string
			White, Black Player
			Year         *int
		} `json:"topGames"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return Result{}, false, fmt.Errorf("%w: unreadable answer", ErrUnavailable)
	}
	r := Result{DB: db, White: raw.White, Draws: raw.Draws, Black: raw.Black, Opening: raw.Opening,
		Moves: []Move{}, TopGames: []Game{}}
	for _, m := range raw.Moves {
		r.Moves = append(r.Moves, Move{UCI: pgn.StandardCastling(fen, m.UCI), SAN: m.SAN, White: m.White, Draws: m.Draws, Black: m.Black, AverageRating: m.AverageRating})
	}
	for _, g := range raw.TopGames {
		r.TopGames = append(r.TopGames, Game{ID: g.ID, White: g.White, Black: g.Black, Winner: g.Winner, Year: g.Year,
			UCI: pgn.StandardCastling(fen, g.UCI)})
	}
	if out, err := json.Marshal(r); err == nil {
		e.Cache.Set(context.WithoutCancel(ctx), key, out, ttl[db])
	}
	return r, false, nil
}

// GamePGN is a top game's PGN: a masters game from the explorer, a lichess game from lichess.org
// (both public, no token).
func (e *Explorer) GamePGN(ctx context.Context, db, id string) (string, error) {
	key := "explorer:v2:pgn:" + db + ":" + id
	if raw, ok := e.Cache.Get(ctx, key); ok {
		return string(raw), nil
	}
	u := e.Base + "/masters/pgn/" + url.PathEscape(id)
	if db == "lichess" {
		u = e.Lichess + "/game/export/" + url.PathEscape(id) + "?clocks=false&evals=false"
	}
	body, err := e.get(ctx, u, "", "application/x-chess-pgn")
	if err != nil {
		return "", err
	}
	e.Cache.Set(context.WithoutCancel(ctx), key, body, 30*24*time.Hour)
	return string(body), nil
}

func (e *Explorer) get(ctx context.Context, u, token, accept string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", e.UserAgent)
	req.Header.Set("Accept", accept)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	hc := e.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: 8 * time.Second}
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusUnauthorized && token != "":
		return nil, ErrLichessNeeded // the token was revoked or expired: sign in again
	case resp.StatusCode == http.StatusNotFound:
		return nil, ErrNotFound
	case resp.StatusCode == http.StatusBadRequest:
		return nil, ErrInvalidPosition
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("%w: lichess answered %s", ErrUnavailable, resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	return body, nil
}

// TokensFunc makes a function a Tokens.
type TokensFunc func(ctx context.Context, user uuid.UUID) (string, error)

// LichessToken implements Tokens.
func (f TokensFunc) LichessToken(ctx context.Context, user uuid.UUID) (string, error) {
	return f(ctx, user)
}
