# Product

**Royal Gambit Ultimate** is a desktop chess training app for Windows, macOS and Linux. Players use it to play over-the-board games locally, analyze positions with an engine, review their games for mistakes, and train with puzzles. The board, local games and local analysis work offline; features that need a service (review, puzzles, bots, library) use the backend.

**Feel:** like a tournament bulletin from the golden age of chess printed on newsprint. Black ink, warm paper, serif headlines, score-sheet notation, one editor's-red pen mark. Serious, calm and cultured, the opposite of the bright, gamified look of other chess platforms.

> A quiet, handsome study of chess history that you can also train in.

## Users
Beginners, amateurs and intermediate players who want to improve, review their own games and prepare for tournaments.

## v1.0 scope (the first release)
Services needed: gateway, auth-profile, analysis, review, puzzles.
1. **Local game:** two players on one PC. Optional clocks, optional auto-flip after each move, score-sheet move list, PGN copy/save.
2. **Analysis board:** set up or paste any position or PGN; evaluation bar, best move, top 3 engine lines; explore variations.
3. **Game review:** analyze a finished game; mark inaccuracies, mistakes and blunders; accuracy per side; list of key moments.
4. **Puzzles:** a bundled starter set that works offline, and the full set from the `puzzles` service; short prompt, hints, progress record; a daily puzzle shown like a newspaper chess column.
5. **Board customization:** square-color presets (Newsprint, Tournament Hall, Classic Wood, High Contrast), piece sets, toggles for coordinates, highlights, legal-move hints, arrows and sounds; save and switch themes; live preview.
6. **Player profile (local):** first-run "federation registration" (country + flag, username, player card); profile page with puzzle rating progress and a results table of saved games.
7. **Light "Day Edition" and dark "Night Edition" themes.**

## Later versions
The full plan is in `ROADMAP.md`: Platform (gateway, auth), v1.0 Train, v1.1 Library, v1.2 Bots, v1.3 Connected (Lichess/Chess.com sign-in, opening explorer), v1.4 Lessons (Learn, YouTube), v1.5 Kids mode, v2.0 Production, v2.1 AI coach, v3.0 Mobile. The backend is microservices from the start (see `ARCHITECTURE.md`).

## Quality bar
- Fast cold start; 60 fps piece drag and animation; engine output never blocks the UI.
- Rules correctness is non-negotiable: castling, en passant, promotion, check/mate/stalemate, threefold, 50-move rule and insufficient material.
- Readable: WCAG AA contrast in both editions; color is never the only signal.
- Motion is calm and precise: pieces glide, panels fade like a page turning, nothing bounces.
