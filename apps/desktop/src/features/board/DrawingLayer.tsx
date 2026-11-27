import { centre } from "./ArrowLayer";
import { elbowOf, type Drawing } from "./drawings";

const INK = "var(--board-ink)";
// A paper casing round the ink, as arrows are printed on a book's diagrams: it reads on every
// square and never looks like the engine's flat arrows.
const CASING = "var(--board-light)";

function Arrow({ d, flipped }: { d: Drawing; flipped: boolean }) {
  const elbow = elbowOf(d.from, d.to);
  const from = centre(d.from, flipped);
  const to = centre(d.to, flipped);
  const turn = elbow ? centre(elbow, flipped) : undefined;
  // The last leg sets the head's direction; the first leg starts off the piece's centre.
  const last = turn ?? from;
  const lx = to.x - last.x;
  const ly = to.y - last.y;
  const ll = Math.hypot(lx, ly);
  const first = turn ?? to;
  const fx = first.x - from.x;
  const fy = first.y - from.y;
  const fl = Math.hypot(fx, fy);
  if (ll === 0 || fl === 0) return null;
  const ux = lx / ll;
  const uy = ly / ll;
  const head = 0.42;
  const ex = to.x - ux * 0.12;
  const ey = to.y - uy * 0.12;
  const bx = ex - ux * head;
  const by = ey - uy * head;
  const px = -uy * head * 0.6;
  const py = ux * head * 0.6;
  const start = `${from.x + (fx / fl) * 0.25},${from.y + (fy / fl) * 0.25}`;
  const shaft = turn ? `${start} ${turn.x},${turn.y} ${bx},${by}` : `${start} ${bx},${by}`;
  const tip = `${ex},${ey} ${bx + px},${by + py} ${bx - px},${by - py}`;
  return (
    <g>
      <polyline points={shaft} style={{ fill: "none", stroke: CASING, strokeWidth: 0.26, strokeLinejoin: "miter" }} />
      <polygon points={tip} style={{ fill: CASING, stroke: CASING, strokeWidth: 0.08, strokeLinejoin: "miter" }} />
      <polyline points={shaft} style={{ fill: "none", stroke: INK, strokeWidth: 0.16, strokeLinejoin: "miter" }} />
      <polygon points={tip} style={{ fill: INK }} />
    </g>
  );
}

/**
 * The player's own arrows (right button), over the pieces: ink with a paper casing, a knight's
 * arrow bent like its move. `pending` is the one being drawn, lighter until let go. Marked squares
 * are filled by the board itself.
 */
export function DrawingLayer({
  drawings,
  pending,
  flipped,
}: {
  drawings: readonly Drawing[];
  pending?: Drawing;
  flipped: boolean;
}) {
  if (drawings.length === 0 && !pending) return null;
  const shape = (d: Drawing) => <Arrow d={d} flipped={flipped} />;
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      data-drawings
      className="pointer-events-none absolute inset-0 z-[21] size-full"
      style={{ overflow: "visible", transform: "translateZ(0)", isolation: "isolate" }}
    >
      {drawings.map((d) => (
        <g key={`${d.from}${d.to}`} opacity={0.82}>
          {shape(d)}
        </g>
      ))}
      {pending ? <g opacity={0.5}>{shape(pending)}</g> : null}
    </svg>
  );
}
