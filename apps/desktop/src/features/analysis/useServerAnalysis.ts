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
export function useServerAnalysis(
  startFen: string,
  moves: readonly string[],
  enabled: boolean,
  /** Bump to search the same position again (Try again). */
  attempt = 0,
): EngineState {
  // State is tagged with the search it belongs to; anything from an older search reads as a new
  // search just starting. The effect only sets state from the engine's callbacks.
  const key = `${startFen}|${moves.join(" ")}|${attempt}`;
  const [state, setState] = useState<{ key: string; value: EngineState }>();

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const lines = new Map<number, EngineLine>();
    const set = (value: EngineState) => setState({ key, value });
    const timer = setTimeout(() => {
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
        .then((result) => set({ status: "done", result }))
        .catch((error: unknown) => {
          const e = toApiError(error);
          if (e.kind === "cancelled") return;
          set({ status: "failed", message: describeError(e), offline: e.kind === "offline" });
        });
    }, 150);
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
