// Builds src/chess/openings.json from lichess-org/chess-openings (CC0: "as a collection of facts,
// this data set is in the public domain"), the same table the games service names openings with.
// Each line is played by chess.js (ADR-03) and keyed by its position: board, side to move and
// castling (no en passant square, so transpositions match). Run: node scripts/build-openings.mjs
import { writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/";
const table = {};
let lines = 0;
for (const file of ["a", "b", "c", "d", "e"]) {
  const response = await fetch(`${BASE}${file}.tsv`);
  if (!response.ok) throw new Error(`${file}.tsv: ${response.status}`);
  const [header, ...rows] = (await response.text()).trim().split("\n");
  if (header !== "eco\tname\tpgn") throw new Error(`${file}.tsv: unexpected columns ${header}`);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const chess = new Chess();
    chess.loadPgn(pgn);
    const key = chess.fen().split(" ").slice(0, 3).join(" ");
    // The first name for a position stands, as in the table's own order.
    table[key] ??= [eco, name];
    lines += 1;
  }
}
writeFileSync(new URL("../src/chess/openings.json", import.meta.url), JSON.stringify(table));
console.log(`${lines} lines, ${Object.keys(table).length} positions`);
