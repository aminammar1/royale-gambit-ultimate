import { useEffect, useState } from "react";

/**
 * An index that steps through `length` items every `everyMs`. It holds while the pointer or the
 * focus is on the widget, and stops for good on Pause (WCAG 2.2.2: moving content can be paused).
 * A manual step restarts the clock, so the next turn never comes a moment after a click.
 */
export function useRotating(length: number, everyMs: number, start = 0) {
  const [index, setIndex] = useState(start % length);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (paused || held || length < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % length), everyMs);
    return () => clearTimeout(timer);
  }, [index, paused, held, length, everyMs]);

  return {
    index,
    step: (delta: number) => setIndex((i) => (i + delta + length) % length),
    paused,
    togglePaused: () => setPaused((p) => !p),
    hold: {
      onMouseEnter: () => setHeld(true),
      onMouseLeave: () => setHeld(false),
      onFocus: () => setHeld(true),
      onBlur: () => setHeld(false),
    },
  };
}
