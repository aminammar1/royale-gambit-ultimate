// Package auth checks access tokens issued by auth-profile, against its published keys (copied
// from the gateway: services share no library). The gateway checked the token already; this
// service checks it again to know, from `sub`, whose games these are.
package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Claims are the parts of a token the gateway acts on.
type Claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

// Verifier checks signatures with auth-profile's JWKS. The key set is cached and
// refreshed in the background, and fetched again (rate-limited) when a token names a
// key we have not seen, which is what happens right after a key rotation.
type Verifier struct {
	keys   keyfunc.Keyfunc
	issuer string
}

// NewVerifier starts the JWKS cache. A first fetch that fails is not fatal: the gateway
// can start before auth-profile does, and the cache keeps trying.
func NewVerifier(ctx context.Context, jwksURL, issuer string) (*Verifier, error) {
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("jwks %s: %w", jwksURL, err)
	}
	return &Verifier{keys: keys, issuer: issuer}, nil
}

// ErrInvalid wraps every reason a token is refused; callers only need to know it was.
var ErrInvalid = errors.New("invalid token")

// Verify returns the claims of a token signed by auth-profile, current and for us.
func (v *Verifier) Verify(raw string) (Claims, error) {
	var claims Claims
	_, err := jwt.ParseWithClaims(raw, &claims, v.keys.Keyfunc,
		// Pinning the algorithm is what stops "alg: none" and RS256-to-HS256 tricks.
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithIssuer(v.issuer),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return Claims{}, fmt.Errorf("%w: %w", ErrInvalid, err)
	}
	if claims.Subject == "" {
		return Claims{}, fmt.Errorf("%w: no subject", ErrInvalid)
	}
	return claims, nil
}
