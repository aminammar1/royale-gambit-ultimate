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

No other hues in UI chrome; country flags (flag-icons) are content, always printed beside the country's name. Engine arrows use `--ink` at 70% (best move) and `--ink-2` (other lines). Mistake arrows use `--accent`.

### Board presets (square light / dark)
| Preset | Light | Dark | Notes |
| --- | --- | --- | --- |
| Newsprint (default) | `#E9E1CC` | `#1B1A17` | printed look from the boards: ink-black dark squares, paper light squares with a fine horizontal hatch (a repeating 1px line at about 8% ink, drawn inside the light squares only) |
| Tournament Hall | `#E4DDC6` | `#7E8566` | muted olive, felt-and-wood hall |
| Classic Wood | `#E2C9A1` | `#A77B52` | warm maple/walnut |
| High Contrast | `#FFFFFF` | `#4F4F4F` | accessibility |
Last-move highlight: `--ink` at 12%. Check: `--accent` at 35% radial. Legal-move dots: `--ink` at 22%.

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
- Pieces glide 150–200 ms. Panels fade and lift 4px, like a page settling. Respect `prefers-reduced-motion`.

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
- **Start screen** (`app/StartScreen.tsx`), every launch: first a newsreel intro, the eighteen champions in hard cuts (125 ms each, the year set large beneath), skipped by any key or click. Then the title page: three rows of champion portraits drifting sideways behind (16% opacity, 20% at night, still under reduced motion), and a panel built like the player card: a label header ("Royale Gambit · Day edition", the date) over a double rule, the logo and the nameplate on one line, a champion quotation between ink rules (portrait, a rule, the opening mark hanging), the **Start** button (Enter works), and a label footer ("Press Enter to start" · the server's state). Start reads "Getting ready…" until the card, keychain and server have answered. Every line has a fixed place, so the panel never moves or resizes while start-up answers. `index.html` paints `--paper` before the CSS loads, so the window never flashes white.
- **Quotations** (`app/quotes.ts`): short, commonly attributed lines from the champions. On the front page, a pull-quote band under the masthead (portrait, the line in Playfair italic with a hanging opening mark, the name beneath; turns every 12 s, holds under the pointer, previous/pause/next). Never invented quotes.
- **Hall of Champions** turns by itself every 7 s. The portrait's frame stays put while the new photo fades in over the old one (photos decoded up front, so it never goes blank); the name hands over out-then-in with a 4px settle (never two names on top of each other). The caption is one line, "Champion · 1886". It holds under the pointer or focus, and has a Pause button (WCAG 2.2.2).
- **Brand marks**: Lichess and Chess.com from Simple Icons (CC0), one colour in `currentColor`, so they print in ink; the brands' own hues never appear.
- **Sign-in** (`features/signin`): full window, no nav. Left, the Hall of Champions as a photo spread (6 × 3, all eighteen, captions by the name players use). Right, email code, Lichess, and "Play without an account". Shown when the machine has no card and nobody is signed in; when the card's owner is signed out at Start; after "Sign out"; and from the player slot for a guest. Each account's card lives on the server (`/v1/profile`); this machine holds one card at a time, the signed-in account's (`app/cardSync.ts`: adopt the server's, push a guest card or a newer local edit, or send the player to Welcome to make one, pre-filled with the Lichess name). Signed out, the app prints "Guest", and the sign-in page says "Welcome back, <name>. Last time you signed in with Lichess · <name>", pre-filling that address or making Lichess the primary button. Greetings use the card's name, else the signed-in account's.
- Front page headlines are tiles that open their page, each with its action as a button ("Start a game", "Open the board", "Solve a puzzle", "Review a game") that fills with ink when the tile is hovered.
- Any border a control depends on uses `--ink-2` (6.7:1); `--rule` is decorative only.

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
