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
  size: string;
}> = [
  {
    kicker: "Play · two at one board",
    title: "Play Local",
    action: "Start a game",
    text: "Clocks, auto-flip and a score sheet that keeps itself.",
    to: "/play",
    size: "text-[2.75rem] max-[1279px]:text-[2.25rem]",
  },
  {
    kicker: "Analysis",
    title: "Analyze a Position",
    action: "Open the board",
    text: "Engine best move, top three lines, eval bar.",
    to: "/analyze",
    size: "text-[2.125rem] max-[1279px]:text-[1.75rem]",
  },
  {
    kicker: "Training",
    title: "Puzzles",
    action: "Solve a puzzle",
    text: "One position a day, more on request.",
    to: "/puzzles",
    size: "text-[2.125rem] max-[1279px]:text-[1.75rem]",
  },
  {
    kicker: "Review",
    title: "Review a Game",
    action: "Review a game",
    text: "Accuracy, eval graph and the moments that mattered.",
    to: "/review",
    size: "text-[2.125rem] max-[1279px]:text-[1.75rem]",
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
        title="Royal Gambit Ultimate"
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
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.95fr)] py-8 max-[1279px]:grid-cols-2">
        <section aria-labelledby="headlines" className="pr-8">
          <Kicker>
            <span id="headlines">Today’s headlines</span>
          </Kicker>
          {/* Each headline is a tile that opens its page, with the action spelled out as its button. */}
          <ul className="mt-5 flex flex-col gap-3">
            {HEADLINES.map((h) => (
              <li key={h.title}>
                <Link
                  to={h.to}
                  className="group block rounded-[var(--radius)] border border-ink-2 px-6 pt-5 pb-5 transition-colors duration-150 hover:border-ink hover:bg-paper-2 active:bg-paper-2"
                >
                  <p className="label text-ink-2">{h.kicker}</p>
                  <h2 className={`mt-1 font-masthead ${h.size} leading-[1.1] font-bold`}>{h.title}</h2>
                  <p className="mt-2 font-label text-[length:var(--text-md)] text-ink-2">{h.text}</p>
                  <span className="label mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-ink px-4 py-2 text-[length:var(--text-sm)] text-ink transition-colors duration-150 group-hover:bg-ink group-hover:text-paper">
                    {h.action}
                    <ChevronRight aria-hidden size={14} strokeWidth={1.75} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="column" className="border-l border-rule px-8">
          <Kicker aside="No. —">
            <span id="column">The chess column</span>
          </Kicker>
          <h2 className="mt-4 font-masthead text-[length:var(--text-3xl)] font-bold">Daily puzzle</h2>
          <div className="mt-4 max-w-[26rem]">
            <BoardPlaceholder label="The daily puzzle board, printed from M6" />
          </div>
          <p className="mt-4 font-body text-[length:var(--text-xl)] font-semibold">
            The column goes to press with Puzzles.
          </p>
          <p className="mt-2 font-body text-[length:var(--text-lg)] text-ink-2 italic">
            Each day a new position, set like a newspaper problem. Until then, the board waits.
          </p>
        </section>

        <div className="border-l border-rule pl-8 max-[1279px]:col-span-2 max-[1279px]:mt-10 max-[1279px]:border-l-0 max-[1279px]:pl-0">
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
