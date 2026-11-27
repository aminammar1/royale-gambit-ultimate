# Openings

The lichess-org/chess-openings table (https://github.com/lichess-org/chess-openings), pinned at the
commit in `SOURCE_COMMIT`. Licence: CC0 ("as a collection of facts, this data set is in the public
domain"). One copy names openings everywhere: the desktop app (`apps/desktop/scripts/build-openings.mjs`
builds `src/chess/openings.json` from it) and the games service (a copy embedded in
`services/games/internal/pgn/openings/`, checked equal to this one by its tests).

**The rule, the same on both sides:** a line is played by the side's chess library and keyed by its
position: the FEN's board, side to move, castling and en passant square, the last only when an en
passant capture is legal (chess.js writes it so; the Go side clears it otherwise). A game's opening
is the deepest keyed position it reaches, from whatever position it starts.

`golden.json`: lines and the name both sides must give them; both test suites read it.

To update: change `SOURCE_COMMIT`, download `a.tsv` to `e.tsv` from that commit, copy them to the
games service, rebuild the desktop table (`node scripts/build-openings.mjs`), and run both suites.
