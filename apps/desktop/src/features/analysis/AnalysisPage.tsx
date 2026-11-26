import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEdition } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import {
  fenAt,
  inCheck,
  isPromotion,
  kingSquare,
  load,
  moveNumberLabel,
  newGame,
  play,
  sideToMove,
  toPgn,
  ucisUpTo,
  type Game,
} from "../../chess/game";
import { Button } from "../../ui/Button";
import { EvalBar } from "../../ui/EvalBar";
import { Kicker } from "../../ui/Kicker";
import { Masthead } from "../../ui/Masthead";
import { ThemedBoard, type BoardArrow } from "../board/ThemedBoard";
import { EngineColumn, linesOf } from "./EngineColumn";
import { ScoreSheet } from "./ScoreSheet";
import { useServerAnalysis } from "./useServerAnalysis";

const PROMOTIONS = [
  ["q", "Queen"],
  ["r", "Rook"],
  ["b", "Bishop"],
  ["n", "Knight"],
] as const;

const navButton =
  "flex h-11 w-14 items-center justify-center rounded-[var(--radius)] border border-ink-2 text-ink hover:border-ink disabled:opacity-40";

/** Typing in a field keeps the arrow keys and F for the field. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable);

/**
 * The Analysis page (board `analysis.png`): the moves on the left, the board with its eval bar in
 * the middle, the engine's best move and top three lines on the right. The engine is the one on
 * the server until M3 brings the local one (ADR-05, amended 2026-11-26).
 */
export function AnalysisPage() {
  const edition = useEdition();
  const [game, setGame] = useState<Game>(() => newGame());
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [engineOn, setEngineOn] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [promotion, setPromotion] = useState<{ from: string; to: string }>();
  const [setup, setSetup] = useState("");
  const [setupError, setSetupError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const fen = fenAt(game, cursor);
  const moves = useMemo(() => ucisUpTo(game, cursor), [game, cursor]);
  const engine = useServerAnalysis(game.startFen, moves, engineOn, attempt);
  const lines = linesOf(engine);
  const last = cursor > 0 ? game.plies[cursor - 1] : undefined;
  const check = inCheck(fen) ? kingSquare(fen, sideToMove(fen)) : undefined;
  const over =
    engine.status === "done" && engine.result.lines.length === 0
      ? check
        ? `Checkmate. ${sideToMove(fen) === "w" ? "Black" : "White"} has won.`
        : "Stalemate. The game is drawn."
      : undefined;

  const result = over ? (check ? (sideToMove(fen) === "w" ? "0-1" : "1-0") : "½-½") : undefined;

  const arrows: BoardArrow[] = lines.flatMap((l) =>
    l.pv[0] ? [{ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), best: l.multipv === 1 }] : [],
  );

  const go = useCallback((ply: number) => {
    setCursor(Math.max(0, Math.min(ply, game.plies.length)));
    setSelected(undefined);
    setPromotion(undefined);
  }, [game.plies.length]);

  const tryMove = (from: string, to: string, piece?: string): boolean => {
    if (!piece && isPromotion(fen, from, to)) {
      setPromotion({ from, to });
      return false;
    }
    const next = play(game, cursor, from, to, piece);
    if (!next) return false;
    setGame(next);
    setCursor(cursor + 1);
    setSelected(undefined);
    setPromotion(undefined);
    return true;
  };

  // Click-to-move: the first click picks a square, the second plays there or picks again.
  const onSquareClick = (square: string) => {
    if (selected && selected !== square && tryMove(selected, square)) return;
    setSelected(selected === square ? undefined : square);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => go(cursor - 1),
        ArrowRight: () => go(cursor + 1),
        Home: () => go(0),
        End: () => go(game.plies.length),
        f: () => setFlipped((v) => !v),
      };
      const act = keys[event.key];
      if (act) {
        event.preventDefault();
        act();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, game.plies.length, go]);

  const loadSetup = () => {
    const result = load(setup);
    if (!result.ok) {
      setSetupError(result.error);
      return;
    }
    setGame(result.game);
    setCursor(result.game.plies.length);
    setSetupError(undefined);
    setSetup("");
  };

  const copyPgn = async () => {
    await navigator.clipboard.writeText(toPgn(game));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const moveLabel = last ? `${moveNumberLabel(fenAt(game, cursor - 1))} ${last.san}` : "Start position";
  const engineName = engine.status === "done" ? `${engine.result.engine.name} ${engine.result.engine.version}` : "Stockfish";
  const status = engine.status === "off" ? "off" : engine.status === "done" ? "done" : "thinking";

  return (
    <>
      <Masthead
        kicker="Analyze"
        title="Analysis"
        dateline={[`${edition} edition`, editionDate(new Date()), `Server engine · ${engineName}`, moveLabel]}
        actions={
          <>
            <div className="flex items-center gap-3">
              <span className="label text-ink-2">Engine</span>
              <div role="group" aria-label="Engine" className="flex">
                {(["off", "thinking", "done"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => setEngineOn(s !== "off")}
                    className={`label -ml-px border px-4 py-2.5 text-[length:var(--text-sm)] first:ml-0 ${
                      status === s ? "relative border-ink bg-ink text-paper" : "border-ink-2 text-ink hover:border-ink"
                    }`}
                  >
                    {s === "off" ? "Off" : s === "thinking" ? "Thinking" : "Done"}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setFlipped((v) => !v)} aria-keyshortcuts="F">
              Flip
            </Button>
            <Button variant="ghost" onClick={() => void copyPgn()} disabled={game.plies.length === 0}>
              {copied ? "Copied" : "Copy PGN"}
            </Button>
          </>
        }
      />

      <div className="grid gap-y-8 py-6 [grid-template-areas:'moves_board_engine'] grid-cols-[12.5rem_minmax(0,1fr)_19rem] max-[1279px]:grid-cols-[minmax(0,1fr)_17rem] max-[1279px]:[grid-template-areas:'board_engine''board_moves']">
        <section aria-label="Moves" className="border-rule pr-5 [grid-area:moves] max-[1279px]:border-l max-[1279px]:pr-0 max-[1279px]:pl-6">
          <Kicker>Moves</Kicker>
          <ScoreSheet game={game} cursor={cursor} onGo={go} />

          <div className="mt-8">
            <label htmlFor="setup" className="label text-ink-2">
              Set up a position
            </label>
            <textarea
              id="setup"
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="Paste a FEN or a PGN"
              className="numeric mt-2 w-full resize-y rounded-[var(--radius)] border border-ink-2 bg-paper px-3 py-2 text-[length:var(--text-sm)] text-ink placeholder:text-ink-2"
            />
            {setupError ? <p className="mt-1 font-body text-[length:var(--text-sm)] text-ink">{setupError}</p> : null}
            <div className="mt-2 flex gap-1">
              <Button onClick={loadSetup}>Load</Button>
              <Button
                variant="ghost"
                className="whitespace-nowrap"
                onClick={() => {
                  setGame(newGame());
                  setCursor(0);
                }}
              >
                New board
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="Board" className="border-rule px-6 [grid-area:board] min-[1280px]:border-x max-[1279px]:pr-6 max-[1279px]:pl-0">
          <div className="mx-auto flex w-full max-w-[min(100%,calc(100vh-14rem))] items-stretch gap-3">
            <EvalBar score={lines[0]?.score} flipped={flipped} result={result} />
            <div className="min-w-0 flex-1">
              <ThemedBoard
                fen={fen}
                orientation={flipped ? "black" : "white"}
                onMove={(from, to) => tryMove(from, to)}
                lastMove={last ? { from: last.from, to: last.to } : undefined}
                check={check}
                selected={selected}
                onSquareClick={onSquareClick}
                arrows={over ? [] : arrows}
                label={`Board, ${sideToMove(fen) === "w" ? "White" : "Black"} to move`}
              />
            </div>
          </div>

          {promotion ? (
            <div role="dialog" aria-label="Promote the pawn" className="mx-auto mt-4 flex max-w-[min(100%,calc(100vh-14rem))] items-center gap-2">
              <span className="label mr-2 text-ink-2">Promote to</span>
              {PROMOTIONS.map(([piece, name]) => (
                <Button key={piece} onClick={() => tryMove(promotion.from, promotion.to, piece)} autoFocus={piece === "q"}>
                  {name}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setPromotion(undefined)}>
                Cancel
              </Button>
            </div>
          ) : null}

          <div className="mx-auto mt-4 flex max-w-[min(100%,calc(100vh-14rem))] items-center justify-between border-t border-rule pt-4">
            <div className="flex gap-2">
              <button type="button" className={navButton} onClick={() => go(0)} disabled={cursor === 0} aria-label="First move" aria-keyshortcuts="Home">
                <ChevronFirst aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button type="button" className={navButton} onClick={() => go(cursor - 1)} disabled={cursor === 0} aria-label="Previous move" aria-keyshortcuts="ArrowLeft">
                <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button type="button" className={navButton} onClick={() => go(cursor + 1)} disabled={cursor === game.plies.length} aria-label="Next move" aria-keyshortcuts="ArrowRight">
                <ChevronRight aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button type="button" className={navButton} onClick={() => go(game.plies.length)} disabled={cursor === game.plies.length} aria-label="Last move" aria-keyshortcuts="End">
                <ChevronLast aria-hidden size={18} strokeWidth={1.5} />
              </button>
            </div>
            <span className="numeric text-[length:var(--text-md)] text-ink-2">{moveLabel}</span>
          </div>
        </section>

        <aside className="pl-5 [grid-area:engine] max-[1279px]:border-l max-[1279px]:border-rule">
          <EngineColumn
            state={engine}
            fen={fen}
            over={over}
            onRetry={() => setAttempt((n) => n + 1)}
            onTurnOn={() => setEngineOn(true)}
          />
        </aside>
      </div>
    </>
  );
}
