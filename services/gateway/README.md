# gateway

The single public entry (Go + Gin, port 8080). The desktop app talks to `http://localhost:8080` and nothing else. No database and no business logic.

Every request goes through these steps, in order (one file each in `internal/app`):
1. **route:** refuse unknown methods and non-canonical paths (dot segments, `//`, `;`, encoded slashes, backslashes and `%25`), then route by prefix (longest prefix on whole segments; unknown paths get a 404 problem).
2. **address budget:** per client address, with IPv6 counted per /64, and again on sign-in routes. It runs *before* the token check, so refused tokens still cost the caller.
3. **token check:** exactly one `Authorization: Bearer` (scheme in any case), verified against auth-profile's JWKS. RS256 only; issuer, subject and expiry required; keys cached and refetched on an unknown `kid`.
4. **account budget:** per user; guests get less.
5. **forward:** one reverse proxy per route. It sets `X-Request-ID`, `X-Forwarded-For` (the real peer, never the client's claim) and W3C trace context, drops `X-Forwarded-Host` and `X-Real-IP`, and streams responses. A stream that breaks breaks for the client too.

The token is forwarded unchanged, and the service verifies it again. Redis checks are capped at 100 ms; if Redis is unreachable, requests pass (counted in `gateway_rate_limit_errors_total`, with one warning per 30 s).

| Route | Service | Token |
| --- | --- | --- |
| `/v1/auth/guest`, `/v1/auth/email/*`, `/v1/auth/lichess/*` | auth-profile | optional, sign-in rate limit |
| `/v1/auth/*` (refresh, logout) | auth-profile | optional (checked when sent) |
| `/v1/auth/identities/*`, `/v1/profile` | auth-profile | required |

## Run and test (Docker only)
- `make up` at the root starts it in front of auth-profile.
- `make check-svc S=gateway` runs gofmt, vet, and tests (Redis through Testcontainers).
- `make smoke` signs in by email through it.

## Env vars
| Var | Default | |
| --- | --- | --- |
| `PORT` | `8080` | |
| `UPSTREAM_AUTH_PROFILE_URL` | (required) | `http://auth-profile:8081` |
| `JWKS_URL` | (required) | auth-profile's `/.well-known/jwks.json` |
| `JWT_ISSUER` | `royale-gambit` | |
| `REDIS_URL` | (required) | rate-limit counters; if Redis is down, requests pass with a warning |
| `CORS_ORIGINS` | none | comma-separated, e.g. `http://localhost:1420,tauri://localhost` |
| `RATE_IP_PER_MIN`, `RATE_SIGNIN_PER_MIN`, `RATE_GUEST_PER_MIN`, `RATE_USER_PER_MIN` | 300, 20, 60, 300 | requests per minute |
| `UPSTREAM_TIMEOUT` | `10s` | time for a service to start answering (streams may then run on) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | export spans when set |
