import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2];
const sizes = [[1440, 900, 0], [1024, 768, 0], [390, 844, 1]];
const ids = ["rug", "halt", "vcheck", "depeg", "gasspike", "jam", "slip", "lockup", "wash", "bell"];
const b = await chromium.launch({ channel: "msedge" });
let total = 0, hs = 0;
for (const [w, h, t] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!t, isMobile: !!t, deviceScaleFactor: t ? 3 : 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(base, { waitUntil: "networkidle" });
  await p.waitForTimeout(1000);
  await p.click("text=New run");
  await p.waitForTimeout(800);
  await p.evaluate(() => window.kicker.setUi({ coach: null }));
  for (const id of ids) {
    await p.evaluate((id) => {
      const g = window.kicker.game, s = g.run.s;
      if (id === "bell") { s.ante = 8; s.bosses[7] = "bell"; } else { s.ante = 1; s.bosses[0] = id; }
      s.blind = 2; s.phase = "blind";
      g.refreshAll(false);
    }, id);
    await p.waitForTimeout(450);
    await p.screenshot({ path: `qa/fix/boss-${id}-${w}.png` });
  }
  hs += await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  total += errs.length;
  console.info(w, "errors", errs.length, errs.slice(0, 2));
  // challenge banner at this size
  await ctx.close();
}
console.info("total errors", total, "hscroll", hs);
await b.close();
