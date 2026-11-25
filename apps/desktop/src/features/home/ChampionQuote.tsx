import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { CHAMPION_QUOTES } from "../../app/quotes";
import { useRotating } from "../../app/useRotating";
import { Portrait } from "../../ui/Portrait";

const EVERY_MS = 12000;
const control = "flex size-8 items-center justify-center text-ink-2 hover:text-ink";

/**
 * The front page's pull quote: a band under the masthead with the champion's portrait, the line
 * set large in italic, and the name beneath. Turns every few seconds; holds under the pointer.
 */
export function ChampionQuote() {
  const reduce = useReducedMotion();
  // Starts on a different quotation each day, then turns on its own.
  const [today] = useState(() => Math.floor(Date.now() / 86_400_000));
  const { index, step, paused, togglePaused, hold } = useRotating(CHAMPION_QUOTES.length, EVERY_MS, today);
  const quote = CHAMPION_QUOTES[index];

  return (
    <section
      aria-label="From the champions"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-7 border-b border-ink py-6"
      {...hold}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.figure
          key={index}
          className="col-span-2 grid grid-cols-subgrid items-center"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        >
          <Portrait champion={quote.champion} className="h-24 w-20 max-[1279px]:h-20 max-[1279px]:w-16" />
          <div className="min-w-0 border-l border-rule pl-7">
            {/* The opening mark hangs in the margin, so the words line up with the name below. */}
            <blockquote className="max-w-[46rem] font-masthead text-[1.75rem] leading-[1.25] font-semibold italic [text-indent:-0.45em] max-[1279px]:text-[1.375rem]">
              “{quote.text}”
            </blockquote>
            <figcaption className="mt-3 flex items-baseline gap-3">
              <span className="font-body text-[length:var(--text-md)] font-semibold">{quote.champion.name}</span>
              <span className="numeric text-[length:var(--text-xs)] text-ink-2">
                World champion from {quote.champion.since}
              </span>
            </figcaption>
          </div>
        </motion.figure>
      </AnimatePresence>
      <div className="flex flex-col items-center gap-1 self-start" aria-label="Quotations">
        <button type="button" onClick={() => step(-1)} aria-label="Previous quotation" className={control}>
          <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? "Play the quotations" : "Pause the quotations"}
          aria-pressed={paused}
          className={control}
        >
          {paused ? (
            <Play aria-hidden size={14} strokeWidth={1.5} />
          ) : (
            <Pause aria-hidden size={14} strokeWidth={1.5} />
          )}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next quotation" className={control}>
          <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
        </button>
      </div>
    </section>
  );
}
