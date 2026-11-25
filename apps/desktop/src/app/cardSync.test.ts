import { describe, expect, it } from "vitest";
import { decideCard } from "./cardSync";

const local = (over: object = {}) => ({
  username: "amineammar",
  country: "TN",
  ownerId: null as string | null,
  updatedAt: 2_000,
  synced: false,
  ...over,
});
const remote = (updatedAt: number) => ({ username: "server_name", country: "FR", updatedAt });

describe("decideCard", () => {
  it("takes the account's card from the server onto a machine without one", () => {
    expect(decideCard(undefined, remote(1_000), "u1")).toBe("adopt");
  });

  it("takes the server's card over another account's or a guest's", () => {
    expect(decideCard(local({ ownerId: "u2" }), remote(1_000), "u1")).toBe("adopt");
    expect(decideCard(local(), remote(1_000), "u1")).toBe("adopt");
  });

  it("sends the owner's newer local edit, and takes the server's when it is newer", () => {
    expect(decideCard(local({ ownerId: "u1", updatedAt: 3_000 }), remote(1_000), "u1")).toBe("push");
    expect(decideCard(local({ ownerId: "u1", updatedAt: 1_000, synced: true }), remote(5_000), "u1")).toBe("adopt");
    expect(decideCard(local({ ownerId: "u1", updatedAt: 1_000, synced: true }), remote(1_000), "u1")).toBe("none");
  });

  it("uploads a guest's card, or the owner's, when the account has none on the server", () => {
    expect(decideCard(local(), undefined, "u1")).toBe("push");
    expect(decideCard(local({ ownerId: "u1" }), undefined, "u1")).toBe("push");
  });

  it("asks for a card when the account has none and the machine's belongs to someone else", () => {
    expect(decideCard(local({ ownerId: "u2" }), undefined, "u1")).toBe("register");
    expect(decideCard(undefined, undefined, "u1")).toBe("register");
  });
});
