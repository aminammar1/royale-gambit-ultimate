import { useReducedMotion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import { primeBoardSounds } from "../../audio/boardSounds";
import { placement } from "../../chess/game";
import { GLIDE_MS, useSettings, type BoardDisplay, type HighlightColour } from "../../db/settings";
import { DrawingLayer } from "./DrawingLayer";
import { toggleDrawing, type Drawing } from "./drawings";
import { ArrowLayer } from "./ArrowLayer";
import { cellOf, matchPieces, squareAt, type Orientation, type Placed } from "./geometry";
import { piecesFor } from "./pieces";

export type BoardArrow = { from: string; to: string; best: boolean };
/** A square the picked piece can go to; a capture is drawn as a ring, a quiet move as a dot. */
export type BoardTarget = { square: string; capture: boolean };
/** How a move was made: a piece dragged and let go lands at once; a click glides. */
export type MoveGesture = "click" | "drop";

// Fast away, soft landing: the piece is nearly there by three quarters of the glide.
const GLIDE_EASE = "cubic-bezier(0.25, 0.8, 0.25, 1)";
const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** When a gliding piece touches down at the chosen speed, for its sound. */
export const landingMs = (): number =>
  reducedMotion() ? 0 : Math.round(GLIDE_MS[useSettings.getState().pieceSpeed] * 0.75);
// Pixels the pointer travels before a press becomes a drag.
const DRAG_START_PX = 4;
// A context menu this soon after a drawing ends is that drawing's own (Windows sends it on release).
const AFTER_DRAWING_MS = 400;

/** Pointer capture, where the engine grants it: WebKit can refuse it, and the board copes without. */
function capture(el: Element, pointerId: number, on: boolean) {
  try {
    if (on) el.setPointerCapture?.(pointerId);
    else el.releasePointerCapture?.(pointerId);
  } catch {
    // Not captured: moves outside the board are simply not seen.
  }
}

type Props = {
  fen: string;
  orientation: Orientation;
  /** A move from the player: return true when it was played. */
  onMove: (from: string, to: string, gesture: MoveGesture) => boolean;
  /** Squares of the last move played, for the highlight. */
  lastMove?: { from: string; to: string };
  /** The king's square when the side to move is in check. */
  check?: string;
  /** The square of the picked piece (click or drag). */
  selected?: string;
  /** Where the picked piece can go. */
  targets?: readonly BoardTarget[];
  /** A piece is picked on `square`, or the pick ends (undefined). */
  onPick?: (square: string | undefined) => void;
  /** False for a board only to look at: nothing is picked up. */
  interactive?: boolean;
  arrows?: readonly BoardArrow[];
  /** The board's display switches; the saved ones (Board & pieces) when left out. */
  display?: BoardDisplay;
  id?: string;
  label: string;
};

// Everything comes from the board theme's tokens (tokens.css, Board themes), which stay the same
// in both editions: square colours and patterns, the colour marks take on each kind of square,
// coordinates, arrows and the piece outline.
const isLight = (square: string) => (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;
const mark = (square: string, percent: number) =>
  `color-mix(in srgb, var(${isLight(square) ? "--board-mark-light" : "--board-mark-dark"}) ${percent}%, transparent)`;

/** A square's own colour and pattern with layers on top (the first painted on top). */
function layered(square: string, layers: string[]): CSSProperties {
  const light = isLight(square);
  return {
    backgroundColor: light ? "var(--board-light)" : "var(--board-dark)",
    backgroundImage: [...layers, light ? "var(--board-light-image)" : "var(--board-dark-image)"].join(", "),
  };
}
const tint = (square: string, percent: number) => `linear-gradient(${mark(square, percent)}, ${mark(square, percent)})`;
/** A square filled with a chosen highlight colour; Ink falls back to the theme's own mark. */
const fill = (square: string, colour: HighlightColour, percent: number, inkPercent: number) => {
  if (colour === "ink") return tint(square, inkPercent);
  const value = colour === "theme" ? "var(--board-highlight)" : `var(--board-hl-${colour})`;
  const c = `color-mix(in srgb, ${value} ${percent}%, transparent)`;
  return `linear-gradient(${c}, ${c})`;
};
const dot = (square: string) => `radial-gradient(circle, ${mark(square, 38)} 0 16%, transparent 17%)`;
const ring = (square: string) =>
  `radial-gradient(circle, transparent 0 74%, ${mark(square, 38)} 75% 92%, transparent 93%)`;

const notation: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 500, lineHeight: 1 };

let lastKey = 0;
const newKey = () => ++lastKey;

/**
 * What the board draws: the pieces under keys that follow them from position to position (so a
 * moved piece is the same element, gliding), the pieces taken in the last move fading out, and
 * which pieces land at once rather than glide (a dropped piece, everything when the board turns).
 */
type View = {
  fen: string;
  orientation: Orientation;
  placed: Placed[];
  leaving: Placed[];
  moving: ReadonlySet<number>;
  instant: "all" | ReadonlySet<number>;
  /** The square a piece was just dropped on, until the position that follows. */
  dropped?: string;
  /** The player's arrows and circles; a new position starts clean. */
  drawings: Drawing[];
};

type Drag = { from: string; piece: string; moved: boolean };

/**
 * The board in the chosen theme (Board & pieces), drawn by the app rather than a library so moves
 * feel like a chess site's: press a piece and it is picked (dots appear at once), drag it and it
 * follows the pointer frame by frame while the square beneath is outlined, let go and it lands;
 * click a dot and it glides there, the taken piece fading as it arrives. Coordinates in the
 * corners, the last move and the picked piece tinted, check as a red glow, engine arrows. Only the
 * side to move can pick up a piece. The right button draws arrows and circles (a left press wipes them); right-click drops the pick.
 */
export function ThemedBoard({
  fen,
  orientation,
  onMove,
  lastMove,
  check,
  selected,
  targets = [],
  onPick,
  interactive = true,
  arrows = [],
  display,
  id = "board",
  label,
}: Props) {
  const saved = useSettings((s) => s.display);
  const show = display ?? saved;
  const pieces = piecesFor(useSettings((s) => s.pieces));
  const reduce = useReducedMotion();
  const speed = useSettings((s) => s.pieceSpeed);
  const highlight = useSettings((s) => s.highlight);
  const markColour = useSettings((s) => s.markColour);
  const glideMs = reduce ? 0 : GLIDE_MS[speed];
  const toMove = fen.split(" ")[1] === "b" ? "b" : "w";

  const [view, setView] = useState<View>(() => ({
    fen,
    orientation,
    placed: placement(fen).map((p) => ({ ...p, key: newKey() })),
    leaving: [],
    moving: new Set(),
    instant: "all",
    drawings: [],
  }));
  // A new position (or a turned board): match its pieces to the last ones while rendering, so
  // the moved piece's own element takes its new square and the browser glides it there.
  if (view.fen !== fen || view.orientation !== orientation) {
    const turned = view.orientation !== orientation;
    const { placed, leaving } = matchPieces(view.placed, placement(fen), newKey);
    const before = new Map(view.placed.map((p) => [p.key, p.square]));
    const moving = new Set(placed.filter((p) => before.has(p.key) && before.get(p.key) !== p.square).map((p) => p.key));
    const dropped = placed.find((p) => p.square === view.dropped)?.key;
    const instant = turned || glideMs === 0 ? "all" : new Set(dropped === undefined ? [] : [dropped]);
    setView({
      fen,
      orientation,
      placed,
      // A dropped capture is gone at once; a glided one fades as the taker arrives.
      leaving: instant === "all" || dropped !== undefined ? [] : leaving,
      moving,
      instant,
      // Arrows belong to the position they were drawn on; turning the board keeps them.
      drawings: turned && view.fen === fen ? view.drawings : [],
    });
  }

  const boardRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, startX: 0, startY: 0, size: 1, wasSelected: false });
  const [drag, setDrag] = useState<Drag>();
  const [hover, setHover] = useState<string>();
  // Where a right-button arrow started, while the button is held (the ref for the window listeners).
  const [drawFrom, setDrawFrom] = useState<string>();
  const drawEndedAt = useRef(0);

  useEffect(() => {
    if (interactive) primeBoardSounds();
  }, [interactive]);

  // The dragged piece follows the pointer without React: its position is written straight to it.
  const placeFloat = () => {
    const el = floatRef.current;
    if (!el) return;
    const { x, y, size } = pointer.current;
    el.style.transform = `translate(${x - size / 16}px, ${y - size / 16}px)`;
  };
  useLayoutEffect(() => {
    if (drag?.moved) placeFloat();
  }, [drag?.moved]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const x = event.clientX - (rect?.left ?? 0);
    const y = event.clientY - (rect?.top ?? 0);
    const size = rect?.width || 1;
    return { x, y, size, square: squareAt(x, y, size, orientation) };
  };

  // The right button draws. Mouse events, not pointer events, and the end is watched on the
  // window: WebKit (the Tauri window) opens its context menu on the press, may send no pointer
  // events for the right button, and may never send the release; so a press is also read from
  // the context-menu event, and a move with no button held ends the drawing where it is.
  const startDrawing = (event: ReactMouseEvent) => {
    if (!interactive) return;
    const { square } = local(event);
    if (!square) return;
    onPick?.(undefined);
    setDrawFrom(square);
  };
  useEffect(() => {
    if (!drawFrom) return;
    const finish = (event: MouseEvent) => {
      const to = local(event).square;
      drawEndedAt.current = performance.now();
      setDrawFrom(undefined);
      if (to) setView((v) => ({ ...v, drawings: toggleDrawing(v.drawings, { from: drawFrom, to }) }));
    };
    const onMove = (event: MouseEvent) => {
      if ((event.buttons & 2) === 0) finish(event);
      else setHover(local(event).square);
    };
    const onUp = (event: MouseEvent) => {
      if (event.button === 2) finish(event);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // `local` reads the board's box and orientation when the event comes; a new drawing re-binds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawFrom]);
  const pieceOn = (square: string | undefined) => view.placed.find((p) => p.square === square)?.piece;
  const isTarget = (square: string | undefined) => targets.some((t) => t.square === square);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    // The right button draws (onMouseDown below); only the left one picks and plays.
    if (event.button !== 0) return;
    const { x, y, size, square } = local(event);
    // A left press wipes the drawings, as on chess sites.
    if (view.drawings.length > 0) setView((v) => ({ ...v, drawings: [] }));
    if (!square) return;
    if (selected && isTarget(square)) {
      onMove(selected, square, "click");
      return;
    }
    const piece = pieceOn(square);
    if (!piece || piece[0] !== toMove) {
      onPick?.(undefined);
      return;
    }
    capture(event.currentTarget, event.pointerId, true);
    pointer.current = { x, y, startX: x, startY: y, size, wasSelected: selected === square };
    setDrag({ from: square, piece, moved: false });
    if (selected !== square) onPick?.(square);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const { x, y, square } = local(event);
    if (square !== hover) setHover(square);
    if (!drag) return;
    pointer.current.x = x;
    pointer.current.y = y;
    if (drag.moved) placeFloat();
    else if (Math.hypot(x - pointer.current.startX, y - pointer.current.startY) > DRAG_START_PX)
      setDrag({ ...drag, moved: true });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    capture(event.currentTarget, event.pointerId, false);
    const { square } = local(event);
    setDrag(undefined);
    if (!drag.moved) {
      // A press without a drag on the piece already picked puts it down again.
      if (pointer.current.wasSelected) onPick?.(undefined);
      return;
    }
    // Let go on its own square or off the board: it goes back and stays picked.
    if (!square || square === drag.from) return;
    setView((v) => ({ ...v, dropped: square }));
    if (!onMove(drag.from, square, "drop")) setView((v) => ({ ...v, dropped: undefined }));
  };

  const dragging = drag?.moved ? drag : undefined;

  const squareStyles = useMemo(() => {
    const layers = new Map<string, string[]>();
    const add = (square: string, layer: string) => layers.set(square, [layer, ...(layers.get(square) ?? [])]);
    if (show.lastMove && lastMove) {
      add(lastMove.from, fill(lastMove.from, highlight, 50, 18));
      add(lastMove.to, fill(lastMove.to, highlight, 50, 18));
    }
    if (selected) add(selected, fill(selected, highlight, 72, 30));
    // Squares marked with the right button, filled whole, as on chess sites.
    for (const d of view.drawings) if (d.from === d.to) add(d.from, fill(d.from, markColour, 80, 45));
    if (show.legalMoves) for (const t of targets) add(t.square, t.capture ? ring(t.square) : dot(t.square));
    // The square a click would play to, under the pointer.
    if (selected && !dragging && hover && targets.some((t) => t.square === hover)) add(hover, tint(hover, 24));
    if (check)
      add(check, "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)");
    return layers;
  }, [
    lastMove,
    check,
    selected,
    targets,
    hover,
    dragging,
    show.lastMove,
    show.legalMoves,
    highlight,
    markColour,
    view.drawings,
  ]);

  const cells = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        return { col, row, square: squareAt(col + 0.5, row + 0.5, 8, orientation) ?? "a1" };
      }),
    [orientation],
  );

  const marked = new Set(view.drawings.filter((d) => d.from === d.to).map((d) => d.from));

  const cursorFor = (square: string) => {
    if (!interactive) return undefined;
    if (selected && isTarget(square)) return "pointer";
    return pieceOn(square)?.[0] === toMove ? "grab" : undefined;
  };

  const glide = glideMs === 0 ? "none" : `transform ${glideMs}ms ${GLIDE_EASE}`;
  const pieceStyle = (p: Placed): CSSProperties => {
    const { col, row } = cellOf(p.square, orientation);
    const instant = view.instant === "all" || view.instant.has(p.key);
    return {
      transform: `translate(${col * 100}%, ${row * 100}%)`,
      transition: instant ? "none" : glide,
      // Rows nearer the player stand in front (3D sets rise over the square behind); a moving
      // piece passes over the rest.
      zIndex: view.moving.has(p.key) ? 30 : row + 1,
      opacity: dragging?.from === p.square ? 0.3 : 1,
    };
  };
  const hoverOutline = dragging && hover ? cellOf(hover, orientation) : undefined;

  return (
    <div className="relative border border-ink">
      <div
        ref={boardRef}
        id={id}
        role="group"
        aria-label={label}
        className="relative aspect-square w-full touch-none select-none"
        style={{ cursor: dragging ? "grabbing" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(undefined)}
        onMouseDown={(event) => {
          if (event.button === 2) startDrawing(event);
        }}
        onPointerLeave={() => setHover(undefined)}
        onContextMenu={(event) => {
          event.preventDefault();
          // WebKit may send only this for a right press; Windows sends it after the release.
          if (!drawFrom && performance.now() - drawEndedAt.current > AFTER_DRAWING_MS) startDrawing(event);
        }}
      >
        <div className="grid size-full grid-cols-8 grid-rows-8">
          {cells.map(({ col, row, square }) => (
            <div
              key={square}
              data-square={square}
              data-marked={marked.has(square) || undefined}
              className="relative"
              style={{ ...layered(square, squareStyles.get(square) ?? []), cursor: cursorFor(square) }}
            >
              {show.coordinates && col === 0 ? (
                <span
                  className="absolute top-[4%] left-[5%]"
                  style={{
                    ...notation,
                    color: `var(${isLight(square) ? "--board-coord-light" : "--board-coord-dark"})`,
                  }}
                >
                  {square[1]}
                </span>
              ) : null}
              {show.coordinates && row === 7 ? (
                <span
                  className="absolute right-[5%] bottom-[4%]"
                  style={{
                    ...notation,
                    color: `var(${isLight(square) ? "--board-coord-light" : "--board-coord-dark"})`,
                  }}
                >
                  {square[0]}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        {/* The theme's material over the squares (wood grain), under the pieces. */}
        <div aria-hidden className="board-texture pointer-events-none absolute inset-0" />

        {/* While dragging, the square beneath the piece is outlined, as on chess sites. */}
        {hoverOutline && hover ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-[35] size-[12.5%]"
            style={{
              transform: `translate(${hoverOutline.col * 100}%, ${hoverOutline.row * 100}%)`,
              border: `0.25rem solid ${mark(hover, 55)}`,
            }}
          />
        ) : null}

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {view.leaving.map((p) => (
            <div
              key={p.key}
              data-leaving={p.piece}
              className="absolute top-0 left-0 size-[12.5%]"
              style={{
                transform: `translate(${cellOf(p.square, orientation).col * 100}%, ${cellOf(p.square, orientation).row * 100}%)`,
                animation: `piece-leave ${glideMs}ms linear forwards`,
                zIndex: 20,
              }}
              onAnimationEnd={() => setView((v) => ({ ...v, leaving: v.leaving.filter((l) => l.key !== p.key) }))}
            >
              {pieces[p.piece]?.()}
            </div>
          ))}
          {view.placed.map((p) => (
            <div key={p.key} data-piece={p.piece} className="absolute top-0 left-0 size-[12.5%]" style={pieceStyle(p)}>
              {pieces[p.piece]?.()}
            </div>
          ))}
        </div>

        {dragging ? (
          <div ref={floatRef} aria-hidden className="pointer-events-none absolute top-0 left-0 z-40 size-[12.5%]">
            {/* Lifted a little: a touch larger than on its square. */}
            <div className="size-full scale-[1.06]">{pieces[dragging.piece]?.()}</div>
          </div>
        ) : null}

        {/* Keyed by position: each position gets a fresh layer, so nothing drawn for the last one stays. */}
        {show.arrows ? <ArrowLayer key={fen} arrows={arrows} flipped={orientation === "black"} /> : null}
        <DrawingLayer
          drawings={view.drawings.filter((d) => d.from !== d.to)}
          pending={drawFrom && hover && hover !== drawFrom ? { from: drawFrom, to: hover } : undefined}
          flipped={orientation === "black"}
        />
      </div>
    </div>
  );
}
