import { useEffect, useRef, useState } from "react";
import { formatScore, whiteWinPercent, type Score } from "../chess/score";

type Result = "1-0" | "0-1" | "½-½";

type Props = {
  /** White's view, from the engine's best line. */
  score?: Score;
  /** Win, draw, loss for White, per mille, when the engine sent them. */
  wdl?: readonly number[];
  /** Depth of the score, printed in the panel. */
  depth?: number;
  flipped: boolean;
  /** A finished game: the bar full for the winner, the result printed. */
  result?: Result;
};

const negate = (s: Score): Score => ("mate" in s ? { mate: -s.mate } : { cp: -s.cp });
const percent = (perMille: number) => `${Math.round(perMille / 10)}%`;

/**
 * The eval bar beside the board: White's share from White's side of the board, in the board's own
 * colours (paper for White, ink for Black) so it reads the same in both editions. Hover it, click
 * it, or focus it and press Enter: a panel gives each side's score and, when the engine sent them,
 * the chances of a White win, a draw and a Black win.
 */
export function EvalBar({ score, wdl, depth, flipped, result }: Props) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const white = result ? { "1-0": 100, "0-1": 0, "½-½": 50 }[result] : score ? whiteWinPercent(score) : 50;
  const text = result ?? (score ? formatScore(score) : "");
  const whiteLeads = white >= 50;
  const shown = (open || hover) && (score !== undefined || result !== undefined);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex shrink-0" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={shown}
        aria-label={result ? `Game over, ${result}` : score ? `Evaluation ${text} for White. Show both sides` : "No evaluation yet"}
        className={`relative flex w-6 cursor-pointer border border-ink bg-[var(--board-ink)] ${flipped ? "flex-col" : "flex-col-reverse"}`}
      >
        <span
          aria-hidden
          className="block w-full bg-[var(--board-light)] transition-[height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
          style={{ height: `${white}%` }}
        />
        <span aria-hidden className="absolute top-1/2 right-0 left-0 h-px bg-[var(--board-ink)] mix-blend-difference" />
        {text ? (
          <span
            aria-hidden
            className={`numeric absolute right-0 left-0 text-center text-[0.625rem] leading-none font-semibold ${
              whiteLeads !== flipped ? "bottom-1" : "top-1"
            } ${whiteLeads ? "text-[var(--board-ink)]" : "text-[var(--board-light)]"}`}
          >
            {text.replace("+", "")}
          </span>
        ) : null}
      </button>

      {shown ? (
        <div role="status" className="absolute top-0 left-full z-20 ml-2 w-52 border border-ink bg-paper p-3 text-ink">
          {result ? (
            <p className="numeric text-[length:var(--text-md)]">Game over · {result}</p>
          ) : score ? (
            <>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                <dt className="label text-ink-2">White</dt>
                <dd className="numeric text-right text-[length:var(--text-md)]">{formatScore(score)}</dd>
                <dt className="label text-ink-2">Black</dt>
                <dd className="numeric text-right text-[length:var(--text-md)]">{formatScore(negate(score))}</dd>
              </dl>
              {wdl && wdl.length === 3 ? (
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t border-rule pt-3">
                  <dt className="font-body text-[length:var(--text-sm)] text-ink-2">White wins</dt>
                  <dd className="numeric text-right text-[length:var(--text-sm)]">{percent(wdl[0])}</dd>
                  <dt className="font-body text-[length:var(--text-sm)] text-ink-2">Draw</dt>
                  <dd className="numeric text-right text-[length:var(--text-sm)]">{percent(wdl[1])}</dd>
                  <dt className="font-body text-[length:var(--text-sm)] text-ink-2">Black wins</dt>
                  <dd className="numeric text-right text-[length:var(--text-sm)]">{percent(wdl[2])}</dd>
                </dl>
              ) : null}
              {depth ? <p className="label mt-3 text-ink-2">Depth {depth}</p> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
