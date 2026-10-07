import { readFileSync } from "node:fs";
import { Run, rerun, encodeTrail, decodeTrail } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import type { Edition } from "../shared/data.js";
const ed: Edition = JSON.parse(readFileSync("scripts/edition.json", "utf8"));
const N = Number(process.argv[2] || 40);
const antes: number[] = [];
let t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seed = "AAAA-" + String(1000 + i).padStart(4, "0").replace(/[^0-9]/g, "0");
  const r = new Run(ed, seed);
  let steps = 0;
  while (botStep(r) && steps < 2000) steps++;
  antes.push(r.s.cleared);
  if (i < 3) {
    const trail = encodeTrail(r.trail);
    const r2 = rerun(ed, seed, decodeTrail(trail));
    console.info(seed, "cleared", r.s.cleared, "ante", r.s.ante, "best", r.s.best?.total, r.s.best?.hand, "money", r.s.money, "ins", r.s.insiders.map(j=>j.id).join(","), "replay same:", r2.s.cleared === r.s.cleared && r2.s.best?.total === r.s.best?.total, "loglen", trail.length);
  }
}
antes.sort((a, b) => a - b);
const hist: Keyed<number, number> = {};
for (const a of antes) hist[a] = (hist[a] || 0) + 1;
console.info("blinds cleared histogram", hist, "median", antes[Math.floor(N / 2)], "ms", Date.now() - t0);
