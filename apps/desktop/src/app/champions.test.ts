import { describe, expect, it } from "vitest";
import { CHAMPIONS, championsOfTheDay } from "./champions";

describe("champions", () => {
  it("numbers all eighteen in order, with a photo for every one but Kramnik", () => {
    expect(CHAMPIONS.map((c) => c.no)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(CHAMPIONS.filter((c) => !c.portrait).map((c) => c.name)).toEqual(["Vladimir Kramnik"]);
  });

  it("prints a different run of consecutive champions each day, wrapping after Gukesh", () => {
    const today = championsOfTheDay(new Date(2026, 10, 25), 3);
    const tomorrow = championsOfTheDay(new Date(2026, 10, 26), 3);
    expect(today).toHaveLength(3);
    expect(tomorrow[0]).toBe(today[1]);
    const nos = Array.from({ length: 18 }, (_, d) => championsOfTheDay(new Date(2026, 0, 1 + d), 1)[0].no);
    expect(new Set(nos).size).toBe(18);
  });
});
