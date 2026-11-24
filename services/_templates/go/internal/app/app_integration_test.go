package app_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/db"
	"github.com/aminammar1/royale-gambit-ultimate/services/_templates/go/internal/telemetry"
)

// TestItemsAgainstPostgres runs migrations on a real Postgres and exercises the contract.
func TestItemsAgainstPostgres(t *testing.T) {
	ctx := context.Background()
	shutdown, err := telemetry.SetupTracing(ctx, "test")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = shutdown(ctx) }()
	pg, err := postgres.Run(ctx, "postgres:19.0-trixie",
		postgres.WithDatabase("svc"), postgres.WithUsername("svc"), postgres.WithPassword("svc"),
		postgres.BasicWaitStrategies())
	testcontainers.CleanupContainer(t, pg)
	if err != nil {
		t.Fatal(err)
	}
	url, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(url); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(url); err != nil { // second run is a no-op
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	srv := httptest.NewServer(app.New("test", pool, slog.New(slog.NewJSONHandler(io.Discard, nil))))
	defer srv.Close()

	// ready
	resp := do(t, http.MethodGet, srv.URL+"/health/ready", "")
	expect(t, resp, http.StatusOK, "application/json")

	// create
	resp = do(t, http.MethodPost, srv.URL+"/v1/items", `{"name":"Opera Game"}`)
	expect(t, resp, http.StatusCreated, "application/json")
	var created struct{ ID, Name, CreatedAt string }
	decode(t, resp, &created)
	if created.Name != "Opera Game" || created.ID[14] != '7' {
		t.Fatalf("unexpected item %+v (want UUIDv7)", created)
	}

	// read back
	resp = do(t, http.MethodGet, srv.URL+"/v1/items/"+created.ID, "")
	expect(t, resp, http.StatusOK, "application/json")

	// problems
	for _, c := range []struct {
		method, path, body string
		status             int
	}{
		{http.MethodGet, "/v1/items/0190f6a8-0000-7000-8000-000000000000", "", http.StatusNotFound},
		{http.MethodGet, "/v1/items/not-a-uuid", "", http.StatusBadRequest},
		{http.MethodPost, "/v1/items", `{"name":""}`, http.StatusBadRequest},
		{http.MethodPost, "/v1/items", `{"nom":"x"}`, http.StatusBadRequest},
		{http.MethodGet, "/v1/nowhere", "", http.StatusNotFound},
		{http.MethodDelete, "/v1/items", "", http.StatusMethodNotAllowed},
	} {
		resp := do(t, c.method, srv.URL+c.path, c.body)
		expect(t, resp, c.status, "application/problem+json")
		var p struct {
			Type, Title string
			Status      int
			TraceID     string `json:"trace_id"`
		}
		decode(t, resp, &p)
		if p.Status != c.status || p.Type == "" || len(p.TraceID) != 32 {
			t.Errorf("%s %s: bad problem %+v", c.method, c.path, p)
		}
	}

	// metrics
	resp = do(t, http.MethodGet, srv.URL+"/metrics", "")
	b, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(b), "http_requests_total") {
		t.Error("metrics missing http_requests_total")
	}
}

func do(t *testing.T, method, url, body string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func expect(t *testing.T, r *http.Response, status int, ctype string) {
	t.Helper()
	if r.StatusCode != status || !strings.HasPrefix(r.Header.Get("Content-Type"), ctype) {
		t.Fatalf("%s %s: got %d %q, want %d %q", r.Request.Method, r.Request.URL.Path, r.StatusCode, r.Header.Get("Content-Type"), status, ctype)
	}
}

func decode(t *testing.T, r *http.Response, v any) {
	t.Helper()
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		t.Fatal(err)
	}
}
