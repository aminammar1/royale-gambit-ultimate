# Architecture

Microservices from the start, one monorepo, a local-first desktop client. Diagrams are in `docs/diagrams/` (system overview: `00-system-architecture.md`; one file per service). Per-service detail is in `SERVICES.md`.

## Shape
- **Desktop client** (`apps/desktop`): Tauri 2 + React + TypeScript + Rust. Local-first: board, local games, local Stockfish analysis, settings and the local profile work with no network. Everything shared goes through the gateway.
- **Gateway** (`services/gateway`, Go): the only public entry. Validates JWTs, rate-limits, routes `/v1/<service>/**`.
- **Services** (`services/*`): `gateway`, `puzzles`, `learn`, `games`, `analysis` (Go + Gin) · `bots`, `review`, `coach` (FastAPI) · `auth-profile` (Spring Boot). Each owns its own database and deploys on its own.
- **Infra** (`infra/`): PostgreSQL (one database per service), Redis (cache, rate limits), RabbitMQ (events and jobs), MailHog in dev. Docker Compose runs it all: `make up`.

## Repository layout
```
apps/desktop/            Tauri client
  src/                   React app (features/, chess/, engine/, db/, api/, ui/, styles/)
  src-tauri/             Rust core (engine/, db/, commands.rs)
services/
  gateway/  puzzles/  learn/           Go + Gin
  games/  analysis/                    Go + Gin
  auth-profile/                        Spring Boot (Java 25 LTS, Maven)
  bots/  review/  coach/               FastAPI (Python 3.14, uv)
contracts/
  openapi/<service>.yaml               the REST contract of each service (source of truth)
  events/<event-name>.schema.json      the payload of each event
  fixtures/                            shared test data (FENs, PGNs, review golden files)
infra/
  compose/                             docker-compose.yml + profiles (core, obs)
  db/                                  one init script per service database
docs/                                  these documents
scripts/                               repo-level helpers
Makefile                               make up | down | logs | check | check-svc S=<name> | check-desktop
```
Each service has the same top-level shape: `README.md` (one screen), `Dockerfile`, `src/`, `tests/`, `migrations/` (if it has a database), `Makefile` target `check`.

## Rules between parts (enforced in review)
1. **Contract first.** Change `contracts/` first, then the code. Breaking changes need a new `/v2/` path, never a silent change.
2. **Client talks only to the gateway.** Services never call each other through the gateway.
3. **One owner per table.** A service reads another service's data only through its API or its events, never its database.
4. **Synchronous REST** for questions that need an answer now (with timeout, retry and circuit breaker). **Events on RabbitMQ** for things that happened and long jobs. Events are at-least-once, so every consumer is idempotent; a service that writes data and publishes an event uses the outbox pattern.
5. **Stateless services.** State lives in the database, Redis or the broker, so any service can run several copies.
6. **Chess rules are never hand-written.** chess.js in the client, python-chess in Python services, a maintained chess library in Go. All of them are checked against the shared golden files in `contracts/fixtures/`. Services pass FEN and UCI strings around and use EPD (FEN without move clocks) as the position key.
7. **Engine scores** leave the analysis service and the Rust engine manager from **White's** point of view, once.
8. **Every service** exposes `/health/live`, `/health/ready`, `/metrics`, writes JSON logs with `trace_id`, propagates `traceparent`, and returns errors as `application/problem+json` (RFC 9457).

## Authentication
- Sign-in by email code or link, guest tokens, then Lichess and Chess.com linking (all in `auth-profile`).
- JWT signed with RS256, access token 15 minutes, refresh token 30 days and rotated on use. Public keys are served as JWKS. The gateway and every service verify the signature; they do not call `auth-profile` per request.
- Claims: `sub` (user id, UUIDv7), `role` (`guest` | `user`), `scope`. Guests get low quotas and their data stays on the device.
- Client stores the refresh token in the OS keychain (Rust), never in SQLite or the web layer.

## Desktop client internals
```
React UI ──► features/* ──► chess/   (pure TS, chess.js)
                  │  ├──► api/      generated REST client, token refresh, offline outbox
                  │  └──► engine/ db/  typed Tauri invoke clients
Rust core: EngineManager ── UCI ──► Stockfish sidecar ; rusqlite ; keychain
```
Only `src/engine/`, `src/db/` and `src/api/auth` call Tauri `invoke`/`listen`. The web layer has no shell, fs or process permissions.

**Local-first rules:** a local action writes to SQLite first and shows success; a background outbox syncs to the services and retries with backoff. Features that need a service (review, bots, puzzles, explorer, import) show a clear "needs connection" state when offline and never block the board.

### Engine contract (local Stockfish, IPC)
Commands: `engine_start()`, `engine_analyze({ fen, moves?, multipv, depth?, movetimeMs?, infinite? }) -> requestId`, `engine_stop()`, `engine_set_option({ name, value })`, `engine_quit()`.
Events: `engine://info { requestId, depth, multipv, scoreCp?, mate?, wdl?, pv: string[] }` (throttled to at most 10/s per line) and `engine://bestmove { requestId, best, ponder? }`.
One process; requests are serialized (new request sends `stop`, waits for `bestmove`). Stale `requestId` events are dropped on the TS side.

## Data
- Local: SQLite in the app data folder (`profile`, `games`, `themes`, `settings`, `outbox`, `explorer_cache`). Games are PGN plus indexed columns.
- Cloud: PostgreSQL, one database per service, migrations in each service (Flyway for Spring, golang-migrate for Go, Alembic for Python). IDs are UUIDv7, times are UTC ISO-8601.
- Redis only holds data that can be rebuilt. No MongoDB.

## Local development and delivery
Everything backend runs in Docker (ADR-18): `make up` starts infra and every service, `make watch` rebuilds a service on change, and `make check-svc S=<name>` runs its tests inside the service's `toolchain` image, so the host needs no Go, Java or Python. The desktop app runs natively with `pnpm tauri:dev` against `http://localhost:8080`. CI runs per service on changed paths: lint, unit tests, contract check, image build, then a compose smoke test. Deployment (staging then production) arrives in M16. See `diagrams/12-dev-and-deploy.md`.

## Performance budgets
- Board interaction stays at 60 fps while the engine runs. Engine work never runs on the UI thread.
- Cold start to interactive home < 2 s, with or without the network.
- Gateway adds < 10 ms p95. Analysis cache hit < 20 ms p95. Review of a 40-move game < 60 s with progress and cancel.
