import type { GameSummary, ImportJob, Site } from "../../api";

export const SITE_NAMES: Record<Site, string> = { lichess: "Lichess", chesscom: "Chess.com" };

// The Library's small print: what an index card says, and whose archive a search is about.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The day a game was played, as the board prints it: "17 NOV", with the year when it is not this one. */
export function cardDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Undated";
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? day : `${day} ${d.getUTCFullYear()}`;
}

/** Moves, not half-moves: 81 plies is 41 moves. */
export function movesLabel(plies: number): string {
  const moves = Math.ceil(plies / 2);
  if (moves === 0) return "No moves";
  return moves === 1 ? "1 move" : `${moves} moves`;
}

/** A result as printed: 1–0, 0–1, ½–½, or * for a game not finished. */
export function resultLabel(result: string): string {
  if (result === "1/2-1/2") return "½–½";
  return result.replace("-", "–");
}

/**
 * The player a search is about: of the names in the games found, the one in most games, among
 * those that contain the search (any case). With no search, the one in most games, who is
 * usually the archive's owner. Nobody when no name matches.
 */
export function guessPlayer(found: readonly GameSummary[], search: string): string | undefined {
  const q = search.trim().toLowerCase();
  const count = new Map<string, { name: string; n: number }>();
  for (const g of found) {
    for (const name of [g.white, g.black]) {
      if (name === "?" || (q && !name.toLowerCase().includes(q))) continue;
      const key = name.toLowerCase();
      const seen = count.get(key);
      count.set(key, { name: seen?.name ?? name, n: (seen?.n ?? 0) + 1 });
    }
  }
  let best: { name: string; n: number } | undefined;
  for (const c of count.values()) if (!best || c.n > best.n) best = c;
  // With no search, a name in a single game is no archive's owner.
  if (!best || (!q && best.n < 2)) return undefined;
  return best.name;
}

/** An import as one line, from queued to its end. */
export function progressLine(job: ImportJob): string {
  const from = `${job.username} on ${SITE_NAMES[job.site]}`;
  const counts = `${job.fetched} read, ${job.saved} new${job.duplicates ? `, ${job.duplicates} already here` : ""}`;
  switch (job.status) {
    case "queued":
      return `Waiting to read ${from}…`;
    case "running":
      return `Reading ${from}: ${counts}…`;
    case "done":
      return job.saved
        ? `Filed ${job.saved} new ${job.saved === 1 ? "game" : "games"} from ${from}${job.duplicates ? ` (${job.duplicates} already here)` : ""}.`
        : `Nothing new from ${from}: all ${job.duplicates} ${job.duplicates === 1 ? "game is" : "games are"} already here.`;
    case "failed":
      return job.error ?? `The import of ${from} failed. Try again.`;
  }
}
