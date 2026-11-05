// KICKER 6 on the server: what a vibe/vibe launch looks like as its kicker (his number, its kit, its crest) and
// today's rod (the launches whose kicker somebody looked up today). KV only, under "k6:"; no Blob at all. Launch names are other people's words: they go through the same word filter as the 5.x table.
import { kv, kvMany } from "./_kv.js";
import { launchLook, wordProblem, type LaunchFetch } from "./_side.js";
import { kickerBalance } from "./_house.js";
import { traitsOf } from "../shared/k6.js";
import { k6Tint } from "../shared/k6look.js";
import { crestOf, launchKit, cardKicker } from "../shared/k6react.js";
import type { CardLook } from "./_k6card.js";
import { utcDay } from "../shared/side.js";

export interface Launch {
  token: string;
  /** Empty when the name did not pass the filter. */
  name: string;
  symbol: string;
  n: number;
  kit: { a: string; b: string };
  tint: string;
  crest?: string[];
}

/** Launch text is shown only if it passes the table's word filter. */
export function cleanName(name: string, symbol: string): { name: string; symbol: string } {
  const sym = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  const okName = name && !wordProblem(name) ? name.slice(0, 40) : "";
  const okSym = sym && !wordProblem(sym) ? sym : "";
  return { name: okName, symbol: okSym };
}

export async function launchOf(token: string, opts: { fetchLaunch?: LaunchFetch } = {}): Promise<Launch> {
  const l = await launchLook(token, opts);
  const { name, symbol } = cleanName(l.name, l.symbol);
  const kit = launchKit(l.pal);
  return { token, name, symbol, n: cardKicker(token), kit: { a: kit.a, b: kit.b }, tint: kit.tint, crest: crestOf(l.badge.px) };
}

/** What his card looks like: the launch's colours, or the kicker's own kit on his own tint. */
export function lookOf(n: number, launch: Launch | null, gold = false): CardLook {
  if (!launch) return { tint: k6Tint(traitsOf(n)), label: "$KICKER", gold };
  return { tint: launch.tint, kit: launch.kit, crest: launch.crest, label: launch.symbol ? `$${launch.symbol}` : "a vibe/vibe launch", name: launch.name, gold };
}

// ---------------------------------------------------------------- today's rod
const ROD = (day: string) => `k6:rod:${day}`;
export const ROD_KEEP = 60;
export const MADE_PER_IP = 40;
/** A launch's kicker was looked up: he stands on today's rod (once a day per launch; the newest first). */
export async function made(token: string, ip: string, now = Date.now(), opts: { fetchLaunch?: LaunchFetch } = {}): Promise<{ ok: boolean }> {
  const day = utcDay(new Date(now));
  const { createHash } = await import("node:crypto");
  const h = createHash("sha256").update(`kicker6|${day}|${ip}`).digest("hex").slice(0, 20);
  const rl = `k6:rl:${day}:${h}`;
  const [count] = (await kvMany([["INCR", rl], ["EXPIRE", rl, 2 * 86400]])) as [number, number];
  if (count > MADE_PER_IP) return { ok: false };
  // it has to be a real launch: launchOf throws if vibe/vibe does not know it
  await launchOf(token, opts);
  await kvMany([["ZADD", ROD(day), now, token], ["ZREMRANGEBYRANK", ROD(day), 0, -(ROD_KEEP + 1)], ["EXPIRE", ROD(day), 3 * 86400]]);
  return { ok: true };
}
export async function rodToday(now = Date.now(), opts: { fetchLaunch?: LaunchFetch } = {}): Promise<{ day: string; items: { token: string; name: string; symbol: string; n: number; kit: { a: string; b: string }; crest?: string[] }[] }> {
  const day = utcDay(new Date(now));
  const tokens = ((await kv<string[] | null>("ZREVRANGE", ROD(day), 0, 23)) || []).filter((t) => /^0x[0-9a-f]{40}$/.test(t));
  const items = [];
  for (const t of tokens) {
    try {
      const l = await launchOf(t, opts);
      items.push({ token: t, name: l.name, symbol: l.symbol, n: l.n, kit: l.kit, crest: l.crest });
    } catch {
      /* a launch that stopped answering leaves the rod */
    }
  }
  return { day, items };
}

// ---------------------------------------------------------------- $KICKER holders (cosmetic)
export async function isHolder(addr: string | null, opts: { balanceOf?: (a: string) => Promise<bigint> } = {}): Promise<boolean> {
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return false;
  const a = addr.toLowerCase();
  const key = `k6:h:${a}`;
  const c = await kv<string | null>("GET", key);
  if (c) return c === "1";
  let yes = false;
  try {
    yes = (await (opts.balanceOf || kickerBalance)(a)) > 0n;
  } catch {
    return false;
  }
  await kv("SET", key, yes ? "1" : "0", "EX", 600);
  return yes;
}
