// Several frames over time: vibers walking behind the title chips; also clicks the chips mid-walk.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [base, out, w, h, touch] = process.argv.slice(2);
const mobile = touch === "1";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1 });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
for (let i = 0; i < 4; i++) {
  await p.screenshot({ path: `${out}-f${i}.png` });
  await p.waitForTimeout(2600);
}
// topmost element at each chip centre must be the chip itself
const hit = await p.evaluate(() =>
  [...document.querySelectorAll(".chips-row a, .row.minor .chip")].map((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(top);
  }),
);
console.info("chips on top:", hit.join(","));
const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), p.click(".chips-row a.src")]);
console.info("source chip opens:", popup ? popup.url() : "none");
console.info("errors", errors.length, "hscroll", await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await b.close();
