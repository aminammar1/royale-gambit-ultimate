import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { auth, useSession, renewAccessToken } = await import("./session");

const signedIn = {
  state: "signedIn",
  userId: "u1",
  role: "user",
  accessToken: "a1",
  expiresAt: 1,
} as const;

beforeEach(() => {
  invoke.mockReset();
  useSession.setState({ status: "loading", account: undefined });
});

describe("auth", () => {
  it("restoring a session signs the page in", async () => {
    invoke.mockResolvedValueOnce(signedIn);
    await auth.restore();

    expect(invoke).toHaveBeenCalledWith("auth_restore", undefined);
    expect(useSession.getState()).toMatchObject({ status: "signedIn", account: { userId: "u1", accessToken: "a1" } });
  });

  it("an empty keychain reads as a guest", async () => {
    invoke.mockResolvedValueOnce({ state: "guest" });
    await auth.restore();
    expect(useSession.getState()).toEqual(expect.objectContaining({ status: "guest", account: undefined }));
  });

  it("a wrong code changes nothing and comes back typed", async () => {
    useSession.setState({ status: "guest" });
    invoke.mockRejectedValueOnce({ kind: "problem", status: 401, problemType: "code-invalid", title: "Wrong code" });

    await expect(auth.verifyEmail("a@example.com", "000000")).rejects.toMatchObject({ problemType: "code-invalid" });
    expect(useSession.getState().status).toBe("guest");
  });

  it("passes the address and code to the core", async () => {
    invoke.mockResolvedValueOnce(signedIn);
    await auth.verifyEmail("a@example.com", "123456");
    expect(invoke).toHaveBeenCalledWith("auth_email_verify", { email: "a@example.com", code: "123456" });
  });

  it("signing out returns to the guest", async () => {
    useSession.setState({ status: "signedIn", account: { ...signedIn } });
    invoke.mockResolvedValueOnce({ state: "guest" });
    await auth.signOut();
    expect(useSession.getState().status).toBe("guest");
  });

  it("a failing command that is not typed still rejects as an ApiError", async () => {
    invoke.mockRejectedValueOnce("command auth_lichess not found");
    await expect(auth.lichess()).rejects.toEqual({ kind: "unexpected", message: "command auth_lichess not found" });
  });
});

describe("renewAccessToken", () => {
  it("hands the fetch client the new token", async () => {
    invoke.mockResolvedValueOnce({ ...signedIn, accessToken: "a2" });
    await expect(renewAccessToken()).resolves.toBe("a2");
  });

  it("says undefined when the session ended", async () => {
    invoke.mockResolvedValueOnce({ state: "guest" });
    await expect(renewAccessToken()).resolves.toBeUndefined();
  });
});
