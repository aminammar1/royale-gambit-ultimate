import type { components } from "./generated/analysis";
import type { ApiError } from "./problem";
import { readProblem } from "./problem";
import { readEvents } from "./sse";

export type Analysis = components["schemas"]["Analysis"];
export type EngineLine = components["schemas"]["Line"];
export type AnalysisRequest = {
  fen: string;
  moves?: string[];
  depth?: number;
  multipv?: number;
};

export type AnalysisClientDeps = {
  baseUrl: () => Promise<string>;
  /** The signed-in session's access token; undefined for a guest on this machine. */
  sessionToken: () => string | undefined;
  /** Renews the session through the Rust core; the new access token, or undefined. */
  renewSession: () => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
};

type GuestToken = { token: string; expiresAt: number };

/**
 * The engine on the server (contracts/openapi/analysis.yaml), streamed. A player without an
 * account still gets one: a guest access token from auth-profile, held in memory for its 15
 * minutes and never written anywhere. Its refresh token is dropped: refresh tokens only ever
 * live in the OS keychain (CLAUDE.md), and a guest needs none.
 */
export function createAnalysisClient(deps: AnalysisClientDeps) {
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const now = deps.now ?? Date.now;
  let guest: GuestToken | undefined;

  async function guestToken(): Promise<string> {
    if (guest && guest.expiresAt - 30_000 > now()) return guest.token;
    const response = await post("/v1/auth/guest", undefined, undefined, undefined, "application/json");
    if (!response.ok) throw await readProblem(response);
    const pair = (await response.json()) as { access_token: string; expires_in: number };
    guest = { token: pair.access_token, expiresAt: now() + pair.expires_in * 1000 };
    return guest.token;
  }

  async function post(
    path: string,
    json: string | undefined,
    token?: string,
    signal?: AbortSignal,
    accept = "text/event-stream",
  ) {
    const headers = new Headers({ accept });
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (json !== undefined) headers.set("content-type", "application/json");
    try {
      return await fetchImpl(`${await deps.baseUrl()}${path}`, { method: "POST", headers, body: json, signal });
    } catch (error) {
      if (signal?.aborted) throw { kind: "cancelled" } satisfies ApiError;
      void error;
      throw { kind: "offline" } satisfies ApiError;
    }
  }

  /**
   * Analyses one position at live priority. `onInfo` gets the lines as the search deepens; the
   * promise ends with the final analysis. Abort `signal` to stop: the server stops the engine.
   */
  async function analyse(
    request: AnalysisRequest,
    { onInfo, signal }: { onInfo?: (line: EngineLine) => void; signal?: AbortSignal } = {},
  ): Promise<Analysis> {
    const body = JSON.stringify(request);
    const session = deps.sessionToken();
    let response = await post("/v1/analysis/positions", body, session ?? (await guestToken()), signal);
    if (response.status === 401) {
      // An expired token: the session renews through the Rust core, a guest just asks again.
      let retry: string | undefined;
      if (session) retry = await deps.renewSession();
      else {
        guest = undefined;
        retry = await guestToken();
      }
      if (retry) response = await post("/v1/analysis/positions", body, retry, signal);
    }
    if (!response.ok || !response.body) throw await readProblem(response);
    try {
      for await (const { event, data } of readEvents(response.body)) {
        if (event === "info") onInfo?.(JSON.parse(data) as EngineLine);
        else if (event === "result") return JSON.parse(data) as Analysis;
        else if (event === "error") throw problemFromEvent(data);
      }
    } catch (error) {
      if (signal?.aborted) throw { kind: "cancelled" } satisfies ApiError;
      throw error;
    }
    throw { kind: "unexpected", message: "the analysis ended without a result" } satisfies ApiError;
  }

  return { analyse };
}

export type AnalysisClient = ReturnType<typeof createAnalysisClient>;

/** A problem that came as an `error` event, after the stream had started. */
function problemFromEvent(data: string): ApiError {
  try {
    const p = JSON.parse(data) as { type?: string; title?: string; status?: number; detail?: string };
    const type = p.type ?? "about:blank";
    return {
      kind: "problem",
      status: p.status ?? 503,
      problemType: type.slice(type.lastIndexOf("/") + 1),
      title: p.title ?? "Error",
      detail: p.detail,
    };
  } catch {
    return { kind: "unexpected", message: data };
  }
}
