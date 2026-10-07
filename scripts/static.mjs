import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [url, out, w="900", h="400"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(url, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
await p.screenshot({ path: out }); await b.close();
