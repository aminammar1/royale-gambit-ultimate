import { describe, expect, it } from "vitest";
import { knocksFor, soundFor, takesOf } from "./boardSounds";

describe("which sound a move makes", () => {
  it("check first, then promotion, then capture, then castle, else a plain move", () => {
    expect(soundFor("e8=Q")).toBe("promote");
    expect(soundFor("bxa8=N")).toBe("promote");
    expect(soundFor("e8=Q+")).toBe("check");
    expect(soundFor("Nf3")).toBe("move");
    expect(soundFor("exd5")).toBe("capture");
    expect(soundFor("O-O")).toBe("castle");
    expect(soundFor("O-O-O+")).toBe("check");
    expect(soundFor("Qxf7#")).toBe("check");
  });
});

describe("the knocks a sound is made of", () => {
  const steady = () => 0.5; // the middle of every random spread

  it("each kind plays its own recording, once, at its own pitch at the middle of the spread", () => {
    for (const kind of ["move", "capture", "check", "castle", "promote", "start"] as const) {
      const knocks = knocksFor(kind, steady);
      expect(knocks).toHaveLength(1);
      expect(knocks[0]).toMatchObject({ sample: kind, at: 0, rate: 1 });
    }
  });

  it("a move is one of five recorded takes, so no two moves sound alike", () => {
    expect(takesOf("move")).toBe(5);
    expect(takesOf("capture")).toBe(4);
    expect(knocksFor("move", () => 0)[0].take).toBe(0);
    expect(knocksFor("move", () => 0.999)[0].take).toBe(4);
  });

  it("pitch and loudness vary a little, never much", () => {
    for (const r of [0, 0.999]) {
      const k = knocksFor("move", () => r)[0];
      expect(Math.abs(k.rate - 1)).toBeLessThanOrEqual(0.015 + 1e-9);
      expect(Math.abs(k.gain - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });
});
