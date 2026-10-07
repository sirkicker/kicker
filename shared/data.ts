// Launch data: how a vibe/vibe launch becomes a playing card.
import { shuffle, stream } from "./rng.js";

export type Suit = 0 | 1 | 2 | 3;
export const SUITS: { key: string; name: string; short: string; pairs: string }[] = [
  { key: "eth", name: "Ether", short: "ETH", pairs: "launches quoted in ETH" },
  { key: "stock", name: "Stocks", short: "STK", pairs: "launches quoted in a tokenized stock (NVDA, AAPL, SPCX, ...)" },
  { key: "vibe", name: "Vibe", short: "VBV", pairs: "launches quoted in VIBEVIBE" },
  { key: "private", name: "Private", short: "PRV", pairs: "launches quoted in a pre-IPO token or a dollar (OPENAI, ANTHROPIC, USDG)" },
];

/** Quote asset contract -> [ticker, suit]. */
export const QUOTES: Keyed<string, [string, Suit]> = {
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

/** One launch as stored in a deck snapshot. Short keys keep the snapshot small. */
export interface PoolCard {
  t: string; // token address (lowercase)
  s: string; // ticker
  n: string; // name
  c: string | null; // image CID
  q: string; // quote ticker
  u: Suit;
  p: number; // curve progress, basis points of the graduation target (10000 = graduated)
  x: number | null; // latest price change in bps (24h, else 6h, else 1h)
  k: number; // trades in the last 24h
  h: number; // holders
  a: number; // created, unix seconds
  g: boolean; // graduated
  d: boolean; // runs a gift (airdrop) list
}

export interface Edition {
  id: number; // hour number since the epoch
  at: string; // when the snapshot was taken
  block: string;
  scanned: number; // launches read from the index
  dropped: number; // filtered as farm bots / dead
  pool: PoolCard[][]; // per suit
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

/** Why a launch is left out of the deck, or null if it plays. */
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

export function toPoolCard(i: RawLaunch): PoolCard | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(i.tokenAddress || "")) return null;
  const quote = QUOTES[(i.pairCurrencyAddress || "").toLowerCase()] || (["OTHER", 3] as [string, Suit]);
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

// ---------------------------------------------------------------- cards
export type Enh = "grad" | "hot" | "pump" | "dip";
export const ENH: Keyed<Enh, { name: string; text: string; why: string }> = {
  grad: { name: "Graduated", text: "x1.5 Mult when scored", why: "the launch finished its bonding curve" },
  hot: { name: "Hot", text: "Scores twice", why: "40+ trades in the last 24h" },
  pump: { name: "Pump", text: "+4 Mult when scored", why: "price up 15%+ (latest window)" },
  dip: { name: "Dip", text: "+30 Chips when scored", why: "price down 15%+ (latest window)" },
};

export interface Card {
  id: number;
  l: PoolCard;
  rank: number; // 2..14 (14 = Ace)
  suit: Suit;
  q: string; // quote ticker used for Stock Flush
  enh: Enh | null;
  bridged?: boolean;
}

export function enhOf(l: PoolCard): Enh | null {
  if (l.g) return "grad";
  if (l.k >= 40) return "hot";
  if (l.x !== null && l.x >= 1500) return "pump";
  if (l.x !== null && l.x <= -1500) return "dip";
  return null;
}

export const RANK_LABEL = (r: number) => (r <= 10 ? String(r) : ["J", "Q", "K", "A"][r - 11]);
export const RANK_CHIPS = (r: number) => (r <= 10 ? r : r === 14 ? 11 : 10);

/** Launch strength used to rank a suit: curve progress, then 24h trades, then holders. */
function strength(a: PoolCard, b: PoolCard): number {
  return a.p - b.p || a.k - b.k || a.h - b.h || (a.t < b.t ? -1 : 1);
}

/**
 * The deck for (edition, seed): 13 launches per suit drawn from the snapshot, then ranked inside
 * the suit by curve progress. The launch closest to graduation is the Ace, the least advanced is the 2.
 */
export function buildDeck(ed: Edition, seed: string): Card[] {
  const out: Card[] = [];
  for (let u = 0 as Suit; u < 4; u = (u + 1) as Suit) {
    const pool = ed.pool[u] || [];
    const picked = shuffle(pool, stream(seed, "deck", ed.id, u)).slice(0, 13).sort(strength);
    const n = picked.length;
    picked.forEach((l, i) => {
      const rank = n >= 13 ? 2 + i : n <= 1 ? 14 : 2 + Math.round((i * 12) / (n - 1));
      out.push({ id: out.length, l, rank, suit: u, q: l.q, enh: enhOf(l) });
    });
  }
  return out;
}

export const tokenUrl = (t: string) => `https://testnet.vibevibe.fun/token/${t}`;
export const facePath = (cid: string | null, sym: string) =>
  `/api/facecard?c=${encodeURIComponent(cid || "")}&s=${encodeURIComponent(sym.slice(0, 6))}`;
