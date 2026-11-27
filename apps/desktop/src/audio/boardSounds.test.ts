import { describe, expect, it } from "vitest";
import { knocksFor, soundFor } from "./boardSounds";

describe("which sound a move makes", () => {
  it("check first, then capture, then castle, else a plain move", () => {
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

  it("a capture is the capture recording", () => {
    expect(knocksFor("capture", steady).map((k) => k.sample)).toEqual(["capture"]);
  });

  it("castling sets down the king, then the rook a beat later", () => {
    const [king, rook] = knocksFor("castle", steady);
    expect(king.at).toBe(0);
    expect(rook.at).toBeGreaterThan(0.06);
    expect(rook.at).toBeLessThan(0.2);
  });

  it("check is a firmer knock than a move", () => {
    expect(knocksFor("check", steady)[0].gain).toBeGreaterThan(knocksFor("move", steady)[0].gain);
  });

  it("no two knocks are quite alike: pitch and loudness vary a little, never much", () => {
    const low = knocksFor("move", () => 0)[0];
    const high = knocksFor("move", () => 0.999)[0];
    expect(low.rate).not.toBe(high.rate);
    for (const k of [low, high]) {
      expect(Math.abs(k.rate - 1)).toBeLessThanOrEqual(0.04);
      expect(k.gain).toBeGreaterThan(0.6);
      expect(k.gain).toBeLessThanOrEqual(1.2);
    }
  });
});
