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
  TIER_WEIGHT,
  RODS,
  ROUNDS,
  START_FANS,
  START_OFF,
  WIN_FANS,
  drillCost,
  styleOf,
  DRAW_FANS_R3,
  FINAL_SPOTS,
  FORM_BAG,
  HAUNT_LEVELS_R3,
  KICKOFFS,
  LEAGUE_CLUBS,
  MATCHDAYS,
  POINTS,
  ROUNDS_R3,
  STICKY_LANES,
  TABLE_EVENT_IDS,
  WIN_FANS_R3,
  clubIdOf,
  type DrillId,
  type StyleId,
  type TableEventId,
} from "./content.js";
import { pickWeighted, shuffle, stream } from "./rng.js";

export type Side = 0 | 1;
/** A full season, or the Haunted table: three matches against ghost clubs with ghost rules. */
/**
 * A full season, the Haunted table, or (rules 3) the Daily Match: one match day of three fixtures, friendly, league
 * match and boss club, on the day's seed. A daily run is over after fixture 3, or at the first match it loses.
 */
export type RunMode = "season" | "haunt" | "daily";
export type Dir = -1 | 0 | 1;
export type Phase = "fixture" | "attack" | "defend" | "fulltime" | "room" | "over" | "won";

// ---------------------------------------------------------------- rules versions (A.0)
/**
 * The rules a run plays by. 2 is every trail posted up to KICKER 2.1: such a trail carries no rules token and must
 * keep replaying byte for byte. 3 is KICKER 3.0's rules, marked "R3" at the front of the trail. */
export type Rules = 2 | 3;
export const RULES_LEGACY: Rules = 2;
export const RULES_NEXT: Rules = 3;
/** The rules a new run starts under, and the newest the server accepts: the 3.0 rules. */
export const CURRENT_RULES: Rules = RULES_NEXT;
/** Trail tokens for the rules after the legacy ones. Legacy has no token, so "R2" is not a token and is refused. */
const RULE_TOKEN: Keyed<string, Rules> = { R3: 3 };
const TOKEN_OF: Keyed<Rules, string> = { 2: "", 3: "R3" };

/** A move of one rod one lane. */
export interface Move {
  r: number;
  d: Dir;
}

/** How a boss club's rule shows on the table. `rod` and `d` say which of your rods, or which way, where it matters. */
export interface RuleView {
  kind: "pulled" | "frozen" | "locked" | "mirror" | "drift" | "cost2" | "late" | "short" | "check" | "bell";
  rod?: number;
  d?: Dir;
}

/** A telegraphed table event, one per league match (rules 3). None under the legacy rules. Defined in content.ts. */
export type { TableEventId };

/**
 * One club's line in the league table (rules 3). `you` marks your own line (its `club` is "You"); `form` is a
 * league club's form, 0 off the pace, 1 mid-table, 2 in form (see FORM_NAME). `pts` is 3 a win, 1 a draw.
 */
export interface LeagueRow {
  club: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
  you?: true;
  form?: number;
}

/** A line of the season's story, for the recap: what happened in which fixture, with the facts to tell it. */
export interface StoryLine {
  round: number;
  kind: number;
  key: string;
  args: Keyed<string, string | number>;
}

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
  /** In the way, in order. `reach` marks their keeper's reach on a tight shot (rules 3): it costs one Power. */
  blockers: { rod: number; fig: number; x: number; lane: number; reach?: boolean }[];
  /** The cells right after the ball came off a side wall (for bounce marks). */
  walls: Step[];
}

/** Rules 3 table conditions a kick meets. Absent under the legacy rules, so 2.1 traces stay exactly as they were. */
export interface TraceOpt {
  /** Wide bodies: wide[rod][lane] is the figure of yours (side 0) that also covers that lane, else -1. Their kicks only. */
  wide?: number[][] | null;
  /** Volatile: past a side wall the ball runs two lanes for every one. */
  volatile?: boolean;
  /** Thin book: a lane no kick may run along in midfield (columns 3..6), or -1. */
  sticky?: number;
}

/** What happened, in order, so the table can play it back. */
export type Ev =
  | { e: "slide"; side: Side; r: number; d: number; why: "you" | "react" | "mirror" | "ai" | "block" | "ghost" }
  | {
      e: "kick";
      side: Side;
      rod: number;
      fig: number;
      kick: Kick;
      steps: Step[];
      result: "goal" | "pass" | "blocked" | "kept";
      at: { rod: number; fig: number } | null;
      beaten: number;
      to: number;
      drift: number;
      /** The kicker's squad slot (for their side: the slot in `run.rivals()`). */
      slot: number;
      /** The receiver's squad slot on a pass that arrives, else -1. */
      toSlot: number;
      /** Side walls the ball came off. */
      bounces: number;
      /** A shot into a lane their keeper reaches (rules 3; never set under the legacy rules). */
      tight?: boolean;
      /** A first-time shot by a Pace figure straight off a pass (rules 3; never set under the legacy rules). */
      first?: boolean;
    }
  /** `slot` is the scorer's squad slot (for their side, the slot in `run.rivals()`). */
  | { e: "goal"; side: Side; rating: number; style: string; slot?: number }
  | { e: "turnover"; to: Side; why: "touches" | "blocked" | "dead" }
  | { e: "kickoff"; side: Side }
  | { e: "play"; id: string }
  | { e: "end"; won: boolean; draw: boolean }
  /** After each pass of yours that arrives: passes in this possession so far, and the cells the build-up ran through. */
  | { e: "chain"; n: number; lanes: Step[] }
  /** The rival's reaction to a touch, as one group. Comes right before the "slide" events (why "react") it groups. */
  | { e: "react"; moves: Move[] }
  /** At the kickoff of a boss match, before "kickoff": the rule and how it shows on the table. */
  | { e: "rule"; id: string; view: RuleView }
  /** At kickoff, the match's table event (rules 3; never under the legacy rules). */
  | { e: "event"; id: TableEventId }
  /** Full time on the table, right before "end". "final" is the run's last match, won. */
  | { e: "whistle"; reason: "won" | "lost" | "draw" | "final" }
  /** The league table changed (rules 3; never under the legacy rules). */
  | { e: "standings" };

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
/**
 * The season's best goal with its move: `path` has one segment per kick of the build-up (the passes, then the shot),
 * each starting at the kicker's cell; `kicks` are the same kicks; `scorer` is the squad slot that scored.
 * Table space: x is the column 0..9 from your goal, lane 0..9.
 */
export type BestGoal = Best & { path: Step[][]; kicks: Kick[]; scorer: number; walls?: Step[] };

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
  /** The boss rule as the table shows it, or null. */
  ruleView: RuleView | null;
  /** This match's table event (rules 3). Always null under the legacy rules. */
  event: TableEventId | null;
  /** Which seeded kickoff formation the match opened from (rules 3). Always 0, START_OFF, under the legacy rules. */
  kickoffId: number;
  /** Your kicks that arrived this possession, with their paths: the build-up. */
  build: { kick: Kick; path: Step[]; walls?: Step[] }[];
  /** Thin book's sticky lane, or -1 (rules 3). */
  sticky?: number;
  /** The ball just reached a Pace figure off a pass: they have not reacted yet (rules 3). */
  firstTime?: boolean;
  /** Your squad slots with Grip on the defence and midfield: wide bodies (rules 3). Fixed for the match. */
  wide?: number[];
  /** Your scorers this match, in order (squad slots). */
  goals?: number[];
  /** Their figures (slots in `rivals()`) that shoot with Power of their own (rules 3). Fixed for the match. */
  rivalPower?: number[];
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
  /** The rules this run plays by; the trail carries it as a token. */
  rules: Rules;
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
  best: BestGoal | null;
  cleared: number; // matches won
  draws: number; // level at the whistle, through without the win fans
  goalsFor: number;
  goalsAgainst: number;
  touchesTotal: number;
  /** The league table (rules 3), in table order: points, goal difference, goals for. Null under the legacy rules and on the Haunted table. */
  league: LeagueRow[] | null;
  /** League matches lost (rules 3; a legacy loss ends the run, so it stays 0 there). */
  losses?: number;
  /** Goals this season by squad slot. Follows the launch through line-up swaps. */
  scorers: Keyed<number, number>;
  /** What happened, fixture by fixture, for the season recap. */
  story: StoryLine[];
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
export function trace(off: number[][], pulled: number[], side: Side, rod: number, lane: number, k: Kick, drift = 0, opt?: TraceOpt): Trace {
  const x0 = colOf(side, rod);
  const dir = side === 0 ? 1 : -1;
  const goal = k.r === 4;
  const x1 = goal ? GOAL_X[1 - side] : colOf(side, k.r);
  const n = Math.abs(x1 - x0);
  const steps: Step[] = [];
  const blockers: Trace["blockers"] = [];
  const walls: Step[] = [];
  const sticky = opt?.sticky ?? -1;
  let stuck = false;
  let bounces = 0;
  for (let i = 1; i <= n; i++) {
    let raw = lane + drift + k.d * i;
    if (opt?.volatile) raw = raw < 0 ? 2 * raw : raw >= LANES ? LANES - 1 + 2 * (raw - (LANES - 1)) : raw;
    const [ln, b] = reflect(raw);
    const x = x0 + dir * i;
    if (b > bounces) walls.push({ x, lane: ln });
    bounces = b;
    steps.push({ x, lane: ln });
    if (sticky >= 0 && ln === sticky && x >= 3 && x <= 6) stuck = true;
    if (i < n) {
      const o = AT[x];
      if (o && o.side !== side && pulled[o.side] !== o.rod) {
        let f = figAt(o.rod, off[o.side][o.rod], ln);
        if (f < 0 && o.side === 0 && opt?.wide) f = opt.wide[o.rod]?.[ln] ?? -1;
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
  if (stuck) legal = false;
  return { steps, land, bounces, legal, to, blockers, walls };
}

/**
 * Power beats blockers in order, one point each. A keeper with Diamond Gloves is never beaten; a keeper in the final
 * (`keeperCost` 2) takes two points.
 */
export function resolveBlock(blockers: Trace["blockers"], power: number, keeperHolds: boolean, keeperCost = 1): { at: Trace["blockers"][number] | null; beaten: number } {
  let p = power;
  let beaten = 0;
  for (const b of blockers) {
    const cost = b.reach ? 1 : b.rod === 0 ? keeperCost : 1;
    if (p >= cost && !(keeperHolds && b.rod === 0 && !b.reach)) {
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

/**
 * Rules 3: how sharp the rival plays. Each style plays its own way, and every club gets sharper as the level rises.
 * - press shuts passing lanes from the start, reads first-time passes and looks a slide ahead early;
 * - bus sits deep (an extra slide at the back once your ball is up front) and only shoots from midfield up;
 * - long covers shots first and shoots through a blocker from deep from level 2.
 */
export function aiParams3(level: number, style: StyleId = "press") {
  return {
    style,
    react: level >= 9 ? 3 : level >= 3 ? 2 : 1,
    passes: style === "press" ? true : style === "long" ? level >= 5 : level >= 2,
    look: level >= R3.lookAt || (style === "press" && level >= 2),
    read: level >= R3.readAt,
    /** Half a read: after your block slides it re-aims, but only at the same target (a shot stays a shot). */
    half: level >= R3.halfAt,
    power: (level >= R3.aiPowerAt ? 1 : 0) + (level >= R3.aiPower2At ? 1 : 0),
    deep: style === "long" && level >= 2 ? 1 : 0,
    touches: 4 + R3.aiTouches + (level >= 3 ? 1 : 0) + (level >= 6 ? 1 : 0),
    /** Knows a pass to a Pace figure is shot first time, before it can react. */
    pace: style === "press" || level >= 5,
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
    public rules: Rules = CURRENT_RULES,
  ) {
    const squad = buildSquad(ed, seed);
    if (mode === "daily" && rules < RULES_NEXT) throw new Error("the Daily match day needs rules 3");
    const haunt = mode === "haunt";
    const daily = mode === "daily";
    const league = mode === "season" && rules >= RULES_NEXT;
    this.rounds = haunt || daily ? 1 : league ? ROUNDS_R3 : ROUNDS;
    const bag = shuffle(
      BOSSES.map((b) => b.id),
      stream(seed, "boss"),
    );
    const bosses: string[] = [];
    if (haunt) bosses.push(HAUNT.boss.id);
    else if (daily) bosses.push(bag[0]);
    else for (let r = 1; r <= this.rounds; r++) bosses.push(r === this.rounds ? FINAL_BOSS.id : bag[(r - 1) % bag.length]);
    const clubs: string[] = haunt ? HAUNT.clubs.slice() : [];
    if (league) {
      // your opponent on each of the fourteen matchdays
      const lc = leagueClubsOf(seed);
      for (let md = 0; md < MATCHDAYS; md++) clubs.push(lc[fixturesOf(md)[0][1]]);
    } else if (daily) {
      clubs.push(...shuffle(CLUBS, stream(seed, "clubs")).slice(0, 2));
    } else if (!haunt) {
      const names = shuffle(CLUBS, stream(seed, "clubs"));
      for (let i = 0; i < ROUNDS * 2; i++) clubs.push(names[i % names.length]);
    }
    this.s = {
      seed,
      mode,
      rules,
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
      league: null,
      scorers: {},
      story: [],
    };
    if (league) {
      const form = formsOf(seed);
      this.s.league = sortTable([{ club: "You", p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, you: true }, ...leagueClubsOf(seed).map((club, i) => ({ club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: form[i] }))]);
      this.s.losses = 0;
    }
  }

  /** True for a rules-3 season: a league, cup ties and a final for the top two. */
  get league(): boolean {
    return this.nextRules && this.mode === "season";
  }

  get m(): Match {
    if (!this.s.match) throw new Error("no match on");
    return this.s.match;
  }

  // ------------------------------------------------------------ the fixture
  /** Who you meet in a fixture of this round. */
  clubName(kind = this.s.kind, round = this.s.round): string {
    if (kind === 2) {
      // rules 3: the final is played against the other club of the top two, under the Closing Bell's terms
      if (this.league && this.isFinal(kind, round)) return this.finalist() || FINAL_BOSS.name;
      return BOSS[this.s.bosses[round - 1]]?.name || FINAL_BOSS.name;
    }
    return this.s.clubs[(round - 1) * 2 + kind];
  }
  bossOf(kind = this.s.kind, round = this.s.round): string | null {
    return kind === 2 ? this.s.bosses[round - 1] : null;
  }
  levelOf(kind = this.s.kind, round = this.s.round): number {
    // a boss club plays like the league side of its round; its rule is the difference. The final is the sharpest.
    if (this.mode === "haunt") return (this.nextRules ? R3.haunt : HAUNT.levels)[kind];
    if (this.bossOf(kind, round) === "bell") return this.nextRules ? R3.final : FINAL_LEVEL;
    if (this.mode === "daily") return R3.daily[kind] + (kind === 2 ? R3.boss[this.bossOf(kind, round) || ""] || 0 : 0);
    if (this.league) return kind === 2 ? Math.max(0, round + R3.cup + (R3.boss[this.bossOf(kind, round) || ""] || 0)) : Math.max(0, round + R3.league + this.formOf(this.clubName(kind, round)));
    return round - 1 + Math.min(kind, 1);
  }

  // ------------------------------------------------------------ the league (rules 3)
  /** A league club's form (0..2), or 1 for a club outside the league. */
  formOf(club: string): number {
    const row = this.s.league?.find((r) => r.club === club && !r.you);
    return row?.form ?? 1;
  }
  /** The matchday (0..13) of a league fixture, or -1 for a cup tie. */
  matchdayOf(kind = this.s.kind, round = this.s.round): number {
    return kind < 2 ? (round - 1) * 2 + kind : -1;
  }
  /** Your place in the league table, 1 = top; 0 without a league. */
  standing(): number {
    return (this.s.league?.findIndex((r) => r.you) ?? -1) + 1;
  }
  /** League matches you have left to play. */
  leagueLeft(): number {
    const me = this.s.league?.find((r) => r.you);
    return me ? MATCHDAYS - me.p : 0;
  }
  /** The other club of the top two once the league is done (your final opponent), else null. */
  finalist(): string | null {
    const t = this.s.league;
    if (!t || this.leagueLeft() > 0 || this.standing() > FINAL_SPOTS) return null;
    return t.slice(0, FINAL_SPOTS).find((r) => !r.you)?.club || null;
  }
  /**
   * True once you can no longer finish in the top two: with league matches left, two clubs already have more points
   * than you could reach; with none left, your place is below the line.
   */
  leagueOut(): boolean {
    const t = this.s.league;
    if (!t) return false;
    const me = t.find((r) => r.you)!;
    const left = MATCHDAYS - me.p;
    if (left === 0) return this.standing() > FINAL_SPOTS;
    const most = me.pts + POINTS.win * left;
    return t.filter((r) => !r.you && r.pts > most).length >= FINAL_SPOTS;
  }
  /** Plays a matchday's other fixtures (seeded) and books your result into the table. */
  private bookMatchday(md: number, mine: [number, number]) {
    const s = this.s;
    const t = s.league;
    if (!t) return;
    const lc = leagueClubsOf(s.seed);
    const row = (club: string) => t.find((r) => r.club === club && !r.you)!;
    const book = (r: LeagueRow, f: number, a: number) => {
      r.p++;
      r.gf += f;
      r.ga += a;
      if (f > a) r.w++;
      else if (f === a) r.d++;
      else r.l++;
      r.pts = POINTS.win * r.w + POINTS.draw * r.d;
    };
    const pairs = fixturesOf(md);
    book(t.find((r) => r.you)!, mine[0], mine[1]);
    book(row(lc[pairs[0][1]]), mine[1], mine[0]);
    pairs.slice(1).forEach(([a, b], j) => {
      const [ga, gb] = simResult(stream(s.seed, "table", md, j), this.formOf(lc[a]), this.formOf(lc[b]));
      book(row(lc[a]), ga, gb);
      book(row(lc[b]), gb, ga);
    });
    s.league = sortTable(t);
  }

  /** The rival's captain for a fixture: its index in `rivals()`, picked by the club's captain rule. Cosmetic. */
  captainOf(kind = this.s.kind, round = this.s.round): number {
    const xs = this.rivals(kind, round);
    const rule = clubIdOf(this.clubName(kind, round)).captain;
    const key = (l: Launch) => (rule === "curve" ? l.p : rule === "trades" ? l.k : rule === "holders" ? l.h : rule === "up" ? (l.x ?? -1e9) : l.a);
    let best = 0;
    xs.forEach((l, i) => {
      if (key(l) > key(xs[best])) best = i;
    });
    return best;
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
    const lv = m ? m.level : this.levelOf();
    const st = m ? m.style : this.styleOf();
    if (!this.nextRules) return { ...aiParams(lv, st), pace: false, half: false };
    const p = aiParams3(lv, st);
    // the ghost clubs get a touch more on the ball as the night goes on (a finer step than a level)
    if (this.mode === "haunt") p.touches += R3.hauntTouches[m ? m.kind : this.s.kind] || 0;
    return p;
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
    if (first && s.match?.event === "green") n++;
    // rules 3: a cup tie at home (top two of the table), or the final as league leader: touches more on the first possession
    if (first && s.match?.kind === 2) n += this.homeTouches();
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
  shotPower(slot: number, rod: number, tr: Trace, touchesLeft: number, afterPass: boolean, passes = this.s.match?.passes ?? 0): number {
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
    return p + this.buildUpPower(passes);
  }
  /** Power their keeper takes: one, or the final's keeper. */
  keeperCost(): number {
    return this.m.boss === "bell" ? (this.nextRules ? R3.finalKeeper : FINAL_KEEPER) : 1;
  }
  /** Rules 3: would this figure keep the ball if its shot were blocked now (Grip, not used this possession)? */
  gripKeepsShot(slot: number): boolean {
    return this.nextRules && R3.gripShot > 0 && this.stats(slot).grip && !this.m.gripUsed.includes(slot);
  }
  /** Vibe Check: a figure needs a stat to shoot. */
  mayShoot(slot: number): boolean {
    if (this.m.boss !== "vcheck") return true;
    const st = this.stats(slot);
    return st.power || st.pace || st.grip;
  }

  /** Every kick you can make from the ball now, with its path and how it would end. */
  myKicks(off = this.m.off, ball = this.m.ball, touches = this.m.touches, afterPass = this.m.afterPass, passes = this.m.passes) {
    const m = this.m;
    const lane = laneOf(ball.rod, off[0][ball.rod], ball.fig);
    const slot = slotOf(ball.rod, ball.fig);
    const out: { kick: Kick; tr: Trace; power: number; open: boolean; beaten: number; at: Trace["blockers"][number] | null; tight: boolean }[] = [];
    for (const kick of KICKS) {
      if (kick.r !== 4 && kick.r <= ball.rod) continue;
      const tr = this.traceAt(off, 0, ball.rod, lane, kick, kick.r === 4 ? m.drift : 0);
      if (!tr.legal) continue;
      if (kick.r === 4 && !this.mayShoot(slot)) continue;
      const power = kick.r === 4 ? this.shotPower(slot, ball.rod, tr, touches, afterPass, passes) : 0;
      const ghost = kick.r !== 4 && m.longball;
      const rc = kick.r === 4 ? this.reachOf(off, tr, afterPass) : { blockers: tr.blockers, tight: false };
      const res = ghost ? { at: null, beaten: 0 } : resolveBlock(rc.blockers, power, false, this.keeperCost());
      out.push({ kick, tr, power, open: !res.at, beaten: res.beaten, at: res.at, tight: rc.tight });
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
        if (deep && this.myKicks(off, { side: 0, rod: o.kick.r, fig: o.tr.to }, 2, true, m.passes + 1).some((k) => k.open && k.kick.r === 4)) {
          // a pass to a Pace figure is shot first time, before they can react: a club that reads it weighs it double
          v += this.ai().pace && this.firstTime(slotOf(o.kick.r, o.tr.to)) ? 60 : 30;
        }
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

  // ------------------------------------------------------------ 3.0 contract: queries
  /** True when this run plays the 3.0 rules. Below rules 3 every query answers like 2.1. */
  get nextRules(): boolean {
    return this.rules >= RULES_NEXT;
  }
  /**
   * The lanes their keeper reaches right now, in their keeper's column (x 8): the lanes either side of it. A shot that
   * crosses that column in one of them is "tight": the keeper gets to it unless it comes straight off a pass, comes
   * off a side wall, or carries a point of Power to spare. Empty under the legacy rules.
   */
  tightLanes(): number[] {
    const m = this.s.match;
    if (!this.nextRules || !m) return [];
    const k = m.off[1][0];
    return [k - 1, k + 1].filter((l) => l >= 0 && l < LANES);
  }
  /** Pace on a pass receiver: it shoots first time, before they react (rules 3). */
  firstTime(slot: number): boolean {
    return this.nextRules && slot > 0 && this.stats(slot).pace;
  }
  /**
   * Grip at the back (rules 3): on their ball a Grip figure on your defence or midfield also covers the next lane
   * toward the middle, and a Grip keeper reaches the lanes either side of it, as theirs does.
   */
  wideBody(slot: number): boolean {
    return this.nextRules && rodOfSlot(slot) <= 2 && this.stats(slot).grip;
  }
  /** Build-up: +1 Power on a shot after 2 or more passes in the possession (rules 3). */
  buildUpPower(passes = this.s.match?.passes ?? 0): number {
    return this.nextRules && passes >= 2 ? R3.buildUp : 0;
  }
  /**
   * Rules 3: what the table is worth in a cup tie. In the top two when a cup tie comes round, it is played at home:
   * +1 touch on your first possession. Top of the league for the final: +2. Else 0.
   */
  homeTouches(kind = this.s.kind, round = this.s.round): number {
    if (!this.league || kind !== 2) return 0;
    const pos = this.standing();
    if (this.isFinal(kind, round)) return pos === 1 ? R3.leaderTouch : 0;
    return pos <= FINAL_SPOTS ? R3.homeTouch : 0;
  }
  /** The lanes each of your wide bodies also covers at these offsets: wide[rod][lane] = figure, else -1. */
  wideCover(off = this.m.off): number[][] | null {
    const m = this.s.match;
    if (!this.nextRules || !m || !m.wide || !m.wide.length) return null;
    const w: number[][] = [[], [], [], []];
    for (const slot of m.wide) {
      const r = rodOfSlot(slot);
      if (r === m.pulled) continue;
      const f = slot - RODS[r].slot;
      const lane = laneOf(r, off[0][r], f);
      for (const extra of r === 0 ? [lane - 1, lane + 1] : [lane + (lane <= 4 ? 1 : -1)]) if (extra >= 0 && extra < LANES && figAt(r, off[0][r], extra) < 0) w[r][extra] = f;
    }
    return w;
  }
  /** A kick's path from a cell under this match's table conditions (rules 3), the same trace everything plays by. */
  traceAt(off: number[][], side: Side, rod: number, lane: number, kick: Kick, drift = 0): Trace {
    const m = this.s.match;
    if (!this.nextRules || !m) return trace(off, this.pulledArr(), side, rod, lane, kick, drift);
    const tr = trace(off, this.pulledArr(), side, rod, lane, kick, drift, {
      wide: side === 1 ? this.wideCover(off) : null,
      volatile: m.event === "volatile",
      sticky: m.event === "thin" ? (m.sticky ?? -1) : -1,
    });
    // Halt on the half: no pass over a rod on each side's first possession
    if (m.event === "halfhalt" && kick.r !== 4 && kick.r - rod >= 2 && m.poss[side] <= 1) tr.legal = false;
    return tr;
  }
  /** Rules 3: a shot of yours and their keeper's reach. Tight shots meet the reach as one more blocker, unless they come off a pass or a wall. */
  reachOf(off: number[][], tr: Trace, afterPass: boolean): { blockers: Trace["blockers"]; tight: boolean } {
    if (!this.nextRules) return { blockers: tr.blockers, tight: false };
    const kx = colOf(1, 0);
    const st = tr.steps.find((x) => x.x === kx);
    const tight = !!st && Math.abs(st.lane - off[1][0]) === 1;
    if (!st || !tight || afterPass || tr.bounces > 0) return { blockers: tr.blockers, tight };
    return { blockers: [...tr.blockers, { rod: 0, fig: 0, x: kx, lane: st.lane, reach: true }], tight };
  }

  /** How the boss rule of a match shows on the table. Pure: read off the match. */
  ruleViewOf(m: Match = this.m): RuleView | null {
    switch (m.boss) {
      case "rug":
        return { kind: "pulled", rod: m.pulled };
      case "halt":
        return { kind: "frozen", rod: m.frozen };
      case "lockup":
        return { kind: "locked", rod: 0 };
      case "wash":
        return { kind: "mirror" };
      case "depeg":
        return { kind: "drift", d: m.drift as Dir };
      case "gasspike":
        return { kind: "cost2" };
      case "jam":
        return { kind: "late" };
      case "slip":
        return { kind: "short" };
      case "vcheck":
        return { kind: "check" };
      case "bell":
        return { kind: "bell" };
    }
    return null;
  }

  /**
   * "Read the tape": where their rods end up if you slide rod `a.r` the way `a.d` now, and the moves they make.
   * A dry run on a copy of the state through the same code a real slide takes (boss rules, Dummy Run, out of
   * touches), so it can't disagree with what then happens; nothing on this run changes. Null when the slide is not
   * legal now.
   */
  previewReact(a: Move): { off: number[][]; moves: Move[] } | null {
    if (this.s.phase !== "attack" || !this.s.match) return null;
    const twin = Object.create(Run.prototype) as Run;
    Object.assign(twin, { ed: this.ed, mode: this.mode, rules: this.rules, rounds: this.rounds, s: structuredClone(this.s), trail: [], events: [] });
    try {
      twin.apply({ t: "slide", r: a.r, d: a.d });
    } catch {
      return null;
    }
    const moves: Move[] = [];
    for (const ev of twin.events) {
      if (ev.e === "turnover" || ev.e === "kickoff") break;
      if (ev.e === "slide" && ev.side === 1 && ev.why === "react") moves.push({ r: ev.r, d: ev.d as Dir });
    }
    const off = (twin.s.match || this.m).off.map((o) => o.slice());
    return { off, moves };
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
      const tr = this.traceAt(off, 1, ball.rod, lane, kick);
      if (!tr.legal) continue;
      const res = resolveBlock(tr.blockers, kick.r === 4 ? this.theirPower(ball.rod, ball.fig) : 0, keeperHolds);
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
  /** Power on the rival's shot from a rod: its level, plus one from deep for a long-range club, plus (rules 3) the shooter's own Power. */
  theirPower(rod: number, fig = -1): number {
    const p = this.ai();
    const m = this.s.match;
    // rules 3: in the final the Closing Bell fields its best, so every figure of theirs shoots with Power
    const own = fig >= 0 && m && (m.rivalPower?.includes(slotOf(rod, fig)) || (this.nextRules && ((m.boss === "bell" && R3.finalAllPower) || (this.mode === "haunt" && R3.hauntPower[m.kind])))) ? R3.rivalPower : 0;
    return p.power + (rod <= 1 ? p.deep : 0) + own;
  }
  /** Rules 3: the rival's figures that shoot with Power of their own, by their launch's curve progress (squad slots in `rivals()`). */
  rivalPowerSlots(kind = this.s.kind, round = this.s.round): number[] {
    if (!this.nextRules) return [];
    return this.rivals(kind, round).flatMap((l, i) => (l.p >= STAT.power.at ? [i] : []));
  }
  private theirKicks2(off: number[][], ball: Ball): boolean {
    const lane = laneOf(ball.rod, off[1][ball.rod], ball.fig);
    if (this.ai().style === "bus" && ball.rod < 2) return false;
    const pw = this.theirPower(ball.rod, ball.fig);
    const keeperHolds = has(this.s, "diamond");
    const tr0 = (d: Dir) => this.traceAt(off, 1, ball.rod, lane, { r: 4, d });
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
  /**
   * What the rival does with its next touch, from offsets `off`: its committed call, or (reading you) its best kick
   * now, or (half reading) its best kick now at the target it called. The same plan Ready plays and the bot blocks.
   */
  aiPlan(off = this.m.off): NonNullable<Match["intent"]> {
    const m = this.m;
    const p = this.ai();
    if (p.read || !m.intent) return this.aiChoose(off);
    const it = m.intent;
    if (p.half && it.kind === "kick") {
      const ks = this.theirKicks(off).filter((k) => k.open && k.kick.r === it.kick.r);
      if (ks.length) {
        let best = ks[0];
        for (const k of ks) if (k.value > best.value) best = k;
        return { kind: "kick", kick: best.kick };
      }
    }
    return it;
  }
  /** The kicks the rival threatens right now: all of them when it reads you, only its call when it commits. */
  threats() {
    const m = this.m;
    if (this.s.phase !== "defend") return [];
    const ks = this.theirKicks().filter((k) => k.open);
    const p = this.ai();
    if (p.read) return ks;
    if (p.half && m.intent?.kind === "kick") {
      const r = m.intent.kick.r;
      return ks.filter((k) => k.kick.r === r);
    }
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
      m.build = [];
      if (this.nextRules) m.firstTime = false;
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
    // rules 3: Trading Halt lifts at the first goal of the match, either side's: the market reopens
    if (this.nextRules && m.boss === "halt" && m.frozen >= 0) {
      m.frozen = -1;
      m.ruleView = this.ruleViewOf(m);
      if (m.ruleView) this.events.push({ e: "rule", id: "halt", view: m.ruleView });
    }
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
    if (this.league) return this.endMatch3(won);
    const s = this.s;
    const m = this.m;
    const draw = !won && m.score[0] === m.score[1] && m.kind < 2;
    this.events.push({ e: "whistle", reason: won ? (this.isFinal(m.kind) ? "final" : "won") : draw ? "draw" : "lost" });
    this.events.push({ e: "end", won, draw });
    s.story.push({ round: s.round, kind: m.kind, key: won ? "won" : draw ? "draw" : "lost", args: { club: m.club, for: m.score[0], against: m.score[1], ...(m.boss ? { boss: m.boss } : {}) } });
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

  /**
   * Full time in a rules-3 season. A league match books points (3 a win, 1 a draw) and the matchday's other results;
   * a loss there goes on, unless the table has shut you out of the top two. A cup tie has to be won; the final too.
   */
  private endMatch3(won: boolean) {
    const s = this.s;
    const m = this.m;
    const league = m.kind < 2;
    const draw = !won && m.score[0] === m.score[1] && league;
    const final = this.isFinal(m.kind);
    this.events.push({ e: "whistle", reason: won ? (final ? "final" : "won") : draw ? "draw" : "lost" });
    this.events.push({ e: "end", won, draw });
    const line: StoryLine = { round: s.round, kind: m.kind, key: won ? "won" : draw ? "draw" : "lost", args: { club: m.club, for: m.score[0], against: m.score[1], ...(m.boss ? { boss: m.boss } : {}) } };
    if (m.goals && m.goals.length) line.args.scorers = m.goals.join(",");
    if (m.event) line.args.event = m.event;
    if (final) line.args.final = 1;
    s.story.push(line);
    if (league) {
      this.bookMatchday(this.matchdayOf(m.kind), [m.score[0], m.score[1]]);
      this.events.push({ e: "standings" });
      line.args.pos = this.standing();
      if (!won && !draw) s.losses = (s.losses || 0) + 1;
      if (this.leagueOut()) {
        line.args.out = 1;
        s.phase = "over";
        return;
      }
    } else if (!won) {
      s.phase = "over";
      return;
    }
    if (won) s.cleared++;
    else if (draw) s.draws++;
    const kind = league ? "league match" : final ? "final" : "cup tie";
    const rows: [string, number][] = [won ? [`Win (${kind})`, WIN_FANS_R3[m.kind]] : draw ? [`Draw (${kind}): a point`, DRAW_FANS_R3] : [`Lost (${kind}): no points`, 0]];
    if (m.fans) rows.push(["Goals and balls won", m.fans]);
    if (won && has(s, "mm")) rows.push(["Market Maker", 3]);
    const total = rows.reduce((n, r) => n + r[1], 0);
    s.fulltime = { rows, total };
    if (final) {
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
    // rules 3: a goal off two passes or more is a team move whatever it beat on the way
    if (this.nextRules) {
      const st3 = tr.bounces > 0 ? "Bank shot" : m.passes >= 2 ? "Team move" : beaten > 0 ? "Power drive" : rod <= 2 ? "Long range" : m.afterPass ? "One-touch finish" : kick.d !== 0 ? "Angled finish" : "Tap-in";
      return { total: Math.round(v), style: st3 };
    }
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
      const j = pickWeighted(pool, (x) => TIER_WEIGHT[x.tier], rnd);
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
          limit: !this.nextRules ? (final ? POSSESSIONS + 4 : POSSESSIONS) : this.mode === "haunt" ? R3.hauntPoss[s.kind] : final ? R3.finalPoss : s.kind === 2 ? R3.cupPoss : POSSESSIONS,
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
          ruleView: null,
          event: null,
          kickoffId: 0,
          build: [],
        };
        s.match.ruleView = this.ruleViewOf(s.match);
        let fig = 2;
        if (this.nextRules) {
          const mt = s.match;
          // a seeded opening for the club's style, and one telegraphed table event in a league match
          const ko = kickoffFor(s.seed, s.round, s.kind, mt.style);
          mt.kickoffId = ko.id;
          mt.off = ko.off.map((o) => o.slice());
          fig = ko.fig;
          mt.ball = { side: 0, rod: 2, fig };
          if ((this.league || this.mode === "daily") && s.kind < 2) {
            const ev = stream(s.seed, "event", s.round, s.kind);
            mt.event = TABLE_EVENT_IDS[Math.floor(ev() * TABLE_EVENT_IDS.length)];
            mt.sticky = mt.event === "thin" ? STICKY_LANES[Math.floor(ev() * STICKY_LANES.length)] : -1;
          }
          mt.wide = s.squad.map((_, i) => i).filter((i) => this.wideBody(i));
          mt.rivalPower = this.rivalPowerSlots();
          mt.firstTime = false;
          mt.goals = [];
        }
        if (this.mode === "haunt") {
          const g = stream(s.seed, "phasing", s.round, s.kind);
          s.match.ghost = { rod: [1, 2, 3][Math.floor(g() * 3)], tick: 0, drift: this.nextDrift(0), n: 0, due: false };
        }
        if (s.match.ruleView && s.match.boss) this.events.push({ e: "rule", id: s.match.boss, view: s.match.ruleView });
        if (s.match.event) this.events.push({ e: "event", id: s.match.event });
        this.events.push({ e: "kickoff", side: 0 });
        this.startPossession(0, 2, fig, "kickoff");
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
          if (this.nextRules) m.firstTime = false;
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
        let tr = this.traceAt(m.off, 0, ball.rod, this.ballLane(), kick, isShot ? m.drift : 0);
        if (!tr.legal) fail(isShot ? "that shot misses the goal" : "no figure of yours there");
        const first = !!m.firstTime && isShot;
        if (this.nextRules) m.firstTime = false;
        if (isShot && !this.mayShoot(slot)) fail("Vibe Check: this figure has no stat to shoot with");
        const free = !isShot && kick.d === 0 && has(s, "echo") && !m.echoUsed;
        const touchesBefore = m.touches;
        if (free) m.echoUsed = true;
        else m.touches--;
        s.touchesTotal++;
        // rules 3: a pass to a Pace figure skips the queue
        const queued = !isShot && m.boss === "jam" && !(this.nextRules && this.firstTime(slotOf(kick.r, tr.to)));
        if (queued) {
          // the pass lands late: they get their reaction before the ball arrives
          this.react();
          tr = this.traceAt(m.off, 0, ball.rod, this.ballLane(), kick, 0);
        }
        const power = isShot ? this.shotPower(slot, ball.rod, tr, touchesBefore, m.afterPass) : 0;
        const rc = isShot ? this.reachOf(m.off, tr, m.afterPass) : { blockers: tr.blockers, tight: false };
        const tags = { ...(rc.tight ? { tight: true } : {}), ...(first ? { first: true } : {}) };
        const res = !isShot && m.longball ? { at: null, beaten: 0 } : resolveBlock(rc.blockers, power, false, this.keeperCost());
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
          } else if (this.nextRules && R3.gripShot && this.stats(slot).grip && !m.gripUsed.includes(slot)) {
            // rules 3: a Grip figure keeps its own rebound too, once a possession
            m.gripUsed.push(slot);
            kept = true;
          }
          this.events.push({ e: "kick", side: 0, rod: ball.rod, fig: ball.fig, kick, steps: tr.steps, result: kept ? "kept" : "blocked", at: { rod: res.at.rod, fig: res.at.fig }, beaten: res.beaten, to: -1, drift: isShot ? m.drift : 0, slot, toSlot: -1, bounces: tr.bounces, ...tags });
          if (kept) {
            m.afterPass = false;
            if (m.touches <= 0) this.turnover(1, "touches");
            else {
              if (!queued) this.react();
              this.afterTouch();
              if (s.phase === "attack") this.settleGhost();
            }
          } else {
            this.events.push({ e: "turnover", to: 1, why: "blocked" });
            this.startPossession(1, res.at.rod, res.at.fig, "lost");
          }
          break;
        }
        this.events.push({ e: "kick", side: 0, rod: ball.rod, fig: ball.fig, kick, steps: tr.steps, result: isShot ? "goal" : "pass", at: null, beaten: res.beaten, to: tr.to, drift: isShot ? m.drift : 0, slot, toSlot: isShot ? -1 : slotOf(kick.r, tr.to), bounces: tr.bounces, ...tags });
        const seg: Step[] = [{ x: colOf(0, ball.rod), lane: this.ballLane() }, ...tr.steps];
        if (isShot) {
          s.scorers[slot] = (s.scorers[slot] || 0) + 1;
          if (m.goals) m.goals.push(slot);
          const r = this.rate(tr, res.beaten, ball.rod, kick, m.touches);
          m.fans += 1 + (has(s, "ape") ? 1 : 0) + (has(s, "airdrop") && s.squad[slot].d ? 2 : 0);
          this.events.push({ e: "goal", side: 0, rating: r.total, style: r.style, slot });
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
              path: [...m.build.map((b) => b.path), seg],
              kicks: [...m.build.map((b) => b.kick), kick],
              scorer: slot,
              walls: [...m.build.flatMap((b) => b.walls || []), ...tr.walls],
            };
          }
          this.scored(0);
          break;
        }
        m.ball = { side: 0, rod: kick.r, fig: tr.to };
        m.passes++;
        m.chain.push(slotOf(kick.r, tr.to));
        m.build.push(this.nextRules ? { kick, path: seg, walls: tr.walls } : { kick, path: seg });
        this.events.push({ e: "chain", n: m.passes, lanes: m.build.flatMap((b) => b.path) });
        m.afterPass = true;
        // rules 3: a Pace figure takes the ball first time, before they react to the pass
        const quick = this.firstTime(slotOf(kick.r, tr.to));
        if (this.nextRules) m.firstTime = quick;
        if (m.touches <= 0) this.turnover(1, "touches");
        else {
          if (!queued && !quick) this.react();
          this.afterTouch();
          if (s.phase === "attack") this.settleGhost();
        }
        break;
      }
      case "hold": {
        if (s.phase !== "defend") fail("they don't have the ball");
        this.aiTouch();
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
        // the goals follow the launch, not the slot
        const gi = s.scorers[i] || 0;
        const gj = s.scorers[j] || 0;
        delete s.scorers[i];
        delete s.scorers[j];
        if (gj) s.scorers[i] = gj;
        if (gi) s.scorers[j] = gi;
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
    if (this.nextRules) this.autoDefend();
    this.trail.push(a);
  }

  /** The rival's touch with the ball: its plan, played out. What Ready does, and what an empty defence turn does on its own. */
  private aiTouch() {
    const s = this.s;
    const m = this.m;
    const plan = this.aiPlan();
    m.aiTouches--;
    if (plan.kind === "slide") {
      if (this.canMove(1, plan.r, plan.d)) m.off[1][plan.r] += plan.d;
      this.events.push({ e: "slide", side: 1, r: plan.r, d: plan.d, why: "ai" });
    } else {
      const ball = m.ball;
      const tr = this.traceAt(m.off, 1, ball.rod, this.ballLane(), plan.kick);
      if (!tr.legal) {
        // a plan always lands where it aimed (your slides never move their figures); a dead ball if it ever doesn't
        this.turnover(0, "dead");
        return;
      }
      const res = resolveBlock(tr.blockers, plan.kick.r === 4 ? this.theirPower(ball.rod, ball.fig) : 0, has(s, "diamond"));
      if (res.at) {
        this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "blocked", at: { rod: res.at.rod, fig: res.at.fig }, beaten: res.beaten, to: -1, drift: 0, slot: slotOf(ball.rod, ball.fig), toSlot: -1, bounces: tr.bounces });
        if (has(s, "bag")) m.fans++;
        this.events.push({ e: "turnover", to: 0, why: "blocked" });
        this.startPossession(0, res.at.rod, res.at.fig, "won");
        // rules 3: a Grip figure that wins the ball cleanly starts the move with a touch more
        if (this.nextRules && s.phase === "attack" && this.stats(slotOf(res.at.rod, res.at.fig)).grip) m.touches += R3.gripWin;
        return;
      }
      if (plan.kick.r === 4) {
        this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "goal", at: null, beaten: res.beaten, to: -1, drift: 0, slot: slotOf(ball.rod, ball.fig), toSlot: -1, bounces: tr.bounces });
        this.events.push({ e: "goal", side: 1, rating: 0, style: "", slot: slotOf(ball.rod, ball.fig) });
        this.scored(1);
        return;
      }
      this.events.push({ e: "kick", side: 1, rod: ball.rod, fig: ball.fig, kick: plan.kick, steps: tr.steps, result: "pass", at: null, beaten: 0, to: tr.to, drift: 0, slot: slotOf(ball.rod, ball.fig), toSlot: slotOf(plan.kick.r, tr.to), bounces: tr.bounces });
      m.ball = { side: 1, rod: plan.kick.r, fig: tr.to };
    }
    if (m.aiTouches <= 0) {
      this.turnover(0, "dead");
      return;
    }
    m.intent = this.aiChoose();
  }
  /**
   * Rules 3: while they have the ball and threaten nothing, there is nothing to block and nothing to wait for, so
   * their touches play on their own until a threat shows or the ball changes hands. Same code as Ready.
   */
  private autoDefend() {
    let guard = 0;
    while (this.s.phase === "defend" && guard++ < 60 && this.threats().length === 0) this.aiTouch();
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
    if (moves.length) this.events.push({ e: "react", moves: moves.map((mv) => ({ r: mv.r, d: mv.d })) });
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

// ------------------------------------------------------------ rules 3: league, kickoffs, the best goal's path
/**
 * Rules 3 balance, in one place (tuned with `scripts/sim.ts --set=key=value`). League level: round + league + form;
 * cup tie: round + cup + the boss's own step; the final: final. Changing any of these changes rules 3, so once 3.0
 * ships they are frozen like the rest of the rules.
 */
export const R3 = {
  league: 0,
  cup: -2,
  final: 10,
  /** Each boss club's own step on top of the cup level: the rules that cost you touches play a little softer. */
  boss: { rug: 2, halt: -4, vcheck: 3, depeg: 4, gasspike: 0, jam: 4, slip: 3, lockup: 4, wash: 5 } as Keyed<string, number>,
  /** Possessions each in a cup tie and in the final. */
  cupPoss: POSSESSIONS + 2,
  finalPoss: POSSESSIONS + 4,
  /** Power from the build-up at 2 passes or more. */
  buildUp: 1,
  /** Rival launches with Power of their own shoot through one more blocker. */
  rivalPower: 1,
  /** The rival's shots go through one blocker from this level, two from the second. */
  aiPowerAt: 0,
  aiPower2At: 99,
  /** From these levels the rival covers the lanes you are a slide from, and picks its kick after your block slides. */
  lookAt: 5,
  readAt: 7,
  halfAt: 5,
  /** Extra touches for the rival on the ball. */
  aiTouches: 0,
  /** Power their keeper takes in the final (2.1: three). */
  finalKeeper: 3,
  /** How much a league club's form tilts its other results. */
  formEdge: 0.4,
  /** Touches more on the first possession of the final for topping the league. */
  leaderTouch: 1,
  /** The final: every one of their figures shoots with Power (1), or only their own Power launches (0). */
  finalAllPower: 1,
  /** Each ghost club: every ghost shoots with Power (1), or none of their own (0). */
  hauntPower: [1, 1, 1],
  /** The Haunted table's three ghost clubs, easy to hard, and the Daily's friendly, league match and boss club. */
  haunt: HAUNT_LEVELS_R3,
  daily: [4, 5, 1],
  hauntTouches: [0, 0, 0],
  /** Possessions each in the three ghost matches. */
  hauntPoss: [POSSESSIONS, POSSESSIONS, POSSESSIONS],
  /** A Grip figure keeps its own blocked shot once a possession (1), or only its blocked pass (0). */
  gripShot: 0,
  /** Touches more when a Grip figure of yours wins the ball back with a block. */
  gripWin: 1,
  /** Touches more on the first possession of a cup tie played at home (top two of the table). */
  homeTouch: 1,
};
/** Rules 3 Daily Match: how sharp the friendly, the league match and the boss club play (plus the boss's own step). */
export const DAILY_LEVELS = R3.daily;
export const LEAGUE_LEVEL = R3.league;
export const CUP_LEVEL = R3.cup;
export const FINAL_LEVEL_R3 = R3.final;

/** The seven clubs of a season's league, by the seed. */
export function leagueClubsOf(seed: string): string[] {
  return shuffle(CLUBS, stream(seed, "league")).slice(0, LEAGUE_CLUBS);
}
/** Each league club's form (0..2), in `leagueClubsOf` order, by the seed. */
export function formsOf(seed: string): number[] {
  return shuffle(FORM_BAG, stream(seed, "form"));
}
/**
 * A matchday's four fixtures, as pairs of league indexes; 7 is you, always in the first pair. A double round robin
 * (circle method): each club meets every other twice in the fourteen matchdays, never twice in a row.
 */
export function fixturesOf(md: number): [number, number][] {
  const t = md < LEAGUE_CLUBS ? md : (md - LEAGUE_CLUBS + 3) % LEAGUE_CLUBS;
  const n = LEAGUE_CLUBS;
  return [
    [n, t],
    [(t + 1) % n, (t + n - 1) % n],
    [(t + 2) % n, (t + n - 2) % n],
    [(t + 3) % n, (t + n - 3) % n],
  ];
}
/** One other league result, seeded: the better form wins more often. First to 2, or a lead at the whistle. */
export function simResult(rnd: () => number, fa: number, fb: number): [number, number] {
  const pa = Math.min(0.85, Math.max(0.05, 0.36 + R3.formEdge * (fa - fb)));
  const pd = Math.min(0.26, 1 - pa);
  const r = rnd();
  const sc = rnd();
  if (r < pa) return sc < 0.4 ? [2, 0] : sc < 0.75 ? [2, 1] : [1, 0];
  if (r < pa + pd) return sc < 0.6 ? [1, 1] : [0, 0];
  return sc < 0.4 ? [0, 2] : sc < 0.75 ? [1, 2] : [0, 1];
}
/** Table order: points, goal difference, goals for; you ahead on a dead heat; then by name. */
export function sortTable(rows: LeagueRow[]): LeagueRow[] {
  return rows.slice().sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || (a.you ? -1 : b.you ? 1 : a.club < b.club ? -1 : a.club > b.club ? 1 : 0));
}
/** The seeded opening of a match: one of its club style's formations. */
export function kickoffFor(seed: string, round: number, kind: number, style: StyleId) {
  const pool = KICKOFFS.filter((k) => k.style === style);
  return pool[Math.floor(stream(seed, "kickoff", round, kind)() * pool.length)] || KICKOFFS[0];
}

/**
 * The best goal of a posted trail, with its move, for the share image and the Hall: replays the trail (any rules)
 * and returns `best`, or null when the trail does not replay or scored nothing. No storage: the trail is the record.
 */
export function pathOf(ed: Edition, seed: string, trail: string): BestGoal | null {
  try {
    const p = parseTrail(trail);
    return rerun(ed, seed, p.actions, p.mode, p.rules).s.best;
  } catch {
    return null;
  }
}

/** Re-runs an action list; throws on the first illegal action. */
export function rerun(ed: Edition, seed: string, actions: Action[], mode: RunMode = "season", rules: Rules = CURRENT_RULES): Run {
  const r = new Run(ed, seed, mode, rules);
  for (const a of actions) r.apply(a);
  return r;
}

// ------------------------------------------------------------ compact action trail
/**
 * A trail is its tokens, then its actions, all joined by "_": first the rules ("R3"; none for the legacy rules), then
 * the mode ("H" for the Haunted table; none for a season). So a trail can't be posted under other rules or another
 * mode, and a legacy trail encodes exactly as it did in 2.1.
 */
export function encodeTrail(actions: Action[], mode: RunMode = "season", rules: Rules = CURRENT_RULES): string {
  if (TOKEN_OF[rules] === undefined) throw new Error("unknown rules");
  if (mode === "daily" && rules < RULES_NEXT) throw new Error("the Daily match day needs rules 3");
  const parts = [TOKEN_OF[rules], mode === "haunt" ? "H" : mode === "daily" ? "D" : ""].filter(Boolean);
  if (actions.length) parts.push(encodeTrail0(actions));
  return parts.join("_");
}
/** Splits a posted trail into its rules, mode and actions. Throws on anything malformed, and on an unknown rules token. */
export function parseTrail(str: string): { rules: Rules; mode: RunMode; actions: Action[] } {
  let rules: Rules = RULES_LEGACY;
  let rest = str;
  if (rest.startsWith("R")) {
    const cut = rest.indexOf("_");
    const tok = cut < 0 ? rest : rest.slice(0, cut);
    if (!Object.prototype.hasOwnProperty.call(RULE_TOKEN, tok)) throw new Error("unknown rules");
    rules = RULE_TOKEN[tok];
    rest = cut < 0 ? "" : rest.slice(cut + 1);
    if (cut >= 0 && rest === "") throw new Error("bad trail");
  }
  if (rest === "D" || rest.startsWith("D_")) {
    // the Daily match day exists from rules 3 on: a "D" under the legacy rules is forged
    if (rules < RULES_NEXT || rest === "D_") throw new Error("unknown mode");
    return { rules, mode: "daily", actions: rest === "D" ? [] : decodeTrail(rest.slice(2)) };
  }
  if (rest === "H") return { rules, mode: "haunt", actions: [] };
  if (rest.startsWith("H_")) return { rules, mode: "haunt", actions: decodeTrail(rest.slice(2)) };
  return { rules, mode: "season", actions: decodeTrail(rest) };
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

