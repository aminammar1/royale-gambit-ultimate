// The opening on the board: the deepest named position the game has reached, from the CC0
// lichess-org/chess-openings table (src/chess/openings.json, built by scripts/build-openings.mjs
// with chess.js). Keyed by position, not move order, so transpositions are named too. No React.
import { fenAt, type Game } from "./game";

/** Position key (board, side to move, castling) to [ECO, name]. */
export type OpeningTable = Record<string, readonly [string, string]>;

export type Opening = {
  eco: string;
  name: string;
  /** "Sicilian Defense" */
  family: string;
  /** "Najdorf Variation, English Attack"; none for the opening itself. */
  variation?: string;
};

/** The table's key for a position: its FEN's board, side to move and castling. */
export const positionKey = (fen: string): string => fen.split(" ").slice(0, 3).join(" ");

/** "Sicilian Defense: Najdorf Variation" as the opening and its variation. */
export function splitName(name: string): { family: string; variation?: string } {
  const colon = name.indexOf(":");
  if (colon < 0) return { family: name, variation: undefined };
  return { family: name.slice(0, colon).trim(), variation: name.slice(colon + 1).trim() || undefined };
}

/** The opening at `cursor`: the last named position from the start up to that move. */
export function openingAt(game: Game, cursor: number, table: OpeningTable): Opening | undefined {
  for (let i = Math.min(cursor, game.plies.length); i >= 0; i--) {
    const hit = table[positionKey(fenAt(game, i))];
    if (hit) return { eco: hit[0], name: hit[1], ...splitName(hit[1]) };
  }
  return undefined;
}

let loading: Promise<OpeningTable> | undefined;

/** The table, loaded once, apart from the app's first screen (it is about 60 KB compressed). */
export function loadOpenings(): Promise<OpeningTable> {
  loading ??= import("./openings.json").then((m) => m.default as unknown as OpeningTable);
  return loading;
}
