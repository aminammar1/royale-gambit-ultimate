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
