import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const { profileDb, useProfile } = await import("./profile");

const card = { cardNo: "000215", username: "kingside_tal", country: "TN", registeredAt: 1 };

beforeEach(() => {
  invoke.mockReset();
  useProfile.setState({ status: "loading", card: undefined });
});

describe("profileDb", () => {
  it("a first run says so", async () => {
    invoke.mockResolvedValueOnce({ state: "new" });
    await profileDb.load();
    expect(invoke).toHaveBeenCalledWith("profile_get", undefined);
    expect(useProfile.getState().status).toBe("new");
  });

  it("registering stores the card", async () => {
    invoke.mockResolvedValueOnce(card);
    await profileDb.register("kingside_tal", "TN");
    expect(invoke).toHaveBeenCalledWith("profile_register", { username: "kingside_tal", country: "TN" });
    expect(useProfile.getState()).toMatchObject({ status: "registered", card });
  });

  it("a refused registration changes nothing and comes back typed", async () => {
    useProfile.setState({ status: "new" });
    invoke.mockRejectedValueOnce({ kind: "invalid", field: "username", message: "3 to 20 characters" });
    await expect(profileDb.register("x", "TN")).rejects.toMatchObject({ kind: "invalid", field: "username" });
    expect(useProfile.getState().status).toBe("new");
  });

  it("continuing as a guest is remembered", async () => {
    invoke.mockResolvedValueOnce({ state: "guest" });
    await profileDb.continueAsGuest();
    expect(useProfile.getState().status).toBe("guest");
  });

  it("an untyped failure reads as a storage error", async () => {
    invoke.mockRejectedValueOnce("command profile_get not found");
    await expect(profileDb.load()).rejects.toEqual({ kind: "storage", message: "command profile_get not found" });
  });
});
