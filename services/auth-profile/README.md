# auth-profile

Who you are, and your profile. Spring Boot 4 on Java 25 LTS, Postgres, RabbitMQ. Port 8081.
Contract: `contracts/openapi/auth-profile.yaml`; events `user.registered` and `profile.updated` (`contracts/events/`).

- **Sign-in:** guest accounts, six-digit email codes (10 min, 5 tries, 60 s resend cooldown), Lichess (PKCE, loopback redirect only; link and unlink).
- **Tokens:** RS256 access tokens (15 min) with `sub`, `role`, `scope`; opaque refresh tokens (30 days), rotated on every use, reuse revokes the whole session. Public keys at `/.well-known/jwks.json`.
- **Profile:** `GET/PUT /v1/profile`, last write wins by `updated_at`; guests keep theirs on the device.
- **Events:** written to an outbox in the same transaction, relayed to `rg.events` with publisher confirms (at least once).

Code is split by feature: `auth/` (ways to sign in, sessions), `token/` (keys, JWT, JWKS), `profile/`, `events/`, `web/` (security, JSON, errors), `common/`.

## Run and test (Docker only)
- `make up` at the root starts it with Postgres, RabbitMQ and Mailpit; codes show up in Mailpit at http://localhost:8025.
- `make check-svc S=auth-profile`: format check, unit and integration tests (Testcontainers: Postgres, RabbitMQ, Mailpit, plus a fake Lichess).
- `make fmt-svc S=auth-profile` applies the formatter. `make smoke` also checks the running service against its contract.

## Env vars
| Var | Default | |
| --- | --- | --- |
| `PORT` | `8081` | |
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | (required) | `jdbc:postgresql://…` |
| `MIGRATE_ON_START` | `false` | dev only; production runs Flyway as a release step |
| `JWT_PRIVATE_KEY` | (required) | RSA private key, PKCS#8 PEM. Make one: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048` |
| `JWT_EPHEMERAL_KEY` | `false` | `true` signs with a throwaway key (dev and tests only) |
| `JWT_ISSUER` | `royal-gambit` | `iss` claim |
| `JWT_RETIRED_PUBLIC_KEYS` | empty | key rotation: the old key's public PEM, kept for 15 min after switching `JWT_PRIVATE_KEY` |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | `localhost`, `1025`, none | SMTP for sign-in codes |
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | `localhost`, `5672`, `guest` | event broker |
| `OUTBOX_POLL` | `PT1S` | how often the relay looks for events |
| `HOUSEKEEPING_INTERVAL` | `PT1H` | how often expired codes, flows, sessions and abandoned guests are deleted |
| `LICHESS_URL`, `LICHESS_CLIENT_ID` | `https://lichess.org`, `royal-gambit` | Lichess needs no app registration for PKCE |
| `MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT` | unset | e.g. `http://otel-collector:4318/v1/traces` |
