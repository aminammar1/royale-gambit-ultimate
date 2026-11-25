package app_test

import (
	"net/http"
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/app"
)

func TestTheDesktopAppGetsCORSAndOthersDoNot(t *testing.T) {
	up := newUpstream(t, okJSON)
	gw := startGateway(t, app.Options{Routes: authProfileRoutes(t, up.URL), CORSOrigins: []string{"tauri://localhost"}})

	preflight, _ := http.NewRequest(http.MethodOptions, gw.URL+"/v1/profile", nil)
	preflight.Header.Set("Origin", "tauri://localhost")
	preflight.Header.Set("Access-Control-Request-Method", "PUT")
	preflight.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
	resp, err := http.DefaultClient.Do(preflight)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") != "tauri://localhost" ||
		resp.Header.Get("Access-Control-Allow-Methods") == "" || resp.Header.Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("preflight: %d %v", resp.StatusCode, resp.Header)
	}
	if up.hits.Load() != 0 {
		t.Fatal("a preflight reached the service")
	}

	req, _ := http.NewRequest(http.MethodGet, gw.URL+"/v1/profile", nil)
	req.Header.Set("Origin", "tauri://localhost")
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()
	if resp.Header.Get("Access-Control-Allow-Origin") != "tauri://localhost" || resp.Header.Get("Access-Control-Expose-Headers") == "" {
		t.Fatalf("actual request: %v", resp.Header)
	}

	req.Header.Set("Origin", "https://evil.example")
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()
	if resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("an unknown origin got CORS headers")
	}
}
