package app

import (
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
)

// cors lets the desktop app's web view call us. Only listed origins get the headers; a
// preflight is answered here and never bothers a service. Vary: Origin goes out on every
// answer, so no cache can hand one origin's response to another.
func cors(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if len(origins) == 0 {
			c.Next()
			return
		}
		h := c.Writer.Header()
		h.Add("Vary", "Origin")
		origin := c.GetHeader("Origin")
		if origin == "" || !slices.Contains(origins, origin) {
			c.Next()
			return
		}
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Expose-Headers", "Retry-After, X-Request-ID, Location")
		if c.Request.Method == http.MethodOptions && c.GetHeader("Access-Control-Request-Method") != "" {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-Request-ID, traceparent")
			h.Set("Access-Control-Max-Age", "600")
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
