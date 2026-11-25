import { NavLink } from "react-router";
import { SECTIONS } from "../app/sections";
import { HallOfChampions } from "./HallOfChampions";
import { Logo } from "./Logo";
import { PlayerSlot } from "./PlayerSlot";

/**
 * Left nav: one icon and name per section. The current page gets the paper-2 fill with ink rules
 * above and below. Under 1280px it narrows to a rail with the name set small under each icon.
 */
export function SideNav() {
  return (
    <nav
      aria-label="Sections"
      className="flex h-full w-[var(--nav-width)] shrink-0 flex-col overflow-y-auto border-r border-rule px-5 pt-8 pb-6 max-[1279px]:w-[var(--nav-rail)] max-[1279px]:px-1.5 max-[1279px]:pt-5"
    >
      <Logo />
      <ul className="mt-6 flex flex-col gap-1 max-[1279px]:mt-4">
        {SECTIONS.map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === "/"}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-4 border-y px-3 py-2.5 transition-colors duration-150 max-[1279px]:flex-col max-[1279px]:gap-1 max-[1279px]:px-0 max-[1279px]:py-2 ${
                  isActive
                    ? "border-ink bg-paper-2 text-ink"
                    : "border-transparent text-ink-2 hover:bg-paper-2/60 hover:text-ink"
                }`
              }
            >
              <Icon aria-hidden size={20} strokeWidth={1.5} className="shrink-0" />
              <span className="label text-[length:var(--text-md)] tracking-[0.08em] text-ink max-[1279px]:text-[0.625rem] max-[1279px]:tracking-[0.04em]">
                {label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-4 pt-6">
        <HallOfChampions />
        <PlayerSlot />
      </div>
    </nav>
  );
}
