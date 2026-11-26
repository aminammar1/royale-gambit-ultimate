import { describe, expect, it } from "vitest";
import { soundFor } from "./boardSounds";

describe("which sound a move makes", () => {
  it("check first, then capture, then castle, else a plain move", () => {
    expect(soundFor("Nf3")).toBe("move");
    expect(soundFor("exd5")).toBe("capture");
    expect(soundFor("O-O")).toBe("castle");
    expect(soundFor("O-O-O+")).toBe("check");
    expect(soundFor("Qxf7#")).toBe("check");
  });
});
