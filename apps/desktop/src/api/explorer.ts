import type { components } from "./generated/games";

// The opening explorer (contracts/openapi/games.yaml, M12): what was played from a position, in
// the masters database (anyone, guests too) or lichess's (with a Lichess sign-in).

export type Explorer = components["schemas"]["Explorer"];
export type ExplorerMove = Explorer["moves"][number];
export type TopGame = Explorer["top_games"][number];
export type ExplorerDb = Explorer["db"];
export type PopularGame = components["schemas"]["PopularGame"];

type Get = <T>(path: string, signal?: AbortSignal) => Promise<T>;

export function createExplorerApi(get: Get) {
  return {
    explore: (fen: string, db: ExplorerDb, signal?: AbortSignal) =>
      get<Explorer>(`/v1/explorer?${new URLSearchParams({ db, fen }).toString()}`, signal),
    /** A top game's PGN: a masters or lichess game from the explorer, or one of the player's own. */
    gamePgn: async (db: ExplorerDb, id: string, signal?: AbortSignal) =>
      db === "mine"
        ? (await get<{ pgn: string }>(`/v1/games/${encodeURIComponent(id)}`, signal)).pgn
        : (await get<{ pgn: string }>(`/v1/explorer/games/${db}/${encodeURIComponent(id)}`, signal)).pgn,
    /** The top games players opened most this week. */
    popular: async (signal?: AbortSignal) =>
      (await get<{ items: PopularGame[] }>("/v1/explorer/popular", signal)).items,
  };
}
