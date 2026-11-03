// The desk: one dry line of market-wire copy for something that just happened on the table. Pure and seeded: the
// same event in the same run at the same count always reads the same. No exclamation marks, ever.
// The table shows the line on the rail; the season recap (`recapOf`) reuses it. Every filled line fits a phone rail (72 characters at most; the tests check it).
import type { Ev, Run } from "./engine.js";
import type { Launch } from "./data.js";
import { BOSS, KICKOFFS, RODS } from "./content.js";
import { hash32 } from "./rng.js";

/** Tokens a line may carry: ticker, 24h change, holders, 24h trades, curve %, club, passes, place, points, lane, opening. */
type Fill = { t: string; pct: string; h: number; k: number; cv: string; club: string; n: number; pos: number; pts: number; lane: number; ko: string };

const POOLS: Keyed<string, string[]> = {
  // ---- goals, by style
  goalTap: [
    "{t} taps it in. Low risk, filled.",
    "Tap-in for {t}. The easy trade still counts.",
    "{t} walks it in at market.",
    "Simple execution. {t} scores.",
    "{t} from close range. No slippage.",
    "A tap-in. {t} takes the spread.",
    "{t} gets there first and tidies it up.",
    "Short distance, clean fill. {t}.",
  ],
  goalAngled: [
    "{t} finds the corner.",
    "Angled in by {t}. The keeper read the other side.",
    "{t} cuts it across. In at the far lane.",
    "{t} prices in the angle and scores.",
    "Off the diagonal. {t} finds the net.",
    "{t} works the angle. Filled at the post.",
    "Sideways trade, upward result. {t}.",
    "{t} bends it in from the wide lane.",
  ],
  goalOneTouch: [
    "One touch, one goal. {t}.",
    "{t} hits it first time. No time to react.",
    "Straight off the pass. {t} scores.",
    "Quick execution from {t}. In.",
    "{t} does not wait for the book to move.",
    "First touch, final price. {t}.",
    "{t} front-runs the keeper. Goal.",
    "In off one touch. {t} was already set.",
  ],
  goalTeam: [
    "Team move. {t} finishes what the midfield started.",
    "The whole rod gets a share. {t} scores.",
    "Volume on the move, and {t} finishes.",
    "Build-up pays off. {t} in.",
    "Patient accumulation. {t} scores.",
    "Order flow through the middle. {t} at the end.",
    "They chased the ball. {t} chased nothing.",
    "Liquidity through midfield, {t} at the post.",
  ],
  goalLong: [
    "From distance. {t} scores from deep.",
    "{t} from range. The keeper never got set.",
    "Long position, held to the line. {t}.",
    "{t} shoots from midfield. In.",
    "Out of nowhere, {t} from deep.",
    "{t} prices it from the halfway line.",
    "Long-dated, short wait. {t} scores.",
    "{t} lets it go early. The book was open.",
  ],
  goalBank: [
    "Off the wall and in. {t}.",
    "{t} banks it off the side. Nobody priced that.",
    "Bank shot from {t}. The wall did the work.",
    "{t} plays it off the rail. Goal.",
    "Arbitrage off the side wall. {t}.",
    "{t} uses the wall as liquidity. In.",
    "A bank shot. {t} found the hidden route.",
    "Off the wall, past the keeper. {t}.",
  ],
  goalPower: [
    "{t} drives it through. Power wins.",
    "Straight through the block. {t}.",
    "{t} pushes through the wall of orders.",
    "Power drive from {t}. The blocker never had it.",
    "{t} hits it hard enough to clear the book.",
    "Through traffic. {t} scores.",
    "{t}, {cv} along its curve, goes straight through.",
    "Market order, full size. {t} scores.",
  ],
  goalUp: [
    "{t}, up {pct} on the day, finds the net.",
    "{t} keeps running. Up {pct} and in.",
    "Momentum trade. {t}, up {pct}, scores.",
    "{t} is up {pct} today. Up one more now.",
    "Green day for {t}: up {pct}, one goal.",
    "{t} rides a {pct} move into the net.",
    "Up {pct} and scoring. {t} is having a day.",
    "{t}, {h} holders watching, up {pct}. Goal.",
  ],
  goalDown: [
    "{t}, down {pct}, scores anyway.",
    "Buy the dip. {t} finds the net.",
    "{t} was down {pct}. Not any more.",
    "Down {pct} on the day, up one on the table. {t}.",
    "{t} shrugs off a {pct} drop and scores.",
    "Red chart, green finish. {t}.",
    "{t}, down {pct}, prints a goal.",
    "Dip buyers were right about {t}.",
  ],
  // ---- your shots and passes that don't arrive
  blockedKeeper: [
    "Blocked at the keeper. Liquidity was thinner than it looked.",
    "The keeper takes the other side.",
    "Their keeper absorbs the order.",
    "Straight at the keeper. Rejected.",
    "The keeper was sitting on that lane.",
    "Their keeper fills it at the limit.",
    "Saved. The keeper had that level marked.",
    "Into the keeper's lane. No fill.",
  ],
  tight: [
    "Tight to the keeper. He reaches it.",
    "The keeper stretches. That lane was too close.",
    "Tight shot, long arm. Saved.",
    "Next to the keeper is still the keeper's lane.",
    "The reach covers it. Needed a pass first, or a wall.",
    "Tight lane, no Power to spare. Saved.",
    "He gets a glove to it. Tight is tight.",
    "The keeper leans one lane over. Enough.",
  ],
  blocked: [
    "Blocked. The lane was already priced in.",
    "Stopped in the book. Their ball.",
    "Rejected at the rod.",
    "Blocked. The order hits a wall of figures.",
    "Their rod was there first.",
    "No fill. They had that lane covered.",
    "Blocked in transit. Their ball now.",
    "The kick meets resistance at the rod.",
  ],
  kept: [
    "Blocked, but the grip holds. Still yours.",
    "Partial fill. You keep the ball.",
    "{t} holds on. {h} holders do not sell easily.",
    "Grip from {t}. The ball stays.",
    "Blocked pass, firm grip. Still your ball.",
    "{t} keeps it under pressure.",
    "Rejected, but not lost. {t} still has it.",
    "Sticky ball. {t} does not let go.",
  ],
  // ---- their kicks
  saved: [
    "Saved. Their order never fills.",
    "Your rod takes the other side. Your ball.",
    "Stopped. The spread was yours.",
    "Blocked. You read that one.",
    "Their shot hits your rod. Ball back.",
    "Good position. Their kick goes nowhere.",
    "Your figure was in the lane. Your ball.",
    "Cancelled before it filled. Your ball.",
  ],
  wide: [
    "{t} is wide enough for two lanes.",
    "Wide body. {t} covers the gap beside it.",
    "{t}, {h} holders deep, blocks the lane next door.",
    "They aimed beside {t}. Beside was still {t}.",
    "Grip at the back. {t} takes up two lanes.",
    "{t} leans across and blocks it.",
    "A wide body from {t}. Their lane closes.",
    "Big position, big footprint. {t} blocks it.",
  ],
  conceded: [
    "They score. A correction, nothing more.",
    "Their shot clears. Red candle.",
    "Conceded. The chart dips.",
    "They find the net. The spread widens.",
    "One against. Time to buy back.",
    "They get one. The book moves against you.",
    "Goal to them. Not the end of the session.",
    "Conceded. Mark it down and move on.",
  ],
  // ---- the build-up
  chain: [
    "Two passes. Volume picks up.",
    "The ball moves. So do they.",
    "A move builds through the middle.",
    "Two touches of build-up. The shot gets Power.",
    "Pass and pass. The book starts to thin.",
    "Two clean fills in a row.",
    "Order flow through midfield.",
    "The build-up is on. Next shot carries more.",
  ],
  chainLong: [
    "{n} passes. Volume on the move.",
    "{n} passes deep. The book is thin.",
    "{n} touches of build-up. Something is coming.",
    "Team move: {n} passes and counting.",
    "{n} passes. They are chasing the tape.",
    "Sustained buying. {n} passes.",
    "{n} passes without a fill against. Rare.",
    "{n} in a row. The desk is paying attention.",
  ],
  firstUp: [
    "{t} takes it first time. They have not moved.",
    "Quick feet from {t}. No time for them to react.",
    "{t} trades {k} times a day. It does not wait.",
    "Pace on the receiver. {t} can shoot now.",
    "{t} is already set. They are still repricing.",
    "First time on for {t}.",
    "{t} on the ball before they react.",
    "Fast fill to {t}. The lane is still open.",
  ],
  // ---- the ball changes hands
  touches: [
    "Out of touches. They reprice the ball.",
    "Session over. Their ball.",
    "No touches left. Liquidity moves to them.",
    "Time is up on that possession. Their ball.",
    "Out of touches. The move expires.",
    "Touches spent, nothing filled. Their ball.",
    "The clock runs out on the move.",
    "Possession closed without a trade.",
  ],
  dead: [
    "Their touches run dry. Your ball.",
    "They stall. The ball comes back.",
    "They run out of ideas. Your ball.",
    "Nothing doing for them. Ball back to you.",
    "Their move expires. Your keeper has it.",
    "They pass it around and lose it.",
    "Dead ball. You restart from the back.",
    "No fill for them this time. Your ball.",
  ],
  // ---- kickoff, full time
  kickoff: [
    "Kickoff against {club}. {ko} from the first whistle.",
    "{club} line up. You open {ko}.",
    "Market open. {club} in session.",
    "First whistle. {ko} is the opening.",
    "{club} across the felt. Trading begins.",
    "The bell rings on {club}. Your shape: {ko}.",
    "Opening position: {ko}. {club} watching.",
    "Kickoff. {club} take the other side.",
  ],
  won: [
    "Full time. Closed green.",
    "Whistle. Up on the day.",
    "Full time. Position closed in profit.",
    "Whistle. A green candle for the record.",
    "That is the session. Green.",
    "Full time. The trade worked.",
    "Closed up. On to the next fixture.",
    "Whistle. Booked at a higher price.",
  ],
  draw: [
    "Full time, level. Flat on the day.",
    "Whistle. Sideways, but through.",
    "Level at the whistle. Range-bound.",
    "Full time. Nobody moved the price.",
    "A point each. Flat close.",
    "Whistle. Unchanged on the session.",
    "Level. The book balances out.",
    "Full time, all square. Low volume.",
  ],
  lost: [
    "Full time. Closed red.",
    "Whistle. Position stopped out.",
    "Full time. The trade went against you.",
    "Closed lower. Review the tape.",
    "Whistle. That one closes red on the record.",
    "Full time. Down on the session.",
    "Stopped out at the whistle.",
    "Lost. The market had other plans.",
  ],
  final: [
    "Closing Bell. Last trade of the season, and it fills.",
    "Closing Bell. The season closes green.",
    "Final whistle. The season is booked.",
    "Closing Bell rings. Champions at the close.",
    "The final settles in your favour.",
    "Last trade of the year. It went your way.",
    "Closing Bell. Top of the market.",
    "Season closed. All positions green.",
  ],
  // ---- boss clubs: a general pool, then each rule's own
  rule: [
    "{club} in session. Read the rule.",
    "{club} sets the terms today.",
    "Conditions today come from {club}.",
    "Cup tie. {club} brings its own rules.",
    "{club}: new terms, same table.",
    "{club} is on. One rule changes.",
    "Read the small print. {club} wrote it.",
    "{club} at the door. The rule is on the rail.",
  ],
  rule_rug: ["The Rug pulls your defence. Play from the keeper up.", "Your defence is gone for the match. The Rug was always like this.", "No back line today. The Rug took it."],
  rule_halt: ["Trading Halt. One rod frozen until somebody scores.", "Halted. Score once and the market reopens.", "One rod frozen. The first goal lifts it."],
  rule_vcheck: ["Vibe Check. Only figures with a stat may shoot.", "Numbers at the door. No stat, no shot.", "Vibe Check is on. Shoot with Power, Pace or Grip."],
  rule_depeg: ["The Depeg. Every shot drifts a lane.", "Aim one lane over. The Depeg pulls everything.", "Nothing holds its peg today. Shots drift."],
  rule_gasspike: ["Gas Spike. Every slide costs two.", "Fees doubled. Free slides stay free.", "Expensive day to move a rod."],
  rule_jam: ["Mempool Jam. Passes land a turn late.", "Your passes queue. They react first, unless it is to Pace.", "Congested today. Fast feet skip the queue."],
  rule_slip: ["Max Slippage. One touch fewer every possession.", "You get less than you asked for. One touch less.", "Slippage on. Spend touches carefully."],
  rule_lockup: ["Lockup. Your keeper does not move.", "The keeper is vested in place.", "Locked keeper. Block in front of it."],
  rule_wash: ["Wash Trade. Their rod copies your slides.", "Every slide you make, they make too.", "Mirror trading on. Plan two moves at once."],
  rule_bell: ["Closing Bell. First to three, their best eleven.", "The final. Their keeper takes three Power.", "Last session of the season. Everything on it."],
  haltLift: ["The halt lifts. The market reopens.", "Trading resumes. Every rod moves again.", "First goal in. The frozen rod thaws.", "Halt over. Back to normal hours."],
  // ---- table events, at kickoff
  event_volatile: ["Volatile session. The walls kick back two lanes.", "Walls are springy today. Bank shots travel.", "High volatility: off a wall the ball runs twice as far.", "Volatile. Angles you did not plan for."],
  event_thin: ["Thin book. Lane {lane} is sticky through midfield.", "One lane is sticky. No kick runs along it there.", "Thin liquidity in lane {lane}. Route around it.", "A sticky lane in midfield. Kicks stop there."],
  event_green: ["Green candle. An extra touch to open.", "Opening strong: +1 touch on your first possession.", "Green at the open. Use the extra touch.", "A green start. One more touch on the first move."],
  event_halfhalt: ["Halt on the half. No long passes on the first possession.", "Short passes only to start. The half line is shut.", "Circuit breaker at halfway. Build it up rod by rod.", "First possession each: no pass over a rod."],
  // ---- the league table
  tableTop: ["Top of the table after that.", "First place. Everyone else is chasing.", "Leading the league on {pts} points.", "Top spot. The final is in reach.", "Top of the book on {pts} points.", "Clear at the top, for now."],
  tableSecond: ["Second in the table. Still in the top two.", "In the top two, just. {pts} points.", "Second place. The final line holds.", "Second on {pts}. One place above the line.", "Holding second. Every point counts now.", "Top two, second. Keep it there."],
  tableChase: ["Place {pos}. Outside the top two.", "Outside the top two. Points needed.", "Place {pos} on {pts} points. The final needs more.", "The table says {pos}. Not good enough yet.", "Chasing the top two from place {pos}.", "Below the line in place {pos}. Time to buy."],
  tableOut: ["The table closes the door. Out of the top two.", "No way back into the top two. Season over.", "Out on the table. The final goes on without you.", "Mathematically out. The table has spoken."],
  // ---- the Haunted table
  haunted: [
    "Lights down. The ghost clubs take the felt.",
    "Last traded a long time ago. Still turning up.",
    "Ghost rules on. One rod phases, one drifts.",
    "Zero volume, full attendance. Kickoff.",
    "The quietest launches in the cut, lined up against you.",
    "Graveyard shift. Watch the arrow by the rod.",
    "Delisted, still playing. Kickoff in the dark.",
    "No trades in a day, and still in the line-up.",
  ],
  ghost: [
    "The poltergeist moves a rod. It was signalled.",
    "A rod drifts on its own. Read the arrow.",
    "Something moved their rod. Nobody touched it.",
    "Ghost drift, one lane. Signalled a touch ago.",
    "Their rod slides by itself. Priced in, if you looked.",
    "A cold draft moves a rod.",
    "The drift lands where the arrow said.",
    "Nobody on the grip. The rod moved anyway.",
  ],
  // ---- the season recap (programme)
  recapWon: ["Champions. The season closed green.", "Closing Bell won. A season booked in full.", "Top of the market at the close.", "Every position closed green. Champions."],
  recapFinal: ["Out in the final. Second best in the market.", "The Closing Bell rang against you. Runners-up.", "A final reached and lost. Close, not filled."],
  recapCup: ["Knocked out by {club} in the cup. Round {pos}.", "Cup exit to {club}. The season stops in round {pos}.", "{club} ended it in round {pos}. A cup tie lost."],
  recapTable: ["Out on the table in round {pos}. The top two pulled clear.", "The league closed the door in round {pos}.", "Round {pos}: no way back into the top two."],
  recapOut: ["Out to {club} in round {pos}.", "{club} closed the season in round {pos}.", "Stopped out by {club}, round {pos}."],
  recapScorer: ["{t} led the line with {n} goals.", "Launch of the season: {t}, {n} goals.", "{t} scored {n}. Nobody else came close.", "Top scorer {t}, {n} goals, {h} holders."],
  recapNone: ["No goals to speak of. A quiet season on the desk.", "The scoresheet stayed empty. Thin volume."],
};

function fill(line: string, f: Fill): string {
  const v: Keyed<string, string> = { t: f.t, pct: f.pct, h: String(f.h), k: String(f.k), cv: f.cv, club: f.club, n: String(f.n), pos: String(f.pos), pts: String(f.pts), lane: String(f.lane), ko: f.ko };
  return line.replace(/\{(\w+)\}/g, (all, k: string) => v[k] ?? all);
}

const pctOf = (l: Launch | undefined) => (l && l.x !== null ? `${Math.round(Math.abs(l.x) / 100)}%` : "");
const GOAL_KEY: Keyed<string, string> = {
  "Tap-in": "goalTap",
  "Angled finish": "goalAngled",
  "One-touch finish": "goalOneTouch",
  "Team move": "goalTeam",
  "Long range": "goalLong",
  "Bank shot": "goalBank",
  "Power drive": "goalPower",
};

function launchFill(f: Fill, l: Launch | undefined) {
  if (!l) return;
  f.t = `$${l.s}`;
  f.pct = pctOf(l);
  f.h = l.h;
  f.k = l.k;
  f.cv = `${Math.round(l.p / 100)}%`;
}

/**
 * The desk line for an event, or null when the desk stays quiet. `n` is a running count the caller keeps (events
 * shown so far this match, say) so repeats vary; the line depends only on the run's seed, the event and `n`.
 * A goal of yours speaks on its `goal` event (the `kick` before it stays quiet), so a goal reads once.
 */
export function lineFor(ev: Ev, ctx: { run: Run; n: number }): string | null {
  const { run, n } = ctx;
  const m = run.s.match;
  let key: string | null = null;
  const f: Fill = { t: "", pct: "", h: 0, k: 0, cv: "", club: m?.club || "", n: 0, pos: run.standing(), pts: 0, lane: 0, ko: "" };
  switch (ev.e) {
    case "kick": {
      if (ev.side === 0) {
        launchFill(f, run.s.squad[ev.slot]);
        if (ev.result === "blocked") key = ev.at && ev.at.rod === 0 ? (ev.tight ? "tight" : "blockedKeeper") : "blocked";
        else if (ev.result === "kept") key = "kept";
        else if (ev.result === "pass" && ev.toSlot >= 0 && run.firstTime(ev.toSlot)) {
          launchFill(f, run.s.squad[ev.toSlot]);
          key = "firstUp";
        }
      } else if (ev.result === "blocked" && ev.at) {
        // a wide body: their kick was stopped one lane beside the figure of yours that blocked it
        const rod = RODS[ev.at.rod];
        const slot = rod.slot + ev.at.fig;
        const cell = ev.steps.find((s) => s.x === rod.x);
        const own = m ? m.off[0][ev.at.rod] + ev.at.fig * rod.gap : -1;
        if (cell && own >= 0 && cell.lane !== own && run.wideBody(slot)) {
          launchFill(f, run.s.squad[slot]);
          key = "wide";
        } else key = "saved";
      }
      break;
    }
    case "goal":
      if (ev.side === 1) key = "conceded";
      else {
        const l = ev.slot !== undefined ? run.s.squad[ev.slot] : undefined;
        if (!l) return null;
        launchFill(f, l);
        const x = l.x ?? 0;
        // one goal in three by a big mover reads off its chart; the rest off how it was scored
        const chart = Math.abs(x) >= 1000 && hash32(`${run.s.seed}|chart|${n}`) % 3 === 0;
        key = chart ? (x > 0 ? "goalUp" : "goalDown") : GOAL_KEY[ev.style] || "goalTap";
      }
      break;
    case "chain":
      f.n = ev.n;
      key = ev.n >= 3 ? "chainLong" : ev.n === 2 ? "chain" : null;
      break;
    case "turnover":
      key = ev.why === "touches" ? (ev.to === 1 ? "touches" : "dead") : ev.why === "dead" ? "dead" : null;
      break;
    case "kickoff":
      // the opening whistle only; restarts after a goal stay quiet
      if (!m || ev.side !== 0 || m.score[0] + m.score[1] > 0) return null;
      f.ko = (KICKOFFS[m.kickoffId] || KICKOFFS[0]).name.toLowerCase();
      key = run.mode === "haunt" ? "haunted" : "kickoff";
      break;
    case "rule": {
      const b = BOSS[ev.id];
      if (!b) return null;
      f.club = b.name;
      if (ev.id === "halt" && ev.view.rod === -1) key = "haltLift";
      else key = hash32(`${run.s.seed}|rulepick|${n}`) % 2 === 0 && POOLS[`rule_${ev.id}`] ? `rule_${ev.id}` : "rule";
      break;
    }
    case "event":
      f.lane = (m?.sticky ?? 0) + 1;
      key = `event_${ev.id}`;
      break;
    case "slide":
      if (ev.why === "ghost") key = "ghost";
      break;
    case "whistle":
      key = ev.reason;
      break;
    case "standings": {
      const t = run.s.league;
      if (!t) return null;
      f.pts = t.find((r) => r.you)?.pts ?? 0;
      key = run.s.phase === "over" ? "tableOut" : f.pos === 1 ? "tableTop" : f.pos === 2 ? "tableSecond" : "tableChase";
      break;
    }
  }
  if (!key || !POOLS[key]) return null;
  return fill(pick(key, run.s.seed, n), f);
}

function pick(key: string, seed: string, n: number): string {
  const pool = POOLS[key];
  return pool[hash32(`${seed}|desk|${key}|${n}`) % pool.length];
}

/** Every line the desk can say, unfilled: for the word check in the tests. */
export const DESK_LINES: string[] = Object.values(POOLS).flat();
/** The pools by key, for the tests (every main event has at least eight lines). */
export const DESK_POOLS: Readonly<Keyed<string, readonly string[]>> = POOLS;

// ------------------------------------------------------------ the match-day programme (season recap)
export interface Recap {
  /** How the run ended: won, lost the final, out of the cup, out on the table, out to a fixture outside the league; "on" while it runs. */
  end: "won" | "final" | "cup" | "table" | "out" | "on";
  round: number;
  /** Launch of the season: the top scorer's squad slot, goals and ticker, or null with no goals. */
  launch: { slot: number; goals: number; ticker: string } | null;
  /** Rival of the season: the club you beat most, or (if you beat nobody) the one that beat you most. */
  rival: { club: string; won: number; drawn: number; lost: number } | null;
  /** League record (rules-3 season): place, points, won, drawn, lost. */
  table: { pos: number; pts: number; w: number; d: number; l: number } | null;
  /** Three desk lines summing the run up: how it ended, the top scorer, the best goal. */
  lines: string[];
}

/** The programme for a run: everything the season-over recap prints, from the run state only. Seeded and pure. */
export function recapOf(run: Run): Recap {
  const s = run.s;
  const last = s.story[s.story.length - 1];
  const end: Recap["end"] = s.phase === "won" ? "won" : s.phase !== "over" || !last ? "on" : last.args.final ? "final" : last.args.out ? "table" : last.kind === 2 ? "cup" : "out";
  let top = -1;
  for (const [k, v] of Object.entries(s.scorers)) if (top < 0 || v > (s.scorers[top] || 0)) top = Number(k);
  const launch = top >= 0 ? { slot: top, goals: s.scorers[top], ticker: s.squad[top].s } : null;
  const clubs: Keyed<string, { won: number; drawn: number; lost: number }> = {};
  for (const l of s.story) {
    const c = (clubs[String(l.args.club)] ||= { won: 0, drawn: 0, lost: 0 });
    if (l.key === "won") c.won++;
    else if (l.key === "draw") c.drawn++;
    else c.lost++;
  }
  const name = (a: [string, unknown], b: [string, unknown]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const byWon = Object.entries(clubs).sort((a, b) => b[1].won - a[1].won || b[1].lost - a[1].lost || name(a, b));
  const byLost = Object.entries(clubs).sort((a, b) => b[1].lost - a[1].lost || name(a, b));
  const r0 = byWon[0] && byWon[0][1].won > 0 ? byWon[0] : byLost[0];
  const rival = r0 ? { club: r0[0], ...r0[1] } : null;
  const me = s.league?.find((r) => r.you);
  const table = me ? { pos: run.standing(), pts: me.pts, w: me.w, d: me.d, l: me.l } : null;
  const f: Fill = { t: "", pct: "", h: 0, k: 0, cv: "", club: last ? String(last.args.club) : "", n: 0, pos: s.round, pts: me?.pts ?? 0, lane: 0, ko: "" };
  const lines: string[] = [];
  const endKey = { won: "recapWon", final: "recapFinal", cup: "recapCup", table: "recapTable", out: "recapOut", on: "" }[end];
  if (endKey) lines.push(fill(pick(endKey, s.seed, s.round), f));
  if (launch) {
    launchFill(f, s.squad[launch.slot]);
    f.n = launch.goals;
    lines.push(fill(pick("recapScorer", s.seed, launch.goals), f));
  } else lines.push(fill(pick("recapNone", s.seed, 0), f));
  if (s.best) {
    launchFill(f, s.squad[s.best.scorer]);
    lines.push(fill(pick(GOAL_KEY[s.best.style] || "goalTap", s.seed, s.best.total), f));
  }
  // the pools say "{n} goals" and "{h} holders": one of either reads singular
  const one = (l: string) => l.replace(/(^|\D)1 (goal|holder|trade)s\b/g, "$11 $2");
  return { end, round: s.round, launch, rival, table, lines: lines.map(one) };
}
