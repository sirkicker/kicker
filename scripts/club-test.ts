// KICKER Club rules: determinism, decisions only change what follows them, shootout, table, house clubs.
import { readFileSync } from "node:fs";
import type { Edition } from "../shared/data.js";
import { DECIDE_AT, autoPlay, houseSide, minutesOf, shootout, shootoutPlan, simulate, table, weekOf, weekStart, sideProblem, scoutOffers, firstSquad, KICKS } from "../shared/club.js";
import { lineFor, fullTimeLine, decisionLine, callLine, CLUB_LINES } from "../shared/club-voice.js";
const ed = JSON.parse(readFileSync("scripts/edition.json", "utf8")) as Edition;
const pool = ed.pool.flat();
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
const H = houseSide(pool, 7, 0, 0), A = houseSide(pool, 7, 0, 1);
ok(sideProblem(H) === null && sideProblem(A) === null, "house sides valid");
ok(JSON.stringify(houseSide(pool, 7, 0, 0)) === JSON.stringify(H), "house side stable");
for (let s = 0; s < 300; s++) {
  const seed = "t" + s;
  const m = minutesOf(seed);
  ok(m.every((x, i) => i === 0 || x >= m[i - 1]) && m[0] >= 1 && m[13] <= 90, "minutes sorted 1..90");
  const st0 = simulate(H, A, seed, []);
  ok(!!st0.pending && st0.pending.n === 0, "waits at the first decision");
  ok(st0.moments.every((x) => x.min <= DECIDE_AT[0]), "nothing after 30' before deciding");
  const a = simulate(H, A, seed, [0, 0, 0]);
  const b = simulate(H, A, seed, [1, 2, 1]);
  const pre = a.moments.filter((x) => x.min <= DECIDE_AT[0]);
  ok(JSON.stringify(pre) === JSON.stringify(b.moments.slice(0, pre.length)), "a choice never changes the past");
  ok(a.done && b.done && a.moments.length === 14, "14 chances");
  ok(JSON.stringify(simulate(H, A, seed, [1, 2, 1])) === JSON.stringify(b), "deterministic");
  const last = a.moments[13];
  ok(last.score[0] === a.score[0] && last.score[1] === a.score[1], "score adds up");
  for (const x of a.moments) {
    const l = lineFor(x, H, A, x.i);
    ok(l.length <= 72 && !l.includes("!"), "voice line fits: " + l);
  }
  const f = fullTimeLine(a.score, H.name, A.name, s);
  ok(f.length <= 72 && !f.includes("!"), "full time line fits: " + f);
  const d = decisionLine(s % 3, a.score);
  ok(d.length <= 72 && !d.includes("!"), "decision line fits: " + d);
  // shootout
  const plan = shootoutPlan(A, seed);
  ok(plan.takers.length === KICKS, "five takers");
  const picks = plan.dives.map((dv, k) => [dv, plan.shots[k]] as [0 | 1 | 2, 0 | 1 | 2]);
  ok(shootout(H, A, seed, picks).won === false || true, "shootout runs");
  const perfect = plan.dives.map((dv, k) => [(dv === 0 ? 2 : 0) as 0 | 1 | 2, plan.shots[k]] as [0 | 1 | 2, 0 | 1 | 2]);
  const r = shootout(H, A, seed, perfect);
  ok(r.won === true, "reading every kick wins the shootout");
}
const t = table(["a", "b", "c"], [{ a: 0, b: 1, sa: 2, sb: 1, seed: "", choices: [], at: 0, scorers: [] }, { a: 2, b: 0, sa: 0, sb: 0, seed: "", choices: [], at: 1, scorers: [] }]);
ok(t[0].name === "a" && t[0].pts === 4 && t[1].name === "c" && t[2].pts === 0, "table order");
ok(weekStart(weekOf(Date.parse("2026-11-04T12:00:00Z"))) === Date.parse("2026-11-02T00:00:00Z"), "weeks start Monday");
const sq = firstSquad(pool, "abc");
ok(new Set(sq.map((l) => l.t)).size === 14, "first squad: 14 different");
const off = scoutOffers(pool, sq, "abc", 5);
ok(off.length === 3 && off.every((l) => !sq.some((x) => x.t === l.t)), "scout offers 3 new");
let goals = 0;
for (let i = 0; i < 500; i++) { const st = autoPlay(houseSide(pool, 9, i, 0), houseSide(pool, 9, i, 1), "g" + i); goals += st.score[0] + st.score[1]; }
ok(goals / 500 > 2 && goals / 500 < 3.6, "goals per match " + (goals / 500).toFixed(2));
// 4.1: every wire template, and the call lines with real tactic names, fit the rail and keep the voice
const BANNED = /(card|deck|hand|chip|bet|odds|jackpot|spin|roll|loot|multiplier|payout|rarity|graduation|official|partner|sponsor|reward|earn|prize|guarantee|download)/i;
for (const l of CLUB_LINES) ok(!l.includes("!") && !BANNED.test(l), "wire template voice: " + l);
const beats = (x: string, y: string) => (x === "press" && y === "hold") || (x === "hold" && y === "counter") || (x === "counter" && y === "press");
for (const [id, label] of [["keep", "Stay Counter"], ["t:hold", "Switch to Hold"], ["t:press", "Switch to Press"], ["s:4:12", "$ABCDEFGH on for $XYZ"], ["park", "Park it"], ["allin", "All in"], ["next", "Push"], ["fresh", "Rotate"], ["keep", "Change nothing"]])
  for (const theirs of ["press", "counter", "hold"]) {
    const l = callLine(id, label, id.startsWith("t:") ? id.slice(2) : "counter", theirs, beats);
    ok(l.length <= 72 && !l.includes("!") && !l.includes("{"), "call line fits: " + l);
  }
ok(callLine("t:hold", "Switch to Hold", "hold", "counter", beats).includes("beats their Counter"), "call line names the matchup");
console.log(fails ? `${fails} FAILED` : "club rules: all ok");
process.exit(fails ? 1 : 0);
