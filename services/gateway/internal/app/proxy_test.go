package app_test

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// upstream is a fake service that remembers the last request it got.
type upstream struct {
	*httptest.Server
	hits atomic.Int32
	last atomic.Pointer[seen]
}

type seen struct {
	method, path, query, body string
	header                    http.Header
}

func newUpstream(t *testing.T, handle func(http.ResponseWriter)) *upstream {
	t.Helper()
	u := &upstream{}
	u.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		u.hits.Add(1)
		u.last.Store(&seen{r.Method, r.URL.Path, r.URL.RawQuery, string(body), r.Header.Clone()})
		handle(w)
	}))
	t.Cleanup(u.Close)
	return u
}

func okJSON(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte(`{"from":"upstream"}`))
}

func authProfileRoutes(t *testing.T, base string) routes.Table {
	t.Helper()
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	return routes.Table{
		{Prefix: "/v1/auth", Upstream: u, Auth: routes.Optional},
		{Prefix: "/v1/profile", Upstream: u, Auth: routes.Optional},
	}
}

func TestForwardsTheRequestAsItCame(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	req, _ := http.NewRequest(http.MethodPost, gw.URL+"/v1/auth/email/start?lang=en", strings.NewReader(`{"email":"a@b.co"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	got := up.last.Load()
	if got.method != http.MethodPost || got.path != "/v1/auth/email/start" || got.query != "lang=en" || got.body != `{"email":"a@b.co"}` {
		t.Fatalf("upstream saw %+v", got)
	}
	if resp.StatusCode != http.StatusAccepted || string(body) != `{"from":"upstream"}` {
		t.Fatalf("client got %d %s", resp.StatusCode, body)
	}
	if resp.Header.Get("X-Request-ID") == "" || got.header.Get("X-Request-ID") != resp.Header.Get("X-Request-ID") {
		t.Fatalf("request id not shared: client %q, upstream %q", resp.Header.Get("X-Request-ID"), got.header.Get("X-Request-ID"))
	}
}

func TestTheClientCannotForgeItsAddress(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
	req.Header.Set("X-Forwarded-For", "6.6.6.6")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	if xff := up.last.Load().header.Get("X-Forwarded-For"); xff != "127.0.0.1" {
		t.Fatalf("upstream X-Forwarded-For = %q, want only the real peer 127.0.0.1", xff)
	}
}

func TestTraceContextReachesTheService(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	if tp := up.last.Load().header.Get("traceparent"); !strings.Contains(tp, "4bf92f3577b34da6a3ce929d0e0e4736") {
		t.Fatalf("upstream traceparent = %q, want the same trace id", tp)
	}
}

func TestOnlyRoutedPathsGoAnywhere(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	for _, path := range []string{"/v1/profiles", "/v1/authx/guest", "/v1", "/.well-known/jwks.json"} {
		resp, err := http.Get(gw.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		assertProblem(t, resp, http.StatusNotFound)
		resp.Body.Close()
	}
	if up.hits.Load() != 0 {
		t.Fatalf("upstream was called %d times", up.hits.Load())
	}
}

func TestPathTricksAreRefusedNotRewritten(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	// Each of these could mean a different path to us than to the service behind us.
	for _, path := range []string{"/v1/auth/../profile", "/v1/auth/./guest", "//v1/profile", "/v1/auth%2Fguest", "/v1/auth/x%2f..%2fy"} {
		resp := rawGet(t, gw.URL, path)
		assertProblem(t, resp, http.StatusBadRequest)
		resp.Body.Close()
	}
	if up.hits.Load() != 0 {
		t.Fatalf("upstream was called %d times", up.hits.Load())
	}
}

// rawGet writes the request line by hand: Go's client would clean the path first, and the
// point is to see what the gateway does with exactly these bytes.
func rawGet(t *testing.T, base, path string) *http.Response {
	t.Helper()
	conn, err := net.Dial("tcp", strings.TrimPrefix(base, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := fmt.Fprintf(conn, "GET %s HTTP/1.1\r\nHost: gateway\r\nConnection: close\r\n\r\n", path); err != nil {
		t.Fatal(err)
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestAServiceThatIsDownIs502(t *testing.T) {
	dead := httptest.NewServer(http.NotFoundHandler())
	dead.Close()
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, dead.URL)})

	resp, err := http.Get(gw.URL + "/v1/profile")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	assertProblem(t, resp, http.StatusBadGateway)
}

func TestAServiceThatHangsIs504(t *testing.T) {
	slow := newUpstream(t, func(w http.ResponseWriter) { time.Sleep(500 * time.Millisecond); okJSON(w) })
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, slow.URL), UpstreamTimeout: 100 * time.Millisecond})

	resp, err := http.Get(gw.URL + "/v1/profile")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	assertProblem(t, resp, http.StatusGatewayTimeout)
}

// A route's own timeout beats the default: analysis may think for 30 s before it answers.
func TestARouteMayWaitLongerThanTheDefault(t *testing.T) {
	slow := newUpstream(t, func(w http.ResponseWriter) { time.Sleep(300 * time.Millisecond); okJSON(w) })
	u, _ := url.Parse(slow.URL)
	gw := startGateway(t, app.Options{UpstreamTimeout: 100 * time.Millisecond, Routes: routes.Table{
		{Prefix: "/v1/profile", Upstream: u},
		{Prefix: "/v1/slow", Upstream: u, Timeout: time.Second},
	}})

	resp, err := http.Get(gw.URL + "/v1/slow/thing")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status %d, want the slow answer", resp.StatusCode)
	}
	resp, err = http.Get(gw.URL + "/v1/profile")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	assertProblem(t, resp, http.StatusGatewayTimeout)
}
