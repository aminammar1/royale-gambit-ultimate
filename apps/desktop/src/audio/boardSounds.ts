// Board sounds: a piece set down, a capture, check, castling, a promotion and a new board, from
// CC0 studio recordings of wooden knocks (Kenney's Impact Sounds, cut and levelled by
// sound-sources/master.sh, credited in src/assets/sounds/CREDITS.md). A move is one of five
// recorded takes and a capture one of four, picked at random, with a hair of pitch and loudness
// spread on top, so no two sound quite alike, as on a real board. A sound can wait for the
// gliding piece to land. No React.

export type BoardSound = "move" | "capture" | "check" | "castle" | "promote" | "start";
/** One knock: which recording and which take of it, when (seconds after the sound starts), its pitch and loudness. */
export type Knock = { sample: BoardSound; take: number; at: number; rate: number; gain: number };

const SAMPLES: readonly BoardSound[] = ["move", "capture", "check", "castle", "promote", "start"];
// src/assets/sounds/<kind>-<take>.ogg
const recorded = import.meta.glob<string>("../assets/sounds/*-*.ogg", { eager: true, import: "default" });
const urlsOf = (sample: BoardSound): string[] =>
  Object.entries(recorded)
    .filter(([path]) => new RegExp(`/${sample}-\\d+\\.ogg$`).test(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
const TAKES = new Map(SAMPLES.map((s) => [s, urlsOf(s)]));

/** How many recorded takes `kind` has. */
export const takesOf = (kind: BoardSound): number => TAKES.get(kind)?.length ?? 0;

/**
 * The knock of `kind`: one of its takes, once. `random` (0 to 1) picks the take and spreads pitch
 * by ±1.5% and loudness by ±5%; at 0.5 both are the recording's own.
 */
export function knocksFor(kind: BoardSound, random: () => number = Math.random): Knock[] {
  const take = Math.min(Math.floor(random() * takesOf(kind)), Math.max(0, takesOf(kind) - 1));
  return [{ sample: kind, take, at: 0, rate: 1 + (random() - 0.5) * 0.03, gain: 1 + (random() - 0.5) * 0.1 }];
}

let context: AudioContext | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

function audio(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  context ??= new AudioContext({ latencyHint: "interactive" });
  if (context.state === "suspended") void context.resume();
  return context;
}

function load(ctx: AudioContext, url: string): Promise<AudioBuffer | undefined> {
  let b = buffers.get(url);
  if (!b) {
    b = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => undefined);
    buffers.set(url, b);
  }
  return b;
}

/** Decodes the recordings ahead of the first move, so it is not the one that comes late. */
export function primeBoardSounds(): void {
  const ctx = audio();
  if (!ctx) return;
  for (const urls of TAKES.values()) for (const url of urls) void load(ctx, url);
}

/**
 * Plays a board sound `afterMs` from now (when the gliding piece lands); silent where the platform
 * has no audio or the recording did not load. Scheduled on the audio clock, so it lands on time even while a frame is busy.
 */
export async function playBoardSound(kind: BoardSound, afterMs = 0): Promise<void> {
  const ctx = audio();
  if (!ctx) return;
  const asked = ctx.currentTime;
  const knocks = knocksFor(kind);
  const samples = await Promise.all(
    knocks.map((k) => {
      const url = TAKES.get(k.sample)?.[k.take];
      return url ? load(ctx, url) : Promise.resolve(undefined);
    }),
  );
  // Never in the past: a recording still decoding plays as soon as it can.
  const start = Math.max(ctx.currentTime, asked + afterMs / 1000) + 0.005;
  knocks.forEach((k, i) => {
    const sample = samples[i];
    if (!sample) return;
    const src = ctx.createBufferSource();
    src.buffer = sample;
    src.playbackRate.value = k.rate;
    const gain = ctx.createGain();
    gain.gain.value = k.gain;
    src.connect(gain).connect(ctx.destination);
    src.start(start + k.at);
  });
}

/** Which sound a move makes, from its SAN: check wins, then promotion, capture, castle. */
export function soundFor(san: string): BoardSound {
  if (san.includes("+") || san.includes("#")) return "check";
  if (san.includes("=")) return "promote";
  if (san.includes("x")) return "capture";
  if (san.startsWith("O-O")) return "castle";
  return "move";
}
