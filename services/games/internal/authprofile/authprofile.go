// Package authprofile asks the auth-profile service, directly and never through the gateway
// (ADR-11), for what only it keeps: a player's Lichess token, for the opening explorer (ADR-19).
// Calls time out after 2 s, are tried 3 times with jitter, and a breaker stops calling for 30 s
// after 3 calls in a row failed. A token is kept 10 minutes.
package authprofile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

var (
	// ErrNoLichess: the player has not signed in with Lichess.
	ErrNoLichess = errors.New("no lichess token")
	// ErrUnavailable: auth-profile did not answer, or the breaker is open.
	ErrUnavailable = errors.New("auth-profile unavailable")
)

const (
	tries     = 3
	keepFor   = 10 * time.Minute
	tripAfter = 3
	openFor   = 30 * time.Second
)

type kept struct {
	token string
	until time.Time
}

// Client is the auth-profile client.
type Client struct {
	base, secret string
	http         *http.Client
	// Backoff is the first pause between tries; each next one doubles, with jitter.
	Backoff time.Duration

	mu        sync.Mutex
	tokens    map[uuid.UUID]kept
	failures  int
	openUntil time.Time
}

// New makes a client for auth-profile at base, sending secret as X-Internal-Token.
func New(base, secret string) *Client {
	return &Client{base: base, secret: secret, http: &http.Client{Timeout: 2 * time.Second},
		Backoff: 100 * time.Millisecond, tokens: map[uuid.UUID]kept{}}
}

// LichessToken is the player's Lichess token.
func (c *Client) LichessToken(ctx context.Context, user uuid.UUID) (string, error) {
	c.mu.Lock()
	if k, ok := c.tokens[user]; ok && time.Now().Before(k.until) {
		c.mu.Unlock()
		return k.token, nil
	}
	if time.Now().Before(c.openUntil) {
		c.mu.Unlock()
		return "", ErrUnavailable
	}
	c.mu.Unlock()

	token, err := c.fetch(ctx, user)
	c.mu.Lock()
	defer c.mu.Unlock()
	switch {
	case err == nil:
		c.failures = 0
		c.tokens[user] = kept{token, time.Now().Add(keepFor)}
	case errors.Is(err, ErrNoLichess):
		c.failures = 0
	default:
		c.failures++
		if c.failures >= tripAfter {
			c.openUntil = time.Now().Add(openFor)
			c.failures = 0
		}
	}
	return token, err
}

func (c *Client) fetch(ctx context.Context, user uuid.UUID) (string, error) {
	pause := c.Backoff
	var last error
	for try := 0; try < tries; try++ {
		if try > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(pause + time.Duration(rand.Int64N(int64(pause)+1))):
			}
			pause *= 2
		}
		token, retry, err := c.once(ctx, user)
		if err == nil || !retry {
			return token, err
		}
		last = err
	}
	return "", fmt.Errorf("%w: %v", ErrUnavailable, last)
}

// once is one request; retry says whether trying again could help.
func (c *Client) once(ctx context.Context, user uuid.UUID) (token string, retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/internal/v1/users/"+user.String()+"/lichess-token", nil)
	if err != nil {
		return "", false, err
	}
	req.Header.Set("X-Internal-Token", c.secret)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", true, err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return "", false, ErrNoLichess
	case resp.StatusCode >= 500:
		return "", true, fmt.Errorf("auth-profile answered %s", resp.Status)
	case resp.StatusCode != http.StatusOK:
		return "", false, fmt.Errorf("%w: auth-profile answered %s", ErrUnavailable, resp.Status)
	}
	var body struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil || body.AccessToken == "" {
		return "", false, fmt.Errorf("%w: unreadable answer", ErrUnavailable)
	}
	return body.AccessToken, false, nil
}
