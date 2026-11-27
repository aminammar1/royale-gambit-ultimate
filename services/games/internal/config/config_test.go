package config_test

import (
	"strings"
	"testing"

	"github.com/aminammar1/royale-gambit-ultimate/services/games/internal/config"
)

func required(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://games:games@postgres:5432/games")
	t.Setenv("RABBITMQ_URL", "amqp://rg:rg@rabbitmq:5672/")
	t.Setenv("JWKS_URL", "http://auth-profile:8081/.well-known/jwks.json")
}

func TestDefaults(t *testing.T) {
	required(t)
	c, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != "8085" || c.Issuer != "royale-gambit" || c.LichessURL != "https://lichess.org" ||
		c.ChessComURL != "https://api.chess.com" || c.MaxImport != 2000 || c.ImportWorkers != 2 ||
		c.ExplorerURL != "https://explorer.lichess.ovh" || c.AuthProfileURL != "http://auth-profile:8081" || c.RedisURL != "" {
		t.Fatalf("%+v", c)
	}
	// Chess.com asks for a contact in the User-Agent: the project's page, never a person's email.
	if !strings.Contains(c.UserAgent, "github.com/aminammar1/royale-gambit-ultimate") {
		t.Fatalf("user agent %q", c.UserAgent)
	}
}

func TestRequired(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("RABBITMQ_URL", "")
	t.Setenv("JWKS_URL", "")
	_, err := config.Load()
	for _, want := range []string{"DATABASE_URL", "RABBITMQ_URL", "JWKS_URL"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("want %s in %v", want, err)
		}
	}
}

func TestBadNumbers(t *testing.T) {
	required(t)
	t.Setenv("MAX_IMPORT_GAMES", "0")
	if _, err := config.Load(); err == nil || !strings.Contains(err.Error(), "MAX_IMPORT_GAMES") {
		t.Fatalf("want MAX_IMPORT_GAMES error, got %v", err)
	}
}
