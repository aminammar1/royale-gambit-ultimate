import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/** The player card held on this machine (src-tauri/src/db/profile.rs). */
export type Card = {
  /** Six digits, printed as "No. 000215". */
  cardNo: string;
  username: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Unix milliseconds. */
  registeredAt: number;
  /** The account that claimed the card (app/gate.ts `visibleCard`); null until someone signs in. */
  ownerId: string | null;
  /** How the owner signs in, "Lichess · kingside_tal"; shown on the sign-in page. */
  ownerLabel: string | null;
  /** Unix milliseconds of the last edit; the server keeps the newest. */
  updatedAt: number;
  /** The server holds this very edit. */
  synced: boolean;
};

/** A signed-in account's card, from the server or registered for it here (src-tauri `Adopt`). */
export type Adopt = {
  username: string;
  country: string;
  ownerId: string;
  ownerLabel: string;
  updatedAt: number;
  synced: boolean;
};

export type Welcome = { state: "new" } | { state: "guest" } | ({ state: "registered" } & Card);

export type DbError =
  | { kind: "invalid"; field: string; message: string }
  | { kind: "alreadyRegistered" }
  | { kind: "storage"; message: string };

type ProfileState = {
  /** `loading` until the local store has answered at start-up. */
  status: "loading" | "new" | "guest" | "registered";
  card?: Card;
};

export const useProfile = create<ProfileState>(() => ({ status: "loading" }));

function toDbError(error: unknown): DbError {
  if (typeof error === "object" && error !== null && "kind" in error) return error as DbError;
  return { kind: "storage", message: error instanceof Error ? error.message : String(error) };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toDbError(error);
  }
}

function apply(welcome: Welcome) {
  if (welcome.state === "registered") {
    const { cardNo, username, country, registeredAt, ownerId, ownerLabel, updatedAt, synced } = welcome;
    useProfile.setState({
      status: "registered",
      card: { cardNo, username, country, registeredAt, ownerId, ownerLabel, updatedAt, synced },
    });
  } else {
    useProfile.setState({ status: welcome.state, card: undefined });
  }
}

/** The local player card. Local first: these never wait on the network. */
export const profileDb = {
  load: async () => apply(await call<Welcome>("profile_get")),
  register: async (username: string, country: string) => {
    const card = await call<Card>("profile_register", { username, country });
    useProfile.setState({ status: "registered", card });
    return card;
  },
  continueAsGuest: async () => apply(await call<Welcome>("profile_continue_as_guest")),
  /** Ties an unclaimed card to the signed-in account; a claimed card keeps its first owner. */
  claim: async (userId: string, label: string) => apply(await call<Welcome>("profile_claim", { userId, label })),
  /** Puts the signed-in account's card on this machine (cardSync.ts). */
  adopt: async (card: Adopt) => {
    const stored = await call<Card>("profile_adopt", { card });
    useProfile.setState({ status: "registered", card: stored });
    return stored;
  },
  markSynced: async (ownerId: string, updatedAt: number) =>
    apply(await call<Welcome>("profile_mark_synced", { ownerId, updatedAt })),
};
