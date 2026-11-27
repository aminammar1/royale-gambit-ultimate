import { describe, expect, it } from "vitest";
import { compactCount, gameResult, shares } from "./explorerFormat";

describe("the explorer's figures", () => {
  it("counts games compactly", () => {
    expect(compactCount(7)).toBe("7");
    expect(compactCount(4_310)).toBe("4,310");
    expect(compactCount(431_551)).toBe("432k");
    expect(compactCount(1_368_125)).toBe("1.4M");
  });

  it("shares that always total 100", () => {
    expect(shares(1, 1, 1)).toEqual([34, 33, 33]);
    expect(shares(194269, 273851, 159166)).toEqual([31, 44, 25]);
    expect(shares(0, 0, 0)).toEqual([0, 0, 0]);
    const [w, d, b] = shares(2, 3, 2);
    expect(w + d + b).toBe(100);
  });

  it("sets a top game's result as printed", () => {
    expect(gameResult("white")).toBe("1–0");
    expect(gameResult("black")).toBe("0–1");
    expect(gameResult(null)).toBe("½–½");
  });
});
