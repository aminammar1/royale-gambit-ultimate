import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { profileDb, useProfile } from "../../db/profile";

let loaded = false;

/** Reads the local card once, and sends a machine that has never been set up to Welcome. */
export function useFirstRun(): void {
  const status = useProfile((s) => s.status);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loaded) return;
    loaded = true;
    profileDb.load().catch((error: unknown) => {
      // Without the local store the app still opens, as a guest; nothing is lost by it.
      console.warn("could not read the player card", error);
      useProfile.setState({ status: "guest", card: undefined });
    });
  }, []);

  useEffect(() => {
    if (status === "new" && !pathname.startsWith("/welcome")) navigate("/welcome", { replace: true });
  }, [status, pathname, navigate]);
}
