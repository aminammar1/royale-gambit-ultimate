import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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

/** One row of the drifting background: the champions, twice over, sliding one way or the other. */
function Row({ champions, seconds, reverse }: { champions: readonly Champion[]; seconds: number; reverse?: boolean }) {
  return (
    <div className="overflow-hidden">
      <div
        className="flex w-max gap-4 motion-reduce:animate-none"
        style={{ animation: `marquee ${seconds}s linear infinite${reverse ? " reverse" : ""}` }}
      >
        {[...champions, ...champions].map((c, i) => (
          <Portrait key={`${c.no}-${i}`} champion={c} className="h-[29vh] w-[23vh] shrink-0" />
        ))}
      </div>
    </div>
  );
}

/** The title page: the champions drifting behind, the nameplate, a quotation and the Start button. */
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

  const third = Math.ceil(CHAMPIONS.length / 3);

  return (
    <motion.div
      className="relative h-full overflow-hidden"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <div
        aria-hidden
        className="absolute inset-0 flex flex-col justify-center gap-4 opacity-[0.16] grayscale [[data-edition=night]_&]:opacity-[0.13]"
      >
        <Row champions={CHAMPIONS} seconds={110} />
        <Row champions={[...CHAMPIONS.slice(third), ...CHAMPIONS.slice(0, third)]} seconds={90} reverse />
        <Row champions={[...CHAMPIONS.slice(2 * third), ...CHAMPIONS.slice(0, 2 * third)]} seconds={130} />
      </div>

      <div className="relative flex h-full items-center overflow-y-auto py-8">
        {/* A full-width band of paper between double rules, like a front page's banner: the
            champions stay sharp above and below it. No box, no blur. */}
        <div className="w-full border-y-[3px] border-double border-ink bg-paper px-6 py-8">
          {/* No box: the title page is the page itself, like a newspaper's front, over the
            champions drifting behind. Every line has a fixed place, so nothing moves while the
            card, the keychain and the server answer. */}
          <motion.main
            className="mx-auto flex w-full max-w-[34rem] flex-col items-center text-center"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.1, ease: EASE }}
          >
            <img src={logo} alt="" className="block w-24" draggable={false} />
            <h1 className="mt-4 font-masthead text-[length:var(--text-masthead)] leading-none font-black tracking-[-0.01em] whitespace-nowrap max-[899px]:text-[2.25rem]">
              Royale Gambit Ultimate
            </h1>
            <p className="label mt-3 flex w-full justify-center gap-3 border-t border-ink pt-2 text-ink-2">
              <span>{edition} edition</span>
              <span aria-hidden>·</span>
              <span>{editionDate(new Date())}</span>
            </p>
            <p className="mt-5 max-w-[30rem] font-masthead text-[length:var(--text-lg)] leading-snug italic">
              “{quote.text}”
            </p>
            <p className="mt-1 font-body text-[length:var(--text-sm)] text-ink-2">{quote.champion.name}</p>

            <button
              type="button"
              disabled={!ready}
              onClick={onStart}
              className={`label mt-6 w-64 rounded-[var(--radius)] border py-3.5 text-[length:var(--text-md)] tracking-[0.25em] transition-colors duration-150 ${
                ready
                  ? "border-ink bg-ink text-paper hover:bg-paper hover:text-ink"
                  : "cursor-wait border-ink-2 bg-paper-2 text-ink-2"
              }`}
            >
              {ready ? "Start" : "Getting ready…"}
            </button>
            <p className="label mt-3 flex gap-3 text-ink-2">
              <span>{ready ? "Press Enter" : "Reading your card"}</span>
              <span aria-hidden>·</span>
              <span role="status">{SERVER_LINE[server]}</span>
            </p>
          </motion.main>
        </div>
      </div>
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
