import { useState, type FormEvent, type ReactNode } from "react";
import { auth } from "../../api/auth/session";
import { describeError, toApiError, type ApiError } from "../../api/problem";
import { Button } from "../../ui/Button";

/** One line under a card. A refusal of the player's own input is a mistake: red, with its glyph. */
export function Notice({ error, children }: { error?: ApiError; children?: ReactNode }) {
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

type Props = {
  /** The button that sends the code back: "Sign in" on the sign-in page, "Link email" in Settings. */
  submitLabel: string;
  onDone: () => void;
  /** Settings closes the form; the sign-in page keeps it open and offers another address instead. */
  onCancel?: () => void;
};

/**
 * Email in two steps: the address, then the six-digit code from the mail. Signs in, or links the
 * address when someone is already signed in (the Rust core decides from the session it holds).
 */
export function EmailCodeForm({ submitLabel, onDone, onCancel }: Props) {
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
    <form onSubmit={submit} className={onCancel ? "mt-4 border-t border-rule pt-4" : ""}>
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
          {busy
            ? state.step === "address"
              ? "Sending…"
              : "Checking…"
            : state.step === "address"
              ? "Send code"
              : submitLabel}
        </Button>
      </div>
      <Notice error={error}>{note}</Notice>
      <div className="mt-3 flex flex-wrap gap-2 [&>button]:whitespace-nowrap">
        {state.step === "code" ? (
          <Button variant={spent ? "secondary" : "ghost"} disabled={busy} onClick={() => void sendCode(state.email)}>
            Send a new code
          </Button>
        ) : null}
        {state.step === "code" && !onCancel ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setState({ step: "address" });
              setValue(state.email);
              setNote(undefined);
              setError(undefined);
            }}
          >
            Change address
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
