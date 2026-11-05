// KICKER 6 "Side-eye": our own kicker, drawn from scratch. A carved and painted table-football man, bolted through the
// chest on a brass rod, who can only move sideways, so he only ever looks sideways.
//
// One 32 x 48 pixel figure, built from layered traits that follow from his number (0..1110) alone, in a fixed
// palette, closed by a 1 px ink outline. Pure arithmetic shared by the browser (canvas) and the server (sharp + resvg):
// no DOM, no Node. RGBA out.
import { hash32, mulberry32, type Rand } from "./rng.js";

export const K6W = 32;
export const K6H = 48;
export const K6_SIZE = 1111;
/** The row the rod's centre passes through (between rows K6_ROD - 1 and K6_ROD), and its thickness, in sprite px. */
export const K6_ROD = 31;
export const K6_ROD_T = 4;
/** The reactions' frame: the figure in the middle, room for raised arms. Its centre is the set frame's centre. */
export const K6RW = 44;

// ---------------------------------------------------------------- the palette
type Ramp = [string, string, string, string?];
/** Ink: the outline and every painted line. */
export const INK = "#1b0f15";
/** Hand-picked ramps: shadow, paint, light, lacquer gleam. Shadows lean to wine, lights to cream. */
export const SKIN: Record<string, Ramp> = {
  porcelain: ["#d39a83", "#f3d2b4", "#fde9d3", "#fffaf2"],
  peach: ["#bf7c58", "#e8b48c", "#f7d4ad", "#fff1dc"],
  tan: ["#9a5b3d", "#c98f66", "#e2b089", "#f8dcbc"],
  umber: ["#6f3c27", "#9b6340", "#bd845a", "#e2b48a"],
  deep: ["#43231a", "#6b3f29", "#8d5a3b", "#c08a62"],
  wood: ["#94612f", "#cd9757", "#e8bd83", "#fbe3b8"],
};
export const HAIR: Record<string, Ramp> = {
  black: ["#120a0e", "#2b1d23", "#4c3b42", "#8a7a80"],
  espresso: ["#2a170f", "#4d2e1e", "#71472f", "#a8806a"],
  chestnut: ["#5a2b15", "#8b4a24", "#b36c3b", "#e0a272"],
  ginger: ["#8c3816", "#c6622a", "#e88d4c", "#ffc69a"],
  blond: ["#9c742a", "#d6b05a", "#f0d690", "#fff4cf"],
  grey: ["#6a6466", "#a39b9c", "#d1cac9", "#f6f1ef"],
  white: ["#b4aca6", "#e6e0d8", "#fffaf1", "#ffffff"],
  wine: ["#3d0f21", "#6e2140", "#9b3c5d", "#d88aa4"],
  teal: ["#0e2b31", "#1e4a53", "#357079", "#7fb3b8"],
};
/** The house kit colours (the same sixteen as 5.x). */
export const KIT_BASE: Record<string, string> = {
  cream: "#f1e4c8", brass: "#d6b25e", ochre: "#a2733a", wine: "#6e2140", claret: "#a3344d", vermilion: "#cf5b3e",
  peach: "#e3a27a", felt: "#2f6f62", teal: "#1e4a53", sage: "#8db5a3", slate: "#3e5d8c", powder: "#a3bad6",
  ink: "#2a1a21", smoke: "#5c4a50", stone: "#b9ada0", rose: "#e2c3cf",
};
export const BRASS: Ramp = ["#6b4c20", "#b48b3f", "#e3c47c", "#fff1c4"];
export const GOLD: Ramp = ["#7a4d0c", "#d19b2a", "#f6d572", "#fff6cf"];
export const GLOW: Ramp = ["#2f7457", "#7fd6a6", "#c8f7dc", "#f2fff6"];
export const EYE = { white: "#f8f1e4", shade: "#d9cbb8", pupil: INK };
const MOUTH = "#5a1630";
const SWEAT: Ramp = ["#5f86b0", "#a8cbe8", "#eef7ff"];
const TAPE: Ramp = ["#a99a82", "#e4d9c2", "#f8f0de"];
const BOOT: Ramp = ["#120a0e", "#2b1d23", "#4c3b42", "#8a7a80"];
const GLOVE: Ramp = ["#2f6a2a", "#6fae3a", "#b5dc68"];
const WOOD: Ramp = ["#94612f", "#cd9757", "#e8bd83"];
const BLUSH = "#e58f86";

export type RGB = [number, number, number];
export const hexRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
/** A kit colour's ramp: shadow toward wine-ink, light toward cream. Fixed, so the palette is fixed. */
export function kitRamp(c: string): Ramp {
  return [mix(c, "#1b0812", 0.32), c, mix(c, "#fff4dc", 0.28)];
}
export const KIT_RAMPS: Record<string, Ramp> = Object.fromEntries(Object.entries(KIT_BASE).map(([k, c]) => [k, kitRamp(c)]));
const GOLD_KIT: Ramp = [GOLD[0], GOLD[1], GOLD[2]];
const GLOW_KIT: Ramp = [GLOW[0], GLOW[1], GLOW[2]];
const GOLD_HAIR: Ramp = [GOLD[0], mix(GOLD[0], GOLD[1], 0.5), GOLD[1], GOLD[2]];
const GLOW_HAIR: Ramp = [GLOW[0], mix(GLOW[0], GLOW[1], 0.45), GLOW[1], GLOW[2]];
const GOLD_TRIM: Ramp = [BOOT[0], BOOT[1], BOOT[2]];
const GLOW_TRIM: Ramp = [GLOW[0], mix(GLOW[0], GLOW[1], 0.45), GLOW[1]];

/** Every colour a kicker of the set may contain. */
export const K6_PALETTE: string[] = (() => {
  const s = new Set<string>([INK, EYE.white, EYE.shade, MOUTH, BLUSH]);
  const add = (r: (string | undefined)[]) => r.forEach((c) => c && s.add(c));
  for (const r of [...Object.values(SKIN), ...Object.values(HAIR), ...Object.values(KIT_RAMPS), BRASS, GOLD, GLOW, SWEAT, TAPE, BOOT, GLOVE, WOOD, GOLD_HAIR, GLOW_HAIR, GOLD_TRIM, GLOW_TRIM]) add(r);
  return [...s];
})();

// ---------------------------------------------------------------- traits
export const HEADS = ["round", "pear", "egg", "wide", "block"] as const;
export const HAIRDOS = ["bowl", "side part", "flat top", "buzz", "quiff", "mohawk", "curls", "slick", "mullet", "perm", "long", "receding", "bald", "cap", "beanie", "headband", "bucket"] as const;
export const EYES = ["side-eye", "half-lidded", "one brow up", "sweating", "narrowed"] as const;
export const MOUTHS = ["flat", "smirk", "small o", "frown", "teeth", "moustache", "whistle"] as const;
export const SHIRTS = ["plain", "stripes", "hoops", "sash", "halves"] as const;
export const WEAR = ["none", "chipped paint", "cracked nose", "tape repair", "captain band"] as const;
export const SPECIAL = ["none", "gold leaf", "glow", "keeper", "ref"] as const;

export interface Traits {
  n: number;
  head: (typeof HEADS)[number];
  skin: string;
  hair: (typeof HAIRDOS)[number];
  hairCol: string;
  eyes: (typeof EYES)[number];
  /** Which way he looks: 1 right, -1 left. */
  look: 1 | -1;
  mouth: (typeof MOUTHS)[number];
  shirt: (typeof SHIRTS)[number];
  /** Kit colours by name: shirt, trim (pattern, collar, cuffs, shorts). */
  kitA: string;
  kitB: string;
  num: number;
  wear: (typeof WEAR)[number];
  special: (typeof SPECIAL)[number];
}

const pick = <T>(r: Rand, a: readonly T[], w?: number[]): T => {
  if (!w) return a[Math.floor(r() * a.length)];
  const t = w.reduce((p, q) => p + q, 0);
  let x = r() * t;
  for (let i = 0; i < a.length; i++) if ((x -= w[i]) < 0) return a[i];
  return a[a.length - 1];
};
/** Kit pairs that read on the felt and on a tint: shirt, trim. */
const PAIRS: [string, string][] = [
  ["wine", "cream"], ["cream", "wine"], ["claret", "cream"], ["vermilion", "ink"], ["felt", "cream"], ["teal", "brass"],
  ["slate", "cream"], ["powder", "ink"], ["ink", "brass"], ["cream", "slate"], ["brass", "ink"], ["sage", "teal"],
  ["ochre", "cream"], ["rose", "wine"], ["stone", "claret"], ["smoke", "peach"], ["cream", "felt"], ["peach", "teal"],
  ["claret", "brass"], ["teal", "cream"], ["vermilion", "cream"], ["slate", "brass"], ["ink", "cream"], ["powder", "slate"],
];

/** No. n of the set (0..1110): everything about him follows from the number. */
export function traitsOf(n: number): Traits {
  n = ((Math.floor(n) % K6_SIZE) + K6_SIZE) % K6_SIZE;
  const r = mulberry32(hash32("kicker6|" + n));
  const sp = r();
  const special: Traits["special"] = sp < 0.012 ? "gold leaf" : sp < 0.024 ? "glow" : sp < 0.05 ? "keeper" : sp < 0.07 ? "ref" : "none";
  const head = pick(r, HEADS, [30, 24, 16, 14, 16]);
  const skin = pick(r, Object.keys(SKIN), [16, 20, 18, 16, 14, 16]);
  let hair = pick(r, HAIRDOS, [7, 8, 5, 6, 6, 3, 6, 6, 6, 5, 4, 4, 5, 8, 6, 5, 4]);
  let hairCol = pick(r, Object.keys(HAIR), [20, 18, 14, 9, 10, 7, 4, 9, 9]);
  const eyes = pick(r, EYES, [32, 30, 14, 10, 14]);
  const look: 1 | -1 = r() < 0.5 ? 1 : -1;
  let mouth = pick(r, MOUTHS, [24, 26, 10, 12, 8, 12, 8]);
  let shirt = pick(r, SHIRTS, [20, 22, 20, 16, 22]);
  let [kitA, kitB] = PAIRS[Math.floor(r() * PAIRS.length)];
  const num = 2 + Math.floor(r() * 10);
  const wear = pick(r, WEAR, [52, 14, 10, 12, 12]);
  if (special === "ref") {
    kitA = "ink";
    kitB = "cream";
    shirt = "plain";
    mouth = "whistle";
  } else if (mouth === "whistle") mouth = "flat";
  if (special === "keeper") {
    shirt = "plain";
    if (r() < 0.5) hair = "cap";
  }
  if ((hair === "bald" || hair === "receding") && hairCol === "white") hairCol = "grey";
  return { n, head, skin, hair, hairCol, eyes, look, mouth, shirt, kitA, kitB, num, wear, special };
}

/** His number in the set, as the site writes it. */
export const k6No = (n: number) => "No. " + String(n).padStart(4, "0");

// ---------------------------------------------------------------- poses
export const POSES = ["idle", "kick", "wag", "goal", "facepalm", "grip", "watch", "shake", "sit"] as const;
export type K6Pose = (typeof POSES)[number];

export interface K6Opts {
  pose?: K6Pose;
  /** Override the kit with a launch's colours (any #rrggbb). */
  kit?: { a: string; b: string };
  /** A 6x6 crest on the chest instead of his number: 36 colours. */
  crest?: string[];
  /** Holders: brass becomes gold (cosmetic). */
  gold?: boolean;
  /** Override the mouth (the reactions pick their own). */
  mouth?: Traits["mouth"] | "open";
}

export interface K6Sprite {
  w: number;
  h: number;
  /** RGBA, w * h * 4. */
  px: Uint8ClampedArray;
}

// ---------------------------------------------------------------- the drawing surface
class Pix {
  c: (string | null)[];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.c = new Array(w * h).fill(null);
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  set(x: number, y: number, col: string) {
    if (this.in(x, y)) this.c[y * this.w + x] = col;
  }
  get(x: number, y: number) {
    return this.in(x, y) ? this.c[y * this.w + x] : null;
  }
}

/** A set of pixels, painted together and shaded together. */
class Blob {
  pts = new Set<number>();
  add(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < IW && y < K6H) this.pts.add(y * IW + x);
    return this;
  }
  rect(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.add(x, y);
    return this;
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < IW && y < K6H && this.pts.has(y * IW + x);
  }
  /** A limb: a line of width w from (x0, y0) to (x1, y1), stepped one row at a time. */
  limb(x0: number, y0: number, x1: number, y1: number, w = 2) {
    const n = Math.max(Math.abs(y1 - y0), Math.abs(x1 - x0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let k = 0; k < w; k++) this.add(x + k, y);
    }
    return this;
  }
  /** Mirrored about the figure's centre (for the left side). */
  mirror() {
    const b = new Blob();
    for (const i of this.pts) b.add(IW - 1 - (i % IW), Math.floor(i / IW));
    return b;
  }
}
const side = (b: Blob, s: 1 | -1) => (s > 0 ? b : b.mirror());

/**
 * Paint a blob like a turned, lacquered wooden part lit from the top left: the light rim on the left, the shadow
 * on the right and underneath; narrow runs are only paint and shadow.
 */
function paint(p: Pix, b: Blob, r: Ramp, o: { under?: boolean; top?: boolean } = {}) {
  for (const i of b.pts) {
    const x = i % IW;
    const y = Math.floor(i / IW);
    let run = 0;
    for (let k = x; b.has(k, y); k--) run++;
    for (let k = x + 1; b.has(k, y); k++) run++;
    let c = r[1];
    if (!b.has(x + 1, y)) c = r[0];
    else if (!b.has(x - 1, y) && run > 2) c = r[2];
    if (o.under && !b.has(x, y + 1) && b.has(x - 1, y)) c = r[0];
    if (o.top && !b.has(x, y - 1) && b.has(x + 1, y) && c === r[1]) c = r[2];
    p.set(x, y, c);
  }
}

/** Head shapes as a half-width per row, top to bottom (symmetric about the figure's centre). */
const HEAD_ROWS: Record<Traits["head"], number[]> = {
  round: [4, 6, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 7, 5],
  pear: [4, 5, 6, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 8, 6],
  egg: [3, 5, 6, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 4],
  wide: [6, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 8, 6],
  block: [7, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 7],
};
const IW = 44; // the drawing surface: wide enough for raised arms; the set is cut to the middle 32
const CX = 22; // the figure's centre line falls between columns 21 and 22
const OX = CX - 16;
const CHIN = 21;
const EYE_Y = 11;
const T0 = 23; // shoulders
const T1 = 35; // shirt hem
const S0 = 36; // shorts
const S1 = 38;
const K0 = 39; // socks
const B0 = 44; // boot

// ---------------------------------------------------------------- digits for the shirt (3 x 5)
const DIGITS = ["111101101101111", "110010010010111", "111001111100111", "111001011001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function digit(p: Pix, d: number, x: number, y: number, col: string) {
  const g = DIGITS[d];
  for (let i = 0; i < 15; i++) if (g[i] === "1") p.set(x + (i % 3), y + Math.floor(i / 3), col);
}

/** Which colour reads on the shirt for the number: the trim, or ink / cream if the trim is too close. */
function onShirt(bg: string, fg: string): string {
  const l = (h: string) => {
    const [r, g, b] = hexRgb(h);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  if (Math.abs(l(bg) - l(fg)) > 70) return fg;
  return l(bg) > 128 ? INK : KIT_BASE.cream;
}

/** Draw kicker t into a 32 x 48 RGBA sprite. */
export function drawK6(t: Traits, o: K6Opts = {}): K6Sprite {
  const pose: K6Pose = o.pose || "idle";
  const p = new Pix(IW, K6H);
  const L = t.look;
  const gold = t.special === "gold leaf";
  const glow = t.special === "glow";
  const keeper = t.special === "keeper";
  const metal = o.gold || gold ? GOLD : BRASS;

  const skin: Ramp = gold ? GOLD : glow ? GLOW : SKIN[t.skin];
  const hairR: Ramp = gold ? GOLD_HAIR : glow ? GLOW_HAIR : HAIR[t.hairCol];
  let kA: Ramp = o.kit ? kitRamp(o.kit.a) : KIT_RAMPS[t.kitA];
  let kB: Ramp = o.kit ? kitRamp(o.kit.b) : KIT_RAMPS[t.kitB];
  if (gold) [kA, kB] = [GOLD_KIT, GOLD_TRIM];
  else if (glow) [kA, kB] = [GLOW_KIT, GLOW_TRIM];
  const hand: Ramp = keeper ? GLOVE : skin;
  const sitting = pose === "sit";

  // the head's outline
  const rows = HEAD_ROWS[t.head];
  const top = CHIN - rows.length + 1;
  const hw = (y: number) => (y >= top && y <= CHIN ? rows[y - top] : 0);
  const head = new Blob();
  for (let y = top; y <= CHIN; y++) for (let x = CX - hw(y); x < CX + hw(y); x++) head.add(x, y);
  const inHead = (x: number, y: number) => head.has(x, y);

  // ---------------------------------------------------------------- behind everything: long hair, the bench
  if (t.hair === "mullet" || t.hair === "long") {
    const b = new Blob();
    const reach = t.hair === "mullet" ? T0 + 2 : T0 + 3;
    for (let y = EYE_Y; y <= reach; y++) {
      const w = Math.max(hw(Math.min(y, CHIN - 2)), 7);
      const k = t.hair === "long" ? 3 : 2;
      for (let i = 0; i < k; i++) {
        b.add(CX - w - 1 + i, y);
        b.add(CX + w - i, y);
      }
    }
    paint(p, b, hairR);
  }
  if (t.hair === "perm") {
    const b = new Blob();
    for (let y = top - 2; y <= EYE_Y + 3; y++) {
      const w = Math.max(hw(y), hw(top + 4)) + (y < EYE_Y ? 2 : 1) - (y === top - 2 ? 4 : y === top - 1 ? 1 : 0);
      for (let x = CX - w; x < CX + w; x++) if (!((x + y) % 5 === 0 && (x === CX - w || x === CX + w - 1))) b.add(x, y);
    }
    paint(p, b, hairR, { top: true });
    // curls: light dots on a grid
    for (const i of b.pts) {
      const x = i % IW;
      const y = Math.floor(i / IW);
      if ((x * 3 + y * 2) % 7 === 0 && b.has(x + 1, y) && b.has(x - 1, y)) p.set(x, y, hairR[2]);
    }
  }
  if (sitting) {
    // the bench: a plank at his hips, and two legs
    const plank = new Blob().rect(CX - 18, S0 + 1, CX + 17, S0 + 2);
    paint(p, plank, WOOD, { top: true });
    for (let x = CX - 18; x <= CX + 17; x++) p.set(x, S0 + 1, WOOD[2]);
    for (const lx of [CX - 16, CX + 14]) paint(p, new Blob().rect(lx, S0 + 3, lx + 1, 46), WOOD);
  }

  // ---------------------------------------------------------------- the lower body
  // shorts
  const shortsR = keeper ? KIT_RAMPS.ink : gold ? GOLD_TRIM : kB;
  const shorts = new Blob().rect(CX - 6, S0, CX + 5, S1);
  paint(p, shorts, shortsR);
  // the fused leg block: socks with a turned-over band, a carved split
  const kneeTop = sitting ? S1 + 2 : K0;
  const socks = new Blob().rect(CX - 5, kneeTop, CX + 4, B0 - 1);
  paint(p, socks, kA);
  for (let x = CX - 5; x <= CX + 4; x++) {
    p.set(x, kneeTop, x === CX + 4 ? kB[0] : x === CX - 5 ? kB[2] : kB[1]);
  }
  for (let y = kneeTop + 2; y < B0; y++) p.set(CX - 1, y, kA[0]);
  // the boot: one lacquered block, the toe longer on the side he looks
  const boot = new Blob();
  for (let y = B0; y <= B0 + 2; y++) {
    const a = CX - 6 - (L < 0 && y > B0 ? 1 : 0);
    const b = CX + 5 + (L > 0 && y > B0 ? 1 : 0);
    for (let x = a; x <= b; x++) if (!(y === B0 && (x === a || x === b))) boot.add(x, y);
  }
  paint(p, boot, BOOT, { under: true });
  for (let x = CX - 4; x <= CX + 1; x++) p.set(x, B0, BOOT[2]);
  p.set(CX - 3, B0, BOOT[3]!);

  // ---------------------------------------------------------------- the torso
  const torso = new Blob();
  for (let y = T0; y <= T1; y++) for (let x = CX - (y === T0 ? 5 : 6); x < CX + (y === T0 ? 5 : 6); x++) torso.add(x, y);
  const shirt = keeper || t.special === "ref" ? "plain" : t.shirt;
  const isB = (x: number, y: number) => {
    if (y === T0 || (y === T0 + 1 && x >= CX - 1 && x <= CX)) return true; // the collar: a small v
    if (y === T1) return true; // the hem
    switch (shirt) {
      case "stripes":
        return Math.floor((x - (CX - 6)) / 2) % 2 === 1;
      case "hoops":
        return y > T0 + 1 && Math.floor((y - T0 - 2) / 2) % 2 === 1;
      case "sash": {
        const d = L > 0 ? x - (CX - 6) - (y - T0) : CX + 5 - x - (y - T0);
        return d >= -3 && d <= -1;
      }
      case "halves":
        return L > 0 ? x >= CX : x < CX;
      default:
        return false;
    }
  };
  const tA = new Blob();
  const tB = new Blob();
  for (const i of torso.pts) {
    const x = i % IW;
    const y = Math.floor(i / IW);
    (isB(x, y) ? tB : tA).add(x, y);
  }
  // shade by the torso's shape, paint by the pattern
  for (const i of torso.pts) {
    const x = i % IW;
    const y = Math.floor(i / IW);
    const r = tB.has(x, y) ? kB : kA;
    let c = r[1];
    if (!torso.has(x + 1, y) || !torso.has(x + 2, y)) c = r[0];
    else if (!torso.has(x - 1, y)) c = r[2];
    p.set(x, y, c);
  }
  // the ref: a cream collar and a dark shirt
  if (t.special === "ref") for (const x of [CX - 2, CX + 1]) p.set(x, T0 + 1, EYE.white);
  // number or crest on the chest, above the rod
  if (o.crest && o.crest.length >= 36) {
    for (let i = 0; i < 36; i++) p.set(CX - 3 + (i % 6), T0 + 2 + Math.floor(i / 6), o.crest[i]);
    // a thin frame so any crest sits on any shirt
    for (let i = -1; i <= 6; i++) {
      p.set(CX - 3 + i, T0 + 1, metal[2]);
      p.set(CX - 3 + i, T0 + 8, metal[0]);
    }
    for (let j = 1; j <= 8; j++) {
      p.set(CX - 4, T0 + j, metal[1]);
      p.set(CX + 3, T0 + j, metal[0]);
    }
  } else if (!gold && !glow && t.special !== "ref" && shirt === "plain") {
    // the number only where it reads: on a plain shirt (on stripes and hoops it turned into a letter)
    const num = keeper ? 1 : t.num;
    const col = onShirt(kA[1], kB[1]);
    const y = T0 + 2;
    if (num >= 10) {
      digit(p, Math.floor(num / 10), CX - 4, y, col);
      digit(p, num % 10, CX, y, col);
    } else digit(p, num, CX - 2, y, col);
  }
  // the neck
  const neck = new Blob().rect(CX - 3, CHIN, CX + 2, T0 - 1);
  paint(p, neck, [skin[0], skin[0], skin[1]]);

  // ---------------------------------------------------------------- arms (right side drawn, the left mirrored)
  const sleeveR: Ramp = kA;
  const cuffR: Ramp = keeper ? kA : kB;
  const X = (k: number) => CX + k; // a column on his right, k from the centre line
  /** An arm at rest: a short sleeve with a cuff, a forearm, a fist. */
  const rest = (s: 1 | -1) => {
    paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 3), s), sleeveR);
    paint(p, side(new Blob().rect(X(6), T0 + 4, X(8), T0 + 4), s), cuffR);
    paint(p, side(new Blob().rect(X(6), T0 + 5, X(7), T0 + 9), s), keeper ? sleeveR : skin);
    paint(p, side(new Blob().rect(X(6), T0 + 10, X(8), T0 + 11).add(X(7), T0 + 12), s), hand, { under: true });
  };
  /** A raised arm: shoulder sleeve, then a forearm up to (hx, hy), a fist on it. */
  const raised = (s: 1 | -1, hx: number, hy: number, fist = true) => {
    paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 2), s), sleeveR);
    const arm = new Blob().limb(X(7), T0 - 1, hx, hy + 3, 2);
    const cuff = new Blob();
    const fore = new Blob();
    for (const i of arm.pts) (Math.floor(i / IW) >= T0 - 2 ? cuff : fore).add(i % IW, Math.floor(i / IW));
    paint(p, side(cuff, s), cuffR);
    paint(p, side(fore, s), keeper ? sleeveR : skin);
    if (fist) paint(p, side(new Blob().rect(hx - 1, hy, hx + 1, hy + 2), s), hand, { under: true });
  };
  const LS = L as 1 | -1;
  switch (pose) {
    case "goal":
      raised(1, X(13), 6);
      raised(-1, X(13), 6);
      break;
    case "wag": {
      rest((-LS) as 1 | -1);
      raised(LS, X(12), 15, false);
      // the hand, side on, one finger up
      paint(p, side(new Blob().rect(X(11), 13, X(13), 16), LS), hand, { under: true });
      paint(p, side(new Blob().rect(X(12), 9, X(12), 12), LS), [hand[1], hand[1], hand[2]]);
      paint(p, side(new Blob().add(X(13), 12), LS), [hand[0], hand[0], hand[0]]);
      break;
    }
    case "facepalm": {
      rest((-LS) as 1 | -1);
      paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 2), LS), sleeveR);
      paint(p, side(new Blob().rect(X(6), T0 - 1, X(8), T0 - 1), LS), cuffR);
      break;
    }
    case "grip": {
      for (const s of [1, -1] as const) {
        paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 3), s), sleeveR);
        paint(p, side(new Blob().rect(X(6), T0 + 4, X(8), T0 + 4), s), cuffR);
        paint(p, side(new Blob().limb(X(7), T0 + 5, X(9), K6_ROD - 3, 2), s), keeper ? sleeveR : skin);
        paint(p, side(new Blob().rect(X(9), K6_ROD - 3, X(11), K6_ROD + 1), s), hand, { under: true });
      }
      break;
    }
    case "watch": {
      rest((-LS) as 1 | -1);
      raised(LS, X(12), 12);
      // the watch on his wrist, face out: a brass case, a cream dial, one hand
      const w = side(new Blob().rect(X(11), 15, X(13), 17), LS);
      for (const i of w.pts) p.set(i % IW, Math.floor(i / IW), metal[1]);
      for (const i of side(new Blob().add(X(11), 15), LS).pts) p.set(i % IW, Math.floor(i / IW), metal[2]);
      for (const i of side(new Blob().add(X(12), 16), LS).pts) p.set(i % IW, Math.floor(i / IW), EYE.white);
      for (const i of side(new Blob().add(X(13), 17), LS).pts) p.set(i % IW, Math.floor(i / IW), metal[0]);
      break;
    }
    case "shake": {
      rest((-LS) as 1 | -1);
      paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 3), LS), sleeveR);
      paint(p, side(new Blob().rect(X(9), T0 + 2, X(9), T0 + 4), LS), cuffR);
      paint(p, side(new Blob().rect(X(10), T0 + 3, X(13), T0 + 4), LS), keeper ? sleeveR : skin);
      paint(p, side(new Blob().rect(X(14), T0 + 2, X(15), T0 + 5), LS), hand, { under: true });
      break;
    }
    case "sit": {
      // hands on his knees
      for (const s of [1, -1] as const) {
        paint(p, side(new Blob().rect(X(6), T0, X(8), T0 + 3), s), sleeveR);
        paint(p, side(new Blob().rect(X(6), T0 + 4, X(8), T0 + 4), s), cuffR);
        paint(p, side(new Blob().limb(X(6), T0 + 5, X(5), S1, 2), s), keeper ? sleeveR : skin);
        paint(p, side(new Blob().rect(X(3), S1 + 1, X(5), S1 + 2), s), hand, { under: true });
      }
      break;
    }
    default:
      rest(1);
      rest(-1);
  }
  if (t.wear === "captain band" && (pose === "idle" || pose === "kick" || pose === "sit")) {
    const band = side(new Blob().rect(X(6), T0 + 2, X(8), T0 + 2), (-LS) as 1 | -1);
    for (const i of band.pts) p.set(i % IW, Math.floor(i / IW), metal[2]);
  }

  // ---------------------------------------------------------------- the head: a lacquered wooden ball, painted
  const cxh = CX - 0.5;
  const cyh = (top + CHIN) / 2;
  const wmax = Math.max(...rows);
  for (const i of head.pts) {
    const x = i % IW;
    const y = Math.floor(i / IW);
    const nx = (x - cxh) / wmax;
    const ny = (y - cyh) / (rows.length / 2);
    const v = nx * 0.66 + ny * 0.34;
    let c = skin[1];
    if (v > 0.5 || !inHead(x + 1, y) || (!inHead(x, y + 1) && nx > -0.4)) c = skin[0];
    else if (v < -0.42 && (!inHead(x - 1, y) || !inHead(x, y - 1) || !inHead(x - 2, y))) c = skin[2];
    p.set(x, y, c);
  }
  // ears
  for (const s of [-1, 1]) {
    const w = hw(EYE_Y + 2);
    const ex = s < 0 ? CX - w - 1 : CX + w;
    for (const y of [EYE_Y + 2, EYE_Y + 3]) p.set(ex, y, s < 0 ? skin[1] : skin[0]);
    if (s < 0) p.set(ex, EYE_Y + 3, skin[0]);
  }
  // painted hair: how far down the paint comes at each column
  const rel = (x: number) => (x - cxh) * L; // + toward where he looks
  const hairRows = (x: number): number => {
    switch (t.hair) {
      case "bowl":
        return 6;
      case "side part":
        return rel(x) < -3 ? 6 : rel(x) < 2 ? 5 : 4;
      case "flat top":
        return 4;
      case "buzz":
        return 3;
      case "quiff":
        return rel(x) > 1 ? 4 : 5;
      case "mohawk":
        return Math.abs(x - cxh) < 2 ? 5 : 0;
      case "curls":
      case "perm":
        return 5 + (x & 1);
      case "slick":
        return rel(x) < -1 ? 6 : 4;
      case "mullet":
        return rel(x) < 0 ? 5 : 4;
      case "long":
        return 5;
      case "receding":
        return Math.abs(x - cxh) < 4 ? 1 : 4;
      default:
        return 0;
    }
  };
  const hatted = t.hair === "cap" || t.hair === "beanie" || t.hair === "bucket";
  if (!hatted && t.hair !== "bald") {
    const b = new Blob();
    for (const i of head.pts) {
      const x = i % IW;
      const y = Math.floor(i / IW);
      const n = hairRows(x);
      if (n && y - top < n) b.add(x, y);
      // sideburns and side hair for the fuller cuts
      if (["bowl", "curls", "perm", "long", "mullet", "side part"].includes(t.hair) && y - top < 9 && y - top >= 3 && (x - (CX - hw(y)) < 2 || CX + hw(y) - 1 - x < 2)) b.add(x, y);
    }
    if (t.hair === "mohawk") b.rect(CX - 1, top - 3, CX, top - 1);
    if (t.hair === "flat top") b.rect(CX - hw(top + 2), top - 2, CX + hw(top + 2) - 1, top - 1);
    if (t.hair === "quiff") {
      const q = new Blob().rect(CX - 1, top - 2, CX + 3, top - 1).add(CX + 4, top - 1).add(CX + 2, top - 3).add(CX + 3, top - 3);
      for (const i of (L > 0 ? q : q.mirror()).pts) b.add(i % IW, Math.floor(i / IW));
    }
    if (t.hair === "curls") for (let x = CX - hw(top + 1) + 1; x < CX + hw(top + 1) - 1; x += 2) b.add(x, top - 1);
    paint(p, b, hairR, { top: true });
    if (t.hair === "buzz") for (const i of b.pts) if ((i % IW) % 2 === Math.floor(i / IW) % 2 && Math.floor(i / IW) - top === 2) p.set(i % IW, Math.floor(i / IW), skin[1]);
    if (t.hair === "side part") {
      const px = Math.round(cxh - L * 3);
      for (let y = top; y < top + 3; y++) if (inHead(px, y)) p.set(px, y, hairR[0]);
    }
    if (t.hair === "slick") for (const i of b.pts) if ((i % IW) - Math.floor(i / IW) * L * 1 === 0 || (i % IW) + Math.floor(i / IW) * 0 === -99) p.set(i % IW, Math.floor(i / IW), hairR[2]);
    if (t.hair === "curls") for (const i of b.pts) if (((i % IW) * 3 + Math.floor(i / IW) * 2) % 7 === 0 && b.has((i % IW) + 1, Math.floor(i / IW))) p.set(i % IW, Math.floor(i / IW), hairR[2]);
  }
  if (t.hair === "headband") {
    const b = new Blob();
    for (let y = top; y < top + 4; y++) for (let x = CX - hw(y); x < CX + hw(y); x++) b.add(x, y);
    paint(p, b, hairR, { top: true });
    const band = new Blob();
    for (let y = top + 4; y <= top + 5; y++) for (let x = CX - hw(y); x < CX + hw(y); x++) band.add(x, y);
    paint(p, band, kB);
  }
  // hats
  if (t.hair === "cap") {
    const capR = keeper ? KIT_RAMPS.ink : kA;
    const c = new Blob();
    for (let y = top - 1; y < top + 5; y++) {
      const w = y < top ? hw(top) - 1 : hw(y);
      for (let x = CX - w; x < CX + w; x++) c.add(x, y);
    }
    paint(p, c, capR, { top: true });
    p.set(CX - 1, top - 1, kB[1]);
    p.set(CX, top - 1, kB[0]);
    // the peak, turned to the side he looks at
    const peak = new Blob().rect(CX + 1, top + 4, CX + 11, top + 5);
    paint(p, L > 0 ? peak : peak.mirror(), kB, { under: true });
  }
  if (t.hair === "beanie") {
    const c = new Blob();
    for (let y = top - 1; y < top + 7; y++) {
      const w = y < top ? hw(top) - 1 : hw(y);
      for (let x = CX - w; x < CX + w; x++) c.add(x, y);
    }
    paint(p, c, kA, { top: true });
    for (let y = top + 4; y <= top + 6; y++) for (let x = CX - hw(y); x < CX + hw(y); x++) p.set(x, y, x % 2 ? kB[0] : kB[1]);
    paint(p, new Blob().rect(CX - 1, top - 3, CX, top - 2), kB, { top: true });
  }
  if (t.hair === "bucket") {
    const c = new Blob();
    for (let y = top - 1; y < top + 5; y++) {
      const w = y < top ? hw(top) : hw(y);
      for (let x = CX - w; x < CX + w; x++) c.add(x, y);
    }
    paint(p, c, kB, { top: true });
    const brim = new Blob().rect(CX - wmax - 2, top + 5, CX + wmax + 1, top + 5).rect(CX - wmax - 1, top + 6, CX + wmax, top + 6);
    paint(p, brim, kB, { under: true });
    for (let x = CX - hw(top + 4); x < CX + hw(top + 4); x++) p.set(x, top + 4, kA[1]);
  }
  // the lacquer gleam, high on the left of whatever is there
  {
    const gx = CX - Math.round(wmax * 0.55);
    const gy = top + 2 + (t.hair === "cap" || t.hair === "bucket" ? 0 : 0);
    const under = p.get(gx, gy);
    const gleam = (c: string | null) => {
      for (const r of [skin, hairR, kA, kB]) if (c && r.slice(0, 3).includes(c)) return r[3] || r[2];
      return null;
    };
    const g = gleam(under);
    if (g && inHead(gx, gy)) {
      p.set(gx, gy, g);
      if (inHead(gx + 1, gy - 1) && p.get(gx + 1, gy - 1) && gleam(p.get(gx + 1, gy - 1))) p.set(gx + 1, gy - 1, gleam(p.get(gx + 1, gy - 1))!);
    }
  }

  // ---------------------------------------------------------------- the face: the side-eye
  const fx = CX + (L > 0 ? 1 : -1); // the face turns a pixel toward where he looks
  const eyes = [fx - 6, fx + 1];
  const EW = 5;
  const lid = t.eyes === "half-lidded";
  const narrow = t.eyes === "narrowed";
  for (const ex of eyes) {
    // the white
    for (let j = 1; j <= 3; j++) for (let i = 0; i < EW; i++) p.set(ex + i, EYE_Y + j, EYE.white);
    // the shade under the lid
    for (let i = 0; i < EW; i++) p.set(ex + i, EYE_Y + 1, EYE.shade);
    // the pupil, pressed hard into the corner he looks to
    const px = L > 0 ? ex + EW - 2 : ex;
    for (let j = 1; j <= 3; j++) {
      p.set(px, EYE_Y + j, EYE.pupil);
      p.set(px + 1, EYE_Y + j, EYE.pupil);
    }
    // the lid line
    for (let i = 0; i < EW; i++) p.set(ex + i, EYE_Y, INK);
    if (lid) {
      // the heavy lid: a painted skin lid over the top half, its ink edge low
      for (let i = 0; i < EW; i++) {
        p.set(ex + i, EYE_Y, skin[0]);
        p.set(ex + i, EYE_Y + 1, INK);
      }
    }
    if (narrow) {
      for (let i = 0; i < EW; i++) {
        p.set(ex + i, EYE_Y, skin[1]);
        p.set(ex + i, EYE_Y + 1, INK);
        p.set(ex + i, EYE_Y + 3, skin[0]);
      }
    }
    if (!lid && !narrow) p.set(L > 0 ? px + 1 : px, EYE_Y + 1, EYE.white);
  }
  // brows
  const brow = gold ? GOLD[0] : glow ? GLOW[0] : t.hair === "bald" || t.hair === "receding" || t.hairCol === "white" || t.hairCol === "grey" ? skin[0] : hairR[0];
  for (const [k, ex] of eyes.entries()) {
    const far = (L > 0 && k === 1) || (L < 0 && k === 0); // the brow on his look side
    for (let i = 0; i < EW; i++) {
      let y = EYE_Y - 2;
      if (t.eyes === "one brow up" && far) y = EYE_Y - 3 - (i >= 1 && i <= 3 ? 1 : 0);
      if (t.eyes === "one brow up" && !far) y = EYE_Y - 1;
      if (narrow || lid) y = EYE_Y - 1 - (k === 0 ? (i === EW - 1 ? -1 : 0) : i === 0 ? -1 : 0) - 0;
      if (t.eyes === "sweating") y = EYE_Y - 2 - (k === 0 ? (i === EW - 1 ? 1 : 0) : i === 0 ? 1 : 0);
      if (lid || narrow) {
        if (y >= EYE_Y) continue;
      }
      if (inHead(ex + i, y) && i < EW - (lid || narrow ? 1 : 0)) p.set(ex + i + (lid || narrow ? (k === 0 ? 0 : 1) : 0), y, brow);
    }
  }
  // the nose: a carved nub, its shadow away from the light
  const nx = fx + (L > 0 ? -1 : 0) - 0;
  p.set(nx, EYE_Y + 4, skin[2]);
  p.set(nx, EYE_Y + 5, skin[1]);
  p.set(nx + L, EYE_Y + 5, skin[0]);
  p.set(nx + (L > 0 ? 1 : -1), EYE_Y + 4, skin[1]);
  if (t.wear === "cracked nose") {
    p.set(nx, EYE_Y + 4, WOOD[1]);
    p.set(nx, EYE_Y + 5, WOOD[0]);
    p.set(nx + L, EYE_Y + 3, INK);
  }
  // the mouth
  const my = EYE_Y + 7;
  const mx = fx - 2;
  const ink = (x: number, y: number, c = INK) => p.set(x, y, c);
  const mouth = o.mouth || t.mouth;
  switch (mouth) {
    case "flat":
      for (let i = 0; i < 4; i++) ink(mx + i, my);
      break;
    case "smirk":
      for (let i = 0; i < 3; i++) ink(mx + i + (L > 0 ? 0 : 1), my);
      ink(L > 0 ? mx + 3 : mx, my - 1);
      break;
    case "small o":
      ink(mx + 1, my);
      ink(mx + 2, my);
      ink(mx + 1, my + 1, MOUTH);
      ink(mx + 2, my + 1, MOUTH);
      ink(mx, my + 1);
      ink(mx + 3, my + 1);
      ink(mx + 1, my + 2);
      ink(mx + 2, my + 2);
      break;
    case "open":
      for (let i = 0; i < 4; i++) ink(mx + i, my - 1);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) ink(mx + i, my + j, i === 0 || i === 3 ? INK : MOUTH);
      for (let i = 1; i < 3; i++) ink(mx + i, my + 1, BLUSH);
      for (let i = 0; i < 4; i++) ink(mx + i, my + 2);
      break;
    case "frown":
      for (let i = 1; i < 3; i++) ink(mx + i, my);
      ink(mx, my + 1);
      ink(mx + 3, my + 1);
      break;
    case "teeth":
      for (let i = 0; i < 5; i++) ink(mx - 1 + i, my - 1);
      for (let i = 0; i < 5; i++) ink(mx - 1 + i, my, i === 0 || i === 4 ? INK : EYE.white);
      for (let i = 0; i < 5; i++) ink(mx - 1 + i, my + 1);
      break;
    case "moustache":
      for (let i = -1; i < 5; i++) ink(mx + i, my - 1, i < 2 ? hairR[1] : hairR[0]);
      ink(mx - 1, my, hairR[0]);
      ink(mx + 4, my, hairR[0]);
      for (let i = 1; i < 3; i++) ink(mx + i, my + 1);
      break;
    case "whistle": {
      ink(mx + (L > 0 ? 0 : 2), my);
      ink(mx + (L > 0 ? 1 : 3), my);
      const wx = L > 0 ? mx + 2 : mx;
      p.set(wx, my, metal[2]);
      p.set(wx + 1, my, metal[1]);
      p.set(wx, my + 1, metal[1]);
      p.set(wx + 1, my + 1, metal[0]);
      break;
    }
  }
  // blush on the cheek away from the look
  if (!gold && !glow && (t.skin === "porcelain" || t.skin === "peach")) {
    const bx = L > 0 ? eyes[0] : eyes[1] + EW - 2;
    p.set(bx, EYE_Y + 5, BLUSH);
    p.set(bx + 1, EYE_Y + 5, BLUSH);
  }
  if (t.eyes === "sweating") {
    const sx = L > 0 ? CX - hw(EYE_Y) + 1 : CX + hw(EYE_Y) - 2;
    p.set(sx, EYE_Y - 3, SWEAT[2]);
    p.set(sx, EYE_Y - 2, SWEAT[1]);
    p.set(sx, EYE_Y - 1, SWEAT[1]);
    p.set(sx + 1, EYE_Y - 1, SWEAT[0]);
    p.set(sx, EYE_Y, SWEAT[0]);
  }

  // ---------------------------------------------------------------- wear
  if (t.wear === "chipped paint") {
    // bare wood where the paint came off: a shoulder, a cheek
    const sx = L > 0 ? CX - 5 : CX + 3;
    p.set(sx, T0 + 1, WOOD[2]);
    p.set(sx + 1, T0 + 1, WOOD[1]);
    p.set(sx + 1, T0 + 2, WOOD[0]);
    const hx = L > 0 ? CX + hw(top + 3) - 3 : CX - hw(top + 3) + 1;
    p.set(hx, top + 3, WOOD[1]);
    p.set(hx + 1, top + 3, WOOD[2]);
    p.set(hx, top + 4, WOOD[0]);
  }
  if (t.wear === "tape repair") {
    // a cross of tape on the head, on the side he does not look at
    const tx = L > 0 ? CX - hw(top + 3) + 1 : CX + hw(top + 3) - 5;
    const ty = top + 2;
    for (let i = 0; i < 4; i++) {
      p.set(tx + i, ty + i, TAPE[1]);
      p.set(tx + 3 - i, ty + i, i === 1 || i === 2 ? TAPE[2] : TAPE[0]);
    }
  }

  // the facepalm hand goes over his eyes, the forearm down to the raised shoulder
  if (pose === "facepalm") {
    const hb = new Blob().rect(fx - 1, EYE_Y - 1, fx + 5, EYE_Y + 3);
    for (const x of [fx - 1, fx + 1, fx + 3]) hb.add(x, EYE_Y - 2);
    const h = L > 0 ? hb : hb.mirror();
    paint(p, h, hand, { under: true, top: true });
    // an ink edge where the hand lies on his face, so a hand reads on a face of the same paint
    for (const i of h.pts) {
      const x = i % IW;
      const y = Math.floor(i / IW);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        if (!h.has(x + dx, y + dy) && inHead(x + dx, y + dy)) p.set(x + dx, y + dy, INK);
    }
    const arm = new Blob().limb(fx + 3, EYE_Y + 4, X(7), T0 - 2, 2);
    paint(p, L > 0 ? arm : arm.mirror(), keeper ? kA : skin);
  }

  // ---------------------------------------------------------------- the rod collars and the outline
  if (!sitting && pose !== "grip") {
    for (const s of [-1, 1]) {
      let edge = -1;
      for (let x = s < 0 ? 0 : IW - 1; s < 0 ? x < IW : x >= 0; x -= s) if (p.get(x, K6_ROD - 1)) {
        edge = x;
        break;
      }
      if (edge < 0) continue;
      const x = edge + s;
      for (let y = K6_ROD - 2; y <= K6_ROD + 1; y++) p.set(x, y, y === K6_ROD - 2 ? metal[2] : y === K6_ROD + 1 ? metal[0] : metal[1]);
    }
  }
  outline(p);
  // the set's poses are cut to the 32 px frame; the reactions keep the full width for their arms
  const w = pose === "idle" || pose === "kick" ? K6W : IW;
  const x0 = w === K6W ? OX : 0;
  const out = new Uint8ClampedArray(w * K6H * 4);
  for (let y = 0; y < K6H; y++)
    for (let x = 0; x < w; x++) {
      const c = p.get(x + x0, y);
      if (!c) continue;
      const [r, g, b] = hexRgb(c);
      out.set([r, g, b, 255], (y * w + x) * 4);
    }
  const s: K6Sprite = { w, h: K6H, px: out };
  return pose === "kick" ? shiftFoot(s, L) : s;
}

/** 1 px ink around everything: every empty pixel that touches a painted one (4-way) becomes ink. */
function outline(p: Pix) {
  const add: number[] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.get(x, y)) continue;
      if (p.get(x - 1, y) || p.get(x + 1, y) || p.get(x, y - 1) || p.get(x, y + 1)) add.push(y * p.w + x);
    }
  for (const i of add) p.c[i] = INK;
}

/** The kick frame: the boot swings a pixel out. */
function shiftFoot(s: K6Sprite, dir: number): K6Sprite {
  const px = new Uint8ClampedArray(s.px);
  for (let y = B0 - 1; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const from = x - dir;
      const o = (y * s.w + x) * 4;
      if (from < 0 || from >= s.w) {
        px[o + 3] = 0;
        continue;
      }
      px.set(s.px.subarray((y * s.w + from) * 4, (y * s.w + from) * 4 + 4), o);
    }
  return { ...s, px };
}

/** The kicker of a launch: its token address picks one of the set. */
export const kickerOfToken = (token: string) => hash32("kicker6-token|" + token.toLowerCase()) % K6_SIZE;

/** His traits in plain words, for the card. */
export function traitWords(t: Traits): [string, string][] {
  const out: [string, string][] = [];
  if (t.special === "gold leaf") out.push(["finish", "gold leaf"]);
  else if (t.special === "glow") out.push(["finish", "glows on the night table"]);
  else if (t.special === "keeper") out.push(["plays", "in goal, gloves on"]);
  else if (t.special === "ref") out.push(["plays", "referee"]);
  out.push(["eyes", `${t.eyes}, ${t.look > 0 ? "right" : "left"}`]);
  out.push(["head", `${t.head}, ${t.hair}${["cap", "beanie", "bucket", "bald"].includes(t.hair) ? "" : `, ${t.hairCol}`}`]);
  out.push(["mouth", t.mouth]);
  if (t.special !== "gold leaf" && t.special !== "glow") out.push(["kit", `${t.kitA} and ${t.kitB}, ${t.special === "ref" ? "plain" : t.shirt}, no. ${t.special === "keeper" ? 1 : t.num}`]);
  if (t.wear !== "none") out.push(["wear", t.wear]);
  return out;
}
