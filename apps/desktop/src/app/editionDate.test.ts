import { describe, expect, it } from "vitest";
import { editionDate, greeting } from "./editionDate";

describe("editionDate", () => {
  it("prints the newspaper dateline", () => {
    expect(editionDate(new Date(2026, 10, 24))).toBe("TUESDAY, 24 NOVEMBER 2026");
  });
});

describe("greeting", () => {
  it("follows the hour", () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 15))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 21))).toBe("Good evening");
  });
});
