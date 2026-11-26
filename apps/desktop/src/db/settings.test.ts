import { describe, expect, it } from "vitest";
import { DEFAULTS, fromRows } from "./settings";

describe("saved settings", () => {
  it("fall back to the defaults on a new machine", () => {
    expect(fromRows({})).toEqual(DEFAULTS);
  });

  it("read the stored rows and ignore what this version does not know", () => {
    const s = fromRows({ board_theme: "wood", board_arrows: "off", edition: "night", board_coordinates: "maybe", board_theme_x: "neon" });
    expect(s.boardTheme).toBe("wood");
    expect(s.edition).toBe("night");
    expect(s.display).toEqual({ coordinates: true, lastMove: true, legalMoves: true, arrows: false });
    expect(fromRows({ board_theme: "neon" }).boardTheme).toBe("newspaper");
  });
});
