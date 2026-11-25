import { useSession } from "../api/auth/session";
import { playerName } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";
import { useProfile, type Card } from "../db/profile";
import { visibleCard } from "./gate";

/** The card to print for whoever is at the keyboard; undefined after its owner signs out. */
export function usePlayerCard(): Card | undefined {
  const card = useProfile((s) => s.card);
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.account?.userId);
  // Offline means the keychain still holds the owner's session; the server is just away.
  if (status === "offline") return card;
  return visibleCard(card, userId);
}

/**
 * The name to greet: the card's when it is printed, else the signed-in account's (its Lichess name
 * or address), else undefined for a guest.
 */
export function usePlayerName(): string | undefined {
  const card = usePlayerCard();
  const signedIn = useSession((s) => s.status === "signedIn" || s.status === "offline");
  const account = useIdentities((s) => playerName(s.list));
  return card?.username ?? (signedIn ? account : undefined);
}
