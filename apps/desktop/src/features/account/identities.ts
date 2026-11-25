import { useEffect } from "react";
import { create } from "zustand";
import { listIdentities, type Identity } from "../../api";
import { auth, useSession } from "../../api/auth/session";
import { toApiError, type ApiError } from "../../api/problem";

type IdentitiesState = { list?: Identity[]; error?: ApiError };

/** The signed-in player's ways in, shared by the Settings cards, the dateline and the nav. */
export const useIdentities = create<IdentitiesState>(() => ({}));

export async function reloadIdentities(): Promise<void> {
  if (useSession.getState().status !== "signedIn") {
    useIdentities.setState({ list: undefined, error: undefined });
    return;
  }
  try {
    useIdentities.setState({ list: await listIdentities(), error: undefined });
  } catch (error) {
    useIdentities.setState({ error: toApiError(error) });
  }
}

let started = false;

/**
 * Once per app run: reads the keychain and renews the session, then keeps the identities
 * in step with whoever is signed in.
 */
export function useSessionStart(): void {
  useEffect(() => {
    const stop = useSession.subscribe((now, before) => {
      if (now.account?.userId !== before.account?.userId) {
        // Another account (or none): the old list must not be read as theirs while the new one loads.
        useIdentities.setState({ list: undefined, error: undefined });
      }
      if (now.status !== before.status || now.account?.userId !== before.account?.userId) void reloadIdentities();
    });
    if (!started) {
      started = true;
      auth.restore().catch((error: unknown) => {
        // A locked or missing keychain must not keep the app from opening: read as a guest.
        console.warn("could not restore the session", toApiError(error));
        useSession.setState({ status: "guest", account: undefined });
      });
    }
    return stop;
  }, []);
}
