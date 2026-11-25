# Decisions (ADRs)

Locked decisions for Royale Gambit Ultimate. If a task conflicts with one, stop and ask; do not work around it. Last reviewed: 2026-11-24.

## ADR-01: Microservices from the start (Amine's decision)
**Decision.** The backend is built as separate services from the first milestone that needs one, in one monorepo, behind one gateway. There is no "monolith first" phase. This replaces the earlier modular-monolith plan.
**Services.** gateway, auth-profile, puzzles, learn, games, analysis, bots, review, coach (see `SERVICES.md`).
**How the cost stays under control.** One repo and one `make up`; a shared template per language; contracts written first; each service is built in the milestone that needs it, never ahead; a service with no job yet does not exist yet.
**Reopen when.** Never without Amine.

## ADR-02: Client stack
Tauri 2 + React + TypeScript strict + **Vite** + Tailwind v4 + shadcn/ui + Motion + Zustand. pnpm, Vitest. Not Next.js: its server features cannot run inside Tauri.

## ADR-03: Chess rules are never hand-written, in any language
chess.js in the client (the only rules engine there), python-chess in Python services, a maintained chess library in Go. Services mostly pass FEN and UCI strings through. All implementations are checked against the same golden files in `contracts/fixtures/` (perft positions, PGNs, review cases). Position key everywhere: EPD.

## ADR-04: Board component
`react-chessboard` v5, themed (square colors, pieces, arrows, highlights). Placeholder pieces until Amine's own print-style SVG set arrives.

## ADR-05: Engine runs in two places, on purpose
- **Local Stockfish sidecar** (Rust, UCI) powers the Analysis page: instant, offline, free.
- **`analysis` service** (Go) runs a Stockfish pool for server flows: review, bots, coach, and later mobile. It caches results per position.
Both normalize scores to White's view once. The latest stable Stockfish release (pinned and checksum-verified when M3 starts), one build per OS/arch. The web layer never gets shell or process permissions.

## ADR-06: Data stores
SQLite locally (Rust, `rusqlite`). PostgreSQL in the cloud with **one database per service**. Redis for rebuildable data only (cache, rate limits). RabbitMQ for events and jobs. No MongoDB. A service never reads another service's tables.

## ADR-07: Puzzles
The `puzzles` service imports a curated subset (about 50 to 100k, balanced by rating band and theme) of the Lichess puzzle CSV with a reproducible script. Progress and ratings live in the service.

## ADR-08: Game review lives in the `review` service
It asks `analysis` for every position, converts to win probability, classifies moves (Lichess-style thresholds), computes accuracy and key moments. The formulas are in `docs/ENGINE.md`. Golden files in `contracts/fixtures/review/` define the expected numbers. Offline review (local Stockfish) is a possible later addition, not part of the plan.

## ADR-09: Identity grows in steps
Guest token and local player profile (the "federation registration" card) first, then email code or link, then Lichess OAuth (PKCE, no app registration), then Chess.com OAuth (**needs an approved application: apply early**). Guest mode always stays available. Details in `ARCHITECTURE.md`.

## ADR-10: Visual direction
Framed portraits and faded halftone only on Welcome, Home and Profile mastheads, plus the small Hall of Champions thumbnail in the nav (amended 2026-11-24 to match the boards). The logo bitmap is the only gradient allowed. Nav section letters are permanent IDs (A Home … G Profile; H Library, I Bots, J Learn added later). Night Edition is its own warm palette, not an inversion. One accent, "editor's red", always paired with a glyph or text. Kids mode is a theme and animation layer on the same components. Tokens: `DESIGN.md`.

## ADR-11: Communication between parts
Client to gateway only (REST + SSE). Service to service: REST for questions (timeout, retry, circuit breaker), RabbitMQ events for facts and long jobs (at-least-once, idempotent consumers, outbox pattern). No service calls another through the gateway. Errors are RFC 9457 problem+json. See `ARCHITECTURE.md`.

## ADR-12: Languages per service
**Go + Gin** for `gateway`, `puzzles`, `learn`, `games`, `analysis` (Amine's choice: small fast services, easy concurrency and process pools). **FastAPI** (Python 3.14, uv) for `bots`, `review`, `coach` (python-chess, LLM libraries). **Spring Boot** (Java 25 LTS) only for `auth-profile`, where mature security libraries (OAuth2 client, JWT, session handling) save the most work; it can move to Go later if Amine wants a single backend language besides Python. The Go template uses Gin, pgx + sqlc, golang-migrate, `log/slog`, OpenTelemetry, testcontainers-go and golang-jwt with a cached JWKS. Each language has one template service that the others copy, so the conventions are written once. *Amended 2026-11-25 (Amine's decision):* the Java template was retired once `auth-profile` was built from it, since no other Spring service is planned; `services/auth-profile` is now the reference for Spring conventions. The gateway is a thin custom Go service (about 300 lines on `net/http` reverse proxy); if it ever outgrows that, replace it with Traefik or KrakenD without touching the services.

## ADR-13: Contracts and tests
OpenAPI per service and JSON Schema per event in `contracts/`, written before code. The desktop API client is generated from OpenAPI. CI checks each service against its own contract (Schemathesis) and runs a compose smoke test of all services. Unit tests for logic, integration tests with Testcontainers (Postgres, Redis, RabbitMQ).

## ADR-14: Monorepo, local run, CI
One repo. `make up` runs infra and services in Docker Compose; the desktop app runs natively. CI runs per changed path. Deployment target (EC2 or a simpler platform) is chosen in M16, not before; an AWS emulator only if a design needs one.

## ADR-15: Local-first client
Local actions write to SQLite first; an outbox syncs in the background. Features that need a service show a clear offline state and never block the board. Guests get low server quotas and keep their data on the device.

## ADR-16: Known risks to design around
- **Explorer (M12):** the Lichess explorer API needs an OAuth token on every request, so the explorer comes after sign-in (M11); because `auth-profile` owns the token and `games` may not read its database, the client sends the user's token per request or `games` asks `auth-profile` over its API. Decide at M12. The `games` service also builds its own stats; cache by EPD and fall back gracefully.
- **YouTube (M14):** embeds can fail with Error 153 from the `tauri://` origin. Spike first; record the choice as a new ADR.
- **Kids mode (M15):** no child data leaves the device until consent rules for the target countries are written in `docs/PRIVACY.md`.

## ADR-17: Versions
Use the latest **stable** release of every tool, runtime and library when its milestone starts; for Java use the latest LTS. Pin exact versions in lockfiles, `pom.xml`, `go.mod`, `Cargo.lock` and `pnpm-lock.yaml`, and record the toolchain in `docs/SETUP.md`. Version numbers written elsewhere in the docs are examples, not requirements. Look up current APIs with Context7.

## ADR-18: Everything runs in Docker (amended 2026-11-25, Amine's decision)
Services run **only** in Docker; nobody installs Go, Java or Python on the host to run or test them. The host needs Docker, git and make (plus Node, pnpm and Rust for the desktop app from M0).
- `make up` starts infrastructure and every service (`--profile full`); `make watch` rebuilds a service's container when its files change (Compose watch). `make infra` starts only Postgres, Redis, RabbitMQ and Mailpit, for when you need the backing stores and nothing else.
- Checks run in containers too: each service Dockerfile has a `toolchain` stage, and `make check-svc S=<name>` runs the service's `make check` inside that image with the source mounted and the Docker socket shared, so Testcontainers works. The same image versions are used to build, test and run.
- Config is environment variables only (port, database URL and, for the gateway, `UPSTREAM_<SERVICE>_URL`), so the same image runs in Compose, CI and production.
