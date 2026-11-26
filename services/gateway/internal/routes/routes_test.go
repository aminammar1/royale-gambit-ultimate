package routes_test

import (
	"net/url"
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

func TestLongestPrefixWinsOnSegmentBoundaries(t *testing.T) {
	a, _ := url.Parse("http://a")
	b, _ := url.Parse("http://b")
	table := routes.Table{
		{Prefix: "/v1/auth", Upstream: a},
		{Prefix: "/v1/auth/identities", Upstream: b, Auth: routes.Required},
	}
	cases := map[string]string{
		"/v1/auth":                    "http://a",
		"/v1/auth/guest":              "http://a",
		"/v1/auth/identities/lichess": "http://b",
		"/v1/authentic":               "",
	}
	for path, want := range cases {
		route, ok := table.Match(path)
		got := ""
		if ok {
			got = route.Upstream.String()
		}
		if got != want {
			t.Errorf("Match(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestTheTableGuardsWhatNeedsGuarding(t *testing.T) {
	authProfile, _ := url.Parse("http://auth-profile:8081")
	analysis, _ := url.Parse("http://analysis:8084")
	table := routes.Build(routes.Upstreams{AuthProfile: authProfile, Analysis: analysis})
	cases := []struct {
		path   string
		auth   routes.Auth
		signIn bool
	}{
		{"/v1/auth/guest", routes.Optional, true},
		{"/v1/auth/email/start", routes.Optional, true},
		{"/v1/auth/lichess/complete", routes.Optional, true},
		{"/v1/auth/refresh", routes.Optional, false},
		{"/v1/auth/identities/lichess", routes.Required, false},
		{"/v1/profile", routes.Required, false},
	}
	for _, c := range cases {
		r, ok := table.Match(c.path)
		if !ok || r.Auth != c.auth || r.SignIn != c.signIn || r.Upstream != authProfile {
			t.Errorf("%s: got %+v (found %v), want auth %v sign-in %v", c.path, r, ok, c.auth, c.signIn)
		}
	}
	for _, path := range []string{"/v1/analysis/positions", "/v1/analysis/batch"} {
		r, ok := table.Match(path)
		if !ok || r.Upstream != analysis || r.Auth != routes.Required || r.SignIn || r.Timeout != routes.AnalysisTimeout {
			t.Errorf("%s: got %+v (found %v)", path, r, ok)
		}
	}
	if _, ok := table.Match("/v1/analysis-x"); ok {
		t.Error("prefixes match whole segments only")
	}
	if _, ok := table.Match("/.well-known/jwks.json"); ok {
		t.Error("the JWKS is for services, not for the public")
	}
}
