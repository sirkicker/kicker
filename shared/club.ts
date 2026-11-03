// KICKER Club (4.0): you manage a club of live vibe/vibe launches, and the matches play themselves on the table.
// This file is the whole game rule: ratings from a launch's numbers, the match, the decisions a manager takes during
// it, the weekly league of eight clubs, the house clubs that fill it, the scout and the shootout.
// Pure and deterministic: the same clubs, seed and choices give the same match on any machine. Only + - * / and
// Math.sqrt touch the numbers (all exactly rounded), so the server replays a match bit for bit.
import type { Launch } from "./data.js";
import { CLUBS } from "./content.js";
import { hash32, shuffle, stream, type Rand } from "./rng.js";

// ---------------------------------------------------------------- the squad
/** A club keeps 14 launches: eleven on the rods, three on the bench. */
export const SQUAD = 14;
export const XI = 11;
/** Rod of each line-up slot: 0 keeper, 1 defence (2), 2 midfield (5), 3 attack (3). The table's own rods. */
export const ROD_OF = [0, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3] as const;
export const ROD_NAME = ["Keeper", "Defence", "Midfield", "Attack"] as const;
export const ROD_SLOTS: number[][] = [[0], [1, 2], [3, 4, 5, 6, 7], [8, 9, 10]];

/** The three numbers every launch brings, 25..95. Read off the launch alone, so anyone can check them. */
export interface Ratings {
  pow: number; // Power: curve progress
  pac: number; // Pace: trades in the last 24h
  grp: number; // Grip: holders
}
const scale = (v: number, ref: number) => Math.round(25 + 70 * Math.sqrt(Math.max(0, Math.min(v, ref)) / ref));
export const RATING = {
  pow: { name: "Power", from: "curve progress", ref: 10000 },
  pac: { name: "Pace", from: "trades in 24h", ref: 120 },
  grp: { name: "Grip", from: "holders", ref: 60 },
} as const;
export function ratings(l: Launch): Ratings {
  return { pow: l.g ? 95 : scale(l.p, RATING.pow.ref), pac: scale(l.k, RATING.pac.ref), grp: scale(l.h, RATING.grp.ref) };
}
/** What a launch is worth on a rod: attack shoots (Power, Pace), midfield links (Pace, Grip), defence stops (Grip, Power), the keeper saves (Grip, Pace). */
export function roleRating(r: Ratings, rod: number): number {
  if (rod === 3) return (r.pow * 6 + r.pac * 4) / 10;
  if (rod === 2) return (r.pac + r.grp) / 2;
  if (rod === 1) return (r.grp * 6 + r.pow * 4) / 10;
  return (r.grp * 7 + r.pac * 3) / 10;
}
/** The rod a launch suits best. */
export function bestRod(l: Launch): number {
  const r = ratings(l);
  let best = 3;
  let v = -1;
  for (const rod of [3, 2, 1, 0]) {
    const x = roleRating(r, rod);
    if (x > v + 0.001) {
      v = x;
      best = rod;
    }
  }
  return best;
}

// ---------------------------------------------------------------- tactics
export type Tactic = "press" | "counter" | "hold";
export const TACTICS: Tactic[] = ["press", "counter", "hold"];
export const TACTIC: Keyed<Tactic, { name: string; text: string; beats: Tactic }> = {
  press: { name: "Press", text: "Win it high. More chances, more space behind you.", beats: "hold" },
  counter: { name: "Counter", text: "Sit, then break. Fewer chances, sharper ones.", beats: "press" },
  hold: { name: "Hold", text: "Keep it tight. Fewer chances both ways.", beats: "counter" },
};

// ---------------------------------------------------------------- a club as it takes the field
/** Everything the match needs from one club. Stored with every result, so a match replays from its record alone. */
export interface Side {
  name: string;
  /** Kit: main and highlight colours as 0xRRGGBB. */
  kit: [number, number];
  squad: Launch[]; // SQUAD launches
  xi: number[]; // XI squad indices, slot order (see ROD_OF)
  tactic: Tactic;
  captain: number; // squad index
  /** Training: form per rod, 0..3, for this match. */
  form: [number, number, number, number];
  /** The wall drill: 0..3. Their conversion drops a little per point. */
  wall: number;
  /** The press room: 0..3. The stands are louder when this club is at home. */
  mood: number;
  /** A house club (filled in by the game, not a person). */
  house?: boolean;
}

export const FORM_PT = 2.5; // rating per point of form
export const CAPTAIN_PT = 6;

// ---------------------------------------------------------------- the match
export type Outcome = "goal" | "save" | "block" | "wide";
/** One chance: who attacked, how the ball got forward, who shot, and what happened. Slots are line-up slots. */
export interface Moment {
  i: number;
  min: number;
  side: 0 | 1; // 0 home, 1 away
  chain: number[]; // attacking slots the ball went through, shooter last
  shooter: number; // attacking slot
  blocker: number; // defending slot that met it (the keeper on a save)
  out: Outcome;
  score: [number, number]; // after this moment
  /** Squad index of the shooter, for the scorer list. */
  who: number;
}
export interface Option {
  id: string;
  label: string;
  text: string;
}
export interface Decision {
  n: number; // 0..2
  min: number;
  title: string;
  options: Option[];
}
/** What a manager changed during the match. Only the home side decides; the away side's own manager is the auto one. */
export interface Live {
  tactic: [Tactic, Tactic];
  /** Rating shift per rod, per side (from late changes). */
  push: [number[], number[]];
  /** Slot -> squad index, per side, after substitutions. */
  xi: [number[], number[]];
  subs: [number, number];
}
export interface MatchState {
  moments: Moment[];
  score: [number, number];
  /** The next decision, while the match waits for it. */
  pending: Decision | null;
  done: boolean;
  live: Live;
  /** What each choice did, for the report. */
  notes: string[];
}

export const MOMENTS = 14;
/** Decisions come after the last chance before these minutes. */
export const DECIDE_AT = [30, 60, 75];

/** Team strength on one rod for one side, live. */
function rodPower(s: Side, xi: number[], rod: number, push: number): number {
  let sum = 0;
  const slots = ROD_SLOTS[rod];
  for (const slot of slots) {
    const q = xi[slot];
    const l = s.squad[q];
    let v = l ? roleRating(ratings(l), rod) : 30;
    v += s.form[rod] * FORM_PT;
    if (q === s.captain) v += CAPTAIN_PT;
    sum += v;
  }
  return sum / slots.length + push;
}

/** The minutes of the 14 chances, from the seed alone: choices never move them. */
export function minutesOf(seed: string): number[] {
  const r = stream(seed, "mins");
  const out: number[] = [];
  for (let i = 0; i < MOMENTS; i++) {
    const lo = Math.floor((i * 90) / MOMENTS) + 1;
    const hi = Math.floor(((i + 1) * 90) / MOMENTS);
    out.push(lo + Math.floor(r() * (hi - lo + 1)));
  }
  return out;
}

const pick = <T,>(arr: readonly T[], r: Rand): T => arr[Math.floor(r() * arr.length) % arr.length];

/** The options for decision n, given the match so far. */
function optionsFor(n: number, st: MatchState, home: Side): Decision {
  const t = st.live.tactic[0];
  const others = TACTICS.filter((x) => x !== t);
  const [h, a] = st.score;
  if (n === 0) {
    return {
      n,
      min: DECIDE_AT[0],
      title: h > a ? "Half an hour in, you lead" : h < a ? "Half an hour in, you trail" : "Half an hour in, level",
      options: [
        { id: "keep", label: `Stay ${TACTIC[t].name}`, text: TACTIC[t].text },
        ...others.map((o) => ({ id: "t:" + o, label: `Switch to ${TACTIC[o].name}`, text: TACTIC[o].text })),
      ],
    };
  }
  if (n === 1) {
    const sub = bestSub(home, st.live.xi[0]);
    const their = st.live.tactic[1];
    const answer = TACTICS.find((x) => TACTIC[x].beats === their)!;
    const opts: Option[] = [{ id: "keep", label: "Change nothing", text: "Legs are heavy after the hour. Everyone stays on." }];
    if (sub) {
      const off = home.squad[st.live.xi[0][sub.slot]];
      const on = home.squad[sub.bench];
      opts.push({ id: `s:${sub.slot}:${sub.bench}`, label: `$${on.s} on for $${off.s}`, text: `Fresh legs on the ${ROD_NAME[ROD_OF[sub.slot]].toLowerCase()} rod.` });
    }
    if (answer !== t) opts.push({ id: "t:" + answer, label: `Switch to ${TACTIC[answer].name}`, text: `They play ${TACTIC[their].name}. ${TACTIC[answer].name} beats it.` });
    else opts.push({ id: "fresh", label: "Rotate the midfield", text: "Midfield keeps its legs. Attack loses a step." });
    return { n, min: DECIDE_AT[1], title: "The hour mark", options: opts };
  }
  const lead = h - a;
  const opts: Option[] = [{ id: "keep", label: "Let it play out", text: "Fifteen minutes left. No change." }];
  if (lead > 0) {
    opts.push({ id: "park", label: "Park it", text: "Defence +8, attack −8, switch to Hold." });
    opts.push({ id: "next", label: "Go for the next one", text: "Attack +6, defence −4." });
  } else if (lead < 0) {
    opts.push({ id: "allin", label: "All in", text: "Attack +10, defence −10, switch to Press." });
    opts.push({ id: "next", label: "Push a little", text: "Attack +6, defence −4." });
  } else {
    opts.push({ id: "next", label: "Go for the winner", text: "Attack +6, defence −4." });
    opts.push({ id: "park", label: "Take the point", text: "Defence +8, attack −8, switch to Hold." });
  }
  return { n, min: DECIDE_AT[2], title: lead > 0 ? "Fifteen left, you lead" : lead < 0 ? "Fifteen left, you trail" : "Fifteen left, level", options: opts };
}

/** The bench launch that improves a rod most, and the slot it would take. */
export function bestSub(s: Side, xi: number[]): { slot: number; bench: number; gain: number } | null {
  const used = new Set(xi);
  let best: { slot: number; bench: number; gain: number } | null = null;
  for (let q = 0; q < s.squad.length; q++) {
    if (used.has(q)) continue;
    const r = ratings(s.squad[q]);
    for (let slot = 0; slot < XI; slot++) {
      const rod = ROD_OF[slot];
      const cur = roleRating(ratings(s.squad[xi[slot]]), rod) - TIRED;
      const gain = roleRating(r, rod) - cur;
      if (!best || gain > best.gain + 0.001) best = { slot, bench: q, gain };
    }
  }
  return best;
}
/** After the hour every starter loses this much; a substitute comes on fresh. */
export const TIRED = 5;

/** What the away side's own manager does at each decision: sensible, always the same for the same match. */
function autoChoice(n: number, st: MatchState, away: Side): string {
  const [h, a] = st.score;
  if (n === 0) return h > a ? "t:" + TACTICS.find((x) => TACTIC[x].beats === st.live.tactic[0])! : "keep";
  if (n === 1) {
    const sub = bestSub(away, st.live.xi[1]);
    return sub && sub.gain > 0 ? `s:${sub.slot}:${sub.bench}` : "keep";
  }
  return a > h ? "park" : a < h ? "allin" : "keep";
}

function apply(id: string, side: 0 | 1, st: MatchState, s: Side) {
  const L = st.live;
  const note = (t: string) => side === 0 && st.notes.push(t);
  if (id.startsWith("t:")) {
    L.tactic[side] = id.slice(2) as Tactic;
    note(`Switched to ${TACTIC[L.tactic[side]].name}`);
  } else if (id.startsWith("s:")) {
    const [, slot, q] = id.split(":").map(Number);
    if (L.subs[side] < 1 && slot >= 0 && slot < XI && q >= 0 && q < s.squad.length && !L.xi[side].includes(q)) {
      L.xi[side] = L.xi[side].slice();
      L.xi[side][slot] = q;
      L.subs[side]++;
      note(`$${s.squad[q].s} came on`);
    }
  } else if (id === "park") {
    L.push[side][1] += 8;
    L.push[side][0] += 4;
    L.push[side][3] -= 8;
    L.tactic[side] = "hold";
    note("Parked it");
  } else if (id === "allin") {
    L.push[side][3] += 10;
    L.push[side][1] -= 10;
    L.tactic[side] = "press";
    note("Went all in");
  } else if (id === "next") {
    L.push[side][3] += 6;
    L.push[side][1] -= 4;
    note("Pushed for a goal");
  } else if (id === "fresh") {
    L.push[side][2] += 5;
    L.push[side][3] -= 3;
    note("Rotated the midfield");
  }
}

/**
 * Plays a match as far as the choices go. `choices[n]` is the option index taken at decision n; when a decision is
 * reached with no choice for it, the state comes back with `pending` set and the match waits there.
 * Each chance draws from its own stream (seed, i), so a choice changes what follows it and nothing before it.
 */
export function simulate(home: Side, away: Side, seed: string, choices: number[]): MatchState {
  const st: MatchState = {
    moments: [],
    score: [0, 0],
    pending: null,
    done: false,
    live: { tactic: [home.tactic, away.tactic], push: [[0, 0, 0, 0], [0, 0, 0, 0]], xi: [home.xi.slice(), away.xi.slice()], subs: [0, 0] },
    notes: [],
  };
  const mins = minutesOf(seed);
  let n = 0;
  for (let i = 0; i < MOMENTS; i++) {
    while (n < DECIDE_AT.length && mins[i] > DECIDE_AT[n]) {
      const d = optionsFor(n, st, home);
      const c = choices[n];
      if (c === undefined || c === null) {
        st.pending = d;
        return st;
      }
      const opt = d.options[Math.max(0, Math.min(d.options.length - 1, Math.floor(c)))];
      apply(opt.id, 0, st, home);
      apply(autoChoice(n, st, away), 1, st, away);
      n++;
    }
    st.moments.push(chance(i, mins[i], home, away, seed, st));
  }
  while (n < DECIDE_AT.length && choices[n] !== undefined) n++;
  st.done = true;
  return st;
}

/** One chance of the match. */
function chance(i: number, min: number, home: Side, away: Side, seed: string, st: MatchState): Moment {
  const r = stream(seed, "m", i);
  const L = st.live;
  const sides = [home, away];
  const tired = (s: 0 | 1) => (min > 60 ? TIRED * ((XI - L.subs[s]) / XI) : 0);
  const pw = (s: 0 | 1, rod: number) => rodPower(sides[s], L.xi[s], rod, L.push[s][rod] - tired(s));
  // who gets the chance: midfield against midfield, then the tactics
  const mid = [pw(0, 2), pw(1, 2)];
  const vol = (s: 0 | 1) => (L.tactic[s] === "press" ? 1.15 : L.tactic[s] === "counter" ? 0.88 : 0.86);
  // hold also slows the other side down
  const slow = (s: 0 | 1) => (L.tactic[s === 0 ? 1 : 0] === "hold" ? 0.82 : 1);
  const homeLoud = 1 + home.mood * 0.02;
  const w0 = mid[0] * mid[0] * vol(0) * slow(0) * homeLoud * 1.05;
  const w1 = mid[1] * mid[1] * vol(1) * slow(1);
  const side: 0 | 1 = r() * (w0 + w1) < w0 ? 0 : 1;
  const def: 0 | 1 = side === 0 ? 1 : 0;
  const A = sides[side];
  const D = sides[def];
  // the build-up: one of the back, one or two of the midfield, then the shooter
  const chain: number[] = [];
  if (r() < 0.7) chain.push(pick(ROD_SLOTS[1], r));
  chain.push(pick(ROD_SLOTS[2], r));
  if (r() < 0.45) chain.push(pick(ROD_SLOTS[2].filter((x) => x !== chain[chain.length - 1]), r));
  // the shooter: attack most of the time, a midfielder sometimes, a defender on a set piece
  const roll = r();
  const sRod = roll < 0.72 ? 3 : roll < 0.95 ? 2 : 1;
  const cand = ROD_SLOTS[sRod];
  // the better finisher shoots more
  let tot = 0;
  const wts = cand.map((slot) => {
    const q = L.xi[side][slot];
    const v = roleRating(ratings(A.squad[q]), 3) + (q === A.captain ? 10 : 0);
    tot += v * v;
    return v * v;
  });
  let x = r() * tot;
  let shooter = cand[cand.length - 1];
  for (let k = 0; k < cand.length; k++) {
    x -= wts[k];
    if (x < 0) {
      shooter = cand[k];
      break;
    }
  }
  if (chain[chain.length - 1] !== shooter) chain.push(shooter);
  const sq = L.xi[side][shooter];
  const shoot = roleRating(ratings(A.squad[sq]), 3) + A.form[sRod] * FORM_PT + (sq === A.captain ? CAPTAIN_PT : 0) + L.push[side][3] - tired(side);
  const stop = pw(def, 1);
  const save = pw(def, 0);
  let conv = (0.31 * shoot) / (shoot + 0.5 * stop + 0.5 * save);
  if (L.tactic[side] === "counter") conv *= 1.25;
  if (L.tactic[def] === "press") conv *= 1.1; // space behind a high line
  if (TACTIC[L.tactic[side]].beats === L.tactic[def]) conv *= 1.15;
  if (TACTIC[L.tactic[def]].beats === L.tactic[side]) conv *= 0.9;
  conv *= 1 - D.wall * 0.06;
  if (side === 0) conv *= 1.06 + home.mood * 0.02;
  const y = r();
  let out: Outcome;
  let blocker: number;
  if (y < conv) {
    out = "goal";
    blocker = 0;
  } else {
    const keeperShare = save / (save + stop);
    const z = r();
    if (z < 0.5 * keeperShare + 0.2) {
      out = "save";
      blocker = 0;
    } else if (z < 0.82) {
      out = "block";
      blocker = pick(ROD_SLOTS[1], r);
    } else {
      out = "wide";
      blocker = 0;
    }
  }
  if (out === "goal") st.score = side === 0 ? [st.score[0] + 1, st.score[1]] : [st.score[0], st.score[1] + 1];
  return { i, min, side, chain, shooter, blocker, out, score: [st.score[0], st.score[1]], who: sq };
}

/** Plays a whole match with the home side always keeping its plan: for house matches, the sim and the tests. */
export function autoPlay(home: Side, away: Side, seed: string): MatchState {
  const ch: number[] = [];
  for (;;) {
    const st = simulate(home, away, seed, ch);
    if (!st.pending) return st;
    ch.push(0);
  }
}

// ---------------------------------------------------------------- the shootout (friendlies that end level)
/** 0 left, 1 middle, 2 right, as the kicker sees the goal. */
export type Spot = 0 | 1 | 2;
export const SPOT_NAME = ["Left", "Middle", "Right"];
export const KICKS = 5;
/**
 * A taker's favourite spot, read off the launch: its ticker's first letter. The hint shows it; they go there most of
 * the time, so reading it is the skill.
 */
export const favSpot = (l: Launch): Spot => (hash32(l.s) % 3) as Spot;
/** The away side's five takers and the keeper's dives: from the seed and the launches, fixed before you pick. */
export function shootoutPlan(away: Side, seed: string): { takers: number[]; shots: Spot[]; dives: Spot[] } {
  const r = stream(seed, "pens");
  const order = [...ROD_SLOTS[3], ...ROD_SLOTS[2]].map((slot) => away.xi[slot]);
  const takers = order.slice(0, KICKS);
  const shots = takers.map((q) => (r() < 0.6 ? favSpot(away.squad[q]) : (Math.floor(r() * 3) as Spot)));
  const dives = takers.map(() => Math.floor(r() * 3) as Spot);
  return { takers, shots, dives };
}
/** Your five takers: attack first, then midfield, the captain first of all. */
export function shootoutTakers(home: Side): number[] {
  const order = [...ROD_SLOTS[3], ...ROD_SLOTS[2]].map((slot) => home.xi[slot]);
  const cap = order.indexOf(home.captain);
  if (cap > 0) order.unshift(order.splice(cap, 1)[0]);
  return order.slice(0, KICKS);
}
/**
 * Scores a shootout. `picks` holds, per round, [where you shoot, where your keeper dives]. A shot scores unless the
 * keeper dives to its spot; a keeper with Grip 70+ reaches the middle from either side.
 */
export function shootout(home: Side, away: Side, seed: string, picks: [Spot, Spot][]): { you: boolean[]; them: boolean[]; won: boolean | null } {
  const plan = shootoutPlan(away, seed);
  const theirKeeper = ratings(away.squad[away.xi[0]]).grp;
  const ourKeeper = ratings(home.squad[home.xi[0]]).grp;
  const stops = (shot: Spot, dive: Spot, grip: number) => dive === shot || (grip >= 70 && shot === 1);
  const you: boolean[] = [];
  const them: boolean[] = [];
  for (let k = 0; k < Math.min(KICKS, picks.length); k++) {
    const [shot, dive] = picks[k];
    you.push(!stops(shot, plan.dives[k], theirKeeper));
    them.push(!stops(plan.shots[k], dive, ourKeeper));
  }
  const a = you.filter(Boolean).length;
  const b = them.filter(Boolean).length;
  const left = KICKS - you.length;
  let won: boolean | null = null;
  if (a > b + left) won = true;
  else if (b > a + left) won = false;
  else if (left === 0) won = a === b ? !!(hash32(seed + "|coin") & 1) : a > b;
  return { you, them, won };
}

// ---------------------------------------------------------------- weeks and the league
export const DAY_MS = 86_400_000;
/** The league week, Monday 00:00 UTC to Sunday 24:00. 1970-01-01 was a Thursday. */
export const weekOf = (ms = Date.now()) => Math.floor((Math.floor(ms / DAY_MS) + 3) / 7);
export const weekStart = (w: number) => (w * 7 - 3) * DAY_MS;
export const weekEnd = (w: number) => weekStart(w + 1);
export const GROUP = 8;
/** League fixtures you may play in one UTC day. */
export const FIXTURES_PER_DAY = 3;
/** Drills (training, the wall, the press room) per UTC day. */
export const DRILLS_PER_DAY = 2;
export const POINTS = { win: 3, draw: 1, loss: 0 };

/** One played league fixture: slots in the group, the score, and enough to replay it. */
export interface Fixture {
  a: number; // home slot (the one who played it)
  b: number; // away slot
  sa: number;
  sb: number;
  seed: string;
  choices: number[];
  at: number;
  scorers: { side: 0 | 1; s: string; min: number }[];
}
export interface Row {
  slot: number;
  name: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}
export function table(names: string[], fixtures: Fixture[]): Row[] {
  const rows: Row[] = names.map((name, slot) => ({ slot, name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  for (const f of fixtures) {
    const A = rows[f.a];
    const B = rows[f.b];
    if (!A || !B) continue;
    A.p++;
    B.p++;
    A.gf += f.sa;
    A.ga += f.sb;
    B.gf += f.sb;
    B.ga += f.sa;
    if (f.sa > f.sb) {
      A.w++;
      B.l++;
    } else if (f.sa < f.sb) {
      B.w++;
      A.l++;
    } else {
      A.d++;
      B.d++;
    }
  }
  for (const r of rows) r.pts = r.w * POINTS.win + r.d * POINTS.draw;
  return rows.sort((x, y) => y.pts - x.pts || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.slot - y.slot);
}
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// ---------------------------------------------------------------- house clubs
/** Kits a player can wear: main and highlight. Wine first, the table's own. */
export const KITS: [number, number][] = [
  [0x8a1f4f, 0xff7aa8],
  [0x1aa7c9, 0x7fe3f5],
  [0xffc23d, 0xfff09a],
  [0x2fae5a, 0x9ff0b8],
  [0x7a3fd0, 0xc4a2ff],
  [0xe8742a, 0xffb26e],
  [0x2a2a30, 0xff6a4a],
  [0xdfe4ec, 0xffffff],
];
const HOUSE_KIT: Keyed<string, [number, number]> = {
  "Floor Price FC": [0xe8742a, 0xffb26e],
  "Liquidity Town": [0x2f8fe0, 0x9ad0ff],
  "Real Mempool": [0xdfe4ec, 0xffffff],
  "Sporting Slippage": [0x2fae5a, 0x9ff0b8],
  "Dynamo Dip": [0x3150d6, 0x8fa2ff],
  "Athletic Bagholders": [0xe0502a, 0xffa07a],
  "Inter Testnet": [0x1f2a6e, 0x5f86ff],
  "AC Airdrop": [0x2a2a30, 0xff6a4a],
  "Olympique Oracle": [0x6fc6e8, 0xd2f4ff],
  "Borussia Bridge": [0xf2c81c, 0xfff09a],
  "Rapid Rebase": [0x1f8a4c, 0x7fe0a6],
  "Union Unlock": [0xe8b83a, 0xffe39a],
  "Racing Rollup": [0x8fd0f0, 0xe6f8ff],
  "Atletico Allowlist": [0xd23a3a, 0xff9a8a],
  "Deportivo Degen": [0x2459c8, 0x86b0ff],
  "United Validators": [0x7a3fd0, 0xc4a2ff],
};
export const HOUSE_NAMES = CLUBS;

/** Puts 11 of a squad on the rods where they fit: the best keeper, the two best stoppers, five linkers, three finishers. */
export function autoXi(squad: Launch[]): number[] {
  const left = new Set(squad.map((_, i) => i));
  const take = (rod: number, n: number) => {
    const best = [...left].sort((a, b) => roleRating(ratings(squad[b]), rod) - roleRating(ratings(squad[a]), rod) || a - b).slice(0, n);
    for (const q of best) left.delete(q);
    return best;
  };
  const att = take(3, 3);
  const gk = take(0, 1);
  const def = take(1, 2);
  const mid = take(2, 5);
  return [...gk, ...def, ...mid, ...att];
}
/** The captain a squad would pick: the best finisher on the rods. */
export function autoCaptain(squad: Launch[], xi: number[]): number {
  let best = xi[8];
  let v = -1;
  for (const slot of ROD_SLOTS[3]) {
    const q = xi[slot];
    const x = roleRating(ratings(squad[q]), 3);
    if (x > v) {
      v = x;
      best = q;
    }
  }
  return best;
}

/**
 * A house club for a slot of a group: a name from the 16 house clubs and 14 launches from the cut, both from
 * (week, group, slot). House clubs are honest about being house clubs and play a fixed plan.
 */
export function houseSide(pool: Launch[], week: number, group: number, slot: number): Side {
  const r = stream("house", week, group, slot);
  const names = shuffle(HOUSE_NAMES, stream("house-names", week, group));
  const name = names[slot % names.length];
  const squad = shuffle(pool, r).slice(0, SQUAD);
  while (squad.length < SQUAD && pool.length) squad.push(pool[squad.length % pool.length]);
  const xi = autoXi(squad);
  return {
    name,
    kit: HOUSE_KIT[name] || [0x1aa7c9, 0x7fe3f5],
    squad,
    xi,
    tactic: TACTICS[hash32(name) % 3],
    captain: autoCaptain(squad, xi),
    form: [0, 0, 0, 0],
    wall: 0,
    mood: 1,
    house: true,
  };
}

/** A new club's first 14: drawn from the cut by the club's id, so no two clubs start alike. */
export function firstSquad(pool: Launch[], clubId: string): Launch[] {
  const sq = shuffle(pool, stream(clubId, "first")).slice(0, SQUAD);
  while (sq.length < SQUAD && pool.length) sq.push(pool[sq.length % pool.length]);
  return sq;
}

/** The scout's three this week: launches not in your squad, from the cut, picked by (club, week). One may be signed. */
export function scoutOffers(pool: Launch[], squad: Launch[], clubId: string, week: number): Launch[] {
  const own = new Set(squad.map((l) => l.t));
  const free = pool.filter((l) => !own.has(l.t));
  // one strong, one quick, one at random: a reason to look at each
  const r = stream(clubId, "scout", week);
  const byPow = free.slice().sort((a, b) => b.p - a.p || (a.t < b.t ? -1 : 1)).slice(0, 12);
  const byPac = free.slice().sort((a, b) => b.k - a.k || (a.t < b.t ? -1 : 1)).slice(0, 12);
  const out: Launch[] = [];
  const add = (l: Launch | undefined) => l && !out.some((o) => o.t === l.t) && out.push(l);
  add(pick(byPow, r));
  add(pick(byPac, r));
  for (const l of shuffle(free, r)) {
    if (out.length >= 3) break;
    add(l);
  }
  return out;
}

/** Fresh numbers for a squad from a newer cut: same launches, today's curve, trades and holders. */
export function refresh(squad: Launch[], pool: Launch[]): Launch[] {
  const by = new Map(pool.map((l) => [l.t, l]));
  return squad.map((l) => by.get(l.t) || l);
}

// ---------------------------------------------------------------- match record helpers
export function scorersOf(st: MatchState, home: Side, away: Side): { side: 0 | 1; s: string; min: number }[] {
  return st.moments.filter((m) => m.out === "goal").map((m) => ({ side: m.side, s: (m.side === 0 ? home : away).squad[m.who]?.s || "?", min: m.min }));
}
/** Checks a side sent by a client: sizes, indices, ranges. Returns the reason it is wrong, or null. */
export function sideProblem(s: Side): string | null {
  if (!s || typeof s !== "object") return "no side";
  if (!Array.isArray(s.squad) || s.squad.length !== SQUAD) return "squad must be 14";
  if (!Array.isArray(s.xi) || s.xi.length !== XI) return "line-up must be 11";
  if (new Set(s.xi).size !== XI || s.xi.some((q) => !Number.isInteger(q) || q < 0 || q >= SQUAD)) return "bad line-up";
  if (!TACTICS.includes(s.tactic)) return "bad tactic";
  if (!s.xi.includes(s.captain)) return "captain must play";
  if (!Array.isArray(s.form) || s.form.length !== 4 || s.form.some((f) => !Number.isInteger(f) || f < 0 || f > 3)) return "bad form";
  if (!Number.isInteger(s.wall) || s.wall < 0 || s.wall > 3) return "bad wall";
  if (!Number.isInteger(s.mood) || s.mood < 0 || s.mood > 3) return "bad mood";
  return null;
}
