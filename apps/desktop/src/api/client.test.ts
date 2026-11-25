import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";

type Call = { url: string; authorization: string | null };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  });
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = () =>
  new Response(JSON.stringify({ type: "about:blank", title: "Unauthorized", status: 401 }), {
    status: 401,
    headers: { "content-type": "application/problem+json" },
  });

function client(
  fetch: typeof globalThis.fetch,
  token: string | undefined,
  refresh = vi.fn(async (): Promise<string | undefined> => "fresh"),
) {
  return {
    refresh,
    api: createApiClient({ baseUrl: async () => "http://gw:8080", accessToken: () => token, refresh, fetch }),
  };
}

describe("createApiClient", () => {
  it("sends the access token and reads the answer", async () => {
    const { fetch, calls } = fakeFetch([json([{ provider: "email" }])]);
    const { api } = client(fetch, "t1");

    await expect(api.get("/v1/auth/identities")).resolves.toEqual([{ provider: "email" }]);
    expect(calls).toEqual([{ url: "http://gw:8080/v1/auth/identities", authorization: "Bearer t1" }]);
  });

  it("refreshes once on a 401 and retries with the new token", async () => {
    const { fetch, calls } = fakeFetch([unauthorized(), json({ ok: true })]);
    const { api, refresh } = client(fetch, "stale");

    await expect(api.get("/v1/profile")).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.authorization)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  it("does not loop when the retry is refused too", async () => {
    const { fetch } = fakeFetch([unauthorized(), unauthorized()]);
    const { api, refresh } = client(fetch, "stale");

    await expect(api.get("/v1/profile")).rejects.toMatchObject({ kind: "problem", status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("gives up when the session could not be renewed", async () => {
    const { fetch, calls } = fakeFetch([unauthorized()]);
    const { api } = client(
      fetch,
      "stale",
      vi.fn(async () => undefined),
    );

    await expect(api.get("/v1/profile")).rejects.toMatchObject({ kind: "problem", status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("does not try to refresh a guest", async () => {
    const { fetch } = fakeFetch([unauthorized()]);
    const { api, refresh } = client(fetch, undefined);

    await expect(api.get("/v1/profile")).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a gateway it cannot reach as offline", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { api } = client(fetch, "t1");

    await expect(api.get("/v1/profile")).rejects.toEqual({ kind: "offline" });
  });
});

describe("reachable", () => {
  it("is true when the gateway answers its liveness check", async () => {
    const { fetch, calls } = fakeFetch([new Response("ok", { status: 200 })]);
    const { api } = client(fetch, undefined);
    await expect(api.reachable()).resolves.toBe(true);
    expect(calls[0].url).toBe("http://gw:8080/health/live");
  });

  it("is false when the gateway is down or answers with an error", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("connection refused");
    });
    await expect(client(down, undefined).api.reachable()).resolves.toBe(false);
    const { fetch } = fakeFetch([new Response("", { status: 503 })]);
    await expect(client(fetch, undefined).api.reachable()).resolves.toBe(false);
  });

  it("gives up after the timeout", async () => {
    const hang = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    await expect(client(hang, undefined).api.reachable(20)).resolves.toBe(false);
  });
});

describe("put", () => {
  it("sends the body as JSON with the token, and renews once on a 401", async () => {
    const seen: { method?: string; body?: string; type: string | null; auth: string | null }[] = [];
    const responses = [unauthorized(), json({ username: "tal" })];
    const fetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({
        method: init?.method,
        body: init?.body as string,
        type: headers.get("content-type"),
        auth: headers.get("authorization"),
      });
      return responses.shift() as Response;
    });
    const { api } = client(fetch, "old");
    await expect(api.put("/v1/profile", { username: "tal" })).resolves.toEqual({ username: "tal" });
    expect(seen.map((s) => s.auth)).toEqual(["Bearer old", "Bearer fresh"]);
    expect(seen[1]).toMatchObject({ method: "PUT", body: '{"username":"tal"}', type: "application/json" });
  });
});
