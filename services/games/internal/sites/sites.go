// Package sites reads a player's games from Lichess and Chess.com, newest first, standard chess
// only, as PGN texts. Both are public APIs: no token, a User-Agent that names the project, one
// request at a time, and a pause when a site says we are too fast.
package sites

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Fetcher calls emit with each game's PGN, at most max games. An error from emit stops it.
type Fetcher interface {
	Fetch(ctx context.Context, username string, max int, emit func(pgn string) error) error
}

var (
	// ErrNoSuchPlayer: the site does not know the username.
	ErrNoSuchPlayer = errors.New("no such player on this site")
	// ErrRateLimited: the site kept refusing after the pauses it asks for.
	ErrRateLimited = errors.New("the site is limiting our requests; try again later")
)

// retries is how many times a request refused with 429 is tried again.
const retries = 3

// Sleep waits d or until ctx ends; the default Wait.
func Sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

type client struct {
	userAgent string
	http      *http.Client
	wait      func(context.Context, time.Duration) error
	// pause is how long the site asks us to wait after a 429.
	pause time.Duration
}

// get sends a GET and answers the response once it is not a 429. The caller closes the body.
func (c client) get(ctx context.Context, rawURL, accept string) (*http.Response, error) {
	hc := c.http
	if hc == nil {
		hc = &http.Client{Timeout: 5 * time.Minute}
	}
	wait := c.wait
	if wait == nil {
		wait = Sleep
	}
	for attempt := 0; ; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", c.userAgent)
		req.Header.Set("Accept", accept)
		resp, err := hc.Do(req)
		if err != nil {
			return nil, fmt.Errorf("reaching the site: %w", err)
		}
		switch {
		case resp.StatusCode == http.StatusTooManyRequests:
			_ = resp.Body.Close()
			if attempt == retries {
				return nil, ErrRateLimited
			}
			if err := wait(ctx, retryAfter(resp, c.pause)); err != nil {
				return nil, err
			}
		case resp.StatusCode == http.StatusNotFound:
			_ = resp.Body.Close()
			return nil, ErrNoSuchPlayer
		case resp.StatusCode != http.StatusOK:
			_ = resp.Body.Close()
			return nil, fmt.Errorf("the site answered %s", resp.Status)
		default:
			return resp, nil
		}
	}
}

func retryAfter(resp *http.Response, fallback time.Duration) time.Duration {
	if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && s > 0 && s <= 300 {
		return time.Duration(s) * time.Second
	}
	return fallback
}

// Lichess reads /api/games/user/{name} as NDJSON, one game a line, newest first.
type Lichess struct {
	Base      string
	UserAgent string
	HTTP      *http.Client
	Wait      func(context.Context, time.Duration) error
}

// Fetch implements Fetcher.
func (l *Lichess) Fetch(ctx context.Context, username string, max int, emit func(string) error) error {
	c := client{userAgent: l.UserAgent, http: l.HTTP, wait: l.Wait, pause: time.Minute}
	// Standard speeds only: variants are perfs of their own, so max then counts standard games.
	q := url.Values{"max": {strconv.Itoa(max)}, "pgnInJson": {"true"}, "clocks": {"false"}, "evals": {"false"},
		"perfType": {"ultraBullet,bullet,blitz,rapid,classical,correspondence"}}
	resp, err := c.get(ctx, l.Base+"/api/games/user/"+url.PathEscape(username)+"?"+q.Encode(), "application/x-ndjson")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)
	sent := 0
	for sc.Scan() && sent < max {
		var g struct {
			Variant string `json:"variant"`
			PGN     string `json:"pgn"`
		}
		if json.Unmarshal(sc.Bytes(), &g) != nil || g.PGN == "" {
			continue
		}
		// A standard game from a set position is still standard chess.
		if g.Variant != "standard" && g.Variant != "fromPosition" {
			continue
		}
		if err := emit(g.PGN); err != nil {
			return err
		}
		sent++
	}
	if err := sc.Err(); err != nil {
		return fmt.Errorf("reading Lichess's answer: %w", err)
	}
	return nil
}

// ChessCom reads the monthly archives of /pub/player/{name}, newest month first.
type ChessCom struct {
	Base      string
	UserAgent string
	HTTP      *http.Client
	Wait      func(context.Context, time.Duration) error
}

// Fetch implements Fetcher.
func (cc *ChessCom) Fetch(ctx context.Context, username string, max int, emit func(string) error) error {
	c := client{userAgent: cc.UserAgent, http: cc.HTTP, wait: cc.Wait, pause: 10 * time.Second}
	prefix := cc.Base + "/pub/player/" + url.PathEscape(strings.ToLower(username)) + "/games/"
	var archives struct {
		Archives []string `json:"archives"`
	}
	if err := c.getJSON(ctx, prefix+"archives", &archives); err != nil {
		return err
	}
	sent := 0
	for i := len(archives.Archives) - 1; i >= 0 && sent < max; i-- {
		month := archives.Archives[i]
		// Only the site's own archive pages: never a URL the answer points elsewhere.
		if !strings.HasPrefix(month, prefix) {
			continue
		}
		var page struct {
			Games []struct {
				Rules string `json:"rules"`
				PGN   string `json:"pgn"`
			} `json:"games"`
		}
		if err := c.getJSON(ctx, month, &page); err != nil {
			if errors.Is(err, ErrNoSuchPlayer) {
				continue // an empty month
			}
			return err
		}
		for j := len(page.Games) - 1; j >= 0 && sent < max; j-- {
			g := page.Games[j]
			if g.Rules != "chess" || g.PGN == "" {
				continue
			}
			if err := emit(g.PGN); err != nil {
				return err
			}
			sent++
		}
	}
	return nil
}

func (c client) getJSON(ctx context.Context, rawURL string, v any) error {
	resp, err := c.get(ctx, rawURL, "application/json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<20)).Decode(v); err != nil {
		return fmt.Errorf("reading the site's answer: %w", err)
	}
	return nil
}
