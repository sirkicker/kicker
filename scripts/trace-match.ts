// Prints one bot match touch by touch: `npx tsx scripts/trace-match.ts [seed] [matches]`
import { readFileSync } from "node:fs";
import { Run } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import type { Edition } from "../shared/data.js";
const ed: Edition = JSON.parse(readFileSync("scripts/edition.json", "utf8"));
const r = new Run(ed, process.argv[2] || "TRCE-0001");
const want = Number(process.argv[3] || 1);
const from = Number(process.argv[4] || 1);
const board = () => {
  const m = r.s.match;
  if (!m) return "";
  const rows: string[] = [];
  for (let x = 1; x <= 8; x++) {
    const side = [0, 0, 1, 0, 1, 0, 1, 1][x - 1];
    const rod = side === 0 ? [0, 1, -1, 2, -1, 3][x - 1] : [3, -1, 2, -1, 1, 0][x - 3];
    const lanes = new Array(10).fill(".");
    const RN = [1, 2, 5, 3], GAP = [0, 4, 2, 3];
    for (let f = 0; f < RN[rod]; f++) lanes[m.off[side][rod] + f * GAP[rod]] = side ? "o" : "x";
    if (m.ball.side === side && m.ball.rod === rod) lanes[m.off[side][rod] + m.ball.fig * GAP[rod]] = side ? "O" : "X";
    rows.push(`x${x} ${lanes.join("")}`);
  }
  return rows.join("  ");
};
let matches = 0;
let n = 0;
while (n++ < 5000) {
  const before = r.s.phase;
  if (before === "fixture") matches++;
  if (matches > want) break;
  const ok = botStep(r);
  const a = r.trail[r.trail.length - 1];
  if (matches >= from && (before === "attack" || before === "defend" || (a && a.t === "go"))) {
    const m = r.s.match;
    console.info(before.padEnd(7), JSON.stringify(a).padEnd(28), m ? `${m.score.join("-")} t${m.touches} ai${m.aiTouches} poss${m.poss.join("/")}` : "", r.events.map((e) => e.e + (e.e === "kick" ? ":" + e.result : e.e === "slide" ? `:${e.side}${e.why}` : "")).join(","));
    if (m) console.info("   ", board());
  }
  if (!ok) break;
}
console.info(r.s.phase, r.s.cleared);
