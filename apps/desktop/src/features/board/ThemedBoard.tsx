import { useMemo, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";

export type BoardArrow = { from: string; to: string; best: boolean };

type Props = {
  fen: string;
  orientation: "white" | "black";
  /** A move from the player: return true when it was played. */
  onMove: (from: string, to: string) => boolean;
  /** Squares of the last move played, for the highlight. */
  lastMove?: { from: string; to: string };
  /** The king's square when the side to move is in check. */
  check?: string;
  /** The square picked for click-to-move. */
  selected?: string;
  onSquareClick?: (square: string) => void;
  arrows?: readonly BoardArrow[];
  label: string;
};

// The board keeps the Day colours in both editions (DESIGN.md), so it draws from the board
// tokens, never from --ink, which turns near-white at night.
const HATCH = "repeating-linear-gradient(to bottom, transparent 0 3px, color-mix(in srgb, var(--board-dark) 9%, transparent) 3px 4px)";
const light: CSSProperties = { backgroundColor: "var(--board-light)", backgroundImage: HATCH };
const dark: CSSProperties = { backgroundColor: "var(--board-dark)" };
const isLight = (square: string) => (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;

/** A square's own colour with a tint laid over it, keeping the hatch on light squares. */
function tinted(square: string, tint: string): CSSProperties {
  const layer = `linear-gradient(${tint}, ${tint})`;
  return isLight(square)
    ? { backgroundColor: "var(--board-light)", backgroundImage: `${layer}, ${HATCH}` }
    : { backgroundColor: "var(--board-dark)", backgroundImage: layer };
}

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
 * The Newsprint board (board "Part · playable board"): ink-black dark squares, hatched paper
 * light squares, coordinates in the corners, last move at 12% ink, check as a red glow. Engine
 * arrows: the best line in --board-arrow, the others in --board-arrow-2 (the Day --ink-2 and --rule,
 * fixed like the board: ink at 70% vanished on the black squares). Placeholder pieces until Amine's
 * print set arrives (ADR-04).
 */
export function ThemedBoard({ fen, orientation, onMove, lastMove, check, selected, onSquareClick, arrows = [], label }: Props) {
  const squareStyles = useMemo(() => {
    const s: Record<string, CSSProperties> = {};
    const ink12 = "color-mix(in srgb, var(--board-dark) 12%, transparent)";
    if (lastMove) {
      s[lastMove.from] = tinted(lastMove.from, ink12);
      s[lastMove.to] = tinted(lastMove.to, ink12);
    }
    if (selected) s[selected] = tinted(selected, "color-mix(in srgb, var(--board-dark) 22%, transparent)");
    if (check) {
      s[check] = {
        ...tinted(check, "transparent"),
        backgroundImage: `radial-gradient(circle, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 70%)${
          isLight(check) ? `, ${HATCH}` : ""
        }`,
      };
    }
    return s;
  }, [lastMove, check, selected]);

  const boardArrows = useMemo(
    () =>
      arrows.map((a) => ({
        startSquare: a.from,
        endSquare: a.to,
        // Mid-tone inks read on both square colours; ink itself vanishes on the black squares.
        color: a.best ? tokenColor("--board-arrow", 0.9) : tokenColor("--board-arrow-2", 0.85),
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
          lightSquareNotationStyle: { ...notation, color: "var(--board-dark)" },
          darkSquareNotationStyle: { ...notation, color: "var(--board-light)" },
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? onMove(sourceSquare, targetSquare) : false,
          onSquareClick: ({ square }) => onSquareClick?.(square),
        }}
      />
    </div>
  );
}
