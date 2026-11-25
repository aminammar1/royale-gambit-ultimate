// Package config reads the gateway configuration from environment variables only (12-factor).
package config

import "os"

// Config is everything the gateway needs at start-up.
type Config struct {
	ServiceName string
	Port        string
}

// Load reads the environment.
func Load() (Config, error) {
	return Config{
		ServiceName: getenv("SERVICE_NAME", "gateway"),
		Port:        getenv("PORT", "8080"),
	}, nil
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
