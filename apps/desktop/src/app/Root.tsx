import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { checkServer, useServer } from "../api";
import { useSession } from "../api/auth/session";
import { useProfile } from "../db/profile";
import { useSessionStart } from "../features/account/identities";
import { useProfileLoad } from "../features/welcome/useProfileLoad";
import { useApplyEdition } from "./edition";
import { gate } from "./gate";
import { Splash } from "./Splash";

/** Long enough to read the start-up log once; the splash never waits on a timer beyond this. */
const SPLASH_AT_LEAST_MS = 1200;

let serverChecked = false;

/**
 * Every route sits under this: it reads the card, the keychain and the server once, shows the splash
 * until all three have answered, then keeps the player on the page the gate allows.
 */
export function Root() {
  useApplyEdition();
  useSessionStart();
  useProfileLoad();
  useEffect(() => {
    if (serverChecked) return;
    serverChecked = true;
    void checkServer();
  }, []);

  const profile = useProfile((s) => s.status);
  const session = useSession((s) => s.status);
  const server = useServer((s) => s.status);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [timeUp, setTimeUp] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimeUp(true), SPLASH_AT_LEAST_MS);
    return () => clearTimeout(timer);
  }, []);

  // Latched: once the app is up, a later server check or sign-out never brings the splash back.
  const [booted, setBooted] = useState(false);
  const answered = profile !== "loading" && session !== "loading" && server !== "checking";
  if (!booted && answered && timeUp) setBooted(true);

  const target = booted ? gate(profile, session, pathname) : undefined;
  useEffect(() => {
    if (target) navigate(target, { replace: true });
  }, [target, navigate]);

  return (
    <AnimatePresence mode="wait">
      {booted ? target ? null : <Outlet key="app" /> : <Splash key="splash" />}
    </AnimatePresence>
  );
}
