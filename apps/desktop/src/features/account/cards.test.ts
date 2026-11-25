import { describe, expect, it } from "vitest";
import type { Identity } from "../../api";
import { credentialCards, playerName, sessionLine, since } from "./cards";

const lichess: Identity = { provider: "lichess", label: "kingside_tal", linked_at: "2026-11-12T09:30:00Z" };
const email: Identity = { provider: "email", label: "amine@example.com", linked_at: "2026-11-20T18:00:00Z" };

describe("credentialCards", () => {
  it("prints the three cards in the board's order", () => {
    expect(credentialCards([]).map((c) => [c.no, c.title, c.version])).toEqual([
      [1, "Lichess", "V1.3"],
      [2, "Email", "V1.0"],
      [3, "Chess.com", "V1.3"],
    ]);
  });

  it("a linked Lichess can be unlinked and says who it is", () => {
    const [card] = credentialCards([lichess]);
    expect(card).toMatchObject({
      linked: true,
      action: "unlink",
      detail: "Linked as kingside_tal · since 12 Nov 2026",
    });
  });

  it("an unlinked email offers to link and says what it is for", () => {
    const card = credentialCards([lichess])[1];
    expect(card).toMatchObject({
      linked: false,
      action: "link",
      detail: "Not linked · used only to restore your card",
    });
  });

  it("a linked email has nothing to press", () => {
    expect(credentialCards([email])[1]).toMatchObject({ linked: true, action: "none" });
  });

  it("Chess.com is not built yet", () => {
    expect(credentialCards([])[2]).toMatchObject({ action: "notYet", detail: "Coming in a later edition" });
  });
});

describe("since", () => {
  it("is the newspaper's short date", () => {
    expect(since("2026-09-03T12:00:00Z")).toBe("3 Sep 2026");
  });
});

describe("playerName", () => {
  it("prefers the Lichess name, then the address", () => {
    expect(playerName([email, lichess])).toBe("kingside_tal");
    expect(playerName([email])).toBe("amine@example.com");
    expect(playerName([])).toBeUndefined();
  });
});

describe("sessionLine", () => {
  it("names how the player is signed in", () => {
    expect(sessionLine("signedIn", [email, lichess])).toBe("Signed in · Lichess");
    expect(sessionLine("signedIn", [email])).toBe("Signed in · Email");
    expect(sessionLine("signedIn", undefined)).toBe("Signed in");
    expect(sessionLine("guest", undefined)).toBe("Guest");
    expect(sessionLine("loading", undefined)).toBe("Guest");
    expect(sessionLine("offline", undefined)).toBe("Offline");
  });
});
