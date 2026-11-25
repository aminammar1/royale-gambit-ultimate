import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useSession } from "../../api/auth/session";
import { toApiError } from "../../api/problem";
import { registerForAccount } from "../../app/cardSync";
import { signInLabel } from "../account/cards";
import { useIdentities } from "../account/identities";
import { editionDate } from "../../app/editionDate";
import { useEdition } from "../../app/edition";
import { profileDb, type DbError } from "../../db/profile";
import { Masthead } from "../../ui/Masthead";
import { Flag } from "../../ui/Flag";
import { PlayerCard } from "../../ui/PlayerCard";
import logo from "../../assets/logo.png";
import { searchCountries, usernameProblem, type Country } from "./countries";

const inputClass =
  "w-full rounded-[var(--radius)] border border-ink-2 bg-paper px-4 py-2.5 font-body text-[length:var(--text-lg)] text-ink placeholder:text-ink-2 hover:border-ink";

function StepHeading({ no, children }: { no: number; children: string }) {
  return (
    <h2 className="flex items-baseline gap-3 border-b border-ink pb-3 font-masthead text-[length:var(--text-xl)] font-bold">
      <span className="numeric font-masthead">{no}</span>
      {children}
    </h2>
  );
}

/** Column 1: a searchable list of federations, driven from the search box with the arrow keys. */
function Federation({ picked, onPick }: { picked?: Country; onPick: (country: Country) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const found = useMemo(() => searchCountries(query), [query]);

  const move = (to: number) => {
    const next = Math.max(0, Math.min(found.length - 1, to));
    setActive(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Enter" && found[active]) onPick(found[active]);
    else return;
    event.preventDefault();
  };

  return (
    <section className="flex min-h-0 flex-col pr-7">
      <StepHeading no={1}>Your federation</StepHeading>
      <label className="label mt-5 block text-ink-2" htmlFor={`${listId}-search`}>
        Search countries
      </label>
      <input
        id={`${listId}-search`}
        className={`${inputClass} mt-2`}
        placeholder="Type a country"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={found[active] ? `${listId}-${found[active].code}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-label="Countries"
        className="mt-3 h-[calc(100vh-23rem)] min-h-48 overflow-y-auto border-t border-ink max-[1279px]:h-[26rem]"
      >
        {found.map((country, i) => {
          const selected = picked?.code === country.code;
          return (
            <li
              key={country.code}
              id={`${listId}-${country.code}`}
              role="option"
              aria-selected={selected}
              onClick={() => onPick(country)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-4 border-b border-rule px-3 py-2.5 ${
                selected ? "bg-paper-2 font-semibold" : i === active ? "bg-paper-2/60" : ""
              }`}
            >
              <Flag code={country.code} className="text-[1.5rem]" />
              <span className="min-w-0 flex-1 truncate font-body text-[length:var(--text-lg)] text-ink">
                {country.name}
              </span>
              <span className="numeric text-[length:var(--text-sm)] text-ink-2">{country.alpha3}</span>
              {selected ? <span aria-hidden>✓</span> : null}
            </li>
          );
        })}
        {found.length === 0 ? (
          <li className="px-3 py-4 font-body text-ink-2">No country by that name. Try its English name or code.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** First run (board: design/newsprint/welcome.png): register the player card for this machine. */
export function WelcomePage() {
  const edition = useEdition();
  const navigate = useNavigate();
  const [country, setCountry] = useState<Country>();
  // Undefined until the player types: a Lichess player starts from their Lichess name.
  const [typed, setTyped] = useState<string>();
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DbError>();
  const signedIn = useSession((s) => s.status === "signedIn" || s.status === "offline");
  const userId = useSession((s) => s.account?.userId);
  const identities = useIdentities((s) => s.list);
  const lichessName = identities?.find((i) => i.provider === "lichess")?.label;
  const username = typed ?? lichessName ?? "";
  const setUsername = setTyped;

  const problem = usernameProblem(username);
  const reason = !country ? "Pick a country first." : problem ? "Choose a username." : undefined;
  const showProblem = touched && username.length > 0 && problem;
  const fieldError = failure?.kind === "invalid" ? failure : undefined;

  const register = async () => {
    if (!country || problem) return;
    setBusy(true);
    setFailure(undefined);
    try {
      if (userId) {
        // Signed in: the card belongs to the account and goes to the server with it.
        await registerForAccount(username.trim(), country.code, userId, signInLabel(identities) ?? "your account");
      } else {
        await profileDb.register(username.trim(), country.code);
      }
      navigate("/welcome/keep", { replace: true });
    } catch (error) {
      const api = toApiError(error);
      if (api.kind === "problem" && api.status === 409) {
        setFailure({ kind: "invalid", field: "username", message: "That username is taken. Try another." });
      } else if (
        "kind" in (error as object) &&
        ["invalid", "alreadyRegistered", "storage"].includes((error as DbError).kind)
      ) {
        setFailure(error as DbError);
      } else {
        setFailure({ kind: "storage", message: "The card could not be saved. Try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const asGuest = async () => {
    try {
      await profileDb.continueAsGuest();
    } finally {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="flex min-h-full flex-col px-14 max-[1279px]:px-8">
      <Masthead
        kicker="Federation registration · Step 1 of 2"
        title="Royale Gambit Ultimate"
        dateline={[
          `${edition} edition`,
          editionDate(new Date()),
          ...(signedIn
            ? ["Signed in", "Your card is saved to your account"]
            : ["No email · no password", "Your profile stays on this machine"]),
        ]}
      />
      <div className="grid h-[calc(100vh-11.5rem)] min-h-[34rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] pt-6 pb-4 max-[1279px]:h-auto max-[1279px]:grid-cols-2">
        <Federation picked={country} onPick={setCountry} />

        <section className="flex flex-col border-l border-rule px-7">
          <StepHeading no={2}>Your name on the card</StepHeading>
          <label className="label mt-5 block text-ink-2" htmlFor="welcome-username">
            Username
          </label>
          <input
            id="welcome-username"
            className={`${inputClass} mt-2`}
            placeholder="e.g. kingside_tal"
            autoComplete="nickname"
            spellCheck={false}
            maxLength={40}
            value={username}
            aria-invalid={Boolean(showProblem || fieldError)}
            aria-describedby="welcome-username-rule"
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void register();
            }}
          />
          <p id="welcome-username-rule" className="mt-3 font-body text-[length:var(--text-md)] text-ink-2">
            3 to 20 characters. Letters, digits, _ and - only.
          </p>
          {showProblem || fieldError ? (
            <p role="alert" className="mt-1 font-body text-[length:var(--text-md)] text-accent">
              <span aria-hidden>✗ </span>
              {fieldError?.message ?? problem}
            </p>
          ) : null}
          <p className="mt-6 font-body text-[length:var(--text-lg)] text-ink-2">
            {signedIn
              ? "Your card is saved to your account, so it follows you to any machine you sign in on."
              : "Your card stays on this machine. Sign in later and it follows your account."}
          </p>
          <div className="mt-auto border-t border-rule pt-6">
            {/* Not the shared Button: the board draws the waiting state as a pale box, not a faded one. */}
            <button
              type="button"
              className={`label w-full rounded-[var(--radius)] border py-3.5 text-[length:var(--text-sm)] transition-colors duration-150 ${
                reason || busy
                  ? "cursor-not-allowed border-rule bg-paper-2 text-ink-2"
                  : "border-ink bg-ink text-paper hover:opacity-90"
              }`}
              disabled={Boolean(reason) || busy}
              onClick={() => void register()}
            >
              {busy ? "Registering…" : "Register & continue"}
            </button>
            <p className="mt-3 min-h-[1.5em] font-body text-[length:var(--text-md)] text-ink-2">
              {failure && failure.kind !== "invalid"
                ? failure.kind === "alreadyRegistered"
                  ? "This machine already holds a card."
                  : "The card could not be saved on this machine. Try again."
                : reason}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <button
                type="button"
                className="label text-[length:var(--text-sm)] text-ink underline underline-offset-4 hover:no-underline"
                onClick={() => void asGuest()}
              >
                {signedIn ? "Skip the card for now" : "Continue as guest"}
              </button>
              {signedIn ? null : (
                <Link to="/sign-in" className="label text-[length:var(--text-sm)] text-ink-2 hover:text-ink">
                  Sign in instead
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="overflow-y-auto border-l border-rule pl-7 max-[1279px]:col-span-2 max-[1279px]:overflow-visible max-[1279px]:mt-8 max-[1279px]:border-t max-[1279px]:border-l-0 max-[1279px]:pt-6 max-[1279px]:pl-0">
          <img src={logo} alt="" className="mx-auto block w-40 max-[1279px]:hidden" />
          <p className="label mt-4 border-b border-ink pb-2 text-ink-2">Your player card · fills in as you go</p>
          <div className="mt-4">
            <PlayerCard username={username.trim()} country={country} issuedAt={new Date()} draft saved={signedIn} />
          </div>
          <ul className="mt-4 space-y-1 font-body text-[length:var(--text-md)]">
            <li className={country ? "text-ink" : "text-ink-2"}>
              <span aria-hidden>{country ? "✓ " : "· "}</span>Country picked
            </li>
            <li className={username && !problem ? "text-ink" : "text-ink-2"}>
              <span aria-hidden>{username && !problem ? "✓ " : "· "}</span>Username accepted
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
