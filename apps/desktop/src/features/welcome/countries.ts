import isoCountries from "i18n-iso-countries";
import type { components } from "../../api/generated/auth-profile";

/** The codes the profile contract takes (ISO 3166-1 alpha-2, officially assigned). */
export type CountryCode = components["schemas"]["ProfileWrite"]["country"];

export type Country = { code: CountryCode; alpha3: string; name: string };

// Kosovo's XK is a user-assigned code: widely used, but not one the contract accepts.
const NOT_ASSIGNED = new Set(["XK"]);

const names = new Intl.DisplayNames(["en"], { type: "region" });

/** Every federation a player can pick, by English name. */
export const COUNTRIES: Country[] = Object.entries(isoCountries.getAlpha2Codes())
  .filter(([code]) => !NOT_ASSIGNED.has(code))
  .map(([code, alpha3]) => ({ code: code as CountryCode, alpha3, name: names.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const byCode = new Map(COUNTRIES.map((c) => [c.code as string, c]));

export function countryByCode(code: string): Country | undefined {
  return byCode.get(code);
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Matches a code exactly, then names starting with the query (or a word of it), then any name containing it. */
export function searchCountries(query: string): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES;
  const rank = (c: Country) => {
    if (c.code.toLowerCase() === q || c.alpha3.toLowerCase() === q) return 0;
    const name = fold(c.name);
    if (name.startsWith(q)) return 1;
    if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) return 2;
    if (name.includes(q)) return 3;
    return -1;
  };
  return COUNTRIES.map((c) => ({ c, r: rank(c) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(({ c }) => c);
}

/** What is wrong with a username, in the board's words; undefined when it is fine. */
export function usernameProblem(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return "Type a name for the card.";
  if (name.length < 3) return "At least 3 characters.";
  if (name.length > 20) return "At most 20 characters.";
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return "Letters, digits, _ and - only.";
  return undefined;
}
