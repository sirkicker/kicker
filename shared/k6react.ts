// KICKER 6.2 "Own line": the rules shared by the home page, the server and the tests. KICKER is a meme: one wooden
// football man bolted to a brass rod, who only moves sideways. Here: the kicker himself (one canonical character),
// the finished meme panels, the "put your launch on the rod" meme's captions, the lookup input, a launch's palette as
// a kit, and today's rod. No DOM, no Node.
import { K6_SIZE, kickerOfToken, type K6Pose, type Traits } from "./k6.js";
import { hash32 } from "./rng.js";
import { tintFrom } from "./k6look.js";

/** The kicker: the one canonical character of the meme (the hero, the panels, the avatar). */
export const KICKER_N = 426;

/** A finished meme panel: one hand-composed 1080 scene with a dry caption, one Save. */
export interface Meme {
  key: string;
  /** The top line, small; the punchline at the bottom, big. */
  top: string;
  bottom: string;
  pose: K6Pose;
  mouth?: Traits["mouth"] | "open";
  /** What the picture shows (alt text). */
  alt: string;
}
export const MEMES: Meme[] = [
  { key: "table-spins", top: "the whole table spins.", bottom: "he doesn't.", pose: "idle", alt: "a rod of table-football men flipped over mid-spin, and the kicker upright between them, giving the side-eye" },
  { key: "sideways", top: "which way is he going?", bottom: "sideways. always sideways.", pose: "idle", alt: "the kicker on his rod with arrows pointing both ways along it" },
  { key: "bolted", top: "can't leave the group chat.", bottom: "bolted through the chest.", pose: "grip", mouth: "teeth", alt: "the kicker gripping the rod that runs through his chest, a brass bolt either side" },
  { key: "no-spinning", top: "spin the rod?", bottom: "no spinning.", pose: "wag", mouth: "flat", alt: "the kicker wagging a finger while the man next to him hangs upside down" },
  { key: "own-goal", top: "rolled it into his own net.", bottom: "own goal. it happens.", pose: "facepalm", mouth: "frown", alt: "the kicker with a hand over his eyes, the ball in the net behind him" },
  { key: "held", top: "the whole plan:", bottom: "hold the rod.", pose: "grip", mouth: "flat", alt: "the kicker holding his rod with both hands, nothing else going on" },
  { key: "goal", top: "moved two inches to the left.", bottom: "GOAL.", pose: "goal", mouth: "open", alt: "the kicker with his arms up under ticker tape" },
  { key: "gg", top: "GG.", bottom: "same rod tomorrow.", pose: "shake", mouth: "smirk", alt: "two kickers shaking hands along the rod" },
];
export const memeOf = (key: string) => MEMES.find((m) => m.key === key) || null;
/** 6.0/6.1 reaction keys and the 6.2 gestures: their old links land on the matching meme, or the sideways one. */
export const RETIRED: Record<string, string> = { "wen-kickoff": "sideways", bench: "held", sideways: "sideways", "no-spinning": "no-spinning", "own-goal": "own-goal", held: "held", goal: "goal", gg: "gg" };

/** The launch meme's captions: "$SYM is on the rod." over the kicker in its colours, the meme line under him. */
export function launchCaption(symbol: string): { top: string; bottom: string } {
  return { top: symbol ? `$${symbol} is on the rod.` : "this launch is on the rod.", bottom: "sideways only. no spinning." };
}

/**
 * A vibe/vibe token from whatever was pasted: a testnet.vibevibe.fun/token/0x... link (with or without the scheme,
 * a query or a trailing slash) or a bare 0x address. Anything else is not a token. Lower-cased.
 */
export function parseTokenLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 300) return null;
  const bare = s.match(/^0x[0-9a-fA-F]{40}$/);
  if (bare) return bare[0].toLowerCase();
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:testnet\.)?vibevibe\.fun\/token\/(0x[0-9a-fA-F]{40})(?:[/?#].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

/** The "put your launch on the rod" box: a vibe/vibe token link, a bare 0x address, or a KICKER /l/ link. */
export function parseLookup(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const token = parseTokenLink(s);
  if (token) return token;
  const own = s.match(/^(?:https?:\/\/)?kickerhq\.vercel\.app\/l\/([0-9a-zA-Z]+)\/?(?:[?#].*)?$/i);
  return own ? parseTokenLink(own[1]) : null;
}

/** Which kicker stands in for a launch (its token picks one quietly), or the one asked for, or the kicker. */
export function cardKicker(token: string | null, n?: number): number {
  if (token) return kickerOfToken(token);
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < K6_SIZE ? (n as number) : KICKER_N;
}

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (h: string) => {
  const [r, g, b] = rgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const sat = (h: string) => {
  const c = rgb(h).map((v) => v / 255);
  const mx = Math.max(...c);
  const mn = Math.min(...c);
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1));
};

/** A launch's sixteen colours as a kit: the most colourful mid tone for the shirt, a clear contrast for the trim. */
export function launchKit(pal: string[]): { a: string; b: string; tint: string } {
  const ok = pal.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  if (!ok.length) return { a: "#6e2140", b: "#f1e4c8", tint: tintFrom("#6e2140") };
  const mids = ok.filter((c) => lum(c) > 0.16 && lum(c) < 0.82);
  const a = (mids.length ? mids : ok).slice().sort((x, y) => sat(y) * (1 - Math.abs(lum(y) - 0.5)) - sat(x) * (1 - Math.abs(lum(x) - 0.5)))[0];
  // the trim: the colour furthest in lightness from the shirt
  const b = ok.slice().sort((x, y) => Math.abs(lum(y) - lum(a)) - Math.abs(lum(x) - lum(a)))[0];
  return { a: a.toLowerCase(), b: b.toLowerCase(), tint: tintFrom(a) };
}

/** A 6x6 crest from the launch's badge string (36 hex colours without '#'), or undefined. */
export function crestOf(px: string | undefined): string[] | undefined {
  if (!px || !/^[0-9a-f]{216}$/i.test(px)) return undefined;
  return Array.from({ length: 36 }, (_, i) => "#" + px.slice(i * 6, i * 6 + 6).toLowerCase());
}

// ---------------------------------------------------------------- today's rod
export interface RodItem {
  n: number;
  kit?: { a: string; b: string };
  crest?: string[];
  token?: string;
  symbol?: string;
  house: boolean;
}
export const ROD_MIN = 7;
/** Today's rod: the launches put on it today first, newest first; then house kickers until there are at least `min`. */
export function rodLineup(items: { token: string; symbol: string; n: number; kit: { a: string; b: string }; crest?: string[] }[], day: string, min = ROD_MIN): RodItem[] {
  const out: RodItem[] = items.map((x) => ({ n: x.n, kit: x.kit, crest: x.crest, token: x.token, symbol: x.symbol, house: false }));
  const taken = new Set(out.map((x) => x.n));
  for (let i = 0; out.length < min && i < 200; i++) {
    const n = hash32(`k6-rod|${day}|${i}`) % K6_SIZE;
    if (taken.has(n)) continue;
    taken.add(n);
    out.push({ n, house: true });
  }
  return out;
}
