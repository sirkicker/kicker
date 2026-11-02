// The whole game as a pure state machine. The browser and the server run the same code: the server re-runs a
// shared season from its action list to check the result. Nothing in here is random at play time: every choice
// the rival makes comes from the position on the table and the seed.
import { buildSquad, ghostSquad, rivalSquad, STAT, type Edition, type Launch } from "./data.js";
import {
  BOSS,
  BOSSES,
  CLUBS,
  HAUNT,
  COACHES,
  DRILLS,
  FINAL_BOSS,
  GOAL_X,
  LANES,
  MAX_COACHES,
  MAX_PLAYS,
  MOUTH,
  PLAY,
  PLAYS,
  RARITY_WEIGHT,
  RODS,
  ROUNDS,
  START_FANS,
  START_OFF,
  WIN_FANS,
  drillCost,
  styleOf,
  type DrillId,
  type StyleId,
} from "./content.js";
import { pickWeighted, shuffle, stream } from "./rng.js";

export type Side = 0 | 1;
/** A full season, or the Haunted table: three matches against ghost clubs with ghost rules. */
export type RunMode = "season" | "haunt";
export type Dir = -1 | 0 | 1;
export type Phase = "fixture" | "attack" | "defend" | "fulltime" | "room" | "over" | "won";

/** A kick: to rod `r` (a pass, further up the table) or r = 4 (a shot), drifting `d` lanes per rod crossed. */
export interface Kick {
  r: number;
  d: Dir;
}
export interface Ball {
  side: Side;
  rod: number;
  fig: number;
}

export type Action =
  | { t: "go" }
  | { t: "slide"; r: number; d: Dir }
  | { t: "kick"; r: number; d: Dir }
  | { t: "hold" }
  | { t: "use"; i: number }
  | { t: "swap"; a: number; b: number }
  | { t: "sell"; i: number }
  | { t: "collect" }
  | { t: "buy"; i: number }
  | { t: "next" }
  | { t: "back" };

export interface Owned {
  id: string;
  v: number; // a counter some coaches keep
  paid: number;
}

export interface Offer {
  kind: "coach" | "drill" | "play";
  id: string;
  cost: number;
  sold: boolean;
}

export interface Step {
  x: number;
  lane: number;
}
export interface Trace {
  steps: Step[];
  land: number;
  bounces: number;
  /** A pass that lands on one of your figures, or a shot that lands in the goal mouth. */
  legal: boolean;
  /** The receiving figure of a pass. */
  to: number;
  blockers: { rod: number; fig: number; x: number; lane: number }[];
}

/** What happened, in order, so the table can play it back. */
export type Ev =
  | { e: "slide"; side: Side; r: number; d: number; why: "you" | "react" | "mirror" | "ai" | "block" | "ghost" }
  | { e: "kick"; side: Side; rod: number; fig: number; kick: Kick; steps: Step[]; result: "goal" | "pass" | "blocked" | "kept"; at: { rod: number; fig: number } | null; beaten: number; to: number; drift: number }
  | { e: "goal"; side: Side; rating: number; style: string }
  | { e: "turnover"; to: Side; why: "touches" | "blocked" | "dead" }
  | { e: "kickoff"; side: Side }
  | { e: "play"; id: string }
  | { e: "end"; won: boolean; draw: boolean };

export interface FigInfo {
  t: string;
  s: string;
  c: string | null;
  u: number;
}
export interface Best {
  total: number;
  style: string;
  figs: FigInfo[];
}

export interface Match {
  kind: number; // 0 friendly, 1 league match, 2 boss club
  club: string;
  boss: string | null;
  level: number;
  target: number; // goals to win
  limit: number; // possessions each
  score: [number, number];
  poss: [number, number];
  off: number[][]; // rod offsets, [side][rod]
  ball: Ball;
  // your possession
  touches: number;
  free: number[]; // free slides per rod (Pace)
  freeAny: number;
  passes: number;
  chain: number[]; // squad slots that touched the ball this possession
  afterPass: boolean;
  gripUsed: number[];
  echoUsed: boolean;
  freekick: number;
  longball: boolean;
  dummy: number;
  // per match
  shots: number;
  saves: number;
  // their possession
  aiTouches: number;
  blockSlides: number;
  intent: { kind: "kick"; kick: Kick } | { kind: "slide"; r: number; d: Dir } | null;
  // the boss club's rule
  pulled: number;
  frozen: number;
  drift: number;
  pref: number[];
  fans: number;
  /** How the club plays. */
  style: StyleId;
  /** Haunted table only: the ghost rules. */
  ghost: Ghost | null;
}

/**
 * The Haunted table's ghost rules. `rod` is their phasing rod: it blocks only while `tick` (your touches this match)
 * is even. After each kick of yours, `drift` moves one of their rods a lane on its own; it is shown a touch before.
 */
export interface Ghost {
  rod: number;
  tick: number;
  drift: { r: number; d: Dir };
  n: number;
  due: boolean;
}

export interface Fulltime {
  rows: [string, number][];
  total: number;
}

export interface RunState {
  seed: string;
  mode: RunMode;
  edition: number;
  editionAt: number; // unix seconds
  squad: Launch[];
  round: number; // 1..8
  kind: number; // 0..2, the fixture inside the round
  bosses: string[]; // boss club per round
  clubs: string[]; // two rival names per round
  phase: Phase;
  fans: number;
  match: Match | null;
  coaches: Owned[];
  plays: string[];
  drills: Keyed<DrillId, number>;
  offers: Offer[];
  visit: number;
  fulltime: Fulltime | null;
  best: Best | null;
  cleared: number; // matches won
  draws: number; // level at the whistle, through without the win fans
  goalsFor: number;
  goalsAgainst: number;
  touchesTotal: number;
}

// ---------------------------------------------------------------- the table, as pure functions
export const colOf = (side: Side, rod: number) => (side === 0 ? RODS[rod].x : 9 - RODS[rod].x);
const AT: ({ side: Side; rod: number } | null)[] = Array.from({ length: 10 }, () => null);
for (const side of [0, 1] as Side[]) RODS.forEach((_, r) => (AT[colOf(side, r)] = { side, rod: r }));

/** The figure of rod `rod` standing in `lane`, or -1. */
export function figAt(rod: number, off: number, lane: number): number {
  const d = RODS[rod];
  const k = lane - off;
  if (k < 0) return -1;
  if (d.gap === 0) return k === 0 ? 0 : -1;
  return k % d.gap === 0 && k / d.gap < d.n ? k / d.gap : -1;
}
export const laneOf = (rod: number, off: number, fig: number) => off + fig * RODS[rod].gap;
export const lanesOf = (rod: number, off: number) => Array.from({ length: RODS[rod].n }, (_, i) => off + i * RODS[rod].gap);
export const slotOf = (rod: number, fig: number) => RODS[rod].slot + fig;
export const rodOfSlot = (slot: number) => (slot === 0 ? 0 : slot <= 2 ? 1 : slot <= 7 ? 2 : 3);

/** A lane off the table comes back off the side wall. Returns the lane and how many walls it met. */
export function reflect(raw: number): [number, number] {
  let b = 0;
  while (raw < 0 || raw >= LANES) {
    raw = raw < 0 ? -1 - raw : 2 * LANES - 1 - raw;
    b++;
  }
  return [raw, b];
}

/** The path of a kick, its landing, and every opposing figure standing in its way. */
export function trace(off: number[][], pulled: number[], side: Side, rod: number, lane: number, k: Kick, drift = 0): Trace {
  const x0 = colOf(side, rod);
  const dir = side === 0 ? 1 : -1;
  const goal = k.r === 4;
  const x1 = goal ? GOAL_X[1 - side] : colOf(side, k.r);
  const n = Math.abs(x1 - x0);
  const steps: Step[] = [];
  const blockers: Trace["blockers"] = [];
  let bounces = 0;
  for (let i = 1; i <= n; i++) {
    const [ln, b] = reflect(lane + drift + k.d * i);
    bounces = b;
    const x = x0 + dir * i;
    steps.push({ x, lane: ln });
    if (i < n) {
      const o = AT[x];
      if (o && o.side !== side && pulled[o.side] !== o.rod) {
        const f = figAt(o.rod, off[o.side][o.rod], ln);
        if (f >= 0) blockers.push({ rod: o.rod, fig: f, x, lane: ln });
      }
    }
  }
  const land = steps.length ? steps[steps.length - 1].lane : lane;
  let legal = false;
  let to = -1;
  if (goal) legal = land >= MOUTH[0] && land <= MOUTH[1];
  else if (k.r > rod && k.r <= 3 && pulled[side] !== k.r) {
    to = figAt(k.r, off[side][k.r], land);
    legal = to >= 0;
  }
  return { steps, land, bounces, legal, to, blockers };
}

/**
 * Power beats blockers in order, one point each. A keeper with Diamond Gloves is never beaten; a keeper in the final
 * (`keeperCost` 2) takes two points.
 */
export function resolveBlock(blockers: Trace["blockers"], power: number, keeperHolds: boolean, keeperCost = 1): { at: Trace["blockers"][number] | null; beaten: number } {
  let p = power;
  let beaten = 0;
  for (const b of blockers) {
    const cost = b.rod === 0 ? keeperCost : 1;
    if (p >= cost && !(keeperHolds && b.rod === 0)) {
      p -= cost;
      beaten++;
      continue;
    }
    return { at: b, beaten };
  }
  return { at: null, beaten };
}

export const KICKS: Kick[] = [];
for (const r of [1, 2, 3, 4]) for (const d of [0, -1, 1] as Dir[]) KICKS.push({ r, d });

/** How sharp the rival club plays, by its level (round, fixture and the final). */
export function aiParams(level: number, style: StyleId = "press") {
  return {
    style,
    react: level >= 10 ? 3 : level >= 3 ? 2 : 1, // slides after each of your touches
    passes: style === "press" ? true : style === "long" ? level >= 6 : level >= 2, // also shuts passing lanes, not only shots
    look: level >= 4, // also covers the lanes you are one slide from
    read: level >= 4, // picks its kick after your block slides, instead of committing first
    power: level >= 8 ? 1 : 0, // their shots go through one blocker
    deep: style === "long" && level >= 3 ? 1 : 0, // a long-range club's shots from deep go through one more
    touches: 4 + (level >= 3 ? 1 : 0) + (level >= 6 ? 1 : 0),
  };
}

export const GOALS_TO_WIN = 2;
export const POSSESSIONS = 6;
export const BASE_TOUCHES = 4;
export const BASE_BLOCKS = 2;
/** The final: how sharp the Closing Bell plays, and how much Power their keeper takes. */
export const FINAL_LEVEL = 10;
export const FINAL_KEEPER = 3;
/** Slides the rival makes to set its defence when you win the ball, before your first touch. */
export const SETUP_SLIDES = 3;

const has = (s: RunState, id: string) => s.coaches.some((j) => j.id === id);

export class Run {
  s: RunState;
  trail: Action[] = [];
  events: Ev[] = [];

  /** Rounds in this run: 8 for a season, 1 for the Haunted table. */
  readonly rounds: number;

  constructor(
    public ed: Edition,
    seed: string,
    public mode: RunMode = "season",
  ) {
    const squad = buildSquad(ed, seed);
    const haunt = mode === "haunt";
    this.rounds = haunt ? 1 : ROUNDS;
    const bag = shuffle(
      BOSSES.map((b) => b.id),
      stream(seed, "boss"),
    );
    const bosses: string[] = [];
    if (haunt) bosses.push(HAUNT.boss.id);
    else for (let r = 1; r <= ROUNDS; r++) bosses.push(r === ROUNDS ? FINAL_BOSS.id : bag[(r - 1) % bag.length]);
    const names = shuffle(CLUBS, stream(seed, "clubs"));
    const clubs: string[] = haunt ? HAUNT.clubs.slice() : [];
    if (!haunt) for (let i = 0; i < ROUNDS * 2; i++) clubs.push(names[i % names.length]);
    this.s = {
      seed,
      mode,
      edition: ed.id,
      editionAt: Math.floor(Date.parse(ed.at) / 1000) || ed.id * 3600,
      squad,
      round: 1,
      kind: 0,
      bosses,
      clubs,
      phase: "fixture",
      fans: START_FANS,
      match: null,
      coaches: [],
      plays: [],
      drills: { shoot: 0, pass: 0, feet: 0, block: 0 },
      offers: [],
      visit: 0,
      fulltime: null,
      best: null,
      cleared: 0,
      draws: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      touchesTotal: 0,
    };
  }

  get m(): Match {
    if (!this.s.match) throw new Error("no match on");
    return this.s.match;
  }

  // ------------------------------------------------------------ the fixture
  /** Who you meet in a fixture of this round. */
  clubName(kind = this.s.kind, round = this.s.round): string {
    if (kind === 2) return BOSS[this.s.bosses[round - 1]]?.name || FINAL_BOSS.name;
    return this.s.clubs[(round - 1) * 2 + kind];
  }
  bossOf(kind = this.s.kind, round = this.s.round): string | null {
    return kind === 2 ? this.s.bosses[round - 1] : null;
  }
  levelOf(kind = this.s.kind, round = this.s.round): number {
    // a boss club plays like the league side of its round; its rule is the difference. The final is the sharpest.
    if (this.mode === "haunt") return HAUNT.levels[kind];
    if (this.bossOf(kind, round) === "bell") return FINAL_LEVEL;
    return round - 1 + Math.min(kind, 1);
  }
  isFinal(kind = this.s.kind, round = this.s.round) {
    return round === this.rounds && kind === 2;
  }
  /** How a fixture's club plays. */
  styleOf(kind = this.s.kind, round = this.s.round): StyleId {
    return styleOf(this.clubName(kind, round), this.bossOf(kind, round));
  }
  ai() {
    const m = this.s.match;
    return aiParams(m ? m.level : this.levelOf(), m ? m.style : this.styleOf());
  }
  /** The launches on the other side of the table for a fixture (pictures only: they don't change how it plays). */
  rivals(kind = this.s.kind, round = this.s.round): Launch[] {
    return this.mode === "haunt" ? ghostSquad(this.ed, this.s.seed, this.s.squad, round, kind) : rivalSquad(this.ed, this.s.seed, this.s.squad, round, kind);
  }

  // ------------------------------------------------------------ figures and their numbers
  ageHours(l: Launch): number {
    return (this.s.editionAt - l.a) / 3600;
  }
  /** The top-curve launch on your rods (Valedictorian's pick). */
  topSlot(): number {
    let best = 0;
    this.s.squad.forEach((l, i) => {
      const b = this.s.squad[best];
      if (l.p > b.p || (l.p === b.p && l.t < b.t)) best = i;
    });
    return best;
  }
  /** Which coaches give a figure each stat ("base" when its own number does). Same rule the engine plays by. */
  statSources(l: Launch): Keyed<"power" | "pace" | "grip", string[]> {
    const s = this.s;
    const age = this.ageHours(l);
    const up = l.x !== null && l.x >= 1500;
    const out = { power: [] as string[], pace: [] as string[], grip: [] as string[] };
    if (l.p >= STAT.power.at) out.power.push("base");
    else if (has(s, "moonboy") && l.p >= 300) out.power.push("moonboy");
    if (has(s, "maxi0") && l.u === 0) out.power.push("maxi0");
    if (has(s, "maxi1") && l.u === 1) out.power.push("maxi1");
    if (has(s, "snob") && l.s.length <= 3) out.power.push("snob");
    if (has(s, "pumpchaser") && up) out.power.push("pumpchaser");
    if (l.k >= STAT.pace.at) out.pace.push("base");
    else if (has(s, "volume") && l.k >= 3) out.pace.push("volume");
    if (has(s, "maxi3") && l.u === 3) out.pace.push("maxi3");
    if (has(s, "early") && age < 6) out.pace.push("early");
    if (has(s, "pumpchaser") && up) out.pace.push("pumpchaser");
    if (l.h >= STAT.grip.at) out.grip.push("base");
    else if (has(s, "whale") && l.h >= 2) out.grip.push("whale");
    if (has(s, "maxi2") && l.u === 2) out.grip.push("maxi2");
    if (has(s, "dip") && l.x !== null && l.x < 0) out.grip.push("dip");
    if (has(s, "oldmoney") && age >= 24) out.grip.push("oldmoney");
    return out;
  }
  stats(slot: number): { power: boolean; pace: boolean; grip: boolean } {
    const src = this.statSources(this.s.squad[slot]);
    return { power: src.power.length > 0, pace: src.pace.length > 0, grip: src.grip.length > 0 };
  }

  /** The squad slots a coach works on right now: what lights up when you hover it. Same checks the match uses. */
  coachSlots(id: string): number[] {
    const s = this.s;
    const all = s.squad.map((_, i) => i);
    const q = s.squad;
    switch (id) {
      case "airdrop":
        return all.filter((i) => q[i].d);
      case "valedictorian":
        return [this.topSlot()];
      case "pile":
        return [3, 4, 5, 6, 7];
      case "purist":
        return q[8].u === q[9].u && q[9].u === q[10].u ? [8, 9, 10] : [];
      case "index":
        return new Set([q[1], q[2], q[8], q[9], q[10]].map((l) => l.u)).size === 4 ? [1, 2, 8, 9, 10] : [];
      case "potato":
        return all.filter((i) => this.stats(i).pace);
      case "diamond":
        return [0];
    }
    return all.filter((i) => {
      const src = this.statSources(q[i]);
      return src.power.includes(id) || src.pace.includes(id) || src.grip.includes(id);
    });
  }

  baseTouches(first: boolean): number {
    const s = this.s;
    const q = s.squad;
    let n = BASE_TOUCHES;
    if (has(s, "pockets")) n++;
    if (has(s, "purist") && q[8].u === q[9].u && q[9].u === q[10].u) n++;
    if (has(s, "index") && new Set([q[1], q[2], q[8], q[9], q[10]].map((l) => l.u)).size === 4) n++;
    if (has(s, "bonding")) n += Math.min(2, Math.floor(s.cleared / 4));
    if (has(s, "front") && first) n += 2;
    if (s.match?.boss === "slip") n--;
    return Math.max(1, n);
  }
  blockBase(): number {
    return BASE_BLOCKS + this.s.drills.block;
  }

  /** Can your rod move that way right now (boss rules included)? */
  canMove(side: Side, r: number, d: number, off = this.m.off): boolean {
    if (d !== -1 && d !== 1) return false;
    const m = this.m;
    if (side === 0) {
      if (m.pulled === r || m.frozen === r) return false;
      if (r === 0 && m.boss === "lockup") return false;
    }
    const o = off[side][r] + d;
    return o >= RODS[r].min && o <= RODS[r].max;
  }
  /** What a slide of your rod costs in touches now: 0 when a free slide pays for it. */
  slideCost(r: number): number {
    const m = this.m;
    if (m.free[r] > 0 || m.freeAny > 0) return 0;
    return m.boss === "gasspike" ? 2 : 1;
  }

  /** Their phasing rod while it is faded (lets the ball through), or -1. Only ever while you have the ball. */
  fadedRod(): number {
    const g = this.s.match?.ghost;
    return g && this.s.phase === "attack" && g.tick % 2 === 1 ? g.rod : -1;
  }
  /** Where the poltergeist moves next: the telegraphed rod, turned back at its end stop. */
  driftNow(): { r: number; d: Dir } | null {
    const g = this.s.match?.ghost;
    if (!g) return null;
    const { r, d } = g.drift;
    if (this.canMove(1, r, d)) return { r, d };
    if (this.canMove(1, r, -d as Dir)) return { r, d: -d as Dir };
    return null;
  }
  pulledArr(): number[] {
    return [this.m.pulled, this.fadedRod()];
  }
  ballLane(off = this.m.off, ball = this.m.ball): number {
    return laneOf(ball.rod, off[ball.side][ball.rod], ball.fig);
  }

  /** Power on a shot of yours, from every source, before it is taken. */
  shotPower(slot: number, rod: number, tr: Trace, touchesLeft: number, afterPass: boolean): number {
    const s = this.s;
    const m = this.m;
    // power is an attacker's thing; Pile-in Party lends it to the midfield. From further back, find a clean lane.
    if (rod < 2 || (rod === 2 && !has(s, "pile"))) return 0;
    let p = this.stats(slot).power ? 1 : 0;
    if (m.shots < s.drills.shoot) p++;
    if (m.freekick > 0) p++;
    if (has(s, "pile") && rod === 2) p++;
    if (has(s, "climber") && tr.bounces > 0) p++;
    if (has(s, "copium") && touchesLeft === 1) p++;
    if (has(s, "sniper") && afterPass) p++;
    if (has(s, "valedictorian") && slot === this.topSlot()) p = Math.max(p, 2);
    return p;
  }
  /** Vibe Check: a figure needs a stat to shoot. */
  mayShoot(slot: number): boolean {
    if (this.m.boss !== "vcheck") return true;
    const st = this.stats(slot);
    return st.power || st.pace || st.grip;
  }

  /** Every kick you can make from the ball now, with its path and how it would end. */
  myKicks(off = this.m.off, ball = this.m.ball, touches = this.m.touches, afterPass = this.m.afterPass) {
    const m = this.m;
    const lane = laneOf(ball.rod, off[0][ball.rod], ball.fig);
    const slot = slotOf(ball.rod, ball.fig);
    const out: { kick: Kick; tr: Trace; power: number; open: boolean; beaten: number; at: Trace["blockers"][number] | null }[] = [];
    for (const kick of KICKS) {
      if (kick.r !== 4 && kick.r <= ball.rod) continue;
      const tr = trace(off, this.pulledArr(), 0, ball.rod, lane, kick, kick.r === 4 ? m.drift : 0);
      if (!tr.legal) continue;
      if (kick.r === 4 && !this.mayShoot(slot)) continue;
      const power = kick.r === 4 ? this.shotPower(slot, ball.rod, tr, touches, afterPass) : 0;
      const ghost = kick.r !== 4 && m.longball;
      const res = ghost ? { at: null, beaten: 0 } : resolveBlock(tr.blockers, power, false, m.boss === "bell" ? FINAL_KEEPER : 1);
      out.push({ kick, tr, power, open: !res.at, beaten: res.beaten, at: res.at });
    }
    return out;
  }

  /** How dangerous your ball is, as the rival reads it. Higher is worse for them. */
  danger(off: number[][], ball = this.m.ball, deep = true): number {
    const m = this.m;
    let shots = 0;
    let pass = 0;
    const passes = this.ai().passes;
    for (const o of this.myKicks(off, ball, Math.max(2, m.touches), m.afterPass)) {
      if (!o.open) continue;
      if (o.kick.r === 4) shots++;
      else if (passes) {
        let v = 8 * (o.kick.r - ball.rod);
        if (deep && this.myKicks(off, { side: 0, rod: o.kick.r, fig: o.tr.to }, 2, true).some((k) => k.open && k.kick.r === 4)) v += 30;
        pass = Math.max(pass, v);
      }
    }
    const style = this.ai().style;
    let v = shots ? (style === "bus" ? 130 : 100) + (style === "bus" ? 30 : 25) * (shots - 1) : 0;
    v += style === "press" ? Math.round(pass * 1.5) : pass;
    if (deep && this.ai().look) {
      for (const d of [-1, 1]) {
        if (!this.canMove(0, ball.rod, d, off)) continue;
        const o2 = [off[0].slice(), off[1]];
        o2[0][ball.rod] += d;
        const n = this.myKicks(o2, ball, 2, false).filter((k) => k.open && k.kick.r === 4).length;
        v += 18 * Math.min(2, n);
      }
    }
    return v;
  }

  /** The rival's best single slide against your ball, or null to stay put. Deterministic: ties keep the seed's order. */
  bestDefence(off: number[][], ball = this.m.ball): { r: number; d: Dir } | null {
    const m = this.m;
    let best = this.danger(off, ball);
    let mv: { r: number; d: Dir } | null = null;
    for (const r of m.pref) {
      for (const d of [-1, 1] as Dir[]) {
        if (!this.canMove(1, r, d, off)) continue;
        const o2 = [off[0], off[1].slice()];
        o2[1][r] += d;
        const v = this.danger(o2, ball);
        if (v < best - 1e-9) {
          best = v;
          mv = { r, d };
        }
      }
    }
    return mv;
  }

  /** Where the rival's rods end up after it reacts to the position `off`. */
  /** Slides the rival makes after a touch: its level, plus one at the back for a club parking the bus once your ball reaches your attack. */
  reactCount(ball = this.m.ball): number {
    const p = this.ai();
    return p.react + (p.style === "bus" && ball.side === 0 && ball.rod === 3 ? 1 : 0);
  }
  reactTo(off: number[][], ball = this.m.ball, n = this.reactCount(ball)): { off: number[][]; moves: { r: number; d: Dir }[] } {
    const moves: { r: number; d: Dir }[] = [];
    let cur = off;
    for (let k = 0; k < n; k++) {
      const mv = this.bestDefence(cur, ball);
      if (!mv) break;
      cur = [cur[0], cur[1].slice()];
      cur[1][mv.r] += mv.d;
      moves.push(mv);
    }
    return { off: cur, moves };
  }

  // ------------------------------------------------------------ the rival with the ball
  /** The rival's kicks from its ball, against your figures where they stand in `off`. */
  theirKicks(off = this.m.off, ball = this.m.ball) {
    const lane = laneOf(ball.rod, off[1][ball.rod], ball.fig);
    const p = this.ai();
    const keeperHolds = has(this.s, "diamond");
    const out: { kick: Kick; tr: Trace; open: boolean; at: Trace["blockers"][number] | null; beaten: number; value: number }[] = [];
    for (const kick of KICKS) {
      if (kick.r !== 4 && kick.r <= ball.rod) continue;
      // a club that parks the bus only shoots from midfield up
      if (kick.r === 4 && p.style === "bus" && ball.rod < 2) continue;
      const tr = trace(off, this.pulledArr(), 1, ball.rod, lane, kick);
      if (!tr.legal) continue;
      const res = resolveBlock(tr.blockers, kick.r === 4 ? this.theirPower(ball.rod) : 0, keeperHolds);
      out.push({ kick, tr, open: !res.at, at: res.at, beaten: res.beaten, value: 0 });
    }
    for (const o of out) {
      if (!o.open) continue;
      if (o.kick.r === 4) o.value = 100;
      else {
        o.value = 10 * (o.kick.r - ball.rod);
        if (this.theirKicks2(off, { side: 1, rod: o.kick.r, fig: o.tr.to })) o.value += 30;
      }
    }
    return out;
  }
  /** Power on the rival's shot from a rod: its level, plus one from deep for a long-range club. */
  theirPower(rod: number): number {
    const p = this.ai();
    return p.power + (rod <= 1 ? p.deep : 0);
  }
  private theirKicks2(off: number[][], ball: Ball): boolean {
    const lane = laneOf(ball.rod, off[1][ball.rod], ball.fig);
    if (this.ai().style === "bus" && ball.rod < 2) return false;
    const pw = this.theirPower(ball.rod);
    const keeperHolds = has(this.s, "diamond");
    const tr0 = (d: Dir) => trace(off, this.pulledArr(), 1, ball.rod, lane, { r: 4, d });
    for (const d of [0, -1, 1] as Dir[]) {
      const tr = tr0(d);
      if (tr.legal && !resolveBlock(tr.blockers, pw, keeperHolds).at) return true;
    }
    return false;
  }
  /** The rival's plan with the ball: its best open kick, or the slide that opens the most. */
  aiChoose(off = this.m.off): NonNullable<Match["intent"]> {
    const m = this.m;
    const ks = this.theirKicks(off).filter((k) => k.open);
    if (ks.length) {
      let best = ks[0];
      for (const k of ks) if (k.value > best.value) best = k;
      return { kind: "kick", kick: best.kick };
    }
    let pick: { r: number; d: Dir } | null = null;
    let top = -1;
    for (const r of [m.ball.rod, ...m.pref.filter((x) => x !== m.ball.rod)]) {
      if (r < m.ball.rod) continue;
      for (const d of [-1, 1] as Dir[]) {
        if (!this.canMove(1, r, d, off)) continue;
        const o2 = [off[0], off[1].slice()];
        o2[1][r] += d;
        const all = this.theirKicks(o2);
        const v = Math.max(0, ...all.map((k) => k.value)) + all.length * 0.5;
        if (v > top) {
          top = v;
          pick = { r, d };
        }
      }
    }
    if (!pick) {
      // boxed in: shuffle the keeper a lane
      const d: Dir = this.canMove(1, 0, 1, off) ? 1 : -1;
      pick = { r: 0, d };
    }
    return { kind: "slide", ...pick };
  }
  /** The kicks the rival threatens right now: all of them when it reads you, only its call when it commits. */
  threats() {
    const m = this.m;
    if (this.s.phase !== "defend") return [];
    const ks = this.theirKicks().filter((k) => k.open);
    if (this.ai().read) return ks;
    const it = m.intent;
    if (it && it.kind === "kick") {
      const k = this.theirKicks().find((x) => x.kick.r === it.kick.r && x.kick.d === it.kick.d);
      return k ? [k] : [];
    }
    return [];
  }

  // ------------------------------------------------------------ possession
  private startPossession(side: Side, rod: number, fig: number, why: "kickoff" | "won" | "lost" | "dead") {
    const s = this.s;
    const m = this.m;
    if (m.poss[0] + m.poss[1] >= 2 * m.limit) {
      this.endMatch(m.score[0] > m.score[1]);
      return;
    }
    m.poss[side]++;
    m.ball = { side, rod, fig };
    if (side === 0) {
      s.phase = "attack";
      const first = m.poss[0] === 1;
      m.touches = this.baseTouches(first);
      m.free = RODS.map((d, r) => {
        let pace = false;
        for (let f = 0; f < d.n; f++) if (this.stats(slotOf(r, f)).pace) pace = true;
        return pace && m.pulled !== r ? (has(s, "potato") ? 2 : 1) : 0;
      });
      m.freeAny = s.drills.feet + (has(s, "gas") ? 1 : 0);
      m.passes = 0;
      m.chain = [slotOf(rod, fig)];
      m.afterPass = false;
      m.gripUsed = [];
      m.echoUsed = false;
      m.freekick = 0;
      m.longball = false;
      m.dummy = 0;
      // the rival gets its defence set before your first touch
      this.react(SETUP_SLIDES + (this.ai().style === "press" ? 1 : 0));
    } else {
      s.phase = "defend";
      this.settleGhost();
      m.aiTouches = this.ai().touches;
      m.blockSlides = this.blockBase() + (why === "lost" && has(s, "paper") ? 1 : 0);
      m.intent = this.aiChoose();
    }
  }

  private turnover(to: Side, why: "touches" | "blocked" | "dead") {
    this.events.push({ e: "turnover", to, why });
    // a dead ball goes to the keeper of the side that gets it
    this.startPossession(to, 0, 0, to === 1 ? "lost" : "dead");
  }

  private scored(side: Side) {
    const m = this.m;
    m.score[side]++;
    if (side === 0) this.s.goalsFor++;
    else this.s.goalsAgainst++;
    if (m.score[side] >= m.target) {
      this.endMatch(side === 0);
      return;
    }
    const other: Side = side === 0 ? 1 : 0;
    this.events.push({ e: "kickoff", side: other });
    this.startPossession(other, 2, 2, "kickoff");
  }

  /** Full time. A friendly or a league match may end level: you go through without the win fans. A boss club has to be beaten. */
  private endMatch(won: boolean) {
    const s = this.s;
    const m = this.m;
    const draw = !won && m.score[0] === m.score[1] && m.kind < 2;
    this.events.push({ e: "end", won, draw });
    if (!won && !draw) {
      s.phase = "over";
      return;
    }
    if (won) s.cleared++;
    else s.draws++;
    const kind = ["friendly", "league match", "boss club"][m.kind];
    const rows: [string, number][] = [won ? [`Win (${kind})`, WIN_FANS[m.kind]] : [`Draw (${kind}): through, no win fans`, 0]];
    if (m.fans) rows.push(["Goals and balls won", m.fans]);
    if (won && has(s, "mm")) rows.push(["Market Maker", 3]);
    const total = rows.reduce((n, r) => n + r[1], 0);
    s.fulltime = { rows, total };
    if (this.isFinal(m.kind)) {
      s.fans += total;
      s.phase = "won";
      return;
    }
    s.phase = "fulltime";
  }

  /** How good a goal was. Skill only: passes, angles, walls, blockers beaten, distance, touches to spare. */
  private rate(tr: Trace, beaten: number, rod: number, kick: Kick, touchesLeft: number): { total: number; style: string } {
    const m = this.m;
    let v = 100 + 50 * m.passes + (kick.d !== 0 ? 75 : 0) + 150 * tr.bounces + 200 * beaten + (rod <= 2 ? 120 : 0) + 40 * touchesLeft;
    v *= (1 + 0.25 * (this.s.round - 1)) * (m.kind === 2 ? 1.5 : 1);
    const style =
      beaten > 0
        ? "Power drive"
        : tr.bounces > 0
          ? "Bank shot"
          : rod <= 2
            ? "Long range"
            : m.passes >= 2
              ? "Team move"
              : m.afterPass
                ? "One-touch finish"
                : kick.d !== 0
                  ? "Angled finish"
                  : "Tap-in";
    return { total: Math.round(v), style };
  }

  // ------------------------------------------------------------ shelf
  private makeOffers(): Offer[] {
    const s = this.s;
    const rnd = stream(s.seed, "room", s.visit);
    const out: Offer[] = [];
    const taken = new Set(s.coaches.map((j) => j.id));
    for (let k = 0; k < 2; k++) {
      const pool = COACHES.filter((j) => !taken.has(j.id));
      const j = pickWeighted(pool, (x) => RARITY_WEIGHT[x.rarity], rnd);
      if (!j) break;
      taken.add(j.id);
      out.push({ kind: "coach", id: j.id, cost: j.cost, sold: false });
    }
    const open = DRILLS.filter((d) => s.drills[d.id] < d.max);
    if (open.length) {
      const d = open[Math.floor(rnd() * open.length)];
      out.push({ kind: "drill", id: d.id, cost: drillCost(s.drills[d.id]), sold: false });
    }
    const pl = PLAYS[Math.floor(rnd() * PLAYS.length)];
    out.push({ kind: "play", id: pl.id, cost: pl.cost, sold: false });
    return out;
  }
  sellValue(o: Owned): number {
    return Math.max(1, Math.floor(o.paid / 2));
  }

  // ------------------------------------------------------------ actions
  apply(a: Action): void {
    const s = this.s;
    this.events = [];
    const fail = (msg: string): never => {
      throw new Error(msg);
    };
    switch (a.t) {
      case "go": {
        if (s.phase !== "fixture") fail("not before a match");
        const boss = this.bossOf();
        const level = this.levelOf();
        const rnd = stream(s.seed, "match", s.round, s.kind);
        const final = boss === "bell";
        s.match = {
          kind: s.kind,
          club: this.clubName(),
          boss,
          level,
          target: final ? 3 : GOALS_TO_WIN,
          limit: final ? POSSESSIONS + 4 : POSSESSIONS,
          score: [0, 0],
          poss: [0, 0],
          off: START_OFF.map((o) => o.slice()),
          ball: { side: 0, rod: 2, fig: 2 },
          touches: 0,
          free: [0, 0, 0, 0],
          freeAny: 0,
          passes: 0,
          chain: [],
          afterPass: false,
          gripUsed: [],
          echoUsed: false,
          freekick: 0,
          longball: false,
          dummy: 0,
          shots: 0,
          saves: 0,
          aiTouches: 0,
          blockSlides: 0,
          intent: null,
          pulled: boss === "rug" ? 1 : -1,
          frozen: boss === "halt" ? [1, 2][Math.floor(rnd() * 2)] : -1,
          drift: boss === "depeg" ? (rnd() < 0.5 ? -1 : 1) : 0,
          pref: shuffle([0, 1, 2, 3], rnd),
          fans: 0,
          style: this.styleOf(),
          ghost: null,
        };
        if (this.mode === "haunt") {
          const g = stream(s.seed, "phasing", s.round, s.kind);
          s.match.ghost = { rod: [1, 2, 3][Math.floor(g() * 3)], tick: 0, drift: this.nextDrift(0), n: 0, due: false };
        }
        this.events.push({ e: "kickoff", side: 0 });
        this.startPossession(0, 2, 2, "kickoff");
        break;
      }
      case "slide": {
        const m = this.m;
        const r = a.r;
        if (!(r >= 0 && r <= 3)) fail("no such rod");
        if (!this.canMove(0, r, a.d)) fail("that rod can't go there");
        if (s.phase === "attack") {
          const cost = this.slideCost(r);
          if (cost > m.touches) fail("not enough touches");
          if (m.free[r] > 0) m.free[r]--;
          else if (m.freeAny > 0) m.freeAny--;
          else m.touches -= cost;
          if (cost) s.touchesTotal++;
          m.off[0][r] += a.d;
          m.afterPass = false;
          if (m.ghost) m.ghost.tick++;
          this.events.push({ e: "slide", side: 0, r, d: a.d, why: "you" });
          if (m.boss === "wash") {
            const facing = [0, 3, 2, 1][r];
            if (this.canMove(1, facing, a.d)) {
              m.off[1][facing] += a.d;
              this.events.push({ e: "slide", side: 1, r: facing, d: a.d, why: "mirror" });
            }
          }
          if (m.touches <= 0) this.turnover(1, "touches");
          else {
            this.react();
            this.afterTouch();
          }
        } else if (s.phase === "defend") {
          if (m.blockSlides <= 0) fail("no block slides left: hold");
          m.blockSlides--;
          m.off[0][r] += a.d;
          this.events.push({ e: "slide", side: 0, r, d: a.d, why: "block" });
        } else fail("not during a match");
        break;
      }
      case "kick": {
        if (s.phase !== "attack") fail("you don't have the ball");
        const m = this.m;
        const kick: Kick = { r: a.r, d: a.d };
        if (!(kick.r >= 1 && kick.r <= 4) || ![-1, 0, 1].includes(kick.d)) fail("no such kick");
        const ball = m.ball;
        const slot = slotOf(ball.rod, ball.fig);
        const isShot = kick.r === 4;
        if (!isShot && kick.r <= ball.rod) fail("passes go forward");
        let tr = trace(m.off, this.pulledArr(), 0, ball.rod, this.ballLane(), kick, isShot ? m.drift : 0);
        if (!tr.legal) fail(isShot ? "that shot misses the goal" : "no figure of yours there");
        if (isShot && !this.mayShoot(slot)) fail("Vibe Check: this figure has no stat to shoot with");
        const free = !isShot && kick.d === 0 && has(s, "echo") && !m.echoUsed;
        const touchesBefore = m.touches;
        if (free) m.echoUsed = true;
        else m.touches--;
        s.touchesTotal++;
        if (!isShot && m.boss === "jam") {
          // the pass lands late: they get their reaction before the ball arrives
          this.react();
          tr = trace(m.off, this.pulledArr(), 0, ball.rod, this.ballLane(), kick, 0);
        }
        const power = isShot ? this.shotPower(slot, ball.rod, tr, touchesBefore, m.afterPass) : 0;
        const res = !isShot && m.longball ? { at: null, beaten: 0 } : resolveBlock(tr.blockers, power, false, m.boss === "bell" ? FINAL_KEEPER : 1);
        if (m.ghost) {
          m.ghost.tick++;
          m.ghost.due = true;
        }
        if (isShot) {
          m.shots++;
          if (m.freekick > 0) m.freekick--;
        } else if (m.longball) m.longball = false;
        if (res.at) {
          let kept = false;
          if (!isShot) {
            if (this.stats(slot).grip && !m.gripUsed.includes(slot)) {
              m.gripUsed.push(slot);
              kept = true;
            } else if (m.saves < s.drills.pass) {
              m.saves++;
              kept = true;
            }
          }
          this.events.push({ e: "kick", side: 0, rod: ball.rod, fig: ball.fig, kick, steps: tr.steps, result: kept ? "kept" : "blocked", at: { rod: res.at.rod, fig: res.at.fig }, beaten: res.beaten, to: -1, drift: isShot ? m.drift : 0 });
          if (kept) {
            m.afterPass = false;
            if (m.touches <= 0) this.turnover(1, "touches");
            else {
              if (m.boss !== "jam") this.react();
              this.afterTouch();
              if (s.phase === "attack") this.settleGhost();
            }
          } else {
            this.events.push({ e: "turnover", to: 1, why: "blocked" });
            this.startPossession(1, res.at.rod, res.at.fig, "lost");
          }
          break;
        }
        this.events.push({ e: "kick", side: 0, rod: ball.rod, fig: ball.fig, kick, steps: tr.steps, result: isShot ? "goal" : "pass", at: null, beaten: res.beaten, to: tr.to, drift: isShot ? m.drift : 0 });
        if (isShot) {
          const r = this.rate(tr, res.beaten, ball.rod, kick, m.touches);
          m.fans += 1 + (has(s, "ape") ? 1 : 0) + (has(s, "airdrop") && s.squad[slot].d ? 2 : 0);
          this.events.push({ e: "goal", side: 0, rating: r.total, style: r.style });
          if (!s.best || r.total > s.best.total) {
            const slots = [...new Set([...m.chain, slot])];
            for (const extra of [8, 9, 10, 3, 4, 5, 6, 7]) if (slots.length < 5 && !slots.includes(extra)) slots.push(extra);
            s.best = {
              total: r.total,
              style: r.style,
              figs: slots.slice(0, 5).map((i) => {
                const l = s.squad[i];
                return { t: l.t, s: l.s, c: l.c, u: l.u };
              }),
            };
          }
          this.scored(0);
          break;
        }
        m.ball = { side: 0, rod: kick.r, fig: tr.to };
        m.passes++;
        m.chain.push(slotOf(kick.r, tr.to));
        m.afterPass = true;
        if (m.touches <= 0) this.turnover(1, "touches");
        else {
          if (m.boss !== "jam") this.react();
          this.afterTouch();
          if (s.phase === "attack") this.settleGhost();
        }
        break;
      }
      case "hold": {
        if (s.phase !== "defend") fail("they don't have the ball");
        const m = this.m;
        const p = this.ai();
        const plan = p.read || !m.intent ? this.aiChoose() : m.intent;
        m.aiTouches--;
        if (plan.kind === "slide") {
          if (this.canMove(1, plan.r, plan.d)) m.off[1][plan.r] += plan.d;
          this.events.push({ e: "slide", side: 1, r: plan.r, d: plan.d, why: "ai" });
        } else {
          const ball = m.ball;
          const tr = trace(m.off, this.pulledArr(), 1, ball.rod, this.ballLane(), plan.kick);
          if (!tr.legal) {
            // a plan always lands where it aimed (your slides never move their figures); a dead ball if it ever doesn't
            this.turnover(0, "dead");
            break;
          }
          const res = resolveBlock(tr.blockers, plan.kick.r === 4 ? this.theirPower(ball.rod) : 0, has(s, "diamond"));
          if (res.at) {
            this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "blocked", at: { rod: res.at.rod, fig: res.at.fig }, beaten: res.beaten, to: -1, drift: 0 });
            if (has(s, "bag")) m.fans++;
            this.events.push({ e: "turnover", to: 0, why: "blocked" });
            this.startPossession(0, res.at.rod, res.at.fig, "won");
            break;
          }
          if (plan.kick.r === 4) {
            this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "goal", at: null, beaten: res.beaten, to: -1, drift: 0 });
            this.events.push({ e: "goal", side: 1, rating: 0, style: "" });
            this.scored(1);
            break;
          }
          this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "pass", at: null, beaten: 0, to: tr.to, drift: 0 });
          m.ball = { side: 1, rod: plan.kick.r, fig: tr.to };
        }
        if (m.aiTouches <= 0) {
          this.turnover(0, "dead");
          break;
        }
        m.intent = this.aiChoose();
        break;
      }
      case "use": {
        const id = s.plays[a.i];
        if (!id) fail("no such set piece");
        const pl = PLAY[id];
        if (pl.when === "attack" && s.phase !== "attack") fail("use it while you have the ball");
        if (pl.when === "defend" && s.phase !== "defend") fail("use it while they have the ball");
        if (pl.when === "any" && (s.phase === "over" || s.phase === "won")) fail("the season is over");
        const m = s.match;
        if (id === "freekick") m!.freekick++;
        else if (id === "onetwo") m!.touches += 2;
        else if (id === "dummy") m!.dummy += 2;
        else if (id === "longball") m!.longball = true;
        else if (id === "bus") m!.blockSlides += 3;
        else if (id === "tickets") s.fans += Math.min(10, Math.max(0, s.fans));
        s.plays.splice(a.i, 1);
        this.events.push({ e: "play", id });
        break;
      }
      case "swap": {
        if (s.phase !== "fixture" && s.phase !== "room") fail("swap figures before a match");
        const { a: i, b: j } = a;
        if (!(i >= 0 && i < s.squad.length && j >= 0 && j < s.squad.length) || i === j) fail("no such figures");
        [s.squad[i], s.squad[j]] = [s.squad[j], s.squad[i]];
        break;
      }
      case "sell": {
        if (s.phase !== "fixture" && s.phase !== "room") fail("let a coach go before a match");
        const j = s.coaches[a.i];
        if (!j) fail("no such coach");
        s.fans += this.sellValue(j);
        s.coaches.splice(a.i, 1);
        break;
      }
      case "collect": {
        const ft = s.fulltime;
        if (s.phase !== "fulltime" || !ft) fail("nothing to collect");
        s.fans += ft!.total;
        s.fulltime = null;
        s.match = null;
        s.kind++;
        if (s.kind > 2) {
          s.kind = 0;
          s.round++;
        }
        s.phase = "room";
        s.visit++;
        s.offers = this.makeOffers();
        break;
      }
      case "buy": {
        if (s.phase !== "room") fail("the dressing room is closed");
        const o = s.offers[a.i];
        if (!o || o.sold) fail("not on the shelf");
        if (s.fans < o.cost) fail("not enough fans");
        if (o.kind === "coach") {
          if (s.coaches.length >= MAX_COACHES) fail("coach slots full");
          s.coaches.push({ id: o.id, v: 0, paid: o.cost });
        } else if (o.kind === "drill") {
          const d = DRILLS.find((x) => x.id === o.id)!;
          if (s.drills[d.id] >= d.max) fail("that drill is maxed");
          s.drills[d.id]++;
        } else {
          if (s.plays.length >= MAX_PLAYS) fail("set piece slots full");
          s.plays.push(o.id);
        }
        s.fans -= o.cost;
        o.sold = true;
        break;
      }
      case "next": {
        if (s.phase !== "room") fail("the dressing room is closed");
        // the shelf stays as it was: "back" reopens the dressing room before kick-off
        s.phase = "fixture";
        break;
      }
      case "back": {
        if (s.phase !== "fixture" || s.visit === 0) fail("no dressing room before your first match");
        s.phase = "room";
        break;
      }
      default:
        fail("unknown action");
    }
    this.trail.push(a);
  }

  /** True while you have something legal to do with the ball: an affordable slide or a kick that lands. */
  canAct(): boolean {
    const m = this.m;
    for (let r = 0; r < 4; r++) for (const d of [-1, 1]) if (this.canMove(0, r, d) && this.slideCost(r) <= m.touches) return true;
    return this.myKicks().length > 0;
  }

  /** Ends your possession when nothing legal is left (out of touches, or Gas Spike with one touch and no kick). */
  private afterTouch() {
    const m = this.m;
    if (this.s.phase !== "attack") return;
    if (m.touches <= 0 || !this.canAct()) this.turnover(1, "touches");
  }

  /** The rival reacts to your touch (unless a Dummy Run has it frozen). */
  private react(n = this.reactCount()) {
    const m = this.m;
    if (m.dummy > 0) {
      m.dummy--;
      return;
    }
    const { off, moves } = this.reactTo(m.off, m.ball, n);
    m.off = off.map((o) => o.slice());
    for (const mv of moves) this.events.push({ e: "slide", side: 1, r: mv.r, d: mv.d, why: "react" });
  }

  /** The poltergeist's next drift, fixed by the seed: rod and way. */
  private nextDrift(n: number): { r: number; d: Dir } {
    const s = this.s;
    const rnd = stream(s.seed, "polter", s.round, s.kind, n);
    return { r: Math.floor(rnd() * 4), d: rnd() < 0.5 ? -1 : 1 };
  }
  /** After one of your kicks: the telegraphed rod drifts, and the next drift is set. */
  private settleGhost() {
    const m = this.s.match;
    const g = m?.ghost;
    if (!m || !g || !g.due) return;
    g.due = false;
    const mv = this.driftNow();
    if (mv) {
      m.off[1][mv.r] += mv.d;
      this.events.push({ e: "slide", side: 1, r: mv.r, d: mv.d, why: "ghost" });
    }
    g.n++;
    g.drift = this.nextDrift(g.n);
  }

  summary() {
    const s = this.s;
    return {
      seed: s.seed,
      mode: s.mode,
      edition: s.edition,
      round: s.round,
      fixture: s.kind,
      cleared: s.cleared,
      draws: s.draws,
      won: s.phase === "won",
      over: s.phase === "over" || s.phase === "won",
      best: s.best,
      goals: s.goalsFor,
      against: s.goalsAgainst,
      fans: s.fans,
    };
  }
}

/** Re-runs an action list; throws on the first illegal action. */
export function rerun(ed: Edition, seed: string, actions: Action[], mode: RunMode = "season"): Run {
  const r = new Run(ed, seed, mode);
  for (const a of actions) r.apply(a);
  return r;
}

// ------------------------------------------------------------ compact action trail
/** A Haunted table trail starts with an "H" token, so a trail can't be posted under the other mode. */
export function encodeTrail(actions: Action[], mode: RunMode = "season"): string {
  return (mode === "haunt" ? (actions.length ? "H_" : "H") : "") + encodeTrail0(actions);
}
/** Splits a posted trail into its mode and actions. Throws on anything malformed. */
export function parseTrail(str: string): { mode: RunMode; actions: Action[] } {
  if (str === "H") return { mode: "haunt", actions: [] };
  if (str.startsWith("H_")) return { mode: "haunt", actions: decodeTrail(str.slice(2)) };
  return { mode: "season", actions: decodeTrail(str) };
}
function encodeTrail0(actions: Action[]): string {
  return actions
    .map((a) => {
      switch (a.t) {
        case "go":
          return "g";
        case "slide":
          return `s${a.r}.${a.d + 1}`;
        case "kick":
          return `k${a.r}.${a.d + 1}`;
        case "hold":
          return "h";
        case "use":
          return "u" + a.i;
        case "swap":
          return `w${a.a}.${a.b}`;
        case "sell":
          return "x" + a.i;
        case "collect":
          return "c";
        case "buy":
          return "b" + a.i;
        case "next":
          return "n";
        case "back":
          return "v";
      }
    })
    .join("_");
}

export function decodeTrail(str: string): Action[] {
  if (!str) return [];
  return str.split("_").map((tok): Action => {
    const k = tok[0];
    const nums = tok.length > 1 ? tok.slice(1).split(".").map((x) => Number(x)) : [];
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 100)) throw new Error("bad trail");
    const two = () => {
      if (nums.length !== 2) throw new Error("bad trail");
      return nums;
    };
    const one = () => {
      if (nums.length !== 1) throw new Error("bad trail");
      return nums[0];
    };
    const none = () => {
      if (nums.length) throw new Error("bad trail");
    };
    switch (k) {
      case "g":
        none();
        return { t: "go" };
      case "s": {
        const [r, d] = two();
        if (d !== 0 && d !== 2) throw new Error("bad trail");
        return { t: "slide", r, d: (d - 1) as Dir };
      }
      case "k": {
        const [r, d] = two();
        if (d > 2) throw new Error("bad trail");
        return { t: "kick", r, d: (d - 1) as Dir };
      }
      case "h":
        none();
        return { t: "hold" };
      case "u":
        return { t: "use", i: one() };
      case "w": {
        const [a, b] = two();
        return { t: "swap", a, b };
      }
      case "x":
        return { t: "sell", i: one() };
      case "c":
        none();
        return { t: "collect" };
      case "b":
        return { t: "buy", i: one() };
      case "n":
        none();
        return { t: "next" };
      case "v":
        none();
        return { t: "back" };
    }
    throw new Error("bad trail");
  });
}

