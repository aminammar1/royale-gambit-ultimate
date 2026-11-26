import { describe, expect, it } from "vitest";
import { describeError, readProblem, toApiError, type ApiError } from "./problem";

const problem = (problemType: string, extra: Partial<Extract<ApiError, { kind: "problem" }>> = {}): ApiError => ({
  kind: "problem",
  status: 401,
  problemType,
  title: problemType,
  ...extra,
});

describe("describeError", () => {
  it("words the engine's problems and the gateway's own failures", () => {
    expect(describeError(problem("engine-busy", { status: 503 }))).toBe("Every engine is busy · trying again shortly");
    expect(describeError(problem("invalid-position", { status: 400, detail: "move 1 (e2e5) is not legal" }))).toBe(
      "move 1 (e2e5) is not legal",
    );
    expect(describeError(problem("blank", { status: 502, title: "Bad Gateway" }))).toBe("The server did not answer · try again soon");
  });
  it("counts down the tries left on a wrong code", () => {
    expect(describeError(problem("code-invalid", { attemptsLeft: 3 }))).toBe("That code is not right · 3 tries left");
    expect(describeError(problem("code-invalid", { attemptsLeft: 1 }))).toBe("That code is not right · 1 try left");
  });

  it("sends the player back for a new code once the old one is spent", () => {
    expect(describeError(problem("code-invalid", { attemptsLeft: 0 }))).toBe("No tries left · ask for a new code");
    expect(describeError(problem("code-expired"))).toBe("That code has run out · ask for a new one");
  });

  it("explains the refusals a player can act on", () => {
    expect(describeError(problem("identity-taken", { status: 409 }))).toBe(
      "Already linked to another Royale Gambit card",
    );
    expect(describeError(problem("last-identity", { status: 409 }))).toBe(
      "Link an email first: Lichess is your only way in",
    );
    expect(describeError(problem("about:blank", { status: 429 }))).toBe("Too many tries · wait a minute");
    expect(describeError(problem("too-many-codes", { status: 429 }))).toBe("Too many codes · wait a while");
  });

  it("names the states that are not the player's fault", () => {
    expect(describeError({ kind: "offline" })).toBe("Needs connection");
    expect(describeError({ kind: "cancelled" })).toBe("Sign-in cancelled on Lichess");
    expect(describeError({ kind: "timedOut" })).toBe("Lichess took too long · try again");
    expect(describeError({ kind: "keychain", message: "locked" })).toBe("The system keychain is locked or missing");
  });

  it("falls back to the server's own title", () => {
    expect(describeError(problem("something-new", { title: "Odd thing" }))).toBe("Odd thing");
  });
});

describe("toApiError", () => {
  it("keeps a typed error from the Rust core as it is", () => {
    const typed = problem("code-expired");
    expect(toApiError(typed)).toBe(typed);
  });

  it("turns anything else into an unexpected error with its message", () => {
    expect(toApiError(new Error("boom"))).toEqual({ kind: "unexpected", message: "boom" });
    expect(toApiError("command not found")).toEqual({ kind: "unexpected", message: "command not found" });
  });
});

describe("readProblem", () => {
  it("reads problem+json into the same shape the Rust core sends", async () => {
    const response = new Response(
      JSON.stringify({ type: "https://royale-gambit.dev/problems/last-identity", title: "Cannot unlink", status: 409 }),
      { status: 409, headers: { "content-type": "application/problem+json" } },
    );
    expect(await readProblem(response)).toEqual({
      kind: "problem",
      status: 409,
      problemType: "last-identity",
      title: "Cannot unlink",
      detail: undefined,
      attemptsLeft: undefined,
    });
  });

  it("copes with a body that is not a problem", async () => {
    const response = new Response("<html>", { status: 502, statusText: "Bad Gateway" });
    expect(await readProblem(response)).toMatchObject({ kind: "problem", status: 502, problemType: "about:blank" });
  });
});
