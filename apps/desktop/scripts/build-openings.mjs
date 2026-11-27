// Builds src/chess/openings.json from the pinned lichess-org/chess-openings table in
// contracts/fixtures/openings (CC0: "as a collection of facts, this data set is in the public
// domain"), the one the games service names openings with too. Each line is played by chess.js
// (ADR-03) and keyed by its position: board, side to move, castling and en passant square. chess.js
// writes the en passant square only when a capture is legal, so a transposition keeps its key and
// two positions that differ by a legal en passant capture keep theirs. Run: node scripts/build-openings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const dir = new URL("../../../contracts/fixtures/openings/", import.meta.url);
const table = {};
let lines = 0;
for (const file of ["a", "b", "c", "d", "e"]) {
  const [header, ...rows] = readFileSync(new URL(`${file}.tsv`, dir), "utf8").trim().split("\n");
  if (header !== "eco\tname\tpgn") throw new Error(`${file}.tsv: unexpected columns ${header}`);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const chess = new Chess();
    chess.loadPgn(pgn);
    const key = chess.fen().split(" ").slice(0, 4).join(" ");
    if (table[key]) throw new Error(`two names for one position: ${table[key][1]} and ${name}`);
    table[key] = [eco, name];
    lines += 1;
  }
}
writeFileSync(new URL("../src/chess/openings.json", import.meta.url), JSON.stringify(table));
console.log(`${lines} lines, ${Object.keys(table).length} positions`);
