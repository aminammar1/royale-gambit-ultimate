package app_test

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcrabbit "github.com/testcontainers/testcontainers-go/modules/rabbitmq"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/authprofile"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/broker"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/cache"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/explorer"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/importer"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/outbox"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/sites"
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/store"
)

var (
	api     *httptest.Server
	signKey *rsa.PrivateKey
	// release lets the fake Lichess answer, so a test can catch an import while it is live.
	release = make(chan struct{})
	// hold keeps the fake Lichess's "held" players from answering until a test lets go.
	hold = make(chan struct{})
	db   *store.Store
	// withLichess has signed in with Lichess; nobody else has.
	withLichess = uuid.Must(uuid.NewV7())
)

const issuer = "royale-gambit"

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	pg, err := tcpostgres.Run(ctx, "postgres:19.0-trixie", tcpostgres.WithDatabase("games"),
		tcpostgres.WithUsername("games"), tcpostgres.WithPassword("games"), tcpostgres.BasicWaitStrategies())
	if err != nil {
		fmt.Println("postgres:", err)
		return 1
	}
	defer func() { _ = testcontainers.TerminateContainer(pg) }()
	mq, err := tcrabbit.Run(ctx, "rabbitmq:4.4.1-management-alpine")
	if err != nil {
		fmt.Println("rabbitmq:", err)
		return 1
	}
	defer func() { _ = testcontainers.TerminateContainer(mq) }()

	dbURL, _ := pg.ConnectionString(ctx, "sslmode=disable")
	if err := store.Migrate(dbURL); err != nil {
		fmt.Println(err)
		return 1
	}
	db, err = store.Open(ctx, dbURL)
	if err != nil {
		fmt.Println(err)
		return 1
	}
	defer db.Close()
	amqpURL, _ := mq.AmqpURL(ctx)
	mqb, err := broker.Dial(amqpURL)
	if err != nil {
		fmt.Println(err)
		return 1
	}
	defer mqb.Close()
	if err := mqb.Declare(importer.Queue, importer.Event); err != nil {
		fmt.Println(err)
		return 1
	}

	// A fake Lichess: three standard games and one Chess960, once released.
	lichess := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/games/user/held") {
			<-hold
			return
		}
		if r.URL.Path != "/api/games/user/DrNykterstein" {
			http.NotFound(w, r)
			return
		}
		<-release
		for i, v := range []string{"standard", "chess960", "standard", "standard"} {
			pgn := fmt.Sprintf("[Site \"https://lichess.org/game000%d\"]\n[White \"DrNykterstein\"]\n[Black \"opp%d\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc%d 1-0\n", i, i, 6)
			_ = json.NewEncoder(w).Encode(map[string]any{"variant": v, "pgn": pgn})
		}
	}))
	defer lichess.Close()

	go (&outbox.Relay{Store: db, Pub: mqb, Log: log, Every: 50 * time.Millisecond}).Run(ctx)
	w := &importer.Worker{Store: db, Log: log, Batch: 2, Sites: map[string]sites.Fetcher{
		"lichess": &sites.Lichess{Base: lichess.URL, UserAgent: "test"},
	}}
	go func() { _ = mqb.Consume(ctx, importer.Queue, importer.Event, 1, w.Handle) }()

	// A fake auth-profile key set.
	signKey, _ = rsa.GenerateKey(rand.Reader, 2048)
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "kid": "k1", "use": "sig", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(signKey.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(signKey.E)).Bytes()),
		}}})
	}))
	defer jwks.Close()
	verifier, err := auth.NewVerifier(ctx, jwks.URL, issuer)
	if err != nil {
		fmt.Println(err)
		return 1
	}

	// A fake lichess explorer and a fake auth-profile.
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/masters" || (r.URL.Path == "/lichess" && r.Header.Get("Authorization") == "Bearer lip_ok"):
			_, _ = w.Write([]byte(`{"white":3,"draws":2,"black":1,"opening":{"eco":"B00","name":"King's Pawn Game"},"moves":[{"uci":"c7c5","san":"c5","averageRating":2400,"white":2,"draws":1,"black":1}],"topGames":[]}`))
		case r.URL.Path == "/masters/pgn/abcdEFGH":
			_, _ = w.Write([]byte("[White \"a\"]\n\n1. e4 *\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer site.Close()
	ap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, withLichess.String()) && r.Header.Get("X-Internal-Token") == "s" {
			_, _ = w.Write([]byte(`{"access_token":"lip_ok","expires_at":null}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ap.Close()
	tokens := authprofile.New(ap.URL, "s")
	noCache, _ := cache.New("")
	ex := &explorer.Explorer{Base: site.URL, Lichess: site.URL, UserAgent: "test", Cache: noCache,
		Tokens: explorer.TokensFunc(func(ctx context.Context, u uuid.UUID) (string, error) {
			t, err := tokens.LichessToken(ctx, u)
			if errors.Is(err, authprofile.ErrNoLichess) {
				return "", explorer.ErrNoToken
			}
			return t, err
		})}

	api = httptest.NewServer(app.New(app.Options{
		Service: "games", Store: db, Broker: mqb, Verifier: verifier, Log: log, MaxImport: 2000, Explorer: ex,
	}))
	defer api.Close()
	return m.Run()
}

func token(sub uuid.UUID) string {
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub": sub.String(), "iss": issuer, "role": "guest", "exp": time.Now().Add(time.Hour).Unix(),
	})
	t.Header["kid"] = "k1"
	s, _ := t.SignedString(signKey)
	return s
}

func call(t *testing.T, method, path string, user uuid.UUID, body any) (int, map[string]any, http.Header) {
	t.Helper()
	var r io.Reader
	if s, ok := body.(string); ok {
		r = strings.NewReader(s)
	} else if body != nil {
		b, _ := json.Marshal(body)
		r = strings.NewReader(string(b))
	}
	req, _ := http.NewRequest(method, api.URL+path, r)
	req.Header.Set("Content-Type", "application/json")
	if user != uuid.Nil {
		req.Header.Set("Authorization", "Bearer "+token(user))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out, resp.Header
}

func game(white, black, result, moves string) string {
	return fmt.Sprintf("[White %q]\n[Black %q]\n[Result %q]\n[Date \"2025.02.01\"]\n\n%s %s\n", white, black, result, moves, result)
}

func TestHealth(t *testing.T) {
	for _, path := range []string{"/health/live", "/health/ready"} {
		if code, _, _ := call(t, "GET", path, uuid.Nil, nil); code != 200 {
			t.Errorf("%s: %d", path, code)
		}
	}
}

func TestEveryRouteNeedsAToken(t *testing.T) {
	code, body, h := call(t, "GET", "/v1/games", uuid.Nil, nil)
	if code != 401 || !strings.HasPrefix(h.Get("Content-Type"), "application/problem+json") || body["status"] != float64(401) {
		t.Fatalf("%d %v %s", code, body, h.Get("Content-Type"))
	}
}

func TestSaveSearchGet(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	pgns := game("me", "you", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6") + "\n" +
		game("you", "me", "1-0", "1. e4 e5 2. Ke3") + "\n" + // illegal
		game("you", "me", "0-1", "1. d4 d5 2. c4 e6")
	code, body, _ := call(t, "POST", "/v1/games", me, map[string]string{"pgn": pgns})
	if code != 200 || body["saved"] != float64(2) || body["duplicates"] != float64(0) {
		t.Fatalf("%d %v", code, body)
	}
	rejected := body["rejected"].([]any)
	if len(rejected) != 1 || rejected[0].(map[string]any)["index"] != float64(1) {
		t.Fatalf("rejected %v", rejected)
	}
	if code, body, _ = call(t, "POST", "/v1/games", me, map[string]string{"pgn": pgns}); body["duplicates"] != float64(2) {
		t.Fatalf("again: %d %v", code, body)
	}

	code, body, _ = call(t, "GET", "/v1/games?player=ME&result=win", me, nil)
	items := body["items"].([]any)
	if code != 200 || len(items) != 2 || body["next_cursor"] != nil {
		t.Fatalf("%d %v", code, body)
	}
	first := items[0].(map[string]any)
	if first["first_moves"] == "" || first["source"] != "pgn" {
		t.Fatalf("summary %v", first)
	}
	id := first["id"].(string)
	code, body, _ = call(t, "GET", "/v1/games/"+id, me, nil)
	if code != 200 || !strings.Contains(body["pgn"].(string), "[White") {
		t.Fatalf("get %d %v", code, body)
	}
	// Someone else's game does not exist for you.
	if code, _, _ := call(t, "GET", "/v1/games/"+id, uuid.Must(uuid.NewV7()), nil); code != 404 {
		t.Fatalf("other owner: %d", code)
	}
	// Pages of one.
	code, body, _ = call(t, "GET", "/v1/games?limit=1", me, nil)
	if code != 200 || len(body["items"].([]any)) != 1 || body["next_cursor"] == nil {
		t.Fatalf("page %d %v", code, body)
	}
}

func TestInvalidRequests(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	cases := []struct {
		method, path string
		body         any
		want         int
	}{
		{"GET", "/v1/games?color=white", nil, 400},           // color needs player
		{"GET", "/v1/games?player=x&result=maybe", nil, 400}, // not an enum value
		{"GET", "/v1/games?eco=Z99", nil, 400},
		{"GET", "/v1/games?from=yesterday", nil, 400},
		{"GET", "/v1/games?limit=500", nil, 400},
		{"GET", "/v1/games?cursor=nonsense", nil, 400},
		{"GET", "/v1/games/not-a-uuid", nil, 400},
		{"POST", "/v1/games", map[string]any{"pgn": "1. e4", "extra": 1}, 400}, // unknown field
		{"POST", "/v1/games", map[string]any{"pgn": "   "}, 400},               // no game
		{"POST", "/v1/games", "not json", 400},
		{"POST", "/v1/imports", map[string]any{"site": "fics", "username": "x1"}, 400},
		{"POST", "/v1/imports", map[string]any{"site": "lichess", "username": "a b"}, 400},
		{"POST", "/v1/imports", map[string]any{"site": "lichess", "username": "ab", "max_games": 5000}, 400},
		{"GET", "/v1/imports/" + uuid.Must(uuid.NewV7()).String(), nil, 404},
		// Found by the contract fuzzer: an empty value is not a date, an enum value or a number,
		// and null is not a number.
		{"GET", "/v1/games?to=", nil, 400},
		{"GET", "/v1/games?from=", nil, 400},
		{"GET", "/v1/games?limit=", nil, 400},
		{"GET", "/v1/games?source=", nil, 400},
		{"GET", "/v1/games?eco=", nil, 400},
		{"GET", "/v1/games?player=x&color=", nil, 400},
		{"POST", "/v1/imports", map[string]any{"site": "lichess", "username": "ab", "max_games": nil}, 400},
		{"POST", "/v1/games", map[string]any{"pgn": nil}, 400},
		// Found by the fuzzer: Postgres refuses NUL bytes, and text must be UTF-8.
		{"GET", "/v1/games?q=a%00b", nil, 400},
		{"GET", "/v1/games?player=%FF%FE", nil, 400},
		{"POST", "/v1/games", map[string]any{"pgn": "[White \"a\u0000\"]\n\n1. e4 *"}, 400},
	}
	for _, c := range cases {
		code, body, h := call(t, c.method, c.path, me, c.body)
		if code != c.want || !strings.HasPrefix(h.Get("Content-Type"), "application/problem+json") {
			t.Errorf("%s %s: %d %v", c.method, c.path, code, body)
		}
	}
	// Text that is no game is refused game by game, never a crash (the fuzzer sent "01").
	code, body, _ := call(t, "POST", "/v1/games", me, map[string]string{"pgn": "01"})
	if code != 200 || body["saved"] != float64(0) || len(body["rejected"].([]any)) != 1 {
		t.Errorf(`pgn "01": %d %v`, code, body)
	}
	big := map[string]string{"pgn": strings.Repeat("x", 6<<20)}
	if code, _, _ := call(t, "POST", "/v1/games", me, big); code != 413 {
		t.Errorf("6 MB of PGN: %d", code)
	}
}

func TestImportEndToEnd(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	code, job, _ := call(t, "POST", "/v1/imports", me, map[string]any{"site": "lichess", "username": "DrNykterstein", "max_games": 3})
	if code != 202 || job["status"] != "queued" {
		t.Fatalf("%d %v", code, job)
	}
	// Asked again while it is live: the same import.
	code, again, _ := call(t, "POST", "/v1/imports", me, map[string]any{"site": "lichess", "username": "drnykterstein"})
	if code != 200 || again["id"] != job["id"] {
		t.Fatalf("again: %d %v", code, again)
	}
	close(release)

	// Follow it live until it ends.
	req, _ := http.NewRequest("GET", api.URL+"/v1/imports/"+job["id"].(string), nil)
	req.Header.Set("Authorization", "Bearer "+token(me))
	req.Header.Set("Accept", "text/event-stream")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resp, err := http.DefaultClient.Do(req.WithContext(ctx))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("content type %s", resp.Header.Get("Content-Type"))
	}
	sc := bufio.NewScanner(resp.Body)
	event, last := "", map[string]any{}
	for sc.Scan() {
		line := sc.Text()
		if v, ok := strings.CutPrefix(line, "event: "); ok {
			event = v
		}
		if v, ok := strings.CutPrefix(line, "data: "); ok {
			_ = json.Unmarshal([]byte(v), &last)
			if event == "done" {
				break
			}
		}
	}
	// Three standard games read (the Chess960 one is skipped), all saved.
	if event != "done" || last["status"] != "done" || last["fetched"] != float64(3) || last["saved"] != float64(3) {
		t.Fatalf("last event %s %v", event, last)
	}
	code, body, _ := call(t, "GET", "/v1/games?source=lichess", me, nil)
	if code != 200 || len(body["items"].([]any)) != 3 {
		t.Fatalf("library %d %v", code, body)
	}
}

func TestAtMostThreeImportsAtOnce(t *testing.T) {
	ctx := context.Background()
	me := uuid.Must(uuid.NewV7())
	defer close(hold)
	for _, name := range []string{"held1", "held2", "held3"} {
		if _, _, err := db.CreateImport(ctx, me, "lichess", name, 10); err != nil {
			t.Fatal(err)
		}
	}
	code, body, h := call(t, "POST", "/v1/imports", me, map[string]any{"site": "lichess", "username": "fourth"})
	if code != 429 || !strings.HasSuffix(body["type"].(string), "/too-many-imports") ||
		!strings.HasPrefix(h.Get("Content-Type"), "application/problem+json") {
		t.Fatalf("%d %v", code, body)
	}
}

func TestAFinishedImportStreamsOnlyDone(t *testing.T) {
	ctx := context.Background()
	me := uuid.Must(uuid.NewV7())
	job, _, _ := db.CreateImport(ctx, me, "chesscom", "anyone", 10)
	if err := db.FinishImport(ctx, job.ID, "failed", "test"); err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("GET", api.URL+"/v1/imports/"+job.ID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+token(me))
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if strings.Count(string(b), "event: ") != 1 || !strings.Contains(string(b), "event: done") {
		t.Fatalf("stream %q", b)
	}
}

func TestPlayerStatsRoute(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	pgns := game("Tal", "B", "1-0", "1. e4 e5") + "\n" + game("C", "Tal", "1-0", "1. d4 d5")
	if code, _, _ := call(t, "POST", "/v1/games", me, map[string]string{"pgn": pgns}); code != 200 {
		t.Fatal(code)
	}
	code, st, _ := call(t, "GET", "/v1/games/stats?player=tal", me, nil)
	if code != 200 || st["games"] != float64(2) || st["player"] != "Tal" {
		t.Fatalf("%d %v", code, st)
	}
	if st["as_white"].(map[string]any)["wins"] != float64(1) || st["as_black"].(map[string]any)["losses"] != float64(1) {
		t.Fatalf("records %v %v", st["as_white"], st["as_black"])
	}
	for _, path := range []string{"/v1/games/stats", "/v1/games/stats?player=", "/v1/games/stats?player=a%00b"} {
		if code, _, _ := call(t, "GET", path, me, nil); code != 400 {
			t.Errorf("%s: %d", path, code)
		}
	}
}

func TestAllowListsExactlyTheRoutesMethods(t *testing.T) {
	// Found by the contract fuzzer: a 405 must name only the methods the path has.
	me := uuid.Must(uuid.NewV7())
	cases := map[string]string{
		"/v1/games/stats":  "GET",
		"/v1/games":        "GET, POST",
		"/v1/imports":      "POST",
		"/v1/imports/abc":  "GET",
		"/v1/games/abcdef": "GET",
	}
	for path, want := range cases {
		code, _, h := call(t, "DELETE", path, me, nil)
		if code != 405 || h.Get("Allow") != want {
			t.Errorf("DELETE %s: %d, Allow %q, want %q", path, code, h.Get("Allow"), want)
		}
	}
}

func TestExplorer(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	afterE4 := "rnbqkbnr%2Fpppppppp%2F8%2F8%2F4P3%2F8%2FPPPP1PPP%2FRNBQKBNR+b+KQkq+-+0+1"
	code, body, _ := call(t, "GET", "/v1/explorer?db=masters&fen="+afterE4, me, nil)
	if code != 200 || body["db"] != "masters" || body["white"] != float64(3) || len(body["moves"].([]any)) != 1 {
		t.Fatalf("masters %d %v", code, body)
	}
	// The lichess database needs a Lichess sign-in.
	code, body, _ = call(t, "GET", "/v1/explorer?db=lichess&fen="+afterE4, me, nil)
	if code != 403 || !strings.HasSuffix(body["type"].(string), "/lichess-needed") {
		t.Fatalf("without lichess %d %v", code, body)
	}
	code, body, _ = call(t, "GET", "/v1/explorer?db=lichess&fen="+afterE4, withLichess, nil)
	if code != 200 || body["db"] != "lichess" {
		t.Fatalf("with lichess %d %v", code, body)
	}
	for _, path := range []string{
		"/v1/explorer?db=masters", "/v1/explorer?db=chessbase&fen=" + afterE4, "/v1/explorer?db=masters&fen=nonsense",
		"/v1/explorer?db=masters&fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2F8+w+-+-+0+1",
		"/v1/explorer/games/masters/short", "/v1/explorer/games/fics/abcdEFGH",
	} {
		if code, _, _ := call(t, "GET", path, me, nil); code != 400 {
			t.Errorf("%s: %d", path, code)
		}
	}
	code, body, _ = call(t, "GET", "/v1/explorer/games/masters/abcdEFGH", me, nil)
	if code != 200 || !strings.Contains(body["pgn"].(string), "1. e4") {
		t.Fatalf("pgn %d %v", code, body)
	}
	if code, _, _ := call(t, "GET", "/v1/explorer/games/masters/zzzzzzzz", me, nil); code != 404 {
		t.Fatalf("missing game %d", code)
	}
}

func TestMyGamesInTheExplorer(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	pgns := game("me", "a", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6") + "\n" + game("b", "me", "0-1", "1. e4 c5")
	if code, _, _ := call(t, "POST", "/v1/games", me, map[string]string{"pgn": pgns}); code != 200 {
		t.Fatal(code)
	}
	afterE4 := "rnbqkbnr%2Fpppppppp%2F8%2F8%2F4P3%2F8%2FPPPP1PPP%2FRNBQKBNR+b+KQkq+-+0+1"
	code, body, _ := call(t, "GET", "/v1/explorer?db=mine&fen="+afterE4, me, nil)
	if code != 200 || body["db"] != "mine" || body["white"] != float64(1) || body["black"] != float64(1) {
		t.Fatalf("%d %v", code, body)
	}
	moves := body["moves"].([]any)
	top := body["top_games"].([]any)
	if len(moves) != 2 || len(top) != 2 {
		t.Fatalf("moves %v top %v", moves, top)
	}
	// A top game of your own opens with GET /v1/games/{id}.
	id := top[0].(map[string]any)["id"].(string)
	if code, _, _ := call(t, "GET", "/v1/games/"+id, me, nil); code != 200 {
		t.Fatalf("own top game %d", code)
	}
	if body["opening"].(map[string]any)["eco"] != "B00" {
		t.Fatalf("opening %v", body["opening"])
	}
}

func TestPopularThisWeek(t *testing.T) {
	me := uuid.Must(uuid.NewV7())
	if code, _, _ := call(t, "GET", "/v1/explorer/games/masters/abcdEFGH", me, nil); code != 200 {
		t.Fatal(code)
	}
	code, body, _ := call(t, "GET", "/v1/explorer/popular", me, nil)
	items := body["items"].([]any)
	if code != 200 || len(items) == 0 || items[0].(map[string]any)["id"] != "abcdEFGH" {
		t.Fatalf("%d %v", code, body)
	}
}
