// The explorer's small print: game counts, the White/draw/Black shares, a top game's result.

/** 7, 4,310, 432k, 1.4M. */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("en-US");
}

/** White, draw and Black as whole percentages that total 100 (largest remainder). */
export function shares(white: number, draws: number, black: number): [number, number, number] {
  const total = white + draws + black;
  if (total === 0) return [0, 0, 0];
  const exact = [white, draws, black].map((n) => (n * 100) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const missing = 100 - out.reduce((a, b) => a + b, 0);
  for (let k = 0; k < missing; k++) out[order[k][1]] += 1;
  return [out[0], out[1], out[2]];
}

/** A top game's result from its winner. */
export function gameResult(winner: string | null | undefined): string {
  if (winner === "white") return "1–0";
  if (winner === "black") return "0–1";
  return "½–½";
}
