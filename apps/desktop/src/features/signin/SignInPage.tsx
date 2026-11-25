import { ChessKnight, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useServer } from "../../api";
import { auth } from "../../api/auth/session";
import { toApiError, type ApiError } from "../../api/problem";
import { CHAMPIONS } from "../../app/champions";
import { useEdition, useEditionStore } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import logo from "../../assets/logo.png";
import { useProfile } from "../../db/profile";
import { Button } from "../../ui/Button";
import { Portrait } from "../../ui/Portrait";
import { EmailCodeForm, Notice } from "../account/EmailCodeForm";

/** The left page: all eighteen world champions, three rows of six, like a newspaper photo spread. */
function ChampionsWall() {
  return (
    <ol aria-label="The world champions" className="mt-6 grid grid-cols-6 gap-x-3 gap-y-4">
      {CHAMPIONS.map((champion) => (
        <li key={champion.no}>
          <figure title={`${champion.name}, world champion from ${champion.since}`}>
            <Portrait champion={champion} className="aspect-[4/5] w-full" />
            <figcaption className="mt-1.5 min-w-0">
              <span className="sr-only">{champion.name}, </span>
              <span
                aria-hidden
                className="block truncate font-masthead text-[length:var(--text-sm)] leading-tight font-bold max-[1279px]:text-[length:var(--text-xs)]"
              >
                {champion.short}
              </span>
              <span className="numeric block text-[0.6875rem] text-ink-2">{champion.since}</span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ol>
  );
}

/** Before the app: sign in with an email code or Lichess, or carry on without an account. */
export function SignInPage() {
  const navigate = useNavigate();
  const edition = useEdition();
  const setEdition = useEditionStore((s) => s.setChoice);
  const firstRun = useProfile((s) => s.status === "new");
  const server = useServer((s) => s.status);
  const [lichess, setLichess] = useState<"idle" | "waiting">("idle");
  const [lichessError, setLichessError] = useState<ApiError>();

  // A machine without a card registers one next; the gate sends a signed-in player there too.
  const enter = () => navigate(firstRun ? "/welcome" : "/", { replace: true });

  const withLichess = async () => {
    setLichess("waiting");
    setLichessError(undefined);
    try {
      await auth.lichess();
      enter();
    } catch (error) {
      setLichessError(toApiError(error));
    } finally {
      setLichess("idle");
    }
  };

  const unreachable = server === "unreachable";
  const other = edition === "day" ? "night" : "day";

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1.4fr)_minmax(21rem,1fr)] max-[899px]:grid-cols-1">
      <section className="flex flex-col px-12 py-8 max-[1279px]:px-8 max-[899px]:order-2 max-[899px]:border-t max-[899px]:border-rule">
        <header>
          <div className="flex items-center gap-5">
            <img src={logo} alt="" className="w-24 shrink-0 max-[1279px]:w-16" draggable={false} />
            <h1 className="font-masthead text-[length:var(--text-masthead)] leading-[1.02] font-black tracking-[-0.01em] max-[1279px]:text-[2.5rem]">
              Royal Gambit Ultimate
            </h1>
          </div>
          <div className="mt-4 border-t border-ink" />
          <p className="label flex flex-wrap justify-between gap-x-6 gap-y-1 py-2 text-ink-2">
            <span>{edition} edition</span>
            <span>{editionDate(new Date())}</span>
            <span>The Hall of Champions</span>
          </p>
          <div className="rule-double" />
        </header>
        <ChampionsWall />
        <p className="mt-6 max-w-[38rem] font-body text-[length:var(--text-md)] text-ink-2 italic">
          Every undisputed world champion, from Steinitz in 1886 to Gukesh in 2024. Your card joins the same federation.
        </p>
      </section>

      <section className="flex flex-col border-l border-rule px-10 py-8 max-[1279px]:px-8 max-[899px]:border-l-0">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-masthead text-[length:var(--text-3xl)] leading-tight font-bold">Sign in</h2>
          <button
            type="button"
            onClick={() => setEdition(other)}
            aria-label={`Switch to the ${other} edition`}
            title={`Switch to the ${other} edition`}
            className="flex size-9 items-center justify-center border border-ink-2 text-ink hover:border-ink"
          >
            {edition === "day" ? (
              <Moon aria-hidden size={16} strokeWidth={1.5} />
            ) : (
              <Sun aria-hidden size={16} strokeWidth={1.5} />
            )}
          </button>
        </div>
        <div className="mt-3 border-b border-ink" />
        <p className="mt-4 font-body text-[length:var(--text-lg)] text-ink-2">
          Signing in keeps your player card safe when you change machines. We email you a code; there is no password.
        </p>

        {unreachable ? (
          <p role="status" className="mt-5 border border-ink-2 px-4 py-3 font-body text-[length:var(--text-md)]">
            The Royal Gambit server cannot be reached, so signing in will fail for now. Everything else works on this
            machine.
          </p>
        ) : null}

        <div className="mt-6">
          <EmailCodeForm submitLabel="Sign in" onDone={enter} />
        </div>

        <div className="my-6 flex items-center gap-4" aria-hidden>
          <span className="flex-1 border-t border-rule" />
          <span className="font-body text-ink-2 italic">or</span>
          <span className="flex-1 border-t border-rule" />
        </div>

        <Button
          className="flex w-full items-center justify-center gap-3 py-3"
          disabled={lichess === "waiting"}
          onClick={() => void withLichess()}
        >
          <ChessKnight aria-hidden size={18} strokeWidth={1.5} />
          {lichess === "waiting" ? "Waiting for lichess.org…" : "Sign in with Lichess"}
        </Button>
        {lichess === "waiting" ? (
          <Notice>Finish on lichess.org in your browser. This page waits up to 5 minutes.</Notice>
        ) : (
          <Notice error={lichessError} />
        )}

        <div className="mt-12">
          <div className="border-t-[3px] border-double border-ink pt-5">
            <h3 className="font-masthead text-[length:var(--text-xl)] font-bold">Play without an account</h3>
            <p className="mt-2 font-body text-[length:var(--text-md)] text-ink-2">
              Games, puzzles and your card stay on this machine. You can sign in later from Settings.
            </p>
            <Button className="mt-4" onClick={() => navigate(firstRun ? "/welcome" : "/", { replace: true })}>
              {firstRun ? "Continue without signing in" : "Back to the front page"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
