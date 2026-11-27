// Package routes is the gateway's routing table: which path prefix goes to which service,
// and whether a token is needed to get there.
package routes

import (
	"net/url"
	"strings"
	"time"
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
	// Timeout is how long the service may take to start answering; 0 means the gateway's
	// default. A stream may then run for as long as it likes.
	Timeout time.Duration
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

// Upstreams are the services the gateway routes to.
type Upstreams struct {
	AuthProfile *url.URL
	Analysis    *url.URL
	Games       *url.URL
}

// AnalysisTimeout lets a deep search answer as JSON (SERVICES.md: analysis calls get 30 s).
const AnalysisTimeout = 30 * time.Second

// Build is the table for the services that exist. A service joins it in the milestone that
// creates it.
func Build(u Upstreams) Table {
	return Table{
		// Refresh and logout: a token may come along but is not needed.
		{Prefix: "/v1/auth", Upstream: u.AuthProfile},
		// The routes that hand out tokens to anonymous callers get the tight per-IP budget.
		{Prefix: "/v1/auth/guest", Upstream: u.AuthProfile, SignIn: true},
		{Prefix: "/v1/auth/email", Upstream: u.AuthProfile, SignIn: true},
		{Prefix: "/v1/auth/lichess", Upstream: u.AuthProfile, SignIn: true},
		{Prefix: "/v1/auth/identities", Upstream: u.AuthProfile, Auth: Required},
		{Prefix: "/v1/profile", Upstream: u.AuthProfile, Auth: Required},
		// Engine time is the costliest thing we give away: a token (a guest's is fine) and the
		// per-user rate limit, always.
		{Prefix: "/v1/analysis", Upstream: u.Analysis, Auth: Required, Timeout: AnalysisTimeout},
		// A player's own library (M8): a token always, a guest's included.
		{Prefix: "/v1/games", Upstream: u.Games, Auth: Required},
		{Prefix: "/v1/imports", Upstream: u.Games, Auth: Required},
	}
}
