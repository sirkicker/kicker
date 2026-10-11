// Cutting a deck snapshot ("edition") from the live vibe/vibe v6 index.
// The browser cannot read the index (foreign Origin gets 403), so this runs on the server,
// at most once per hour, and the result is frozen in Blob so every re-run of a seed sees the same cards.
import { editionNow, farmReason, toPoolCard, type Edition, type PoolCard, type RawLaunch } from "../shared/data.js";
import { load, save, Taken } from "./_store.js";

const INDEX = "https://testnet.vibevibe.fun/api/v1/chains/46630/v6/launches";
const PAGE = 50;
const MAX_PAGES = 26;
const PER_SUIT = 30;
const PER_CREATOR = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(cursor: string | null, deadline: number): Promise<{ items: RawLaunch[]; next: string | null } | null> {
  const url = `${INDEX}?limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const left = deadline - Date.now();
    if (left < 1500) return null;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(Math.min(9000, left)) });
      if (res.status === 429 || res.status >= 500) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { items?: RawLaunch[]; page?: { nextCursor?: string; hasMore?: boolean } } };
      const items = body?.data?.items;
      if (!Array.isArray(items)) return null;
      return { items, next: body.data?.page?.hasMore ? body.data.page.nextCursor || null : null };
    } catch {
      await sleep(500);
    }
  }
  return null;
}

/** Liveliness used to choose which launches make the cut for a suit. */
const lively = (c: PoolCard) => c.k * 2 + c.h + (c.g ? 40 : 0) + c.p / 500;

/** Cuts from the index until the deadline; a slow index gives a shallower cut, never a timeout. */
export async function cutEdition(id: number, deadline = Date.now() + 20000): Promise<Edition> {
  const suits: PoolCard[][] = [[], [], [], []];
  const perCreator = new Map<string, number>();
  let cursor: string | null = null;
  let scanned = 0;
  let dropped = 0;
  let block = "0";
  for (let i = 0; i < MAX_PAGES; i++) {
    const p = await page(cursor, deadline);
    if (!p) break;
    for (const raw of p.items) {
      scanned++;
      if (raw.asOfBlock && BigInt(raw.asOfBlock) > BigInt(block)) block = raw.asOfBlock;
      if (farmReason(raw)) {
        dropped++;
        continue;
      }
      const creator = (raw.launcherAddress || "").toLowerCase();
      const n = perCreator.get(creator) || 0;
      if (creator && n >= PER_CREATOR) {
        dropped++;
        continue;
      }
      const c = toPoolCard(raw);
      if (!c) {
        dropped++;
        continue;
      }
      perCreator.set(creator, n + 1);
      suits[c.u].push(c);
    }
    cursor = p.next;
    if (!cursor) break;
    // enough depth everywhere: stop early
    if (i >= 12 && suits.every((s) => s.length >= PER_SUIT * 1.5)) break;
  }
  // per suit: the 10 liveliest launches (at most 5 graduated), then the newest ones
  const pool = suits.map((list) => {
    const out: PoolCard[] = [];
    const seen = new Set<string>();
    let grads = 0;
    for (const c of list.slice().sort((a, b) => lively(b) - lively(a) || (a.t < b.t ? -1 : 1))) {
      if (out.length >= 10) break;
      if (c.g && grads >= 5) continue;
      if (c.g) grads++;
      out.push(c);
      seen.add(c.t);
    }
    for (const c of list) {
      if (out.length >= PER_SUIT) break;
      if (seen.has(c.t) || (c.g && grads >= 6)) continue;
      if (c.g) grads++;
      out.push(c);
      seen.add(c.t);
    }
    return out;
  });
  return { id, at: new Date().toISOString(), block, scanned, dropped, pool };
}

const key = (id: number) => `editions/${id}.json`;

export async function getEdition(id: number): Promise<Edition | null> {
  return load<Edition>(key(id));
}

/** The edition for this hour; cut and stored on first request. */
export async function currentEdition(): Promise<Edition> {
  const id = editionNow();
  const have = await getEdition(id);
  if (have) return have;
  const ed = await cutEdition(id);
  const prev = await storedEdition(id - 1, 48);
  if (ed.pool.reduce((n, s) => n + s.length, 0) < 20) {
    // the index is down: fall back to the newest stored edition
    if (prev) return prev;
    throw new Error("index unavailable");
  }
  // a shallow cut (slow index) leaves rare suits thin: top them up from the previous deck
  if (prev) {
    ed.pool = ed.pool.map((list, u) => {
      if (list.length >= 13) return list;
      const have = new Set(list.map((c) => c.t));
      return list.concat((prev.pool[u] || []).filter((c) => !have.has(c.t))).slice(0, PER_SUIT);
    });
  }
  try {
    await save(key(id), ed);
  } catch (e) {
    if (e instanceof Taken) return (await getEdition(id)) || ed;
    throw e;
  }
  return ed;
}

/** The newest stored edition at or before `id`, looking back up to `hours`. */
export async function storedEdition(id: number, hours: number): Promise<Edition | null> {
  for (let back = 0; back <= hours; back++) {
    const ed = await getEdition(id - back);
    if (ed) return ed;
  }
  return null;
}

/** The freshest stored edition (within a few hours), without waiting on the index. */
export async function recentEdition(): Promise<Edition | null> {
  const id = editionNow();
  for (let back = 0; back <= 3; back++) {
    const ed = await getEdition(id - back);
    if (ed) return ed;
  }
  return null;
}
