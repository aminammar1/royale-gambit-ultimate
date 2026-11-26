# Welcome and the local player card (M7 first run, with the M1 SQLite store pulled forward)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** The first run of the app opens the Welcome page from `design/newsprint/welcome.png`: the player picks a country and a username, sees the player card fill in, and registers it on this machine (step 1), then may link an email or Lichess (step 2), or skips. "Continue as guest" skips the card. Afterwards the nav's player slot shows the card (country code, username, "1500 · provisional"). Welcome never shows again on this machine.

**Architecture:** The card lives in local SQLite owned by the Rust core (`rusqlite`, bundled; ADR-05 and ARCHITECTURE § Local data), in the app data folder, migrated with `rusqlite_migration`. Rust commands `profile_get`, `profile_register`, `profile_continue_as_guest` are the only door; the web layer reaches them through `src/db/` (allowed to `invoke` by CLAUDE.md). Countries are the contract's ISO 3166-1 alpha-2 set (`i18n-iso-countries` for codes and alpha-3, `Intl.DisplayNames` for English names), so a card can sync to `PUT /v1/profile` later without mapping. Step 2 reuses the Settings credential cards.

**Out of scope:** syncing the card to `auth-profile` (needs the outbox; next step), the username uniqueness check against the server (comes with sync), flag artwork and the masthead halftone portraits (no assets yet; framed placeholders as on the board).

## Tasks
1. **Rust `db`**: `Database` (open at a path, migrations V1: `profile` one row with `card_no`, `username`, `country`, `registered_at`, `updated_at`; `app_state` key/value), `Profiles` with `status() -> Welcome { New | Guest | Registered(Card) }`, `register(username, country)` (validates the contract's username pattern and a two-letter upper-case code, assigns a random six-digit card number, refuses a second registration), `continue_as_guest()`. Tests on an in-memory database. Commands wired in `lib.rs`; the file in `app_data_dir()/royale-gambit.sqlite3`.
2. **TS `src/db/profile.ts`**: invoke wrappers and a zustand store (`loading | new | guest | registered`); `src/features/welcome/countries.ts` (sorted list, search by name or code, alpha-3 display). Vitest for search and validation copy.
3. **Welcome page** per the board: masthead "Federation registration · Step 1 of 2", three columns (federation list with search, name with rules and the register button and its reason when disabled, live player card with the checklist), "Continue as guest". Step 2: "Keep your card" with the Lichess and Email credential cards and "Skip for now". First-run redirect from the shell; PlayerSlot shows the card.
4. **End to end** in the real window with Amine clicking: first run → register → step 2 → link email → restart (no Welcome, card and session kept). Screenshots in Day and Night next to `welcome.png` and `settings.png`. `pnpm check` green. ROADMAP updated for what was pulled forward.
