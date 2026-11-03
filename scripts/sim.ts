// Balance sim: the bot plays N seasons on a stored squad cut and reports against the 3.0 balance targets.
//   npx tsx scripts/sim.ts [N] [cut.json] [--haunt | --daily] [--rules=2|3] [--ablate=power|pace|grip] [--ablation] [--json]
// --ablation runs the plain sim and then one run per stat taken away from every figure (base and coaches), and
// prints what each stat is worth in matches. It also checks that replays agree.
import { readFileSync } from "node:fs";
import { Run, rerun, encodeTrail, parseTrail, CURRENT_RULES, R3, type RunMode, type Rules, type Ev } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import type { Edition } from "../shared/data.js";

const flag = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const mode: RunMode = process.argv.includes("--haunt") ? "haunt" : process.argv.includes("--daily") ? "daily" : "season";
const rules = Number(flag("rules") || CURRENT_RULES) as Rules;
const N = Number(args[0] || 300);
const ed: Edition = JSON.parse(readFileSync(args[1] || "scripts/edition.json", "utf8"));

// --set=league=-1 --set=boss.jam=-2 ...: try other rules-3 numbers without editing the engine
for (const a of process.argv.filter((x) => x.startsWith("--set="))) {
  const [path, v] = a.slice(6).split("=");
  const keys = path.split(".");
  let o = R3 as unknown as Keyed<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Keyed<string, unknown>;
  o[keys[keys.length - 1]] = Number(v);
}

type Stat = "power" | "pace" | "grip";
const realSources = Run.prototype.statSources;
/** Takes one stat away from every figure, from its own numbers and from every coach. */
function ablate(stat: Stat | null) {
  Run.prototype.statSources = stat
    ? function (this: Run, l) {
        const out = realSources.call(this, l);
        out[stat] = [];
        return out;
      }
    : realSources;
}

export interface SimOut {
  n: number;
  through: number; // mean matches got through
  median: number;
  matches: number; // matches in a full season
  finals: number;
  wins: number;
  tableOut: number; // rules 3: seasons ended by the table
  boss: Keyed<string, [number, number]>;
  final: [number, number];
  kinds: Keyed<string, [number, number]>;
  /** per fixture kind: draws, goals for, goals against */
  kx: Keyed<string, [number, number, number]>;
  /** where the league ended for the seasons that finished it */
  pos: Keyed<number, number>;
  styles: Keyed<string, number>;
  goals: number;
  against: number;
  defend: number;
  noThreat: number;
  replays: string;
  ms: number;
}

export function sim(stat: Stat | null, n = N): SimOut {
  ablate(stat);
  const t0 = Date.now();
  const out: SimOut = { n, through: 0, median: 0, matches: 0, finals: 0, wins: 0, tableOut: 0, boss: {}, final: [0, 0], kinds: {}, kx: {}, pos: {}, styles: {}, goals: 0, against: 0, defend: 0, noThreat: 0, replays: "", ms: 0 };
  const thr: number[] = [];
  let replayOk = 0;
  let replayN = 0;
  for (let i = 0; i < n; i++) {
    const k = String(i).padStart(4, "0");
    const sd = "SIM" + k[0] + "-" + k.slice(1) + "Q";
    const r = new Run(ed, sd, mode, rules);
    out.matches = r.rounds * 3;
    const apply = r.apply.bind(r);
    r.apply = (a) => {
      if (r.s.phase === "defend") {
        out.defend++;
        if (!r.threats().length) out.noThreat++;
      }
      apply(a);
      for (const ev of r.events as Ev[]) if (ev.e === "goal" && ev.side === 0) out.styles[ev.style] = (out.styles[ev.style] || 0) + 1;
    };
    let steps = 0;
    while (steps++ < 40000 && botStep(r));
    const s = r.s;
    const played = s.story.length;
    const t = played - (s.phase === "over" ? 1 : 0);
    thr.push(t);
    out.through += t;
    if (s.phase === "won") out.wins++;
    const last = s.story[s.story.length - 1];
    if (s.phase === "over" && last && last.kind < 2 && last.args.out) out.tableOut++;
    s.story.forEach((line, j) => {
      const lostIt = line.key === "lost" || (line.key === "draw" && line.kind === 2);
      const ended = j === s.story.length - 1 && s.phase === "over";
      const kb = (out.kinds[["F", "L", "B"][line.kind]] ||= [0, 0]);
      kb[0]++;
      if (lostIt) kb[1]++;
      const kx = (out.kx[["F", "L", "B"][line.kind]] ||= [0, 0, 0]);
      if (line.key === "draw") kx[0]++;
      kx[1] += Number(line.args.for);
      kx[2] += Number(line.args.against);
      if (line.kind < 2 && line.round === r.rounds && line.kind === 1 && line.args.pos) out.pos[Number(line.args.pos)] = (out.pos[Number(line.args.pos)] || 0) + 1;
      if (line.kind === 2) {
        const final = line.round === r.rounds && mode === "season";
        const b = final ? out.final : (out.boss[String(line.args.boss)] ||= [0, 0]);
        b[0]++;
        if (ended || lostIt) b[1]++;
        if (final) out.finals++;
      }
    });
    out.goals += s.goalsFor;
    out.against += s.goalsAgainst;
    if (i < 12) {
      replayN++;
      const p = parseTrail(encodeTrail(r.trail, mode, r.rules));
      const r2 = rerun(ed, sd, p.actions, p.mode, p.rules);
      if (JSON.stringify(r2.s) === JSON.stringify(s)) replayOk++;
    }
  }
  thr.sort((a, b) => a - b);
  out.median = thr[Math.floor(n / 2)];
  out.through /= n;
  out.replays = `${replayOk}/${replayN}`;
  out.ms = Date.now() - t0;
  ablate(null);
  return out;
}

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
function report(o: SimOut, label: string) {
  console.info(`\n== ${label}: ${o.n} ${mode === "haunt" ? "Haunted runs" : "seasons"}, rules ${rules}, ${o.ms} ms`);
  console.info(`got through: mean ${o.through.toFixed(2)}, median ${o.median} of ${o.matches}`);
  if (mode === "season") console.info(`reached the final ${pct(o.finals, o.n)}, won ${pct(o.wins, o.n)}${rules >= 3 ? `, out on the table ${pct(o.tableOut, o.n)}` : ""}`);
  console.info("by fixture (met/lost): " + Object.entries(o.kinds).map(([k, [m, l]]) => `${k} ${m}/${l} ${pct(l, m)}`).join("  "));
  console.info("per fixture (draw%, gf, ga a match): " + Object.entries(o.kx).map(([k, [d, f, a]]) => `${k} ${pct(d, o.kinds[k][0])} ${(f / o.kinds[k][0]).toFixed(2)}:${(a / o.kinds[k][0]).toFixed(2)}`).join("  "));
  if (rules >= 3 && mode === "season") console.info("league finish (place: seasons): " + JSON.stringify(o.pos));
  if (mode === "season") {
    console.info("boss clubs (met/lost): " + Object.entries(o.boss).sort().map(([k, [m, l]]) => `${k} ${m}/${l} ${pct(l, m)}`).join("  "));
    console.info(`final: ${o.final[0]} met, ${o.final[1]} lost, ${pct(o.final[1], o.final[0])}`);
  }
  const g = Object.values(o.styles).reduce((a, b) => a + b, 0);
  console.info(`goals for ${(o.goals / o.n).toFixed(1)}, against ${(o.against / o.n).toFixed(1)} a run`);
  console.info("goal styles: " + Object.entries(o.styles).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, g)}`).join(", "));
  console.info(`team move + bank shot: ${pct((o.styles["Team move"] || 0) + (o.styles["Bank shot"] || 0), g)}`);
  console.info(`defend decisions ${o.defend}, with no threat ${pct(o.noThreat, o.defend)}`);
  console.info(`replays agree ${o.replays}`);
}

const json = process.argv.includes("--json");
if (process.argv.includes("--ablation")) {
  const base = sim(null);
  report(base, "plain");
  const rows: [string, number, number][] = [];
  for (const st of ["power", "pace", "grip"] as Stat[]) {
    const o = sim(st);
    rows.push([st, o.through, base.through - o.through]);
    if (!json) console.info(`no ${st}: through ${o.through.toFixed(2)} (median ${o.median}), worth ${(base.through - o.through).toFixed(2)} matches; final reached ${pct(o.finals, o.n)}; boss loss ${pct(Object.values(o.boss).reduce((a, b) => a + b[1], 0), Object.values(o.boss).reduce((a, b) => a + b[0], 0))}`);
  }
  if (json) console.info(JSON.stringify({ base, rows }));
} else {
  const st = (flag("ablate") as Stat) || null;
  const o = sim(st);
  if (json) console.info(JSON.stringify(o));
  else report(o, st ? `no ${st}` : "plain");
}
