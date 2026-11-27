# Design system: "Newsprint"

Chess history printed on newspaper. Written summary of the Claude Design boards in `design/newsprint/` (PNG files, mapped to milestones in `design/README.md`). The boards win if anything here disagrees. These tokens are the only source of colors, type and spacing.

## Color tokens
| Token | Day Edition | Night Edition | Use |
| --- | --- | --- | --- |
| `--paper` | `#F3EFE6` | `#121212` | app background |
| `--paper-2` | `#E9E3D6` | `#1F1F1F` | panels, sunken areas |
| `--ink` | `#1B1A17` | `#EDEDED` | primary text, icons |
| `--ink-2` | `#57534A` | `#ADADAD` | secondary text, captions |
| `--rule` | `#BDB5A6` | `#474747` | 1px column rules, borders |
| `--accent` | `#9E2A2B` | `#EF4444` | the editor's red: mistakes, blunders, critical marks |
| `--focus` | `= --ink` | `= --ink` | 2px focus outline, offset 2px. Ink, not red: a red ring on a field read as an error (changed 2026-11-25) |

Night (Amine, 2026-11-25, after trying a warm sepia night that tired the eyes): the neutral dark of chess sites players already use, modelled on endgame.ai. True greys with no warm cast; near-white text (16:1), secondary text 8.4:1, rules as white at about a fifth (2.0:1), the red of their error colour. The board keeps the Day colours in both editions. Portraits print at 90% brightness at night.

No other hues in UI chrome; country flags (flag-icons) are content, always printed beside the country's name. Engine arrows: see Board themes below. Mistake arrows use `--accent`.

### Board themes (Board & pieces, `board-customization.png`)
Chosen in Settings → Board & pieces, saved on this machine, the same in both editions, applied to every board at once (`<html data-board>`; the values live in `tokens.css`).
| Theme | Light | Dark | Notes |
| --- | --- | --- | --- |
| Newspaper (default) | `#E9E1CC` | `#1B1A17` | black and white, the printed look: paper squares with a fine horizontal hatch, ink-black squares. Pieces carry a 1px paper outline so a black piece reads on a black square (Amine, 2026-11-26: without it the black pieces vanished) |
| Newsprint | `#E8E2D4` | `#9C9483` | the same hatch on a softer grey |
| Tournament Hall | `#E4DDC6` | `#7E8566` | muted olive, flat |
| Classic Wood | `#E2C9A1` | `#A77B52` | warm maple/walnut, flat |
| High Contrast | `#FFFFFF` | `#4F4F4F` | accessibility, flat |
| Green | `#EEEED2` | `#769656` | the club board, flat |
| Blue Ocean | `#DEE6EC` | `#6F8FAB` | flat |
| Walnut | `#DDB88C` | `#7A5136` | dark wood, flat |
| Champion | `#F4EBD0` | `#B0894C` | ivory and gold, flat |
| Freestyle | `#E9E6DF` | `#3E5C76` | slate, flat |
| Arcade | `#B9F3E4` | `#9A7FD1` | mint and lavender, flat |
| Sakura | `#FDE8EC` | `#E5A3B4` | soft pinks, flat |

The last seven are Amine's additions (2026-11-26), original palettes in the spirit of chess sites' boards; no brand art. **Piece sets:** Classic (react-chessboard's, outlined on Newspaper), the freely licensed Chessnut, Fantasy, Spatial, Celtic and Pixel (RhosGFX), and 3D Wood and 3D Classic (James Clarke's ray-traced Staunton renders, MIT, a raised view standing on each square), credited in `apps/desktop/src/assets/pieces/CREDITS.md`; GPL, share-alike and non-commercial sets are never bundled. Engine arrows are drawn by the app's own layer over the board. **Sounds:** each is two CC0 layers mixed by `apps/desktop/sound-sources/master.sh` (Amine, 2026-11-27: realistic, soft, never loud): the click of real chess pieces on a wooden board (el_boss) over the body of a wooden knock with its boom cut away (Kenney's Impact Sounds), credited in `assets/sounds/CREDITS.md`. The mixes were fitted to the energy per band of the sounds chess sites use and set to their loudness: a move -32.5 LUFS, short (0.15 s) and woody (about 1.1 kHz), a capture and check -30.5, a brighter clack. A move is one of five takes and a capture one of four, picked at random, with ±1.5% pitch and ±5% loudness on top, so no two sound alike; castling is two knocks (king, then rook 110 ms later), a promotion a knock and a small higher tap, a new board a run of knocks. All are decoded before the first move and sound when the piece lands (a click or a step through the game waits for the glide; a drop sounds at once); a Sounds switch in Board & pieces, on by default. **Engine depth:** 12, 16, 20 (default), 24 or 28, chosen in the engine column and saved.

Each theme says what prints on its squares: marks (last move 18%, the picked piece 30%, legal-move dots and capture rings 38%) in ink on light squares and in the theme's light colour on dark ones; coordinates likewise; engine arrows in the theme's arrow colour (best line 85%, others 40%). Check: `--accent` at 45% radial. Display switches: coordinates, last-move highlight, legal-move hints, arrows. Only the side to move can pick up a piece. Amine's print piece set joins the list when it lands; sounds and saved themes come with the rest of M2. **Highlights** (Amine, 2026-11-27, chess-site style; an exception he chose to the no-new-hues rule, for the board only): the picked piece (72%) and the last move (50%) fill with the **Highlight** colour, by default the theme's own `--board-highlight` (ochre on Newspaper, yellow on Green and the woods, teal on Arcade, sea-green on Blue Ocean…), or one the player picks: Yellow, Green, Blue, Orange, Red, or Ink (the theme's mark at 30% and 18%, the print look). Squares marked with the right button fill with the **Marked squares** colour (80%), Red by default; they are the player's notes, not mistakes. **Material:** the wood themes (Classic Wood, Walnut, Champion) lay a wood grain over the squares (`--board-texture`, an SVG noise stretched along the grain, multiplied), under the pieces; print themes stay flat.

## Typography (all OFL, bundled locally via @fontsource; the app is offline)
| Role | Font | Notes |
| --- | --- | --- |
| Nameplate / masthead | **Playfair Display** 800–900 | app title, page mastheads only |
| Headlines | **Playfair Display** 600–700 | section heads, card titles |
| Body | **Source Serif 4** 400/600 | prose, puzzle prompts, descriptions |
| UI labels | **IBM Plex Sans** 500, small caps or uppercase + 0.06em tracking | buttons, tabs, kickers |
| Moves, evals, clocks | **IBM Plex Mono** with `font-variant-numeric: tabular-nums` | score sheet, engine lines, eval numbers |

Type scale (rem): 0.75 · 0.875 · 1 · 1.125 · 1.375 · 1.75 · 2.25 · 3 (masthead).

## Shape, space, texture
- Radius **0–2px**. Panels are boxes with 1px `--rule` borders and no drop shadows. Use a double rule (`3px double`) under mastheads.
- 4px spacing grid. Columns are separated by vertical rules, like a newspaper page.
- **Logo:** `design/newsprint/logo.jpg` is a fixed bitmap (chrome queen, drawn gradient). It is the one allowed exception to the no-gradient, no-shadow rule and is never recreated in CSS. The app's copy, `apps/desktop/src/assets/logo.png`, is cut from Amine's `assets/logo/logo-update.png` (drawn on black) by `scripts/logo_cutout.py`: the black becomes transparent and the glow white, so it reads on Day paper and on Night grey.
- Paper grain: a static, subtle SVG-noise PNG at ≤ 6% opacity on `--paper`. Never put it over text panels.
- Halftone portraits: **pre-processed offline** into halftone PNG/WebP assets, not live CSS filters. Opacity 8–15% (Day) and 6–10% (Night). Used only on Welcome, Home and Profile mastheads, plus the small framed thumbnail in the nav's **Hall of Champions** widget (shown on every page, full contrast, 64px, cycles with the two arrow buttons). That thumbnail is a grey photo crop, not dots: at 64px a halftone loses the face. A champion without a photo shows initials. Photo credits: `assets/wc-pictures/CREDITS.md`. No other place gets a portrait.

## Motion
- Durations 120–240 ms, `ease-out` or `cubic-bezier(0.2, 0, 0, 1)`. No springs with overshoot, no bounce, no scale-pop.
- Pieces glide on `cubic-bezier(0.25, 0.8, 0.25, 1)`, fast away and a soft landing, at the **Piece speed** chosen in Board & pieces: Fast 120 ms (the default, as on chess sites; Amine, 2026-11-27), Normal 200, Slow 300, Off. The board is the app's own layer (`features/board/ThemedBoard.tsx`), not a library's: each piece keeps its element from position to position, so a move is one CSS transition with no jump at the end. Pressing a piece picks it at once (dots appear); dragging, it follows the pointer frame by frame, 6% larger, its square's piece at 30%, and the square beneath outlined 4px in the theme's mark; letting go lands it at once. Clicking a dot glides it; a taken piece fades as the taker arrives. With a piece picked, the dot under the pointer tints 24%. Rows nearer the player stand in front (3D sets). The right button draws, as on chess sites (read from mouse events and watched on the window, because WebKit, the Tauri window, may send no pointer events or no release for the right button): drag for an arrow (a knight's bends in an L, the long leg first), click for a marked square; drawing one again removes it, and a left press or a new position wipes them. Arrows are ink with a casing of the theme's light colour, as printed on a book's diagrams, so they never look like the engine's. Right-click also drops the pick. Turning the board is instant. Panels fade and lift 4px, like a page settling. Respect `prefers-reduced-motion`.

## Notation & marking
- Move list in score-sheet form: `12. Nf3  Nc6`, numbered rows, tabular mono.
- Quality glyphs: `!!` `!` `!?` `?!` `?` `??`. These six are the whole set for v1.0; the Brilliant / Great / Best / Excellent icons in `assets/reviews/` are not used until a milestone defines the rules for them in `ENGINE.md`. Mistakes and blunders use the glyph **plus** `--accent`, never color alone.
- Eval shown as `+1.24` / `−0.80` / `#5` / `#−3` (true minus sign, U+2212).

## Screen grammar
Every screen is a "page": masthead strip (page title, edition/date line, small actions) → body in 2–3 columns divided by rules. The board column is always the widest, and the board is the hero.

## Navigation (from the design)
- Left nav: an icon (lucide, 20px, stroke 1.5) and the section name: Home (newspaper), Play (pawn), Analyze (scan), Review (eval curve), Puzzles (knight), Settings (sliders), Profile (ID card). Later sections sit between Puzzles and Settings: Library (M9), Bots (M10), Learn (M13). The board's section letters were dropped (2026-11-25): players read them as noise. Current page: `--paper-2` fill, ink rules above and below, `aria-current="page"`.
- Under 1280px wide (a tiled window is often ~950px) the nav narrows to an 80px rail: the icon with the name set small beneath, the logo alone, the Hall of Champions as one 48px portrait that steps on a click, and the player slot's badge. The window's minimum is 760×600.

## Start-up and sign-in (beyond the boards)
- **Start screen** (`app/StartScreen.tsx`), every launch: first a newsreel intro, the eighteen champions in hard cuts (125 ms each, the year set large beneath), skipped by any key or click. Then the title page, as a film's or a game's title screen in print (Amine, 2026-11-27, after a card, an open page, a band and a left column): a wall of champion portraits, four rows tilted -7° and drifting sideways (55%, 40% at night, still under reduced motion), fills the window; the paper washes in from the middle and along the top and bottom (gradients of `--paper`, no box, no blur), and centred there stand the logo, an edition line, the nameplate large, a double rule, one champion quotation, a large **Start** button (ink, a play triangle, 22rem by 4rem) and a line with "Press Enter" breathing slowly (opacity 1 to 0.45, 1.8 s) beside the server status. Start reads "Getting ready…" until the card, keychain and server have answered; every line has a fixed place, so nothing moves meanwhile. `index.html` paints `--paper` before the CSS loads, so the window never flashes white.
- **Quotations** (`app/quotes.ts`): short, commonly attributed lines from the champions. On the front page, a pull-quote band under the masthead (portrait, the line in Playfair italic with a hanging opening mark, the name beneath; turns every 12 s, holds under the pointer, previous/pause/next). Never invented quotes.
- **Hall of Champions** turns by itself every 7 s. The portrait's frame stays put while the new photo fades in over the old one (photos decoded up front, so it never goes blank); the name hands over out-then-in with a 4px settle (never two names on top of each other). The caption is one line, "Champion · 1886". It holds under the pointer or focus, and has a Pause button (WCAG 2.2.2).
- **Brand marks**: Lichess and Chess.com from Simple Icons (CC0), one colour in `currentColor`, so they print in ink; the brands' own hues never appear.
- **Sign-in** (`features/signin`): full window, no nav. Left, the Hall of Champions as a photo spread (6 × 3, all eighteen, captions by the name players use). Right, email code, Lichess, and "Play without an account". Shown when the machine has no card and nobody is signed in; when the card's owner is signed out at Start; after "Sign out"; and from the player slot for a guest. Each account's card lives on the server (`/v1/profile`); this machine holds one card at a time, the signed-in account's (`app/cardSync.ts`: adopt the server's, push a guest card or a newer local edit, or send the player to Welcome to make one, pre-filled with the Lichess name). Signed out, the app prints "Guest", and the sign-in page says "Welcome back, <name>. Last time you signed in with Lichess · <name>", pre-filling that address or making Lichess the primary button. Greetings use the card's name, else the signed-in account's.
- Front page headlines are tiles that open their page, each with its action as a button ("Start a game", "Open the board", "Solve a puzzle", "Review a game") that fills with ink when the tile is hovered.
- Any border a control depends on uses `--ink-2` (6.7:1); `--rule` is decorative only.

## Library (beyond the board)
- **The archive** (`features/library/LibraryPage.tsx`, board `library-search.png`), a nav section between Puzzles and Settings (M9, pulled forward 2026-11-28). It needs an account: a guest's identity is new each session, so a guest sees "Sign in to keep an archive" and a Sign in button; offline, a line that the games are safe on the server.
- **Search** box (Source Serif, 2px ink frame, no browser clear button) for a player, an opening or an event; **opening chips** (Ruy Lopez, Sicilian, Queen's Gambit, Caro–Kann, French, English) add their words, one at a time. **Card catalogue**: index cards in a grid (at least 14rem wide, three across at 1440px), each ruled like a library card: players and result above a double rule (`½–½`, en dashes), then ECO · date (the year only when not this one), the opening, the first three moves in mono, the moves count, an empty ruled line and a punch hole; hover fills `--paper-2`; full names in a tooltip. Thirty cards at a time, more as the end scrolls into view. A card opens the game in Analysis (`/analyze?game=<id>`) at its first move, the players and opening in the dateline.
- **Right column** (18rem): the **player** whose name most found games carry (matching the search), in a double-framed card with games and newest rating, wins/draws/losses as White and as Black, and the five openings played most; **Result** (Any, Wins, Losses, Draws, from the player's side; disabled without a player); **Filed between** two dates; then **Import games**: Lichess or Chess.com, a username, Import, and one live line ("Reading DrNykterstein on Lichess: 120 read, 118 new, 2 already here…", then "Filed 300 new games…" or "Nothing new…: all 300 games are already here", or the site's failure in words); "Or file a PGN →" for a file up to 5 MB.

## Kids Edition (M15)
**No Kids boards exist yet.** Before M15 starts, Amine adds them to `design/newsprint/`; do not build kids mode from this paragraph alone.
A theme on the same components: paper `#FFF8EA` / `#F6E9CF`, ink `#2B2620` / `#5E564A`, red `#B8433A`, stamp gold `#F2C14E`, radius 4px, IBM Plex Sans for most text, Classic Wood board. Read the Kids boards before building; do not invent more.

## Building rules
- Build once in `src/ui/`: `Masthead`, `Kicker`, `Headline`, `ColumnRule`, `Box`, `ScoreSheet`, `EvalBar`, `EngineLinesTable`, `GlyphMark`, `PlayerCard`, `SideNav`, `Logo`, `HallOfChampions`. Screens compose these.
- shadcn/ui: `--radius: 0.125rem`; map background → `--paper`, foreground → `--ink`, muted → `--paper-2`/`--ink-2`, border → `--rule`, ring → `--focus`, destructive → `--accent`; remove every `shadow-*`.
- Buttons: primary = ink fill + paper text; secondary = 1px ink border; ghost = underline on hover; labels in Plex Sans uppercase.
- Board: wrap `react-chessboard` in `features/board/ThemedBoard.tsx`; no image or texture behind or around the board; the only texture is the Newsprint preset's hatch inside its light squares.
- Motion library: `duration 0.18, ease [0.2, 0, 0, 1]`, panels opacity 0→1 and y 4→0, no springs; `useReducedMotion()` drops to instant.
- `<html data-edition="day|night">` switches tokens. No hex literals in components.
- Done check for UI: screenshots in both editions next to the matching board in `design/newsprint/`, visible 2px focus, contrast ≥ 4.5:1.
