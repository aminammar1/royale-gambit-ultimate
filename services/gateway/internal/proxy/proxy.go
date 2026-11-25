// Package proxy forwards a request to the service its route names.
package proxy

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/httpx"
	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/routes"
)

// Proxy forwards requests. One shared transport keeps connections to the services warm.
type Proxy struct {
	transport *http.Transport
	log       *slog.Logger
}

// New builds a proxy whose services must start answering within timeout. The body may
// then stream for as long as it likes (server-sent events).
func New(timeout time.Duration, log *slog.Logger) *Proxy {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = timeout
	t.DialContext = (&net.Dialer{Timeout: timeout}).DialContext
	return &Proxy{transport: t, log: log}
}

// Forward sends r to the route's service and copies the answer back.
func (p *Proxy) Forward(w http.ResponseWriter, r *http.Request, route routes.Route, requestID string) {
	rp := &httputil.ReverseProxy{
		Transport:     p.transport,
		FlushInterval: -1, // pass server-sent events through as they come
		Rewrite: func(pr *httputil.ProxyRequest) {
			// Rewrite starts from a copy without the client's X-Forwarded-* headers, so
			// what the service sees is our view of the peer, never the client's claim.
			pr.SetURL(route.Upstream)
			pr.Out.Host = route.Upstream.Host
			pr.SetXForwarded()
			pr.Out.Header.Set("X-Request-ID", requestID)
			otel.GetTextMapPropagator().Inject(pr.In.Context(), propagation.HeaderCarrier(pr.Out.Header))
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			status, detail := http.StatusBadGateway, "the service did not answer"
			var netErr net.Error
			if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
				status, detail = http.StatusGatewayTimeout, "the service took too long to answer"
			}
			p.log.WarnContext(r.Context(), "upstream failed", "upstream", route.Upstream.Host, "error", err)
			httpx.WriteProblemTo(w, r, status, detail)
		},
	}
	rp.ServeHTTP(w, r)
}
