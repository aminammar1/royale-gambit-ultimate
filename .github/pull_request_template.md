## Why
<!-- The problem or milestone this answers, in two or three sentences. Link the ROADMAP item (P2, M7, …) and any issue. A reviewer should understand the motivation before reading a line of code. -->

## What changed
<!-- The decisions, not a file list. Group by area (contract, service, infra, client). Call out anything a reviewer could not guess from the diff: trade-offs, a ruling against the plan, an ADR touched. -->

-

## Contract and data
<!-- Contract first (CLAUDE.md). Delete the lines that do not apply. -->
- OpenAPI / event schemas: <!-- changed files, breaking or not; breaking needs a /v2/ path -->
- Migrations: <!-- new Flyway / golang-migrate / Alembic files; reversible? safe on a live table? -->
- Config: <!-- new env vars, with defaults, and where they are documented (README, .env.example) -->

## How it was verified
<!-- Evidence, not intentions. Paste the commands and their results. -->
- [ ] `make check-svc S=<service>`: <!-- e.g. 112 tests, 0 failures -->
- [ ] `make smoke`: <!-- contract check result -->
- [ ] `pnpm check` (desktop changes only)
- [ ] Screenshots in Day and Night next to the matching board (UI changes only)
- [ ] `chess-correctness-reviewer` (chess logic, engine or review math only)

## Risk and rollback
<!-- What could break, who would notice, and how to undo it: a revert, a feature flag, a migration that needs a manual step. "Low: new endpoint, nothing calls it yet" is a fine answer when it is true. -->

## Not in this PR
<!-- Known follow-ups, deferred findings, anything a reviewer might expect to see here but should not. -->
