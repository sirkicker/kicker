// Launch data: how a vibe/vibe launch becomes a figure on your rods.
import { shuffle, stream } from "./rng.js";

/** What a launch is paired with. Four kinds, shown as a small kit stripe on the figure. */
export type Pair = 0 | 1 | 2 | 3;
export const PAIRS: { key: string; name: string; short: string; pairs: string }[] = [
  { key: "eth", name: "Ether", short: "ETH", pairs: "launches quoted in ETH" },
  { key: "stock", name: "Stocks", short: "STK", pairs: "launches quoted in a tokenized stock (NVDA, AAPL, SPCX, ...)" },
  { key: "vibe", name: "Vibe", short: "VBV", pairs: "launches quoted in VIBEVIBE" },
  { key: "private", name: "Private", short: "PRV", pairs: "launches quoted in a pre-IPO token or a dollar (OPENAI, ANTHROPIC, USDG)" },
];

/** Quote asset contract -> [ticker, pair kind]. */
export const QUOTES: Keyed<string, [string, Pair]> = {
  "0x0000000000000000000000000000000000000000": ["ETH", 0],
  "0x3ab049897b0697bda766d8730fe1f955c9c103f0": ["NVDA", 1],
  "0x438820dcfe62a21e306614a4b54383cd8a36acf2": ["AAPL", 1],
  "0xba163e9887d54a854323b41fca9cf64a1c275ac9": ["SPCX", 1],
  "0x5a5398155d98374c0e26265ea3cb9818169c2739": ["SPCX", 1],
  "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e": ["TSLA", 1],
  "0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02": ["AMZN", 1],
  "0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0": ["PLTR", 1],
  "0x3b8262a63d25f0477c4dde23f83cfe22cb768c93": ["NFLX", 1],
  "0x71178bac73cbeb415514eb542a8995b82669778d": ["AMD", 1],
  "0xf1f6b050550531226ee0257fec4a1e575ff4c341": ["VIBEVIBE", 2],
  "0x1b14321750b38f7ed66a363d07a921a668521a5f": ["OPENAI", 3],
  "0x92dce70b18df47ac643af6377621d74abe3c868c": ["ANTHROPIC", 3],
  "0x102154e70d8485ff466bab229be90a763bf33264": ["USDG", 3],
};

/**
 * One launch as stored in a squad cut. Short keys keep the snapshot small, and they are the stored format:
 * cuts already in storage use exactly these fields.
 */
export interface Launch {
  t: string; // token address (lowercase)
  s: string; // ticker
  n: string; // name
  c: string | null; // image CID
  q: string; // quote ticker
  u: Pair;
  p: number; // curve progress, basis points of the curve target (10000 = full curve)
  x: number | null; // latest price change in bps (24h, else 6h, else 1h)
  k: number; // trades in the last 24h
  h: number; // holders
  a: number; // created, unix seconds
  g: boolean; // flown the whole curve
  d: boolean; // runs a gift (airdrop) list
}

/** A squad cut ("edition"): the launches of one cut, grouped by pair kind. */
export interface Edition {
  id: number; // hour number since the epoch
  at: string; // when the snapshot was taken
  block: string;
  scanned: number; // launches read from the index
  dropped: number; // filtered as farm bots / dead
  pool: Launch[][]; // per pair kind
  /** New in 2.1: launches with no trades in the last 24h that passed the farm filter, for the Haunted table's ghost clubs. */
  ghosts?: Launch[];
}

export const editionNow = (ms = Date.now()) => Math.floor(ms / 3_600_000);

// ---------------------------------------------------------------- farm-bot filter
const FARM_DESC = [
  /testnet farm/i,
  /^random astronomy art on robinhood/i,
  /^a testnet art coin inspired by calm charts/i,
  /^v6 native launch test/i,
  /\((ticker )?[A-Z0-9$]{2,10}\) (brings|-|–|is a) /,
];

export interface RawLaunch {
  tokenAddress: string;
  launcherAddress?: string;
  name?: string;
  symbol?: string;
  content?: { description?: string; image?: { uri?: string } };
  pairCurrencyAddress?: string;
  pairSymbol?: string | null;
  targetPairUnits?: string;
  graduated?: boolean;
  lifecycle?: string;
  gifts?: { count?: string };
  curve?: { tokensSoldGrossUnits?: string; pairReserveUnits?: string };
  createdAt?: string;
  createdBlock?: string;
  asOfBlock?: string;
  market?: {
    holderCount?: number;
    buyCount24h?: number;
    sellCount24h?: number;
    priceChange1hBps?: number | null;
    priceChange6hBps?: number | null;
    priceChange24hBps?: number | null;
  };
}

/** Why a launch is left out of the cut, or null if it plays. */
export function farmReason(i: RawLaunch): string | null {
  const d = (i.content?.description || "").trim();
  if (FARM_DESC.some((r) => r.test(d))) return "farm-template";
  const s = (i.symbol || "").trim();
  const n = (i.name || "").trim();
  if (/^\d+$/.test(s)) return "numeric-ticker";
  if (!d && /^[A-Z]{5}$/.test(s) && n.split(/\s+/).length >= 3) return "generated-name";
  if (!i.curve || BigInt(i.curve.tokensSoldGrossUnits || "0") === 0n) return "never-traded";
  if (!i.content?.image?.uri) return "no-image";
  return null;
}

const clean = (s: string | undefined, n: number) => (s || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, n);

export function toLaunch(i: RawLaunch): Launch | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(i.tokenAddress || "")) return null;
  const quote = QUOTES[(i.pairCurrencyAddress || "").toLowerCase()] || (["OTHER", 3] as [string, Pair]);
  const uri = i.content?.image?.uri || "";
  const m = uri.match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]{40,100})/);
  let p = 0;
  try {
    const target = BigInt(i.targetPairUnits || "0");
    const res = BigInt(i.curve?.pairReserveUnits || "0");
    p = target > 0n ? Number((res * 10000n) / target) : 0;
  } catch {
    p = 0;
  }
  // the index's own word for a launch that finished its curve
  const g = i.graduated === true || i.lifecycle === "GRADUATED";
  if (g) p = 10000;
  const mk = i.market || {};
  const x = mk.priceChange24hBps ?? mk.priceChange6hBps ?? mk.priceChange1hBps ?? null;
  return {
    t: i.tokenAddress.toLowerCase(),
    s: clean(i.symbol, 12) || "?",
    n: clean(i.name, 32) || "Unnamed",
    c: m ? m[1] : null,
    q: quote[0] === "OTHER" && i.pairSymbol ? clean(i.pairSymbol, 10).toUpperCase() : quote[0],
    u: quote[1],
    p: Math.max(0, Math.min(10000, p)),
    x: typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null,
    k: Number(mk.buyCount24h || 0) + Number(mk.sellCount24h || 0),
    h: Number(mk.holderCount || 0),
    a: Math.floor(Date.parse(i.createdAt || "") / 1000) || 0,
    g,
    d: Number(i.gifts?.count || 0) > 0,
  };
}

// ---------------------------------------------------------------- the squad
/** The three stats, each read off one number of the launch. The thresholds are the whole rule. */
export const STAT = {
  power: { name: "Power", from: "curve progress", at: 1000, text: "its shots go through one blocker" },
  pace: { name: "Pace", from: "24h trades", at: 10, text: "a free slide for its rod every possession" },
  grip: { name: "Grip", from: "holders", at: 6, text: "keeps the ball once a possession when its pass is blocked" },
} as const;
export type StatId = keyof typeof STAT;

/** Slots 0..10: keeper, two defenders, five midfielders, three attackers. */
export const SQUAD_SIZE = 11;

/**
 * Today's squad for (cut, seed): 11 launches drawn from the cut, then put where their numbers fit best:
 * the three furthest along their curve up front, the most-held in goal and at the back, the rest in midfield.
 * The player can move them around before any match.
 */
export function buildSquad(ed: Edition, seed: string): Launch[] {
  const all = ed.pool.flat();
  const picked = shuffle(all, stream(seed, "squad", ed.id)).slice(0, SQUAD_SIZE);
  while (picked.length < SQUAD_SIZE && all.length) picked.push(all[picked.length % all.length]);
  const byCurve = picked.slice().sort((a, b) => b.p - a.p || b.k - a.k || (a.t < b.t ? -1 : 1));
  const att = byCurve.slice(0, 3);
  const rest = byCurve.slice(3).sort((a, b) => b.h - a.h || b.k - a.k || (a.t < b.t ? -1 : 1));
  const gk = rest[0];
  const def = rest.slice(1, 3);
  const mid = rest.slice(3, 8).sort((a, b) => b.k - a.k || (a.t < b.t ? -1 : 1));
  return [gk, ...def, ...mid, ...att].filter(Boolean);
}

/** The other side of the table for one fixture: 11 launches from the cut that are not in your squad. */
export function rivalSquad(ed: Edition, seed: string, mine: Launch[], round: number, kind: number): Launch[] {
  const own = new Set(mine.map((l) => l.t));
  const all = ed.pool.flat().filter((l) => !own.has(l.t));
  const out = shuffle(all, stream(seed, "rivals", ed.id, round, kind)).slice(0, SQUAD_SIZE);
  while (out.length < SQUAD_SIZE && all.length) out.push(all[out.length % all.length]);
  return out;
}

/**
 * The deadest launches the cut knows: first the ones with no trades in 24h (the cut keeps them aside since 2.1),
 * then the quietest of the transfer list. Ordered by 24h trades, then holders, so the label is always honest.
 */
export function deadList(ed: Edition, mine: Launch[]): Launch[] {
  const own = new Set(mine.map((l) => l.t));
  const seen = new Set<string>();
  const out: Launch[] = [];
  const quiet = (a: Launch, b: Launch) => a.k - b.k || a.h - b.h || (a.t < b.t ? -1 : 1);
  for (const l of [...(ed.ghosts || []).slice().sort(quiet), ...ed.pool.flat().sort(quiet)]) {
    if (own.has(l.t) || seen.has(l.t)) continue;
    seen.add(l.t);
    out.push(l);
  }
  return out;
}

/** A Haunted table rival: 11 of the 22 deadest launches, drawn by the seed for each fixture. */
export function ghostSquad(ed: Edition, seed: string, mine: Launch[], round: number, kind: number): Launch[] {
  const dead = deadList(ed, mine).slice(0, 22);
  const out = shuffle(dead, stream(seed, "ghosts", ed.id, round, kind)).slice(0, SQUAD_SIZE);
  while (out.length < SQUAD_SIZE && dead.length) out.push(dead[out.length % dead.length]);
  return out;
}

/** Why a launch plays for a ghost club, in plain numbers. */
export const ghostWhy = (l: Launch) => (l.k === 0 ? "0 trades in 24h" : `${l.k} trade${l.k === 1 ? "" : "s"} in 24h, among the quietest in this cut`);

export const tokenUrl = (t: string) => `https://testnet.vibevibe.fun/token/${t}`;

/** The game's own launch on vibe/vibe. */
export const GAME_TOKEN = {
  symbol: "KICKER",
  address: "0x0e76e43c28E1094dD0912c33BFf34004E110c323",
  url: tokenUrl("0x0e76e43c28E1094dD0912c33BFf34004E110c323"),
};

/** Where the game's source lives. */
export const SOURCE_URL = "https://github.com/sirkicker/kicker";
export const facePath = (cid: string | null, sym: string) => `/api/face?c=${encodeURIComponent(cid || "")}&s=${encodeURIComponent(sym.slice(0, 6))}`;

// ---------------------------------------------------------------- temperament (3.0, cosmetic only)
/** A figure's temperament, read off its numbers. It changes how a figure idles and its one-word tag, never how it plays. */
export type TraitId = "whale" | "degen" | "fresh" | "dip" | "pump" | "flown" | "ghost";
export const TRAIT: Keyed<TraitId, { name: string; text: string }> = {
  whale: { name: "Whale", text: "held by 15 or more" },
  degen: { name: "Degen", text: "25 or more trades in 24h" },
  fresh: { name: "Fresh", text: "launched under 6 h before the cut" },
  dip: { name: "Dip", text: "price down 5% or more" },
  pump: { name: "Pump", text: "price up 15% or more" },
  flown: { name: "Flown", text: "flew the whole curve" },
  ghost: { name: "Ghost", text: "0 trades in 24h" },
};
/**
 * The traits a launch shows at a cut (unix seconds), strongest first. Pure and seedless: the same numbers always
 * give the same traits. "ghost" is listed for any 0-trade launch; the table shows it only on the Haunted table.
 */
export function traitsOf(l: Launch, editionAt: number): TraitId[] {
  const out: TraitId[] = [];
  if (l.g) out.push("flown");
  if (l.k === 0) out.push("ghost");
  if (l.h >= 15) out.push("whale");
  if (l.k >= 25) out.push("degen");
  if ((editionAt - l.a) / 3600 < 6) out.push("fresh");
  if (l.x !== null && l.x <= -500) out.push("dip");
  if (l.x !== null && l.x >= 1500) out.push("pump");
  return out;
}
