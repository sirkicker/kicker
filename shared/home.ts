// KICKER 5.2: the home page's pure parts, shared with the tests. The featured kicker of a day, a viber's handle and
// house line, the line-up of a rod (topped up with the house line-up so a rod is never empty), and the hero's tint
// taken from a viber's own colours. No DOM.
import { hash32, mulberry32 } from "./rng.js";
import { SET_SIZE, VIBERS, dayTeams, kickerOf, type Kit, type PublicMan } from "./side.js";

/** The rod is never shorter than this: the house line-up fills the rest. */
export const ROD_MIN = 7;

/** The kicker on the cover when there is no man of the day: one of the set, fixed for the day. */
export const featuredOfDay = (day: string) => (hash32("cover|" + day) % SET_SIZE) + 1;

/** A viber's handle from his file name: "agent-34" -> "agent 34", "bureau-roll-3-7" -> "roll 3.7". */
export function viberHandle(v: number): string {
  const n = VIBERS[v - 1] || VIBERS[0];
  const roll = n.match(/^bureau-roll-(\d+)(?:-(\d+))?$/);
  if (roll) return `roll ${roll[1]}${roll[2] ? "." + roll[2] : ""}`;
  return n.replace(/-/g, " ");
}

const LINES = [
  "left, right, left. that is the whole job",
  "bolted on. not going anywhere",
  "he has seen the ball. once",
  "flat is a position too",
  "steady hands. no wrists",
  "the rod knows where he stands",
  "range-bound and at peace",
  "a little to the left. no, back",
  "same spot as yesterday",
  "he does not turn for anybody",
  "sideways is still a direction",
  "nine to five, left to right",
];
/** What an unfielded viber says on his plate: dry, fixed per number. */
export const houseLine = (v: number) => LINES[hash32("line|" + v) % LINES.length];

export interface Fig {
  v: number;
  kit: Kit;
  name: string;
  line: string;
  /** The man's id when somebody fielded him; absent for the house line-up. */
  id?: string;
  house: boolean;
  /** 0 home, 1 away. */
  team: 0 | 1;
}

/**
 * A day's rod: the men fielded that day, home and away alternating as they came, topped up to `min` with the house
 * line-up of the day (real vibers in the day's two kits, none of them already on the rod). Fixed for the day.
 */
export function rodLineup(men: PublicMan[], day: string, min = ROD_MIN): Fig[] {
  const teams = dayTeams(day);
  const out: Fig[] = men.map((m) => {
    const k = kickerOf(m);
    const team = (m.n % 2) as 0 | 1;
    return { v: k.v, kit: k.kit, name: m.name, line: m.cap, id: m.id, house: false, team };
  });
  const used = new Set(out.map((f) => f.v));
  const r = mulberry32(hash32("house|" + day));
  let guard = 0;
  while (out.length < min && guard++ < 1000) {
    const v = 1 + Math.floor(r() * SET_SIZE);
    if (used.has(v)) continue;
    used.add(v);
    const team = (out.length % 2) as 0 | 1;
    out.push({ v, kit: teams[team], name: viberHandle(v), line: houseLine(v), house: true, team });
  }
  return out;
}

// ---------------------------------------------------------------- the hero's tint
type RGB = [number, number, number];
function hsl(r: number, g: number, b: number): RGB {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const hex = (c: RGB) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/**
 * The hero's flat background for a viber, from his own pixels (96x96 RGBA): the hue that carries the most colour on
 * him, pale and quiet, pulled toward the house cream so every tint sits with wine and teal. A grey viber gets warm
 * stone. Wine ink text stays above 7:1 on every result.
 */
export function tintOf(px: ArrayLike<number>): string {
  const bins = new Float64Array(24);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
    if (l < 0.18 || l > 0.92 || s < 0.18) continue;
    // weight by colourfulness, so a big pale face does not outvote a red hat
    bins[Math.floor(h * 24) % 24] += s * (1 - Math.abs(l - 0.5));
  }
  let best = -1;
  let w = 0;
  let total = 0;
  for (let i = 0; i < 24; i++) {
    total += bins[i];
    // a hue and its neighbours, so a gradient on one hat counts as one colour
    const v = bins[i] + 0.5 * (bins[(i + 23) % 24] + bins[(i + 1) % 24]);
    if (v > w) (w = v), (best = i);
  }
  const CREAM: RGB = [241, 228, 200];
  if (best < 0 || total < 25) return hex(CREAM.map((c, i) => c * 0.94 + [196, 182, 164][i] * 0.06) as RGB);
  const c = rgb((best + 0.5) / 24, 0.5, 0.7);
  return hex(c.map((v, i) => v * 0.5 + CREAM[i] * 0.5) as RGB);
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const L = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
