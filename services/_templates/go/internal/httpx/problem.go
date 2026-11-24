// Package httpx holds HTTP helpers shared inside this service: RFC 9457 problems and middleware.
package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/trace"
)

// Problem is an RFC 9457 problem details body.
type Problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Instance string `json:"instance,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`
}

// WriteProblem aborts the request with an application/problem+json response.
func WriteProblem(c *gin.Context, status int, detail string) {
	p := Problem{
		Type:     "about:blank",
		Title:    http.StatusText(status),
		Status:   status,
		Detail:   detail,
		Instance: c.Request.URL.Path,
	}
	if sc := trace.SpanContextFromContext(c.Request.Context()); sc.IsValid() {
		p.TraceID = sc.TraceID().String()
	}
	c.Header("Content-Type", "application/problem+json")
	c.AbortWithStatusJSON(status, p)
	// AbortWithStatusJSON sets application/json; restore the problem media type.
	c.Writer.Header().Set("Content-Type", "application/problem+json")
}
