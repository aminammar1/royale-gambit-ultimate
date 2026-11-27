package authprofile_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/authprofile"
)

func TestTheTokenComesWithTheSecretAndIsKept(t *testing.T) {
	var calls atomic.Int32
	user := uuid.Must(uuid.NewV7())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/internal/v1/users/"+user.String()+"/lichess-token" || r.Header.Get("X-Internal-Token") != "s3cret" {
			t.Errorf("request %s %v", r.URL.Path, r.Header)
		}
		_, _ = w.Write([]byte(`{"access_token":"lip_abc","expires_at":"2027-01-01T00:00:00Z"}`))
	}))
	defer srv.Close()
	c := authprofile.New(srv.URL, "s3cret")
	for i := 0; i < 3; i++ {
		token, err := c.LichessToken(context.Background(), user)
		if err != nil || token != "lip_abc" {
			t.Fatalf("%q %v", token, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("%d calls, want 1: the token is kept a while", calls.Load())
	}
}

func TestNoLichess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	_, err := authprofile.New(srv.URL, "s").LichessToken(context.Background(), uuid.Must(uuid.NewV7()))
	if !errors.Is(err, authprofile.ErrNoLichess) {
		t.Fatalf("want ErrNoLichess, got %v", err)
	}
}

func TestRetriesThenTheBreakerOpens(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	c := authprofile.New(srv.URL, "s")
	c.Backoff = time.Millisecond
	for i := 0; i < 5; i++ {
		if _, err := c.LichessToken(context.Background(), uuid.Must(uuid.NewV7())); !errors.Is(err, authprofile.ErrUnavailable) {
			t.Fatalf("try %d: want ErrUnavailable, got %v", i, err)
		}
	}
	// Each call tried 3 times until the breaker opened after the third failing call.
	if got := calls.Load(); got != 9 {
		t.Fatalf("%d requests, want 9 (3 calls x 3 tries, then the breaker)", got)
	}
}
