// Overlays + determinism + share flow. Usage: node scripts/overlays.mjs <base> <prefix> <w> <h> <touch>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [base, out, w = "1440", h = "900", touch = "0"] = process.argv.slice(2);
const mobile = touch === "1";
const browser = await chromium.launch({ channel: "msedge" });
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { page, errors, ctx };
};
// determinism: same seed link in two fresh browsers
const ed = await (await fetch(base + "/api/shuffle")).json();
const seed = "TEST-SEED".replace("-", "").slice(0, 4) + "-" + "7M2Q";
const hands = [];
for (let k = 0; k < 2; k++) {
  const { page, ctx } = await mk();
  await page.goto(`${base}/?s=${seed}&e=${ed.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.kicker.game.doGo());
  await page.waitForTimeout(1500);
  hands.push(await page.evaluate(() => { const r = window.kicker.ui.run; return { deck: r.s.deck.map((c) => c.l.t + ":" + c.rank + ":" + c.suit).join(","), hand: r.s.hand.map((i) => r.card(i).l.s).join(",") }; }));
  await ctx.close();
}
console.info("same deck:", hands[0].deck === hands[1].deck, "same deal:", hands[0].hand === hands[1].hand, "hand:", hands[0].hand);
const { page, errors } = await mk();
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.click("text=How to play");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-how.png` });
await page.click(".x");
await page.click("text=New run");
await page.waitForTimeout(600);
await page.evaluate(() => window.kicker.game.doGo());
await page.waitForTimeout(1500);
// hover tooltip (desktop)
if (!mobile) {
  const id = await page.evaluate(() => window.kicker.ui.run.s.hand[0]);
  const p = await page.evaluate((id) => window.kicker.screenOf(id), id);
  await page.mouse.move(p.x, p.y + 20);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}-tooltip.png` });
}
await page.evaluate(() => window.kicker.setUi({ overlay: "deck" }));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-deck.png` });
const links = await page.$$eval(".dcard a", (as) => as.map((a) => a.href));
console.info("deck links", links.length, links[0]);
await page.click(".x");
// finish the run instantly through the engine, then open results
await page.evaluate(async () => {
  const { ui } = window.kicker;
  const run = ui.run;
  // simple engine-only autoplay
  for (let i = 0; i < 4000 && !(run.s.phase === "over" || run.s.phase === "won"); i++) {
    const s = run.s;
    if (s.phase === "blind") run.apply({ t: "go" });
    else if (s.phase === "round") { const ids = window.kicker.game.hint(); run.apply({ t: "play", c: ids }); }
    else if (s.phase === "cashout") run.apply({ t: "cash" });
    else if (s.phase === "shop") { const k = s.offers.findIndex((o) => !o.sold && o.kind === "insider" && o.cost <= s.money && s.insiders.length < 5); if (k >= 0) run.apply({ t: "buy", i: k }); else run.apply({ t: "next" }); }
  }
  window.kicker.game.refreshAll(false);
  window.kicker.setUi({ overlay: "over" });
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-over.png` });
await page.fill('input[aria-label="Name"]', "QAtest");
await page.click("text=Make a challenge link");
await page.waitForSelector('input[aria-label="Challenge link"]', { timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}-shared.png` });
const link = await page.inputValue('input[aria-label="Challenge link"]');
console.info("challenge link", link);
// open challenge in fresh browser
const c2 = await mk();
await c2.page.goto(link, { waitUntil: "networkidle" });
await c2.page.waitForTimeout(1500);
await c2.page.screenshot({ path: `${out}-challenge.png` });
const hasCh = await c2.page.isVisible("text=Take the challenge");
console.info("challenge banner", hasCh);
console.info("errors", errors.length + c2.errors.length, [...errors, ...c2.errors].slice(0, 5));
console.info("hscroll", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await browser.close();
