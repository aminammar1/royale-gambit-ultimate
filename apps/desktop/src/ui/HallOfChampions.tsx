import { useState } from "react";
import { CHAMPIONS } from "../app/champions";

/** Nav widget: one framed halftone thumbnail of a world champion, cycled with two arrows. */
export function HallOfChampions() {
  const [index, setIndex] = useState(0);
  const champion = CHAMPIONS[index];
  const step = (delta: number) => setIndex((i) => (i + delta + CHAMPIONS.length) % CHAMPIONS.length);

  return (
    <section
      aria-label="Hall of Champions"
      className="border-t-[3px] border-double border-ink pt-3 max-[1279px]:hidden"
    >
      <div className="flex items-baseline justify-between">
        <span className="label text-ink-2">Hall of Champions</span>
        <span className="numeric text-[length:var(--text-sm)] text-ink-2">No. {champion.no}</span>
      </div>
      <div className="mt-3 flex gap-3" aria-live="polite">
        <div className="size-16 shrink-0 border border-ink bg-paper-2">
          {champion.portrait ? (
            <img
              src={champion.portrait}
              alt=""
              className="size-full object-cover grayscale [[data-edition=night]_&]:brightness-90"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-full items-center justify-center font-masthead text-[length:var(--text-xl)] font-bold text-ink-2"
            >
              {champion.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-masthead text-[length:var(--text-lg)] leading-tight font-bold">{champion.name}</p>
          <p className="numeric mt-1 text-[length:var(--text-xs)] text-ink-2">World champion · {champion.since}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous champion"
          className="numeric size-9 border border-ink-2 text-ink hover:border-ink"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next champion"
          className="numeric size-9 border border-ink-2 text-ink hover:border-ink"
        >
          ›
        </button>
      </div>
    </section>
  );
}
