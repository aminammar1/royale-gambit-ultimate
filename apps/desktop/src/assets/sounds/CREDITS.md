# Board sounds

Each sound is two CC0 layers, mixed by `apps/desktop/sound-sources/master.sh` (ffmpeg), where the
recordings are kept unchanged:

- **The click:** real chess pieces on a wooden board, recorded by el_boss for a chess app, pack
  "Chess Puzzle Blitz SFX" (https://freesound.org/people/el_boss/packs/30764/): Piece Placement
  (546119, `elboss-move.ogg`) and Piece Capture (546120, `elboss-capture.ogg`). Creative Commons 0.
- **The body:** a wooden knock with its boom cut away, from Kenney's "Impact Sounds"
  (https://kenney.nl/assets/impact-sounds), `impactGeneric_light_000` … `004`. Creative Commons 0,
  see `sound-sources/KENNEY-LICENSE.txt`.

| Files here | Built from |
| --- | --- |
| move-0 … move-4 | the placement click over each of the five bodies |
| capture-0 … capture-3 | the capture click over four of the bodies |
| check-0 | the capture click over a light body |
| castle-0, promote-0, start-0 | the move sounds |

The mixes were fitted to the energy per band of the sounds chess sites use, and set to their
loudness (a move -32.5 LUFS, a capture and check -30.5). Nothing of theirs is included: lichess's
standard sounds have no free licence and chess.com's are proprietary.
