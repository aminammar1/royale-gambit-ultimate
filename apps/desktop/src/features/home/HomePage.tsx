import { Link } from "react-router";
import { editionDate, greeting } from "../../app/editionDate";
import { useEdition } from "../../app/edition";
import { BoardPlaceholder } from "../../ui/BoardPlaceholder";
import { Kicker } from "../../ui/Kicker";
import { Masthead } from "../../ui/Masthead";

const HEADLINES = [
  {
    kicker: "Play · two at one board",
    title: "Play Local",
    text: "Clocks, auto-flip and a score sheet that keeps itself.",
    to: "/play",
    size: "text-[3.25rem]",
  },
  {
    kicker: "Analysis",
    title: "Analyze a Position",
    text: "Engine best move, top three lines, eval bar.",
    to: "/analyze",
    size: "text-[2.5rem]",
  },
  {
    kicker: "Training",
    title: "Puzzles",
    text: "One position a day, more on request.",
    to: "/puzzles",
    size: "text-[2.5rem]",
  },
  {
    kicker: "Review",
    title: "Review a Game",
    text: "Accuracy, eval graph and the moments that mattered.",
    to: "/review",
    size: "text-[2.5rem]",
  },
];

/** Section A, the front page: headlines, the chess column and recent games, in three ruled columns. */
export function HomePage() {
  const edition = useEdition();
  const now = new Date();
  return (
    <>
      <Masthead
        kicker="Section A · Front page"
        title="Royal Gambit Ultimate"
        dateline={[`${edition} edition`, editionDate(now), "No. 1", `${greeting(now)}, Guest`]}
      />
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.95fr)] py-8">
        <section aria-labelledby="headlines" className="pr-8">
          <Kicker>
            <span id="headlines">Today’s headlines</span>
          </Kicker>
          <ul>
            {HEADLINES.map((h) => (
              <li key={h.title} className="border-b border-rule py-5">
                <Link to={h.to} className="group block">
                  <p className="label text-ink-2">{h.kicker}</p>
                  <h2
                    className={`mt-1 font-masthead ${h.size} leading-[1.1] font-bold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-8`}
                  >
                    {h.title}
                  </h2>
                  <p className="mt-2 font-label text-[length:var(--text-lg)] text-ink-2">{h.text}</p>
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

        <section aria-labelledby="recent" className="border-l border-rule pl-8">
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
    </>
  );
}
