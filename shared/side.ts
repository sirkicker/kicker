// KICKER 5, "Sideways": the little men. One sprite recipe shared by the table (canvas), the editor and the server
// renders (SVG), so a man looks the same everywhere. Pure data and arithmetic, no DOM.
import { hash32, mulberry32 } from "./rng.js";
import { KIT_PATTERNS, type Kit, type KitPattern } from "./kicker.js";
import { SET_SIZE, VIBERS } from "./vibers.js";
export { SET_SIZE, VIBERS, KIT_PATTERNS, type Kit, type KitPattern };

export const TOKEN = "0x7e1be1573fD7Fe434a53Abb38356AcfFDF15c1C4";
export const TOKEN_URL = `https://testnet.vibevibe.fun/token/${TOKEN}`;
export const SOURCE = "https://github.com/sirkicker/kicker";
export const X_URL = "https://x.com/kicker_art";
export const SITE = "https://kickerhq.vercel.app";

export const NAME_MAX = 16;
export const CAP_MAX = 60;
export const GRID = 16;
/** The sprite with its outline, in sprite pixels. */
export const SW = 22;
export const SH = 42;
/** Where the rod passes through him (sprite y, outline included): his shoulders. */
export const ROD_Y = 16;

/** The house palette: muted, warm, and kind to every combination on the felt. */
export const PALETTE = [
  "#f1e4c8", // cream
  "#d6b25e", // brass
  "#a2733a", // ochre
  "#6e2140", // wine
  "#a3344d", // claret
  "#cf5b3e", // vermilion
  "#e3a27a", // peach
  "#2f6f62", // felt green
  "#1e4a53", // deep teal
  "#8db5a3", // sage
  "#3e5d8c", // slate
  "#a3bad6", // powder
  "#221419", // ink
  "#5c4a50", // smoke
  "#b9ada0", // stone
  "#e2c3cf", // rose
];
export const SKINS = ["#f3d5bb", "#e4b48e", "#c98f66", "#a36b46", "#7b4b30", "#4f3021"];
export const HAIRS = ["#1d1317", "#4a2d21", "#7c4728", "#b8642f", "#dcb862", "#a89d95", "#6e2140", "#efe3c8"];
export const HEADS = ["crop", "part", "curls", "long", "bald", "cap", "beanie", "bucket"] as const;
export const PATTERNS = ["hoops", "stripes", "halves", "sash", "chevron", "quarters", "pin", "plain"] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Team kits of the day: [shorts, socks] for the upper rod and for the lower rod. */
const KITS: [string, string][][] = [
  [["#f1e4c8", "#6e2140"], ["#221419", "#d6b25e"]],
  [["#d6b25e", "#221419"], ["#6e2140", "#f1e4c8"]],
  [["#f1e4c8", "#3e5d8c"], ["#a3344d", "#f1e4c8"]],
  [["#221419", "#8db5a3"], ["#e3a27a", "#221419"]],
  [["#a3bad6", "#221419"], ["#6e2140", "#d6b25e"]],
  [["#f1e4c8", "#2f6f62"], ["#221419", "#cf5b3e"]],
  [["#b9ada0", "#6e2140"], ["#1e4a53", "#f1e4c8"]],
];
export const dayKits = (day: string) => KITS[hash32("kits|" + day) % KITS.length];

// ---------------------------------------------------------------- 5.1: kickers
/** The two team kits of a day (home on the upper rod, away on the lower), from the house palette. */
const TEAMS: [Kit, Kit][] = [
  [{ a: "#6e2140", b: "#f1e4c8", p: "hoops" }, { a: "#f1e4c8", b: "#1e4a53", p: "plain" }],
  [{ a: "#d6b25e", b: "#221419", p: "stripes" }, { a: "#3e5d8c", b: "#f1e4c8", p: "sash" }],
  [{ a: "#f1e4c8", b: "#6e2140", p: "sash" }, { a: "#221419", b: "#d6b25e", p: "pin" }],
  [{ a: "#a3344d", b: "#f1e4c8", p: "halves" }, { a: "#8db5a3", b: "#221419", p: "hoops" }],
  [{ a: "#1e4a53", b: "#e3a27a", p: "band" }, { a: "#f1e4c8", b: "#a3344d", p: "stripes" }],
  [{ a: "#221419", b: "#f1e4c8", p: "pin" }, { a: "#cf5b3e", b: "#221419", p: "plain" }],
  [{ a: "#3e5d8c", b: "#d6b25e", p: "quarters" }, { a: "#e2c3cf", b: "#6e2140", p: "hoops" }],
];
export const dayTeams = (day: string): [Kit, Kit] => TEAMS[hash32("kits|" + day) % TEAMS.length];
/** The kit a viber wears on his plate in the set, until somebody fields him in theirs. */
export function houseKit(v: number): Kit {
  const t = TEAMS[hash32("set|" + v) % TEAMS.length];
  return t[v % 2];
}
/** Which viber a man is, and in what kit. 5.0 men are given a viber by their id and a kit from their shirt. */
export function kickerOf(m: { id: string; n: number; day: string; v?: number; kit?: Kit; shirt?: string; pal?: string[] }): { v: number; kit: Kit } {
  const v = m.v && m.v >= 1 && m.v <= SET_SIZE ? m.v : (hash32("viber|" + m.id) % SET_SIZE) + 1;
  if (m.kit && isHex(m.kit.a) && isHex(m.kit.b) && (KIT_PATTERNS as readonly string[]).includes(m.kit.p)) return { v, kit: m.kit };
  if (m.shirt && /^[0-9a-f]{256}$/.test(m.shirt)) {
    const pal = m.pal && m.pal.length === 16 ? m.pal : PALETTE;
    const n = new Map<string, number>();
    for (const c of m.shirt) n.set(c, (n.get(c) || 0) + 1);
    const top = [...n.entries()].sort((a, b) => b[1] - a[1]);
    const a = pal[parseInt(top[0][0], 16)];
    const b = top[1] ? pal[parseInt(top[1][0], 16)] : shade(a, -0.3);
    return { v, kit: { a, b, p: top[1] && top[1][1] > 40 ? "hoops" : "plain" } };
  }
  return { v, kit: dayTeams(m.day)[teamOf(m)] };
}
export const viberName = (v: number) => VIBERS[v - 1] || VIBERS[0];
export const setNo = (v: number) => "No. " + String(v).padStart(3, "0");
/** The album's sections: the viber families, in set order. */
export const FAMILIES = [
  { key: "agents", name: "the agents", test: (s: string) => s.startsWith("agent") },
  { key: "bureau", name: "the bureau", test: (s: string) => s.startsWith("bureau-") && !s.startsWith("bureau-roll") },
  { key: "roll", name: "the roll", test: (s: string) => s.startsWith("bureau-roll") },
  { key: "vibers", name: "the vibers", test: (s: string) => s.startsWith("viber") },
] as const;
export function familyOf(v: number): { key: string; name: string; from: number; to: number } {
  const n = viberName(v);
  const f = FAMILIES.find((x) => x.test(n)) || FAMILIES[0];
  let from = 0;
  let to = 0;
  VIBERS.forEach((x, i) => {
    if (f.test(x)) {
      if (!from) from = i + 1;
      to = i + 1;
    }
  });
  return { key: f.key, name: f.name, from, to };
}

export interface Badge {
  sym: string;
  /** 6x6 colours, row by row, as 36 six-digit hex values without '#'. */
  px: string;
}
export interface Man {
  id: string;
  n: number;
  day: string;
  t: number;
  name: string;
  cap: string;
  /** 5.1: which viber he is, 1..SET_SIZE (his number in the set). Absent on 5.0 men: see kickerOf. */
  v?: number;
  /** 5.1: his kit. Absent: his team's kit of the day. */
  kit?: Kit;
  /** 5.0 only: 256 palette indexes, one hex digit each, row by row. */
  shirt?: string;
  /** A launch's palette, 16 colours, already clamped. Absent: the house palette. */
  pal?: string[];
  head?: number;
  hair?: number;
  skin?: number;
  badge?: Badge;
  gold?: boolean;
  hidden?: boolean;
  /** The signed-in address, kept only to show the gold rod; never served. */
  addr?: string;
}
/** What the table and the pages get: no timestamps, addresses or flags beyond what is drawn. */
export type PublicMan = Omit<Man, "hidden" | "t" | "addr">;
export const publicMan = (m: Man): PublicMan => {
  const { hidden: _h, t: _t, addr: _a, ...rest } = m;
  return rest;
};

// ---------------------------------------------------------------- colour
export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/** Lighter (k > 0) or darker (k < 0), in lightness. */
export function shade(hex: string, k: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return rgbToHex(...hslToRgb(h, s, Math.max(0, Math.min(1, l + k))));
}
/** The palette clamp: no neon, no pure black or white. Any launch's colours sit on the felt. */
export function clampHex(hex: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return rgbToHex(...hslToRgb(h, Math.min(s, 0.62), Math.max(0.12, Math.min(0.9, l))));
}
const HEX_RE = /^#[0-9a-f]{6}$/;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s);

/** Sixteen colours from a launch's pixels (r,g,b triples): median cut, clamped, sorted dark to light. */
export function paletteFrom(rgb: ArrayLike<number>): string[] {
  type Px = [number, number, number];
  const px: Px[] = [];
  for (let i = 0; i + 2 < rgb.length; i += 3) px.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
  if (!px.length) return PALETTE.slice();
  let boxes: Px[][] = [px];
  while (boxes.length < 12) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.shift()!;
    if (box.length < 2) {
      boxes.push(box);
      break;
    }
    const rng = [0, 1, 2].map((c) => Math.max(...box.map((p) => p[c])) - Math.min(...box.map((p) => p[c])));
    const c = rng.indexOf(Math.max(...rng));
    box.sort((a, b) => a[c] - b[c]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  boxes = boxes.filter((b) => b.length);
  const base = boxes.map((b) => {
    const s = [0, 0, 0];
    for (const p of b) for (let c = 0; c < 3; c++) s[c] += p[c];
    return clampHex(rgbToHex(s[0] / b.length, s[1] / b.length, s[2] / b.length));
  });
  const out: string[] = [];
  const near = (a: string, b: string) => {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 36;
  };
  for (const c of base) if (!out.some((o) => near(o, c))) out.push(c);
  // fill to 16 with tints and shades of what the launch gave, then the house cream and ink to frame it
  for (let i = 0; out.length < 14 && i < base.length * 2; i++) {
    const c = shade(base[i % base.length], i < base.length ? 0.16 : -0.14);
    const cc = clampHex(c);
    if (!out.some((o) => near(o, cc))) out.push(cc);
  }
  while (out.length < 14) out.push(PALETTE[out.length]);
  out.push("#f1e4c8", "#221419");
  const lum = (h: string) => rgbToHsl(...hexToRgb(h))[2];
  return out.slice(0, 16).sort((a, b) => lum(a) - lum(b));
}

// ---------------------------------------------------------------- shirts
/** The two shoulder corners are not shirt: the grid shows them off. */
export const inShirt = (x: number, y: number) => !(y === 0 && (x === 0 || x === 15));
const IDX = "0123456789abcdef";

export function pattern(p: Pattern, a: number, b: number, c = b): string {
  let s = "";
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      let v = a;
      switch (p) {
        case "hoops":
          v = (y >> 1) % 2 ? b : a;
          break;
        case "stripes":
          v = (x >> 1) % 2 ? b : a;
          break;
        case "halves":
          v = x < 8 ? a : b;
          break;
        case "sash":
          v = Math.abs(x - y) <= 2 ? b : a;
          break;
        case "chevron":
          v = y >= 4 + Math.abs(x - 7.5) * 0.7 && y <= 7 + Math.abs(x - 7.5) * 0.7 ? b : a;
          break;
        case "quarters":
          v = (x < 8) === (y < 8) ? a : b;
          break;
        case "pin":
          v = x % 4 === 1 ? b : a;
          break;
        case "plain":
          v = y === 15 ? b : a;
          break;
      }
      // a collar in the third colour
      if (y === 0 && x >= 6 && x <= 9) v = c;
      s += IDX[v];
    }
  return s;
}

/** Pleasant pairs from the house palette, for the shirt a lazy man starts with. */
const PAIRS: [number, number, number][] = [
  [0, 3, 3],
  [3, 0, 0],
  [12, 1, 1],
  [8, 0, 1],
  [4, 0, 12],
  [9, 8, 0],
  [10, 0, 0],
  [1, 12, 12],
  [0, 10, 10],
  [7, 0, 1],
  [15, 3, 3],
  [5, 12, 0],
];
/** A good starting man, different for every seed. */
export function defaultMan(seed: string): { shirt: string; head: number; hair: number; skin: number; pat: Pattern; pair: number } {
  const r = mulberry32(hash32("lazy|" + seed));
  const pair = Math.floor(r() * PAIRS.length);
  const [a, b, c] = PAIRS[pair];
  const pat = PATTERNS[Math.floor(r() * (PATTERNS.length - 1))];
  return {
    shirt: pattern(pat, a, b, c),
    head: Math.floor(r() * HEADS.length),
    hair: Math.floor(r() * HAIRS.length),
    skin: Math.floor(r() * SKINS.length),
    pat,
    pair,
  };
}
export const pairColours = (i: number) => PAIRS[((i % PAIRS.length) + PAIRS.length) % PAIRS.length];

// ---------------------------------------------------------------- the sprite
export type Pose = "idle" | "up";
export interface Look {
  shirt: string;
  pal?: string[];
  head: number;
  hair: number;
  skin: number;
  badge?: Badge;
}
/**
 * The man as SW x SH colours ("" is clear). `sway` moves his legs a pixel or two sideways around the rod; `pose`
 * "up" is the hover pose (arms up, eyes up). `kit` is [shorts, socks] for his team.
 */
export function sprite(m: Look, kit: [string, string], pose: Pose = "idle", sway = 0): string[] {
  const W = SW - 2;
  const H = SH - 2;
  const g: string[] = new Array(W * H).fill("");
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c;
  };
  const pal = m.pal && m.pal.length === 16 && m.pal.every(isHex) ? m.pal : PALETTE;
  const skin = SKINS[m.skin] || SKINS[1];
  const skinD = shade(skin, -0.08);
  const hair = HAIRS[m.hair] || HAIRS[0];
  const hairL = shade(hair, 0.09);
  const hairD = shade(hair, -0.08);
  const shirtAt = (x: number, y: number) => pal[IDX.indexOf(m.shirt[y * GRID + x] || "0")] || pal[0];
  const ink = "#140b10";
  const sw = Math.max(-2, Math.min(2, Math.round(sway)));

  // legs and boots (they swing around the rod: the lower they are, the further)
  const lx = (y: number) => (y >= 34 ? sw : y >= 30 ? Math.sign(sw) * Math.min(1, Math.abs(sw)) : 0);
  for (let y = 34; y < 40; y++) {
    const d = lx(y);
    for (const x0 of [5, 11]) {
      for (let x = x0; x < x0 + 4; x++) {
        let c = y >= 38 ? ink : y >= 36 ? kit[1] : skin;
        if (y === 38 && x === x0 && x0 === 5) c = ink;
        if (y < 36 && x === x0 + 3) c = skinD;
        set(x + d, y, c);
      }
    }
    // boots stick out a pixel to the front-outside
    if (y >= 38) {
      set(4 + d, y, ink);
      set(15 + d, y, ink);
    }
  }
  // shorts
  for (let y = 30; y < 34; y++) {
    const d = lx(y);
    for (let x = 3; x < 17; x++) {
      if (y === 33 && x >= 9 && x <= 10) continue;
      let c = kit[0];
      if (x >= 15) c = shade(kit[0], -0.07);
      if (y === 30) c = shade(kit[0], -0.05);
      set(x + d, y, c);
    }
  }
  // torso: the shirt, lit from the upper left
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      if (!inShirt(x, y)) continue;
      let c = shirtAt(x, y);
      if (x === 0 || y === 0) c = shade(c, 0.05);
      if (x >= 14) c = shade(c, -0.06);
      if (y === 15) c = shade(c, -0.06);
      set(x + 2, y + 14, c);
    }
  // the badge on his chest
  if (m.badge && /^[0-9a-f]{216}$/.test(m.badge.px)) {
    for (let i = 0; i < 36; i++) set(11 + (i % 6), 17 + Math.floor(i / 6), "#" + m.badge.px.slice(i * 6, i * 6 + 6));
  }
  // arms
  const sleeveL = shirtAt(0, 2);
  const sleeveR = shirtAt(15, 2);
  if (pose === "up") {
    for (let y = 5; y < 15; y++) {
      const c = (sl: string) => (y < 8 ? skin : y < 10 ? skinD : sl);
      set(0, y, c(sleeveL));
      set(1, y, c(sleeveL));
      set(18, y, c(sleeveR));
      set(19, y, c(shade(sleeveR, -0.06)));
    }
  } else {
    for (let y = 14; y < 27; y++) {
      const c = (sl: string) => (y < 19 ? sl : y < 25 ? skin : skinD);
      set(0, y, c(sleeveL));
      set(1, y, c(sleeveL));
      set(18, y, c(sleeveR));
      set(19, y, c(shade(sleeveR, -0.06)));
    }
  }
  // neck and head
  for (let x = 8; x < 12; x++) set(x, 13, skinD);
  for (let y = 3; y < 13; y++)
    for (let x = 5; x < 15; x++) {
      if ((y === 3 || y === 12) && (x === 5 || x === 14)) continue;
      set(x, y, x >= 13 ? skinD : skin);
    }
  set(4, 7, skin);
  set(4, 8, skinD);
  set(15, 7, skinD);
  set(15, 8, skinD);
  // the face: deadpan
  const eyeY = pose === "up" ? 7 : 8;
  set(7, eyeY, ink);
  set(11, eyeY, ink);
  set(9, 10, shade(skin, -0.16));
  set(10, 10, shade(skin, -0.16));
  // hair or hat
  const H_ = HEADS[m.head] || "crop";
  const row = (y: number, x0: number, x1: number, c = hair) => {
    for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  switch (H_) {
    case "crop":
      row(2, 6, 13);
      row(3, 5, 14);
      row(4, 5, 14, hairD);
      set(5, 5, hair);
      set(14, 5, hairD);
      row(2, 7, 9, hairL);
      break;
    case "part":
      row(2, 6, 13);
      row(3, 5, 14);
      row(4, 5, 8);
      row(4, 11, 14, hairD);
      row(5, 5, 7);
      set(14, 5, hairD);
      set(9, 3, hairD);
      row(2, 10, 12, hairL);
      break;
    case "curls":
      for (const x of [6, 8, 10, 12]) set(x, 0, hair);
      row(1, 5, 14);
      row(2, 4, 15);
      row(3, 4, 15, hairD);
      row(4, 4, 6);
      row(4, 13, 15);
      for (let y = 5; y < 9; y++) {
        set(4, y, y % 2 ? hairD : hair);
        set(15, y, y % 2 ? hair : hairD);
      }
      for (const x of [5, 9, 13]) set(x, 1, hairL);
      break;
    case "long":
      row(2, 6, 13);
      row(3, 5, 14);
      row(4, 5, 14, hairD);
      for (let y = 4; y < 14; y++) {
        set(4, y, hair);
        set(5, y, y < 6 ? hair : "");
        set(15, y, hairD);
      }
      for (let y = 6; y < 13; y++) set(5, y, skin);
      row(2, 7, 9, hairL);
      break;
    case "bald":
      set(7, 4, shade(skin, 0.07));
      set(8, 4, shade(skin, 0.07));
      set(5, 6, hairD);
      set(14, 6, hairD);
      break;
    case "cap":
      row(1, 7, 12);
      row(2, 6, 13);
      row(3, 5, 14);
      row(4, 5, 14);
      row(5, 3, 14, hairD);
      row(2, 7, 9, hairL);
      set(9, 0, hairD);
      set(10, 0, hairD);
      break;
    case "beanie":
      set(9, 0, hairL);
      set(10, 0, hairL);
      row(1, 7, 12);
      row(2, 6, 13);
      row(3, 5, 14);
      row(4, 5, 14);
      row(5, 5, 14, hairL);
      for (const x of [6, 8, 10, 12]) set(x, 3, hairD);
      break;
    case "bucket":
      row(1, 7, 12);
      row(2, 6, 13);
      row(3, 6, 13);
      row(4, 6, 13, hairD);
      row(5, 3, 16, hairL);
      row(6, 5, 14, hairD);
      break;
  }
  // the outline: one pixel of ink around everything, so he reads on any felt
  const out: string[] = new Array(SW * SH).fill("");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[(y + 1) * SW + x + 1] = g[y * W + x];
  const res = out.slice();
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (out[y * SW + x]) continue;
      const n = (xx: number, yy: number) => xx >= 0 && xx < SW && yy >= 0 && yy < SH && !!out[yy * SW + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) res[y * SW + x] = "#120a0e";
    }
  return res;
}

// ---------------------------------------------------------------- days and the man of the day
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (day: string, n: number) => utcDay(new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000));
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const dayLong = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
};
export const dayShort = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
};
export const manNo = (n: number) => "no. " + String(n).padStart(4, "0");

/** The man of the day is drawn from a finished rod, so the pick never moves while people are still arriving. */
export function pickOfDay(day: string, ids: string[]): string | null {
  if (!ids.length) return null;
  return ids[hash32("man of the day|" + day) % ids.length];
}

/** His team, and so his rod: 0 the upper, 1 the lower. */
export const teamOf = (m: { n: number }) => (m.n % 2) as 0 | 1;
/** Which rod (0 upper, 1 lower) and which place a man takes on his day: holders first, on the gold. */
export interface Placed {
  man: PublicMan;
  rod: 0 | 1;
  slot: number;
}
export function placeDay(men: PublicMan[]): { rods: [Placed[], Placed[]]; gold: [number, number] } {
  const rods: [Placed[], Placed[]] = [[], []];
  men.forEach((m) => rods[teamOf(m)].push({ man: m, rod: teamOf(m), slot: 0 }));
  const gold: [number, number] = [0, 0];
  for (const r of [0, 1] as const) {
    rods[r].sort((a, b) => Number(!!b.man.gold) - Number(!!a.man.gold) || a.man.n - b.man.n);
    rods[r].forEach((p, i) => (p.slot = i));
    gold[r] = rods[r].filter((p) => p.man.gold).length;
  }
  return { rods, gold };
}
