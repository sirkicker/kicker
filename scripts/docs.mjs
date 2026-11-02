// Refreshes the README screenshots in docs/ (1440x900) from a running build: the title, a match, a goal, their
// ball, the dressing room, a boss club, a figure's data tag and a share image.
// `node scripts/docs.mjs [base]` (base defaults to the local preview, scripts/preview.ts)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] || "http://127.0.0.1:5193";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("kk.tips", "9");
  localStorage.setItem("kk.news", JSON.stringify("2.0.0"));
});
const p = await ctx.newPage();
const K = (fn, a) => p.evaluate(fn, a);
const phase = () => K(() => window.kicker.ui.run?.s.phase);
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.screenshot({ path: "docs/title.png" });
await p.goto(base + "/?s=DOCS-0007", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await K(() => window.kicker.game.doGo());
await p.waitForTimeout(1800);
await K(() => window.kicker.game.hoverTarget(0));
await p.waitForTimeout(300);
await p.screenshot({ path: "docs/match.png" });
await K(() => window.kicker.game.hoverTarget(null));
// a figure's data tag
const pt = await K(() => window.kicker.screenOfSlot(9));
if (pt) {
  await p.mouse.move(pt.x, pt.y);
  await p.waitForTimeout(700);
  await p.screenshot({ path: "docs/live.png" });
  await p.mouse.move(5, 5);
}
await K(() => window.kicker.speed(3));
const seen = { goal: false, defend: false, room: false, boss: false };
for (let i = 0; i < 1500 && !(seen.goal && seen.defend && seen.room && seen.boss); i++) {
  const ph = await phase();
  if (ph === "over" || ph === "won") break;
  if (ph === "defend" && !seen.defend && (await K(() => window.kicker.game.run.threats().length)) > 0) {
    seen.defend = true;
    await p.waitForTimeout(300);
    await p.screenshot({ path: "docs/defend.png" });
  }
  if (ph === "attack" && !seen.goal && (await K(() => window.kicker.game.nextIsGoal()))) {
    await K(() => window.kicker.speed(1));
    void K(() => window.kicker.game.autoStep());
    await p.waitForTimeout(950);
    await p.screenshot({ path: "docs/goal.png" });
    seen.goal = true;
    await p.waitForTimeout(1600);
    await K(() => window.kicker.speed(3));
    continue;
  }
  if (ph === "room" && !seen.room && (await K(() => window.kicker.ui.run.s.coaches.length)) >= 2) {
    seen.room = true;
    await p.waitForTimeout(600);
    await p.screenshot({ path: "docs/room.png" });
  }
  if (ph === "fixture" && (await K(() => !!window.kicker.ui.run.bossOf()))) {
    await K(() => window.kicker.game.doGo());
    await p.waitForTimeout(500);
    if ((await K(() => window.kicker.ui.overlay)) === "boss") {
      if (!seen.boss) await p.screenshot({ path: "docs/boss.png" });
      seen.boss = true;
      await p.click(".ov-panel.boss >> text=Kick off");
      await p.waitForTimeout(600);
      continue;
    }
  }
  await K(() => window.kicker.game.autoStep());
  await p.waitForTimeout(30);
}
// the share image of a finished season
await K(() => window.kicker.finish());
await p.waitForTimeout(600);
await p.fill(".over input.field", "Kicker");
await p.click("text=Make a challenge link");
await p.waitForSelector(".shared img", { timeout: 30000 });
const id = (await p.inputValue(".shared input.field")).split("/c/")[1];
const img = await ctx.request.get(`${base}/api/felt?id=${id}`);
writeFileSync("docs/share.png", await img.body());
await b.close();
console.info("docs updated", JSON.stringify(seen));
