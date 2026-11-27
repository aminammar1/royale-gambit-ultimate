import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./client";
import { createGamesApi, searchQuery, type ImportJob } from "./games";
import type { ServerEvent } from "./sse";

const job = (status: ImportJob["status"], fetched: number): ImportJob => ({
  id: "j1",
  site: "lichess",
  username: "DrNykterstein",
  max_games: 2000,
  status,
  fetched,
  saved: fetched,
  duplicates: 0,
  created_at: "2026-11-28T10:00:00Z",
});

function fakeApi(events: ServerEvent[] = []): ApiClient & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({ items: [], next_cursor: null })),
    put: vi.fn(),
    post: vi.fn(async (_path: string, body: unknown) => body),
    reachable: vi.fn(),
    stream: async function* () {
      yield* events;
    },
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn> };
}

describe("the search's query string", () => {
  it("leaves out what is not asked, and encodes the rest", () => {
    expect(searchQuery({})).toBe("");
    expect(searchQuery({ q: "ruy lopez", player: "", result: undefined, limit: 30 })).toBe("?q=ruy+lopez&limit=30");
    expect(searchQuery({ player: "kingside_tal", result: "win", from: "2026-11-01" })).toBe(
      "?player=kingside_tal&result=win&from=2026-11-01",
    );
  });

  it("drops a player's side filters without the player, as the server would refuse them", () => {
    expect(searchQuery({ result: "win", color: "white" })).toBe("");
  });
});

describe("the games API", () => {
  it("searches through the gateway", async () => {
    const api = fakeApi();
    await createGamesApi(api).search({ eco: "C" });
    expect(api.get).toHaveBeenCalledWith("/v1/games?eco=C");
  });

  it("follows an import until it is done", async () => {
    const api = fakeApi([
      { event: "progress", data: JSON.stringify(job("running", 50)) },
      { event: "progress", data: JSON.stringify(job("running", 100)) },
      { event: "done", data: JSON.stringify(job("done", 120)) },
    ]);
    const seen: ImportJob[] = [];
    for await (const j of createGamesApi(api).follow("j1")) seen.push(j);
    expect(seen.map((j) => [j.status, j.fetched])).toEqual([
      ["running", 50],
      ["running", 100],
      ["done", 120],
    ]);
  });

  it("an error event ends the follow as a problem", async () => {
    const api = fakeApi([
      { event: "error", data: JSON.stringify({ type: "about:blank", title: "Oops", status: 500 }) },
    ]);
    const run = async () => {
      for await (const j of createGamesApi(api).follow("j1")) void j;
    };
    await expect(run()).rejects.toMatchObject({ kind: "problem", status: 500 });
  });
});
