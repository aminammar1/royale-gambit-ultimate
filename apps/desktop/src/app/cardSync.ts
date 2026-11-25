import { useEffect, useRef } from "react";
import { getMyProfile, putMyProfile, type ProfileWrite } from "../api";
import { useSession } from "../api/auth/session";
import { profileDb, useProfile, type Card } from "../db/profile";
import { signInLabel } from "../features/account/cards";
import { useIdentities } from "../features/account/identities";

type Local = Pick<Card, "ownerId" | "updatedAt" | "synced">;
type Remote = { username: string; country: string; updatedAt: number };

/**
 * What to do with the card when `userId` signs in. The server holds each account's card; this
 * machine holds one card at a time, the signed-in account's when there is one.
 * - adopt: take the server's card (the machine's is older, a guest's, or another account's);
 * - push: send this machine's card (a guest card the account takes over, or a newer local edit);
 * - register: the account has no card anywhere, so the Welcome page makes one;
 * - none: both sides agree.
 */
export function decideCard(
  local: Local | undefined,
  remote: Remote | undefined,
  userId: string,
): "adopt" | "push" | "register" | "none" {
  const mine = local !== undefined && (!local.ownerId || local.ownerId === userId);
  if (!remote) return mine ? "push" : "register";
  if (local?.ownerId === userId) {
    if (local.updatedAt > remote.updatedAt && !local.synced) return "push";
    return local.updatedAt === remote.updatedAt ? "none" : "adopt";
  }
  return "adopt";
}

const asRemote = (p: { username: string; country: string; updated_at: string }): Remote => ({
  username: p.username,
  country: p.country,
  updatedAt: Date.parse(p.updated_at),
});

/** Sends the card to the server and records the edit the server now holds. */
export async function pushCard(card: Card, userId: string, label: string): Promise<void> {
  const stored = asRemote(
    await putMyProfile({
      username: card.username,
      // The contract types country as its enum of ISO codes; the Rust core already checked it.
      country: card.country as ProfileWrite["country"],
      settings: {},
      updated_at: new Date(card.updatedAt).toISOString(),
    }),
  );
  await profileDb.adopt({ ...stored, ownerId: userId, ownerLabel: label, synced: true });
}

async function syncCard(userId: string, label: string): Promise<void> {
  const remote = await getMyProfile();
  const card = useProfile.getState().card;
  const decision = decideCard(card, remote && asRemote(remote), userId);
  if (decision === "adopt" && remote) {
    await profileDb.adopt({ ...asRemote(remote), ownerId: userId, ownerLabel: label, synced: true });
  } else if (decision === "push" && card) {
    if (!card.ownerId) await profileDb.claim(userId, label);
    await pushCard(card, userId, label);
  } else if (decision === "register") {
    // The machine's row stays for its owner; for this account there is no card yet.
    useProfile.setState({ status: "new", card: undefined });
  } else if (card && card.ownerLabel !== label) {
    await profileDb.claim(userId, label);
  }
}

/**
 * Once per sign-in: brings the account's card and this machine's into step (decideCard). On
 * sign-out the machine's own card is read back, so the gate and the nav see it again.
 */
export function useCardSync(): void {
  const userId = useSession((s) => (s.status === "signedIn" ? s.account?.userId : undefined));
  const label = useIdentities((s) => signInLabel(s.list));
  const loaded = useProfile((s) => s.status !== "loading");
  const synced = useRef<string>(undefined);

  useEffect(() => {
    if (!userId) {
      if (synced.current) {
        synced.current = undefined;
        void profileDb.load().catch((error: unknown) => console.warn("could not read the card", error));
      }
      return;
    }
    if (!label || !loaded || synced.current === userId) return;
    synced.current = userId;
    syncCard(userId, label).catch((error: unknown) => {
      // Offline or refused: the local card stays as it is and the next sign-in tries again.
      console.warn("could not sync the card", error);
      synced.current = undefined;
    });
  }, [userId, label, loaded]);
}

/**
 * Registers a card for the signed-in account: the server first, since it alone knows whether the
 * username is free (409 username-taken comes back as an error to show on the field). When the
 * server cannot be reached the card is kept here unsynced, and the next sign-in sends it.
 */
export async function registerForAccount(
  username: string,
  country: string,
  userId: string,
  label: string,
): Promise<Card> {
  const now = Date.now();
  try {
    const stored = asRemote(
      await putMyProfile({
        username,
        country: country as ProfileWrite["country"],
        settings: {},
        updated_at: new Date(now).toISOString(),
      }),
    );
    return await profileDb.adopt({ ...stored, ownerId: userId, ownerLabel: label, synced: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "kind" in error && error.kind === "offline") {
      return profileDb.adopt({ username, country, ownerId: userId, ownerLabel: label, updatedAt: now, synced: false });
    }
    throw error;
  }
}
