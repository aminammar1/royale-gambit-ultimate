import type { ReactNode } from "react";

type Props = {
  kicker: string;
  title: string;
  /** Up to four dateline cells, spread across the page under the title. */
  dateline: string[];
  actions?: ReactNode;
};

/** Page masthead: kicker, Playfair title, a 1px rule, the dateline, and a double rule. */
export function Masthead({ kicker, title, dateline, actions }: Props) {
  return (
    <header className="pt-8">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="label text-ink-2">{kicker}</p>
          <h1 className="mt-1 font-masthead text-[length:var(--text-masthead)] leading-[1.05] font-black tracking-[-0.01em] text-ink max-[1279px]:text-[2.5rem]">
            {title}
          </h1>
        </div>
        {actions ? <div className="flex shrink-0 items-end gap-6 pb-2">{actions}</div> : null}
      </div>
      <div className="mt-3 border-t border-ink" />
      <div className="label flex flex-wrap justify-between gap-x-6 gap-y-1 py-2 text-ink-2">
        {dateline.filter(Boolean).map((cell) => (
          <span key={cell}>{cell}</span>
        ))}
      </div>
      <div className="rule-double" />
    </header>
  );
}
