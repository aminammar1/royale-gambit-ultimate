package app

import (
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// The methods a service behind us can be asked for. QUERY is the new safe method with a
// body (RFC 9110 family); anything else is refused here rather than at the service.
var forwardable = map[string]bool{
	http.MethodGet: true, http.MethodHead: true, http.MethodPost: true, http.MethodPut: true,
	http.MethodPatch: true, http.MethodDelete: true, http.MethodOptions: true, "QUERY": true,
}

// route finds the request's route, or answers 404. Paths that are not in canonical form
// are refused outright: "/v1/auth/../profile", an encoded slash, a ";" path parameter or a
// double-encoded "%25" could mean one path to us and another to the service, which is
// how auth checks and rate limits get skipped.
func route(table routes.Table) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !forwardable[c.Request.Method] {
			httpx.WriteProblem(c, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		p := c.Request.URL.Path
		raw := strings.ToLower(c.Request.URL.EscapedPath())
		if path.Clean(p) != p || strings.ContainsAny(p, ";\\") ||
			strings.Contains(raw, "%2f") || strings.Contains(raw, "%5c") || strings.Contains(raw, "%25") {
			httpx.WriteProblem(c, http.StatusBadRequest, "the path is not in canonical form")
			return
		}
		match, ok := table.Match(p)
		if !ok {
			httpx.WriteProblem(c, http.StatusNotFound, "no such route")
			return
		}
		c.Set(routeKey, match)
		httpx.SetRouteLabel(c, match.Prefix)
		c.Next()
	}
}
