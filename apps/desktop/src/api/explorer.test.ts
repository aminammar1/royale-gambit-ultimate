import { describe, expect, it, vi } from "vitest";
import { createExplorerApi } from "./explorer";

/** A fake of the generic get, answering `body` to anything. */
const fake = (body: unknown) => vi.fn<(path: string, signal?: AbortSignal) => Promise<unknown>>(async () => body);
const asGet = (f: ReturnType<typeof fake>) => f as unknown as Parameters<typeof createExplorerApi>[0];

describe("the explorer API", () => {
  it("asks for a position in a database, the FEN encoded", async () => {
    const get = fake({});
    await createExplorerApi(asGet(get)).explore(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "masters",
    );
    expect(get).toHaveBeenCalledWith(
      "/v1/explorer?db=masters&fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F4P3%2F8%2FPPPP1PPP%2FRNBQKBNR+b+KQkq+-+0+1",
      undefined,
    );
  });

  it("fetches a top game's PGN", async () => {
    const get = fake({ pgn: "1. e4 *" });
    await expect(createExplorerApi(asGet(get)).gamePgn("masters", "bjSF8DMw")).resolves.toBe("1. e4 *");
    expect(get).toHaveBeenCalledWith("/v1/explorer/games/masters/bjSF8DMw", undefined);
  });

  it("opens a top game of the player's own from their library", async () => {
    const get = fake({ pgn: "1. d4 *" });
    await expect(createExplorerApi(asGet(get)).gamePgn("mine", "0190e0c4-0000-7000-8000-000000000000")).resolves.toBe(
      "1. d4 *",
    );
    expect(get).toHaveBeenCalledWith("/v1/games/0190e0c4-0000-7000-8000-000000000000", undefined);
  });

  it("lists the week's popular games", async () => {
    const get = fake({ items: [{ id: "x" }] });
    await expect(createExplorerApi(asGet(get)).popular()).resolves.toEqual([{ id: "x" }]);
    expect(get).toHaveBeenCalledWith("/v1/explorer/popular", undefined);
  });
});
