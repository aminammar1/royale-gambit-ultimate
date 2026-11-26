import { useMemo, type CSSProperties } from "react";
import { Chessboard, defaultPieces, type PieceRenderObject } from "react-chessboard";
import { useSettings, type BoardDisplay } from "../../db/settings";

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
const ring = (square: string) => `radial-gradient(circle, transparent 0 74%, ${mark(square, 38)} 75% 92%, transparent 93%)`;

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

const notation: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 500 };

/**
 * The placeholder pieces with the theme's outline: on Newspaper a paper line around every piece,
 * so a black piece stays readable on a black square, as the print silhouettes on the board do.
 * Amine's print set replaces them (ADR-04).
 */
const outlinedPieces: PieceRenderObject = Object.fromEntries(
  Object.entries(defaultPieces).map(([name, render]) => [
    name,
    (props?: Parameters<typeof render>[0]) =>
      render({ ...props, svgStyle: { ...props?.svgStyle, filter: "var(--board-piece-filter)" } }),
  ]),
);

/**
 * The board in the chosen theme (Board & pieces): coordinates in the corners, the last move and
 * the picked piece tinted, legal moves as dots and captures as rings, check as a red glow, engine
 * arrows (the best line stronger). Each can be switched off in Board & pieces. Only the side to
 * move can pick up a piece.
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
  display,
  id = "board",
  label,
}: Props) {
  const saved = useSettings((s) => s.display);
  const show = display ?? saved;
  const theme = useSettings((s) => s.boardTheme);
  const toMove = fen.split(" ")[1] === "b" ? "b" : "w";

  const squareStyles = useMemo(() => {
    const layers = new Map<string, string[]>();
    const add = (square: string, layer: string) => layers.set(square, [layer, ...(layers.get(square) ?? [])]);
    if (show.lastMove && lastMove) {
      add(lastMove.from, tint(lastMove.from, 18));
      add(lastMove.to, tint(lastMove.to, 18));
    }
    if (selected) add(selected, tint(selected, 30));
    if (show.legalMoves) for (const t of targets) add(t.square, t.capture ? ring(t.square) : dot(t.square));
    if (check) add(check, "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)");
    return Object.fromEntries([...layers].map(([square, list]) => [square, layered(square, list)]));
  }, [lastMove, check, selected, targets, show.lastMove, show.legalMoves]);

  const boardArrows = useMemo(
    () =>
      show.arrows
        ? arrows.map((a) => ({
            startSquare: a.from,
            endSquare: a.to,
            color: tokenColor("--board-arrow", a.best ? 0.85 : 0.4),
          }))
        : [],
    // The theme changes the arrow colour token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arrows, show.arrows, theme],
  );

  return (
    <div role="group" aria-label={label} className="border border-ink">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          pieces: outlinedPieces,
          lightSquareStyle: { backgroundColor: "var(--board-light)", backgroundImage: "var(--board-light-image)" },
          darkSquareStyle: { backgroundColor: "var(--board-dark)", backgroundImage: "var(--board-dark-image)" },
          squareStyles,
          arrows: boardArrows,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          showNotation: show.coordinates,
          lightSquareNotationStyle: { ...notation, color: "var(--board-coord-light)" },
          darkSquareNotationStyle: { ...notation, color: "var(--board-coord-dark)" },
          canDragPiece: ({ piece }) => piece.pieceType[0] === toMove,
          onPieceDrag: ({ square }) => onPick?.(square ?? undefined),
          onPieceDragCancel: () => onPick?.(undefined),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (targetSquare) return onMove(sourceSquare, targetSquare);
            onPick?.(undefined); // dropped off the board: the piece goes back, the pick ends
            return false;
          },
          onSquareClick: ({ square }) => onSquareClick?.(square),
        }}
      />
    </div>
  );
}
