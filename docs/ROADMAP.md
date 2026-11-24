# Roadmap: from first commit to the finished product

The whole product, in order, built as **vertical slices**: each milestone delivers a client feature together with the service it needs. Work **one milestone at a time**. A milestone is done only when its acceptance checks pass and the evidence (test output, screenshots, compose run) is shown. Update the Status column when merged.

**Rules**
- Build only the current milestone. Later ones are listed so you know where the app is going. Never create a service, table or screen "for later".
- A service is created in the milestone that first needs it, from its language template, with its contract written first (`contracts/openapi/<name>.yaml`).
- Every milestone ends with `make check` green and `make up` still starting everything.

| Version | Theme | Milestones | Status |
| --- | --- | --- | --- |
| **Platform** | Monorepo, contracts, gateway, auth | P1–P2 | ☐ |
| **v1.0** | Train: board, local game, analysis, review, puzzles, profile | M0–M7 | ☐ |
| **v1.1** | Library: import and search games | M8–M9 | ☐ |
| **v1.2** | Bots | M10 | ☐ |
| **v1.3** | Connected: Lichess and Chess.com sign-in, opening explorer | M11–M12 | ☐ |
| **v1.4** | Lessons: Learn and YouTube mode | M13–M14 | ☐ |
| **v1.5** | Kids mode | M15 | ☐ |
| **v2.0** | Production: deploy, observability, backups, auto-update | M16 | ☐ |
| **v2.1** | AI coach | M17 | ☐ |
| **v3.0** | Mobile | M18 | ☐ |

Milestone status: P1 ☐ · P2 ☐ · M0 ☐ · M1 ☐ · M2 ☐ · M3 ☐ · M4 ☐ · M5 ☐ · M6 ☐ · M7 ☐

---

# Platform

## P1: Monorepo, contracts, templates, local stack
- Layout from `ARCHITECTURE.md`. Root `Makefile`: `up`, `down`, `logs`, `infra`, `infra-down`, `dev S=<name>`, `check`, `check-svc S=`, `check-desktop`. `docs/SETUP.md` lists the toolchain.
- `infra/compose`: PostgreSQL (one database per service via init scripts), Redis, RabbitMQ with the `rg.events` exchange, MailHog, all published on localhost ports so natively running services can reach them (ADR-18). Profiles: `infra` (those four only), `full` (infra + every service container), and optional `obs` with OpenTelemetry collector, Jaeger, Prometheus, Grafana.
- `contracts/`: the event envelope schema, an example contract for each template, the first fixtures (perft FENs, two PGNs). A real service contract is written in the milestone that creates the service.
- Three **template services**, each with health endpoints, JSON logs, trace propagation, problem+json errors, Dockerfile, migrations, one real test and a README: Go + Gin (used for `gateway` in P2, then `analysis`, `puzzles`, `games`, `learn`), FastAPI (`review` in M5), Spring Boot (`auth-profile` in P2). Templates live in `services/_templates/` and are copied, not shared as a library.
- GitHub Actions: change detection per path, per-service check, image build, compose smoke test.
**Accept:** `make infra` starts only the four infrastructure containers and prints healthy; `make up` starts everything; a template runs both in a container and natively with `make dev` using only environment variables; `make check` runs every template's tests; CI is green on a no-op change; a change under `services/x` only runs x's job.

## P2: Gateway and auth-profile
- `gateway` (Go, from the Go template, no database): JWT validation with cached JWKS, rate limit (Redis), CORS, request id, routing table per service, 429 and 401 problem+json.
- `auth-profile` (Spring Boot, from its template): guest token, email code sign-in (code expiry, attempt limits, MailHog in dev), RS256 JWT with 15 min access and rotating refresh tokens, JWKS endpoint, profile create/read/update (username, country, settings), events `user.registered` and `profile.updated`.
**Accept:** integration tests for expiry, replay, wrong code, refresh rotation and reuse detection; a request with a bad token never reaches a service; the full email sign-in works against MailHog through the gateway.

---

# v1.0: Train

## M0: Desktop scaffold, tokens, shell
- `apps/desktop`: Tauri 2 + Vite + React + TS strict + Tailwind v4 + shadcn/ui (radius 0) + Motion + Zustand + Vitest + ESLint + Prettier; Rust fmt and clippy.
- Scripts: `dev`, `tauri:dev`, `build`, `tauri:build`, `test`, `lint`, `typecheck`, `check` (typecheck + lint + test + `cargo test` + `cargo clippy -- -D warnings`).
- `src/styles/tokens.css` implements `DESIGN.md` for both editions; fonts bundled via @fontsource.
- App shell: masthead strip, left nav with the permanent letters from `DESIGN.md` (A Home, B Play, C Analyze, D Review, E Puzzles, F Settings, G Profile; H Library, I Bots, J Learn appear with their milestones), the `Logo`, and the Hall of Champions widget (halftone thumbnails pre-processed offline from `assets/wc-pictures/`; confirm the photo licences before release). The player slot shows `Guest · Unregistered` until M7.
- Generated API client setup (`openapi-typescript`) pointing at the gateway.
**Accept:** `pnpm check` passes; `pnpm tauri:dev` opens the window; screenshots of the shell in Day and Night; CLAUDE.md commands match reality.

## M1: Board and local game (offline)
- `src/chess/`: game model over chess.js (make/undo, promotion choice, history, result and reason, PGN import/export with headers).
- Themed board: drag and click-to-move, legal-move hints, last-move and check highlights, coordinates, flip.
- Local game screen: score-sheet move list, optional clocks (5+0, 10+5, 15+10, custom), auto-flip, resign/draw, take back a move, new game, copy PGN, save to local SQLite.
**Accept:** unit tests for castling (both sides, through check rejected), en passant, all promotions, stalemate, threefold, 50-move rule, insufficient material, PGN round-trip; scholar's-mate and stalemate playthroughs with screenshots.

## M2: Board customization and editions
- Settings: four board presets, piece-set picker (placeholder + slot for the print set), toggles (coordinates, highlights, legal hints, arrows, sounds, auto-flip default), live preview, saved themes in SQLite, Day/Night switch following the system, soft sounds with a global mute.
**Accept:** instant theme changes with no flash; persists across restarts; contrast checks pass in both editions; screenshot grid of 4 presets x 2 editions.

## M3: Local engine and analysis board
- Rust `engine/`: spawn Stockfish sidecar, UCI handshake and options (Threads = cores-1, Hash 256 MB, MultiPV 3), serialized queue, `info` parsing, White-normalized scores, throttled events, clean shutdown, restart on death. TS `engine/` client.
- Analysis page: paste FEN/PGN or set up a position; eval bar; best-move box; top 3 lines as a printed table; best-move arrow; variations (mainline + one level); engine on/off, depth and infinite.
**Accept:** Rust tests for UCI parsing (cp, mate, bounds, multipv, wdl) and perspective; integration test starts the real binary and gets `bestmove`; UI stays at 60 fps during infinite analysis; no zombie processes after quit.

## M4: `analysis` service
- Go service from the template (the first Go service after the gateway): Stockfish process pool, priority queue (live over batch), `POST /v1/analysis/positions`, `POST /v1/analysis/batch`, SSE stream, Redis cache keyed by EPD + depth + multipv + engine version, White-normalized scores, pool restart on crash.
- Stockfish binary in the image, version pinned and checked at start.
**Accept:** the same UCI parser fixtures as M3 pass; cache hit under 20 ms p95; killing a Stockfish process mid-request recovers; a load test of 50 concurrent batches does not starve a live request; no zombie processes.

## M5: `review` service and Review page
- FastAPI service from the template: `POST /v1/reviews` (PGN only; a game id is accepted from M8) returns 202; worker consumes `review.requested`, calls `analysis` per batch, computes win%, classification, accuracy, key moments (numbers, glyphs and the best move; no written commentary, that belongs to the coach in M17); SSE progress; cancel; `review.completed`.
- Review page: board, eval graph (ink line, no fills), annotated score sheet with glyphs and red marks, key-moments list with "show best" arrows, progress and cancel.
**Accept:** golden-file tests in `contracts/fixtures/review/` match hand-computed numbers; the blunder fixture flags the right ply; cancel leaves no running work; a job survives a worker restart; client shows a clear state when offline.

## M6: `puzzles` service and Puzzles page
- Go service from the template; `scripts/build-puzzles` imports a balanced Lichess subset (I download `lichess_db_puzzle.csv.zst` into `data/raw/`); endpoints next, attempt, daily; Glicko-lite rating; event `puzzle.attempted`.
- A small bundled starter pack (generated by the same importer) so puzzles also work offline; the full set comes from the service. Puzzle player: opponent's first move auto-plays, solve, retry/solution/hint, alternative mates accepted, rating and history, daily puzzle "chess column" component.
**Accept:** validator tests including alternative mates; rating fixtures; importer reproducible; daily puzzle deterministic per date; screenshots of solved, failed and hint states.

## M7: Sign-in, Home, Profile, packaging → v1.0
- First run: country with flag, username, player card badge (local profile); then optional email sign-in against `auth-profile`; guest stays available. Token in the OS keychain. Profile sync through the outbox.
- Home front page (masthead, quick actions, daily puzzle column, recent games, halftone on mastheads only). Profile page (card, rating chart, results table). The card rating is the puzzle rating from `puzzles`. About screen.
- Installers for Windows, macOS, Linux via CI; signing steps in `docs/RELEASE.md`.
**Accept:** clean install on all three OSes → first run → play → review → puzzle; app works as a guest with the backend down (local features), with clear offline states for the rest; v1.0 tag only when Amine says so.

---

# Not scheduled
Shown on the boards but in no milestone yet: "Train on puzzles from these mistakes" (Review), a Language setting, "Set up a position" presets on the local game. Add them to a milestone before building.

---

# v1.1: Library

## M8: `games` service and import
- Go service from the template: save and search games, import jobs by username from Chess.com (monthly archives, User-Agent with contact info) and Lichess (NDJSON export), dedupe by game hash, ECO opening tagging, `import.requested`/`game.imported`/`game.saved`, consumes `review.completed`.
- PGN file import in the client.
**Accept:** import 100+ games for a real username on both sites; re-import adds nothing; rate-limit and malformed-PGN tests; progress over SSE.

## M9: Library page ("card catalogue")
- Client sync of local games through the outbox; search by player, opening, result, date, source; filters and sort; virtualized list; "review all unreviewed"; per-player stats (openings, win/draw/loss by color, common mistakes).
**Accept:** a 10k-game fixture searches in under 200 ms server-side; offline shows local games only; screenshots in both editions.

---

# v1.2: Bots

## M10: `bots` service and Bots page
- FastAPI service: roster (about 600 to 2800 Elo, names, bios, styles), opening books, strength policy over `analysis`, human-like delay. Bots page and game screen with clocks, takeback option, resign, hints toggle; saved with `source = bot`; one click to Review.
**Accept:** strength ordering test over N games; every returned move is legal; UI at 60 fps while the bot thinks; clear offline state.

---

# v1.3: Connected

## M11: Lichess and Chess.com sign-in
- `auth-profile` OAuth module: Lichess PKCE (system browser, loopback redirect on a random port, unregistered public client), Chess.com OAuth once the application is approved. Linking attaches to the existing account; one account can link several identities; unlink works. Spike Lichess first (prompt 14).
**Accept:** sign in, link, unlink, expired-token handling; tokens never in logs or the web layer; the app still works as guest.

## M12: Opening explorer
- `games` explorer stats (Lichess database + user games, key = EPD, Redis cache). Explorer panel with three sections: engine best move, top 3 lines (local engine), most played moves (printed opening table with White/draw/Black bars); click a move to play it.
**Accept:** panel works at the start and a mid-game position; p95 under 300 ms on a load test; offline shows cached data with a clear label; never blocks the board or engine.

---

# v1.4: Lessons

## M13: `learn` service and Learn
- Go service from the template: lessons by level (Beginner, Improver, Club), steps, progress, `lesson.completed`. Learn UI reuses the puzzle player and score sheet.
**Accept:** at least 3 levels with 10+ lessons each; progress syncs across two installs; no new UI primitives invented.

## M14: YouTube lesson mode
- **Spike first** (Error 153 from `tauri://`): make an embed play on Windows, macOS and Linux; record the approach as an ADR.
- "Printed lecture" page: video as the main illustration, board beside it, notes column; lesson files (`{ t, fen, note }`) stored in `learn`; paste a YouTube URL to start.
**Accept:** works on all three OSes; timestamp jumps move the board; exploring variations does not stop the video.

---

# v1.5: Kids mode

## M15: Kids mode
- A theme and animation layer over the same components (profile flag): larger controls, softer palette tokens, short playful animations, simple language, always-on hints. Kids puzzles with guided hints in `puzzles`. Stamps on the player card, no timers.
- `docs/PRIVACY.md` written first: no child data leaves the device until it covers the target countries; kids mode makes no network calls except fetching public puzzle content.
**Accept:** every v1.0 screen renders in kids mode without layout breakage; parent confirmation to switch modes; an automated test proves no personal data is sent in kids mode.

---

# v2.0: Production

## M16: Deploy and operate
- Pick the deployment target (EC2 or a simpler platform) in an ADR. Images to a registry; staging and production; secrets management; TLS; managed Postgres with backups and a tested restore; observability (traces, metrics, dashboards, alerts); auto-update channel for the desktop app; opt-in crash reporting; rollback documented.
**Accept:** a push to main deploys to staging; production deploy needs approval; a rollback and a database restore each tested once; alerts fire on a forced failure.

---

# v2.1: AI coach

## M17: `coach` service and Coach's column
- FastAPI service: weakness stats from `review.completed` and `puzzle.attempted`, weekly plan, explanations by an LLM that must cite a game and move for every claim; cost cap per user. UI: "Coach's column" on Home and a Coach page.
**Accept:** advice for a fixture player cites real games and moves; no advice without data; weekly cost per user measured and capped.

---

# v3.0: Mobile

## M18: Mobile
- Tauri 2 mobile targets (iOS, Android) from the same codebase; responsive board-first layouts, touch, safe areas. Local Stockfish only if it performs; otherwise the `analysis` service is the engine on mobile (this is why that service exists).
**Accept:** play, puzzles, review and library work on a real phone; board interaction at 60 fps.
