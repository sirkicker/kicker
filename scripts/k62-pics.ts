// KICKER 6.2: render the meme panels, a launch's meme and its og:image for the visual passes. qa/k62/pass/<tag>-*.png
//   npx tsx scripts/k62-pics.ts [tag]
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { traitsOf } from "../shared/k6.js";
import { KICKER_N, MEMES, launchCaption } from "../shared/k6react.js";
import { GET } from "../api/k6.js";
import { launchMemeSvg, ogSvg, png } from "../api/_k6card.js";
import { launchOf, lookOf } from "../api/_k6.js";
const tag = process.argv[2] || "p1";
const dir = "qa/k62/pass";
const T = "0x0207a8675d4a56d6955db805bf5f09db1d21d755";
const l = await launchOf(T).catch(() => null);
if (l) {
  writeFileSync(`${dir}/${tag}-launch-meme.png`, png(await launchMemeSvg(traitsOf(l.n), lookOf(l.n, l), launchCaption(l.symbol)), 1080));
  writeFileSync(`${dir}/${tag}-launch-og.png`, png(await ogSvg(traitsOf(l.n), lookOf(l.n, l), launchCaption(l.symbol)), 1200));
}
const tiles: Buffer[] = [];
for (const m of MEMES) tiles.push(Buffer.from(await (await GET(new Request(`http://x/api/k6?meme=${m.key}&w=480`))).arrayBuffer()));
const cols = 4;
await sharp({ create: { width: cols * 490 + 10, height: Math.ceil(tiles.length / cols) * 490 + 10, channels: 4, background: "#22170f" } })
  .composite(tiles.map((input, i) => ({ input, left: 10 + (i % cols) * 490, top: 10 + Math.floor(i / cols) * 490 })))
  .png()
  .toFile(`${dir}/${tag}-memes.png`);
console.log("ok", KICKER_N, l ? `$${l.symbol}` : "no launch");
