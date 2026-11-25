import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { auth, useSession } from "../../api/auth/session";
import { toApiError, type ApiError } from "../../api/problem";
import { Mail } from "lucide-react";
import { Button } from "../../ui/Button";
import { BrandMark } from "../../ui/BrandMark";
import { EmailCodeForm, Notice } from "./EmailCodeForm";
import { credentialCards, type CredentialCard } from "./cards";
import { reloadIdentities, useIdentities } from "./identities";

function ProviderMark({ provider, size }: { provider: CredentialCard["provider"]; size: number }) {
  return provider === "email" ? (
    <Mail aria-hidden size={size} strokeWidth={1.5} className="shrink-0" />
  ) : (
    <BrandMark brand={provider} size={size} />
  );
}

const withMark = "inline-flex items-center gap-2";

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
          <span className="label text-ink-2">Credential No. {card.no}</span>
          <h3
            className={`mt-1 flex items-center gap-3 font-masthead text-[length:var(--text-2xl)] leading-tight font-bold ${card.action === "notYet" ? "text-ink-2" : "text-ink"}`}
          >
            <ProviderMark provider={card.provider} size={22} />
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
    if (card.action === "notYet") {
      return (
        <Button disabled className={withMark}>
          <ProviderMark provider={card.provider} size={14} />
          Not yet
        </Button>
      );
    }
    if (card.action === "none") return null;
    const disabled = offline || busy !== undefined;
    if (card.provider === "lichess") {
      return card.action === "unlink" ? (
        <Button disabled={disabled} onClick={() => void act("unlink", "lichess", auth.unlinkLichess)}>
          {busy === "unlink" ? "Unlinking…" : "Unlink"}
        </Button>
      ) : (
        <Button disabled={disabled} className={withMark} onClick={() => void act("lichess", "lichess", auth.lichess)}>
          <BrandMark brand="lichess" size={14} />
          {busy === "lichess" ? "Waiting…" : "Link Lichess"}
        </Button>
      );
    }
    return (
      <Button disabled={disabled || linkingEmail} className={withMark} onClick={() => setLinkingEmail(true)}>
        <Mail aria-hidden size={14} strokeWidth={1.5} />
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
        <EmailCodeForm
          submitLabel="Link email"
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
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
      navigate("/sign-in");
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
            ? "You are signed in. Your card, games and puzzle records sync to the server in a later edition; for now they stay on this machine."
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
