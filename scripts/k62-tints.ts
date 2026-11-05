// KICKER 6.2: 24 random kickers on their deep cover tints, on the walnut, with the worst cream and brass contrast over
// all 1,111. qa/k62/tints-<tag>.png
//   npx tsx scripts/k62-tints.ts [tag]
import sharp from "sharp";
import { drawK6, traitsOf, hexRgb, K6_SIZE } from "../shared/k6.js";
import { k6Tint, HOUSE, NIGHT } from "../shared/k6look.js";
const tag = process.argv[2] || "now";
const lum = (h: string) => { const c = hexRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
let worstCream = 99, worstBrass = 99;
for (let n = 0; n < K6_SIZE; n++) { const t = k6Tint(traitsOf(n)); worstCream = Math.min(worstCream, contrast(HOUSE.cream, t)); worstBrass = Math.min(worstBrass, contrast(HOUSE.brassHi, t)); }
let seed = 62;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ns = Array.from({ length: 24 }, () => Math.floor(rnd() * K6_SIZE));
const s = 5, cw = 44 * s, ch = 48 * s + 30, gap = 10;
const comps: sharp.OverlayOptions[] = [];
const tints = new Set<string>();
for (let i = 0; i < 24; i++) {
  const t = traitsOf(ns[i]); const tint = k6Tint(t); tints.add(tint);
  const sp = drawK6(t);
  const fig = await sharp(Buffer.from(sp.px.buffer, sp.px.byteOffset, sp.px.byteLength), { raw: { width: sp.w, height: sp.h, channels: 4 } }).resize(sp.w * s, sp.h * s, { kernel: "nearest" }).png().toBuffer();
  const [r, g, b] = hexRgb(tint);
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="26"><text x="10" y="19" font-family="Georgia" font-size="16" fill="${HOUSE.cream}">No. ${String(ns[i]).padStart(4, "0")}</text><text x="${cw - 10}" y="19" text-anchor="end" font-family="Georgia" font-size="14" fill="${HOUSE.brassHi}">${tint}</text></svg>`);
  const tile = await sharp({ create: { width: cw, height: ch, channels: 4, background: { r, g, b, alpha: 1 } } }).composite([{ input: fig, left: Math.round((cw - sp.w * s) / 2), top: 4 }, { input: label, left: 0, top: ch - 28 }]).png().toBuffer();
  comps.push({ input: tile, left: gap + (i % 6) * (cw + gap), top: gap + Math.floor(i / 6) * (ch + gap) });
}
const [wr, wg, wb] = hexRgb(HOUSE.walnut);
await sharp({ create: { width: gap + 6 * (cw + gap), height: gap + 4 * (ch + gap), channels: 4, background: { r: wr, g: wg, b: wb, alpha: 1 } } }).composite(comps).png().toFile(`qa/k62/tints-${tag}.png`);
console.log(`tints-${tag}: ${tints.size} tints in the sheet; worst over all ${K6_SIZE}: cream ${worstCream.toFixed(2)}, brass ${worstBrass.toFixed(2)}`);
