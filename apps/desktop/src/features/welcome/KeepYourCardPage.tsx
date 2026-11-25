import { usePlayerCard } from "../../app/player";
import { useNavigate } from "react-router";
import { useSession } from "../../api/auth/session";
import { editionDate } from "../../app/editionDate";
import { useEdition } from "../../app/edition";
import { Button } from "../../ui/Button";
import { Masthead } from "../../ui/Masthead";
import { PlayerCard } from "../../ui/PlayerCard";
import { CredentialList } from "../account/AccountsPanel";
import { countryByCode } from "./countries";

/** First run, step 2: optionally link a way back in, so the card can be restored elsewhere. */
export function KeepYourCardPage() {
  const edition = useEdition();
  const navigate = useNavigate();
  const card = usePlayerCard();
  const signedIn = useSession((s) => s.status === "signedIn");
  const country = card ? countryByCode(card.country) : undefined;

  return (
    <div className="px-14 max-[1279px]:px-8">
      <Masthead
        kicker="Federation registration · Step 2 of 2"
        title="Keep your card"
        dateline={[
          `${edition} edition`,
          editionDate(new Date()),
          "Optional",
          card?.ownerId ? "Saved to your account" : "Your profile stays on this machine",
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] py-8 max-[1099px]:grid-cols-1 max-[1099px]:gap-10">
        <section className="pr-8 max-[1099px]:pr-0">
          <h2 className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">Registered</h2>
          {card ? (
            <div className="mt-5 max-w-[34rem]">
              <PlayerCard
                cardNo={card.cardNo}
                username={card.username}
                country={country}
                issuedAt={new Date(card.registeredAt)}
                saved={Boolean(card.ownerId)}
              />
            </div>
          ) : null}
        </section>
        <section className="border-l border-rule pl-8 max-[1099px]:border-l-0 max-[1099px]:pl-0">
          <h2 className="border-b border-ink pb-3 font-masthead text-[length:var(--text-2xl)] font-bold">
            A way back in
          </h2>
          <p className="mt-5 font-body text-[length:var(--text-lg)] text-ink-2">
            Link Lichess or an email and you can restore this card on another machine. You can also do it later in
            Settings.
          </p>
          <CredentialList />
          <div className="mt-8 flex justify-end">
            <Button variant={signedIn ? "primary" : "ghost"} onClick={() => navigate("/", { replace: true })}>
              {signedIn ? "Continue to the front page" : "Skip for now"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
