import { useMemo, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";

export type BoardArrow = { from: string; to: string; best: boolean };
/** A square the picked piece can go to; a capture is drawn as a ring, a quiet move as a dot. */
export type BoardTarget = { square: string; capture: boolean };

type Props = {
  fen: string;
  orientation: "white" | "black";
  /** A move from the player: return true when it was played. */
  onMove: (from: string, to: string) => boolean;
  /** Squares of the last move played, for the highlight. */
  lastMove?: { from: string; to: string };
  /** The king's square when the side to move is in check. */
  check?: string;
  /** The square of the picked piece (click or drag). */
  selected?: string;
  /** Where the picked piece can go. */
  targets?: readonly BoardTarget[];
  onSquareClick?: (square: string) => void;
  /** A drag starts on `square`, or ends without a move (undefined). */
  onPick?: (square: string | undefined) => void;
  arrows?: readonly BoardArrow[];
  label: string;
};

// The board keeps its colours in both editions (DESIGN.md). Everything printed on it uses the
// board's own ink, never --ink, which turns near-white at night.
const ink = (percent: number) => `color-mix(in srgb, var(--board-ink) ${percent}%, transparent)`;
const HATCH = `repeating-linear-gradient(to bottom, transparent 0 3px, ${ink(9)} 3px 4px)`;
const light: CSSProperties = { backgroundColor: "var(--board-light)", backgroundImage: HATCH };
const dark: CSSProperties = { backgroundColor: "var(--board-dark)" };
const isLight = (square: string) => (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;

/** A square's own colour with layers on top, keeping the hatch on light squares. */
function layered(square: string, ...layers: string[]): CSSProperties {
  return isLight(square)
    ? { backgroundColor: "var(--board-light)", backgroundImage: [...layers, HATCH].join(", ") }
    : { backgroundColor: "var(--board-dark)", backgroundImage: layers.join(", ") || "none" };
}
const tint = (percent: number) => `linear-gradient(${ink(percent)}, ${ink(percent)})`;
const DOT = `radial-gradient(circle, ${ink(30)} 0 16%, transparent 17%)`;
const RING = `radial-gradient(circle, transparent 0 74%, ${ink(30)} 75% 92%, transparent 93%)`;

/**
 * A token as an rgba() string. The board draws arrows with SVG fill/stroke attributes, where
 * var() does not resolve, so the colour is read from the token instead of written here.
 */
function tokenColor(token: string, alpha: number): string {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex, 16);
  if (Number.isNaN(n)) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const notation: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  fontWeight: 500,
};

/**
 * The Newsprint board: printer's grey dark squares, hatched paper light squares, coordinates in
 * the corners. Last move and the picked piece tinted in board ink; legal moves as dots, captures
 * as rings; check as a red glow; engine arrows in board ink (the best line darker). Only the side
 * to move can pick up a piece. Placeholder pieces until Amine's print set arrives (ADR-04).
 */
export function ThemedBoard({
  fen,
  orientation,
  onMove,
  lastMove,
  check,
  selected,
  targets = [],
  onSquareClick,
  onPick,
  arrows = [],
  label,
}: Props) {
  const toMove = fen.split(" ")[1] === "b" ? "b" : "w";
  const squareStyles = useMemo(() => {
    // Layers per square, the first painted on top: marks above tints.
    const layers = new Map<string, string[]>();
    const add = (square: string, layer: string) => layers.set(square, [layer, ...(layers.get(square) ?? [])]);
    if (lastMove) {
      add(lastMove.from, tint(14));
      add(lastMove.to, tint(14));
    }
    if (selected) add(selected, tint(26));
    for (const t of targets) add(t.square, t.capture ? RING : DOT);
    if (check) add(check, "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)");
    return Object.fromEntries([...layers].map(([square, list]) => [square, layered(square, ...list)]));
  }, [lastMove, check, selected, targets]);

  const boardArrows = useMemo(
    () =>
      arrows.map((a) => ({
        startSquare: a.from,
        endSquare: a.to,
        color: tokenColor("--board-ink", a.best ? 0.75 : 0.35),
      })),
    [arrows],
  );

  return (
    <div role="group" aria-label={label} className="border border-ink">
      <Chessboard
        options={{
          id: "analysis-board",
          position: fen,
          boardOrientation: orientation,
          lightSquareStyle: light,
          darkSquareStyle: dark,
          squareStyles,
          arrows: boardArrows,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          lightSquareNotationStyle: { ...notation, color: "var(--board-ink)" },
          darkSquareNotationStyle: { ...notation, color: "var(--board-light)" },
          canDragPiece: ({ piece }) => piece.pieceType[0] === toMove,
          onPieceDrag: ({ square }) => onPick?.(square ?? undefined),
          onPieceDragCancel: () => onPick?.(undefined),
          onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? onMove(sourceSquare, targetSquare) : false),
          onSquareClick: ({ square }) => onSquareClick?.(square),
        }}
      />
    </div>
  );
}
