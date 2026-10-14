// Refreshes the README screenshots in docs/ from production (1440x900).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] || "https://kickerhq.vercel.app";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem("kk.coach", "9"); localStorage.setItem("kk.news", JSON.stringify("1.1.0")); });
const p = await ctx.newPage();
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.screenshot({ path: "docs/title.png" });
await p.click("text=New run");
await p.waitForTimeout(1200);
await p.screenshot({ path: "docs/blinds.png" });
await p.evaluate(() => window.kicker.game.doGo());
await p.waitForTimeout(1800);
const ids = await p.evaluate(() => window.kicker.game.hint());
await p.evaluate((ids) => window.kicker.game.selectIds(ids), ids);
await p.waitForTimeout(300);
await p.evaluate(() => { void window.kicker.game.doPlay(); });
await p.waitForTimeout(1700);
await p.screenshot({ path: "docs/hand.png" });
const idle = async () => { for (let i = 0; i < 200; i++) { if (!(await p.evaluate(() => window.kicker.game.busy))) return; await p.waitForTimeout(150); } };
for (let i = 0; i < 40; i++) {
  await idle();
  const ph = await p.evaluate(() => window.kicker.ui.run.s.phase);
  if (ph === "shop") {
    await p.waitForTimeout(1500);
    if ((await p.evaluate(() => window.kicker.ui.run.s.phase)) === "shop") break;
  }
  if (ph === "round") { const ids = await p.evaluate(() => window.kicker.game.hint()); await p.evaluate((ids) => window.kicker.game.selectIds(ids), ids); await p.evaluate(() => { void window.kicker.game.doPlay(); }); await p.waitForTimeout(1500); }
  else if (ph === "cashout") { await p.waitForTimeout(1200); await p.evaluate(() => window.kicker.game.doCash()); await p.waitForTimeout(1500); }
  else if (ph === "blind") { await p.evaluate(() => window.kicker.game.doGo()); await p.waitForTimeout(1800); }
  else break;
}
await p.waitForTimeout(800);
await p.screenshot({ path: "docs/shop.png" });
await b.close();
console.info("docs updated");
