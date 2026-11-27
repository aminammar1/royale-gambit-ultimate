// Package store keeps the games service's data in its own Postgres database (ADR-06): games,
// import jobs, the outbox of events to publish, and the events already consumed.
package store

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // the pgx5:// driver
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/trace"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/pgn"
)

//go:embed migrations/*.sql
var migrations embed.FS

var (
	// ErrNotFound: no such row for this owner.
	ErrNotFound = errors.New("not found")
	// ErrBadCursor: a cursor this service did not write.
	ErrBadCursor = errors.New("bad cursor")
	// ErrTooManyImports: the owner already has MaxLiveImports queued or running.
	ErrTooManyImports = errors.New("too many imports")
)

// MaxLiveImports is how many imports one player may have queued or running at once.
const MaxLiveImports = 3

// StaleAfter is how long a live import may go without progress before it is ended as failed:
// its worker died, or its message was dead-lettered. A username can then be imported again.
var StaleAfter = 15 * time.Minute

const staleReason = "This import stopped making progress and was ended. Try again."

// Store is the service's database.
type Store struct{ pool *pgxpool.Pool }

// Migrate brings the schema up to date. url is postgres://...
func Migrate(url string) error {
	src, err := iofs.New(migrations, "migrations")
	if err != nil {
		return err
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, "pgx5://"+strings.TrimPrefix(strings.TrimPrefix(url, "postgresql://"), "postgres://"))
	if err != nil {
		return fmt.Errorf("migrations: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migrations: %w", err)
	}
	return nil
}

// Open connects to Postgres.
func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close ends every connection.
func (s *Store) Close() { s.pool.Close() }

// Ping checks the database answers.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// Summary is a game as a search lists it (contract: GameSummary).
type Summary struct {
	ID          uuid.UUID  `json:"id"`
	Source      string     `json:"source"`
	SiteURL     *string    `json:"site_url"`
	White       string     `json:"white"`
	Black       string     `json:"black"`
	WhiteElo    *int       `json:"white_elo"`
	BlackElo    *int       `json:"black_elo"`
	Result      string     `json:"result"`
	PlayedAt    *time.Time `json:"played_at"`
	Event       *string    `json:"event"`
	TimeControl *string    `json:"time_control"`
	ECO         *string    `json:"eco"`
	Opening     *string    `json:"opening"`
	PlyCount    int        `json:"ply_count"`
	FirstMoves  string     `json:"first_moves"`
	CreatedAt   time.Time  `json:"created_at"`
	sortAt      time.Time
}

// Game is one game with its PGN (contract: Game).
type Game struct {
	Summary
	PGN string `json:"pgn"`
}

const summaryCols = `id, source, site_url, white, black, white_elo, black_elo, result, played_at, event,
	time_control, eco, opening, ply_count, first_moves, created_at, sort_at`

func scanSummary(row pgx.Row, extra ...any) (Summary, error) {
	var g Summary
	dst := append([]any{&g.ID, &g.Source, &g.SiteURL, &g.White, &g.Black, &g.WhiteElo, &g.BlackElo, &g.Result,
		&g.PlayedAt, &g.Event, &g.TimeControl, &g.ECO, &g.Opening, &g.PlyCount, &g.FirstMoves, &g.CreatedAt, &g.sortAt},
		extra...)
	err := row.Scan(dst...)
	return g, err
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// SaveResult says what one save did.
type SaveResult struct {
	Saved      []Summary
	Duplicates int
}

// SaveGames adds games to owner's library in one transaction, each with a game.saved event; a
// game the owner already has (same hash) is counted as a duplicate and left alone.
func (s *Store) SaveGames(ctx context.Context, owner uuid.UUID, source string, jobID *uuid.UUID, games []*pgn.Game) (SaveResult, error) {
	var res SaveResult
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		for _, g := range games {
			id := uuid.Must(uuid.NewV7())
			row := tx.QueryRow(ctx, `
				INSERT INTO games (id, owner_id, game_hash, source, import_job_id, site_url, white, black,
					white_elo, black_elo, result, played_at, event, time_control, eco, opening, ply_count,
					first_moves, pgn, indexed)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true)
				ON CONFLICT (owner_id, game_hash) DO NOTHING
				RETURNING `+summaryCols,
				id, owner, g.Hash, source, jobID, nullable(g.SiteURL), g.White, g.Black, g.WhiteElo, g.BlackElo,
				g.Result, g.PlayedAt, nullable(g.Event), nullable(g.TimeControl), nullable(g.ECO), nullable(g.Opening),
				g.PlyCount, g.FirstMoves, g.Raw)
			saved, err := scanSummary(row)
			if errors.Is(err, pgx.ErrNoRows) {
				res.Duplicates++
				continue
			}
			if err != nil {
				return err
			}
			res.Saved = append(res.Saved, saved)
			if err := indexGame(ctx, tx, owner, saved.ID, saved.Result, g.Steps); err != nil {
				return err
			}
			if err := addEvent(ctx, tx, "game.saved", map[string]any{
				"game_id": saved.ID, "user_id": owner, "source": source, "import_job_id": jobID, "saved_at": saved.CreatedAt,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	return res, err
}

// indexGame counts a game's first moves for its owner's explorer, from its result: one move per
// position, the first the game played there (a game that comes back and leaves by another move
// is still one game there), and that first visit for its top games. An unfinished game scores
// nothing but still goes through its positions. Rows are written in (position, move) order, so
// two saves at once lock them in the same order and cannot deadlock.
func indexGame(ctx context.Context, tx pgx.Tx, owner, gameID uuid.UUID, result string, steps []pgn.Step) error {
	if len(steps) == 0 {
		return nil
	}
	var w, d, b int
	switch result {
	case "1-0":
		w = 1
	case "0-1":
		b = 1
	case "1/2-1/2":
		d = 1
	}
	type visit struct {
		ply  int
		step pgn.Step
	}
	var visits []visit
	first := map[string]bool{}
	for i, st := range steps {
		if !first[st.Position] {
			first[st.Position] = true
			visits = append(visits, visit{i, st})
		}
	}
	sort.Slice(visits, func(a, b int) bool {
		if visits[a].step.Position != visits[b].step.Position {
			return visits[a].step.Position < visits[b].step.Position
		}
		return visits[a].step.UCI < visits[b].step.UCI
	})
	var mPos, mUCI, mSAN, gPos, gUCI []string
	var gPly []int32
	for _, v := range visits {
		mPos, mUCI, mSAN = append(mPos, v.step.Position), append(mUCI, v.step.UCI), append(mSAN, v.step.SAN)
		gPos, gUCI, gPly = append(gPos, v.step.Position), append(gUCI, v.step.UCI), append(gPly, int32(v.ply))
	}
	if w+d+b > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO position_moves (owner_id, position, uci, san, white, draws, black)
			SELECT $1, p, u, s, $5, $6, $7 FROM unnest($2::text[], $3::text[], $4::text[]) AS t (p, u, s)
			ON CONFLICT (owner_id, position, uci) DO UPDATE SET
				white = position_moves.white + excluded.white,
				draws = position_moves.draws + excluded.draws,
				black = position_moves.black + excluded.black`,
			owner, mPos, mUCI, mSAN, w, d, b); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO game_positions (owner_id, position, game_id, ply, uci)
		SELECT $1, p, $2, n, u FROM unnest($3::text[], $4::int[], $5::text[]) AS t (p, n, u)
		ON CONFLICT DO NOTHING`, owner, gameID, gPos, gPly, gUCI)
	return err
}

// Backfill indexes up to n games saved before the explorer's index existed; it answers how many
// it did (0: none left). Safe to run from several workers at once.
func (s *Store) Backfill(ctx context.Context, n int) (int, error) {
	done := 0
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, owner_id, pgn, result FROM games WHERE NOT indexed
			ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, n)
		if err != nil {
			return err
		}
		type todo struct {
			id, owner   uuid.UUID
			text, score string
		}
		list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (todo, error) {
			var t todo
			err := r.Scan(&t.id, &t.owner, &t.text, &t.score)
			return t, err
		})
		if err != nil {
			return err
		}
		for _, t := range list {
			// A game that no longer reads is only marked: there is nothing to count.
			if g, err := pgn.One(t.text); err == nil {
				if err := indexGame(ctx, tx, t.owner, t.id, t.score, g.Steps); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE games SET indexed = true WHERE id = $1`, t.id); err != nil {
				return err
			}
			done++
		}
		return nil
	})
	return done, err
}

// MyMove is a move the owner played from a position, scored.
type MyMove struct {
	UCI, SAN            string
	White, Draws, Black int
}

// MyTop is one of the owner's games through a position, and the move played there.
type MyTop struct {
	Summary
	UCI string
}

// Mine is the owner's own explorer at a position.
type Mine struct {
	White, Draws, Black int
	Moves               []MyMove
	Top                 []MyTop
}

// MyExplorer answers the owner's games at position (an opening-table key): the moves played
// from it, most played first, and the newest games through it.
func (s *Store) MyExplorer(ctx context.Context, owner uuid.UUID, position string) (Mine, error) {
	var m Mine
	if err := s.pool.QueryRow(ctx, `SELECT coalesce(sum(white), 0), coalesce(sum(draws), 0), coalesce(sum(black), 0)
		FROM position_moves WHERE owner_id = $1 AND position = $2`, owner, position).Scan(&m.White, &m.Draws, &m.Black); err != nil {
		return m, err
	}
	rows, err := s.pool.Query(ctx, `SELECT uci, san, white, draws, black FROM position_moves
		WHERE owner_id = $1 AND position = $2 ORDER BY white + draws + black DESC, uci LIMIT 12`, owner, position)
	if err != nil {
		return m, err
	}
	if m.Moves, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (MyMove, error) {
		var mv MyMove
		err := r.Scan(&mv.UCI, &mv.SAN, &mv.White, &mv.Draws, &mv.Black)
		return mv, err
	}); err != nil {
		return m, err
	}
	rows, err = s.pool.Query(ctx, `SELECT `+summaryCols+`, p.uci FROM games g
		JOIN game_positions p ON p.game_id = g.id
		WHERE p.owner_id = $1 AND p.position = $2 ORDER BY g.sort_at DESC, g.id DESC LIMIT 8`, owner, position)
	if err != nil {
		return m, err
	}
	defer rows.Close()
	for rows.Next() {
		var t MyTop
		sum, err := scanSummary(rows, &t.UCI)
		if err != nil {
			return m, err
		}
		t.Summary = sum
		m.Top = append(m.Top, t)
	}
	return m, rows.Err()
}

// Viewed is a top game a player opened from the explorer.
type Viewed struct {
	DB     string  `json:"db"`
	ID     string  `json:"id"`
	White  string  `json:"white"`
	Black  string  `json:"black"`
	Result string  `json:"result"`
	Year   *int    `json:"year"`
	Event  *string `json:"event"`
}

// PopularGame is a top game and how many players opened it lately (contract: PopularGame).
type PopularGame struct {
	Viewed
	Views int `json:"views"`
}

// RecordView counts viewer opening a top game today; twice the same day is once.
func (s *Store) RecordView(ctx context.Context, viewer uuid.UUID, v Viewed) error {
	_, err := s.pool.Exec(ctx, `INSERT INTO game_views (day, db, game_id, viewer, white, black, result, year, event)
		VALUES (current_date, $1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
		v.DB, v.ID, viewer, v.White, v.Black, v.Result, v.Year, v.Event)
	return err
}

// Popular lists the top games most players opened in the last days, at most 10.
func (s *Store) Popular(ctx context.Context, days int) ([]PopularGame, error) {
	rows, err := s.pool.Query(ctx, `SELECT db, game_id, max(white), max(black), max(result), max(year), max(event), count(*)
		FROM game_views WHERE day > current_date - $1::int
		GROUP BY db, game_id ORDER BY count(*) DESC, max(day) DESC, game_id LIMIT 10`, days)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (PopularGame, error) {
		var p PopularGame
		err := r.Scan(&p.DB, &p.ID, &p.White, &p.Black, &p.Result, &p.Year, &p.Event, &p.Views)
		return p, err
	})
}

// Filter narrows a search (contract: searchGames).
type Filter struct {
	Q      string
	Player string
	Color  string // white or black, the side Player had
	Result string // win, loss or draw, from Player's side
	ECO    string // a code or its first letters
	Source string
	From   *time.Time
	To     *time.Time // a day, inclusive
	Limit  int
	Cursor string
}

type cursor struct {
	T  time.Time `json:"t"`
	ID uuid.UUID `json:"id"`
}

// Search lists owner's games newest first; next is empty on the last page.
func (s *Store) Search(ctx context.Context, owner uuid.UUID, f Filter) (games []Summary, next string, err error) {
	where := []string{"owner_id = $1"}
	args := []any{owner}
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	for _, word := range strings.Fields(strings.ToLower(f.Q)) {
		where = append(where, "search_text LIKE "+arg("%"+escapeLike(word)+"%"))
	}
	if f.Player != "" {
		p := arg(strings.ToLower(f.Player))
		isWhite, isBlack := "lower(white) = "+p, "lower(black) = "+p
		switch f.Color {
		case "white":
			where = append(where, isWhite)
		case "black":
			where = append(where, isBlack)
		default:
			where = append(where, "("+isWhite+" OR "+isBlack+")")
		}
		switch f.Result {
		case "win":
			where = append(where, "(("+isWhite+" AND result = '1-0') OR ("+isBlack+" AND result = '0-1'))")
		case "loss":
			where = append(where, "(("+isWhite+" AND result = '0-1') OR ("+isBlack+" AND result = '1-0'))")
		case "draw":
			where = append(where, "result = '1/2-1/2'")
		}
	}
	if f.ECO != "" {
		where = append(where, "eco LIKE "+arg(escapeLike(f.ECO)+"%"))
	}
	if f.Source != "" {
		where = append(where, "source = "+arg(f.Source))
	}
	if f.From != nil {
		where = append(where, "played_at >= "+arg(*f.From))
	}
	if f.To != nil {
		where = append(where, "played_at < "+arg(f.To.Add(24*time.Hour)))
	}
	if f.Cursor != "" {
		raw, err := base64.RawURLEncoding.DecodeString(f.Cursor)
		var c cursor
		if err != nil || json.Unmarshal(raw, &c) != nil || c.ID == uuid.Nil {
			return nil, "", ErrBadCursor
		}
		where = append(where, "(sort_at, id) < ("+arg(c.T)+", "+arg(c.ID)+")")
	}
	limit := f.Limit
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `SELECT `+summaryCols+` FROM games WHERE `+strings.Join(where, " AND ")+
		` ORDER BY sort_at DESC, id DESC LIMIT `+arg(limit+1), args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	for rows.Next() {
		g, err := scanSummary(rows)
		if err != nil {
			return nil, "", err
		}
		games = append(games, g)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	if len(games) > limit {
		games = games[:limit]
		last := games[limit-1]
		raw, _ := json.Marshal(cursor{T: last.sortAt, ID: last.ID})
		next = base64.RawURLEncoding.EncodeToString(raw)
	}
	if games == nil {
		games = []Summary{}
	}
	return games, next, nil
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// Get returns one of owner's games with its PGN.
func (s *Store) Get(ctx context.Context, owner, id uuid.UUID) (Game, error) {
	var g Game
	row := s.pool.QueryRow(ctx, `SELECT `+summaryCols+`, pgn FROM games WHERE owner_id = $1 AND id = $2`, owner, id)
	sum, err := scanSummary(row, &g.PGN)
	if errors.Is(err, pgx.ErrNoRows) {
		return Game{}, ErrNotFound
	}
	g.Summary = sum
	return g, err
}

// Record is a player's results with one colour (contract: Record).
type Record struct {
	Wins       int `json:"wins"`
	Draws      int `json:"draws"`
	Losses     int `json:"losses"`
	Unfinished int `json:"unfinished"`
}

// OpeningStats is one opening a player plays, scored from their side.
type OpeningStats struct {
	ECO     *string `json:"eco"`
	Opening *string `json:"opening"`
	Games   int     `json:"games"`
	Wins    int     `json:"wins"`
	Draws   int     `json:"draws"`
	Losses  int     `json:"losses"`
}

// PlayerStats is a player's record in the owner's games (contract: PlayerStats).
type PlayerStats struct {
	Player   string         `json:"player"`
	Games    int            `json:"games"`
	Rating   *int           `json:"rating"`
	AsWhite  Record         `json:"as_white"`
	AsBlack  Record         `json:"as_black"`
	Openings []OpeningStats `json:"openings"`
}

// PlayerStats scores player (case ignored) in owner's games, from the player's side.
func (s *Store) PlayerStats(ctx context.Context, owner uuid.UUID, player string) (PlayerStats, error) {
	st := PlayerStats{Player: player, Openings: []OpeningStats{}}
	const theirs = `FROM games WHERE owner_id = $1 AND (lower(white) = lower($2) OR lower(black) = lower($2))`
	// Win, draw, loss and unfinished from the player's side, as SQL over one game's row.
	const score = `
		count(*) FILTER (WHERE (lower(white) = lower($2) AND result = '1-0') OR (lower(black) = lower($2) AND result = '0-1')),
		count(*) FILTER (WHERE result = '1/2-1/2'),
		count(*) FILTER (WHERE (lower(white) = lower($2) AND result = '0-1') OR (lower(black) = lower($2) AND result = '1-0')),
		count(*) FILTER (WHERE result = '*')`
	for _, side := range []struct {
		col string
		dst *Record
	}{{"white", &st.AsWhite}, {"black", &st.AsBlack}} {
		r := side.dst
		if err := s.pool.QueryRow(ctx, `SELECT `+score+` FROM games WHERE owner_id = $1 AND lower(`+side.col+`) = lower($2)`,
			owner, player).Scan(&r.Wins, &r.Draws, &r.Losses, &r.Unfinished); err != nil {
			return st, err
		}
	}
	w, b := st.AsWhite, st.AsBlack
	st.Games = w.Wins + w.Draws + w.Losses + w.Unfinished + b.Wins + b.Draws + b.Losses + b.Unfinished
	if st.Games == 0 {
		return st, nil
	}
	// The newest game writes the name; the newest rating stands.
	err := s.pool.QueryRow(ctx, `SELECT CASE WHEN lower(white) = lower($2) THEN white ELSE black END `+theirs+`
		ORDER BY sort_at DESC, id DESC LIMIT 1`, owner, player).Scan(&st.Player)
	if err != nil {
		return st, err
	}
	err = s.pool.QueryRow(ctx, `SELECT CASE WHEN lower(white) = lower($2) THEN white_elo ELSE black_elo END `+theirs+`
		AND CASE WHEN lower(white) = lower($2) THEN white_elo ELSE black_elo END IS NOT NULL
		ORDER BY sort_at DESC, id DESC LIMIT 1`, owner, player).Scan(&st.Rating)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return st, err
	}
	rows, err := s.pool.Query(ctx, `SELECT eco, opening, count(*), `+score+` `+theirs+`
		GROUP BY eco, opening ORDER BY count(*) DESC, eco NULLS LAST LIMIT 5`, owner, player)
	if err != nil {
		return st, err
	}
	st.Openings, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (OpeningStats, error) {
		var o OpeningStats
		var unfinished int
		err := r.Scan(&o.ECO, &o.Opening, &o.Games, &o.Wins, &o.Draws, &o.Losses, &unfinished)
		return o, err
	})
	return st, err
}

// Job is an import (contract: ImportJob).
type Job struct {
	ID         uuid.UUID  `json:"id"`
	Owner      uuid.UUID  `json:"-"`
	Site       string     `json:"site"`
	Username   string     `json:"username"`
	MaxGames   int        `json:"max_games"`
	Status     string     `json:"status"`
	Fetched    int        `json:"fetched"`
	Saved      int        `json:"saved"`
	Duplicates int        `json:"duplicates"`
	Error      *string    `json:"error"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at"`
}

const jobCols = `id, owner_id, site, username, max_games, status, fetched, saved, duplicates, error, created_at, finished_at`

func scanJob(row pgx.Row) (Job, error) {
	var j Job
	err := row.Scan(&j.ID, &j.Owner, &j.Site, &j.Username, &j.MaxGames, &j.Status, &j.Fetched, &j.Saved,
		&j.Duplicates, &j.Error, &j.CreatedAt, &j.FinishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	return j, err
}

// CreateImport queues an import with its import.requested event, or, when the same owner already
// has one live for this site and username, returns that one (created false). The owner's stale
// imports are ended first; beyond MaxLiveImports live ones it is ErrTooManyImports.
func (s *Store) CreateImport(ctx context.Context, owner uuid.UUID, site, username string, max int) (Job, bool, error) {
	for attempt := 0; attempt < 3; attempt++ {
		var job Job
		created := false
		err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
			if err := expireStale(ctx, tx, `owner_id = $1`, owner); err != nil {
				return err
			}
			live, err := scanJob(tx.QueryRow(ctx, `SELECT `+jobCols+` FROM import_jobs
				WHERE owner_id = $1 AND site = $2 AND lower(username) = lower($3) AND status IN ('queued', 'running')`,
				owner, site, username))
			if err == nil {
				job = live
				return nil
			}
			if !errors.Is(err, ErrNotFound) {
				return err
			}
			var n int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM import_jobs
				WHERE owner_id = $1 AND status IN ('queued', 'running')`, owner).Scan(&n); err != nil {
				return err
			}
			if n >= MaxLiveImports {
				return ErrTooManyImports
			}
			j, err := scanJob(tx.QueryRow(ctx, `
				INSERT INTO import_jobs (id, owner_id, site, username, max_games, status)
				VALUES ($1, $2, $3, $4, $5, 'queued')
				ON CONFLICT (owner_id, site, lower(username)) WHERE status IN ('queued', 'running') DO NOTHING
				RETURNING `+jobCols, uuid.Must(uuid.NewV7()), owner, site, username, max))
			if err != nil {
				return err // ErrNotFound: another request created it a moment ago; try again
			}
			job, created = j, true
			return addEvent(ctx, tx, "import.requested", map[string]any{
				"job_id": j.ID, "user_id": owner, "site": site, "username": username, "max_games": max,
				"requested_at": j.CreatedAt,
			})
		})
		if errors.Is(err, ErrNotFound) {
			continue
		}
		return job, created, err
	}
	return Job{}, false, errors.New("could not create the import")
}

// ExpireIfStale ends one import as failed when it is live but has not moved for StaleAfter;
// true when it did.
func (s *Store) ExpireIfStale(ctx context.Context, id uuid.UUID) (bool, error) {
	ended := false
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		n, err := expireStaleCount(ctx, tx, `id = $1`, id)
		ended = n > 0
		return err
	})
	return ended, err
}

func expireStale(ctx context.Context, tx pgx.Tx, where string, arg any) error {
	_, err := expireStaleCount(ctx, tx, where, arg)
	return err
}

// expireStaleCount fails the live imports matching where that have not moved for StaleAfter,
// each with its game.imported event.
func expireStaleCount(ctx context.Context, tx pgx.Tx, where string, arg any) (int, error) {
	rows, err := tx.Query(ctx, `UPDATE import_jobs
		SET status = 'failed', error = $2, finished_at = now(), updated_at = now()
		WHERE `+where+` AND status IN ('queued', 'running') AND updated_at < now() - $3::interval
		RETURNING `+jobCols, arg, staleReason, StaleAfter.String())
	if err != nil {
		return 0, err
	}
	jobs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Job, error) { return scanJob(r) })
	if err != nil {
		return 0, err
	}
	for _, j := range jobs {
		if err := addEvent(ctx, tx, "game.imported", importedEvent(j)); err != nil {
			return 0, err
		}
	}
	return len(jobs), nil
}

func importedEvent(j Job) map[string]any {
	return map[string]any{
		"job_id": j.ID, "user_id": j.Owner, "site": j.Site, "username": j.Username, "status": j.Status,
		"fetched": j.Fetched, "saved": j.Saved, "duplicates": j.Duplicates, "finished_at": j.FinishedAt,
	}
}

// GetImport returns one of owner's imports.
func (s *Store) GetImport(ctx context.Context, owner, id uuid.UUID) (Job, error) {
	return scanJob(s.pool.QueryRow(ctx, `SELECT `+jobCols+` FROM import_jobs WHERE owner_id = $1 AND id = $2`, owner, id))
}

// Import returns an import whoever owns it, for the worker.
func (s *Store) Import(ctx context.Context, id uuid.UUID) (Job, error) {
	return scanJob(s.pool.QueryRow(ctx, `SELECT `+jobCols+` FROM import_jobs WHERE id = $1`, id))
}

// StartImport marks a queued import running; false when it is not queued (already handled).
func (s *Store) StartImport(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE import_jobs SET status = 'running', updated_at = now()
		WHERE id = $1 AND status = 'queued'`, id)
	return tag.RowsAffected() == 1, err
}

// ImportProgress records the counts so far.
func (s *Store) ImportProgress(ctx context.Context, id uuid.UUID, fetched, saved, duplicates int) error {
	_, err := s.pool.Exec(ctx, `UPDATE import_jobs SET fetched = $2, saved = $3, duplicates = $4, updated_at = now()
		WHERE id = $1`, id, fetched, saved, duplicates)
	return err
}

// FinishImport ends a live import as done or failed, with its game.imported event.
func (s *Store) FinishImport(ctx context.Context, id uuid.UUID, status, reason string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		j, err := scanJob(tx.QueryRow(ctx, `UPDATE import_jobs
			SET status = $2, error = $3, finished_at = now(), updated_at = now()
			WHERE id = $1 AND status IN ('queued', 'running') RETURNING `+jobCols, id, status, nullable(reason)))
		if errors.Is(err, ErrNotFound) {
			return nil // already finished: a redelivered event
		}
		if err != nil {
			return err
		}
		return addEvent(ctx, tx, "game.imported", importedEvent(j))
	})
}

// Event is an outbox row to publish.
type Event struct {
	ID       uuid.UUID
	Type     string
	Envelope []byte
}

// addEvent writes an event in tx, wrapped in the envelope of contracts/events.
func addEvent(ctx context.Context, tx pgx.Tx, kind string, data map[string]any) error {
	id := uuid.Must(uuid.NewV7())
	env, err := json.Marshal(map[string]any{
		"id": id, "type": kind, "occurred_at": time.Now().UTC(), "trace_id": traceID(ctx), "data": data,
	})
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox (id, type, envelope) VALUES ($1, $2, $3)`, id, kind, env)
	return err
}

// traceID is the request's trace, or a new one for work no request started.
func traceID(ctx context.Context) string {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		return sc.TraceID().String()
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Unpublished returns up to n events not yet published, oldest first.
func (s *Store) Unpublished(ctx context.Context, n int) ([]Event, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, type, envelope FROM outbox WHERE published_at IS NULL
		ORDER BY created_at, id LIMIT $1`, n)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Event, error) {
		var e Event
		err := r.Scan(&e.ID, &e.Type, &e.Envelope)
		return e, err
	})
}

// MarkPublished records that the broker accepted these events.
func (s *Store) MarkPublished(ctx context.Context, ids []uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `UPDATE outbox SET published_at = now() WHERE id = ANY($1)`, ids)
	return err
}

// Processed says whether a consumed event was already handled.
func (s *Store) Processed(ctx context.Context, id uuid.UUID) (bool, error) {
	var done bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM processed_events WHERE id = $1)`, id).Scan(&done)
	return done, err
}

// MarkProcessed records a consumed event; false when it was already handled.
func (s *Store) MarkProcessed(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := s.pool.Exec(ctx, `INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING`, id)
	return tag.RowsAffected() == 1, err
}
