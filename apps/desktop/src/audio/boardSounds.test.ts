import { describe, expect, it } from "vitest";
import { knocksFor, soundFor } from "./boardSounds";

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

  it("a move is one knock of the placement recording", () => {
    expect(knocksFor("move", steady)).toEqual([{ sample: "move", at: 0, rate: 1, gain: expect.any(Number) }]);
  });

  it("each kind has its own recording, played once", () => {
    for (const kind of ["move", "capture", "check", "castle", "promote", "start"] as const)
      expect(knocksFor(kind, steady).map((k) => k.sample)).toEqual([kind]);
  });

  it("no two knocks are quite alike: pitch and loudness vary a little, never much", () => {
    const low = knocksFor("move", () => 0)[0];
    const high = knocksFor("move", () => 0.999)[0];
    expect(low.rate).not.toBe(high.rate);
    for (const k of [low, high]) {
      expect(Math.abs(k.rate - 1)).toBeLessThanOrEqual(0.025);
      expect(k.gain).toBeGreaterThan(0.6);
      expect(k.gain).toBeLessThanOrEqual(1.2);
    }
  });
});
