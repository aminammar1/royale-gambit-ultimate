# Analysis page on the server engine (pulled forward from M1 and M3)

**Goal:** Amine can test the `analysis` service from the app: the Analysis page from `design/newsprint/analysis.png`, with a playable board, powered by the server engine through the gateway. M3 later adds the local Stockfish as the default engine (ADR-05, amended 2026-11-26).

**Branch:** `feat/analysis-page`, stacked on `feat/m4-analysis` (PR #6).

## Steps
1. **ADR-05 amendment and ROADMAP note.** Until M3, the Analysis page may use the server engine; M3 makes the local sidecar the default and keeps the server one as the fallback. ROADMAP records what is pulled forward from M1 (the `src/chess` game model over chess.js, the themed board) and from M3 (the page UI).
2. **Dependencies:** `chess.js` (rules, the only rules engine in the client, ADR-03) and `react-chessboard` v5 (ADR-04), latest, pinned in the lockfile.
3. **`src/chess/`** (no React, no Tauri):
   - a game model (start FEN + moves, play, go to a ply, load FEN or PGN, PGN out);
   - UCI→SAN for engine lines;
   - score formatting (`+1.24`, `−0.80`, `#5`, `#−3`) and win% for the bar.
   - Vitest: castling, en passant, promotion, the shared PGN fixtures, PV conversion.
4. **`src/api/analysis.ts`:**
   - types generated from `contracts/openapi/analysis.yaml`;
   - a streaming POST client (SSE over fetch, since `EventSource` cannot POST or send a token), cancelled by `AbortSignal`;
   - token: the session's, or, for a local guest, a guest access token from `POST /v1/auth/guest`, kept in memory only (the refresh token is dropped, never stored);
   - one renewal on 401.
   - Vitest: the SSE parser, the token fallback, problem mapping.
5. **UI:**
   - `features/board/ThemedBoard.tsx`: the Newsprint preset, last move highlight, check, engine arrows in `--ink` 70% and `--ink-2`.
   - `features/analysis/AnalysisPage.tsx`, with masthead actions: engine Off / Thinking / Done, Flip, Copy PGN.
   - Columns: the moves score sheet with "set up a position" (FEN or PGN) | the eval bar, board and navigation | the best move box and top three lines in SAN.
   - Offline and busy states in words.
   - Sections: Analyze is built (no `opensIn`).
6. **Checks:**
   - `pnpm check`;
   - `make up`, then the app in a browser against the real gateway, with screenshots in Day and Night next to `analysis.png`;
   - `chess-correctness-reviewer` on the chess code;
   - the `code-review` skill.
7. **PR** from the template, stacked on #6.

## Not in this page
- The local engine and infinite analysis (M3).
- The Explorer tab (M12) and "Train on puzzles from these mistakes" (not scheduled).
- Variations: playing a move mid-game replaces what came after (M3 adds one level of variations).
- Glyphs on moves (M5).
