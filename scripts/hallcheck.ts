// Hall of hands on prod: a verified run gets in, a forged one and a bad name do not.
import { Run, encodeTrail } from "../shared/engine.js";
import { botStep } from "../shared/bot.js";
import type { Edition } from "../shared/data.js";
const B = "https://kickerhq.vercel.app";
const ed = (await (await fetch(B + "/api/shuffle")).json()) as Edition;
const seed = "HQ7A-0001";
const run = new Run(ed, seed);
let n = 0;
while (botStep(run) && n++ < 3000);
const post = (body: object) => fetch(B + "/api/showdown", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ok = await post({ seed, edition: ed.id, trail: encodeTrail(run.trail), name: "QAbot" });
const j = await ok.json();
console.info("verified run", ok.status, j.id, "best", j.showdown?.best?.total, "cards", j.showdown?.best?.cards?.length);
// forged: claim a run by replaying a different/illegal trail
const forged = await post({ seed, edition: ed.id, trail: encodeTrail(run.trail).replace(/p(\d+)/, "p999"), name: "Forger" });
console.info("forged", forged.status, (await forged.json()).error);
const bad = await post({ seed, edition: ed.id, trail: encodeTrail(run.trail), name: "fuck3r" });
console.info("bad name", bad.status, (await bad.json()).error);
const short = await post({ seed, edition: ed.id, trail: encodeTrail(run.trail), name: "ab" });
console.info("short name", short.status, (await short.json()).error);
const hall = await (await fetch(B + "/api/hall?nocache=" + Date.now())).json();
console.info("hall day", hall.day, "entries", hall.entries.length, "has QAbot", hall.entries.some((e: any) => e.id === j.id && e.name === "QAbot"), "has Forger", hall.entries.some((e: any) => e.name === "Forger"));
const r = await fetch(B + "/api/hall");
console.info("hall cache", r.headers.get("cache-control"));
const png = Buffer.from(await (await fetch(B + "/api/felt?id=" + j.id)).arrayBuffer());
console.info("felt png", png.subarray(1, 4).toString(), png.readUInt32BE(16), "x", png.readUInt32BE(20));
const { writeFileSync } = await import("node:fs");
writeFileSync("qa/v2/share-card.png", png);
