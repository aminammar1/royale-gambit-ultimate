import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useServer } from "../../api";
import { auth, useSession } from "../../api/auth/session";
import { toApiError, type ApiError } from "../../api/problem";
import { CHAMPIONS } from "../../app/champions";
import { useEdition, useEditionStore } from "../../app/edition";
import { editionDate } from "../../app/editionDate";
import logo from "../../assets/logo.png";
import { useProfile } from "../../db/profile";
import { BrandMark } from "../../ui/BrandMark";
import { Button } from "../../ui/Button";
import { Flag } from "../../ui/Flag";
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
  const card = useProfile((s) => s.card);
  const [mismatch, setMismatch] = useState(false);

  // The card's owner, when it has one: the page says which way in leads back to it.
  const owner = card?.ownerId ? { label: card.ownerLabel ?? undefined } : undefined;
  const ownerEmail = card?.ownerLabel?.startsWith("Email · ") ? card.ownerLabel.slice("Email · ".length) : undefined;
  const ownerUsesLichess = card?.ownerLabel?.startsWith("Lichess · ") ?? false;

  // A machine without a card registers one next; the gate sends a signed-in player there too.
  // Signing in as someone other than the card's owner stops here, so it is never a surprise.
  const enter = () => {
    const userId = useSession.getState().account?.userId;
    if (card?.ownerId && userId && userId !== card.ownerId) {
      setMismatch(true);
      return;
    }
    navigate(firstRun ? "/welcome" : "/", { replace: true });
  };

  const signOutAgain = async () => {
    await auth.signOut().catch(() => undefined);
    setMismatch(false);
  };

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
        <p className="mt-5 max-w-[38rem] border-t border-rule pt-3 font-body text-[length:var(--text-sm)] text-ink-2">
          Every undisputed world champion, from Steinitz in 1886 to Gukesh in 2024.
        </p>
        <p className="mt-2 font-body text-[length:var(--text-xs)] text-ink-2">
          Kramnik: photo by Vladimir Barskij, CC BY-SA 3.0, via Wikimedia Commons.
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

        {card && owner && !mismatch ? (
          <div className="mt-5 flex items-center gap-4 border border-ink px-4 py-3">
            <Flag code={card.country} className="text-[1.75rem]" />
            <p className="min-w-0 font-body text-[length:var(--text-md)]">
              <span className="font-semibold">This machine’s card: {card.username}.</span>{" "}
              <span className="text-ink-2">
                {owner.label
                  ? `Sign in with ${owner.label} to use it.`
                  : "Sign in with the account you registered it with to use it."}
              </span>
            </p>
          </div>
        ) : null}

        {mismatch && card ? (
          <div role="alert" className="mt-6 border border-ink px-5 py-4">
            <h3 className="font-masthead text-[length:var(--text-xl)] font-bold">Not this card’s account</h3>
            <p className="mt-2 font-body text-[length:var(--text-md)] text-ink-2">
              You are signed in, but {card.username}’s card on this machine belongs to{" "}
              {owner?.label ? `the account you reach with ${owner.label}` : "another account"}. Email and Lichess
              sign-ins are separate accounts until you link one to the other in Settings.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void signOutAgain()}>
                Sign out and try again
              </Button>
              <Button onClick={() => navigate("/", { replace: true })}>Continue with this account</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <EmailCodeForm submitLabel="Sign in" onDone={enter} initialEmail={ownerEmail} />
            </div>

            <div className="my-6 flex items-center gap-4" aria-hidden>
              <span className="flex-1 border-t border-rule" />
              <span className="font-body text-ink-2 italic">or</span>
              <span className="flex-1 border-t border-rule" />
            </div>

            <Button
              variant={ownerUsesLichess ? "primary" : "secondary"}
              className="flex w-full items-center justify-center gap-3 py-3"
              disabled={lichess === "waiting"}
              onClick={() => void withLichess()}
            >
              <BrandMark brand="lichess" size={18} />
              {lichess === "waiting" ? "Waiting for lichess.org…" : "Sign in with Lichess"}
            </Button>
            {lichess === "waiting" ? (
              <Notice>Finish on lichess.org in your browser. This page waits up to 5 minutes.</Notice>
            ) : (
              <Notice error={lichessError} />
            )}
            <Button disabled className="mt-3 flex w-full items-center justify-center gap-3 py-3">
              <BrandMark brand="chesscom" size={18} />
              Chess.com · in a later edition
            </Button>
          </>
        )}

        <div className={`mt-12 ${mismatch ? "hidden" : ""}`}>
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
