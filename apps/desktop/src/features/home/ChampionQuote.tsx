import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CHAMPION_QUOTES } from "../../app/quotes";
import { useRotating } from "../../app/useRotating";
import { Kicker } from "../../ui/Kicker";
import { Portrait } from "../../ui/Portrait";

const EVERY_MS = 12000;

/** "From the champions": one quotation at a time, turning every few seconds; holds under the pointer. */
export function ChampionQuote() {
  const reduce = useReducedMotion();
  // Starts on a different quotation each day, then turns on its own.
  const [today] = useState(() => Math.floor(Date.now() / 86_400_000));
  const { index, paused, togglePaused, hold } = useRotating(CHAMPION_QUOTES.length, EVERY_MS, today);
  const quote = CHAMPION_QUOTES[index];

  return (
    <section aria-labelledby="quote" {...hold}>
      <Kicker
        aside={
          <button
            type="button"
            onClick={togglePaused}
            aria-label={paused ? "Play the quotations" : "Pause the quotations"}
            aria-pressed={paused}
            className="flex size-7 items-center justify-center text-ink-2 hover:text-ink"
          >
            {paused ? (
              <Play aria-hidden size={14} strokeWidth={1.5} />
            ) : (
              <Pause aria-hidden size={14} strokeWidth={1.5} />
            )}
          </button>
        }
      >
        <span id="quote">From the champions</span>
      </Kicker>
      <AnimatePresence mode="wait" initial={false}>
        <motion.figure
          key={index}
          className="pt-5"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        >
          <blockquote className="font-masthead text-[length:var(--text-xl)] leading-snug font-semibold italic">
            “{quote.text}”
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <Portrait champion={quote.champion} className="size-10 shrink-0" />
            <span className="min-w-0">
              <span className="block font-body text-[length:var(--text-md)] font-semibold">{quote.champion.name}</span>
              <span className="numeric block text-[length:var(--text-xs)] text-ink-2">
                World champion · {quote.champion.since}
              </span>
            </span>
          </figcaption>
        </motion.figure>
      </AnimatePresence>
    </section>
  );
}
