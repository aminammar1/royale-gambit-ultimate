import { useEffect } from "react";
import { profileDb, useProfile } from "../../db/profile";

let loaded = false;

/** Reads the local card once per app run. Where the app goes next is the gate's business (app/gate.ts). */
export function useProfileLoad(): void {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    profileDb.load().catch((error: unknown) => {
      // Without the local store the app still opens, as a guest; nothing is lost by it.
      console.warn("could not read the player card", error);
      useProfile.setState({ status: "guest", card: undefined });
    });
  }, []);
}
