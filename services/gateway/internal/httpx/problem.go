// Package httpx holds HTTP helpers shared inside this service: RFC 9457 problems and middleware.
package httpx

import (
	"encoding/json"
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
	c.Abort()
	WriteProblemTo(c.Writer, c.Request, status, detail)
}

// WriteProblemTo writes a problem on a plain ResponseWriter, for code that runs outside
// gin's handlers (the reverse proxy's error handler).
func WriteProblemTo(w http.ResponseWriter, r *http.Request, status int, detail string) {
	p := Problem{
		Type:     "about:blank",
		Title:    http.StatusText(status),
		Status:   status,
		Detail:   detail,
		Instance: r.URL.Path,
	}
	if sc := trace.SpanContextFromContext(r.Context()); sc.IsValid() {
		p.TraceID = sc.TraceID().String()
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(p)
}
