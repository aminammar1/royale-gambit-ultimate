import { useSession } from "../api/auth/session";
import { playerName } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";

/** Bottom of the nav: the player's card in brief. */
export function PlayerSlot() {
  const status = useSession((s) => s.status);
  const name = useIdentities((s) => playerName(s.list));
  const signedIn = status === "signedIn";
  return (
    <div className="flex items-center gap-3 border-t border-rule pt-3 max-[1279px]:justify-center">
      <span
        aria-hidden
        className="numeric flex h-8 w-12 items-center justify-center border border-ink-2 text-[length:var(--text-xs)] text-ink-2"
      >
        —
      </span>
      <div className="min-w-0 max-[1279px]:hidden">
        <p className="truncate font-masthead text-[length:var(--text-lg)] leading-tight font-bold">
          {signedIn ? (name ?? "Signed in") : "Guest"}
        </p>
        <p className="numeric text-[length:var(--text-xs)] text-ink-2">
          {signedIn ? "Signed in" : status === "offline" ? "Offline" : "Unregistered"}
        </p>
      </div>
    </div>
  );
}
