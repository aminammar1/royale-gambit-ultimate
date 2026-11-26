import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { CHAMPIONS } from "../app/champions";
import { useRotating } from "../app/useRotating";
import { Portrait } from "./Portrait";

const control = "flex size-9 items-center justify-center border border-ink-2 text-ink hover:border-ink";
const EVERY_MS = 7000;
const EASE = [0.2, 0, 0, 1] as const;

/** Decode every portrait once, up front, so a champion never arrives as an empty frame. */
function usePreloadedPortraits() {
  useEffect(() => {
    for (const { portrait } of CHAMPIONS) {
      if (!portrait) continue;
      const img = new Image();
      img.src = portrait;
      img.decode().catch(() => undefined); // a broken file shows the initials, as before
    }
  }, []);
}

/**
 * Nav widget: the world champions in turn, one framed portrait every few seconds. It holds while
 * the pointer or focus is on it, and Pause stops it. On the rail, one portrait that steps on a click.
 */
export function HallOfChampions() {
  const reduce = useReducedMotion();
  const { index, step, paused, togglePaused, hold } = useRotating(CHAMPIONS.length, EVERY_MS);
  const champion = CHAMPIONS[index];
  usePreloadedPortraits();
  // The frame stays put and the photo inside it crossfades, so the panel never goes blank. The
  // name hands over out-then-in (never two names on top of each other), settling 4px like a page.
  const photo = {
    initial: reduce ? false : { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.24, ease: EASE } },
    // The old photo stays solid under the new one, then leaves: no paper shows through mid-turn.
    exit: reduce ? undefined : { opacity: 0, transition: { delay: 0.24, duration: 0 } },
  };
  const caption = {
    initial: reduce ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE } },
    exit: reduce ? undefined : { opacity: 0, transition: { duration: 0.12, ease: EASE } },
  };

  return (
    <section aria-label="Hall of Champions" className="border-t-[3px] border-double border-ink pt-3" {...hold}>
      <div className="max-[1279px]:hidden">
        <div className="flex items-baseline justify-between">
          <span className="label text-ink-2">Hall of Champions</span>
          <span className="numeric text-[length:var(--text-sm)] text-ink-2">No. {champion.no}</span>
        </div>
        <div className="mt-3 flex h-[4.5rem] gap-3" aria-live={paused ? "polite" : "off"}>
          <div className="relative size-16 shrink-0 border border-ink bg-paper-2">
            <AnimatePresence initial={false}>
              <motion.div key={champion.no} className="absolute inset-0" {...photo}>
                <Portrait champion={champion} framed={false} className="size-full" />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={champion.no} {...caption}>
                <p className="font-masthead text-[length:var(--text-lg)] leading-tight font-bold">{champion.name}</p>
                {/* One line in the nav's column: the full "World champion · 1886" wrapped into the buttons. */}
                <p className="numeric mt-1 text-[length:var(--text-xs)] whitespace-nowrap text-ink-2">
                  Champion · {champion.since}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Previous champion" className={control}>
            <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next champion" className={control}>
            <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={togglePaused}
            aria-label={paused ? "Play the champions" : "Pause the champions"}
            aria-pressed={paused}
            className={`${control} ml-auto`}
          >
            {paused ? (
              <Play aria-hidden size={14} strokeWidth={1.5} />
            ) : (
              <Pause aria-hidden size={14} strokeWidth={1.5} />
            )}
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
        <span className="relative block size-12 border border-ink bg-paper-2">
          <AnimatePresence initial={false}>
            <motion.span key={champion.no} className="absolute inset-0 block" {...photo}>
              <Portrait champion={champion} framed={false} className="size-full" />
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="numeric text-[0.625rem] text-ink-2">No. {champion.no}</span>
      </button>
    </section>
  );
}
