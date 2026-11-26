import { describe, expect, it, vi } from "vitest";
import { createAnalysisClient } from "./analysis";
import { readEvents } from "./sse";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const e of readEvents(body)) out.push(e);
  return out;
}

describe("readEvents", () => {
  it("reads events split anywhere, skips comments, joins data lines, takes CRLF", async () => {
    const events = await collect(
      streamOf(": searching\n\nevent: in", "fo\ndata: {\"a\"", ":1}\n\n", "event: result\r\ndata: one\r\ndata: two\r\n\r\n"),
    );
    expect(events).toEqual([
      { event: "info", data: '{"a":1}' },
      { event: "result", data: "one\ntwo" },
    ]);
  });
});

const line = { multipv: 1, depth: 12, score: { cp: 31 }, pv: ["e2e4"] };
const result = {
  epd: "x",
  side_to_move: "w",
  depth: 12,
  lines: [line],
  bestmove: "e2e4",
  engine: { name: "Stockfish", version: "19" },
  cached: false,
};
const sse = (...events: [string, unknown][]) =>
  new Response(streamOf(...events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`)), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function client(fetch: (url: string, init: RequestInit) => Promise<Response>, session?: string) {
  const renewSession = vi.fn(async () => "renewed");
  const c = createAnalysisClient({
    baseUrl: async () => "http://gw",
    sessionToken: () => session,
    renewSession,
    fetch: fetch as typeof globalThis.fetch,
    now: () => 1_000_000,
  });
  return { c, renewSession };
}

const auth = (init: RequestInit) => new Headers(init.headers).get("authorization");

describe("analyse", () => {
  it("streams lines, then returns the result, with the session's token", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(auth(init)).toBe("Bearer session");
      expect(new Headers(init.headers).get("accept")).toBe("text/event-stream");
      return sse(["info", line], ["info", { ...line, depth: 13 }], ["result", result]);
    });
    const { c } = client(fetch, "session");
    const seen: number[] = [];
    const a = await c.analyse({ fen: "f", depth: 12 }, { onInfo: (l) => seen.push(l.depth) });
    expect(a.bestmove).toBe("e2e4");
    expect(seen).toEqual([12, 13]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gets a guest token for a player without an account, and keeps it for the next call", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/v1/auth/guest")) {
        // auth-profile answers JSON only: asking it for a stream is a 406.
        expect(new Headers(init.headers).get("accept")).toBe("application/json");
        return json(201, { access_token: "guest", expires_in: 900, refresh_token: "r" });
      }
      expect(auth(init)).toBe("Bearer guest");
      return sse(["result", result]);
    });
    const { c } = client(fetch);
    await c.analyse({ fen: "f" });
    await c.analyse({ fen: "f" });
    expect(calls).toEqual(["http://gw/v1/auth/guest", "http://gw/v1/analysis/positions", "http://gw/v1/analysis/positions"]);
  });

  it("renews once on 401: the session through the core, a guest with a new guest token", async () => {
    let first = true;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (first) {
        first = false;
        return json(401, { type: "about:blank", title: "Unauthorized", status: 401 });
      }
      expect(auth(init)).toBe("Bearer renewed");
      return sse(["result", result]);
    });
    const { c, renewSession } = client(fetch, "old");
    await c.analyse({ fen: "f" });
    expect(renewSession).toHaveBeenCalledOnce();
  });

  it("turns a refusal and a mid-stream failure into problems", async () => {
    const busy = client(async () =>
      json(503, { type: "https://royale-gambit.dev/problems/engine-busy", title: "Engines busy", status: 503 }),
    ).c;
    await expect(busy.analyse({ fen: "f" })).rejects.toMatchObject({ kind: "problem", problemType: "engine-busy" });
    const mid = client(async () =>
      sse(["info", line], ["error", { type: "https://royale-gambit.dev/problems/engine-unavailable", title: "x", status: 503 }]),
      "s",
    ).c;
    await expect(mid.analyse({ fen: "f" })).rejects.toMatchObject({ problemType: "engine-unavailable" });
    const empty = client(async () => sse(["info", line]), "s").c;
    await expect(empty.analyse({ fen: "f" })).rejects.toMatchObject({ kind: "unexpected" });
  });

  it("reports offline and cancelled apart", async () => {
    const offline = client(async () => {
      throw new TypeError("network");
    }, "s").c;
    await expect(offline.analyse({ fen: "f" })).rejects.toEqual({ kind: "offline" });
    const abort = new AbortController();
    abort.abort();
    const cancelled = client(async () => {
      throw new DOMException("aborted", "AbortError");
    }, "s").c;
    await expect(cancelled.analyse({ fen: "f" }, { signal: abort.signal })).rejects.toEqual({ kind: "cancelled" });
  });
});
