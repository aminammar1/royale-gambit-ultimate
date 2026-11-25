// Package routes is the gateway's routing table: which path prefix goes to which service,
// and whether a token is needed to get there.
package routes

import (
	"net/url"
	"strings"
)

// Auth says what the gateway demands from a request before forwarding it.
type Auth int

const (
	// Optional: no token is fine; a token, when sent, must be valid.
	Optional Auth = iota
	// Required: a valid token or 401.
	Required
)

// Route sends every path under Prefix to Upstream, unchanged.
type Route struct {
	Prefix   string // no trailing slash; matches Prefix itself and anything under Prefix/
	Upstream *url.URL
	Auth     Auth
	// SignIn marks the routes anonymous callers use to get a token; they get a tighter
	// per-IP rate limit.
	SignIn bool
}

// Table is the full routing table. Order does not matter: the longest prefix wins.
type Table []Route

// Match finds the route for a path. Prefixes match on whole segments, so /v1/profile
// never catches /v1/profiles.
func (t Table) Match(path string) (Route, bool) {
	var best Route
	found := false
	for _, r := range t {
		if (path == r.Prefix || strings.HasPrefix(path, r.Prefix+"/")) && len(r.Prefix) > len(best.Prefix) {
			best, found = r, true
		}
	}
	return best, found
}

// P2 is the table for the services that exist at P2: only auth-profile. A service joins
// the table in the milestone that creates it.
func P2(authProfile *url.URL) Table {
	return Table{
		// Refresh and logout: a token may come along but is not needed.
		{Prefix: "/v1/auth", Upstream: authProfile},
		// The routes that hand out tokens to anonymous callers get the tight per-IP budget.
		{Prefix: "/v1/auth/guest", Upstream: authProfile, SignIn: true},
		{Prefix: "/v1/auth/email", Upstream: authProfile, SignIn: true},
		{Prefix: "/v1/auth/lichess", Upstream: authProfile, SignIn: true},
		{Prefix: "/v1/auth/identities", Upstream: authProfile, Auth: Required},
		{Prefix: "/v1/profile", Upstream: authProfile, Auth: Required},
	}
}
