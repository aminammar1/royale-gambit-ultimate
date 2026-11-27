import type { components } from "./generated/games";

// The opening explorer (contracts/openapi/games.yaml, M12): what was played from a position, in
// the masters database (anyone, guests too) or lichess's (with a Lichess sign-in).

export type Explorer = components["schemas"]["Explorer"];
export type ExplorerMove = Explorer["moves"][number];
export type TopGame = Explorer["top_games"][number];
export type ExplorerDb = Explorer["db"];

type Get = <T>(path: string, signal?: AbortSignal) => Promise<T>;

export function createExplorerApi(get: Get) {
  return {
    explore: (fen: string, db: ExplorerDb, signal?: AbortSignal) =>
      get<Explorer>(`/v1/explorer?${new URLSearchParams({ db, fen }).toString()}`, signal),
    gamePgn: async (db: ExplorerDb, id: string, signal?: AbortSignal) =>
      (await get<{ pgn: string }>(`/v1/explorer/games/${db}/${encodeURIComponent(id)}`, signal)).pgn,
  };
}
