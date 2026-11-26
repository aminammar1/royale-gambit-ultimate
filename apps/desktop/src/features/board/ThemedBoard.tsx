import { useMemo, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import { useSettings, type BoardDisplay } from "../../db/settings";
import { ArrowLayer } from "./ArrowLayer";
import { piecesFor } from "./pieces";

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
const ring = (square: string) =>
  `radial-gradient(circle, transparent 0 74%, ${mark(square, 38)} 75% 92%, transparent 93%)`;

const notation: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 500 };

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
  const pieceSet = useSettings((s) => s.pieces);
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
    if (check)
      add(check, "radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)");
    return Object.fromEntries([...layers].map(([square, list]) => [square, layered(square, list)]));
  }, [lastMove, check, selected, targets, show.lastMove, show.legalMoves]);

  return (
    <div role="group" aria-label={label} className="relative border border-ink">
      <Chessboard
        options={{
          id,
          position: fen,
          boardOrientation: orientation,
          pieces: piecesFor(pieceSet),
          lightSquareStyle: { backgroundColor: "var(--board-light)", backgroundImage: "var(--board-light-image)" },
          darkSquareStyle: { backgroundColor: "var(--board-dark)", backgroundImage: "var(--board-dark-image)" },
          squareStyles,
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
      {show.arrows ? <ArrowLayer arrows={arrows} flipped={orientation === "black"} /> : null}
    </div>
  );
}
