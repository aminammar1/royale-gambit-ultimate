import type { BoardArrow } from "./ThemedBoard";

/** The centre of `square` on a 0–8 grid, White at the bottom unless the board is flipped. */
function centre(square: string, flipped: boolean): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return flipped ? { x: 7 - file + 0.5, y: rank + 0.5 } : { x: file + 0.5, y: 7 - rank + 0.5 };
}

/**
 * The engine's arrows, drawn here rather than by react-chessboard, so they are rebuilt from the
 * current lines on every render and none can outlive its position (Amine saw a stale one).
 * Straight shafts with a printed arrowhead, the best line stronger; never above 3 arrows.
 */
export function ArrowLayer({ arrows, flipped }: { arrows: readonly BoardArrow[]; flipped: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      className="pointer-events-none absolute inset-0 z-20 size-full"
      style={{ overflow: "visible" }}
    >
      {arrows.map((a) => {
        const from = centre(a.from, flipped);
        const to = centre(a.to, flipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return null;
        const ux = dx / length;
        const uy = dy / length;
        const head = 0.38;
        const width = a.best ? 0.16 : 0.11;
        // Start off the piece's centre, stop where the head begins.
        const sx = from.x + ux * 0.2;
        const sy = from.y + uy * 0.2;
        const ex = to.x - ux * 0.2;
        const ey = to.y - uy * 0.2;
        const bx = ex - ux * head;
        const by = ey - uy * head;
        const px = -uy * head * 0.62;
        const py = ux * head * 0.62;
        const colour = "var(--board-arrow)";
        const opacity = a.best ? 0.85 : 0.4;
        return (
          <g key={`${a.from}${a.to}`} opacity={opacity}>
            {/* style, not attributes: only CSS resolves var() */}
            <line x1={sx} y1={sy} x2={bx} y2={by} style={{ stroke: colour, strokeWidth: width }} />
            <polygon points={`${ex},${ey} ${bx + px},${by + py} ${bx - px},${by - py}`} style={{ fill: colour }} />
          </g>
        );
      })}
    </svg>
  );
}
