// All sound is synthesised with WebAudio: no audio files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let musicOn = true;
let sfxOn = true;
let musicTimer: number | null = null;

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

musicOn = store.get("kk.music") !== "0";
sfxOn = store.get("kk.sfx") !== "0";

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.16 : 0;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export const audioState = () => ({ music: musicOn, sfx: sfxOn });
export function setMusic(on: boolean) {
  musicOn = on;
  store.set("kk.music", on ? "1" : "0");
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.2);
}
export function setSfx(on: boolean) {
  sfxOn = on;
  store.set("kk.sfx", on ? "1" : "0");
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, bus?: AudioNode, slide?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus || master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, q: number, vol: number, when = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

const on = () => sfxOn && ctx;

export const sfx = {
  /** A rod sliding through its bearing: a short wooden thock and a brass hiss. */
  slide(mine: boolean) {
    if (!on()) return;
    noise(0.05, mine ? 1400 : 1100, 3, 0.28);
    tone(mine ? 180 : 150, 0.06, "triangle", 0.08);
  },
  /** The figure strikes the ball. */
  kick(hard: boolean) {
    if (!on()) return;
    noise(0.04, 2600, 2, 0.4);
    tone(hard ? 120 : 160, 0.09, "square", 0.07, 0, undefined, hard ? 70 : 110);
  },
  /** The ball stops dead against a figure. */
  block() {
    if (!on()) return;
    noise(0.07, 700, 1.5, 0.45);
    tone(95, 0.12, "triangle", 0.12);
  },
  /** A clean pass, trapped. */
  trap() {
    if (!on()) return;
    noise(0.03, 3200, 4, 0.25);
    tone(660, 0.05, "triangle", 0.05);
  },
  goal() {
    if (!on()) return;
    noise(0.5, 500, 0.5, 0.25);
    [0, 4, 7, 12, 16].forEach((s, i) => tone(262 * Math.pow(2, s / 12), 0.3, "square", 0.05, i * 0.06));
  },
  concede() {
    if (!on()) return;
    noise(0.3, 400, 0.7, 0.18);
    [0, -5, -9].forEach((s, i) => tone(196 * Math.pow(2, s / 12), 0.3, "sawtooth", 0.04, i * 0.12));
  },
  /** The referee's two blasts. */
  whistle() {
    if (!on()) return;
    tone(2350, 0.12, "sine", 0.05, 0, undefined, 2250);
    tone(2350, 0.22, "sine", 0.05, 0.16, undefined, 2200);
  },
  boost() {
    if (!on()) return;
    tone(392, 0.32, "sawtooth", 0.06);
    tone(587, 0.32, "sawtooth", 0.05, 0.02);
    tone(784, 0.4, "square", 0.04, 0.05);
  },
  clear() {
    if (!on()) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.22, "square", 0.05, i * 0.065));
  },
  lose() {
    if (!on()) return;
    [0, -3, -7, -12].forEach((s, i) => tone(220 * Math.pow(2, s / 12), 0.4, "sawtooth", 0.05, i * 0.16));
  },
  coin() {
    if (!on()) return;
    tone(1318, 0.12, "square", 0.05);
    tone(1975, 0.3, "square", 0.04, 0.06);
  },
  click() {
    if (on()) tone(660, 0.04, "square", 0.04);
  },
  tick() {
    if (on()) noise(0.02, 5000, 6, 0.08);
  },
  error() {
    if (on()) tone(150, 0.15, "square", 0.06, 0, undefined, 110);
  },
  whoosh() {
    if (on()) noise(0.25, 900, 0.8, 0.2);
  },
};

// ------------------------------------------------------------ music: a slow four-chord loop
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 65], // G7
  [52, 55, 59, 62], // Em7
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function startMusic() {
  if (!ctx || !musicBus) return;
  let bar = 0;
  const beat = 0.5; // seconds per eighth
  const schedule = () => {
    if (!ctx || !musicBus) return;
    const ch = CHORDS[bar % CHORDS.length];
    // pad
    for (const n of ch) tone(midi(n - 12), beat * 8, "sine", 0.06, 0, musicBus);
    // arpeggio
    for (let i = 0; i < 8; i++) {
      const n = ch[[0, 2, 1, 3, 2, 1, 3, 2][i]];
      tone(midi(n + 12), beat * 0.9, "triangle", 0.03, i * beat, musicBus);
    }
    // bass
    tone(midi(ch[0] - 24), beat * 3.5, "triangle", 0.09, 0, musicBus);
    tone(midi(ch[0] - 24), beat * 3.5, "triangle", 0.07, beat * 4, musicBus);
    bar++;
  };
  schedule();
  musicTimer = window.setInterval(schedule, beat * 8 * 1000);
}

export function stopAll() {
  if (musicTimer) clearInterval(musicTimer);
}
