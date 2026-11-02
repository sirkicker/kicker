// Balance sim: the bot plays N seasons on a stored squad cut. `npx tsx scripts/sim.ts [N] [cut.json]`
// Reports how far it gets, how often it lifts the trophy, how matches are lost, and checks that replays agree.
import { readFileSync } from "node:fs";
import { Run, rerun, encodeTrail, decodeTrail } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import type { Edition } from "../shared/data.js";
import { ROUNDS } from "../shared/content.js";

const N = Number(process.argv[2] || 300);
const ed: Edition = JSON.parse(readFileSync(process.argv[3] || "scripts/edition.json", "utf8"));
const t0 = Date.now();
const cleared: number[] = [];
let wins = 0;
let finals = 0;
let played = 0;
let lost = 0;
const lostBy = { goals: 0, whistle: 0 };
const lostAt: Keyed<string, number> = {};
let gf = 0;
let ga = 0;
let touches = 0;
let replayOk = 0;
let bestSum = 0;
let draws = 0;
const bossSeen: Keyed<string, [number, number]> = {};
for (let i = 0; i < N; i++) {
  const n = String(i).padStart(4, "0");
  const sd = "SIM" + n[0] + "-" + n.slice(1) + "Q";
  const r = new Run(ed, sd);
  let steps = 0;
  while (steps++ < 40000 && botStep(r));
  const s = r.s;
  for (let rd = 1; rd <= s.round; rd++) {
    const id = s.bosses[rd - 1];
    const reached = rd < s.round || s.kind === 2 || s.phase === "won";
    if (!reached) continue;
    const lostHere = s.phase === "over" && rd === s.round && s.kind === 2;
    const b = (bossSeen[id] ||= [0, 0]);
    b[0]++;
    if (lostHere) b[1]++;
  }
  const through = s.cleared + s.draws;
  cleared.push(through);
  played += through + (s.phase === "over" ? 1 : 0);
  draws += s.draws;
  if (s.phase === "won") wins++;
  if (s.round === ROUNDS && s.kind === 2) finals++;
  if (s.phase === "over") {
    lost++;
    const m = s.match!;
    if (m.score[1] >= m.target) lostBy.goals++;
    else lostBy.whistle++;
    const k = `r${s.round}.${["F", "L", "B"][s.kind]}`;
    lostAt[k] = (lostAt[k] || 0) + 1;
  }
  gf += s.goalsFor;
  ga += s.goalsAgainst;
  touches += s.touchesTotal;
  bestSum += s.best?.total || 0;
  if (i < 12) {
    const r2 = rerun(ed, sd, decodeTrail(encodeTrail(r.trail)));
    if (r2.s.cleared === s.cleared && r2.s.best?.total === s.best?.total && r2.s.phase === s.phase) replayOk++;
  }
}
cleared.sort((a, b) => a - b);
const hist: Keyed<number, number> = {};
for (const c of cleared) hist[c] = (hist[c] || 0) + 1;
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
console.info(`seasons ${N}  ms ${Date.now() - t0}`);
console.info(`median matches got through ${cleared[Math.floor(N / 2)]} of ${ROUNDS * 3}  (round ${Math.floor(cleared[Math.floor(N / 2)] / 3) + 1})`);
console.info(`reached the final ${pct(finals, N)}  won the season ${pct(wins, N)}`);
console.info(`matches played ${played}, lost ${lost} = ${pct(lost, played)} of matches (by goals ${lostBy.goals}, at the whistle ${lostBy.whistle})`);
console.info(`goals for ${(gf / N).toFixed(1)} against ${(ga / N).toFixed(1)} per season, touches ${(touches / N).toFixed(0)}, best goal avg ${(bestSum / N).toFixed(0)}`);
console.info("matches got through histogram", JSON.stringify(hist), "draws", draws);
console.info("lost at", JSON.stringify(Object.fromEntries(Object.entries(lostAt).sort())));
console.info("boss clubs met/lost", JSON.stringify(bossSeen));
console.info(`replays agree ${replayOk}/${Math.min(12, N)}`);
