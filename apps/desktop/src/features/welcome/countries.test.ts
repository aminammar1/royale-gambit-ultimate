import { describe, expect, it } from "vitest";
import contract from "../../../../../contracts/openapi/auth-profile.yaml?raw";
import { COUNTRIES, countryByCode, searchCountries, usernameProblem } from "./countries";

describe("COUNTRIES", () => {
  it("is exactly the profile contract's country list, so any pick syncs", () => {
    const block = contract.slice(contract.indexOf("officially assigned codes"));
    const enumList = block.slice(block.indexOf("enum: ["), block.indexOf("]"));
    const fromContract = [...enumList.matchAll(/"([A-Z]{2})"/g)].map((m) => m[1]).sort();
    expect(COUNTRIES.map((c) => c.code).sort()).toEqual(fromContract);
  });

  it("is sorted by English name and shows the three-letter code", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    expect(countryByCode("TN")).toEqual({ code: "TN", alpha3: "TUN", name: "Tunisia" });
  });
});

describe("searchCountries", () => {
  it("finds by name, starting words first", () => {
    const found = searchCountries("ger").map((c) => c.code);
    expect(found[0]).toBe("DE");
    expect(found).toContain("NG"); // Nigeria contains "ger" too, after Germany
  });

  it("finds by code and ignores case and accents", () => {
    expect(searchCountries("tun")[0].code).toBe("TN");
    expect(searchCountries("FR")[0].code).toBe("FR");
    expect(searchCountries("cote").map((c) => c.code)).toContain("CI");
  });

  it("an empty search lists everything", () => {
    expect(searchCountries("  ")).toHaveLength(COUNTRIES.length);
  });
});

describe("usernameProblem", () => {
  it("accepts the contract's names", () => {
    expect(usernameProblem("kingside_tal")).toBeUndefined();
    expect(usernameProblem(" Tal-1 ")).toBeUndefined();
  });

  it("says what is wrong in the board's words", () => {
    expect(usernameProblem("")).toBe("Type a name for the card.");
    expect(usernameProblem("ab")).toBe("At least 3 characters.");
    expect(usernameProblem("a".repeat(21))).toBe("At most 20 characters.");
    expect(usernameProblem("two words")).toBe("Letters, digits, _ and - only.");
  });
});
