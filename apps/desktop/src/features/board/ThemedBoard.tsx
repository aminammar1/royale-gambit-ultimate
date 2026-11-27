import { useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { primeBoardSounds } from "../../audio/boardSounds";
import { placement } from "../../chess/game";
import { useSettings, type BoardDisplay } from "../../db/settings";
import { ArrowLayer } from "./ArrowLayer";
import { cellOf, matchPieces, squareAt, type Orientation, type Placed } from "./geometry";
import { piecesFor } from "./pieces";

export type BoardArrow = { from: string; to: string; best: boolean };
/** A square the picked piece can go to; a capture is drawn as a ring, a quiet move as a dot. */
export type BoardTarget = { square: string; capture: boolean };
/** How a move was made: a piece dragged and let go lands at once; a click glides. */
export type MoveGesture = "click" | "drop";

/** How long a piece glides from square to square. */
export const GLIDE_MS = 260;
// Fast away, soft landing: the piece is nearly there by two thirds of the glide.
const GLIDE_EASE = "cubic-bezier(0.25, 0.8, 0.25, 1)";
/** When a gliding piece touches down, for its sound: a little before the glide's last frame. */
export const landingMs = (): number =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : GLIDE_MS - 50;
// Pixels the pointer travels before a press becomes a drag.
const DRAG_START_PX = 4;

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
};

type Drag = { from: string; piece: string; moved: boolean };

/**
 * The board in the chosen theme (Board & pieces), drawn by the app rather than a library so moves
 * feel like a chess site's: press a piece and it is picked (dots appear at once), drag it and it
 * follows the pointer frame by frame while the square beneath is outlined, let go and it lands;
 * click a dot and it glides there, the taken piece fading as it arrives. Coordinates in the
 * corners, the last move and the picked piece tinted, check as a red glow, engine arrows. Only the
 * side to move can pick up a piece. Right-click drops the pick.
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
  const toMove = fen.split(" ")[1] === "b" ? "b" : "w";

  const [view, setView] = useState<View>(() => ({
    fen,
    orientation,
    placed: placement(fen).map((p) => ({ ...p, key: newKey() })),
    leaving: [],
    moving: new Set(),
    instant: "all",
  }));
  // A new position (or a turned board): match its pieces to the last ones while rendering, so
  // the moved piece's own element takes its new square and the browser glides it there.
  if (view.fen !== fen || view.orientation !== orientation) {
    const turned = view.orientation !== orientation;
    const { placed, leaving } = matchPieces(view.placed, placement(fen), newKey);
    const before = new Map(view.placed.map((p) => [p.key, p.square]));
    const moving = new Set(placed.filter((p) => before.has(p.key) && before.get(p.key) !== p.square).map((p) => p.key));
    const dropped = placed.find((p) => p.square === view.dropped)?.key;
    const instant = turned || reduce ? "all" : new Set(dropped === undefined ? [] : [dropped]);
    setView({
      fen,
      orientation,
      placed,
      // A dropped capture is gone at once; a glided one fades as the taker arrives.
      leaving: instant === "all" || dropped !== undefined ? [] : leaving,
      moving,
      instant,
    });
  }

  const boardRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, startX: 0, startY: 0, size: 1, wasSelected: false });
  const [drag, setDrag] = useState<Drag>();
  const [hover, setHover] = useState<string>();

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

  const local = (event: PointerEvent) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const x = event.clientX - (rect?.left ?? 0);
    const y = event.clientY - (rect?.top ?? 0);
    const size = rect?.width || 1;
    return { x, y, size, square: squareAt(x, y, size, orientation) };
  };
  const pieceOn = (square: string | undefined) => view.placed.find((p) => p.square === square)?.piece;
  const isTarget = (square: string | undefined) => targets.some((t) => t.square === square);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.button === 2) {
      onPick?.(undefined);
      return;
    }
    if (event.button !== 0) return;
    const { x, y, size, square } = local(event);
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
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
    event.currentTarget.releasePointerCapture?.(event.pointerId);
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
      add(lastMove.from, tint(lastMove.from, 18));
      add(lastMove.to, tint(lastMove.to, 18));
    }
    if (selected) add(selected, tint(selected, 30));
    if (show.legalMoves) for (const t of targets) add(t.square, t.capture ? ring(t.square) : dot(t.square));
    // The square a click would play to, under the pointer.
    if (selected && !dragging && hover && targets.some((t) => t.square === hover)) add(hover, tint(hover, 24));
    if (check)
      add(check, "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)");
    return layers;
  }, [lastMove, check, selected, targets, hover, dragging, show.lastMove, show.legalMoves]);

  const cells = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        return { col, row, square: squareAt(col + 0.5, row + 0.5, 8, orientation) ?? "a1" };
      }),
    [orientation],
  );

  const cursorFor = (square: string) => {
    if (!interactive) return undefined;
    if (selected && isTarget(square)) return "pointer";
    return pieceOn(square)?.[0] === toMove ? "grab" : undefined;
  };

  const glide = reduce ? "none" : `transform ${GLIDE_MS}ms ${GLIDE_EASE}`;
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
        onPointerLeave={() => setHover(undefined)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="grid size-full grid-cols-8 grid-rows-8">
          {cells.map(({ col, row, square }) => (
            <div
              key={square}
              data-square={square}
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
                animation: `piece-leave ${GLIDE_MS}ms linear forwards`,
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
      </div>
    </div>
  );
}
