import { moveNumberLabel, numberedMoves, pvToSan } from "../../chess/game";
import { formatScore } from "../../chess/score";
import type { EngineLine } from "../../api";
import { Button } from "../../ui/Button";
import { Kicker } from "../../ui/Kicker";
import { DEPTH, type EngineState } from "./useServerAnalysis";

/** How many moves of each line are printed: enough to read the idea, short enough to scan. */
const SHOWN = 8;

/** The lines the column prints: the stream's while thinking, the result's when done. */
export function linesOf(state: EngineState): EngineLine[] {
  if (state.status === "thinking") return state.lines;
  if (state.status === "done") return state.result.lines;
  return [];
}

type Props = {
  state: EngineState;
  fen: string;
  /** No legal move in the position (chess.js): mate or stalemate, shown before any engine state. */
  over?: string;
  onRetry: () => void;
  onTurnOn: () => void;
  /** Plays engine moves on the board from the current position (UCI). */
  onPlay: (ucis: string[]) => void;
};

/** The engine column: the best move set large, then the top three lines as a printed table. */
export function EngineColumn({ state, fen, over, onRetry, onTurnOn, onPlay }: Props) {
  const lines = linesOf(state);
  const best = lines[0];
  const bestSan = best ? pvToSan(fen, best.pv.slice(0, 1))[0] : undefined;
  const depth = state.status === "done" ? state.result.depth : best?.depth;

  return (
    <section aria-label="Engine" aria-busy={state.status === "thinking"}>
      <Kicker>Engine</Kicker>

      {over ? (
        <p className="mt-5 font-masthead text-[length:var(--text-2xl)] font-bold">{over}</p>
      ) : state.status === "off" ? (
        <div className="mt-5 font-body text-[length:var(--text-md)] text-ink-2">
          <p>The engine is off. Turn it on to see the best move and the top three lines.</p>
          <Button className="mt-4" onClick={onTurnOn}>
            Turn the engine on
          </Button>
        </div>
      ) : state.status === "failed" ? (
        <div className="mt-5 border border-ink-2 p-4" role="alert">
          <p className="font-body text-[length:var(--text-md)] text-ink">{state.message}</p>
          <p className="mt-2 font-body text-[length:var(--text-sm)] text-ink-2">
            {state.offline
              ? "The engine runs on the Royale Gambit server, which cannot be reached. The board still works."
              : "The board still works; the engine will try this position again when you ask."}
          </p>
          <Button className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 border border-rule">
            <div className="flex items-baseline justify-between border-b border-rule px-4 py-2.5">
              <span className="label text-ink">Best move</span>
              <span className="numeric text-[length:var(--text-sm)] text-ink-2">
                {depth ? `depth ${depth}${state.status === "thinking" ? ` of ${DEPTH}` : ""}` : "thinking…"}
              </span>
            </div>
            <button
              type="button"
              disabled={!best}
              onClick={() => best && onPlay(best.pv.slice(0, 1))}
              title={bestSan ? `Play ${bestSan} on the board` : undefined}
              className="flex w-full items-baseline justify-between gap-4 px-4 py-4 text-left hover:bg-paper-2 disabled:hover:bg-transparent"
            >
              <span className="numeric text-[length:var(--text-2xl)] leading-none font-medium whitespace-nowrap">
                {bestSan ? `${moveNumberLabel(fen)} ${bestSan}` : "…"}
              </span>
              <span className="numeric text-[length:var(--text-xl)] leading-none whitespace-nowrap">{best ? formatScore(best.score) : ""}</span>
            </button>
          </div>

          <p className="label mt-6 border-b-[3px] border-double border-ink pb-2 text-ink-2">Top three lines</p>
          <ol aria-label="Top three lines">
            {lines.length === 0 ? (
              <li className="py-3 font-body text-[length:var(--text-sm)] text-ink-2 italic">The engine is reading the position…</li>
            ) : (
              lines.map((l) => (
                <li key={l.multipv} className="grid grid-cols-[1.25rem_4rem_1fr] gap-x-2 border-b border-rule py-3">
                  <span className="numeric text-[length:var(--text-sm)] text-ink-2">{l.multipv}</span>
                  <span className={`numeric text-[length:var(--text-sm)] ${l.multipv === 1 ? "font-semibold text-ink" : "text-ink"}`}>
                    {formatScore(l.score)}
                  </span>
                  <span className="numeric text-[length:var(--text-sm)] leading-relaxed text-ink">
                    {numberedMoves(fen, pvToSan(fen, l.pv.slice(0, SHOWN))).map((m, i) => (
                      <span key={i}>
                        {m.number ? <span className="text-ink-2">{m.number} </span> : null}
                        <button
                          type="button"
                          onClick={() => onPlay(l.pv.slice(0, i + 1))}
                          title={`Play the line to ${m.san}`}
                          className="rounded-[var(--radius)] px-0.5 hover:bg-paper-2 hover:underline"
                        >
                          {m.san}
                        </button>{" "}
                      </span>
                    ))}
                  </span>
                </li>
              ))
            )}
          </ol>
          {state.status === "done" ? (
            <p className="label mt-3 text-ink-2">
              {state.result.engine.name} {state.result.engine.version} · server{state.result.cached ? " · from the cache" : ""}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
