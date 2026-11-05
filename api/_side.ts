// KICKER 5 "Sideways" on the server: men, day rods, the man of the day, the word filter, the rate limit and the
// admin hide. Everything lives in KV under "side:". No Blob: images are drawn on request (api/_sidecard.ts).
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { kv, kvMany } from "./_kv.js";
import { kickerBalance } from "./_house.js";
import {
  CAP_MAX,
  DAY_RE,
  HAIRS,
  HEADS,
  NAME_MAX,
  SKINS,
  addDays,
  clampHex,
  dayKits,
  paletteFrom,
  pickOfDay,
  publicMan,
  KIT_PATTERNS,
  SET_SIZE,
  kickerOf,
  isHex,
  type Kit,
  utcDay,
  type Badge,
  type Man,
  type PublicMan,
} from "../shared/side.js";

export class SideError extends Error {
  constructor(
    msg: string,
    public status: number,
  ) {
    super(msg);
  }
}

export const PER_DAY_IP = 3;
/** The most men one rod shows in one answer; a busier day is paged by the client. */
export const ROD_PAGE = 120;
const K = {
  man: (id: string) => `side:m:${id}`,
  day: (d: string) => `side:d:${d}`,
  n: "side:n",
  first: "side:first",
  rl: (d: string, h: string) => `side:rl:${d}:${h}`,
  tok: (a: string) => `side:tok:${a}`,
  /** The album: viber number -> the first man who fielded him, as JSON {id, day, name}. */
  fv: "side:fv",
};

// ---------------------------------------------------------------- the word filter
const LEET: Keyed<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" };
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0134578@$!|]/g, (c) => LEET[c] || c);
/** Squashed: letters only, repeats collapsed ("n i i g" -> "nig"). */
const squash = (s: string) => norm(s).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
// distinctive enough to catch inside other letters, spaced out or doubled up
const ANYWHERE = ["nigger", "nigga", "niger", "faggot", "fagot", "retard", "trany", "tranny", "kike", "chink", "wetback", "beaner", "raghead", "towelhead", "porn", "pusy", "blowjob", "onlyfans", "hentai", "dildo", "cunt", "whore", "slut", "rapist", "pedo", "nazi", "hitler", "jizz", "boner", "cumshot", "orgasm", "masturb"];
// whole words only (after leet), so "class" or "scrap" pass
const WORDS = [
  // slurs and sexual words
  "fag", "fags", "spic", "spics", "coon", "dyke", "gook", "sex", "sexy", "cum", "dick", "dicks", "cock", "cocks", "tit", "tits", "titty", "boob", "boobs", "nude", "nudes", "nsfw", "xxx", "anal", "rape", "raped", "horny", "milf", "penis", "vagina", "fuck", "fucking", "fucker", "motherfucker", "bitch", "ass", "asshole", "nipple", "nipples", "thot", "hoe", "hoes", "kys",
  // promo
  "airdrop", "airdrops", "giveaway", "giveaways", "presale", "whitelist", "wl", "mint", "minting", "free", "claim", "earn", "earning", "reward", "rewards", "prize", "prizes", "bonus", "promo", "promocode", "discount", "buy", "buying", "sell", "pump", "pumping", "moon", "mooning", "gem", "gems", "alpha", "follow", "followers", "retweet", "rt", "dm", "dms", "telegram", "tg", "discord", "join", "link", "bio", "ca", "contract", "100x", "1000x", "10x", "ape", "shill", "wagmi", "lfg", "official", "partner", "partners", "sponsor", "sponsored", "guarantee", "guaranteed", "jackpot", "bet", "bets", "odds", "poker", "casino", "gamble", "gambling", "loot", "payout", "graduation", "subscribe", "whatsapp", "signal", "invest", "investment", "profit", "profits", "roi", "launchpad", "presales", "ico", "nft", "nfts",
];
const WORDSET = new Set(WORDS);
const LINK = /(https?:|www\.|\bt\.me\b|discord\.gg|\b[a-z0-9-]{2,}\s*(\.|dot)\s*(com|net|org|io|xyz|fun|gg|me|app|co|ru|sh|ly|so|ai|vip|club|site|top|finance|money|lol|wtf|link|dev|pro|cc|tv)\b)/i;
const HANDLE = /@[a-z0-9_]{1,}/i;
const ADDRESS = /0x[0-9a-f]{6,}/i;
const TICKER = /\$[a-z][a-z0-9]{1,}/i;

/** Why a name or a line can't go on the table, or null. */
export function wordProblem(s: string): string | null {
  if (!s) return null;
  if (LINK.test(s)) return "no links on the table";
  if (HANDLE.test(s)) return "no @handles on the table";
  if (ADDRESS.test(s) || TICKER.test(s)) return "no tickers or addresses on the table";
  const sq = squash(s);
  if (ANYWHERE.some((w) => sq.includes(w))) return "not on this table";
  const words = norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => WORDSET.has(w))) return "not on this table";
  // words split by spaces or dots ("f u c k", "b.u.y")
  const joined = norm(s).replace(/[^a-z0-9]+/g, " ").replace(/\b(\w) (?=\w\b)/g, "$1");
  if (joined.split(" ").some((w) => WORDSET.has(w) || ANYWHERE.includes(w))) return "not on this table";
  return null;
}

const CONTROL = new RegExp("[" + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]", "g");
const tidy = (s: unknown, max: number) =>
  typeof s === "string"
    ? s
        .replace(CONTROL, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
const NAME_OK = /^[\p{L}\p{N} .'_-]+$/u;

// ---------------------------------------------------------------- launches (colours and a badge)
export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export interface LaunchLook {
  token: string;
  name: string;
  symbol: string;
  pal: string[];
  badge: Badge;
}
export type LaunchFetch = (token: string) => Promise<{ name: string; symbol: string; image: Buffer | null } | null>;

/** Name, symbol and image of a vibe/vibe launch. Nothing else is read: no price, cap, volume or holders. */
const fetchLaunch: LaunchFetch = async (token) => {
  const headers = { "user-agent": BROWSER_UA, accept: "application/json" };
  const r = await fetch(`https://testnet.vibevibe.fun/api/v1/chains/46630/v6/launches/${token}`, { headers, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: { launch?: { name?: string; symbol?: string; content?: { image?: { uri?: string } } } } };
  const l = j.data?.launch;
  if (!l) return null;
  const cid = (l.content?.image?.uri || "").replace(/^ipfs:\/\//, "");
  let image: Buffer | null = null;
  if (/^[A-Za-z0-9]{40,100}$/.test(cid)) {
    try {
      const ir = await fetch(`https://testnet.vibevibe.fun/media/${cid}.thumb.webp`, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(6000) });
      if (ir.ok) {
        const b = Buffer.from(await ir.arrayBuffer());
        if (b.length && b.length < 2_000_000) image = b;
      }
    } catch {
      image = null;
    }
  }
  return { name: String(l.name || "").slice(0, 40), symbol: String(l.symbol || "").slice(0, 16), image };
};

export function tokenOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0].toLowerCase() : null;
}

export async function launchLook(token: string, opts: { fetchLaunch?: LaunchFetch } = {}): Promise<LaunchLook> {
  const cached = await kv<string | null>("GET", K.tok(token));
  if (cached) return JSON.parse(cached) as LaunchLook;
  let got: Awaited<ReturnType<LaunchFetch>> = null;
  try {
    got = await (opts.fetchLaunch || fetchLaunch)(token);
  } catch {
    got = null;
  }
  if (!got) throw new SideError("that launch did not answer. check the link", 404);
  let pal: string[];
  let px = "";
  if (got.image) {
    const raw = await sharp(got.image).resize(24, 24, { fit: "cover" }).removeAlpha().raw().toBuffer();
    pal = paletteFrom(raw);
    const small = await sharp(got.image).resize(6, 6, { fit: "cover", kernel: "cubic" }).removeAlpha().raw().toBuffer();
    for (let i = 0; i < 36; i++) px += clampHex("#" + [small[i * 3], small[i * 3 + 1], small[i * 3 + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")).slice(1);
  } else {
    pal = paletteFrom([]);
  }
  const symbol = got.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
  const look: LaunchLook = { token, name: tidy(got.name, 40), symbol, pal, badge: { sym: symbol, px } };
  await kv("SET", K.tok(token), JSON.stringify(look), "EX", 86400);
  return look;
}

// ---------------------------------------------------------------- making a man
export interface PutOpts {
  now?: number;
  ip?: string;
  balanceOf?: (a: string) => Promise<bigint>;
  fetchLaunch?: LaunchFetch;
}
export const ipHash = (ip: string, day: string) => createHash("sha256").update(`kicker side|${day}|${ip}`).digest("hex").slice(0, 20);

export async function putMan(input: Keyed<string, unknown>, opts: PutOpts = {}): Promise<{ man: PublicMan; today: string }> {
  const now = opts.now ?? Date.now();
  const day = utcDay(new Date(now));
  const name = tidy(input.name, NAME_MAX);
  const cap = tidy(input.cap, CAP_MAX);
  if (!name) throw new SideError("he needs a name", 400);
  if (!NAME_OK.test(name)) throw new SideError("letters, numbers, spaces and . ' _ - only in a name", 400);
  const bad = wordProblem(name) || wordProblem(cap);
  if (bad) throw new SideError(bad, 400);
  // 5.1: a viber and a kit. 5.0 pages still in someone's tab may send a painted shirt: that is kept as it was.
  const int = (v: unknown, n: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : -1);
  let v: number | undefined;
  let kit: Kit | undefined;
  let shirt: string | undefined;
  let head = -1;
  let hair = -1;
  let skin = -1;
  if (input.v !== undefined) {
    v = Number.isInteger(input.v) && (input.v as number) >= 1 && (input.v as number) <= SET_SIZE ? (input.v as number) : 0;
    if (!v) throw new SideError("that viber is not in the set", 400);
    if (input.kit !== undefined && input.kit !== null) {
      const k = input.kit as Keyed<string, unknown>;
      const a = typeof k.a === "string" ? k.a.toLowerCase() : "";
      const b = typeof k.b === "string" ? k.b.toLowerCase() : "";
      if (!isHex(a) || !isHex(b) || !(KIT_PATTERNS as readonly unknown[]).includes(k.p)) throw new SideError("that kit did not arrive whole", 400);
      kit = { a: clampHex(a), b: clampHex(b), p: k.p as Kit["p"] };
    }
  } else {
    shirt = typeof input.shirt === "string" && /^[0-9a-f]{256}$/.test(input.shirt) ? input.shirt : undefined;
    if (!shirt) throw new SideError("pick a viber first", 400);
    head = int(input.head, HEADS.length);
    hair = int(input.hair, HAIRS.length);
    skin = int(input.skin, SKINS.length);
    if (head < 0 || hair < 0 || skin < 0) throw new SideError("that head did not arrive whole", 400);
  }
  const token = input.token ? tokenOf(input.token) : null;
  if (input.token && !token) throw new SideError("that is not a vibe/vibe token link", 400);
  const addr = typeof input.addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(input.addr) ? input.addr.toLowerCase() : undefined;

  // the launch first: if it does not answer, nothing is counted against the visitor
  const look = token ? await launchLook(token, opts) : null;

  const rl = K.rl(day, ipHash(opts.ip || "unknown", day));
  const [count] = (await kvMany([["INCR", rl], ["EXPIRE", rl, 2 * 86400]])) as [number, number];
  if (count > PER_DAY_IP) throw new SideError(`three men a day from one place. the rod opens again at 00:00 utc`, 429);

  let gold = false;
  if (addr) {
    try {
      gold = (await (opts.balanceOf || kickerBalance)(addr)) > 0n;
    } catch {
      gold = false;
    }
  }
  const n = Number(await kv("INCR", K.n));
  const id = randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 8).toLowerCase();
  const man: Man = v ? { id, n, day, t: now, name, cap, v } : { id, n, day, t: now, name, cap, shirt, head, hair, skin };
  if (kit) man.kit = kit;
  if (look) {
    man.pal = look.pal;
    if (input.badge !== false && look.badge.px) man.badge = look.badge;
  }
  if (gold) man.gold = true;
  if (addr) man.addr = addr;
  await kvMany([
    ["SET", K.man(id), JSON.stringify(man)],
    ["RPUSH", K.day(day), id],
    ["SET", K.first, day, "NX"],
    ["HSETNX", K.fv, String(kickerOf(man).v), JSON.stringify({ id, day, name })],
  ]);
  return { man: publicMan(man), today: day };
}

/** Writes a man straight in, for the dev seed only (no filter, no limit). */
export async function seedMan(man: Man): Promise<void> {
  await kvMany([
    ["SET", K.man(man.id), JSON.stringify(man)],
    ["RPUSH", K.day(man.day), man.id],
    ["SET", K.first, man.day, "NX"],
    ["HSETNX", K.fv, String(kickerOf(man).v), JSON.stringify({ id: man.id, day: man.day, name: man.name })],
  ]);
  const n = Number((await kv<string | null>("GET", K.n)) || 0);
  if (man.n > n) await kv("SET", K.n, man.n);
}
export async function setFirst(day: string) {
  await kv("SET", K.first, day);
}

// ---------------------------------------------------------------- reading
export async function getMan(id: string): Promise<Man | null> {
  if (!/^[0-9a-z]{6,12}$/.test(id)) return null;
  const raw = await kv<string | null>("GET", K.man(id));
  if (!raw) return null;
  const m = JSON.parse(raw) as Man;
  return m.hidden ? null : m;
}

async function dayIds(days: string[]): Promise<string[][]> {
  const res = (await kvMany(days.map((d) => ["LRANGE", K.day(d), 0, ROD_PAGE * 4]))) as (string[] | null)[];
  return res.map((r) => r || []);
}
async function menOf(ids: string[]): Promise<Map<string, Man>> {
  const out = new Map<string, Man>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const raw = (await kv<(string | null)[]>("MGET", ...part)) || [];
    raw.forEach((r) => {
      if (!r) return;
      const m = JSON.parse(r) as Man;
      if (!m.hidden) out.set(m.id, m);
    });
  }
  return out;
}

export interface DayRod {
  day: string;
  kits: [string, string][];
  count: number;
  men: PublicMan[];
}
/** Up to `n` day rods ending at `to`, oldest first, never before the table's first day. */
export async function rods(to: string, n: number, now = Date.now()): Promise<{ today: string; first: string; days: DayRod[] }> {
  const today = utcDay(new Date(now));
  const first = (await kv<string | null>("GET", K.first)) || today;
  if (!DAY_RE.test(to) || to > today) to = today;
  n = Math.max(1, Math.min(14, Math.floor(n) || 6));
  const days: string[] = [];
  for (let d = to; days.length < n && d >= first; d = addDays(d, -1)) days.unshift(d);
  const ids = await dayIds(days);
  const all = await menOfIds(ids.flat());
  return {
    today,
    first,
    days: days.map((day, i) => {
      const list = ids[i].map((id) => all.get(id)).filter((m): m is Man => !!m);
      return { day, kits: dayKits(day), count: list.length, men: list.slice(0, ROD_PAGE).map(publicMan) };
    }),
  };
}
async function menOfIds(ids: string[]): Promise<Map<string, Man>> {
  return menOf(ids.map(K.man));
}

/** The man of the day: picked from the last finished rod with anybody on it (today's only if there is none yet). */
export async function manOfDay(day: string, now = Date.now()): Promise<{ day: string; from: string | null; man: PublicMan | null }> {
  const today = utcDay(new Date(now));
  if (!DAY_RE.test(day) || day > today) day = today;
  const first = (await kv<string | null>("GET", K.first)) || today;
  let from = addDays(day, -1);
  for (let i = 0; i < 14 && from >= first; i++, from = addDays(from, -1)) {
    const ids = (await dayIds([from]))[0];
    const men = await menOfIds(ids);
    const alive = ids.filter((id) => men.has(id));
    const pick = pickOfDay(day, alive);
    if (pick) return { day, from, man: publicMan(men.get(pick)!) };
  }
  // the table's first day: nobody has finished a rod yet
  const ids = (await dayIds([day]))[0];
  const men = await menOfIds(ids);
  const alive = ids.filter((id) => men.has(id));
  const pick = pickOfDay(day, alive);
  return { day, from: pick ? day : null, man: pick ? publicMan(men.get(pick)!) : null };
}

// ---------------------------------------------------------------- moderation
export async function hideMan(id: string, adminHeader: string | null): Promise<boolean> {
  const key = process.env.KICKER_ADMIN_KEY || "";
  const a = Buffer.from(adminHeader || "");
  const b = Buffer.from(key);
  const { timingSafeEqual } = await import("node:crypto");
  if (!key || a.length !== b.length || !timingSafeEqual(a, b)) throw new SideError("no", 403);
  const raw = /^[0-9a-z]{6,12}$/.test(id) ? await kv<string | null>("GET", K.man(id)) : null;
  if (!raw) throw new SideError("no such man", 404);
  const m = JSON.parse(raw) as Man;
  m.hidden = true;
  await kv("SET", K.man(id), JSON.stringify(m));
  // if he was the first to field his viber, the album slot opens again for the next one
  const v = String(kickerOf(m).v);
  const cur = await kv<string | null>("HGET", K.fv, v);
  if (cur && (JSON.parse(cur) as { id: string }).id === id) await kv("HDEL", K.fv, v);
  return true;
}

export const clientIp = (req: Request) =>
  (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim() || "unknown";

// ---------------------------------------------------------------- the album
export interface Fielded {
  id: string;
  day: string;
  name: string;
}
/** Which vibers of the set have been fielded, and by whom first. */
export async function album(): Promise<{ size: number; fielded: Record<string, Fielded> }> {
  const raw = (await kv<string[] | null>("HGETALL", K.fv)) || [];
  const fielded: Record<string, Fielded> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) {
    try {
      fielded[raw[i]] = JSON.parse(raw[i + 1]) as Fielded;
    } catch {
      /* a broken entry is skipped */
    }
  }
  return { size: SET_SIZE, fielded };
}
export async function fieldedBy(v: number): Promise<Fielded | null> {
  const raw = await kv<string | null>("HGET", K.fv, String(v));
  return raw ? (JSON.parse(raw) as Fielded) : null;
}
