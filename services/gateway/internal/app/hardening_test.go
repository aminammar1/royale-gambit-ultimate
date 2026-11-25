package app_test

import (
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
)

func TestRefusedTokensStillSpendTheAddressBudget(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := limitedGateway(t, freshRedis(t), limit.Limits{IP: 2, SignIn: 100, Guest: 100, User: 100}, up,
		verifierFor(t, newKey(t, "k1")))

	// Every forged token costs an RSA check; without a budget that is free CPU to burn.
	assertProblem(t, get(t, gw+"/v1/profile", "Bearer forged.token.here"), http.StatusUnauthorized)
	assertProblem(t, get(t, gw+"/v1/profile", "Bearer forged.token.here"), http.StatusUnauthorized)
	assertProblem(t, get(t, gw+"/v1/profile", "Bearer forged.token.here"), http.StatusTooManyRequests)
}

func TestASilentRedisCostsMillisecondsNotSeconds(t *testing.T) {
	// A Redis that accepts connections and never answers: the worst kind of down.
	silent, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { silent.Close() })
	go func() {
		for {
			conn, err := silent.Accept()
			if err != nil {
				return
			}
			t.Cleanup(func() { conn.Close() })
		}
	}()
	up := newUpstream(t, okJSON)
	gw := limitedGateway(t, &redis.Options{Addr: silent.Addr().String()},
		limit.Limits{IP: 1, SignIn: 1, Guest: 1, User: 1}, up, nil)

	start := time.Now()
	if resp := get(t, gw+"/v1/auth/email/start", ""); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status %d, want it let through", resp.StatusCode)
	}
	if took := time.Since(start); took > 500*time.Millisecond {
		t.Fatalf("a silent Redis held the request for %v", took)
	}
}

func TestInventedMethodsDoNotMintMetricSeries(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	req, _ := http.NewRequest("BREW42", gw.URL+"/v1/profile", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	get(t, gw.URL+"/v1/profile", "")

	metrics := get(t, gw.URL+"/metrics", "")
	body, _ := io.ReadAll(metrics.Body)
	if strings.Contains(string(body), "BREW42") {
		t.Fatal("a client-chosen method became a metric label")
	}
	if !strings.Contains(string(body), `route="/v1/profile"`) {
		t.Fatal("proxied requests are not labelled with their route")
	}
}

func TestIPv6CallersShareABudgetPerSlash64(t *testing.T) {
	cases := map[string]string{
		"2001:db8:1:2:aaaa::1":  "2001:db8:1:2::/64",
		"2001:db8:1:2:bbbb::99": "2001:db8:1:2::/64",
		"203.0.113.7":           "203.0.113.7",
		"::ffff:203.0.113.7":    "203.0.113.7",
	}
	for ip, want := range cases {
		if got := app.AddressKey(ip); got != want {
			t.Errorf("AddressKey(%q) = %q, want %q", ip, got, want)
		}
	}
}

func TestAStreamThatBreaksLooksBrokenToTheClient(t *testing.T) {
	up := newUpstream(t, func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: first\n\n"))
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler) // the service dies mid-stream
	})
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})

	resp := get(t, gw.URL+"/v1/profile", "")
	if _, err := io.ReadAll(resp.Body); err == nil {
		t.Fatal("a cut stream reached the client as if it were complete")
	}
}

func TestAuthorizationHeaderEdgeCases(t *testing.T) {
	key := newKey(t, "k1")
	up := newUpstream(t, okJSON)
	gw := guarded(t, newJWKS(t, key), up)
	good := token(t, key, claims("user", time.Minute))

	// The scheme is case-insensitive (RFC 9110): this one is fine.
	if resp := get(t, gw.URL+"/v1/profile", "bearer "+good); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("lowercase scheme: status %d", resp.StatusCode)
	}
	// Two Authorization headers: which one would the service believe? Neither.
	for _, first := range []string{"Bearer " + good, ""} {
		req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/auth/refresh", nil)
		req.Header["Authorization"] = []string{first, "Bearer forged"}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		assertProblem(t, resp, http.StatusUnauthorized)
		resp.Body.Close()
	}
}

func TestSemicolonsAndEncodedPercentsAreRefused(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})
	for _, path := range []string{"/v1/auth/..;/email/start", "/v1/profile;jsessionid=x", "/v1/auth/%252e%252e/x"} {
		resp := rawGet(t, gw.URL, path)
		assertProblem(t, resp, http.StatusBadRequest)
		resp.Body.Close()
	}
}

func TestClientClaimsAboutHostAndAddressAreDropped(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})
	req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
	req.Header.Set("X-Real-IP", "6.6.6.6")
	req.Header.Set("X-Forwarded-Host", "evil.example")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	h := up.last.Load().header
	if h.Get("X-Real-IP") != "" || h.Get("X-Forwarded-Host") == "evil.example" {
		t.Fatalf("service saw X-Real-IP %q, X-Forwarded-Host %q", h.Get("X-Real-IP"), h.Get("X-Forwarded-Host"))
	}
}

func TestOddRequestIDsAreReplaced(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL)})
	for _, id := range []string{strings.Repeat("a", 300), "has spaces and\ttabs", "ok-id_1.2"} {
		req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
		req.Header.Set("X-Request-ID", id)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		got := up.last.Load().header.Get("X-Request-ID")
		if (id == "ok-id_1.2") != (got == id) {
			t.Errorf("request id %q became %q", id, got)
		}
	}
}

func TestVaryOriginIsAlwaysSent(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL), CORSOrigins: []string{"tauri://localhost"}})
	req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
	req.Header.Set("Origin", "https://elsewhere.example")
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()
	if !strings.Contains(resp.Header.Get("Vary"), "Origin") {
		t.Fatal("a cache could serve one origin's answer to another")
	}
}

func verifierFor(t *testing.T, key signingKey) app.TokenVerifier {
	t.Helper()
	return mustVerifier(t, newJWKS(t, key).URL)
}
