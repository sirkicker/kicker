// Renders the brand pack (token, X avatar and banner, og image) from brand.html on the dev server.
// `npx vite --port 5191` in one shell, then `node scripts/brand.mjs`. The squad cut comes from scripts/edition.json,
// so nothing here needs the live index.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] || "http://127.0.0.1:5191";
const cut = readFileSync("scripts/edition.json", "utf8");
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1600, height: 2200 } });
p.on("pageerror", (e) => console.info("err", String(e)));
await p.route("**/api/shuffle*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: cut }));
await p.goto(base + "/brand.html", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.brandReady === true, null, { timeout: 60000 });
for (const id of ["token-512", "x-avatar-400", "x-banner-1500x500", "og-1200x630"]) {
  await p.locator("#" + id).screenshot({ path: `brand/${id}.png` });
}
await b.close();
console.info("ok");
