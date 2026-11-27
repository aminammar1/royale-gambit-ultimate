import { describe, expect, it } from "vitest";
import { elbowOf, toggleDrawing } from "./drawings";

describe("the player's own arrows and circles", () => {
  it("drawing one adds it; drawing it again takes it away", () => {
    const one = toggleDrawing([], { from: "e2", to: "e4" });
    expect(one).toEqual([{ from: "e2", to: "e4" }]);
    expect(toggleDrawing(one, { from: "e2", to: "e4" })).toEqual([]);
  });

  it("a circle is a drawing from a square to itself", () => {
    expect(toggleDrawing([{ from: "e2", to: "e4" }], { from: "d5", to: "d5" })).toEqual([
      { from: "e2", to: "e4" },
      { from: "d5", to: "d5" },
    ]);
  });

  it("the reverse arrow is another arrow", () => {
    expect(toggleDrawing([{ from: "e2", to: "e4" }], { from: "e4", to: "e2" })).toHaveLength(2);
  });
});

describe("a knight's arrow bends", () => {
  it("goes the long way first, then turns", () => {
    expect(elbowOf("g1", "f3")).toBe("g3");
    expect(elbowOf("b1", "d2")).toBe("d1");
    expect(elbowOf("e5", "c4")).toBe("c5");
  });

  it("any other arrow is straight", () => {
    expect(elbowOf("e2", "e4")).toBeUndefined();
    expect(elbowOf("a1", "h8")).toBeUndefined();
    expect(elbowOf("e4", "e4")).toBeUndefined();
  });
});
