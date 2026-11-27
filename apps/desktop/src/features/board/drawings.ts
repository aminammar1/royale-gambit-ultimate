// The player's own marks on the board, drawn with the right button as on chess sites: an arrow
// from one square to another, or a circle round one square (an arrow to itself). No React.

export type Drawing = { from: string; to: string };

/** Adds `d`, or takes it away when it is already drawn. */
export function toggleDrawing(list: readonly Drawing[], d: Drawing): Drawing[] {
  const drawn = list.some((x) => x.from === d.from && x.to === d.to);
  return drawn ? list.filter((x) => x.from !== d.from || x.to !== d.to) : [...list, d];
}

/** Where a knight's arrow turns: the long leg first, then the short one. Nothing for other arrows. */
export function elbowOf(from: string, to: string): string | undefined {
  const df = to.charCodeAt(0) - from.charCodeAt(0);
  const dr = Number(to[1]) - Number(from[1]);
  const knight = (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1);
  if (!knight) return undefined;
  return Math.abs(dr) === 2 ? `${from[0]}${to[1]}` : `${to[0]}${from[1]}`;
}
