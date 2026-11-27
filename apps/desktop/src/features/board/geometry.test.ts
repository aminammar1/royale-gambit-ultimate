import { describe, expect, it } from "vitest";
import { cellOf, matchPieces, squareAt, type Placed } from "./geometry";

describe("where a square sits on the board", () => {
  it("White at the bottom: a1 bottom-left, h8 top-right", () => {
    expect(cellOf("a1", "white")).toEqual({ col: 0, row: 7 });
    expect(cellOf("h8", "white")).toEqual({ col: 7, row: 0 });
    expect(cellOf("e4", "white")).toEqual({ col: 4, row: 4 });
  });

  it("flipped: h8 bottom-left, a1 top-right", () => {
    expect(cellOf("h8", "black")).toEqual({ col: 0, row: 7 });
    expect(cellOf("a1", "black")).toEqual({ col: 7, row: 0 });
  });
});

describe("the square under the pointer", () => {
  it("finds the square from a point inside an 800px board", () => {
    expect(squareAt(10, 790, 800, "white")).toBe("a1");
    expect(squareAt(450, 350, 800, "white")).toBe("e5");
    expect(squareAt(10, 790, 800, "black")).toBe("h8");
  });

  it("is nothing off the board", () => {
    expect(squareAt(-1, 10, 800, "white")).toBeUndefined();
    expect(squareAt(10, 800, 800, "white")).toBeUndefined();
  });
});

const keys = (placed: readonly Placed[]) => Object.fromEntries(placed.map((p) => [p.square, p.key]));

describe("which piece went where, so each one glides from its own square", () => {
  const start: Placed[] = [
    { key: 1, square: "e1", piece: "wK" },
    { key: 2, square: "h1", piece: "wR" },
    { key: 3, square: "e2", piece: "wP" },
    { key: 4, square: "d5", piece: "bP" },
    { key: 5, square: "e7", piece: "bP" },
  ];
  let next = 100;
  const id = () => next++;

  it("keeps a piece that stayed, moves one that moved", () => {
    const { placed, leaving } = matchPieces(
      start,
      [
        { square: "e1", piece: "wK" },
        { square: "h1", piece: "wR" },
        { square: "e4", piece: "wP" },
        { square: "d5", piece: "bP" },
        { square: "e7", piece: "bP" },
      ],
      id,
    );
    expect(keys(placed)).toEqual({ e1: 1, h1: 2, e4: 3, d5: 4, e7: 5 });
    expect(leaving).toEqual([]);
  });

  it("a capture: the taker moves onto the square, the taken piece leaves", () => {
    const { placed, leaving } = matchPieces(
      [
        { key: 3, square: "e4", piece: "wP" },
        { key: 4, square: "d5", piece: "bP" },
      ],
      [{ square: "d5", piece: "wP" }],
      id,
    );
    expect(keys(placed)).toEqual({ d5: 3 });
    expect(leaving).toEqual([{ key: 4, square: "d5", piece: "bP" }]);
  });

  it("castling moves the king and the rook, each from its own square", () => {
    const { placed } = matchPieces(
      start,
      [
        { square: "g1", piece: "wK" },
        { square: "f1", piece: "wR" },
        { square: "e2", piece: "wP" },
        { square: "d5", piece: "bP" },
        { square: "e7", piece: "bP" },
      ],
      id,
    );
    expect(keys(placed)).toMatchObject({ g1: 1, f1: 2 });
  });

  it("two of a kind moved: each goes to the nearer square", () => {
    const { placed } = matchPieces(
      [
        { key: 7, square: "b1", piece: "wN" },
        { key: 8, square: "g1", piece: "wN" },
      ],
      [
        { square: "c3", piece: "wN" },
        { square: "f3", piece: "wN" },
      ],
      id,
    );
    expect(keys(placed)).toEqual({ c3: 7, f3: 8 });
  });

  it("a promotion: the pawn's own piece becomes the queen on the last rank", () => {
    const { placed, leaving } = matchPieces(
      [{ key: 9, square: "a7", piece: "wP" }],
      [{ square: "a8", piece: "wQ" }],
      id,
    );
    expect(placed).toEqual([{ key: 9, square: "a8", piece: "wQ" }]);
    expect(leaving).toEqual([]);
  });

  it("a piece that appears from nowhere gets a new key", () => {
    const { placed } = matchPieces([], [{ square: "d4", piece: "bQ" }], () => 42);
    expect(placed).toEqual([{ key: 42, square: "d4", piece: "bQ" }]);
  });
});

describe("a jump through the game", () => {
  it("never turns a far-off queen into a pawn", () => {
    const { placed, leaving } = matchPieces(
      [{ key: 1, square: "d1", piece: "wQ" }],
      [{ square: "a2", piece: "wP" }],
      () => 2,
    );
    expect(placed).toEqual([{ key: 2, square: "a2", piece: "wP" }]);
    expect(leaving).toEqual([{ key: 1, square: "d1", piece: "wQ" }]);
  });
});
