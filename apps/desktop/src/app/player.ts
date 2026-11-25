import { useEffect } from "react";
import { useSession } from "../api/auth/session";
import { playerName, signInLabel } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";
import { profileDb, useProfile, type Card } from "../db/profile";
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

/**
 * The first time someone is signed in while an unclaimed card exists, the card becomes theirs,
 * with how they sign in. When the owner signs in again, the label follows their newest way in.
 */
export function useClaimCard(): void {
  const card = useProfile((s) => s.card);
  const userId = useSession((s) => (s.status === "signedIn" ? s.account?.userId : undefined));
  const label = useIdentities((s) => signInLabel(s.list));
  const due =
    card !== undefined &&
    userId !== undefined &&
    label !== undefined &&
    (!card.ownerId || (card.ownerId === userId && card.ownerLabel !== label));
  useEffect(() => {
    if (!due || !userId || !label) return;
    profileDb.claim(userId, label).catch((error: unknown) => console.warn("could not claim the card", error));
  }, [due, userId, label]);
}
