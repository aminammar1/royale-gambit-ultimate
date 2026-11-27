// Board geometry for the board's own layer: where a square is drawn, the square under the
// pointer, and which piece of the last position became which piece of the next, so each one
// glides from its own square. Drawing only: what is legal comes from chess.js (src/chess). No React.

export type Orientation = "white" | "black";
/** A piece on the board under a key that stays with it from position to position. */
export type Placed = { key: number; square: string; piece: string };

const fileOf = (square: string) => square.charCodeAt(0) - 97;
const rankOf = (square: string) => Number(square[1]) - 1;

/** The column (0 left) and row (0 top) where `square` is drawn. */
export function cellOf(square: string, orientation: Orientation): { col: number; row: number } {
  const file = fileOf(square);
  const rank = rankOf(square);
  return orientation === "white" ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

/** The square under a point `x`, `y` px from the board's top-left corner, or nothing off the board. */
export function squareAt(x: number, y: number, size: number, orientation: Orientation): string | undefined {
  if (x < 0 || y < 0 || x >= size || y >= size) return undefined;
  const col = Math.floor((x / size) * 8);
  const row = Math.floor((y / size) * 8);
  const file = orientation === "white" ? col : 7 - col;
  const rank = orientation === "white" ? 7 - row : row;
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

const distance = (a: string, b: string) => (fileOf(a) - fileOf(b)) ** 2 + (rankOf(a) - rankOf(b)) ** 2;

/**
 * Gives the pieces of the next position the keys of the last one: a piece that stayed keeps its
 * key; one that moved takes the key of the nearest piece of its kind that left its square (so
 * castling moves king and rook, and two knights each go the short way); a promoted piece takes the
 * pawn's key. Pieces of the last position left over are `leaving` (taken, or gone in a jump).
 */
export function matchPieces(
  prev: readonly Placed[],
  next: readonly { square: string; piece: string }[],
  newKey: () => number,
): { placed: Placed[]; leaving: Placed[] } {
  const placed: (Placed | undefined)[] = next.map(() => undefined);
  const free = new Set(prev);

  next.forEach((n, i) => {
    const same = [...free].find((p) => p.square === n.square && p.piece === n.piece);
    if (same) {
      placed[i] = { ...same };
      free.delete(same);
    }
  });

  const pair = (fits: (old: Placed, n: { square: string; piece: string }) => boolean) => {
    const pairs: { i: number; old: Placed; d: number }[] = [];
    next.forEach((n, i) => {
      if (placed[i]) return;
      for (const old of free) if (fits(old, n)) pairs.push({ i, old, d: distance(old.square, n.square) });
    });
    pairs.sort((a, b) => a.d - b.d);
    for (const { i, old } of pairs) {
      if (placed[i] || !free.has(old)) continue;
      placed[i] = { key: old.key, square: next[i].square, piece: next[i].piece };
      free.delete(old);
    }
  };
  pair((old, n) => old.piece === n.piece);
  // A pawn promoted one step away (or, stepping back, a promoted piece that is a pawn again).
  pair(
    (old, n) =>
      old.piece[0] === n.piece[0] &&
      (old.piece[1] === "P") !== (n.piece[1] === "P") &&
      distance(old.square, n.square) <= 2,
  );

  return {
    placed: next.map((n, i) => placed[i] ?? { key: newKey(), square: n.square, piece: n.piece }),
    leaving: [...free],
  };
}
