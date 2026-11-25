package app_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
)

func newGateway(t *testing.T) *httptest.Server {
	t.Helper()
	return startGateway(t, app.Options{})
}

// startGateway runs the gateway with test defaults filled in.
func startGateway(t *testing.T, opts app.Options) *httptest.Server {
	t.Helper()
	if opts.Service == "" {
		opts.Service = "gateway"
	}
	if opts.Log == nil {
		opts.Log = slog.New(slog.DiscardHandler)
	}
	srv := httptest.NewServer(app.New(opts))
	t.Cleanup(srv.Close)
	return srv
}

func TestHealthAndMetricsAreOpen(t *testing.T) {
	gw := newGateway(t)
	for _, path := range []string{"/health/live", "/health/ready", "/metrics"} {
		resp, err := http.Get(gw.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("%s: status %d, want 200", path, resp.StatusCode)
		}
	}
}

func TestUnknownRouteIsAProblem(t *testing.T) {
	gw := newGateway(t)
	resp, err := http.Get(gw.URL + "/v1/nowhere")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	assertProblem(t, resp, http.StatusNotFound)
}

// assertProblem checks the RFC 9457 shape every error from the gateway must have.
func assertProblem(t *testing.T, resp *http.Response, status int) map[string]any {
	t.Helper()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != status {
		t.Fatalf("status %d, want %d: %s", resp.StatusCode, status, body)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Fatalf("content type %q, want application/problem+json", ct)
	}
	var problem map[string]any
	if err := json.Unmarshal(body, &problem); err != nil {
		t.Fatalf("not JSON: %s", body)
	}
	if problem["status"] != float64(status) || problem["type"] == "" {
		t.Fatalf("bad problem: %s", body)
	}
	return problem
}
