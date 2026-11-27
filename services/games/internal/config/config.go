// Package config reads the service configuration from environment variables only (12-factor).
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Config is everything the service needs at start-up.
type Config struct {
	ServiceName string
	Port        string
	DatabaseURL string
	RabbitURL   string
	// JWKSURL and Issuer check the tokens auth-profile signs, as the gateway does.
	JWKSURL string
	Issuer  string
	// LichessURL and ChessComURL are the sites' API roots (a fake server's in tests).
	LichessURL  string
	ChessComURL string
	// UserAgent is sent to both sites; Chess.com asks for a contact in it.
	UserAgent string
	// MaxImport caps the games one import reads (Amine, 2026-11-28: 2,000 per username).
	MaxImport     int
	ImportWorkers int
	// MigrateOnStart applies the migrations at start-up (dev and compose; production runs them
	// as a step of the deploy, M16).
	MigrateOnStart bool
}

// Load reads the environment. DATABASE_URL, RABBITMQ_URL and JWKS_URL are required.
func Load() (Config, error) {
	c := Config{
		ServiceName:    getenv("SERVICE_NAME", "games"),
		Port:           getenv("PORT", "8085"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		RabbitURL:      os.Getenv("RABBITMQ_URL"),
		JWKSURL:        os.Getenv("JWKS_URL"),
		Issuer:         getenv("JWT_ISSUER", "royale-gambit"),
		LichessURL:     getenv("LICHESS_URL", "https://lichess.org"),
		ChessComURL:    getenv("CHESSCOM_URL", "https://api.chess.com"),
		UserAgent:      getenv("USER_AGENT", "RoyaleGambitUltimate/0.1 (+https://github.com/aminammar1/royale-gambit-ultimate)"),
		MigrateOnStart: getenv("MIGRATE_ON_START", "false") == "true",
	}
	var errs []error
	for key, v := range map[string]string{"DATABASE_URL": c.DatabaseURL, "RABBITMQ_URL": c.RabbitURL, "JWKS_URL": c.JWKSURL} {
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", key))
		}
	}
	ints := []struct {
		key           string
		def, min, max int
		dst           *int
	}{
		{"MAX_IMPORT_GAMES", 2000, 1, 2000, &c.MaxImport},
		{"IMPORT_WORKERS", 2, 1, 16, &c.ImportWorkers},
	}
	for _, v := range ints {
		n, err := strconv.Atoi(getenv(v.key, strconv.Itoa(v.def)))
		if err != nil || n < v.min || n > v.max {
			errs = append(errs, fmt.Errorf("%s must be a whole number from %d to %d", v.key, v.min, v.max))
			continue
		}
		*v.dst = n
	}
	return c, errors.Join(errs...)
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
