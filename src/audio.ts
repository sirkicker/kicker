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
    startBed();
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

function noise(dur: number, freq: number, q: number, vol: number, when = 0, swell = 0) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = dur > 0.45;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  if (swell) {
    // a crowd: rises, holds, falls away
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + swell);
  } else g.gain.setValueAtTime(vol, t);
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
  /** The ball stops dead against a figure: a hard wooden clack. */
  block() {
    if (!on()) return;
    noise(0.035, 2400, 3, 0.5);
    noise(0.08, 650, 1.5, 0.4, 0.01);
    tone(95, 0.12, "triangle", 0.12);
  },
  /** A rod hitting its lane stop: a heavy thunk. */
  thunk() {
    if (!on()) return;
    tone(70, 0.09, "sine", 0.12, 0, undefined, 52);
    noise(0.03, 900, 2, 0.15);
  },
  /** The stands after a goal: a short swell. */
  crowd() {
    if (!on()) return;
    noise(1.2, 900, 0.35, 0.22, 0.05, 0.25);
    noise(1.0, 2200, 0.6, 0.08, 0.1, 0.3);
  },
  /** A ghost figure takes the ball: a falling, wavering sine. */
  ghostBlock() {
    if (!on()) return;
    tone(740, 0.5, "sine", 0.06, 0, undefined, 260);
    tone(749, 0.5, "sine", 0.05, 0.02, undefined, 262);
    noise(0.06, 1800, 3, 0.25);
  },
  /** The poltergeist moves a rod: a low hum and a breath. */
  polter() {
    if (!on()) return;
    noise(0.4, 500, 0.6, 0.16);
    tone(110, 0.45, "sawtooth", 0.035, 0, undefined, 82);
    tone(165, 0.45, "sine", 0.04, 0.05, undefined, 123);
  },
  /** A goal on the Haunted table: a minor organ arpeggio. */
  hauntGoal() {
    if (!on()) return;
    noise(0.4, 500, 0.5, 0.2);
    [0, 3, 7, 12, 15].forEach((s, i) => tone(220 * Math.pow(2, s / 12), 0.42, "triangle", 0.06, i * 0.08));
    tone(110, 0.9, "sawtooth", 0.025, 0.1);
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
  // ---------------------------------------------------------------- 3.0: the table's new moments
  /** A shot line just opened: two bright bell tones, the moment the gold disc appears. */
  laneOpen() {
    if (!on()) return;
    tone(1568, 0.18, "sine", 0.05);
    tone(2349, 0.32, "sine", 0.045, 0.07);
    tone(3136, 0.22, "triangle", 0.015, 0.07);
  },
  /** The ball hits the net in a goal: a deep felt thud under the hit-stop. */
  netThud() {
    if (!on()) return;
    tone(58, 0.32, "sine", 0.2, 0, undefined, 40);
    noise(0.12, 300, 0.8, 0.35);
  },
  /** A big crowd: the stands come up for a goal. */
  roar() {
    if (!on()) return;
    noise(2.6, 700, 0.3, 0.3, 0.02, 0.18);
    noise(2.2, 1700, 0.5, 0.12, 0.08, 0.3);
    noise(1.6, 3600, 1.2, 0.04, 0.2, 0.4);
  },
  /** The stands groan: a block on your shot, or a goal against. */
  groan() {
    if (!on()) return;
    noise(1.1, 420, 0.5, 0.14, 0, 0.12);
  },
  /** The full-time whistle: three blasts, the last one long. */
  fullTime() {
    if (!on()) return;
    tone(2350, 0.14, "sine", 0.05, 0, undefined, 2280);
    tone(2350, 0.14, "sine", 0.05, 0.2, undefined, 2280);
    tone(2350, 0.7, "sine", 0.055, 0.42, undefined, 2180);
    tone(2362, 0.7, "sine", 0.02, 0.42, undefined, 2190);
  },
  /** A boss club walks out: a low brass hit and a cymbal. */
  brassHit() {
    if (!on()) return;
    for (const n of [43, 50, 55]) tone(midi(n), 0.9, "sawtooth", 0.05, 0, undefined, midi(n) * 0.98);
    tone(midi(31), 1.0, "sine", 0.18);
    noise(1.2, 6000, 0.6, 0.12);
  },
  /** The Rug: a cloth yanked off the table. */
  clothPull() {
    if (!on()) return;
    noise(0.35, 1400, 0.4, 0.3, 0, 0.05);
    tone(300, 0.3, "sawtooth", 0.03, 0, undefined, 90);
  },
  /** Closing Bell: a market-close bell, struck three times. */
  bell() {
    if (!on()) return;
    for (let i = 0; i < 3; i++) {
      const t = i * 0.55;
      tone(880, 1.4, "sine", 0.07, t);
      tone(880 * 2.76, 0.8, "sine", 0.025, t);
      tone(880 * 5.4, 0.4, "sine", 0.012, t);
    }
  },
  /** A padlock or a halt tape goes on: a dry metal click. */
  latch() {
    if (!on()) return;
    noise(0.03, 4200, 4, 0.35);
    tone(1200, 0.06, "square", 0.03, 0.03);
  },
  /** Their keeper reaches a tight shot: a glove slap. */
  glove() {
    if (!on()) return;
    noise(0.06, 1200, 1.2, 0.45);
    tone(140, 0.12, "sine", 0.1);
  },
  /** A first-time shot off a pass. */
  firstTime() {
    if (!on()) return;
    noise(0.18, 3000, 0.7, 0.2);
    tone(988, 0.12, "triangle", 0.04, 0.02, undefined, 1480);
  },
  /** The build-up: one rising blip per pass in the move. */
  chain(n: number) {
    if (!on()) return;
    const f = 523 * Math.pow(2, (Math.min(n, 6) * 2) / 12);
    tone(f, 0.12, "triangle", 0.045);
    if (n >= 3) tone(f * 1.5, 0.18, "sine", 0.03, 0.05);
  },
  /** Their rods read you: a quick, quiet tick per rod. */
  read() {
    if (on()) tone(1760, 0.03, "square", 0.012);
  },
};

// ------------------------------------------------------------ music that follows the match
/**
 * What the table is doing, for the music:
 * - title: the four-chord loop, unhurried (also the dressing room and match day);
 * - calm: your ball in your own half;
 * - attack: your ball in their third, with a kick drum and a hat;
 * - defend: their ball, thinned out to pad and a bass pulse;
 * - boss: a minor turn and a low pulse;
 * - final: a heartbeat under a held minor chord;
 * - haunt: the loop in minor, slower arpeggio.
 */
export type Mood = "title" | "calm" | "attack" | "defend" | "boss" | "final" | "haunt";
let mood: Mood = "title";
export function setMood(m: Mood) {
  mood = m;
}
export const moodNow = () => mood;

const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [55, 59, 62, 65], // G7
  [52, 55, 59, 62], // Em7
];
const MINOR = [
  [57, 60, 64, 67], // Am7
  [58, 62, 65, 69], // Bbmaj7
  [57, 60, 64, 67], // Am7
  [56, 59, 62, 65], // G#dim7
];
function midi(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function drum(when: number, vol = 0.16) {
  if (!ctx || !musicBus) return;
  tone(110, 0.16, "sine", vol, when, musicBus, 42);
}
function hat(when: number) {
  if (!ctx || !musicBus || !noiseBuf) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t, Math.random() * 0.3);
  src.stop(t + 0.06);
}

let beatN = 0;
function startMusic() {
  if (!ctx || !musicBus) return;
  const beat = 0.5; // seconds per eighth
  // one eighth ahead, every eighth: the mood turns on the next beat, not the next bar
  const schedule = () => {
    if (!ctx || !musicBus || hidden) return;
    const m = mood;
    const minor = m === "boss" || m === "haunt" || m === "final";
    const prog = minor ? MINOR : CHORDS;
    const bar = Math.floor(beatN / 8);
    const i = beatN % 8;
    const ch = prog[bar % prog.length];
    const at = 0.05;
    if (i === 0) {
      const padVol = m === "defend" ? 0.07 : m === "final" ? 0.05 : 0.06;
      for (const n of ch) tone(midi(n - 12), beat * 8, m === "haunt" ? "triangle" : "sine", padVol, at, musicBus);
      tone(midi(ch[0] - 24), beat * 3.5, "triangle", 0.09, at, musicBus);
    }
    if (i === 4 && m !== "final") tone(midi(ch[0] - 24), beat * 3.5, "triangle", 0.07, at, musicBus);
    // the arpeggio thins out on their ball and in the final
    const arp = m === "title" || m === "calm" || m === "attack" || m === "boss" || (m === "haunt" && i % 2 === 0);
    if (arp) {
      const n = ch[[0, 2, 1, 3, 2, 1, 3, 2][i]];
      tone(midi(n + 12), beat * 0.9, "triangle", m === "attack" ? 0.035 : 0.03, at, musicBus);
    }
    if (m === "attack") {
      if (i % 2 === 0) drum(at);
      hat(at + beat / 2);
    } else if (m === "boss") {
      if (i % 4 === 0) drum(at, 0.12);
    } else if (m === "defend") {
      if (i === 0 || i === 3 || i === 6) tone(midi(ch[0] - 24), 0.12, "sine", 0.08, at, musicBus);
    } else if (m === "final" && i % 4 === 0) {
      // a heartbeat: lub-dub, every half bar
      drum(at, 0.2);
      drum(at + 0.18, 0.12);
    }
    beatN++;
  };
  schedule();
  musicTimer = window.setInterval(schedule, beat * 1000);
}

// ------------------------------------------------------------ the crowd bed: a murmur that follows the ball
let bedGain: GainNode | null = null;
let bedFilter: BiquadFilterNode | null = null;
let bedLevel = 0;
let bedTension = 0;
function startBed() {
  if (!ctx || !master || bedGain) return;
  // two seconds of brown noise, looped
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 500;
  bedGain = ctx.createGain();
  bedGain.gain.value = 0;
  src.connect(bedFilter).connect(bedGain).connect(master);
  src.start();
  applyBed();
}
function applyBed() {
  if (!ctx || !bedGain || !bedFilter) return;
  const v = sfxOn && !hidden && bedLevel > 0 ? 0.03 + bedLevel * 0.06 + bedTension * 0.08 : 0;
  bedGain.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
  bedFilter.frequency.setTargetAtTime(380 + bedTension * 900 + bedLevel * 200, ctx.currentTime, 0.6);
}
/** The murmur: `level` is how full the stands are (0..1, 0 = silent), `tension` how close the ball is to their goal. */
export function setCrowdBed(level: number, tension: number) {
  bedLevel = Math.max(0, Math.min(1, level));
  bedTension = Math.max(0, Math.min(1, tension));
  applyBed();
}

// a tab in the background makes no sound and schedules nothing
let hidden = typeof document !== "undefined" && document.hidden;
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (!ctx) return;
    if (hidden) void ctx.suspend();
    else void ctx.resume();
    applyBed();
  });

export function stopAll() {
  if (musicTimer) clearInterval(musicTimer);
}
