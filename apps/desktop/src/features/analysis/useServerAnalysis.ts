import { useEffect, useState } from "react";
import { analysis as client, type Analysis, type EngineLine } from "../../api";
import { describeError, toApiError } from "../../api/problem";

export type EngineState =
  | { status: "off" }
  | { status: "thinking"; lines: EngineLine[] }
  | { status: "done"; result: Analysis }
  | { status: "failed"; message: string; offline: boolean };

/** How deep the server searches for the Analysis page, and how many lines it shows. */
export const DEPTH = 20;
export const LINES = 3;

/**
 * The server engine on the board's position: it starts when the position settles (a short
 * pause, so stepping through a game does not start a search per move), streams lines as they
 * deepen, and stops the server's search as soon as the position changes or the engine is
 * switched off.
 */
/** Finished answers by position, so stepping back and forth through a game asks the server once. */
const answered = new Map<string, Analysis>();
const KEEP = 300;

/** A pause before asking, so stepping through a game does not start a search per move. */
const SETTLE_MS = 300;
/** Busy engines or the guest rate limit: wait and ask again, a few times. */
const RETRY_MS = 3000;
const RETRIES = 4;

function remember(key: string, result: Analysis) {
  answered.delete(key);
  answered.set(key, result);
  if (answered.size > KEEP) answered.delete(answered.keys().next().value as string);
}

/**
 * The server engine on the board's position: it starts when the position settles, streams lines
 * as they deepen, and stops the server's search as soon as the position changes or the engine is
 * switched off. A position already answered is shown at once, and a busy server is asked again
 * by itself.
 */
export function useServerAnalysis(
  startFen: string,
  moves: readonly string[],
  enabled: boolean,
  /** Bump to search the same position again (Try again, or turning the engine back on). */
  attempt = 0,
): EngineState {
  // State is tagged with the search it belongs to; anything from an older search reads as a new
  // search just starting. The effect only sets state from timers and the engine's callbacks.
  const position = `${startFen}|${moves.join(" ")}`;
  const key = `${position}|${attempt}`;
  const [state, setState] = useState<{ key: string; value: EngineState }>();

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const set = (value: EngineState) => setState({ key, value });
    let timer: ReturnType<typeof setTimeout>;
    const known = answered.get(position);
    const ask = (tries: number) => {
      const lines = new Map<number, EngineLine>();
      client
        .analyse(
          { fen: startFen, moves: [...moves], depth: DEPTH, multipv: LINES },
          {
            signal: abort.signal,
            onInfo: (line) => {
              lines.set(line.multipv, line);
              set({ status: "thinking", lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) });
            },
          },
        )
        .then((result) => {
          remember(position, result);
          set({ status: "done", result });
        })
        .catch((error: unknown) => {
          const e = toApiError(error);
          if (e.kind === "cancelled") return;
          set({ status: "failed", message: describeError(e), offline: e.kind === "offline" });
          const busy = e.kind === "problem" && (e.status === 429 || e.problemType === "engine-busy");
          if (busy && tries < RETRIES && !abort.signal.aborted) timer = setTimeout(() => ask(tries + 1), RETRY_MS);
        });
    };
    timer = setTimeout(() => (known && attempt === 0 ? set({ status: "done", result: known }) : ask(0)), known ? 0 : SETTLE_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
    // `key` stands for startFen, moves and attempt: a new array with the same moves is the same
    // position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  if (!enabled) return { status: "off" };
  if (!state || state.key !== key) return { status: "thinking", lines: [] };
  return state.value;
}
