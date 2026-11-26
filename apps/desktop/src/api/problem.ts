/**
 * Every way a call can fail, in one shape for both paths: the Rust core sends these over
 * `invoke`, and the fetch client builds the same from problem+json. The UI only ever
 * deals with this type.
 */
export type ApiError =
  | {
      kind: "problem";
      status: number;
      /** The last segment of the problem `type`, such as `code-invalid`. */
      problemType: string;
      title: string;
      detail?: string | null;
      attemptsLeft?: number | null;
    }
  | { kind: "offline" }
  | { kind: "signedOut" }
  | { kind: "cancelled" }
  | { kind: "timedOut" }
  | { kind: "keychain"; message: string }
  | { kind: "unexpected"; message: string };

const kinds = new Set(["problem", "offline", "signedOut", "cancelled", "timedOut", "keychain", "unexpected"]);

export function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && kinds.has((value as { kind?: unknown }).kind as string);
}

/** Whatever a rejected promise carried, as an ApiError. */
export function toApiError(value: unknown): ApiError {
  if (isApiError(value)) return value;
  if (value instanceof Error) return { kind: "unexpected", message: value.message };
  return { kind: "unexpected", message: String(value) };
}

type ProblemBody = { type?: string; title?: string; detail?: string; attempts_left?: number };

/** Reads an error response. A proxy may answer with HTML; the status still says enough. */
export async function readProblem(response: Response): Promise<ApiError> {
  let body: ProblemBody = {};
  try {
    body = (await response.json()) as ProblemBody;
  } catch {
    // Not JSON: keep the status and the reason phrase.
  }
  const type = body.type ?? "about:blank";
  return {
    kind: "problem",
    status: response.status,
    problemType: type.slice(type.lastIndexOf("/") + 1),
    title: body.title ?? (response.statusText || "Error"),
    detail: body.detail,
    attemptsLeft: body.attempts_left,
  };
}

/** The line the Settings page prints under a card. Plain words, newspaper-short. */
export function describeError(error: ApiError): string {
  switch (error.kind) {
    case "offline":
      return "Needs connection";
    case "signedOut":
      return "Sign in first";
    case "cancelled":
      return "Sign-in cancelled on Lichess";
    case "timedOut":
      return "Lichess took too long · try again";
    case "keychain":
      return "The system keychain is locked or missing";
    case "unexpected":
      return "Something went wrong · try again";
    case "problem":
      return describeProblem(error);
  }
}

function describeProblem(error: Extract<ApiError, { kind: "problem" }>): string {
  switch (error.problemType) {
    case "code-invalid": {
      const left = error.attemptsLeft ?? 0;
      if (left <= 0) return "No tries left · ask for a new code";
      return `That code is not right · ${left} ${left === 1 ? "try" : "tries"} left`;
    }
    case "code-expired":
      return "That code has run out · ask for a new one";
    case "too-many-codes":
      return "Too many codes · wait a while";
    case "mail-unavailable":
      return "The code could not be mailed · try again soon";
    case "identity-taken":
      return "Already linked to another Royale Gambit card";
    case "last-identity":
      return "Link an email first: Lichess is your only way in";
    case "oauth-state-invalid":
      return "That Lichess sign-in expired · start again";
    case "lichess-code-invalid":
      return "Lichess refused the sign-in · start again";
    case "lichess-unavailable":
      return "Lichess is not answering · try again soon";
    case "refresh-invalid":
    case "refresh-reused":
      return "Your session ended · sign in again";
    case "engine-busy":
      return "Every engine is busy · trying again shortly";
    case "engine-unavailable":
      return "The engine is not running · try again soon";
    case "invalid-position":
      return error.detail ?? "The engine cannot analyse this position";
  }
  if (error.status === 429) return "Too many tries · wait a minute";
  return error.title;
}
