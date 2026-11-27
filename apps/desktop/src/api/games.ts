import type { ApiClient } from "./client";
import type { components } from "./generated/games";
import type { ApiError } from "./problem";

// The games service (contracts/openapi/games.yaml): a signed-in player's own games, saved from
// PGN or imported by username, searched for the Library.

export type GameSummary = components["schemas"]["GameSummary"];
export type Game = components["schemas"]["Game"];
export type GamePage = components["schemas"]["GamePage"];
export type ImportJob = components["schemas"]["ImportJob"];
export type PlayerStats = components["schemas"]["PlayerStats"];
export type SaveResult = components["schemas"]["SaveResult"];
export type Site = ImportJob["site"];

/** A search, as the Library sets it; empty values are left out. */
export type Search = {
  q?: string;
  player?: string;
  color?: "white" | "black";
  result?: "win" | "loss" | "draw";
  eco?: string;
  source?: GameSummary["source"];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

/** The query string of a search. A result or colour needs a player: without one they are left out. */
export function searchQuery(s: Search): string {
  const params = new URLSearchParams();
  const add = (key: keyof Search, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  };
  add("q", s.q?.trim());
  add("player", s.player?.trim());
  if (s.player?.trim()) {
    add("color", s.color);
    add("result", s.result);
  }
  add("eco", s.eco);
  add("source", s.source);
  add("from", s.from);
  add("to", s.to);
  add("limit", s.limit);
  add("cursor", s.cursor);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createGamesApi(api: ApiClient) {
  return {
    search: (s: Search) => api.get<GamePage>(`/v1/games${searchQuery(s)}`),
    get: (id: string) => api.get<Game>(`/v1/games/${encodeURIComponent(id)}`),
    /** Saves one or many games from PGN; bad ones come back in `rejected`. */
    save: (pgn: string) => api.post<SaveResult>("/v1/games", { pgn }),
    stats: (player: string) => api.get<PlayerStats>(`/v1/games/stats?player=${encodeURIComponent(player)}`),
    /** Queues an import, or gives back the same one already running. */
    startImport: (site: Site, username: string) => api.post<ImportJob>("/v1/imports", { site, username }),
    /** The import as it goes: each step, then the finished job. Abort `signal` to stop following. */
    async *follow(id: string, signal?: AbortSignal): AsyncGenerator<ImportJob> {
      for await (const e of api.stream(`/v1/imports/${encodeURIComponent(id)}`, signal)) {
        if (e.event === "error") {
          const p = JSON.parse(e.data) as { type?: string; title?: string; detail?: string; status?: number };
          const type = p.type ?? "about:blank";
          throw {
            kind: "problem",
            status: p.status ?? 500,
            problemType: type.slice(type.lastIndexOf("/") + 1),
            title: p.title ?? "Error",
            detail: p.detail,
          } satisfies ApiError;
        }
        if (e.event !== "progress" && e.event !== "done") continue;
        const job = JSON.parse(e.data) as ImportJob;
        yield job;
        if (e.event === "done") return;
      }
    },
  };
}

export type GamesApi = ReturnType<typeof createGamesApi>;
