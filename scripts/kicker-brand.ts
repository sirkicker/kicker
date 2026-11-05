// The KICKER 5.1 brand assets, drawn from the seeded demo table in memory (never the live one): the X banner, the
// avatar, the launch post, two plate cards, the home page's og:image and the favicon.
//   npx tsx scripts/kicker-brand.ts
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { seed } from "./side-seed.js";
import { manOfDay } from "../api/_side.js";
import { BRASS, CREAM, DIM, collar, defs, felt, jersey, kickerUri, mark, mono, plateSvg, png, reg, rod, standing, stock, subjectOfMan } from "../api/_sidecard.js";
import { KROD, KW } from "../shared/kicker.js";
import { addDays, dayTeams, utcDay, type Kit, type PublicMan } from "../shared/side.js";

await seed();
const out = "brand/kickers";
const pub = "public/brand/side";
mkdirSync(out, { recursive: true });
mkdirSync(pub, { recursive: true });
const today = utcDay();
const [home, away] = dayTeams(today);
const KITS: Kit[] = [home, away, { a: "#cf5b3e", b: "#221419", p: "plain" }, { a: "#8db5a3", b: "#1e4a53", p: "stripes" }, { a: "#f1e4c8", b: "#6e2140", p: "sash" }];

/** A rod of kickers on felt, in a w x h panel at (x, y). */
async function rodPanel(x: number, y: number, w: number, h: number, vs: number[], s: number, rodY: number, gap: number, kits: Kit[]): Promise<string> {
  let g = `<g>${felt(x, y, w, h)}`;
  g += rod(x, x + w, y + rodY, 6 * s, 10 * s);
  const total = (vs.length - 1) * gap;
  const x0 = x + w / 2 - total / 2;
  g += collar(x0 - gap * 0.55, y + rodY, 6 * s) + collar(x0 + total + gap * 0.55, y + rodY, 6 * s);
  for (let i = 0; i < vs.length; i++) g += standing(await kickerUri(vs[i], kits[i % kits.length], s), s, Math.round(x0 + i * gap), y + rodY, [4 * s, 10 * s]);
  g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#vig)"/></g>`;
  return g;
}

// ---------------------------------------------------------------- banner 1500 x 500 (the words inside the middle 1000)
{
  const W = 1500;
  const H = 500;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(760, H, 1120, 180)}`;
  svg += stock(W, H);
  svg += await rodPanel(760, 0, 740, H, [87, 141, 30, 199], 2, 318, 176, [home, KITS[2], away, KITS[4]]);
  svg += `<rect x="758" y="0" width="2" height="${H}" fill="${BRASS}" opacity="0.5"/>`;
  svg += reg(272, 40, 11) + mono(296, 45, 15, DIM, "No. 001 · the programme", { ls: 2.4, w: 500 });
  svg += mark(264, 248, 186, "#6e2140") + mark(258, 242, 186);
  svg += mono(266, 312, 27, CREAM, "every kicker is a viber.", { w: 500 });
  svg += mono(266, 352, 18, DIM, "kickers for the vibe/vibe crowd.");
  svg += mono(266, 380, 18, BRASS, "we only move sideways. no spinning.", { w: 500 });
  svg += mono(266, 452, 15, DIM, "kickerhq.vercel.app", { ls: 0.6 });
  writeFileSync(`${out}/banner-1500x500.png`, png(svg + "</svg>", W));
}

// ---------------------------------------------------------------- avatar 400: one kicker, close, readable at 48 px
{
  const W = 400;
  const s = 4;
  const v = 87;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${defs(W, W, W / 2, 140)}`;
  svg += felt(0, 0, W, W);
  const rodY = 330;
  svg += rod(0, W, rodY, 6 * s, 12 * s);
  svg += standing(await kickerUri(v, { a: "#6e2140", b: "#f1e4c8", p: "hoops" }, s), s, W / 2 + 4, rodY, [10, 30]);
  svg += `<rect width="${W}" height="${W}" fill="url(#vig)" opacity="0.6"/></svg>`;
  const buf = png(svg, W);
  writeFileSync(`${out}/avatar-400.png`, buf);
  await sharp(buf).resize(48, 48, { kernel: "lanczos3" }).png().toFile(`${out}/avatar-48-check.png`);
  // the favicon: his head over a stretch of rod, pixel for pixel
  const f = 1;
  let fs = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${defs(64, 64, 32, 20)}<rect width="64" height="64" fill="#123f40"/>`;
  fs += `<rect x="0" y="56" width="64" height="6" fill="#a98c58"/>`;
  fs += `<image href="${await kickerUri(v, { a: "#6e2140", b: "#f1e4c8", p: "hoops" }, f)}" x="${Math.round(32 - KW / 2) + 1}" y="${56 + 3 - KROD}" width="96" height="136" image-rendering="optimizeSpeed"/></svg>`;
  writeFileSync(`${pub}/favicon-64.png`, png(fs, 64));
}

// ---------------------------------------------------------------- the launch post 1200 x 675 and the home og:image
for (const [W, H, file] of [
  [1200, 675, `${out}/post-1200x675.png`],
  [1200, 630, `${pub}/og-1200x630.png`],
] as const) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(W, H, W / 2, 200)}`;
  svg += stock(W, H);
  const ph = H - 250;
  svg += await rodPanel(0, 250, W, ph, [87, 141, 30, 199, 61, 112], 2, Math.round(ph * 0.58), 188, [home, away]);
  svg += `<rect x="0" y="248" width="${W}" height="2" fill="${BRASS}" opacity="0.5"/>`;
  svg += mark(60, 192, 170, "#6e2140") + mark(54, 186, 170);
  svg += mono(W - 58, 92, 26, CREAM, "every kicker is a viber.", { anchor: "end", w: 500 });
  svg += mono(W - 58, 130, 18, DIM, "222 vibers, cast as table-football men.", { anchor: "end" });
  svg += mono(W - 58, 158, 18, DIM, "one brass rod a day. field yours.", { anchor: "end" });
  svg += mono(W - 58, 196, 18, BRASS, "we only move sideways.", { anchor: "end", w: 500 });
  svg += mono(58, 44, 14, DIM, "kickers for the vibe/vibe crowd · kickerhq.vercel.app", { ls: 1.6, w: 500 });
  writeFileSync(file, png(svg + "</svg>", W));
}

// ---------------------------------------------------------------- two plate cards: the men of the day, as posted
for (const [i, d] of [
  [1, addDays(today, -1)],
  [2, today],
] as const) {
  const pick = (await manOfDay(d)).man as PublicMan;
  writeFileSync(`${out}/plate-${i}-1080x1350.png`, png(await plateSvg(subjectOfMan(pick), { motd: d }), 1080));
  console.log("man of the day", d, pick.name);
}
void jersey;
console.log("ok");
