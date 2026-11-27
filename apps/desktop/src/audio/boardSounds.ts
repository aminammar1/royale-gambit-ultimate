// Board sounds: a wooden piece set down, a capture, check, a castle. Recorded samples when the app
// bundles them (src/assets/sounds/<kind>.ogg, credited there); otherwise a synthesised knock of
// filtered noise and a short low thump. No two knocks are quite alike (pitch and loudness vary a
// little, as a real piece never lands the same way twice), castling is two knocks, king then rook,
// and a sound can wait for the piece to land. No React.

export type BoardSound = "move" | "capture" | "check" | "castle" | "start";
type Sample = "move" | "capture" | "start";
/** One knock: which recording, when (seconds after the sound starts), its pitch and loudness. */
export type Knock = { sample: Sample; at: number; rate: number; gain: number };

const recorded = import.meta.glob<string>("../assets/sounds/*.{ogg,mp3,wav}", { eager: true, import: "default" });
const sampleUrl = (sample: Sample) => Object.entries(recorded).find(([path]) => path.includes(`/${sample}.`))?.[1];

/**
 * The knocks of `kind`. `random` (0 to 1) spreads pitch by ±3% and loudness by ±8%; at 0.5 the
 * pitch is the recording's own.
 */
export function knocksFor(kind: BoardSound, random: () => number = Math.random): Knock[] {
  const knock = (sample: Sample, at: number, gain: number, pitch = 1): Knock => ({
    sample,
    at,
    rate: pitch * (1 + (random() - 0.5) * 0.06),
    gain: gain * (1 + (random() - 0.5) * 0.16),
  });
  switch (kind) {
    case "move":
      return [knock("move", 0, 0.9)];
    case "capture":
      return [knock("capture", 0, 1)];
    case "check":
      // Set down firmly: a touch louder and lower than a plain move.
      return [knock("move", 0, 1.08, 0.97)];
    case "castle":
      // The king first, then the rook beside it, a little lighter.
      return [knock("move", 0, 0.9), knock("move", 0.11, 0.75, 1.05)];
    case "start":
      return [knock("start", 0, 0.9)];
  }
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
  for (const sample of ["move", "capture", "start"] as const) {
    const url = sampleUrl(sample);
    if (url) void load(ctx, url);
  }
}

/** A synthesised knock: a burst of band-passed noise (the click of wood) over a short low thump. */
function synthKnock(ctx: AudioContext, at: number, loud: number, pitch: number) {
  const length = Math.floor(ctx.sampleRate * 0.06);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 7));
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1700 * pitch;
  band.Q.value = 1.2;
  const clickGain = ctx.createGain();
  clickGain.gain.value = 0.9 * loud;
  src.connect(band).connect(clickGain).connect(ctx.destination);
  src.start(at);

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(190 * pitch, at);
  body.frequency.exponentialRampToValueAtTime(90 * pitch, at + 0.09);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.5 * loud, at + 0.004);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(at);
  body.stop(at + 0.12);
}

/**
 * Plays a board sound `afterMs` from now (when the gliding piece lands); silent where the platform
 * has no audio. Scheduled on the audio clock, so it lands on time even while a frame is busy.
 */
export async function playBoardSound(kind: BoardSound, afterMs = 0): Promise<void> {
  const ctx = audio();
  if (!ctx) return;
  const asked = ctx.currentTime;
  const knocks = knocksFor(kind);
  const samples = await Promise.all(
    knocks.map((k) => {
      const url = sampleUrl(k.sample);
      return url ? load(ctx, url) : Promise.resolve(undefined);
    }),
  );
  // Never in the past: a recording still decoding plays as soon as it can.
  const start = Math.max(ctx.currentTime, asked + afterMs / 1000) + 0.005;
  knocks.forEach((k, i) => {
    const sample = samples[i];
    if (!sample) {
      synthKnock(ctx, start + k.at, 0.7 * k.gain, k.rate);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = sample;
    src.playbackRate.value = k.rate;
    const gain = ctx.createGain();
    gain.gain.value = k.gain;
    src.connect(gain).connect(ctx.destination);
    src.start(start + k.at);
  });
}

/** Which sound a move makes, from its SAN: check wins, then capture, then castle. */
export function soundFor(san: string): BoardSound {
  if (san.includes("+") || san.includes("#")) return "check";
  if (san.includes("x")) return "capture";
  if (san.startsWith("O-O")) return "castle";
  return "move";
}
