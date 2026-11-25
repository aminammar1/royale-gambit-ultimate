import { motion, useReducedMotion } from "motion/react";
import { Outlet, useLocation } from "react-router";
import { SideNav } from "../ui/SideNav";

/** Nav on the left, the routed page in the newspaper column on the right; pages settle in like paper. */
export function AppShell() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full">
      <SideNav />
      <main className="min-w-0 flex-1 overflow-y-auto px-14 max-[1279px]:px-8">
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}

/** Sign-in and the first-run pages: the whole window, no nav, until the player is in. */
export function OnboardingShell() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <motion.main
      key={pathname}
      className="h-full overflow-y-auto"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
    >
      <Outlet />
    </motion.main>
  );
}
