import { formatScore, whiteWinPercent, type Score } from "../chess/score";

/**
 * The eval bar beside the board: White's share from White's side of the board, in the board's own
 * colours (paper for White, ink for Black) so it reads the same in both editions. A thin mark at
 * the middle; the score printed at the end of the leading side. Without a score, an even, empty
 * bar.
 */
export function EvalBar({ score, flipped, result }: { score?: Score; flipped: boolean; result?: "1-0" | "0-1" | "½-½" }) {
  // A finished game shows its result, the bar full for the winner (half for a draw).
  const white = result ? { "1-0": 100, "0-1": 0, "½-½": 50 }[result] : score ? whiteWinPercent(score) : 50;
  const text = result ?? (score ? formatScore(score) : "");
  const whiteLeads = white >= 50;
  return (
    <div
      role="meter"
      aria-label="Evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
      aria-valuetext={result ? `Game over, ${result}` : score ? `${text} for White` : "No evaluation"}
      className={`relative flex w-6 shrink-0 border border-ink bg-[var(--board-dark)] ${flipped ? "flex-col" : "flex-col-reverse"}`}
    >
      <div
        className="w-full bg-[var(--board-light)] transition-[height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        style={{ height: `${white}%` }}
      />
      <div aria-hidden className="absolute top-1/2 right-0 left-0 h-px bg-[var(--board-dark)] mix-blend-difference" />
      {text ? (
        <span
          aria-hidden
          className={`numeric absolute right-0 left-0 text-center text-[0.625rem] leading-none font-semibold ${
            whiteLeads !== flipped ? "bottom-1" : "top-1"
          } ${whiteLeads ? "text-[var(--board-dark)]" : "text-[var(--board-light)]"}`}
        >
          {text.replace("+", "")}
        </span>
      ) : null}
    </div>
  );
}
