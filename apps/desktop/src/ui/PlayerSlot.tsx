import { usePlayerCard } from "../app/player";
import { Link } from "react-router";
import { useSession } from "../api/auth/session";
import { playerName } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";
import { countryByCode } from "../features/welcome/countries";
import { Flag } from "./Flag";

/** Bottom of the nav: the player's card in brief. Opens the account settings, or sign-in for a guest. */
export function PlayerSlot() {
  const card = usePlayerCard();
  const status = useSession((s) => s.status);
  const signedInAs = useIdentities((s) => playerName(s.list));
  const signedIn = status === "signedIn" || status === "offline";

  const alpha3 = card ? (countryByCode(card.country)?.alpha3 ?? card.country) : undefined;
  const name = card?.username ?? (signedIn ? (signedInAs ?? "Signed in") : "Guest");
  const line = signedIn
    ? status === "offline"
      ? "Offline · signed in"
      : card
        ? "1500 · provisional"
        : "Signed in"
    : "Not signed in · sign in";

  return (
    <Link
      to={signedIn ? "/settings" : "/sign-in"}
      title={signedIn ? "Account settings" : "Sign in"}
      className="group flex items-center gap-3 border-t border-rule pt-3 max-[1279px]:flex-col max-[1279px]:gap-1"
    >
      {/* The flag fills its frame, like a printed flag tile; the country code is its tooltip. */}
      <span
        title={card ? alpha3 : undefined}
        aria-hidden
        className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden border border-ink-2 group-hover:border-ink"
      >
        {card ? (
          <Flag code={card.country} fill />
        ) : (
          <span className="numeric text-[length:var(--text-xs)] text-ink-2">—</span>
        )}
      </span>
      <div className="min-w-0 max-[1279px]:hidden">
        <p className="truncate font-masthead text-[length:var(--text-lg)] leading-tight font-bold">{name}</p>
        <p className="numeric text-[length:var(--text-xs)] text-ink-2 group-hover:text-ink">{line}</p>
      </div>
      <span className="label hidden max-w-full truncate text-[0.625rem] text-ink-2 max-[1279px]:block">
        {card?.username ?? (signedIn ? "Account" : "Sign in")}
      </span>
    </Link>
  );
}
