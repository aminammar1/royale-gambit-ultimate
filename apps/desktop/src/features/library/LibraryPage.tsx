import { Search as SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  explorer,
  games,
  type GameSummary,
  type ImportJob,
  type PlayerStats,
  type PopularGame,
  type Search,
  type Site,
} from "../../api";
import { useSession } from "../../api/auth/session";
import { toApiError, type ApiError } from "../../api/problem";
import { useEdition } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import { Button } from "../../ui/Button";
import { Masthead } from "../../ui/Masthead";
import { SITE_NAMES, cardDate, guessPlayer, movesLabel, progressLine, resultLabel } from "./format";

/** The opening chips under the search box: each adds its words to the search. */
const OPENINGS = [
  ["Ruy Lopez", "ruy lopez"],
  ["Sicilian", "sicilian"],
  ["Queen's Gambit", "queen's gambit"],
  ["Caro–Kann", "caro-kann"],
  ["French", "french"],
  ["English", "english"],
] as const;

const RESULTS = [
  ["any", "Any"],
  ["win", "Wins"],
  ["loss", "Losses"],
  ["draw", "Draws"],
] as const;
type ResultFilter = (typeof RESULTS)[number][0];

const PAGE = 30;
const MAX_PGN_BYTES = 5 << 20;

/** A failure in the archive's words. */
function say(error: ApiError): string {
  switch (error.kind) {
    case "offline":
      return "The server cannot be reached. Your archive is safe there; try again when it is back.";
    case "signedOut":
      return "Your session has ended. Sign in again to open your archive.";
    case "problem":
      return error.detail ?? error.title;
    default:
      return "Something went wrong. Try again.";
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * The Library (board `library-search.png`, "The archive"): the signed-in player's games as index
 * cards, searched by player, opening and words, filtered by result and date; the player card on
 * the right with their record, and imports from Lichess and Chess.com or a PGN file below it.
 * A card opens the game in Analysis. An archive lives on the server, so it needs an account: a
 * guest's identity is new each time (ADR-09).
 */
export function LibraryPage() {
  const edition = useEdition();
  const status = useSession((s) => s.status);
  const [count, setCount] = useState<string>();
  return (
    <>
      <Masthead
        kicker="Library · Search"
        title="The archive"
        dateline={[`${edition} edition`, editionDate(new Date()), "Players & games", count ?? ""]}
      />
      {status === "signedIn" ? <Archive onCount={setCount} /> : <Notice status={status} />}
    </>
  );
}

function Notice({ status }: { status: string }) {
  const offline = status === "offline";
  return (
    <section className="max-w-[40rem] py-12">
      <h2 className="font-masthead text-[length:var(--text-2xl)] font-bold">
        {offline ? "The archive is on the server" : "Sign in to keep an archive"}
      </h2>
      <div className="mt-3 border-t border-ink" />
      <p className="mt-4 font-body text-[length:var(--text-lg)] text-ink-2">
        {offline
          ? "The server cannot be reached just now. Your games are kept there, safe; they come back when it does."
          : "Your games are filed under your account, so they are there on every machine. Import them from Lichess or Chess.com, or from a PGN file, once you are signed in."}
      </p>
      {offline ? null : (
        <Link
          to="/sign-in"
          className="label mt-6 inline-block rounded-[var(--radius)] border border-ink bg-ink px-4 py-2.5 text-paper hover:bg-paper hover:text-ink"
        >
          Sign in
        </Link>
      )}
    </section>
  );
}

function Archive({ onCount }: { onCount: (line: string) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [chip, setChip] = useState<string>();
  const [result, setResult] = useState<ResultFilter>("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [player, setPlayer] = useState<string>();
  const [items, setItems] = useState<GameSummary[]>([]);
  const [next, setNext] = useState<string>();
  // Which search the cards on show answer, and what went wrong with it: loading is a search not
  // answered yet.
  const [answered, setAnswered] = useState<{ search: string; error?: string }>();
  // Bumped when an import or a file adds games, to search again.
  const [filed, setFiled] = useState(0);

  const q = useDebounced([text, chip].filter(Boolean).join(" "), 250);
  const search: Search = {
    q,
    from: from || undefined,
    to: to || undefined,
    ...(result !== "any" && player ? { player, result } : {}),
    limit: PAGE,
  };
  const key = JSON.stringify(search);
  const asked = `${key}#${filed}`;
  const loading = answered?.search !== asked;
  const error = loading ? undefined : answered?.error;

  useEffect(() => {
    let live = true;
    games
      .search(JSON.parse(key) as Search)
      .then((page) => {
        if (!live) return;
        setItems(page.items);
        setNext(page.next_cursor ?? undefined);
        // The player card follows the search, not a result filter set from it.
        if (result === "any") setPlayer(guessPlayer(page.items, text));
        setAnswered({ search: asked });
      })
      .catch((e: unknown) => live && setAnswered({ search: asked, error: say(toApiError(e)) }));
    return () => {
      live = false;
    };
    // `text` and `result` are read when the search answers; the search itself is `asked`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  useEffect(() => {
    onCount(loading ? "" : `${items.length}${next ? "+" : ""} ${items.length === 1 && !next ? "card" : "cards"}`);
  }, [items.length, next, loading, onCount]);

  const more = useCallback(async () => {
    if (!next) return;
    try {
      const page = await games.search({ ...(JSON.parse(key) as Search), cursor: next });
      setItems((list) => [...list, ...page.items]);
      setNext(page.next_cursor ?? undefined);
    } catch (e) {
      setAnswered({ search: asked, error: say(toApiError(e)) });
    }
  }, [key, next, asked]);

  // More cards as the catalogue's end scrolls into view.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || !next) return;
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void more());
    seen.observe(el);
    return () => seen.disconnect();
  }, [next, more]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_18rem] gap-8 py-8 max-[1279px]:grid-cols-1">
      <section aria-label="Search the archive" className="min-w-0">
        <label className="flex items-center gap-4 border-2 border-ink bg-paper px-5 py-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <SearchIcon aria-hidden className="size-6 shrink-0 text-ink-2" strokeWidth={1.5} />
          <span className="sr-only">Search a player, an opening or an event</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A player, an opening, an event…"
            maxLength={100}
            className="w-full bg-transparent font-body text-[length:var(--text-2xl)] text-ink outline-none placeholder:text-ink-2/70"
          />
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="label mr-2 text-ink-2">Openings</span>
          {OPENINGS.map(([name, words]) => {
            const on = chip === words;
            return (
              <button
                key={words}
                type="button"
                aria-pressed={on}
                onClick={() => setChip(on ? undefined : words)}
                className={`label rounded-[var(--radius)] border px-2.5 py-1.5 ${on ? "border-ink bg-ink text-paper" : "border-ink-2 text-ink hover:border-ink"}`}
              >
                {on ? "✓ " : "+ "}
                {name}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex items-end justify-between border-b border-ink pb-3">
          <h2 className="font-masthead text-[length:var(--text-2xl)] font-bold">Card catalogue</h2>
          <span className="font-mono text-[length:var(--text-sm)] text-ink-2" role="status">
            {loading ? "Searching…" : `${items.length}${next ? "+" : ""} cards`}
          </span>
        </div>

        {error ? <p className="mt-6 font-body text-[length:var(--text-lg)] text-ink">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="mt-6 font-body text-[length:var(--text-lg)] text-ink-2">
            {q || from || to || result !== "any"
              ? "No card matches. Try fewer words, or another opening."
              : "The archive is empty. Import your games from Lichess or Chess.com, or a PGN file, on the right."}
          </p>
        ) : null}

        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-5">
          {items.map((g) => (
            <li key={g.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_19rem]">
              <IndexCard game={g} onOpen={() => void navigate(`/analyze?game=${g.id}`)} />
            </li>
          ))}
        </ul>
        <div ref={end} className="h-8" />
        {next ? (
          <div className="flex justify-center pb-6">
            <Button variant="ghost" onClick={() => void more()}>
              More cards
            </Button>
          </div>
        ) : null}
      </section>

      <aside className="border-l border-rule pl-7 max-[1279px]:border-l-0 max-[1279px]:pl-0">
        <PlayerPanel player={player} filed={filed} />

        <h3 className="label mt-8 border-b border-ink pb-2 text-ink-2">Result</h3>
        <div role="radiogroup" aria-label="Result" className="mt-3 grid grid-cols-4 gap-1.5">
          {RESULTS.map(([value, name]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={result === value}
              disabled={value !== "any" && !player}
              title={value !== "any" && !player ? "Search a player first: a result is read from their side" : undefined}
              onClick={() => setResult(value)}
              className={`label rounded-[var(--radius)] border px-1 py-1.5 disabled:opacity-40 ${result === value ? "border-ink bg-ink text-paper" : "border-ink-2 text-ink hover:border-ink"}`}
            >
              {name}
            </button>
          ))}
        </div>

        <h3 className="label mt-8 border-b border-ink pb-2 text-ink-2">Filed between</h3>
        <div className="mt-3 grid grid-cols-[3rem_1fr] items-center gap-x-2 gap-y-2 font-mono text-[length:var(--text-sm)]">
          <label htmlFor="filed-from" className="label text-ink-2">
            From
          </label>
          <input
            id="filed-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="min-w-0 border border-ink-2 bg-paper px-2 py-1.5 text-ink"
          />
          <label htmlFor="filed-to" className="label text-ink-2">
            To
          </label>
          <input
            id="filed-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="min-w-0 border border-ink-2 bg-paper px-2 py-1.5 text-ink"
          />
        </div>
        <p className="mt-6 font-body text-[length:var(--text-md)] leading-relaxed text-ink-2">
          Each game is an index card: players and result above the ruled header line, opening and first moves below.
          Click a card to open it in Analysis.
        </p>

        <PopularPanel onOpen={(g) => void navigate(`/analyze?top=${g.db}:${g.id}`)} />

        <ImportPanel onFiled={() => setFiled((n) => n + 1)} suggest={player} />
      </aside>
    </div>
  );
}

/** One game as an index card (board: Card catalogue). */
function IndexCard({ game: g, onOpen }: { game: GameSummary; onOpen: () => void }) {
  const ruled = "border-b border-rule px-5 py-2";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${g.white} against ${g.black}, ${resultLabel(g.result)}${g.opening ? `, ${g.opening}` : ""}. Open in Analysis`}
      className="group block w-full border border-ink bg-paper text-left transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-2.5">
        <span
          title={`${g.white} – ${g.black}`}
          className="min-w-0 truncate font-label text-[length:var(--text-md)] font-semibold text-ink"
        >
          {g.white} – {g.black}
        </span>
        <span className="shrink-0 font-label text-[length:var(--text-md)] font-semibold tabular-nums">
          {resultLabel(g.result)}
        </span>
      </div>
      <div className="rule-double" />
      <p className={`${ruled} label text-ink-2`}>
        {g.eco ? `${g.eco} · ` : ""}
        {cardDate(g.played_at)}
      </p>
      <p className={`${ruled} truncate font-label text-[length:var(--text-md)] text-ink`}>
        {g.opening ?? "Opening not named"}
      </p>
      <p className={`${ruled} truncate font-mono text-[length:var(--text-sm)] text-ink-2`}>{g.first_moves || "—"}</p>
      <p className={`${ruled} font-mono text-[length:var(--text-sm)] text-ink-2`}>{movesLabel(g.ply_count)}</p>
      <div className={`${ruled} h-9`} />
      <div className="flex justify-center py-3">
        <span aria-hidden className="size-3.5 rounded-full border border-ink-2" />
      </div>
    </button>
  );
}

function PlayerPanel({ player, filed }: { player?: string; filed: number }) {
  // The record answers one player at one moment of the archive; another shows as loading.
  const asked = `${player}#${filed}`;
  const [answer, setAnswer] = useState<{ asked: string; stats: PlayerStats }>();
  const stats = answer?.asked === asked ? answer.stats : undefined;
  useEffect(() => {
    if (!player) return;
    let live = true;
    games
      .stats(player)
      .then((s) => live && setAnswer({ asked: `${player}#${filed}`, stats: s }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [player, filed]);

  return (
    <>
      <h3 className="label border-b border-ink pb-2 text-ink-2">Player</h3>
      <div className="mt-3 border-[3px] border-double border-ink p-1">
        <div className="border border-ink px-4 py-3">
          {player ? (
            <>
              <p className="truncate font-masthead text-[length:var(--text-2xl)] font-bold">
                {stats?.player ?? player}
              </p>
              <p className="mt-1 font-mono text-[length:var(--text-sm)] text-ink-2">
                {stats
                  ? `${stats.games} ${stats.games === 1 ? "game" : "games"}${stats.rating ? ` · ${stats.rating}` : ""}`
                  : "…"}
              </p>
            </>
          ) : (
            <p className="font-body text-[length:var(--text-md)] text-ink-2">Search a name to see a player's record.</p>
          )}
        </div>
      </div>
      {stats && stats.games > 0 ? (
        <table className="mt-4 w-full font-mono text-[length:var(--text-sm)]">
          <caption className="sr-only">Results by colour</caption>
          <thead>
            <tr className="label text-ink-2">
              <th className="py-1 text-left font-normal">As</th>
              <th className="py-1 text-right font-normal">W</th>
              <th className="py-1 text-right font-normal">D</th>
              <th className="py-1 text-right font-normal">L</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["White", stats.as_white],
                ["Black", stats.as_black],
              ] as const
            ).map(([side, r]) => (
              <tr key={side} className="border-t border-rule">
                <td className="py-1.5">{side}</td>
                <td className="py-1.5 text-right tabular-nums">{r.wins}</td>
                <td className="py-1.5 text-right tabular-nums">{r.draws}</td>
                <td className="py-1.5 text-right tabular-nums">{r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {stats && stats.openings.length > 0 ? (
        <>
          <h4 className="label mt-5 text-ink-2">Openings played most</h4>
          <ul className="mt-1">
            {stats.openings.map((o) => (
              <li key={`${o.eco}-${o.opening}`} className="flex justify-between gap-3 border-b border-rule py-1.5">
                <span className="min-w-0 truncate font-label text-[length:var(--text-sm)]">
                  {o.eco ? <span className="font-mono text-ink-2">{o.eco} </span> : null}
                  {o.opening ?? "Not named"}
                </span>
                <span className="shrink-0 font-mono text-[length:var(--text-sm)] text-ink-2 tabular-nums">
                  {o.wins}/{o.draws}/{o.losses}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

/** The top games players opened most from the explorer this week. */
function PopularPanel({ onOpen }: { onOpen: (g: PopularGame) => void }) {
  const [items, setItems] = useState<PopularGame[]>();
  useEffect(() => {
    const stop = new AbortController();
    explorer
      .popular(stop.signal)
      .then(setItems)
      .catch(() => setItems([]));
    return () => stop.abort();
  }, []);
  return (
    <section aria-labelledby="popular" className="mt-10">
      <h3 id="popular" className="label border-b border-ink pb-2 text-ink-2">
        Popular this week
      </h3>
      {items === undefined ? null : items.length === 0 ? (
        <p className="mt-3 font-body text-[length:var(--text-md)] text-ink-2">
          The masters games players open from the Explorer in Analysis gather here.
        </p>
      ) : (
        <ol>
          {items.map((g, i) => (
            <li key={`${g.db}:${g.id}`} className="border-b border-rule">
              <button
                type="button"
                onClick={() => onOpen(g)}
                className="flex w-full gap-3 py-2 text-left hover:bg-paper-2"
              >
                <span className="numeric w-4 shrink-0 text-ink-2">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-label text-[length:var(--text-sm)] text-ink">
                    {g.white} – {g.black}
                  </span>
                  <span className="numeric text-[length:var(--text-xs)] text-ink-2">
                    {resultLabel(g.result)}
                    {g.year ? ` · ${g.year}` : ""} · {g.views} {g.views === 1 ? "player" : "players"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Import from a site by username, followed live; or a PGN file. */
function ImportPanel({ onFiled, suggest }: { onFiled: () => void; suggest?: string }) {
  const [site, setSite] = useState<Site>("lichess");
  const [username, setUsername] = useState("");
  const [job, setJob] = useState<ImportJob>();
  const [line, setLine] = useState<string>();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const follow = useRef<AbortController>(undefined);
  useEffect(() => () => follow.current?.abort(), []);

  const valid = /^[A-Za-z0-9_-]{2,30}$/.test(username);

  async function start() {
    if (!valid) return;
    setBusy(true);
    setLine(undefined);
    follow.current?.abort();
    const stop = new AbortController();
    follow.current = stop;
    try {
      let current = await games.startImport(site, username);
      setJob(current);
      for await (const step of games.follow(current.id, stop.signal)) {
        current = step;
        setJob(step);
      }
      if (current.status === "done") onFiled();
    } catch (e) {
      const err = toApiError(e);
      if (err.kind !== "cancelled") setLine(say(err));
    } finally {
      setBusy(false);
    }
  }

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_PGN_BYTES) {
      setLine("That file is over 5 MB. Split it, or import from the site instead.");
      return;
    }
    setBusy(true);
    setJob(undefined);
    setLine(`Reading ${chosen.name}…`);
    try {
      const res = await games.save(await chosen.text());
      const parts = [`${res.saved} ${res.saved === 1 ? "game" : "games"} filed`];
      if (res.duplicates) parts.push(`${res.duplicates} already here`);
      if (res.rejected.length) parts.push(`${res.rejected.length} could not be read`);
      setLine(`${parts.join(", ")}.`);
      if (res.saved) onFiled();
    } catch (err) {
      setLine(say(toApiError(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="import-games" className="mt-10">
      <h3 id="import-games" className="label border-b border-ink pb-2 text-ink-2">
        Import games
      </h3>
      <div role="radiogroup" aria-label="From" className="mt-3 flex">
        {(Object.keys(SITE_NAMES) as Site[]).map((s, i) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={site === s}
            onClick={() => setSite(s)}
            className={`label flex-1 border px-3 py-1.5 ${i > 0 ? "-ml-px" : ""} ${site === s ? "relative border-ink bg-ink text-paper" : "border-ink-2 text-ink hover:border-ink"}`}
          >
            {SITE_NAMES[s]}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <input
          aria-label={`${SITE_NAMES[site]} username`}
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          placeholder={suggest && /^[A-Za-z0-9_-]{2,30}$/.test(suggest) ? suggest : "Username"}
          maxLength={30}
          className="min-w-0 flex-1 border border-ink-2 bg-paper px-3 py-2 font-mono text-[length:var(--text-sm)] text-ink focus:border-ink focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          Import
        </Button>
      </form>
      <p className="mt-3 min-h-10 font-body text-[length:var(--text-md)] text-ink-2" role="status" aria-live="polite">
        {job ? progressLine(job) : line}
      </p>
      <input
        ref={file}
        type="file"
        accept=".pgn,application/x-chess-pgn,text/plain"
        hidden
        onChange={(e) => void readFile(e)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => file.current?.click()}
        className="label text-ink underline-offset-4 hover:underline disabled:opacity-50"
      >
        Or file a PGN →
      </button>
    </section>
  );
}
