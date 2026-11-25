import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { CHAMPIONS } from "../app/champions";
import { Portrait } from "./Portrait";

const arrow = "flex size-9 items-center justify-center border border-ink-2 text-ink hover:border-ink";

/** Nav widget: one framed portrait of a world champion, cycled with two arrows (on the rail, by a click). */
export function HallOfChampions() {
  const [index, setIndex] = useState(0);
  const champion = CHAMPIONS[index];
  const step = (delta: number) => setIndex((i) => (i + delta + CHAMPIONS.length) % CHAMPIONS.length);

  return (
    <section aria-label="Hall of Champions" className="border-t-[3px] border-double border-ink pt-3">
      <div className="max-[1279px]:hidden">
        <div className="flex items-baseline justify-between">
          <span className="label text-ink-2">Hall of Champions</span>
          <span className="numeric text-[length:var(--text-sm)] text-ink-2">No. {champion.no}</span>
        </div>
        <div className="mt-3 flex gap-3" aria-live="polite">
          <Portrait champion={champion} className="size-16 shrink-0" />
          <div className="min-w-0">
            <p className="font-masthead text-[length:var(--text-lg)] leading-tight font-bold">{champion.name}</p>
            <p className="numeric mt-1 text-[length:var(--text-xs)] text-ink-2">World champion · {champion.since}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous champion" className={arrow}>
            <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next champion" className={arrow}>
            <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        title={`${champion.name}, world champion ${champion.since}. Click for the next.`}
        aria-label={`${champion.name}, world champion ${champion.since}. Next champion`}
        className="mx-auto hidden w-12 flex-col items-center gap-1 max-[1279px]:flex"
      >
        <Portrait champion={champion} className="size-12" />
        <span className="numeric text-[0.625rem] text-ink-2">No. {champion.no}</span>
      </button>
    </section>
  );
}
