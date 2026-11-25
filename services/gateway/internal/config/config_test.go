package config_test

import (
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/gateway/internal/config"
)

func required(t *testing.T) {
	t.Setenv("UPSTREAM_AUTH_PROFILE_URL", "http://auth-profile:8081")
	t.Setenv("JWKS_URL", "http://auth-profile:8081/.well-known/jwks.json")
	t.Setenv("REDIS_URL", "redis://redis:6379/0")
}

func TestDefaultsAreTheDocumentedOnes(t *testing.T) {
	required(t)
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.Issuer != "royal-gambit" || cfg.Limits.IP != 300 || cfg.Limits.SignIn != 20 ||
		cfg.Limits.Guest != 60 || cfg.Limits.User != 300 || len(cfg.CORSOrigins) != 0 {
		t.Fatalf("defaults: %+v", cfg)
	}
	if cfg.AuthProfile.String() != "http://auth-profile:8081" {
		t.Fatalf("upstream %v", cfg.AuthProfile)
	}
}

func TestListsAndNumbersAreParsed(t *testing.T) {
	required(t)
	t.Setenv("CORS_ORIGINS", "http://localhost:1420, tauri://localhost")
	t.Setenv("RATE_SIGNIN_PER_MIN", "5")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[1] != "tauri://localhost" || cfg.Limits.SignIn != 5 {
		t.Fatalf("parsed: %+v", cfg)
	}
}

func TestMissingOrBrokenSettingsStopTheStart(t *testing.T) {
	for name, env := range map[string][2]string{
		"no upstream":   {"UPSTREAM_AUTH_PROFILE_URL", ""},
		"no jwks":       {"JWKS_URL", ""},
		"no redis":      {"REDIS_URL", ""},
		"relative url":  {"UPSTREAM_AUTH_PROFILE_URL", "auth-profile:8081"},
		"bad number":    {"RATE_IP_PER_MIN", "lots"},
		"zero limit":    {"RATE_USER_PER_MIN", "0"},
		"bad redis url": {"REDIS_URL", "not a url"},
		"silly timeout": {"UPSTREAM_TIMEOUT", "soon"},
	} {
		t.Run(name, func(t *testing.T) {
			required(t)
			t.Setenv(env[0], env[1])
			if _, err := config.Load(); err == nil {
				t.Fatalf("%s=%q accepted", env[0], env[1])
			}
		})
	}
}
