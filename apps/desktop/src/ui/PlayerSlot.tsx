import { useSession } from "../api/auth/session";
import { useProfile } from "../db/profile";
import { playerName } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";
import { countryByCode } from "../features/welcome/countries";

/** Bottom of the nav: the player's card in brief (board: the Settings and Welcome nav). */
export function PlayerSlot() {
  const card = useProfile((s) => s.card);
  const status = useSession((s) => s.status);
  const signedInAs = useIdentities((s) => playerName(s.list));
  const signedIn = status === "signedIn";

  const badge = card ? (countryByCode(card.country)?.alpha3 ?? card.country) : "—";
  const name = card?.username ?? (signedIn ? (signedInAs ?? "Signed in") : "Guest");
  const line = card ? "1500 · provisional" : signedIn ? "Signed in" : status === "offline" ? "Offline" : "Unregistered";

  return (
    <div className="flex items-center gap-3 border-t border-rule pt-3 max-[1279px]:justify-center">
      <span
        aria-hidden
        className="numeric flex h-8 w-12 items-center justify-center border border-ink-2 text-[length:var(--text-xs)] text-ink-2"
      >
        {badge}
      </span>
      <div className="min-w-0 max-[1279px]:hidden">
        <p className="truncate font-masthead text-[length:var(--text-lg)] leading-tight font-bold">{name}</p>
        <p className="numeric text-[length:var(--text-xs)] text-ink-2">{line}</p>
      </div>
    </div>
  );
}
