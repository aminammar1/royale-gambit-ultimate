package app_test

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
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
	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/broker"
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
	db, err := store.Open(ctx, dbURL)
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

	api = httptest.NewServer(app.New(app.Options{
		Service: "games", Store: db, Broker: mqb, Verifier: verifier, Log: log, MaxImport: 2000,
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
	}
	for _, c := range cases {
		code, body, h := call(t, c.method, c.path, me, c.body)
		if code != c.want || !strings.HasPrefix(h.Get("Content-Type"), "application/problem+json") {
			t.Errorf("%s %s: %d %v", c.method, c.path, code, body)
		}
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
