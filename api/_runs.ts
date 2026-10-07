// Shared runs ("showdowns"): re-run on the server from the action trail, then frozen.
import { HAND } from "../shared/content.js";
import { decodeTrail, rerun } from "../shared/engine.js";
import { normSeed } from "../shared/rng.js";
import { hash32 } from "../shared/rng.js";
import { getEdition } from "./_deck.js";
import { load, loadFresh, save, saveOver, Taken } from "./_store.js";
import { cleanName, nameProblem } from "../shared/names.js";

export interface ShowCard {
  t: string;
  s: string;
  c: string | null;
  rank: number;
  suit: number;
}

export interface Showdown {
  id: string;
  seed: string;
  edition: number;
  trail: string;
  name: string | null;
  ante: number;
  blind: number;
  cleared: number;
  won: boolean;
  over: boolean;
  best: { total: number; hand: string; handName: string; cards: ShowCard[] } | null;
  hands: number;
  at: string;
}

const B32 = "0123456789abcdefghjkmnpqrstvwxyz";
function shortId(s: string): string {
  let a = hash32(s);
  let b = hash32("k" + s);
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += B32[a & 31] + B32[b & 31];
    a >>>= 5;
    b >>>= 5;
  }
  return out;
}

export const ID_RE = /^[0-9a-z]{10}$/;

export async function verifyAndStore(input: { seed?: unknown; edition?: unknown; trail?: unknown; name?: unknown }): Promise<Showdown> {
  const seed = normSeed(String(input.seed || ""));
  const edition = Number(input.edition);
  const trail = String(input.trail || "");
  if (!seed) throw new Error("bad seed");
  if (!Number.isInteger(edition)) throw new Error("bad deck");
  if (trail.length > 30000) throw new Error("trail too long");
  const ed = await getEdition(edition);
  if (!ed) throw new Error("deck not found");
  const run = rerun(ed, seed, decodeTrail(trail)); // throws on any illegal step
  const sum = run.summary();
  const rawName = typeof input.name === "string" ? cleanName(input.name) : "";
  if (rawName && nameProblem(rawName)) throw new Error(nameProblem(rawName)!);
  const name = rawName || null;
  const id = shortId(`${edition}|${seed}|${trail}|${name || ""}`);
  const rec: Showdown = {
    id,
    seed,
    edition,
    trail,
    name,
    ante: sum.ante,
    blind: sum.blind,
    cleared: sum.cleared,
    won: sum.won,
    over: sum.over,
    best: sum.best
      ? {
          total: sum.best.total,
          hand: sum.best.hand,
          handName: HAND[sum.best.hand].name,
          cards: sum.best.cards,
        }
      : null,
    hands: sum.hands,
    at: new Date().toISOString(),
  };
  try {
    await save(`showdowns/${id}.json`, rec);
  } catch (e) {
    if (!(e instanceof Taken)) throw e;
  }
  if (rec.name && rec.over && rec.best && rec.best.total > 0) await addToHall(rec);
  return rec;
}

// ------------------------------------------------------------ Hall of hands: best hands of the UTC day
export interface HallEntry {
  id: string;
  name: string;
  total: number;
  handName: string;
  ante: number;
  cleared: number;
  won: boolean;
  seed: string;
  edition: number;
  cards: ShowCard[];
  at: string;
}
export interface Hall {
  day: string;
  entries: HallEntry[];
}
export const HALL_SIZE = 50;
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const hallPath = (day: string) => `hall/${day}.json`;

async function addToHall(rec: Showdown): Promise<void> {
  const day = utcDay(new Date(rec.at));
  const hall = (await loadFresh<Hall>(hallPath(day))) || { day, entries: [] };
  if (hall.entries.some((e) => e.id === rec.id)) return;
  const entry: HallEntry = {
    id: rec.id,
    name: rec.name!,
    total: rec.best!.total,
    handName: rec.best!.handName,
    ante: rec.ante,
    cleared: rec.cleared,
    won: rec.won,
    seed: rec.seed,
    edition: rec.edition,
    cards: rec.best!.cards.slice(0, 5).sort((a, b) => a.rank - b.rank),
    at: rec.at,
  };
  // one line per player per seed: keep their best
  const others = hall.entries.filter((e) => !(e.name.toLowerCase() === entry.name.toLowerCase() && e.seed === entry.seed && e.total >= entry.total));
  if (others.length !== hall.entries.length) return;
  const next = [...hall.entries.filter((e) => !(e.name.toLowerCase() === entry.name.toLowerCase() && e.seed === entry.seed)), entry]
    .sort((a, b) => b.total - a.total || a.at.localeCompare(b.at))
    .slice(0, HALL_SIZE);
  if (!next.some((e) => e.id === entry.id)) return;
  await saveOver(hallPath(day), { day, entries: next } satisfies Hall);
}

export async function getHall(day: string): Promise<Hall> {
  return (await loadFresh<Hall>(hallPath(day))) || { day, entries: [] };
}

export async function getShowdown(id: string): Promise<Showdown | null> {
  if (!ID_RE.test(id)) return null;
  return load<Showdown>(`showdowns/${id}.json`);
}
