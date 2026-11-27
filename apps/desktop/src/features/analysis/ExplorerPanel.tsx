import { useEffect, useState } from "react";
import { explorer, type Explorer, type ExplorerDb, type TopGame } from "../../api";
import { auth } from "../../api/auth/session";
import { describeError, toApiError, type ApiError } from "../../api/problem";
import { Kicker } from "../../ui/Kicker";
import { compactCount, gameResult, shares } from "./explorerFormat";

const DBS: readonly [ExplorerDb, string][] = [
  ["masters", "Masters"],
  ["lichess", "Lichess"],
];

/** Answers already seen, by database and position: shown, labelled, when the server is out of reach. */
const seen = new Map<string, Explorer>();
function remember(key: string, answer: Explorer) {
  seen.set(key, answer);
  if (seen.size > 500) seen.delete(seen.keys().next().value as string);
}

type Answer = { key: string; data?: Explorer; error?: ApiError };

/**
 * The Explorer tab (board `explorer-panel.png`): what was played from the position on the board,
 * in the masters database (anyone) or lichess's (with a Lichess sign-in). Most played moves as a
 * printed table with White/draw/Black bars; a move is played on a click. Then the top games, each
 * opened on a click. Never blocks the board: each answer is fetched apart and a stale one dropped.
 */
export function ExplorerPanel({
  fen,
  onPlay,
  onOpenGame,
}: {
  fen: string;
  onPlay: (uci: string) => void;
  onOpenGame: (db: ExplorerDb, game: TopGame) => void;
}) {
  const [db, setDb] = useState<ExplorerDb>("masters");
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer>();
  const [signingIn, setSigningIn] = useState(false);
  const key = `${db}|${fen}`;

  useEffect(() => {
    const stop = new AbortController();
    // A short wait, so stepping through moves asks only where the player stops.
    const wait = setTimeout(() => {
      explorer
        .explore(fen, db, stop.signal)
        .then((data) => {
          remember(key, data);
          setAnswer({ key, data });
        })
        .catch((e: unknown) => {
          const error = toApiError(e);
          if (error.kind !== "cancelled") setAnswer({ key, data: seen.get(key), error });
        });
    }, 150);
    return () => {
      clearTimeout(wait);
      stop.abort();
    };
  }, [db, fen, key, attempt]);

  const current = answer?.key === key ? answer : undefined;
  const loading = !current;
  // While a new position loads, the last answer of this database stays on show, faded.
  const shown = current?.data ?? (answer?.key.startsWith(`${db}|`) ? answer.data : undefined);
  const needsLichess = current?.error?.kind === "problem" && current.error.problemType === "lichess-needed";

  async function signInWithLichess() {
    setSigningIn(true);
    try {
      await auth.lichess();
      setAttempt((n) => n + 1);
    } catch {
      // The sign-in page says why; here the notice stays.
    } finally {
      setSigningIn(false);
    }
  }

  const total = shown ? shown.white + shown.draws + shown.black : 0;
  return (
    <section aria-label="Explorer" aria-busy={loading}>
      <div role="radiogroup" aria-label="Database" className="mt-4 flex">
        {DBS.map(([value, name], i) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={db === value}
            onClick={() => setDb(value)}
            className={`label flex-1 border px-3 py-1.5 ${i > 0 ? "-ml-px" : ""} ${db === value ? "relative border-ink bg-ink text-paper" : "border-ink-2 text-ink hover:border-ink"}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <Kicker aside={shown && total > 0 ? `${compactCount(total)} games` : undefined}>
          Most played here · {db === "masters" ? "Masters" : "Lichess"}
        </Kicker>
      </div>

      {needsLichess ? (
        <div className="mt-4 border border-ink p-4">
          <p className="font-masthead text-[length:var(--text-lg)] font-bold">Sign in with Lichess</p>
          <p className="mt-2 font-body text-[length:var(--text-sm)] text-ink-2">
            The Lichess database is read with your own Lichess account. The masters database needs none.
          </p>
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithLichess()}
            className="label mt-4 rounded-[var(--radius)] border border-ink px-4 py-2 text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {signingIn ? "Waiting for Lichess…" : "Sign in with Lichess"}
          </button>
        </div>
      ) : current?.error && !shown ? (
        <div className="mt-4">
          <p className="font-body text-[length:var(--text-sm)] text-ink">
            {current.error.kind === "offline"
              ? "The explorer needs the server, which cannot be reached."
              : describeError(current.error)}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="label mt-3 text-ink underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {current?.error && shown && !needsLichess ? (
        <p className="label mt-3 text-ink-2" role="status">
          Saved copy · the server cannot be reached
        </p>
      ) : null}

      {shown && !needsLichess ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {shown.moves.length === 0 ? (
            <p className="mt-4 font-body text-[length:var(--text-sm)] text-ink-2 italic">
              No game in this database reached this position.
            </p>
          ) : (
            <table className="mt-2 w-full">
              <caption className="sr-only">Most played moves, with games won by White, drawn, and won by Black</caption>
              <thead>
                <tr className="label text-ink-2">
                  <th className="py-1.5 text-left font-normal">Move</th>
                  <th className="py-1.5 text-right font-normal">Games</th>
                  <th className="py-1.5 pl-3 text-left font-normal">W · D · B</th>
                </tr>
              </thead>
              <tbody>
                {shown.moves.map((m) => {
                  const games = m.white + m.draws + m.black;
                  const [w, d, b] = shares(m.white, m.draws, m.black);
                  return (
                    <tr
                      key={m.uci}
                      className="cursor-pointer border-t border-rule hover:bg-paper-2"
                      onClick={() => onPlay(m.uci)}
                      title={`Play ${m.san}${m.average_rating ? ` · average rating ${m.average_rating}` : ""}`}
                    >
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay(m.uci);
                          }}
                          className="font-label text-[length:var(--text-md)] font-semibold text-ink"
                        >
                          {m.san}
                        </button>
                      </td>
                      <td className="numeric py-2 text-right text-[length:var(--text-sm)] tabular-nums">
                        {compactCount(games)}
                      </td>
                      <td className="py-2 pl-3">
                        <div
                          className="flex h-3.5 w-full overflow-hidden border border-ink"
                          aria-label={`White ${w}%, draws ${d}%, Black ${b}%`}
                        >
                          {/* The board's own square colours: White is light and Black dark in both editions. */}
                          <span className="bg-[var(--board-light)]" style={{ width: `${w}%` }} />
                          <span
                            className="bg-[color-mix(in_srgb,var(--board-light)_50%,var(--board-dark))]"
                            style={{ width: `${d}%` }}
                          />
                          <span className="bg-[var(--board-dark)]" style={{ width: `${b}%` }} />
                        </div>
                        <span className="numeric mt-0.5 block text-right text-[length:var(--text-xs)] text-ink-2 tabular-nums">
                          {w}/{d}/{b}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {shown.top_games.length > 0 ? (
            <>
              <div className="mt-6">
                <Kicker>Top games</Kicker>
              </div>
              <ul>
                {shown.top_games.map((g) => (
                  <li key={g.id} className="border-b border-rule">
                    <button
                      type="button"
                      onClick={() => onOpenGame(db, g)}
                      className="w-full py-2 text-left hover:bg-paper-2"
                    >
                      <span className="block truncate font-label text-[length:var(--text-sm)] text-ink">
                        {g.white.name}
                        {g.white.rating ? <span className="text-ink-2"> {g.white.rating}</span> : null} – {g.black.name}
                        {g.black.rating ? <span className="text-ink-2"> {g.black.rating}</span> : null}
                      </span>
                      <span className="numeric text-[length:var(--text-xs)] text-ink-2">
                        {gameResult(g.winner)}
                        {g.year ? ` · ${g.year}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : loading && !needsLichess ? (
        <p className="mt-4 font-body text-[length:var(--text-sm)] text-ink-2">Reading the database…</p>
      ) : null}
    </section>
  );
}
