// Package testdata finds the repository's shared contracts from tests. In the toolchain container
// (`make check-svc`) they are mounted read-only at /contracts; in a plain checkout they are three
// folders up. CONTRACTS_DIR overrides both.
package testdata

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Contracts returns the contracts folder or fails the test.
func Contracts(t testing.TB) string {
	t.Helper()
	candidates := []string{os.Getenv("CONTRACTS_DIR"), "/contracts"}
	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "../../../../contracts"))
	}
	for _, dir := range candidates {
		if dir == "" {
			continue
		}
		if st, err := os.Stat(filepath.Join(dir, "fixtures")); err == nil && st.IsDir() {
			return dir
		}
	}
	t.Fatal("contracts folder not found: run through `make check-svc S=analysis`, or set CONTRACTS_DIR")
	return ""
}
