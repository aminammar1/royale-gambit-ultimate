import { describe, expect, it } from "vitest";
import { gate, startPage, visibleCard } from "./gate";

describe("gate", () => {
  it("waits while either store is still loading", () => {
    expect(gate("loading", "guest", "/")).toBeUndefined();
    expect(gate("new", "loading", "/")).toBeUndefined();
  });

  it("sends a new machine with nobody signed in to the sign-in page", () => {
    expect(gate("new", "guest", "/")).toBe("/sign-in");
    expect(gate("new", "guest", "/settings")).toBe("/sign-in");
  });

  it("lets a new machine move between sign-in and the Welcome page", () => {
    expect(gate("new", "guest", "/sign-in")).toBeUndefined();
    expect(gate("new", "guest", "/welcome")).toBeUndefined();
  });

  it("sends a signed-in player without a card to register one", () => {
    expect(gate("new", "signedIn", "/")).toBe("/welcome");
    expect(gate("new", "signedIn", "/sign-in")).toBe("/welcome");
    expect(gate("new", "offline", "/")).toBe("/welcome");
    expect(gate("new", "signedIn", "/welcome")).toBeUndefined();
  });

  it("opens the app for a machine that has a card or chose to go without", () => {
    expect(gate("registered", "guest", "/")).toBeUndefined();
    expect(gate("guest", "guest", "/puzzles")).toBeUndefined();
  });

  it("still lets a player with a card open the sign-in page and step 2", () => {
    expect(gate("registered", "guest", "/sign-in")).toBeUndefined();
    expect(gate("registered", "signedIn", "/welcome/keep")).toBeUndefined();
  });

  it("never offers a second registration", () => {
    expect(gate("registered", "guest", "/welcome")).toBe("/");
    expect(gate("guest", "signedIn", "/welcome")).toBe("/");
  });
});

describe("visibleCard", () => {
  const card = { cardNo: "004217", username: "amineammar", country: "TN", registeredAt: 1, ownerId: null };
  const owned = { ...card, ownerId: "user-1" };

  it("shows a card nobody has claimed to whoever uses the machine", () => {
    expect(visibleCard(card, undefined)).toBe(card);
    expect(visibleCard(card, "user-9")).toBe(card);
  });

  it("shows a claimed card only to its owner", () => {
    expect(visibleCard(owned, "user-1")).toBe(owned);
    expect(visibleCard(owned, undefined)).toBeUndefined();
    expect(visibleCard(owned, "user-2")).toBeUndefined();
  });
});

describe("startPage", () => {
  it("opens sign-in for a new machine, Welcome for a signed-in player without a card", () => {
    expect(startPage("new", "guest", undefined)).toBe("/sign-in");
    expect(startPage("new", "signedIn", undefined)).toBe("/welcome");
  });

  it("opens sign-in when the card's owner has signed out", () => {
    expect(startPage("registered", "guest", "user-1")).toBe("/sign-in");
    expect(startPage("registered", "signedIn", "user-1")).toBe("/");
  });

  it("opens the front page for an unclaimed card or a guest machine", () => {
    expect(startPage("registered", "guest", null)).toBe("/");
    expect(startPage("guest", "guest", undefined)).toBe("/");
  });
});
