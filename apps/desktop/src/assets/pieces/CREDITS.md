# Piece sets

Bundled because their licences allow it with credit only (checked against lichess-org/lila
`COPYING.md`, 2026-11-26). The SVG sets are as Lichess serves them (`public/piece/<set>/<colour><piece>.svg`), unchanged;
the 3D Staunton renders come from their author's repository (not lila's copy, whose other
Staunton folders are not free).

| Set | Author | Licence |
| --- | --- | --- |
| chessnut | Alexis Luengas (https://github.com/LexLuengas/chessnut-pieces) | Apache License 2.0 |
| fantasy, spatial, celtic | Maurizio Monge (https://github.com/maurimo/chess-art) | MIT |
| rhosgfx | RhosGFX (https://rhosgfx.itch.io/) | CC0 1.0 |
| staunton-wood, staunton-basic | James Clarke, "Opensource 3D Staunton Chess Pieces" (https://github.com/clarkerubber/Staunton-Pieces), `Renders/<Wood|Basic>/Scaled/180`, renamed to `wK.png`... and cropped to square by `scripts/fit_3d_pieces.py` | MIT, Copyright (c) 2014 clarkerubber |

The default "Classic" set is react-chessboard's own (MIT). Sets under GPL, share-alike or
non-commercial licences (cburnett, merida, staunty, california...) are not bundled.
