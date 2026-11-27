// Package config reads the gateway configuration from environment variables only (12-factor).
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/limit"
)

// Config is everything the gateway needs at start-up.
type Config struct {
	ServiceName     string
	Port            string
	AuthProfile     *url.URL // UPSTREAM_AUTH_PROFILE_URL
	Analysis        *url.URL // UPSTREAM_ANALYSIS_URL
	Games           *url.URL // UPSTREAM_GAMES_URL
	JWKSURL         string
	Issuer          string
	Redis           *redis.Options
	CORSOrigins     []string
	Limits          limit.Limits
	UpstreamTimeout time.Duration
}

// Load reads the environment. Anything missing or malformed stops the start with a
// message that names the variable: a gateway half-configured is worse than none.
func Load() (Config, error) {
	var errs []error
	c := Config{
		ServiceName: getenv("SERVICE_NAME", "gateway"),
		Port:        getenv("PORT", "8080"),
		JWKSURL:     os.Getenv("JWKS_URL"),
		Issuer:      getenv("JWT_ISSUER", "royale-gambit"),
		CORSOrigins: list(os.Getenv("CORS_ORIGINS")),
	}
	var err error
	if c.AuthProfile, err = absoluteURL("UPSTREAM_AUTH_PROFILE_URL"); err != nil {
		errs = append(errs, err)
	}
	if c.Analysis, err = absoluteURL("UPSTREAM_ANALYSIS_URL"); err != nil {
		errs = append(errs, err)
	}
	if c.Games, err = absoluteURL("UPSTREAM_GAMES_URL"); err != nil {
		errs = append(errs, err)
	}
	if _, err := absoluteURL("JWKS_URL"); err != nil {
		errs = append(errs, err)
	}
	for _, origin := range c.CORSOrigins {
		// Browsers send origins as scheme://host[:port], never with a path; a stray "/"
		// would silently never match.
		if u, err := url.Parse(origin); err != nil || u.Scheme == "" || u.Host == "" || u.Path != "" {
			errs = append(errs, fmt.Errorf("CORS_ORIGINS: %q is not an origin like http://localhost:1420", origin))
		}
	}
	if c.Redis, err = redis.ParseURL(os.Getenv("REDIS_URL")); err != nil {
		errs = append(errs, fmt.Errorf("REDIS_URL: %w", err))
	}
	c.Limits = limit.Limits{
		IP:     perMinute("RATE_IP_PER_MIN", 300, &errs),
		SignIn: perMinute("RATE_SIGNIN_PER_MIN", 20, &errs),
		Guest:  perMinute("RATE_GUEST_PER_MIN", 60, &errs),
		User:   perMinute("RATE_USER_PER_MIN", 300, &errs),
	}
	if c.UpstreamTimeout, err = time.ParseDuration(getenv("UPSTREAM_TIMEOUT", "10s")); err != nil || c.UpstreamTimeout <= 0 {
		errs = append(errs, errors.New("UPSTREAM_TIMEOUT must be a positive duration such as 10s"))
	}
	return c, errors.Join(errs...)
}

func absoluteURL(key string) (*url.URL, error) {
	raw := os.Getenv(key)
	u, err := url.Parse(raw)
	if raw == "" || err != nil || u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("%s must be an absolute URL such as http://auth-profile:8081", key)
	}
	return u, nil
}

func perMinute(key string, fallback int, errs *[]error) int {
	n, err := strconv.Atoi(getenv(key, strconv.Itoa(fallback)))
	if err != nil || n < 1 {
		*errs = append(*errs, fmt.Errorf("%s must be a positive number", key))
	}
	return n
}

func list(raw string) []string {
	var out []string
	for item := range strings.SplitSeq(raw, ",") {
		if item = strings.TrimSpace(item); item != "" {
			out = append(out, item)
		}
	}
	return out
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
