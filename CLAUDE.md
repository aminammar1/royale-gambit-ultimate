# Royale Gambit Ultimate

Chess training app that looks like a vintage chess newspaper. Desktop client (Tauri 2 + React/TS + Rust + Stockfish) plus **microservices** (mostly Go and FastAPI, one Spring Boot) behind one gateway, in one monorepo. Solo developer: Amine.

## Read first
- Current work: @docs/ROADMAP.md. Work only on the milestone named in the prompt. Later milestones show the direction; never build ahead.
- Locked decisions: @docs/DECISIONS.md. If a task conflicts with an ADR, stop and ask.
- Read on demand: `docs/ARCHITECTURE.md` (layout, rules between parts) · `docs/SERVICES.md` (only the section of the service you touch, plus the working checklist) · `docs/ENGINE.md` (UCI, review formulas) · `docs/diagrams/` · `docs/PRODUCT.md`.
- **UI source of truth: `design/newsprint/`** (Amine's Claude Design boards; `design/README.md` maps boards to milestones). `docs/DESIGN.md` summarizes the tokens and building rules.

## Plugins and how they fit
- **superpowers:** the product design is already done in these docs. Skip open-ended brainstorming for anything the docs answer; ask only about real gaps. Use writing-plans for the milestone plan, test-driven-development, verification-before-completion, and requesting-code-review before merging.
- **frontend-design:** use it for craft (spacing, hierarchy, states), never to choose a new look. Colors, fonts, layout and motion come from `design/newsprint/` and `docs/DESIGN.md` only.

## Versions
Always the latest stable release of every tool and library when you start (latest LTS for Java). Version numbers written in the docs are examples; ignore them. Pin in lockfiles and record the toolchain in `docs/SETUP.md` (ADR-17).

## Layout
`apps/desktop` (client) · `services/<name>` · `contracts/` (OpenAPI, event schemas, golden fixtures) · `infra/` (compose, db init) · `design/` · `docs/`. The git repository root is this folder (`royale-gambit-ultimate`).

## Commands (created in P1 and M0; keep this list true)
- Everything runs in Docker (ADR-18); the host needs no Go, Java or Python.
- `make up` / `make down` / `make logs S=<service>` / `make watch` (rebuild on change) / `make infra` (backing stores only).
- `make check-svc S=<name>` runs that service's checks inside its Docker `toolchain` stage; templates are `S=go|python`.
- `make check` = everything. `make smoke` = templates in Docker + contract check. `make check-svc S=<name>` = one service. `make check-desktop` = the client.
- Client (in `apps/desktop`): `pnpm tauri:dev`, `pnpm check` (typecheck + lint + vitest + `cargo test` + `cargo clippy -- -D warnings`).
- **Run the check for what you changed before saying a task is done.**

## Hard rules
- **Scope:** only the current milestone. Create a service, table or screen only in the milestone that needs it.
- **Contract first:** edit `contracts/openapi/<service>.yaml` or `contracts/events/*.schema.json` before the code. Breaking changes need a new `/v2/` path.
- **Boundaries:** the client talks only to the gateway. Services never call each other through the gateway. A service never reads another service's database.
- **Events:** at-least-once, idempotent consumers, outbox pattern.
- **Chess rules** are never hand-written: chess.js in `apps/desktop/src/chess/` (no React, no Tauri imports), python-chess in Python, a maintained library in Go. Check against `contracts/fixtures/`.
- **Engine scores** leave the Rust engine manager and the `analysis` service from **White's** point of view, once.
- **Client:** only `src/engine/`, `src/db/` and `src/api/auth` call Tauri `invoke`/`listen`; no shell, fs or process capabilities in the web layer. Refresh tokens live in the OS keychain. Local actions write to SQLite first, then sync.
- **Every service:** `/health/live`, `/health/ready`, `/metrics`, JSON logs with `trace_id`, problem+json errors, config from env vars, no secrets in git.
- **UI:** tokens only, no new hues, no shadows, radius ≤ 2px (Kids Edition 4px), no bouncy motion; red only for mistakes, always with a glyph or text.
- TypeScript strict, no `any` without a comment. Rust: no `unwrap()` outside tests.

## How to work
- New service: copy `services/_templates/<language>`, then follow the checklist in `docs/SERVICES.md`.
- Integration tests use Testcontainers, not mocks of the database or broker.
- UI work: screenshots in **both** editions next to the matching board in `design/newsprint/`.
- After changes to chess logic, review math or engine code, ask the `chess-correctness-reviewer` subagent to review the diff.
- Look up current library APIs with Context7, not memory.
- Commit per logical step with conventional messages. Never push or tag without being asked.

## When compacting
Preserve: the current milestone, files changed, failing checks, and any decision Amine made in this session.
