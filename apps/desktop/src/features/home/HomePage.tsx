import { usePlayerName } from "../../app/player";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ChampionQuote } from "./ChampionQuote";
import { editionDate, greeting } from "../../app/editionDate";
import { championsOfTheDay } from "../../app/champions";
import { useEdition } from "../../app/edition";
import { Portrait } from "../../ui/Portrait";
import { BoardPlaceholder } from "../../ui/BoardPlaceholder";
import { Kicker } from "../../ui/Kicker";
import { Masthead } from "../../ui/Masthead";

const HEADLINES: ReadonlyArray<{
  kicker: string;
  title: string;
  action: string;
  text: string;
  to: string;
}> = [
  {
    kicker: "Play · two at one board",
    title: "Play Local",
    action: "Start a game",
    text: "Clocks, auto-flip and a score sheet that keeps itself.",
    to: "/play",
  },
  {
    kicker: "Analysis",
    title: "Analyze a Position",
    action: "Open the board",
    text: "Engine best move, top three lines, eval bar.",
    to: "/analyze",
  },
  {
    kicker: "Training",
    title: "Puzzles",
    action: "Solve a puzzle",
    text: "One position a day, more on request.",
    to: "/puzzles",
  },
  {
    kicker: "Review",
    title: "Review a Game",
    action: "Review a game",
    text: "Accuracy, eval graph and the moments that mattered.",
    to: "/review",
  },
];

/** The front page: headlines, the chess column and recent games, in three ruled columns. */
export function HomePage() {
  const edition = useEdition();
  const now = new Date();
  const username = usePlayerName();
  return (
    <>
      <Masthead
        kicker="Front page"
        title="Royale Gambit Ultimate"
        dateline={[`${edition} edition`, editionDate(now), "No. 1", `${greeting(now)}, ${username ?? "Guest"}`]}
        actions={
          <ul aria-label="Today’s champions" className="flex gap-2">
            {championsOfTheDay(now, 3).map((champion) => (
              <li key={champion.no} title={`${champion.name}, world champion ${champion.since}`}>
                <Portrait champion={champion} className="size-24 max-[1279px]:size-16" />
              </li>
            ))}
          </ul>
        }
      />
      <ChampionQuote />
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.95fr)] py-8 max-[1599px]:grid-cols-2">
        <section
          aria-labelledby="headlines"
          className="@container pr-8 max-[1599px]:col-span-2 max-[1599px]:border-b max-[1599px]:border-rule max-[1599px]:pr-0 max-[1599px]:pb-8"
        >
          <Kicker>
            <span id="headlines">Today’s headlines</span>
          </Kicker>
          {/* Tiles that open their page, sized by this column (a container query), not by the window:
              a 2 × 2 grid when the column is wide enough, one stack when it is not. Below 1600 px the
              headlines take the full width, the column and recent games share the row beneath. */}
          <ul className="mt-5 grid gap-3 @min-[30rem]:grid-cols-2">
            {HEADLINES.map((h) => (
              <li key={h.title} className="flex">
                <Link
                  to={h.to}
                  className="group flex w-full flex-col rounded-[var(--radius)] border border-ink-2 px-5 py-4 transition-colors duration-150 hover:border-ink hover:bg-paper-2 active:bg-paper-2"
                >
                  <p className="label text-ink-2">{h.kicker}</p>
                  <h2 className="mt-1 font-masthead text-[1.625rem] leading-[1.1] font-bold @min-[30rem]:text-[1.75rem]">
                    {h.title}
                  </h2>
                  <p className="mt-2 mb-4 font-label text-[length:var(--text-sm)] text-ink-2">{h.text}</p>
                  <span className="label mt-auto inline-flex items-center gap-2 self-start rounded-[var(--radius)] border border-ink px-3 py-1.5 text-[length:var(--text-xs)] text-ink transition-colors duration-150 group-hover:bg-ink group-hover:text-paper">
                    {h.action}
                    <ChevronRight aria-hidden size={13} strokeWidth={1.75} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="column"
          className="border-l border-rule px-8 max-[1599px]:border-l-0 max-[1599px]:pt-8 max-[1599px]:pl-0"
        >
          <Kicker aside="No. —">
            <span id="column">The chess column</span>
          </Kicker>
          <h2 className="mt-4 font-masthead text-[length:var(--text-3xl)] font-bold">Daily puzzle</h2>
          <div className="mt-4 max-w-[26rem] max-[1599px]:max-w-[20rem]">
            <BoardPlaceholder label="The daily puzzle board, printed from M6" />
          </div>
          <p className="mt-4 font-body text-[length:var(--text-xl)] font-semibold">
            The column goes to press with Puzzles.
          </p>
          <p className="mt-2 font-body text-[length:var(--text-lg)] text-ink-2 italic">
            Each day a new position, set like a newspaper problem. Until then, the board waits.
          </p>
        </section>

        <div className="border-l border-rule pl-8 max-[1599px]:pt-8">
          <section aria-labelledby="recent">
            <Kicker aside={<span className="label">All results</span>}>
              <span id="recent">Recent games</span>
            </Kicker>
            <table className="mt-2 w-full border-collapse text-left">
              <thead>
                <tr className="label border-b border-ink text-ink-2">
                  <th className="py-3 font-medium">Date</th>
                  <th className="py-3 font-medium">Opponent · Opening</th>
                  <th className="py-3 text-right font-medium">Res.</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3} className="border-b border-rule py-6 font-body text-ink-2 italic">
                    No games filed yet. Play a local game and it is filed here.
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
