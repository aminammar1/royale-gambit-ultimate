import { motion, useReducedMotion } from "motion/react";
import { Outlet, useLocation } from "react-router";
import { useSessionStart } from "../features/account/identities";
import { SideNav } from "../ui/SideNav";
import { useApplyEdition } from "./edition";

/** Nav on the left, the routed page in the newspaper column on the right; pages settle in like paper. */
export function AppShell() {
  useApplyEdition();
  useSessionStart();
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
