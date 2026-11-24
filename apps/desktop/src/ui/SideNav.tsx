import { NavLink } from "react-router";
import { SECTIONS } from "../app/sections";
import { HallOfChampions } from "./HallOfChampions";
import { Logo } from "./Logo";
import { PlayerSlot } from "./PlayerSlot";

/**
 * Left nav: permanent section letters A–G. Current page gets the paper-2 fill with ink rules
 * above and below. Under 1280px it collapses to a 64px rail of letters with accessible names.
 */
export function SideNav() {
  return (
    <nav
      aria-label="Sections"
      className="flex h-full w-[var(--nav-width)] shrink-0 flex-col border-r border-rule px-5 pt-8 pb-6 max-[1279px]:w-[var(--nav-rail)] max-[1279px]:px-2"
    >
      <Logo />
      <ul className="mt-6 flex flex-col gap-1">
        {SECTIONS.map((s) => (
          <li key={s.letter}>
            <NavLink
              to={s.path}
              end={s.path === "/"}
              title={s.label}
              aria-label={s.label}
              className={({ isActive }) =>
                `flex items-center gap-5 border-y px-3 py-2.5 transition-colors duration-150 max-[1279px]:justify-center max-[1279px]:px-0 ${
                  isActive ? "border-ink bg-paper-2 font-semibold" : "border-transparent hover:bg-paper-2/60"
                }`
              }
            >
              <span className="numeric w-3 text-[length:var(--text-sm)] text-ink-2">{s.letter}</span>
              <span className="label text-[length:var(--text-md)] tracking-[0.08em] text-ink max-[1279px]:hidden">
                {s.label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-4">
        <HallOfChampions />
        <PlayerSlot />
      </div>
    </nav>
  );
}
