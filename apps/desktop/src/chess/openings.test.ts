import { describe, expect, it } from "vitest";
import { load, type Game } from "./game";
import table from "./openings.json";
import { openingAt, splitName, type OpeningTable } from "./openings";

// JSON types its pairs as string[]; they are [ECO, name] pairs.
const book = table as unknown as OpeningTable;

function game(pgn: string): Game {
  const result = load(pgn);
  if (!result.ok) throw new Error(result.error);
  return result.game;
}

describe("the opening on the board", () => {
  it("names a line by its position, so another move order finds the same opening", () => {
    const najdorf = game("1. Nf3 c5 2. e4 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6");
    expect(openingAt(najdorf, najdorf.plies.length, book)).toEqual({
      eco: "B90",
      name: "Sicilian Defense: Najdorf Variation",
      family: "Sicilian Defense",
      variation: "Najdorf Variation",
    });
  });

  it("follows the move on show, and keeps the last named position past the book", () => {
    const g = game(
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. a4 h6",
    );
    expect(openingAt(g, 0, book)).toBeUndefined();
    expect(openingAt(g, 1, book)?.family).toBe("King's Pawn Game");
    expect(openingAt(g, 6, book)?.family).toBe("Ruy Lopez");
    // 9... Nb8 is the Breyer (C94); 10. d4 takes it to C95, and 10... Nbd7 names the Zaitsev Hybrid.
    expect(openingAt(g, 18, book)).toMatchObject({
      eco: "C94",
      family: "Ruy Lopez",
      variation: "Closed, Breyer Defense",
    });
    expect(openingAt(g, 19, book)?.eco).toBe("C95");
    // 11. a4 h6 is no named line: the last name stands.
    expect(openingAt(g, g.plies.length, book)?.variation).toBe("Closed, Breyer Defense, Zaitsev Hybrid");
  });
});

describe("an opening's name in two parts", () => {
  it("the opening, then its variation", () => {
    expect(splitName("Sicilian Defense: Najdorf Variation, English Attack")).toEqual({
      family: "Sicilian Defense",
      variation: "Najdorf Variation, English Attack",
    });
    expect(splitName("Ruy Lopez")).toEqual({ family: "Ruy Lopez", variation: undefined });
  });
});
