// The KICKER 5 brand assets, drawn from the seeded demo table in memory (never the live one): the X banner, avatar,
// launch post, two "man of the day" cards, the home page's og:image and the favicon.
//   npx tsx scripts/side-brand.ts
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { seed } from "./side-seed.js";
import { rods, getMan } from "../api/_side.js";
import { BRASS, CREAM, cardSvg, defs, felt, manRects, mark, mono, png, rod, collar, stripSvg } from "../api/_sidecard.js";
import { ROD_Y, SW, publicMan, sprite, dayKits, addDays, utcDay, type PublicMan } from "../shared/side.js";

await seed();
const out = "brand/side";
const pub = "public/brand/side";
mkdirSync(out, { recursive: true });
mkdirSync(pub, { recursive: true });
const r = await rods("", 6);
const days = r.days;
const dim = "rgba(241,228,200,0.62)";

// banner: the table runs in from the left and ends at its wall; the mark stands in the room
{
  const W = 1500;
  const H = 500;
  const x = 1096;
  const extra = mark(x, 262, 112) + mono(x + 4, 312, 25, CREAM, "we only move sideways.", { ls: 0.3 }) + mono(x + 4, 348, 21, dim, "no spinning.", { ls: 0.3 });
  writeFileSync(`${out}/banner-1500x500.png`, png(stripSvg(days, W, H, { s: 4, wallAt: 0.6, extra }), W));
}
// the launch post and the home page's og:image
for (const [W, H, file] of [
  [1200, 675, `${out}/post-1200x675.png`],
  [1200, 630, `${pub}/og-1200x630.png`],
] as const) {
  const x = 878;
  const y = H / 2 - 40;
  const extra =
    mark(x, y, 92) +
    mono(x + 3, y + 50, 19, CREAM, "an endless table", {}) +
    mono(x + 3, y + 78, 19, CREAM, "of little men.", {}) +
    mono(x + 3, y + 106, 19, CREAM, "one brass rod a day.", {}) +
    mono(x + 3, y + 150, 19, BRASS, "make yours. put him", { w: 500 }) +
    mono(x + 3, y + 178, 19, BRASS, "on today's rod.", { w: 500 }) +
    mono(x + 3, H - 44, 17, dim, "kickerhq.vercel.app", { ls: 0.4 });
  writeFileSync(file, png(stripSvg(days, W, H, { s: 4, wallAt: 0.585, extra, ghost: true }), W));
}
// avatar: one man, close, on his rod. Readable at 48 px.
{
  const W = 400;
  const m = publicMan((await getMan("demo001"))!);
  const s = 12;
  const cx = W / 2;
  const rodY = 44 + Math.round((ROD_Y + 0.5) * 12);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${defs(W, W, W / 2, 140)}`;
  svg += felt(0, 0, W, W);
  svg += rod(0, W, rodY, 22, 60);
  svg += collar(40, rodY, 22) + collar(W - 40, rodY, 22);
  const px = sprite(m, dayKits(m.day)[0]);
  const ox = Math.round(cx - (SW * s) / 2);
  const oy = Math.round(rodY - (ROD_Y + 0.5) * s);
  svg += `<g opacity="0.42" filter="url(#soft)">${manRects(px, s, ox + 14, oy + 42, "#000")}</g><g shape-rendering="crispEdges">${manRects(px, s, ox, oy)}</g>`;
  svg += `<rect width="${W}" height="${W}" fill="url(#vig)" opacity="0.7"/></svg>`;
  const buf = png(svg, W);
  writeFileSync(`${out}/avatar-400.png`, buf);
  await sharp(buf).resize(48, 48, { kernel: "lanczos3" }).png().toFile(`${out}/avatar-48-check.png`);
  // the favicon: his head and shoulders, pixel for pixel
  const f = 3;
  let fs = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#123f40"/>`;
  fs += `<rect x="0" y="${8 + 16 * f}" width="64" height="${2 * f}" fill="#a98c58"/>`;
  fs += `<g shape-rendering="crispEdges">${manRects(px, f, Math.round(32 - (SW * f) / 2), 8 - 1 * f)}</g></svg>`;
  writeFileSync(`${pub}/favicon-64.png`, png(fs, 64));
}
// two men of the day, as they would be posted
const today = utcDay();
for (const [i, d] of [
  [1, addDays(today, -1)],
  [2, today],
] as const) {
  const { manOfDay } = await import("../api/_side.js");
  const pick = (await manOfDay(d)).man as PublicMan;
  writeFileSync(`${out}/motd-${i}-1080x1350.png`, png(cardSvg(pick, { motd: d }), 1080));
  console.log("man of the day", d, pick.name);
}
console.log("ok");
