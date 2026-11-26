import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { CHAMPION_QUOTES } from "../../app/quotes";
import { useRotating } from "../../app/useRotating";
import { Portrait } from "../../ui/Portrait";

const EVERY_MS = 12000;
const control = "flex size-8 items-center justify-center border border-ink-2 text-ink hover:border-ink";

/**
 * The front page's pull quote: a band under the masthead with the champion's portrait, the line
 * set large in italic, and the name beneath. Turns every few seconds; holds under the pointer.
 */
// Where the quotations stand, kept across visits to the front page: coming back continues the
// round instead of starting again on the same quotation (Amine saw Botvinnik come back each time).
let remembered = Math.floor(Math.random() * CHAMPION_QUOTES.length);

export function ChampionQuote() {
  const reduce = useReducedMotion();
  const [start] = useState(() => remembered);
  const { index, step, paused, togglePaused, hold } = useRotating(CHAMPION_QUOTES.length, EVERY_MS, start);
  useEffect(() => {
    remembered = index;
  }, [index]);
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
      <div className="flex items-center gap-1 self-end" role="group" aria-label="Quotations">
        <button type="button" onClick={() => step(-1)} aria-label="Previous quotation" className={control}>
          <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <span className="numeric min-w-12 text-center text-[length:var(--text-xs)] text-ink-2" aria-live="off">
          {index + 1} / {CHAMPION_QUOTES.length}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Next quotation" className={control}>
          <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={togglePaused}
          aria-label={paused ? "Play the quotations" : "Pause the quotations"}
          aria-pressed={paused}
          className={`${control} ml-1`}
        >
          {paused ? (
            <Play aria-hidden size={14} strokeWidth={1.5} />
          ) : (
            <Pause aria-hidden size={14} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </section>
  );
}
