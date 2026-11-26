import { useMemo } from "react";
import { Link } from "react-router";
import { useEdition } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import { fenAt, legalTargets, load } from "../../chess/game";
import { BOARD_THEMES, settingsDb, useSettings } from "../../db/settings";
import { Masthead } from "../../ui/Masthead";
import { ThemedBoard } from "../board/ThemedBoard";
import { BOARD_THEME_COLOURS, BOARD_THEME_NAMES, DISPLAY_ROWS } from "./boardThemes";

/** The preview of the board: after 3… a6 of a Ruy Lopez, the knight on f3 picked. */
const PREVIEW = load("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");

/** A 2×2 corner of a board in one theme: the theme's own tokens, scoped to the swatch. */
function Swatch({ theme }: { theme: (typeof BOARD_THEMES)[number] }) {
  return (
    <span data-board={theme} aria-hidden className="grid size-11 shrink-0 grid-cols-2 border border-ink-2">
      <span className="board-light" />
      <span className="board-dark" />
      <span className="board-dark" />
      <span className="board-light" />
    </span>
  );
}

/**
 * Board & pieces (board design/newsprint/board-customization.png, M2, pulled forward): the
 * square colours on the left, a live preview in the middle, the display switches on the right.
 * Saved on this machine, applied to every board at once. Piece sets wait for Amine's print art
 * (ADR-04); sounds and saved themes come with the rest of M2.
 */
export function BoardSettingsPage() {
  const edition = useEdition();
  const theme = useSettings((s) => s.boardTheme);
  const display = useSettings((s) => s.display);
  const game = PREVIEW.ok ? PREVIEW.game : undefined;
  const fen = game ? fenAt(game, game.plies.length) : "";
  const last = game?.plies.at(-1);
  const targets = useMemo(() => (fen ? legalTargets(fen, "f3") : []), [fen]);

  return (
    <>
      <Masthead
        kicker="Settings"
        title="Board & pieces"
        dateline={[`${edition} edition`, editionDate(new Date()), "Applies to every board", "Live preview"]}
        actions={
          <>
            <button type="button" onClick={settingsDb.resetBoard} className="label text-ink underline-offset-4 hover:underline">
              Reset
            </button>
            <Link to="/settings" className="label text-ink underline-offset-4 hover:underline">
              Done
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-[17rem_minmax(0,1fr)_17rem] py-8 max-[1279px]:grid-cols-[15rem_minmax(0,1fr)] max-[1279px]:gap-y-8">
        <section aria-labelledby="squares" className="pr-6">
          <h2 id="squares" className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">
            Square colours
          </h2>
          <div role="radiogroup" aria-labelledby="squares" className="mt-4 flex flex-col gap-2">
            {BOARD_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={theme === t}
                onClick={() => settingsDb.setBoardTheme(t)}
                className={`flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5 text-left ${
                  theme === t ? "border-ink bg-paper-2" : "border-ink-2 hover:border-ink"
                }`}
              >
                <Swatch theme={t} />
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-[length:var(--text-lg)] font-semibold text-ink">{BOARD_THEME_NAMES[t]}</span>
                  <span className="numeric block text-[length:var(--text-xs)] text-ink-2">{BOARD_THEME_COLOURS[t]}</span>
                </span>
                {theme === t ? (
                  <span aria-hidden className="text-[length:var(--text-lg)] text-ink">
                    ✓
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="mt-6 font-body text-[length:var(--text-sm)] text-ink-2">
            Pieces are placeholders, outlined so they read on any square, until the print set lands.
          </p>
        </section>

        <section aria-label="Preview" className="border-x border-rule px-6 max-[1279px]:border-r-0">
          <div className="mx-auto max-w-[min(100%,calc(100vh-15rem))]">
            {game ? (
              <ThemedBoard
                id="preview-board"
                fen={fen}
                orientation="white"
                onMove={() => false}
                lastMove={last ? { from: last.from, to: last.to } : undefined}
                selected="f3"
                targets={targets}
                arrows={[{ from: "b5", to: "a4", best: true }]}
                display={display}
                label="Preview board"
              />
            ) : null}
            <p className="numeric mt-3 flex justify-between text-[length:var(--text-sm)] text-ink-2">
              <span>Preview · after 3… a6 · Nf3 picked</span>
              <span>{BOARD_THEME_NAMES[theme]}</span>
            </p>
          </div>
        </section>

        <section aria-labelledby="display" className="pl-6 max-[1279px]:col-span-2 max-[1279px]:pl-0">
          <h2 id="display" className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">
            Display
          </h2>
          <dl>
            {DISPLAY_ROWS.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-4 border-b border-rule py-3">
                <dt>
                  <span className="label block text-ink">{row.label}</span>
                  <span className="font-body text-[length:var(--text-sm)] text-ink-2">{row.note}</span>
                </dt>
                <dd>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={display[row.name]}
                    aria-label={row.label}
                    onClick={() => settingsDb.setDisplay(row.name, !display[row.name])}
                    className="label min-w-14 border border-ink-2 px-3 py-1 text-ink hover:border-ink"
                  >
                    {display[row.name] ? "On" : "Off"}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
