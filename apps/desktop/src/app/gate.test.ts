import { describe, expect, it } from "vitest";
import { gate } from "./gate";

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
