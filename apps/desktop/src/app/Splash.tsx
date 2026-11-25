import { motion, useReducedMotion } from "motion/react";
import { useServer } from "../api";
import { useSession } from "../api/auth/session";
import { useProfile } from "../db/profile";
import logo from "../assets/logo.png";
import { useEdition } from "./edition";
import { editionDate } from "./editionDate";

/** One line of the start-up log, set like a table of contents: name, dot leaders, the outcome. */
function Line({ name, value }: { name: string; value?: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="font-body text-[length:var(--text-lg)] text-ink">{name}</span>
      <span aria-hidden className="mb-1.5 flex-1 border-b border-dotted border-ink-2" />
      <span className={`numeric text-[length:var(--text-sm)] ${value ? "text-ink" : "text-ink-2"}`}>
        {value ?? "…"}
      </span>
    </li>
  );
}

/**
 * Start-up page while the app reads the card, the keychain and the server: the paper goes to press.
 * Every line is real work; the page leaves as soon as the last one has answered.
 */
export function Splash() {
  const edition = useEdition();
  const reduce = useReducedMotion();
  const profile = useProfile((s) => s.status);
  const session = useSession((s) => s.status);
  const server = useServer((s) => s.status);

  const card = { loading: undefined, new: "First run", guest: "Ready", registered: "Ready" }[profile];
  const signIn = { loading: undefined, guest: "Not signed in", signedIn: "Restored", offline: "Kept, offline" }[
    session
  ];
  const wire = { checking: undefined, reachable: "Connected", unreachable: "Offline" }[server];

  return (
    <motion.div
      role="status"
      aria-label="Starting Royal Gambit Ultimate"
      className="flex h-full flex-col items-center justify-center px-8"
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      <div className="w-full max-w-[34rem]">
        <img src={logo} alt="" className="mx-auto block w-36" draggable={false} />
        <h1 className="mt-5 text-center font-masthead text-[length:var(--text-masthead)] leading-none font-black tracking-[-0.01em]">
          Royal Gambit Ultimate
        </h1>
        {/* The one moment of motion on start: the double rule is drawn across, as if by the press. */}
        <motion.div
          className="rule-double mt-4 origin-center"
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
        />
        <p className="label mt-2 flex justify-between text-ink-2">
          <span>{edition} edition</span>
          <span>{editionDate(new Date())}</span>
        </p>
        <ul className="mt-10 space-y-3" aria-live="polite">
          <Line name="Your card on this machine" value={card} />
          <Line name="Your sign-in" value={signIn} />
          <Line name="Royal Gambit server" value={wire} />
        </ul>
        <p className="mt-10 text-center font-body text-[length:var(--text-md)] text-ink-2 italic">Going to press</p>
      </div>
    </motion.div>
  );
}
