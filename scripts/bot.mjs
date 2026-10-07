// QA bot: plays through the UI code paths until N blinds are cleared (or the run ends).
// Usage: node scripts/bot.mjs <url> <outPrefix> <w> <h> <touch> [blinds]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [url, out, w = "1440", h = "900", touch = "0", want = "3"] = process.argv.slice(2);
const mobile = touch === "1";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.click("text=New run");
await page.waitForTimeout(800);
const idle = async () => { for (let i = 0; i < 200; i++) { if (!(await page.evaluate(() => window.kicker.game.busy))) return; await page.waitForTimeout(150); } };
const st = () => page.evaluate(() => { const s = window.kicker.ui.run.s; return { phase: s.phase, cleared: s.cleared, money: s.money, hands: s.hands, ins: s.insiders.map((j) => j.id), seed: s.seed, ed: s.edition, score: s.score, target: s.target }; });
let shots = new Set();
let tapped = false;
let bought = 0;
for (let step = 0; step < 300; step++) {
  await idle();
  const s = await st();
  if (s.phase === "over" || s.phase === "won" || s.cleared >= +want) break;
  if (s.phase === "blind") {
    if (!shots.has("blind" + s.cleared)) { await page.screenshot({ path: `${out}-blind${s.cleared}.png` }); shots.add("blind" + s.cleared); }
    await page.evaluate(() => window.kicker.game.doGo());
    await page.waitForTimeout(1500);
  } else if (s.phase === "round") {
    const ids = await page.evaluate(() => window.kicker.game.hint());
    if (!tapped) {
      // real pointer taps on the canvas for the first hand
      await page.evaluate(() => { window.kicker.ui.coach = null; });
      for (const id of ids) {
        const p = await page.evaluate((id) => window.kicker.screenOf(id), id);
        if (mobile) await page.touchscreen.tap(p.x, p.y + 10); else await page.mouse.click(p.x, p.y + 10);
        await page.waitForTimeout(200);
      }
      const sel = await page.evaluate(() => window.kicker.game.sel.slice().sort());
      console.info("tap-select ok:", JSON.stringify(sel) === JSON.stringify(ids.slice().sort()), sel.length);
      await page.screenshot({ path: `${out}-tapped.png` });
      tapped = true;
      await page.evaluate(() => window.kicker.game.selectIds([]));
    }
    await page.evaluate((ids) => window.kicker.game.selectIds(ids), ids);
    await page.evaluate(() => { void window.kicker.game.doPlay(); });
    await page.waitForTimeout(1300);
    if (!shots.has("score")) { await page.screenshot({ path: `${out}-scoring.png` }); shots.add("score"); }
  } else if (s.phase === "cashout") {
    await page.waitForTimeout(900);
    if (!shots.has("cash")) { await page.screenshot({ path: `${out}-cashout.png` }); shots.add("cash"); }
    await page.evaluate(() => window.kicker.game.doCash());
    await page.waitForTimeout(700);
  } else if (s.phase === "shop") {
    if (!shots.has("shop" + s.cleared)) { await page.screenshot({ path: `${out}-shop${s.cleared}.png` }); shots.add("shop" + s.cleared); }
    const i = await page.evaluate(() => { const s = window.kicker.ui.run.s; return s.offers.findIndex((o) => !o.sold && o.kind === "insider" && o.cost <= s.money && s.insiders.length < 5); });
    if (i >= 0) { await page.evaluate((i) => window.kicker.game.doBuy(i), i); bought++; await page.waitForTimeout(500); continue; }
    await page.evaluate(() => window.kicker.game.doNext());
    await page.waitForTimeout(800);
  }
}
const s = await st();
console.info("final", JSON.stringify(s), "bought", bought);
await page.screenshot({ path: `${out}-final.png` });
console.info("errors", errors.length, errors.slice(0, 5));
console.info("hscroll", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await browser.close();
