import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServer } from "../api";
import logo from "../assets/logo.png";
import { Portrait } from "../ui/Portrait";
import { CHAMPIONS, type Champion } from "./champions";
import { useEdition } from "./edition";
import { editionDate } from "./editionDate";
import { CHAMPION_QUOTES } from "./quotes";

const EASE = [0.2, 0, 0, 1] as const;
const CUT_MS = 125;
const SERVER_LINE = {
  checking: "Calling the server…",
  reachable: "Server online",
  unreachable: "Offline · you can still play here",
} as const;

/** Resolves once every portrait is decoded, so the newsreel never cuts to an empty frame. */
function preloadPortraits(): Promise<unknown> {
  return Promise.allSettled(
    CHAMPIONS.flatMap((c) => (c.portrait ? [c.portrait] : [])).map((src) => {
      const img = new Image();
      img.src = src;
      return img.decode();
    }),
  );
}

/**
 * The intro: a newsreel of the eighteen champions, one hard cut each, the year printed large
 * beneath. Any key or click skips it.
 */
function Newsreel({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cut = (i: number) => {
      if (cancelled) return;
      if (i === CHAMPIONS.length) {
        timer = setTimeout(onDone, 450);
        return;
      }
      setIndex(i);
      timer = setTimeout(() => cut(i + 1), i === CHAMPIONS.length - 1 ? 600 : CUT_MS);
    };
    void preloadPortraits().then(() => cut(0));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onDone]);

  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onDone]);

  const champion = index === undefined ? undefined : CHAMPIONS[index];
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <p className="label text-ink-2">The world champions</p>
      <div className="mt-4 w-[min(18rem,36vh)] border-[3px] border-double border-ink p-1">
        <div className="relative aspect-[4/5] overflow-hidden bg-paper-2">
          {champion ? (
            <motion.div
              key={champion.no}
              className="absolute inset-0"
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: CUT_MS / 1000 + 0.2, ease: EASE }}
            >
              <Portrait champion={champion} className="size-full" />
            </motion.div>
          ) : null}
        </div>
      </div>
      <p className="mt-5 font-masthead text-[5rem] leading-none font-black tabular-nums">{champion?.since ?? "1886"}</p>
      <p className="mt-2 h-7 font-masthead text-[length:var(--text-xl)] font-bold">{champion?.name}</p>
      <p className="label mt-10 text-ink-2">Press any key to skip</p>
    </motion.div>
  );
}

/** One row of the poster wall: the champions, twice over, sliding one way or the other. */
function Row({ champions, seconds, reverse }: { champions: readonly Champion[]; seconds: number; reverse?: boolean }) {
  return (
    <div className="overflow-hidden">
      <div
        className="flex w-max gap-3 motion-reduce:animate-none"
        style={{ animation: `marquee ${seconds}s linear infinite${reverse ? " reverse" : ""}` }}
      >
        {[...champions, ...champions].map((c, i) => (
          <Portrait key={`${c.no}-${i}`} champion={c} className="h-[26vh] w-[20vh] shrink-0" />
        ))}
      </div>
    </div>
  );
}

const rotated = (by: number) => [...CHAMPIONS.slice(by), ...CHAMPIONS.slice(0, by)];

/**
 * The title page, as a film's or a game's title screen in print: a wall of champion portraits,
 * tilted and drifting, fills the window; the paper washes in from the middle (no box, no blur)
 * where the nameplate, a quotation and one large Start button stand centred. Enter starts.
 */
function TitlePage({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  const edition = useEdition();
  const reduce = useReducedMotion();
  const server = useServer((s) => s.status);
  const [quote] = useState(() => CHAMPION_QUOTES[Math.floor(Math.random() * CHAMPION_QUOTES.length)]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && ready) onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, onStart]);

  return (
    <motion.div
      className="relative h-full overflow-hidden"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      {/* The poster wall: four rows, tilted, larger than the window so no edge shows. */}
      <div
        aria-hidden
        className="absolute inset-[-20%] flex -rotate-[7deg] flex-col justify-center gap-3 opacity-[0.55] grayscale [[data-edition=night]_&]:opacity-[0.4]"
      >
        <Row champions={CHAMPIONS} seconds={120} />
        <Row champions={rotated(5)} seconds={95} reverse />
        <Row champions={rotated(10)} seconds={140} />
        <Row champions={rotated(14)} seconds={105} reverse />
      </div>
      {/* The paper washes in: solid behind the words, the portraits clear at the edges. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 44% 58% at 50% 50%, var(--paper) 0 45%, color-mix(in srgb, var(--paper) 82%, transparent) 62%, transparent 100%)",
            "linear-gradient(to bottom, var(--paper), transparent 22%, transparent 78%, var(--paper))",
          ].join(", "),
        }}
      />

      <motion.main
        className="relative flex h-full flex-col items-center justify-center px-8 text-center"
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.1, ease: EASE }}
      >
        <img src={logo} alt="" className="block w-20" draggable={false} />
        <p className="label mt-5 flex gap-3 text-ink-2">
          <span>{edition} edition</span>
          <span aria-hidden>·</span>
          <span>{editionDate(new Date())}</span>
        </p>
        <h1 className="mt-2 max-w-[14ch] font-masthead text-[clamp(3rem,7vw,5.75rem)] leading-[0.95] font-black tracking-[-0.015em]">
          Royale Gambit Ultimate
        </h1>
        <div aria-hidden className="mt-5 h-[3px] w-[min(26rem,70vw)] border-y border-ink" />
        <p className="mt-5 max-w-[34rem] font-masthead text-balance text-[length:var(--text-lg)] leading-snug italic">
          “{quote.text}”
        </p>
        <p className="mt-1 font-body text-[length:var(--text-sm)] text-ink-2">{quote.champion.name}</p>

        <button
          type="button"
          disabled={!ready}
          onClick={onStart}
          className={`group label mt-9 flex h-16 w-[min(22rem,80vw)] items-center justify-center gap-3 rounded-[var(--radius)] border-2 text-[length:var(--text-lg)] tracking-[0.3em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${
            ready
              ? "border-ink bg-ink text-paper hover:bg-paper hover:text-ink"
              : "cursor-wait border-ink-2 bg-paper-2 text-ink-2"
          }`}
        >
          {ready ? <Play aria-hidden className="size-5 fill-current" strokeWidth={0} /> : null}
          <span>{ready ? "Start" : "Getting ready…"}</span>
        </button>
        <p className="label mt-4 flex h-5 items-center gap-3 text-ink-2">
          {ready ? (
            <span className="animate-[press-enter_1.8s_ease-in-out_infinite] motion-reduce:animate-none">
              Press{" "}
              <kbd className="mx-1 rounded-[var(--radius)] border border-ink-2 px-1.5 py-0.5 font-mono">Enter</kbd>
            </span>
          ) : (
            <span>Reading your card</span>
          )}
          <span aria-hidden>·</span>
          <span role="status">{SERVER_LINE[server]}</span>
        </p>
      </motion.main>
    </motion.div>
  );
}

/**
 * What the app opens on: a short newsreel of the champions, then the title page with Start. The
 * card, the keychain and the server are read meanwhile; Start waits for all three to answer.
 */
export function StartScreen({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "title">(reduce ? "title" : "intro");
  // Stable, or the newsreel would start over each time the start-up checks answer.
  const toTitle = useCallback(() => setPhase("title"), []);
  return (
    <motion.div className="h-full" exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
      <AnimatePresence mode="wait">
        {phase === "intro" ? (
          <Newsreel key="intro" onDone={toTitle} />
        ) : (
          <TitlePage key="title" ready={ready} onStart={onStart} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
