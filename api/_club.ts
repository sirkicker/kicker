// KICKER Club on the server: clubs, the weekly groups of eight, and matches played one decision at a time.
// The match seed is a server secret until full time, so a manager sees each chance only after deciding.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Launch } from "../shared/data.js";
import {
  DRILLS_PER_DAY,
  FIXTURES_PER_DAY,
  GROUP,
  KITS,
  ROD_SLOTS,
  SQUAD,
  TACTICS,
  XI,
  autoCaptain,
  autoXi,
  firstSquad,
  houseSide,
  pairKey,
  refresh,
  scorersOf,
  scoutOffers,
  sideProblem,
  simulate,
  table,
  weekOf,
  type Fixture,
  type MatchState,
  type Row,
  type Side,
  type Tactic,
} from "../shared/club.js";
import { utcDay } from "../shared/daily.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { macIn } from "./_house.js";
import { currentEdition, recentEdition } from "./_cut.js";
import { getJson, hashPairs, kv, kvMany, setJson } from "./_kv.js";

export class ClubError extends Error {
  constructor(
    msg: string,
    public status = 400,
  ) {
    super(msg);
  }
}

// ---------------------------------------------------------------- records
export interface ClubRec {
  v: 1;
  id: string;
  name: string;
  kit: number; // index into KITS
  key: string; // sha256 of the owner's secret
  created: number;
  squad: Launch[];
  xi: number[];
  tactic: Tactic;
  captain: number;
  /** Drill effects waiting for the next league match. */
  form: [number, number, number, number];
  wall: number;
  mood: number;
  /** League place: the week and the slot in a group. */
  week: number;
  group: number;
  slot: number;
  /** Per UTC day counters. */
  day: string;
  drills: number;
  played: number;
  drillsDone: string[]; // kinds done today
  /** Week of the last signing (one a week). */
  signed: number;
  /** Finished weeks: place in the group. */
  honours: { week: number; place: number; pts: number }[];
  updated: number;
}
/** What anyone may see of a club. */
export type PublicClub = Omit<ClubRec, "key">;
export const publicClub = ({ key: _k, ...rest }: ClubRec): PublicClub => rest;

const clubKey = (id: string) => `club:${id}`;
const nameKey = "club:names";
const recentKey = "club:recent";
const membersKey = (w: number, g: number) => `grp:${w}:${g}`;
const fixturesKey = (w: number, g: number) => `fx:${w}:${g}`;
const joinedKey = (w: number) => `wk:${w}:n`;
const poolKey = (w: number) => `wk:${w}:pool`;
const koKey = (w: number, g: number, pair: string) => `ko:${w}:${g}:${pair}`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ID_RE = /^[0-9a-z]{10}$/;
const newId = () => {
  const a = "0123456789abcdefghjkmnpqrstvwxyz";
  return [...randomBytes(10)].map((b) => a[b & 31]).join("");
};

export async function loadClub(id: string): Promise<ClubRec | null> {
  if (!ID_RE.test(id)) return null;
  return getJson<ClubRec>(clubKey(id));
}
async function saveClub(c: ClubRec) {
  c.updated = Date.now();
  await kvMany([
    ["SET", clubKey(c.id), JSON.stringify(c)],
    ["ZADD", recentKey, c.updated, c.id],
  ]);
}
export async function ownClub(id: unknown, secret: unknown): Promise<ClubRec> {
  const c = typeof id === "string" ? await loadClub(id) : null;
  if (!c) throw new ClubError("no such club", 404);
  const a = Buffer.from(sha(String(secret || "")));
  const b = Buffer.from(c.key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ClubError("not your club", 403);
  return c;
}

// ---------------------------------------------------------------- the week's launches
/** The launches of this week: frozen on first use so the house clubs stay the same all week. */
export async function weekPool(w = weekOf()): Promise<Launch[]> {
  const have = await getJson<Launch[]>(poolKey(w));
  if (have?.length) return have;
  const ed = (await recentEdition()) || (await currentEdition());
  const pool = ed.pool.flat();
  await setJson(poolKey(w), pool, { nx: true, ex: 60 * 60 * 24 * 21 });
  return (await getJson<Launch[]>(poolKey(w))) || pool;
}
/** Today's numbers for the launches (the freshest cut), falling back to the week's. */
async function livePool(w: number): Promise<Launch[]> {
  try {
    const ed = await recentEdition();
    if (ed) return ed.pool.flat();
  } catch {
    /* fall through */
  }
  return weekPool(w);
}

// ---------------------------------------------------------------- daily counters, the week
function today(c: ClubRec) {
  const d = utcDay();
  if (c.day !== d) {
    c.day = d;
    c.drills = 0;
    c.played = 0;
    c.drillsDone = [];
  }
}
/** Puts the club in this week's league if it is not in it yet; closes last week into its honours. */
async function intoWeek(c: ClubRec): Promise<boolean> {
  const w = weekOf();
  if (c.week === w) return false;
  if (c.week > 0) {
    try {
      const g = await groupView(c.week, c.group);
      const row = g.table.findIndex((r) => r.slot === c.slot);
      if (row >= 0 && g.table[row].p > 0) c.honours = [{ week: c.week, place: row + 1, pts: g.table[row].pts }, ...c.honours].slice(0, 20);
    } catch {
      /* last week is gone: nothing to record */
    }
  }
  const n = await kv<number>("INCR", joinedKey(w));
  await kv("EXPIRE", joinedKey(w), 60 * 60 * 24 * 21);
  c.week = w;
  c.group = Math.floor((n - 1) / GROUP);
  c.slot = (n - 1) % GROUP;
  await kvMany([
    ["HSET", membersKey(w, c.group), String(c.slot), c.id],
    ["EXPIRE", membersKey(w, c.group), 60 * 60 * 24 * 21],
  ]);
  return true;
}

// ---------------------------------------------------------------- create, read, change
export async function createClub(input: { name?: unknown; kit?: unknown }): Promise<{ club: PublicClub; secret: string }> {
  const name = cleanName(String(input.name || ""));
  const bad = nameProblem(name);
  if (bad) throw new ClubError(bad);
  const kit = Math.max(0, Math.min(KITS.length - 1, Math.floor(Number(input.kit) || 0)));
  const id = newId();
  const lower = name.toLowerCase();
  if ((await kv<number>("HSETNX", nameKey, lower, id)) !== 1) throw new ClubError("That club name is taken", 409);
  const pool = await weekPool();
  const squad = firstSquad(pool, id);
  const xi = autoXi(squad);
  const secret = randomBytes(18).toString("base64url");
  const c: ClubRec = {
    v: 1,
    id,
    name,
    kit,
    key: sha(secret),
    created: Date.now(),
    squad,
    xi,
    tactic: "press",
    captain: autoCaptain(squad, xi),
    form: [0, 0, 0, 0],
    wall: 0,
    mood: 0,
    week: 0,
    group: 0,
    slot: 0,
    day: utcDay(),
    drills: 0,
    played: 0,
    drillsDone: [],
    signed: 0,
    honours: [],
    updated: 0,
  };
  await intoWeek(c);
  await saveClub(c);
  return { club: publicClub(c), secret };
}

/** The owner's view: rolls the club into this week and today, and refreshes the launches' numbers. */
export async function myClub(id: unknown, secret: unknown) {
  const c = await ownClub(id, secret);
  const w = weekOf();
  const moved = await intoWeek(c);
  const d0 = c.day;
  today(c);
  const live = await livePool(w);
  c.squad = refresh(c.squad, live);
  if (moved || d0 !== c.day) await saveClub(c);
  return { club: publicClub(c), offers: c.signed === w ? [] : scoutOffers(live, c.squad, c.id, w), group: await groupView(c.week, c.group, c.slot) };
}

export async function saveLineup(c: ClubRec, input: { xi?: unknown; tactic?: unknown; captain?: unknown }) {
  const xi = Array.isArray(input.xi) ? input.xi.map(Number) : c.xi;
  const tactic = TACTICS.includes(input.tactic as Tactic) ? (input.tactic as Tactic) : c.tactic;
  const captain = input.captain === undefined ? c.captain : Number(input.captain);
  const side: Side = { ...sideOf(c), xi, tactic, captain };
  const bad = sideProblem(side);
  if (bad) throw new ClubError(bad);
  c.xi = xi;
  c.tactic = tactic;
  c.captain = captain;
  await saveClub(c);
  return publicClub(c);
}

export async function sign(c: ClubRec, input: { take?: unknown; drop?: unknown }) {
  const w = weekOf();
  if (c.signed === w) throw new ClubError("One signing a week. The scout is back on Monday.");
  const live = await livePool(w);
  const offers = scoutOffers(live, c.squad, c.id, w);
  const take = offers.find((l) => l.t === String(input.take || "").toLowerCase());
  if (!take) throw new ClubError("That launch is not on the scout's list");
  const drop = Number(input.drop);
  if (!Number.isInteger(drop) || drop < 0 || drop >= SQUAD) throw new ClubError("Pick who leaves");
  c.squad[drop] = take;
  c.signed = w;
  await saveClub(c);
  return publicClub(c);
}

export type DrillKind = "train" | "wall" | "press";
export async function drill(c: ClubRec, input: { kind?: unknown; rod?: unknown; value?: unknown }) {
  today(c);
  const kind = String(input.kind) as DrillKind;
  if (!["train", "wall", "press"].includes(kind)) throw new ClubError("bad drill");
  if (c.drills >= DRILLS_PER_DAY) throw new ClubError("Two drills a day. The squad needs its legs.");
  if (c.drillsDone.includes(kind)) throw new ClubError("That drill is done for today");
  const v = Math.max(0, Math.min(3, Math.floor(Number(input.value) || 0)));
  if (kind === "train") {
    const rod = Math.floor(Number(input.rod));
    if (!(rod >= 0 && rod <= 3)) throw new ClubError("bad rod");
    c.form[rod] = Math.max(c.form[rod], v);
  } else if (kind === "wall") c.wall = Math.max(c.wall, v);
  else c.mood = Math.max(c.mood, v);
  c.drills++;
  c.drillsDone.push(kind);
  await saveClub(c);
  return publicClub(c);
}

export function sideOf(c: ClubRec): Side {
  return {
    name: c.name,
    kit: KITS[c.kit] || KITS[0],
    squad: c.squad,
    xi: c.xi,
    tactic: c.tactic,
    captain: c.captain,
    form: c.form,
    wall: c.wall,
    mood: c.mood,
  };
}

// ---------------------------------------------------------------- the group
export interface Member {
  slot: number;
  id: string | null; // null: a house club
  name: string;
  kit: [number, number];
}
export interface GroupView {
  week: number;
  group: number;
  members: Member[];
  fixtures: Fixture[];
  table: Row[];
  /** Your slot, when asked by a member. */
  you?: number;
}

export async function groupView(w: number, g: number, you?: number): Promise<GroupView> {
  const [mem, fx] = (await kvMany([
    ["HGETALL", membersKey(w, g)],
    ["HGETALL", fixturesKey(w, g)],
  ])) as [string[] | null, string[] | null];
  const ids = hashPairs(mem);
  const recs = await clubsById([...ids.values()]);
  const pool = await weekPool(w);
  const members: Member[] = [];
  for (let slot = 0; slot < GROUP; slot++) {
    const id = ids.get(String(slot)) || null;
    const rec = id ? recs.get(id) : null;
    if (rec) members.push({ slot, id, name: rec.name, kit: KITS[rec.kit] || KITS[0] });
    else {
      const h = houseSide(pool, w, g, slot);
      members.push({ slot, id: null, name: h.name, kit: h.kit });
    }
  }
  const fixtures = [...hashPairs(fx).values()].map((s) => JSON.parse(s) as Fixture).sort((a, b) => a.at - b.at);
  return { week: w, group: g, members, fixtures, table: table(members.map((m) => m.name), fixtures), ...(you !== undefined ? { you } : {}) };
}

async function clubsById(ids: string[]): Promise<Map<string, ClubRec>> {
  const out = new Map<string, ClubRec>();
  if (!ids.length) return out;
  const vals = await kv<(string | null)[]>("MGET", ...ids.map(clubKey));
  vals.forEach((v, i) => v && out.set(ids[i], JSON.parse(v) as ClubRec));
  return out;
}

/** The side in a slot of a group, as it would take the field now. */
async function sideInSlot(w: number, g: number, slot: number, pool: Launch[], live: Launch[]): Promise<{ side: Side; id: string | null }> {
  const id = await kv<string | null>("HGET", membersKey(w, g), String(slot));
  const rec = id ? await loadClub(id) : null;
  if (rec && rec.week === w) return { side: { ...sideOf(rec), squad: refresh(rec.squad, live) }, id: rec.id };
  return { side: houseSide(pool, w, g, slot), id: null };
}

// ---------------------------------------------------------------- a league match, one decision at a time
interface Kickoff {
  w: number;
  g: number;
  a: number;
  b: number;
  home: Side;
  away: Side;
  seed: string;
  choices: number[];
  at: number;
  /** The away club's id, when a person runs it (their drill effects are spent too). */
  awayId: string | null;
}
const seedOf = (w: number, g: number, pair: string, at: number) => macIn("club-match", `${w}|${g}|${pair}|${at}`).toString("base64url").slice(0, 16);

/** What the client sees of a match in progress: the chances up to now and the decision it waits on. */
export interface MatchView {
  home: Side;
  away: Side;
  state: MatchState;
  slot: number;
  /** Set at full time: the stored fixture, and the seed (now public, so anyone can replay it). */
  fixture?: Fixture;
  seed?: string;
}
const view = (k: Kickoff, st: MatchState, fixture?: Fixture): MatchView => ({ home: k.home, away: k.away, state: st, slot: k.b, ...(fixture ? { fixture, seed: k.seed } : {}) });

export async function kickoff(c: ClubRec, input: { slot?: unknown }): Promise<MatchView> {
  const w = weekOf();
  if (c.week !== w) await intoWeek(c);
  today(c);
  const b = Math.floor(Number(input.slot));
  if (!(b >= 0 && b < GROUP) || b === c.slot) throw new ClubError("Pick a club from your group");
  const pair = pairKey(c.slot, b);
  const done = await kv<string | null>("HGET", fixturesKey(w, c.group), pair);
  if (done) throw new ClubError("That fixture is played", 409);
  const kk = koKey(w, c.group, pair);
  const open = await getJson<Kickoff>(kk);
  if (open) {
    // only the side that kicked it off carries it on
    if (open.a !== c.slot) throw new ClubError("They are playing this one right now. Try another fixture.", 409);
    return view(open, simulate(open.home, open.away, open.seed, open.choices));
  }
  if (c.played >= FIXTURES_PER_DAY) throw new ClubError("Three league matches a day. More tomorrow.");
  const pool = await weekPool(w);
  const live = await livePool(w);
  const them = await sideInSlot(w, c.group, b, pool, live);
  const home: Side = { ...sideOf(c), squad: refresh(c.squad, live) };
  const at = Date.now();
  const k: Kickoff = { w, g: c.group, a: c.slot, b, home, away: them.side, seed: seedOf(w, c.group, pair, at), choices: [], at, awayId: them.id };
  if (!(await setJson(kk, k, { nx: true, ex: 60 * 60 * 24 * 8 }))) throw new ClubError("That fixture just kicked off elsewhere", 409);
  // the drill effects are spent on this match
  c.played++;
  c.form = [0, 0, 0, 0];
  c.wall = 0;
  c.mood = 0;
  await saveClub(c);
  return view(k, simulate(k.home, k.away, k.seed, []));
}

export async function decide(c: ClubRec, input: { slot?: unknown; choice?: unknown }): Promise<MatchView> {
  const w = weekOf();
  const b = Math.floor(Number(input.slot));
  const pair = pairKey(c.slot, b);
  const kk = koKey(c.week, c.group, pair);
  const k = await getJson<Kickoff>(kk);
  if (!k || k.a !== c.slot || c.week !== k.w) throw new ClubError("No match in progress", 404);
  const before = simulate(k.home, k.away, k.seed, k.choices);
  if (!before.pending) throw new ClubError("Nothing to decide");
  const ch = Math.floor(Number(input.choice));
  if (!(ch >= 0 && ch < before.pending.options.length)) throw new ClubError("bad choice");
  k.choices.push(ch);
  const st = simulate(k.home, k.away, k.seed, k.choices);
  if (st.pending) {
    await setJson(kk, k, { ex: 60 * 60 * 24 * 8 });
    return view(k, st);
  }
  // full time: store the fixture once; the open match is cleared
  const fixture: Fixture = { a: k.a, b: k.b, sa: st.score[0], sb: st.score[1], seed: k.seed, choices: k.choices, at: Date.now(), scorers: scorersOf(st, k.home, k.away) };
  if (k.w === w || k.w === w - 1) await kv("HSETNX", fixturesKey(k.w, k.g), pair, JSON.stringify(fixture));
  await kvMany([
    ["EXPIRE", fixturesKey(k.w, k.g), 60 * 60 * 24 * 21],
    ["DEL", kk],
  ]);
  return view(k, st, fixture);
}

/** A friendly: any recent club, played on the client (nothing is stored). */
export async function friendlyRival(notId: string): Promise<{ side: Side; id: string | null }> {
  const ids = await kv<string[]>("ZREVRANGE", recentKey, 0, 40);
  const pick = ids.filter((x) => x !== notId);
  const live = await livePool(weekOf());
  if (pick.length) {
    const id = pick[Math.floor(Math.random() * pick.length)];
    const rec = await loadClub(id);
    if (rec) return { side: { ...sideOf(rec), squad: refresh(rec.squad, live), form: [0, 0, 0, 0], wall: 0, mood: 0 }, id };
  }
  const pool = await weekPool();
  return { side: houseSide(pool, weekOf(), 999, Math.floor(Math.random() * GROUP)), id: null };
}

export async function trimRecent() {
  await kv("ZREMRANGEBYRANK", recentKey, 0, -501);
}

export { ROD_SLOTS, XI };
