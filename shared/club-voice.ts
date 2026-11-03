// KICKER Club: the wire. One dry line of market copy for each chance, decision and full time of a club match.
// Pure and seeded: the same moment at the same count always reads the same. No exclamation marks, ever, and every
// filled line fits a phone rail (72 characters at most).
import type { Moment, Side } from "./club.js";
import { hash32 } from "./rng.js";

type Pool = readonly string[];
/** {t} the shooter's ticker ($SYM), {club} the club that had the chance, {other} the club defending it, {min} the minute. */
const POOLS: Keyed<string, Pool> = {
  goalHome: [
    "{t} scores. Filled at the top of the book.",
    "{t} finds the net. The stands mark it to market.",
    "In off {t}. A clean entry and a clean exit.",
    "{t} converts. {other} reprice their defence.",
    "{t}, {min}'. Somebody update the chart.",
    "Goal for {club}. {t} took the liquidity on offer.",
    "{t} buys the dip in their back line. In.",
    "{t} scores and the home end refreshes the price.",
  ],
  goalAway: [
    "{club} score through {t}. A red candle at home.",
    "{t} gets one for {club}. The stands go quiet.",
    "{t} scores for {club}. Somebody sold the top.",
    "Against the run. {t} puts {club} on the board.",
    "{t} for {club}, {min}'. Slippage at the back.",
    "{club} take the spread. {t} with the finish.",
    "{t} finds a gap nobody priced. {club} score.",
    "Goal {club}. {t} front-ran the whole defence.",
  ],
  saveHome: [
    "{t} shoots. Their keeper absorbs the sell wall.",
    "Saved. {t} had the angle, not the fill.",
    "{t} tests the keeper. Order rejected.",
    "Good hands from {other}. {t} stays at zero.",
    "{t} from range. Their keeper holds support.",
    "Keeper says no to {t}. Limit order, not filled.",
    "{t} hits it well. The glove hits it better.",
    "Saved at the post. {t} reprices the next one.",
  ],
  saveAway: [
    "{t} shoots for {club}. Your keeper holds it.",
    "Saved. Your keeper keeps the floor intact.",
    "{t} tests your keeper. Bid holds.",
    "Your keeper reads {t} like an order book.",
    "Strong hands in goal. {club} stay flat.",
    "{t} pulls the trigger. Your keeper catches it.",
    "Your keeper parks a stop at the post. {t} hits it.",
    "Big save. {club} were already pricing it in.",
  ],
  blockHome: [
    "{t} shoots into traffic. Blocked.",
    "Their defence stacks bids. {t} can't get through.",
    "Blocked at the back. {t} needs a better entry.",
    "{t} tries it. A body in the way, as usual.",
    "Wall of orders. {t} bounces off it.",
    "{other} block {t}. Thin market in the box.",
    "{t} shoots, the defence front-runs it.",
    "Charged down. {t} waits for the next print.",
  ],
  blockAway: [
    "Your defence blocks {t}. Support holds.",
    "{t} shoots into your back line. Rejected.",
    "Blocked. Your defence absorbs the sell-off.",
    "{club} push, your defence pushes back.",
    "{t} hits a wall of your bids. Stopped.",
    "Your back line takes the hit for the keeper.",
    "{t} looks for the gap. Your defence closes it.",
    "Good block. {club} reset the position.",
  ],
  wideHome: [
    "{t} pulls it wide. Mispriced.",
    "Wide from {t}. The post was never in range.",
    "{t} shoots past the post. Fat finger.",
    "Off target. {t} sends it to the stands.",
    "{t} drags it wide. No fill.",
    "Wide. {t} had the room and spent it.",
    "{t} aims for the corner, finds the crowd.",
    "Over the line, outside the post. {t} again.",
  ],
  wideAway: [
    "{t} misses for {club}. Relief at home.",
    "Wide from {club}. The home end exhales.",
    "{t} puts it past the post. Lucky print.",
    "{club} waste it. {t} finds row Z.",
    "Off target from {t}. Your book stays clean.",
    "{t} shoots wide. {club} keep their bags.",
    "Miss from {club}. That was free money.",
    "{t} drags it wide. Nobody at home complains.",
  ],
};

const DECIDE: Pool[] = [
  [
    "Half an hour gone. The manager reads the tape.",
    "Thirty minutes in. Time to rebalance.",
    "Thirty minutes on the clock. Adjust the position.",
    "Thirty minutes priced in. The bench is listening.",
  ],
  [
    "The hour mark. Legs are getting heavy.",
    "Sixty minutes. Rotation season.",
    "An hour gone. The bench could use a ticket.",
    "Sixty minutes. Fresh legs trade at a premium.",
  ],
  [
    "Fifteen minutes left. Last chance to reposition.",
    "Into the last fifteen. Risk on or risk off.",
    "Fifteen to go. The closing auction starts here.",
    "Late session. Decide what this result is worth.",
  ],
];

const FULL: Keyed<"win" | "draw" | "loss", Pool> = {
  win: [
    "Full time. {home} {h}, {away} {a}. A gain.",
    "Final whistle. {home} close green, {h}-{a}.",
    "{home} win {h}-{a}. The table moves up.",
    "Full time, {h}-{a}. {away} take the loss on the chin.",
    "{home} bank three points. {h}-{a} at the bell.",
    "Closing price {h}-{a}. {home} in profit.",
  ],
  draw: [
    "Full time. {h}-{a}. Flat close.",
    "{home} and {away} share it, {h}-{a}.",
    "A point each. The chart went sideways.",
    "Full time, {h}-{a}. Nobody gets the spread.",
    "Level at the bell, {h}-{a}. One point booked.",
    "{h}-{a}. Range-bound to the last minute.",
  ],
  loss: [
    "Full time. {home} {h}, {away} {a}. A red day.",
    "{away} win {a}-{h}. {home} take the drawdown.",
    "Final whistle. {home} close red, {h}-{a}.",
    "Full time, {h}-{a}. Back to the dressing room.",
    "{away} take the points. {home} review trades.",
    "Closing price {h}-{a}. Not the entry {home} wanted.",
  ],
};

const fill = (s: string, f: Keyed<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(f[k] ?? ""));
const pickOf = (pool: Pool, key: string) => pool[hash32(key) % pool.length];

/** The wire's line for one chance. `n` is the count of lines shown this match (it varies repeats). */
export function lineFor(m: Moment, home: Side, away: Side, n: number): string {
  const att = m.side === 0 ? home : away;
  const def = m.side === 0 ? away : home;
  const l = att.squad[m.who];
  const t = l ? "$" + l.s : "the striker";
  const kind = m.out + (m.side === 0 ? "Home" : "Away");
  const pool = POOLS[kind] || POOLS.wideHome;
  return fill(pickOf(pool, `${kind}|${m.i}|${m.min}|${n}|${t}`), { t, club: att.name, other: def.name, min: m.min });
}

/** The wire while the manager decides (n = 0, 1, 2 for 30', 60', 75'). */
export function decisionLine(n: number, score: [number, number]): string {
  const pool = DECIDE[Math.max(0, Math.min(2, n))];
  return pickOf(pool, `d|${n}|${score[0]}|${score[1]}`);
}

/** The wire at full time, from the home side's view. */
export function fullTimeLine(score: [number, number], homeName: string, awayName: string, n: number): string {
  const [h, a] = score;
  const pool = FULL[h > a ? "win" : h < a ? "loss" : "draw"];
  return fill(pickOf(pool, `ft|${h}|${a}|${homeName}|${awayName}|${n}`), { home: homeName, away: awayName, h, a });
}

/** Every line template, for the length and punctuation checks. */
export const CLUB_LINES: string[] = [...Object.values(POOLS).flat(), ...DECIDE.flat(), ...Object.values(FULL).flat()];
