// Board sounds: a wooden piece set down, a capture, check, a castle. Recorded samples when the app
// bundles them (src/assets/sounds/<kind>.ogg, credited there); otherwise a synthesised knock of
// filtered noise and a short low thump, close enough to a piece on a wooden board. No React.

export type BoardSound = "move" | "capture" | "check" | "castle" | "start";

const recorded = import.meta.glob<string>("../assets/sounds/*.{ogg,mp3,wav}", { eager: true, import: "default" });
const sampleUrl = (kind: BoardSound) => Object.entries(recorded).find(([path]) => path.includes(`/${kind}.`))?.[1];

let context: AudioContext | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

function audio(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  context ??= new AudioContext();
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

/** One knock: a burst of band-passed noise (the click of wood) over a short low thump. */
function knock(ctx: AudioContext, at: number, loud: number, pitch: number) {
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

function synth(ctx: AudioContext, kind: BoardSound) {
  const t = ctx.currentTime + 0.005;
  switch (kind) {
    case "move":
      knock(ctx, t, 0.7, 1);
      break;
    case "capture":
      // The taken piece knocked aside, then the capturer set down harder.
      knock(ctx, t, 0.45, 1.3);
      knock(ctx, t + 0.05, 0.95, 0.95);
      break;
    case "castle":
      knock(ctx, t, 0.6, 1);
      knock(ctx, t + 0.09, 0.6, 1.08);
      break;
    case "check":
      knock(ctx, t, 0.8, 1.15);
      break;
    case "start":
      for (let i = 0; i < 5; i++) knock(ctx, t + i * 0.035, 0.35 + 0.1 * (i % 2), 0.9 + 0.05 * i);
      break;
  }
}

/** Plays a board sound; silent where the platform has no audio. */
export async function playBoardSound(kind: BoardSound): Promise<void> {
  const ctx = audio();
  if (!ctx) return;
  // The recordings have a move and a capture: check and castle use the move's knock.
  const url = sampleUrl(kind) ?? (kind === "check" || kind === "castle" ? sampleUrl("move") : undefined);
  const sample = url ? await load(ctx, url) : undefined;
  if (!sample) {
    synth(ctx, kind);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = sample;
  src.connect(ctx.destination);
  src.start();
}

/** Which sound a move makes, from its SAN: check wins, then capture, then castle. */
export function soundFor(san: string): BoardSound {
  if (san.includes("+") || san.includes("#")) return "check";
  if (san.includes("x")) return "capture";
  if (san.startsWith("O-O")) return "castle";
  return "move";
}
