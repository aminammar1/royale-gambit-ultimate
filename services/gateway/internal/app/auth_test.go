package app_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/auth"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

const issuer = "royale-gambit"

type signingKey struct {
	kid string
	key *rsa.PrivateKey
}

func newKey(t *testing.T, kid string) signingKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return signingKey{kid, k}
}

// jwksServer plays auth-profile's /.well-known/jwks.json; the key list can change mid-test.
type jwksServer struct {
	*httptest.Server
	keys atomic.Pointer[[]signingKey]
}

func newJWKS(t *testing.T, keys ...signingKey) *jwksServer {
	t.Helper()
	s := &jwksServer{}
	s.publish(keys...)
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		var set []map[string]string
		for _, k := range *s.keys.Load() {
			set = append(set, map[string]string{
				"kty": "RSA", "use": "sig", "alg": "RS256", "kid": k.kid,
				"n": base64.RawURLEncoding.EncodeToString(k.key.N.Bytes()),
				"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(k.key.E)).Bytes()),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": set})
	}))
	t.Cleanup(s.Close)
	return s
}

func (s *jwksServer) publish(keys ...signingKey) { s.keys.Store(&keys) }

func token(t *testing.T, k signingKey, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = k.kid
	signed, err := tok.SignedString(k.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func claims(role string, expiresIn time.Duration) jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{"iss": issuer, "sub": "01a21268-2946-7a1b-bd2b-bcdc3a32ab3e", "role": role,
		"iat": now.Unix(), "exp": now.Add(expiresIn).Unix()}
}

func mustVerifier(t *testing.T, jwksURL string) *auth.Verifier {
	t.Helper()
	v, err := auth.NewVerifier(context.Background(), jwksURL, issuer)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

// guarded starts a gateway in front of up with one optional and one required route.
func guarded(t *testing.T, jwks *jwksServer, up *upstream) *httptest.Server {
	t.Helper()
	verifier, err := auth.NewVerifier(context.Background(), jwks.URL, issuer)
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(up.URL)
	table := routes.Table{
		{Prefix: "/v1/auth", Upstream: u, Auth: routes.Optional},
		{Prefix: "/v1/profile", Upstream: u, Auth: routes.Required},
	}
	// The analysis route exactly as the real table has it.
	for _, r := range routes.Build(routes.Upstreams{AuthProfile: u, Analysis: u}) {
		if r.Prefix == "/v1/analysis" {
			table = append(table, r)
		}
	}
	return startGateway(t, app.Options{Verifier: verifier, Routes: table})
}

func get(t *testing.T, url, bearer string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	if bearer != "" {
		req.Header.Set("Authorization", bearer)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func TestAValidTokenReachesTheServiceUnchanged(t *testing.T) {
	key := newKey(t, "k1")
	up := newUpstream(t, okJSON)
	gw := guarded(t, newJWKS(t, key), up)

	bearer := "Bearer " + token(t, key, claims("user", 15*time.Minute))
	if resp := get(t, gw.URL+"/v1/profile", bearer); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if got := up.last.Load().header.Get("Authorization"); got != bearer {
		t.Fatalf("service got Authorization %q", got)
	}
}

func TestABadTokenNeverReachesAService(t *testing.T) {
	key := newKey(t, "k1")
	stranger := newKey(t, "k1") // same kid, different key: a forgery
	up := newUpstream(t, okJSON)
	gw := guarded(t, newJWKS(t, key), up)

	der, _ := x509.MarshalPKIXPublicKey(&key.key.PublicKey)
	publicPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, claims("user", time.Minute))
	hs.Header["kid"] = "k1"
	hsToken, _ := hs.SignedString(publicPEM) // the classic RS256 -> HS256 confusion
	none := jwt.NewWithClaims(jwt.SigningMethodNone, claims("user", time.Minute))
	noneToken, _ := none.SignedString(jwt.UnsafeAllowNoneSignatureType)
	wrongIssuer := claims("user", time.Minute)
	wrongIssuer["iss"] = "someone-else"
	noExpiry := claims("user", time.Minute)
	delete(noExpiry, "exp")

	bad := map[string]string{
		"expired":        "Bearer " + token(t, key, claims("user", -2*time.Minute)),
		"forged":         "Bearer " + token(t, stranger, claims("user", time.Minute)),
		"wrong issuer":   "Bearer " + token(t, key, wrongIssuer),
		"no expiry":      "Bearer " + token(t, key, noExpiry),
		"alg none":       "Bearer " + noneToken,
		"hs256 with pub": "Bearer " + hsToken,
		"garbage":        "Bearer not.a.jwt",
		"not bearer":     "Basic dXNlcjpwYXNz",
	}
	for name, bearer := range bad {
		for _, path := range []string{"/v1/profile", "/v1/auth/refresh", "/v1/analysis/positions"} {
			resp := get(t, gw.URL+path, bearer)
			assertProblem(t, resp, http.StatusUnauthorized)
			if resp.Header.Get("WWW-Authenticate") == "" {
				t.Errorf("%s on %s: no WWW-Authenticate", name, path)
			}
		}
	}
	if n := up.hits.Load(); n != 0 {
		t.Fatalf("a bad token reached the service %d times", n)
	}
}

func TestARequiredRouteNeedsAToken(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := guarded(t, newJWKS(t, newKey(t, "k1")), up)

	assertProblem(t, get(t, gw.URL+"/v1/profile", ""), http.StatusUnauthorized)
	assertProblem(t, get(t, gw.URL+"/v1/analysis/positions", ""), http.StatusUnauthorized)
	if n := up.hits.Load(); n != 0 {
		t.Fatalf("an anonymous call reached a guarded service %d times", n)
	}
	if resp := get(t, gw.URL+"/v1/auth/guest", ""); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("optional route without a token: status %d, want it forwarded", resp.StatusCode)
	}
}

func TestANewKeyIsPickedUpWithoutARestart(t *testing.T) {
	oldKey, newKey := newKey(t, "old"), newKey(t, "new")
	jwks := newJWKS(t, oldKey)
	up := newUpstream(t, okJSON)
	gw := guarded(t, jwks, up)

	// auth-profile rotates: the gateway sees an unknown kid and fetches the set again.
	jwks.publish(oldKey, newKey)
	resp := get(t, gw.URL+"/v1/profile", "Bearer "+token(t, newKey, claims("user", time.Minute)))
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("token from the new key: status %d", resp.StatusCode)
	}
}
