// v2 screens: title parade, hall, card detail (hold in hand + deck), insiders with viber portraits.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [base, out, w = "1440", h = "900", touch = "0"] = process.argv.slice(2);
const mobile = touch === "1";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
await p.screenshot({ path: `${out}-title.png` });
const fresh = await p.textContent(".fresh");
console.info("caption:", fresh);
await p.click("text=Hall of hands");
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}-hall.png` });
await p.click(".x");
await p.click("text=New run");
await p.waitForTimeout(700);
await p.evaluate(() => window.kicker.setUi({ coach: null }));
await p.evaluate(() => window.kicker.game.doGo());
await p.waitForTimeout(1600);
// hold a card
const id = await p.evaluate(() => window.kicker.ui.run.s.hand[2]);
const pt = await p.evaluate((id) => window.kicker.screenOf(id), id);
if (mobile) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt.x, y: pt.y + 10 }] });
  await p.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
} else {
  await p.mouse.move(pt.x, pt.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(700);
  await p.mouse.up();
}
await p.waitForTimeout(900);
const detailOpen = await p.isVisible(".ov-panel.detail");
const selAfterHold = await p.evaluate(() => window.kicker.game.sel.length);
console.info("hold opens detail:", detailOpen, "selected after hold:", selAfterHold);
await p.screenshot({ path: `${out}-detail.png` });
if (detailOpen) await p.click(".ov-panel.detail .x");
// give the run some insiders to show portraits
await p.evaluate(() => {
  const r = window.kicker.ui.run;
  for (const id of ["whale", "front", "oldmoney", "copium", "valedictorian"]) r.s.insiders.push({ id, v: 0, paid: 6 });
  window.kicker.game.refreshAll(false);
});
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}-insiders.png` });
console.info("errors", errors.length, errors.slice(0, 3), "hscroll", await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await b.close();
