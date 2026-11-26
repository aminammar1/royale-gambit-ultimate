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

const percent = (perMille: number) => `${Math.round(perMille / 10)}%`;

/**
 * How a side stands, in words, from the White-view score: never a second signed number, which
 * would read as the other side's (DESIGN.md: "#−3" means Black mates in 3).
 */
export function sideStanding(score: Score, side: "white" | "black"): string {
  const forWhite = "mate" in score ? Math.sign(score.mate) : Math.sign(score.cp);
  const leads = side === "white" ? forWhite > 0 : forWhite < 0;
  if ("mate" in score) {
    const n = Math.abs(score.mate);
    return leads ? `mates in ${n}` : `is mated in ${n}`;
  }
  if (score.cp === 0) return "level";
  const pawns = (Math.abs(score.cp) / 100).toFixed(2);
  return leads ? `better by ${pawns}` : `worse by ${pawns}`;
}

/**
 * The eval bar beside the board: White's share from White's side of the board, in the board's own
 * colours (paper for White, ink for Black) so it reads the same in both editions. Hover it, click
 * it, or focus it and press Enter: a panel gives each side's score and, when the engine sent them,
 * the chances of a White win, a draw and a Black win.
 */
export function EvalBar({ score, wdl, depth, flipped, result }: Props) {
  // Hover shows the panel; a click pins it, or hides what is showing until the pointer leaves.
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [muted, setMuted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const white = result ? { "1-0": 100, "0-1": 0, "½-½": 50 }[result] : score ? whiteWinPercent(score) : 50;
  const text = result ?? (score ? formatScore(score) : "");
  const whiteLeads = white >= 50;
  const shown = (open || (hover && !muted)) && (score !== undefined || result !== undefined);
  const toggle = () => {
    if (shown) {
      setOpen(false);
      setMuted(true);
    } else {
      setOpen(true);
      setMuted(false);
    }
  };

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
    <div
      ref={root}
      className="relative flex shrink-0"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setMuted(false);
      }}
    >
      {/* For assistive tech: the evaluation as a meter, as before the bar became a button. */}
      <span
        role="meter"
        aria-label="Evaluation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(white)}
        aria-valuetext={result ? `Game over, ${result}` : score ? `${text} for White` : "No evaluation"}
        className="sr-only"
      />
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="eval-panel"
        aria-label={result ? `Game over, ${result}` : score ? "Show both sides' standing" : "No evaluation yet"}
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
        <div id="eval-panel" className="absolute top-0 left-full z-20 ml-2 w-56 border border-ink bg-paper p-3 text-ink">
          {result ? (
            <p className="numeric text-[length:var(--text-md)]">Game over · {result}</p>
          ) : score ? (
            <>
              <p className="flex items-baseline justify-between">
                <span className="label text-ink-2">Evaluation</span>
                <span className="numeric text-[length:var(--text-lg)]">{formatScore(score)}</span>
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="label text-ink-2">White</dt>
                <dd className="font-body text-right text-[length:var(--text-sm)]">{sideStanding(score, "white")}</dd>
                <dt className="label text-ink-2">Black</dt>
                <dd className="font-body text-right text-[length:var(--text-sm)]">{sideStanding(score, "black")}</dd>
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
