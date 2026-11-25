package app

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// authenticate checks the bearer token. A route that needs one gets 401 without it; on
// any route a token that is sent must be valid, so a bad token never reaches a service.
// The token itself is forwarded unchanged: services verify it again (defence in depth).
func authenticate(verifier TokenVerifier) gin.HandlerFunc {
	return func(c *gin.Context) {
		values := c.Request.Header.Values("Authorization")
		if len(values) > 1 {
			// We would check one and the service might read the other.
			unauthorized(c, "send one Authorization header")
			return
		}
		if len(values) == 0 {
			if c.MustGet(routeKey).(routes.Route).Auth == routes.Required {
				unauthorized(c, "a bearer token is required")
				return
			}
			c.Next()
			return
		}
		scheme, raw, _ := strings.Cut(values[0], " ")
		if !strings.EqualFold(scheme, "Bearer") || raw == "" || verifier == nil {
			unauthorized(c, "a valid bearer token is required")
			return
		}
		claims, err := verifier.Verify(raw)
		if err != nil {
			unauthorized(c, "a valid bearer token is required")
			return
		}
		c.Set(claimsKey, claims)
		c.Next()
	}
}

func unauthorized(c *gin.Context, detail string) {
	c.Header("WWW-Authenticate", `Bearer realm="royal-gambit"`)
	httpx.WriteProblem(c, http.StatusUnauthorized, detail)
}
