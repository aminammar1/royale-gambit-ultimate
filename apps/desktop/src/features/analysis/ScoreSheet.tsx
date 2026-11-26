import { useEffect, useRef } from "react";
import type { Game } from "../../chess/game";

type Row = { number: number; white?: { ply: number; san: string }; black?: { ply: number; san: string } };

/** The moves as score-sheet rows: "12. Nf3 Nc6". A game that starts with Black to move opens "1. … e5". */
function rows(game: Game): Row[] {
  const [, side, , , , full] = game.startFen.split(" ");
  let number = Number(full) || 1;
  let white = side !== "b";
  const out: Row[] = [];
  game.plies.forEach((p, i) => {
    const ply = i + 1;
    if (white) out.push({ number, white: { ply, san: p.san } });
    else {
      const last = out.at(-1);
      if (last && last.number === number && !last.black) last.black = { ply, san: p.san };
      else out.push({ number, black: { ply, san: p.san } });
      number += 1;
    }
    white = !white;
  });
  return out;
}

/** The score sheet: every move a button that takes the board there; the current move boxed. */
export function ScoreSheet({ game, cursor, onGo }: { game: Game; cursor: number; onGo: (ply: number) => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Braces matter: scrollIntoView returns a promise in newer engines, and an effect may only
    // return a clean-up function.
    void current.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const list = rows(game);

  const cell = (move?: { ply: number; san: string }) =>
    move ? (
      <button
        type="button"
        ref={move.ply === cursor ? current : undefined}
        onClick={() => onGo(move.ply)}
        aria-current={move.ply === cursor ? "step" : undefined}
        className={`numeric w-full rounded-[var(--radius)] border px-2 py-1 text-left text-[length:var(--text-md)] ${
          move.ply === cursor ? "border-ink bg-paper-2 text-ink" : "border-transparent text-ink hover:bg-paper-2/60"
        }`}
      >
        {move.san}
      </button>
    ) : (
      <span className="numeric px-2 py-1 text-ink-2">…</span>
    );

  if (list.length === 0) {
    return (
      <p className="mt-4 font-body text-[length:var(--text-sm)] text-ink-2 italic">
        No moves yet. Play one on the board, or set up a position below.
      </p>
    );
  }
  return (
    <ol className="mt-2 max-h-[min(52vh,36rem)] overflow-y-auto" aria-label="Moves">
      {list.map((r) => (
        <li key={`${r.number}-${r.white?.ply ?? r.black?.ply}`} className="grid grid-cols-[2.5rem_1fr_1fr] items-center border-b border-rule">
          <span className="numeric text-right text-[length:var(--text-sm)] text-ink-2">{r.number}.</span>
          {cell(r.white)}
          {cell(r.black)}
        </li>
      ))}
    </ol>
  );
}
