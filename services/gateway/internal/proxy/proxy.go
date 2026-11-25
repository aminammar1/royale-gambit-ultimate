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

// statusClientClosed is what we record when the caller hung up before the service
// answered (nginx's 499): not the service's fault, so not a 502.
const statusClientClosed = 499

// Proxy holds one reverse proxy per route, all sharing a transport that keeps
// connections to the services warm.
type Proxy struct {
	byPrefix map[string]*httputil.ReverseProxy
}

// New builds the proxies. A service must start answering within timeout; the body may
// then stream for as long as it likes (server-sent events).
func New(table routes.Table, timeout time.Duration, log *slog.Logger) *Proxy {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil // never route service traffic through an HTTP_PROXY from the env
	transport.ResponseHeaderTimeout = timeout
	transport.DialContext = (&net.Dialer{Timeout: timeout}).DialContext
	transport.MaxIdleConnsPerHost = 32

	p := &Proxy{byPrefix: make(map[string]*httputil.ReverseProxy, len(table))}
	for _, route := range table {
		p.byPrefix[route.Prefix] = &httputil.ReverseProxy{
			Transport:     transport,
			FlushInterval: -1, // pass server-sent events through as they come
			Rewrite: func(pr *httputil.ProxyRequest) {
				// Rewrite starts from a copy without the client's X-Forwarded-* headers;
				// what the service sees is our view of the peer, never the client's claim.
				pr.SetURL(route.Upstream)
				pr.SetXForwarded()
				pr.Out.Header.Del("X-Forwarded-Host") // the client's Host, not ours to vouch for
				pr.Out.Header.Del("X-Real-IP")
				otel.GetTextMapPropagator().Inject(pr.In.Context(), propagation.HeaderCarrier(pr.Out.Header))
			},
			ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
				if errors.Is(err, context.Canceled) {
					w.WriteHeader(statusClientClosed)
					return
				}
				status, detail := http.StatusBadGateway, "the service did not answer"
				var netErr net.Error
				if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
					status, detail = http.StatusGatewayTimeout, "the service took too long to answer"
				}
				log.WarnContext(r.Context(), "upstream failed", "upstream", route.Upstream.Host, "error", err)
				httpx.WriteProblemTo(w, r, status, detail)
			},
		}
	}
	return p
}

// Forward sends r to the route's service and copies the answer back.
func (p *Proxy) Forward(w http.ResponseWriter, r *http.Request, route routes.Route) {
	p.byPrefix[route.Prefix].ServeHTTP(w, r)
}
