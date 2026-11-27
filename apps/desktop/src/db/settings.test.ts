import { describe, expect, it } from "vitest";
import { DEFAULTS, GLIDE_MS, HIGHLIGHT_COLOURS, HIGHLIGHT_NAMES, fromRows } from "./settings";

describe("saved settings", () => {
  it("fall back to the defaults on a new machine", () => {
    expect(fromRows({})).toEqual(DEFAULTS);
  });

  it("read the stored rows and ignore what this version does not know", () => {
    const s = fromRows({
      board_theme: "wood",
      board_arrows: "off",
      edition: "night",
      board_coordinates: "maybe",
      board_theme_x: "neon",
    });
    expect(s.boardTheme).toBe("wood");
    expect(s.edition).toBe("night");
    expect(s.display).toEqual({ coordinates: true, lastMove: true, legalMoves: true, arrows: false });
    expect(fromRows({ board_theme: "neon" }).boardTheme).toBe("newspaper");
  });
});

describe("piece speed", () => {
  it("is fast on a new machine, as on chess sites", () => {
    expect(DEFAULTS.pieceSpeed).toBe("fast");
    expect(GLIDE_MS.fast).toBeLessThan(GLIDE_MS.normal);
    expect(GLIDE_MS.normal).toBeLessThan(GLIDE_MS.slow);
    expect(GLIDE_MS.off).toBe(0);
  });

  it("reads a stored speed, and ignores one it does not know", () => {
    expect(fromRows({ piece_speed: "slow" }).pieceSpeed).toBe("slow");
    expect(fromRows({ piece_speed: "warp" }).pieceSpeed).toBe("fast");
  });
});

describe("highlight colours", () => {
  it("the theme's own colour for the picked piece and last move, red for marked squares, on a new machine", () => {
    expect(DEFAULTS.highlight).toBe("theme");
    expect(DEFAULTS.markColour).toBe("red");
  });

  it("read the stored colours, and ignore one this version does not know", () => {
    const s = fromRows({ board_highlight: "blue", board_mark_colour: "ink" });
    expect(s.highlight).toBe("blue");
    expect(s.markColour).toBe("ink");
    expect(fromRows({ board_highlight: "neon" }).highlight).toBe("theme");
  });

  it("every colour has a name for Board & pieces", () => {
    for (const c of HIGHLIGHT_COLOURS) expect(HIGHLIGHT_NAMES[c]).toBeTruthy();
  });
});
