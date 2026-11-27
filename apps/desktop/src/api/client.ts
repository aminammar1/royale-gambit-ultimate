import { readProblem, type ApiError } from "./problem";
import { readEvents, type ServerEvent } from "./sse";

export type ApiClientDeps = {
  baseUrl: () => Promise<string>;
  /** The current access token; undefined for a guest. */
  accessToken: () => string | undefined;
  /** Renews the session through the Rust core; the new access token, or undefined if it ended. */
  refresh: () => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
};

export type ApiClient = {
  get: <T>(path: string) => Promise<T>;
  /** Sends `body` as JSON; same token handling as `get`. */
  put: <T>(path: string, body: unknown) => Promise<T>;
  post: <T>(path: string, body: unknown) => Promise<T>;
  /** A GET answered as server-sent events, read until the server ends it or `signal` aborts. */
  stream: (path: string, signal?: AbortSignal) => AsyncGenerator<ServerEvent>;
  /** Whether the gateway answers its liveness check within `timeoutMs`. Never throws. */
  reachable: (timeoutMs?: number) => Promise<boolean>;
};

/**
 * The web layer's calls that carry only an access token (identities, later the profile).
 * Anything touching the refresh token goes through the Rust core instead. On a 401 the
 * session is renewed once and the call retried once; a second refusal is final.
 */
export function createApiClient(deps: ApiClientDeps): ApiClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);

  type Body = { method: "GET"; accept?: string } | { method: "PUT" | "POST"; json: string };

  async function send(path: string, token: string | undefined, body: Body, signal?: AbortSignal): Promise<Response> {
    const headers = new Headers({ accept: (body.method === "GET" && body.accept) || "application/json" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (body.method !== "GET") headers.set("content-type", "application/json");
    try {
      return await fetchImpl(`${await deps.baseUrl()}${path}`, {
        method: body.method,
        headers,
        signal,
        ...(body.method === "GET" ? {} : { body: body.json }),
      });
    } catch {
      if (signal?.aborted) throw { kind: "cancelled" } satisfies ApiError;
      throw { kind: "offline" } satisfies ApiError;
    }
  }

  /** Sends once, and on a 401 renews the session and sends once more. */
  async function authorized(path: string, body: Body, signal?: AbortSignal): Promise<Response> {
    const token = deps.accessToken();
    let response = await send(path, token, body, signal);
    if (response.status === 401 && token) {
      const renewed = await deps.refresh();
      if (renewed) response = await send(path, renewed, body, signal);
    }
    if (!response.ok) throw await readProblem(response);
    return response;
  }

  const call = async <T>(path: string, body: Body): Promise<T> => (await (await authorized(path, body)).json()) as T;
  const get = <T>(path: string) => call<T>(path, { method: "GET" });
  const put = <T>(path: string, value: unknown) => call<T>(path, { method: "PUT", json: JSON.stringify(value) });
  const post = <T>(path: string, value: unknown) => call<T>(path, { method: "POST", json: JSON.stringify(value) });

  async function* stream(path: string, signal?: AbortSignal): AsyncGenerator<ServerEvent> {
    const response = await authorized(path, { method: "GET", accept: "text/event-stream" }, signal);
    if (!response.body) return;
    yield* readEvents(response.body);
  }

  async function reachable(timeoutMs = 1500): Promise<boolean> {
    try {
      const response = await fetchImpl(`${await deps.baseUrl()}/health/live`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { get, put, post, stream, reachable };
}
