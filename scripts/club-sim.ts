// Balance check for KICKER Club: goals per match, home edge, tactics, form, the wall, the decisions.
import { readFileSync, readdirSync } from "node:fs";
import type { Edition } from "../shared/data.js";
import { autoPlay, houseSide, simulate, TACTICS, type Side } from "../shared/club.js";
const f = "../edition.json";
const ed = JSON.parse(readFileSync("scripts/fixtures/" + f, "utf8")) as Edition;
const pool = ed.pool.flat();
console.log("pool", pool.length);
const N = 4000;
let goals = 0, hw = 0, dr = 0, aw = 0;
const tac: Record<string, number[]> = {};
for (let i = 0; i < N; i++) {
  const h = houseSide(pool, 1, i, 0), a = houseSide(pool, 1, i, 1);
  const st = autoPlay(h, a, "s" + i);
  goals += st.score[0] + st.score[1];
  if (st.score[0] > st.score[1]) hw++; else if (st.score[0] < st.score[1]) aw++; else dr++;
}
console.log("goals/match", (goals / N).toFixed(2), "home W/D/L %", ((hw / N) * 100).toFixed(1), ((dr / N) * 100).toFixed(1), ((aw / N) * 100).toFixed(1));
const pts = (st: { score: number[] }) => (st.score[0] > st.score[1] ? 3 : st.score[0] === st.score[1] ? 1 : 0);
function edge(mod: (s: Side) => Side, label: string, pickChoice?: (n: number) => number) {
  let p0 = 0, p1 = 0;
  for (let i = 0; i < N; i++) {
    const h = houseSide(pool, 2, i, 0), a = houseSide(pool, 2, i, 1);
    p0 += pts(autoPlay(h, a, "e" + i));
    if (pickChoice) {
      const ch: number[] = [];
      let st = simulate(mod(h), a, "e" + i, ch);
      while (st.pending) { ch.push(pickChoice(st.pending.n) % st.pending.options.length); st = simulate(mod(h), a, "e" + i, ch); }
      p1 += pts(st);
    } else p1 += pts(autoPlay(mod(h), a, "e" + i));
  }
  console.log(label.padEnd(26), "ppg", (p0 / N).toFixed(3), "->", (p1 / N).toFixed(3));
}
edge((s) => ({ ...s, form: [3, 3, 3, 3] }), "form 3 everywhere");
edge((s) => ({ ...s, form: [0, 0, 0, 3] }), "form 3 attack");
edge((s) => ({ ...s, wall: 3 }), "wall 3");
edge((s) => ({ ...s, mood: 3 }), "mood 3");
for (const t of TACTICS) edge((s) => ({ ...s, tactic: t }), "tactic " + t);
edge((s) => s, "decide: option 1 always", () => 1);
edge((s) => s, "decide: option 2 always", () => 2);
