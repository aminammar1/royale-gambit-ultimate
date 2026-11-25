import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { checkServer, useServer } from "../api";
import { useSession } from "../api/auth/session";
import { useProfile } from "../db/profile";
import { useSessionStart } from "../features/account/identities";
import { useProfileLoad } from "../features/welcome/useProfileLoad";
import { useApplyEdition } from "./edition";
import { gate, startPage } from "./gate";
import { useClaimCard } from "./player";
import { StartScreen } from "./StartScreen";

let serverChecked = false;

/**
 * Every route sits under this: it reads the card, the keychain and the server once and shows the
 * Start screen meanwhile. Start opens the page `startPage` picks; after that the gate keeps the
 * player on pages their state allows.
 */
export function Root() {
  useApplyEdition();
  useSessionStart();
  useProfileLoad();
  useClaimCard();
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

  const ownerId = useProfile((s) => s.card?.ownerId);
  const ready = profile !== "loading" && session !== "loading" && server !== "checking";

  const [started, setStarted] = useState(false);
  const starting = useRef(false);
  const start = useCallback(() => {
    // The Start button and the Enter key can both fire for one press.
    if (starting.current || profile === "loading" || session === "loading") return;
    starting.current = true;
    navigate(startPage(profile, session, ownerId), { replace: true });
    setStarted(true);
  }, [profile, session, ownerId, navigate]);

  const target = started ? gate(profile, session, pathname) : undefined;
  useEffect(() => {
    if (target) navigate(target, { replace: true });
  }, [target, navigate]);

  return (
    <AnimatePresence mode="wait">
      {started ? target ? null : <Outlet key="app" /> : <StartScreen key="start" ready={ready} onStart={start} />}
    </AnimatePresence>
  );
}
