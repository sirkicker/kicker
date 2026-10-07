import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1600, height: 2200 } });
p.on("pageerror", (e) => console.info("err", String(e)));
await p.goto("http://localhost:5191/brand.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.brandReady === true, null, { timeout: 30000 });
for (const id of ["token-512", "x-avatar-400", "x-banner-1500x500", "og-1200x630"]) {
  await p.locator("#" + id).screenshot({ path: `brand/${id}.png` });
}
await b.close();
console.info("ok");
