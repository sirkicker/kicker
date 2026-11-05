// KICKER 6.2 "Own line": the look around a kicker: his cover tint, the night table for the glow ones, and the house
// palette the page and the pictures share. The house is a walnut table world: dark oiled wood, billiard felt, brass
// and cream type. Tints are built in OKLCH: every one has the same deep lightness and a capped, clean chroma, leaned
// toward the walnut, so a red kit gives a deep claret wood and a green kit a dark bottle green, never a muddy sage.
// Cream type on any of them is AAA, brass is AA.
import { KIT_BASE, hexRgb, type Traits } from "./k6.js";

/** The house palette (page, band, wall, footer, cards, gestures, OG images). */
export const HOUSE = {
  /** the table: dark oiled walnut, the page ground */
  walnut: "#22170f",
  /** a raised board of the same wood */
  walnutHi: "#2f2117",
  /** the deepest wood: the footer */
  walnutDeep: "#170f0a",
  /** type on the wood */
  cream: "#f1e5cc",
  /** the one bright accent: polished brass */
  brass: "#c9a254",
  brassHi: "#e8cf8e",
  /** a dark accent on cream (the few light chips) */
  ink: "#1d1916",
  oxblood: "#8f2d2a",
  felt: "#1f4a41",
  feltDeep: "#163830",
} as const;

/** The night table: the glow-in-the-dark kickers stand on it. */
export const NIGHT = "#15232a";

// ---------------------------------------------------------------- OKLCH, small and exact enough for tints
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function rgbOf(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function fromOklch(L: number, C: number, H: number): string {
  // pull the chroma in until it fits sRGB
  let c = C;
  let rgb = rgbOf(L, c, H);
  while (c > 0 && rgb.some((v) => v < 0 || v > 1)) {
    c = Math.max(0, c - 0.002);
    rgb = rgbOf(L, c, H);
  }
  return "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(1, gam(Math.max(0, v)))) * 255).toString(16).padStart(2, "0")).join("");
}

/** The tints' one lightness (OKLCH L): deep enough for cream type, light enough that a dark-haired kicker reads. */
export const TINT_L = 0.355;
/** Plain warm wood for kits with no hue to speak of (ink, cream, stone, smoke). */
export const STONE = fromOklch(TINT_L, 0.034, 48);

/** A deep tint from any colour: its hue at one deep lightness and a capped chroma, then leaned a third of the way
 * toward the walnut, so every tint is the same table in another stain (no neon, no cold slate). */
export function tintFrom(hex: string): string {
  const [, C, H0] = toOklch(hex);
  if (C < 0.035) return STONE;
  // a yellow stained dark turns olive: pull ochres and brasses back toward amber wood
  const H = H0 > 68 && H0 < 118 ? 58 + (H0 - 68) * 0.25 : H0;
  // yellows and greens read louder at the same chroma: hold them back more
  const cap = H > 85 && H < 175 ? 0.052 : 0.068;
  const c = Math.min(cap, C * 0.5);
  const [, wc, wh] = toOklch(HOUSE.walnut);
  const k = 0.3;
  const a = c * Math.cos((H * Math.PI) / 180) * (1 - k) + wc * Math.cos((wh * Math.PI) / 180) * k;
  const b = c * Math.sin((H * Math.PI) / 180) * (1 - k) + wc * Math.sin((wh * Math.PI) / 180) * k;
  return fromOklch(TINT_L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360);
}

/** A kicker's cover tint: from his shirt, or his trim when the shirt has no hue to tint with. */
export function k6Tint(t: Traits): string {
  if (t.special === "glow") return NIGHT;
  if (t.special === "gold leaf") return fromOklch(TINT_L + 0.01, 0.05, 78);
  const a = KIT_BASE[t.kitA];
  const b = KIT_BASE[t.kitB];
  const flat = (h: string) => toOklch(h)[1] < 0.035;
  return tintFrom(flat(a) && !flat(b) ? b : a);
}
