# Golden fixtures

Shared test data for every chess implementation (chess.js, python-chess, the Go library). Verified with python-chess when added.

- `perft.json`: legal-move tree sizes per depth for six standard positions.
- `pgn/opera-game.pgn`: Morphy's Opera Game. Ends in checkmate; final FEN `1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17`.
- `pgn/rules-tour.pgn`: en passant (`exd6`), `O-O`, underpromotion (`cxd8=N`), `O-O-O`. Final FEN `r1br2k1/5pp1/p1nb1n1p/4p3/2p5/2NPBN2/PPPQ1PPP/2KR3R b - - 1 12`.
- `uci/info-lines.json`: UCI `info` and `bestmove` parsing, with scores turned to White's view. Used by the `analysis` service (M4) and the desktop engine manager (M3).
- `review/`: golden review numbers, added in M5.
