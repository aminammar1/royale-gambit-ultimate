# Services

One section per service. The diagram for each is in `docs/diagrams/NN-<name>.md`; the API is in `contracts/openapi/<name>.yaml`. Read only the section of the service you are working on.

| Service | Stack | Milestone | One line |
| --- | --- | --- | --- |
| `gateway` | Go + Gin (no database) | P2 | The single public entry. |
| `auth-profile` | Spring Boot (Java 25 LTS, Postgres) | P2, M7, M11 | Who you are, and your profile. |
| `puzzles` | Go + Gin (Postgres) | M6, M15 | Tactics training. |
| `learn` | Go + Gin (Postgres) | M13, M14 | Lessons and YouTube lesson files. |
| `games` | Go + Gin (Postgres, Redis) | M8, M12 | The games database and the explorer. |
| `analysis` | Go + Gin (Redis, Stockfish) | M4 | Stockfish as a service. |
| `bots` | FastAPI (Python 3.14) | M10 | Practice opponents. |
| `review` | FastAPI (Python 3.14, Postgres) | M5 | Post-game review. |
| `coach` | FastAPI (Python 3.14, Postgres) | M17 | Personalized advice (later). |

## Shared conventions (all services)
- Path prefix `/v1/`. JSON in snake_case. Pagination with `limit` + `cursor`. Errors are `application/problem+json`.
- Health: `/health/live`, `/health/ready`. Metrics: `/metrics`. Logs: JSON with `trace_id`, `service`, `user_id`.
- Config from environment variables only (12-factor). Secrets never in git; `.env.example` lists every variable.
- Dockerfile is multi-stage, non-root, with a health check. Image is built per service in CI.
- Events: topic exchange `rg.events`, routing key = event name, payload validated against `contracts/events/<name>.schema.json`, envelope `{ id, type, occurred_at, trace_id, data }`.
- Each service README is one screen: how to run, env vars, how to test.

## Working checklist for any service
### New service (only in the milestone that needs it)
1. Write `contracts/openapi/<name>.yaml` (paths under `/v1/`, problem+json errors) and any `contracts/events/*.schema.json`. Get Amine's OK on the contract if it is big.
2. Python: copy `services/_templates/python` to `services/<name>`. Go: copy `services/analysis`, the reference Go service, and drop `internal/engine`, `internal/pool`, `internal/uci` and the Stockfish stage of its Dockerfile. Rename; keep the health, logging, tracing, error and Docker setup untouched. There are no Go or Java templates any more (ADR-12): `analysis` and `auth-profile` are the references for their languages.
3. Add it to `infra/compose/docker-compose.yml` with a health check, its own database in `infra/db/`, and a gateway route.
4. Add `S=<name>` to `make check-svc`; add its path filter to CI.
5. Write the README (one screen: run, env vars, test).

### Every endpoint
- Validate input at the edge; return `application/problem+json` (`type`, `title`, `status`, `detail`, `trace_id`).
- Auth: read `sub`, `role`, `scope` from the verified JWT. Never trust a user id from the body.
- Idempotent writes where a retry is possible (`Idempotency-Key` header or natural key).
- Lists use `limit` + `cursor`. Times are UTC ISO-8601. IDs are UUIDv7.

### Events
- Envelope `{ id, type, occurred_at, trace_id, data }`; validate `data` against its schema before publish and after consume.
- Publish through an outbox table written in the same transaction as the state change.
- Consumers are idempotent (store processed event ids) and use a dead-letter queue after 3 retries.

### Calls to other services
Use the generated or hand-written client with a timeout (default 2 s, analysis 30 s), 2 retries with jitter on idempotent calls, and a circuit breaker. Propagate `traceparent`. Never go through the gateway.

### Data
Migrations only (Flyway, golang-migrate, Alembic); never auto-create tables at start-up in production. No cross-service foreign keys or queries.

### Tests before "done"
Unit tests for logic; integration tests with Testcontainers (real Postgres, Redis, RabbitMQ); contract check against the OpenAPI file; `make up` still starts and `/health/ready` is green; `make check-svc S=<name>` passes.

### Don't
Share a library between services (copy the template instead) · call another service's database · put business logic in the gateway · add a service, table or endpoint nobody uses yet.

## gateway
**The single public entry.** Go + Gin, a thin reverse proxy on `net/http` (no database). Milestone: P2.
- **Does:** JWT check via cached JWKS · rate limit per user and IP (Redis) · CORS · request id and trace headers · route `/v1/<service>/**` · aggregate OpenAPI docs.
- **Owns:** none
- **Events:** none
- **Calls / depends on:** auth-profile (JWKS), all services (routing)
- **Tests that matter:** Route tests per service; a request with a bad token never reaches a service; rate limit returns 429 with `Retry-After`.

## auth-profile
**Who you are, and your profile.** Spring Boot (Java 25 LTS, Postgres). Milestone: P2, M7, M11.
- **Does:** Email code or link sign-in, guest tokens, JWT + JWKS, refresh rotation, profile (username, country, settings, themes), Lichess and Chess.com linking (M11).
- **Owns:** users, identities, refresh_tokens, email_codes, profiles, settings
- **Events:** out: `user.registered`, `profile.updated`
- **Calls / depends on:** SMTP, Lichess OAuth, Chess.com OAuth
- **Tests that matter:** Code expiry and replay, attempt limits, refresh rotation reuse detection, JWKS rollover, profile sync conflict (last write wins by `updated_at`).

## puzzles
**Tactics training.** Go + Gin (Postgres). Milestone: M6, M15.
- **Does:** Next puzzle by rating and theme, attempt check, puzzle rating (Glicko-lite), daily puzzle by date, kits, kids puzzles (M15). Importer builds the table from a Lichess CSV subset.
- **Owns:** puzzles, kits, attempts, ratings
- **Events:** in: `user.registered` · out: `puzzle.attempted`
- **Calls / depends on:** none
- **Tests that matter:** Solution validator incl. alternative mates, rating update fixtures, daily puzzle is deterministic per date, importer is reproducible.

## learn
**Lessons and YouTube lesson files.** Go + Gin (Postgres). Milestone: M13, M14.
- **Does:** Lessons by level, steps, progress; lesson files that map video timestamps to FENs.
- **Owns:** lessons, steps, progress, lesson_files
- **Events:** out: `lesson.completed`
- **Calls / depends on:** none (the client embeds the video)
- **Tests that matter:** Progress idempotency, lesson file schema validation.

## games
**The games database and the explorer.** Go + Gin (Postgres, RabbitMQ; Redis from M12). Port 8085. Milestone: M8, M12.
- **Does:** Save and search each player's games (PGN + indexed fields), import by username from Chess.com and Lichess (worker, at most 2,000 a username, standard chess), dedupe by game hash (the site's id, else players + day + moves), ECO tagging from the CC0 lichess-org/chess-openings table; explorer stats per EPD (M12).
- **Owns:** games, import_jobs, outbox, processed_events; position_stats (M12)
- **Events:** in: `import.requested` (its own worker's queue `games.import-requested`, three retries then `.dead`), `review.completed` (from M5) · out: `game.saved`, `game.imported`, `import.requested`
- **Calls / depends on:** Chess.com API, Lichess API (public, User-Agent names the project's page); auth-profile's JWKS to read `sub`
- **Tests that matter:** PGN edge cases (`*` results, comments, illegal moves, variants, the library's panics), import dedupe, rate-limit handling, the full import through Postgres and RabbitMQ, events against their schemas; stats query performance on a large fixture and cache fallback (M12).

## analysis
**Stockfish as a service.** Go + Gin (Redis, Stockfish). Milestone: M4.
- **Does:** Pool of Stockfish processes, priority queue (live over batch), single and batch evaluation, SSE stream for live analysis, result cache. Scores are normalized to White.
- **Owns:** none (Redis cache only)
- **Events:** none
- **Calls / depends on:** Redis
- **Tests that matter:** UCI parser tests, perspective normalization, cache key (EPD + depth + multipv + engine version), pool restart on crash, no zombie processes, load test.

## bots
**Practice opponents.** FastAPI (Python 3.14). Milestone: M10.
- **Does:** Roster, opening books, strength policy; returns a move for a position and the clocks.
- **Owns:** roster config only (no database at first)
- **Events:** none
- **Calls / depends on:** analysis
- **Tests that matter:** Strength ordering test (stronger bot beats weaker over N games), book usage, move legality, time limits.

## review
**Post-game review.** FastAPI (Python 3.14, Postgres). Milestone: M5.
- **Does:** Create review job from PGN or game id, analyze every position through `analysis`, win probability, classification, accuracy, key moments, progress over SSE, cancel.
- **Owns:** reviews, review_jobs
- **Events:** in: `review.requested` · out: `review.completed`
- **Calls / depends on:** analysis; games (from M8, to load a game by id)
- **Tests that matter:** Win%/accuracy/classification against hand-computed golden files in `contracts/fixtures/review/`, cancel leaves no running work, job retry and idempotency.

## coach
**Personalized advice (later).** FastAPI (Python 3.14, Postgres). Milestone: M17.
- **Does:** Weakness stats from events, weekly plan, explanations written by an LLM. Every claim cites a game and move; no advice without data; cost cap per user.
- **Owns:** weakness_stats, advice, plans, usage
- **Events:** in: `review.completed`, `puzzle.attempted`
- **Calls / depends on:** review, puzzles, games, LLM API
- **Tests that matter:** Citations resolve to real games and moves, cost cap enforced, same input gives stable structure.

