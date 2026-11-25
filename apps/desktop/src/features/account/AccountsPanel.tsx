import { useState, type FormEvent, type ReactNode } from "react";
import { auth, useSession } from "../../api/auth/session";
import { describeError, toApiError, type ApiError } from "../../api/problem";
import { Button } from "../../ui/Button";
import { credentialCards, type CredentialCard } from "./cards";
import { reloadIdentities, useIdentities } from "./identities";

/** One line under a card. A refusal of the player's own input is a mistake: red, with its glyph. */
function Notice({ error, children }: { error?: ApiError; children?: ReactNode }) {
  if (error) {
    const mistake = error.kind === "problem" && error.status < 500 && error.status !== 429;
    return (
      <p
        role="alert"
        className={`mt-2 font-body text-[length:var(--text-md)] ${mistake ? "text-accent" : "text-ink-2"}`}
      >
        {mistake ? <span aria-hidden>✗ </span> : null}
        {describeError(error)}
      </p>
    );
  }
  return children ? <p className="mt-2 font-body text-[length:var(--text-md)] text-ink-2">{children}</p> : null;
}

const inputClass =
  "numeric w-full rounded-[var(--radius)] border border-ink-2 bg-paper px-3 py-2 text-[length:var(--text-md)] text-ink placeholder:text-ink-2 hover:border-ink";

type EmailStep = { step: "address" } | { step: "code"; email: string };

/** Link email: the address, then the six-digit code from the mail. */
function EmailLinkForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [state, setState] = useState<EmailStep>({ step: "address" });
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [note, setNote] = useState<string>();

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (failure) {
      setError(toApiError(failure));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (email: string) =>
    run(async () => {
      await auth.startEmail(email);
      setState({ step: "code", email });
      setValue("");
      setNote(`Code sent to ${email} · it works for 10 minutes`);
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (state.step === "address") {
      void sendCode(value.trim());
      return;
    }
    void run(async () => {
      await auth.verifyEmail(state.email, value.trim());
      onDone();
    });
  };

  const spent =
    error?.kind === "problem" &&
    (error.problemType === "code-expired" || (error.problemType === "code-invalid" && !error.attemptsLeft));

  return (
    <form onSubmit={submit} className="mt-4 border-t border-rule pt-4">
      <label className="label block text-ink-2" htmlFor="link-email-input">
        {state.step === "address" ? "Email address" : "Six-digit code"}
      </label>
      <div className="mt-2 flex gap-3">
        <input
          id="link-email-input"
          key={state.step}
          autoFocus
          required
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          {...(state.step === "address"
            ? { type: "email", autoComplete: "email", placeholder: "you@example.com" }
            : {
                inputMode: "numeric" as const,
                autoComplete: "one-time-code",
                pattern: "[0-9]{6}",
                maxLength: 6,
                placeholder: "000000",
              })}
        />
        <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
          {state.step === "address" ? "Send code" : "Link email"}
        </Button>
      </div>
      <Notice error={error}>{note}</Notice>
      <div className="mt-3 flex gap-2">
        {state.step === "code" ? (
          <Button variant={spent ? "secondary" : "ghost"} disabled={busy} onClick={() => void sendCode(state.email)}>
            Ask for a new code
          </Button>
        ) : null}
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Card({ card, children, action }: { card: CredentialCard; children?: ReactNode; action: ReactNode }) {
  const frame = card.linked
    ? "border border-ink"
    : card.action === "notYet"
      ? "border border-dashed border-rule"
      : "border border-dashed border-ink-2";
  return (
    <li className={`${frame} rounded-[var(--radius)]`}>
      <div className="flex">
        <div className="min-w-0 flex-1 px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="label text-ink-2">Credential No. {card.no}</span>
            <span className="numeric text-[length:var(--text-xs)] text-ink-2">{card.version}</span>
          </div>
          <h3
            className={`mt-1 font-masthead text-[length:var(--text-2xl)] leading-tight font-bold ${card.action === "notYet" ? "text-ink-2" : "text-ink"}`}
          >
            {card.title}
          </h3>
          <p className="numeric mt-1 text-[length:var(--text-sm)] text-ink-2">{card.detail}</p>
        </div>
        <div className="flex w-44 shrink-0 items-center justify-center border-l border-rule px-4">{action}</div>
      </div>
      {children ? <div className="px-5 pb-4">{children}</div> : null}
    </li>
  );
}

/** The credential cards with their actions: Settings and the Welcome page's step 2 both show them. */
export function CredentialList() {
  const status = useSession((s) => s.status);
  const { list, error: listError } = useIdentities();
  const [linkingEmail, setLinkingEmail] = useState(false);
  const [busy, setBusy] = useState<"lichess" | "unlink">();
  const [errors, setErrors] = useState<Partial<Record<CredentialCard["provider"], ApiError>>>({});

  const offline = status === "offline";
  const cards = credentialCards(list);

  const act = async (
    what: "lichess" | "unlink",
    provider: CredentialCard["provider"],
    work: () => Promise<unknown>,
  ) => {
    setBusy(what);
    setErrors({});
    try {
      await work();
      await reloadIdentities();
    } catch (failure) {
      setErrors({ [provider]: toApiError(failure) });
    } finally {
      setBusy(undefined);
    }
  };

  const actionFor = (card: CredentialCard) => {
    if (card.action === "notYet") return <Button disabled>Not yet</Button>;
    if (card.action === "none") return null;
    const disabled = offline || busy !== undefined;
    if (card.provider === "lichess") {
      return card.action === "unlink" ? (
        <Button disabled={disabled} onClick={() => void act("unlink", "lichess", auth.unlinkLichess)}>
          {busy === "unlink" ? "Unlinking…" : "Unlink"}
        </Button>
      ) : (
        <Button disabled={disabled} onClick={() => void act("lichess", "lichess", auth.lichess)}>
          {busy === "lichess" ? "Waiting…" : "Link Lichess"}
        </Button>
      );
    }
    return (
      <Button disabled={disabled || linkingEmail} onClick={() => setLinkingEmail(true)}>
        Link email
      </Button>
    );
  };

  const extraFor = (card: CredentialCard) => {
    if (card.provider === "lichess" && busy === "lichess") {
      return <Notice>Finish on lichess.org in your browser · this waits up to 5 minutes</Notice>;
    }
    if (card.provider === "email" && linkingEmail && card.action === "link") {
      return (
        <EmailLinkForm
          onCancel={() => setLinkingEmail(false)}
          onDone={() => {
            setLinkingEmail(false);
            void reloadIdentities();
          }}
        />
      );
    }
    const error = errors[card.provider];
    return error ? <Notice error={error} /> : null;
  };

  return (
    <>
      <ul className="mt-3 flex flex-col gap-4">
        {cards.map((card) => (
          <Card key={card.provider} card={card} action={actionFor(card)}>
            {extraFor(card)}
          </Card>
        ))}
      </ul>
      {listError && status === "signedIn" ? <Notice error={listError} /> : null}
    </>
  );
}

/** Settings → Accounts & sync (board: design/newsprint/settings.png). */
export function AccountsPanel() {
  const status = useSession((s) => s.status);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <section className="border-l border-rule pl-8">
      <h2 className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">
        Accounts &amp; sync
      </h2>
      {status === "offline" ? (
        <p className="mt-5 border border-ink-2 px-5 py-3 font-body text-[length:var(--text-lg)] text-ink">
          Needs connection · you are signed in, but the server cannot be reached.{" "}
          <button type="button" className="label underline underline-offset-4" onClick={() => void auth.restore()}>
            Try again
          </button>
        </p>
      ) : null}
      <p className="label mt-6 text-ink-2">Credentials</p>
      <CredentialList />
      <div className="mt-6 flex items-baseline justify-between gap-6">
        <p className="font-body text-[length:var(--text-lg)] text-ink-2">
          {status === "signedIn"
            ? "Your card is kept on the server. Games and puzzle records sync in a later edition."
            : "You are reading as a guest; everything stays on this machine. Link a way in to keep your card."}
        </p>
        {status === "signedIn" ? (
          <Button variant="ghost" className="shrink-0" disabled={signingOut} onClick={() => void signOut()}>
            Sign out
          </Button>
        ) : null}
      </div>
    </section>
  );
}
