import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
page.on("console", (m) => console.info(m.type(), m.text().slice(0, 600)));
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await browser.close();
