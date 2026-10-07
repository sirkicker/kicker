import { buildDeck, farmReason, QUOTES, type Edition, type RawLaunch } from "../shared/data.js";
const ed = (await (await fetch("https://kickerhq.vercel.app/api/shuffle")).json()) as Edition;
const deck = buildDeck(ed, "DATA-CHK1");
// pull the raw index pages again and index by token
const raw = new Map<string, RawLaunch>();
let cursor: string | null = null;
for (let i = 0; i < 40 && raw.size < 2500; i++) {
  const r = await fetch(`https://testnet.vibevibe.fun/api/v1/chains/46630/v6/launches?limit=50${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
  const j: any = await r.json();
  for (const it of j.data.items) raw.set(it.tokenAddress.toLowerCase(), it);
  cursor = j.data.page.hasMore ? j.data.page.nextCursor : null;
  if (!cursor) break;
}
const pool = ed.pool.flat();
let farm = 0, missing = 0;
for (const c of pool) {
  const r = raw.get(c.t);
  if (!r) { missing++; continue; }
  if (farmReason(r)) farm++;
}
console.info("pool", pool.length, "found in live index", pool.length - missing, "farm-flagged now:", farm);
console.info("farm template descriptions in pool:", pool.filter((c) => /testnet farm|astronomy art|calm charts|native launch test/i.test(raw.get(c.t)?.content?.description || "")).length);
const pick = [deck[12], deck[20], deck[45]];
for (const c of pick) {
  const r: any = raw.get(c.l.t);
  const q = QUOTES[(r.pairCurrencyAddress || "").toLowerCase()];
  const t = BigInt(r.targetPairUnits); const res = BigInt(r.curve.pairReserveUnits);
  const pNow = r.graduated ? 10000 : Number((res * 10000n) / t);
  console.info(`card ${c.rank}/${c.suit} $${c.l.s} | api: symbol=${r.symbol} pair=${r.pairSymbol ?? q?.[0]} suit=${q?.[1]} graduated=${r.graduated} curve now ${(pNow / 100).toFixed(1)}% vs card ${(c.l.p / 100).toFixed(1)}% | holders now ${r.market.holderCount} vs ${c.l.h} | image ${r.content.image.uri.slice(7, 20)} vs ${c.l.c?.slice(0, 13)}`);
}
