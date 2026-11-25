import { readProblem, type ApiError } from "./problem";

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

  type Body = { method: "GET" } | { method: "PUT"; json: string };

  async function send(path: string, token: string | undefined, body: Body): Promise<Response> {
    const headers = new Headers({ accept: "application/json" });
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (body.method !== "GET") headers.set("content-type", "application/json");
    try {
      return await fetchImpl(`${await deps.baseUrl()}${path}`, {
        method: body.method,
        headers,
        ...(body.method === "GET" ? {} : { body: body.json }),
      });
    } catch {
      throw { kind: "offline" } satisfies ApiError;
    }
  }

  async function call<T>(path: string, body: Body): Promise<T> {
    const token = deps.accessToken();
    let response = await send(path, token, body);
    if (response.status === 401 && token) {
      const renewed = await deps.refresh();
      if (renewed) response = await send(path, renewed, body);
    }
    if (!response.ok) throw await readProblem(response);
    return (await response.json()) as T;
  }

  const get = <T>(path: string) => call<T>(path, { method: "GET" });
  const put = <T>(path: string, value: unknown) => call<T>(path, { method: "PUT", json: JSON.stringify(value) });

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

  return { get, put, reachable };
}
