// The set atlas: every viber of shared/vibers.ts in album order, 96x96 cells, 16 to a row, in one PNG, so the album
// asks for one picture instead of 222. node scripts/kicker-atlas.mjs -> public/vibers/set.png
import { readFileSync } from "node:fs";
import sharp from "sharp";

const src = readFileSync("shared/vibers.ts", "utf8");
const list = JSON.parse(src.match(/VIBERS: readonly string\[\] = (\[.*?\]);/s)[1]);
const C = 16;
const rows = Math.ceil(list.length / C);
const comps = list.map((n, i) => ({ input: `public/vibers/${n}.png`, left: (i % C) * 96, top: Math.floor(i / C) * 96 }));
await sharp({ create: { width: C * 96, height: rows * 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(comps)
  .png({ palette: true, colours: 256, effort: 10, compressionLevel: 9 })
  .toFile("public/vibers/set.png");
console.log(list.length, "vibers ->", "public/vibers/set.png");
