import { describe, expect, it } from "vitest";
import type { GameSummary, ImportJob } from "../../api";
import { cardDate, guessPlayer, movesLabel, progressLine, resultLabel } from "./format";

const card = (white: string, black: string): GameSummary =>
  ({
    id: "x",
    source: "lichess",
    white,
    black,
    result: "1-0",
    ply_count: 41,
    first_moves: "",
    created_at: "2026-11-01T00:00:00Z",
  }) as GameSummary;

describe("an index card's lines", () => {
  it("dates a game as the board does, the year only when it is not this one", () => {
    const now = new Date("2026-11-28T12:00:00Z");
    expect(cardDate("2026-11-17T19:54:01Z", now)).toBe("17 NOV");
    expect(cardDate("2024-03-05T18:04:22Z", now)).toBe("5 MAR 2024");
    expect(cardDate(null, now)).toBe("Undated");
  });

  it("counts moves, not half-moves", () => {
    expect(movesLabel(81)).toBe("41 moves");
    expect(movesLabel(2)).toBe("1 move");
    expect(movesLabel(0)).toBe("No moves");
  });

  it("sets results as printed: an en dash, and a half for a draw", () => {
    expect(resultLabel("1-0")).toBe("1–0");
    expect(resultLabel("1/2-1/2")).toBe("½–½");
    expect(resultLabel("*")).toBe("*");
  });
});

describe("whose archive a search is about", () => {
  it("the player most of the found games name, matching the search", () => {
    const found = [card("kingside_tal", "Guest"), card("Guest", "kingside_tal"), card("Guest", "other")];
    expect(guessPlayer(found, "kingside")).toBe("kingside_tal");
    expect(guessPlayer(found, "KINGSIDE_TAL")).toBe("kingside_tal");
  });

  it("with no search, the player in most games: the owner of an imported archive", () => {
    expect(guessPlayer([card("me", "a"), card("b", "me"), card("c", "d")], "")).toBe("me");
  });

  it("nobody when nothing matches or nothing was found", () => {
    expect(guessPlayer([card("a", "b")], "zzz")).toBeUndefined();
    expect(guessPlayer([], "")).toBeUndefined();
  });

  it("opening words name no player", () => {
    expect(guessPlayer([card("a", "b"), card("a", "c")], "sicilian")).toBeUndefined();
  });
});

describe("an import in one line", () => {
  const job = (status: ImportJob["status"], saved: number, duplicates: number, error?: string): ImportJob => ({
    id: "j",
    site: "lichess",
    username: "DrNykterstein",
    max_games: 2000,
    status,
    fetched: saved + duplicates,
    saved,
    duplicates,
    error,
    created_at: "2026-11-28T10:00:00Z",
  });

  it("says what it is doing, then what it filed", () => {
    expect(progressLine(job("queued", 0, 0))).toBe("Waiting to read DrNykterstein on Lichess…");
    expect(progressLine(job("running", 118, 2))).toBe(
      "Reading DrNykterstein on Lichess: 120 read, 118 new, 2 already here…",
    );
    expect(progressLine(job("done", 300, 0))).toBe("Filed 300 new games from DrNykterstein on Lichess.");
    expect(progressLine(job("done", 0, 300))).toBe(
      "Nothing new from DrNykterstein on Lichess: all 300 games are already here.",
    );
    expect(progressLine(job("failed", 0, 0, "No player named DrNykterstein on Lichess."))).toBe(
      "No player named DrNykterstein on Lichess.",
    );
  });
});
