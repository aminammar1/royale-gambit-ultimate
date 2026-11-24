import type { ReactNode } from "react";

/** Small uppercase label above a headline or column, with an optional figure on the right. */
export function Kicker({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink pb-2">
      <span className="label text-ink-2">{children}</span>
      {aside ? <span className="numeric text-[length:var(--text-sm)] text-ink-2">{aside}</span> : null}
    </div>
  );
}
