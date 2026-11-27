# Board sounds

Built from three recordings made on a wooden board by el_boss for a chess app, pack "Chess
Puzzle Blitz SFX" (https://freesound.org/people/el_boss/packs/30764/). Licence: Creative
Commons 0 (public domain). The untouched recordings are in `apps/desktop/sound-sources/`.

| Source      | Freesound                                           | Title           |
| ----------- | --------------------------------------------------- | --------------- |
| move.ogg    | https://freesound.org/people/el_boss/sounds/546119/ | Piece Placement |
| capture.ogg | https://freesound.org/people/el_boss/sounds/546120/ | Piece Capture   |
| start.ogg   | https://freesound.org/people/el_boss/sounds/546121/ | Board Start     |

`sound-sources/master.sh` (ffmpeg) makes the files here: each knock gets a warmer wooden body
(EQ and a short synthesised low thump), levels are matched, and check, castle (king then rook)
and promote are built from the move knock.

Not used: lichess's standard sounds (lila's COPYING.md gives them no free licence) and
chess.com's (proprietary).
