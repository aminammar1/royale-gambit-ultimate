import { useEffect } from "react";
import { useSession } from "../api/auth/session";
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

/** The first time someone is signed in while an unclaimed card exists, the card becomes theirs. */
export function useClaimCard(): void {
  const unclaimed = useProfile((s) => s.card !== undefined && !s.card.ownerId);
  const userId = useSession((s) => (s.status === "signedIn" ? s.account?.userId : undefined));
  useEffect(() => {
    if (!unclaimed || !userId) return;
    profileDb.claim(userId).catch((error: unknown) => console.warn("could not claim the card", error));
  }, [unclaimed, userId]);
}
