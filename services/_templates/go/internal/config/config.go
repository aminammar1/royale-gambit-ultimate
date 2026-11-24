// Package config reads the service configuration from environment variables only (12-factor).
package config

import (
	"errors"
	"os"
	"strconv"
)

// Config is everything the service needs at start-up.
type Config struct {
	ServiceName    string
	Port           string
	DatabaseURL    string
	MigrateOnStart bool
}

// Load reads the environment. DATABASE_URL is required; the rest has defaults.
func Load() (Config, error) {
	c := Config{
		ServiceName: getenv("SERVICE_NAME", "template-go"),
		Port:        getenv("PORT", "8101"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	m, err := strconv.ParseBool(getenv("MIGRATE_ON_START", "false"))
	if err != nil {
		return c, errors.New("MIGRATE_ON_START must be true or false")
	}
	c.MigrateOnStart = m
	return c, nil
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
