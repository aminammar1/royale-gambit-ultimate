# P2 (part 1): auth-profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Spring Boot `auth-profile` service from P2: guest tokens, email-code sign-in, RS256 JWT + JWKS, rotating refresh tokens with reuse detection, the player profile, and the `user.registered` / `profile.updated` events through an outbox, built and tested in Docker.

**Architecture:** A copy of `services/_templates/java` renamed to `auth-profile` (package `dev.royalgambit.authprofile`), split by feature: `auth/` (guest, email codes, sessions), `token/` (signing keys, JWT issuing, JWKS), `profile/`, `events/` (outbox + relay), `web/` and `common/` from the template. Plain JdbcClient + Flyway, Spring Security as an OAuth2 resource server for its own tokens, Spring AMQP for the relay, Spring Mail for codes.

**Tech Stack:** Java 25 LTS, Spring Boot 4.2 (webmvc, jdbc, flyway, security, oauth2-resource-server, amqp, mail, actuator, opentelemetry), Nimbus JOSE (via Spring Security), Testcontainers (Postgres, RabbitMQ, Mailpit).

**Spec:** `docs/ROADMAP.md` § P2, `docs/SERVICES.md` § auth-profile + checklist, `docs/ARCHITECTURE.md` § Authentication, `contracts/openapi/auth-profile.yaml`, `contracts/events/{user.registered,profile.updated}.schema.json`.

The gateway (the other half of P2) is a separate plan.

## Global Constraints
- Contract first: the code implements `contracts/openapi/auth-profile.yaml` exactly; JSON snake_case; errors `application/problem+json` with `type`, `title`, `status`, `trace_id`.
- Template conventions stay untouched: health, metrics, JSON logs, tracing, `ProblemHandler`, `JsonConfig`, Docker layout.
- RS256, access 15 min (`expires_in: 900`), refresh 30 days, rotated on use. Claims: `sub` (UUIDv7), `role` (`guest`|`user`), `scope`, `iss`, `iat`, `exp`, `jti`.
- Codes: 6 digits, 10 min, 5 wrong guesses, 60 s resend cooldown, stored hashed, single use.
- Refresh tokens: 256-bit random, base64url, only SHA-256 stored.
- Config from env only; no secrets in git; ids UUIDv7; times UTC.
- Port 8081; Postgres database `auth_profile`; events on exchange `rg.events`, routing key = event type, envelope per `envelope.schema.json`.
- Comments read like a senior engineer's notes: why, not what.

## Review Focus
1. Two refresh calls racing with the same token: exactly one wins; the loser counts as reuse. → Task 3 test `concurrentRefreshOnlyOneWins`.
2. Email case and spaces (`Amine@X.com ` vs `amine@x.com`) map to one account. → Task 2 test `emailIsNormalized`.
3. A token signed by another key, or expired, never reaches `/v1/profile`. → Task 4 test `foreignOrExpiredTokenIs401`.
4. Broker down while a profile is written: the write succeeds and the event goes out later. → Task 5 test `relayPublishesAfterBrokerReturns` (publish fails → row stays unpublished → retried).
5. Username already taken by someone else in another case. → Task 4 test `usernameIsUniqueIgnoringCase` (409).

---

### Task 1: Scaffold `services/auth-profile` from the template

**Files:** copy `services/_templates/java` → `services/auth-profile`; modify `pom.xml` (artifactId/name `auth-profile`, new starters), `application.properties`, `Dockerfile` (port 8081), `README.md`; move package `dev.royalgambit.service` → `dev.royalgambit.authprofile`; `UuidV7` → `common/`; delete `items/` and `V1__items.sql`; `infra/compose/docker-compose.yml` (service `auth-profile`, profile `full`); `.env.example` (`SERVICE_DATABASES += auth_profile`); `.github/workflows/ci.yml` + `release.yml` (path filter and image); `Makefile` CI build path; root `.gitignore`.

- [ ] Health/metrics/problem integration test from the template (minus items) passes in `make check-svc S=auth-profile`.
- [ ] `docker build services/auth-profile` succeeds. Commit.

### Task 2: Schema, tokens and email sign-in

**Files:** `db/migration/V1__auth.sql` (users, identities, email_codes, refresh_tokens, outbox); `token/SigningKeys`, `token/TokenIssuer`, `token/JwksController`; `auth/EmailCodes`, `auth/CodeMailer`, `auth/SessionService`, `auth/AuthController`, `auth/AuthProblems`.

**Interfaces:**
- `SigningKeys` (from `JWT_PRIVATE_KEY` PEM, or a generated key when `JWT_EPHEMERAL_KEY=true`; fails fast otherwise): `RSAKey active()`, `JWKSet publicSet()`.
- `TokenIssuer.issue(UUID userId, Role role): IssuedAccessToken(String token, long expiresIn)`.
- `SessionService.open(UUID userId, Role role): TokenPair`; `refresh(String raw): TokenPair`; `close(String raw)`.
- `EmailCodes.start(String email)`; `EmailCodes.verify(String email, String code): UUID userId` (creates user + identity + `user.registered` outbox row on first sign-in, same transaction).

- [ ] Unit: `CodeHasherTest`, `SigningKeysTest` (kid = RFC 7638 thumbprint; missing key without the ephemeral flag fails start).
- [ ] Integration (`EmailSignInIT`, real Postgres + Mailpit container): code arrives in Mailpit and signs in; `wrongCodeCountsDown` (attempts_left 4…0, then code-expired); `expiredCodeIsRejected` (clock moved 10 min + 1 s); `replayedCodeIsRejected`; `newCodeReplacesOld`; `resendInsideCooldownSendsNothing`; `emailIsNormalized`; `firstSignInWritesUserRegistered` (one outbox row, second sign-in none); guest returns 201 with `role: guest`.
- [ ] JWKS verifies an issued token (`JwksIT`). Commit.

### Task 3: Refresh rotation and reuse detection

- [ ] Integration (`RefreshIT`): `rotationReturnsNewPair`; `oldTokenAfterRotationIsReuseAndRevokesFamily` (both the old and the newest token now fail); `expiredRefreshIsInvalid`; `logoutIsIdempotent`; `concurrentRefreshOnlyOneWins` (10 parallel calls → 1×200, 9×401).
- [ ] Claim with `UPDATE … SET used_at = now() WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING …`; zero rows + a used row → revoke family. Commit.

### Task 4: Profile

**Files:** `db/migration/V2__profiles.sql`; `profile/Profile`, `ProfileWrite`, `ProfileRepository`, `ProfileService`, `ProfileController`; `web/SecurityConfig` (resource server on our own public key; `role` claim → authority; problem+json 401/403).

- [ ] Integration (`ProfileIT`): `getBeforeCreateIs404`; `putCreatesThenGetReturnsIt`; `olderWriteIsIgnored` (LWW by `updated_at`); `guestGets403`; `missingTokenIs401`; `foreignOrExpiredTokenIs401`; `usernameIsUniqueIgnoringCase`; `invalidCountryIs400` (`XX` not in ISO list); `settingsOver16KiBIs400`; `changeWritesProfileUpdatedOnce` (an identical PUT writes no event). Commit.

### Task 5: Outbox relay to RabbitMQ

**Files:** `events/Outbox` (append inside the caller's transaction), `events/OutboxRelay` (`@Scheduled`, `SELECT … FOR UPDATE SKIP LOCKED LIMIT 100`, publish with publisher confirms, set `published_at`).

- [ ] Integration (`OutboxRelayIT`, RabbitMQ container with `rg.events`): envelope matches `envelope.schema.json` and `data` matches the event schema; routing key = type; `relayPublishesAfterBrokerReturns`. Commit.

### Task 6: Wire into the stack and verify

- [ ] `make check-svc S=auth-profile` green; `make up` → `auth-profile` healthy; manual flow against compose: start → code in Mailpit UI → verify → refresh → PUT/GET profile → event visible in RabbitMQ.
- [ ] Schemathesis against `contracts/openapi/auth-profile.yaml` added to `scripts/smoke.sh`.
- [ ] README (one screen), `docs/SETUP.md` if versions changed, chess-correctness review not needed (no chess code), code review, commit. `make down`.
