import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { explorer, games, type ExplorerDb, type TopGame } from "../../api";
import { describeError, toApiError } from "../../api/problem";
import { loadOpenings, openingAt, positionKey, type OpeningTable } from "../../chess/openings";
import { useEdition } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import {
  fenAt,
  inCheck,
  isPromotion,
  legalTargets,
  outcome,
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
import { playBoardSound, soundFor } from "../../audio/boardSounds";
import { useSettings } from "../../db/settings";
import { Button } from "../../ui/Button";
import { EvalBar } from "../../ui/EvalBar";
import { Kicker } from "../../ui/Kicker";
import { Masthead } from "../../ui/Masthead";
import { ThemedBoard, landingMs, type BoardArrow, type MoveGesture } from "../board/ThemedBoard";
import { EngineColumn, linesOf } from "./EngineColumn";
import { ExplorerPanel } from "./ExplorerPanel";
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
  target instanceof HTMLElement &&
  (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable);

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
  // The game opened from the Library (?game=<id>): its players and opening, for the dateline.
  const [params] = useSearchParams();
  const gameId = params.get("game");
  // A top game from the explorer (?top=masters:<id>), as the Library's popular games link to.
  const top = params.get("top");
  const [filedAs, setFiledAs] = useState<string>();
  const [tab, setTab] = useState<"engine" | "explorer">("engine");
  // The opening table (CC0, lichess-org/chess-openings), loaded with the page, not the app.
  const [openings, setOpenings] = useState<OpeningTable>();
  useEffect(() => {
    let live = true;
    void loadOpenings().then((t) => live && setOpenings(t));
    return () => {
      live = false;
    };
  }, []);
  const [copied, setCopied] = useState<{ what: "FEN" | "PGN"; ok: boolean }>();

  const fen = fenAt(game, cursor);
  const moves = useMemo(() => ucisUpTo(game, cursor), [game, cursor]);
  // Mate and stalemate come from chess.js (ADR-03), never from the engine's answer.
  const ended = outcome(fen);
  const depth = useSettings((s) => s.engineDepth);
  const engine = useServerAnalysis(game.startFen, moves, engineOn && !ended, attempt, depth);
  const lines = ended ? [] : linesOf(engine);
  const last = cursor > 0 ? game.plies[cursor - 1] : undefined;
  const check = inCheck(fen) ? kingSquare(fen, sideToMove(fen)) : undefined;
  const over =
    ended === "checkmate"
      ? `Checkmate. ${sideToMove(fen) === "w" ? "Black" : "White"} has won.`
      : ended === "stalemate"
        ? "Stalemate. The game is drawn."
        : undefined;
  const result = ended === "checkmate" ? (sideToMove(fen) === "w" ? "0-1" : "1-0") : ended ? "½-½" : undefined;

  const arrows: BoardArrow[] = lines.flatMap((l) =>
    l.pv[0] ? [{ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), best: l.multipv === 1 }] : [],
  );

  const go = useCallback(
    (ply: number) => {
      const to = Math.max(0, Math.min(ply, game.plies.length));
      // One step through the game knocks like the move itself, when the piece lands; a jump is silent.
      const stepped = to === cursor + 1 ? game.plies[cursor] : to === cursor - 1 ? game.plies[to] : undefined;
      if (stepped && useSettings.getState().sounds) void playBoardSound(soundFor(stepped.san), landingMs());
      setCursor(to);
      setSelected(undefined);
      setPromotion(undefined);
    },
    [game.plies, cursor],
  );

  const tryMove = (from: string, to: string, piece?: string, gesture: MoveGesture = "click"): boolean => {
    if (!piece && isPromotion(fen, from, to)) {
      setPromotion({ from, to });
      setSelected(undefined); // the choice of piece replaces the dots
      return false;
    }
    const next = play(game, cursor, from, to, piece);
    if (!next) {
      setSelected(undefined); // a dropped piece that did not move leaves no dots behind
      return false;
    }
    setGame(next);
    setCursor(cursor + 1);
    // A dropped piece is already down; a clicked one knocks when its glide lands.
    if (useSettings.getState().sounds)
      void playBoardSound(soundFor(next.plies[cursor].san), gesture === "drop" ? 0 : landingMs());
    setSelected(undefined);
    setPromotion(undefined);
    return true;
  };

  // Where the picked piece can go: dots on the board, for a press or a drag.
  const targets = useMemo(() => (selected ? legalTargets(fen, selected) : []), [fen, selected]);

  /** Plays engine moves from the current position, crossing out what came after. */
  const playLine = (ucis: string[]) => {
    let next = game;
    let at = cursor;
    for (const uci of ucis) {
      const played = play(next, at, uci.slice(0, 2), uci.slice(2, 4), uci[4]);
      if (!played) break;
      next = played;
      at += 1;
    }
    setGame(next);
    setCursor(at);
    setSelected(undefined);
    setPromotion(undefined);
    if (at > cursor && useSettings.getState().sounds)
      void playBoardSound(soundFor(next.plies[at - 1].san), landingMs());
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
    replaceGame(result.game, result.game.plies.length);
    setSetup("");
  };

  /** Copies the position on the board (FEN) or the whole game (PGN), and says so. */
  const copy = async (what: "FEN" | "PGN") => {
    try {
      await navigator.clipboard.writeText(what === "FEN" ? fen : toPgn(game));
      setCopied({ what, ok: true });
    } catch {
      setCopied({ what, ok: false });
    }
    setTimeout(() => setCopied(undefined), 2000);
  };
  const copyLabel = (what: "FEN" | "PGN") =>
    copied?.what === what ? (copied.ok ? "Copied" : "Copy failed") : `Copy ${what}`;

  /** A new game on the board: nothing picked, no promotion waiting, no old error. */
  const replaceGame = (next: Game, at: number, title?: string) => {
    if (useSettings.getState().sounds) void playBoardSound("start");
    setGame(next);
    setCursor(at);
    setSelected(undefined);
    setPromotion(undefined);
    setSetupError(undefined);
    setFiledAs(title);
  };

  // A card from the Library: the game from the server, read by chess.js, from its first move.
  useEffect(() => {
    if (!gameId) return;
    let live = true;
    games
      .get(gameId)
      .then((g) => {
        if (!live) return;
        const result = load(g.pgn);
        if (!result.ok) {
          setSetupError(`This game could not be opened: ${result.error}`);
          return;
        }
        replaceGame(result.game, 0, `${g.white} – ${g.black}${g.opening ? ` · ${g.opening}` : ""}`);
      })
      .catch((e: unknown) => live && setSetupError(`This game could not be opened: ${describeError(toApiError(e))}`));
    return () => {
      live = false;
    };
    // replaceGame only sets state; the game to open is the id.
  }, [gameId]);

  useEffect(() => {
    const [db, id] = (top ?? "").split(":");
    if ((db !== "masters" && db !== "lichess") || !id) return;
    let live = true;
    explorer
      .gamePgn(db, id)
      .then((pgn) => {
        if (!live) return;
        const result = load(pgn);
        if (!result.ok) {
          setSetupError(`This game could not be opened: ${result.error}`);
          return;
        }
        const h = result.game.headers;
        replaceGame(result.game, 0, h.White && h.Black ? `${h.White} – ${h.Black}` : undefined);
      })
      .catch((e: unknown) => live && setSetupError(`This game could not be opened: ${describeError(toApiError(e))}`));
    return () => {
      live = false;
    };
  }, [top]);

  /** Turning the engine back on searches afresh, never shows the last answer as if new. */
  const setEngine = (on: boolean) => {
    if (on && !engineOn) setAttempt((n) => n + 1);
    setEngineOn(on);
  };

  /** A top game from the explorer, opened at the position being explored. */
  const openTopGame = (db: ExplorerDb, g: TopGame) => {
    const here = positionKey(fen);
    explorer
      .gamePgn(db, g.id)
      .then((pgn) => {
        const result = load(pgn);
        if (!result.ok) {
          setSetupError(`This game could not be opened: ${result.error}`);
          return;
        }
        let at = 0;
        for (let i = 0; i <= result.game.plies.length; i++) {
          if (positionKey(fenAt(result.game, i)) === here) {
            at = i;
            break;
          }
        }
        replaceGame(result.game, at, `${g.white.name} – ${g.black.name}${g.year ? ` · ${g.year}` : ""}`);
      })
      .catch((e: unknown) => setSetupError(`This game could not be opened: ${describeError(toApiError(e))}`));
  };

  // The opening and its variation at the move on show: the deepest named position up to it.
  const opening = useMemo(() => (openings ? openingAt(game, cursor, openings) : undefined), [openings, game, cursor]);
  const movesCount = game.plies.length > 0 ? `${Math.ceil(game.plies.length / 2)} moves` : undefined;

  const moveLabel = last ? `${moveNumberLabel(fenAt(game, cursor - 1))} ${last.san}` : "Start position";
  const engineName =
    engine.status === "done" ? `${engine.result.engine.name} ${engine.result.engine.version}` : "Stockfish";
  const status = engine.status === "off" ? "off" : engine.status === "done" ? "done" : "thinking";

  return (
    <>
      <Masthead
        kicker="Analyze"
        title="Analysis"
        dateline={[
          `${edition} edition`,
          editionDate(new Date()),
          filedAs ?? `Server engine · ${engineName}`,
          moveLabel,
        ]}
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
                    onClick={() => setEngine(s !== "off")}
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
          </>
        }
      />

      <div className="grid gap-y-8 py-6 [grid-template-areas:'moves_board_engine'] grid-cols-[17rem_minmax(0,1fr)_19rem] max-[1279px]:grid-cols-[minmax(0,1fr)_18rem] max-[1279px]:[grid-template-areas:'board_engine''board_moves']">
        <section
          aria-label="Moves"
          className="border-rule pr-5 [grid-area:moves] max-[1279px]:border-l max-[1279px]:pr-0 max-[1279px]:pl-6"
        >
          <Kicker aside={[opening?.eco, movesCount].filter(Boolean).join(" · ") || undefined}>Moves</Kicker>
          {opening ? (
            <div
              className="mb-3 border-b border-rule pt-1 pb-3"
              aria-live="polite"
              aria-label={`Opening: ${opening.name}`}
            >
              <p className="font-masthead text-[length:var(--text-xl)] leading-tight font-bold text-ink">
                {opening.family}
              </p>
              {opening.variation ? (
                <p className="mt-0.5 font-body text-[length:var(--text-md)] leading-snug text-ink-2 italic">
                  {opening.variation}
                </p>
              ) : null}
            </div>
          ) : null}
          <ScoreSheet game={game} cursor={cursor} onGo={go} />
          <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Export">
            <Button onClick={() => void copy("FEN")} title="The position on the board, to paste anywhere">
              {copyLabel("FEN")}
            </Button>
            <Button
              onClick={() => void copy("PGN")}
              disabled={game.plies.length === 0}
              title="The whole game with its moves"
            >
              {copyLabel("PGN")}
            </Button>
          </div>

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
            <p className="mt-1 font-body text-[length:var(--text-xs)] text-ink-2">
              Comments are kept; side lines are not.
            </p>
            <div className="mt-2 flex gap-1">
              <Button onClick={loadSetup}>Load</Button>
              <Button variant="ghost" className="whitespace-nowrap" onClick={() => replaceGame(newGame(), 0)}>
                New board
              </Button>
            </div>
          </div>
        </section>

        <section
          aria-label="Board"
          className="border-rule px-6 [grid-area:board] min-[1280px]:border-x max-[1279px]:pr-6 max-[1279px]:pl-0"
        >
          <div className="mx-auto flex w-full max-w-[min(100%,calc(100vh-14rem))] items-stretch gap-3">
            <EvalBar
              score={lines[0]?.score}
              wdl={lines[0]?.wdl}
              depth={lines[0]?.depth}
              flipped={flipped}
              result={result}
            />
            <div className="min-w-0 flex-1">
              <ThemedBoard
                fen={fen}
                orientation={flipped ? "black" : "white"}
                onMove={(from, to, gesture) => tryMove(from, to, undefined, gesture)}
                lastMove={last ? { from: last.from, to: last.to } : undefined}
                check={check}
                selected={selected}
                targets={targets}
                onPick={setSelected}
                arrows={over ? [] : arrows}
                label={`Board, ${sideToMove(fen) === "w" ? "White" : "Black"} to move${check ? ", in check" : ""}`}
              />
            </div>
          </div>

          {promotion ? (
            <div
              role="dialog"
              aria-label="Promote the pawn"
              className="mx-auto mt-4 flex max-w-[min(100%,calc(100vh-14rem))] items-center gap-2"
            >
              <span className="label mr-2 text-ink-2">Promote to</span>
              {PROMOTIONS.map(([piece, name]) => (
                <Button
                  key={piece}
                  onClick={() => tryMove(promotion.from, promotion.to, piece)}
                  autoFocus={piece === "q"}
                >
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
              <button
                type="button"
                className={navButton}
                onClick={() => go(0)}
                disabled={cursor === 0}
                aria-label="First move"
                aria-keyshortcuts="Home"
              >
                <ChevronFirst aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className={navButton}
                onClick={() => go(cursor - 1)}
                disabled={cursor === 0}
                aria-label="Previous move"
                aria-keyshortcuts="ArrowLeft"
              >
                <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className={navButton}
                onClick={() => go(cursor + 1)}
                disabled={cursor === game.plies.length}
                aria-label="Next move"
                aria-keyshortcuts="ArrowRight"
              >
                <ChevronRight aria-hidden size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className={navButton}
                onClick={() => go(game.plies.length)}
                disabled={cursor === game.plies.length}
                aria-label="Last move"
                aria-keyshortcuts="End"
              >
                <ChevronLast aria-hidden size={18} strokeWidth={1.5} />
              </button>
            </div>
            <span className="numeric text-[length:var(--text-md)] text-ink-2">{moveLabel}</span>
          </div>
        </section>

        <aside className="pl-5 [grid-area:engine] max-[1279px]:border-l max-[1279px]:border-rule">
          {/* Engine and Explorer, as tabs (board explorer-panel.png); the engine keeps searching either way. */}
          <div role="tablist" aria-label="Engine or explorer" className="mb-4 flex gap-6 border-b border-rule">
            {(
              [
                ["engine", "Engine"],
                ["explorer", "Explorer"],
              ] as const
            ).map(([value, name]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`label -mb-px border-b-2 pb-2 ${tab === value ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === "engine" ? (
            <EngineColumn
              state={engine}
              fen={fen}
              over={over}
              onRetry={() => setAttempt((n) => n + 1)}
              onTurnOn={() => setEngine(true)}
              onPlay={playLine}
            />
          ) : (
            <ExplorerPanel fen={fen} onPlay={(uci) => playLine([uci])} onOpenGame={openTopGame} />
          )}
        </aside>
      </div>
    </>
  );
}
