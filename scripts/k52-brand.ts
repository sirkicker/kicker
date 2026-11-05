// The KICKER 5.2 brand assets in the new look (the cover tinted from the kicker's own colours, a long brass rod,
// Jersey 10 for the wordmark and numbers, Archivo for words), drawn from the seeded demo table in memory, never the
// live one: the X banner, the avatar, the launch post, two man-of-the-day plates and the home og:image.
//   npx tsx scripts/k52-brand.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { seed } from "./side-seed.js";
import { manOfDay } from "../api/_side.js";
import { esc, kickerUri, kitWords, viberRgba } from "../api/_sidecard.js";
import { KROD, KROD_T, KW } from "../shared/kicker.js";
import { addDays, dayTeams, houseKit, kickerOf, setNo, utcDay, type Kit, type PublicMan } from "../shared/side.js";
import { tintOf, viberHandle } from "../shared/home.js";

await seed();
const out = "brand/kickers";
const pub = "public/brand/side";
mkdirSync(out, { recursive: true });
const today = utcDay();
const [home, away] = dayTeams(today);
const INK = "#2a0f1c";
const WINE = "#6e2140";
const FELT = "#2c6a60";

const f = (n: string) => fileURLToPath(new URL(n, import.meta.url));
const FONTS = [f("../api/_fonts/Jersey10.ttf"), f("./_fonts/Archivo-400.ttf"), f("./_fonts/Archivo-600.ttf"), f("./_fonts/Archivo-700.ttf")];
const png = (svg: string, w: number) => new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false, fontFiles: FONTS, defaultFontFamily: "Archivo SemiBold" } }).render().asPng();
const text = (x: number, y: number, size: number, fill: string, s: string, o: { w?: number; anchor?: string; ls?: number; op?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="Archivo SemiBold, Archivo" font-weight="${o.w || 400}" font-size="${size}" fill="${fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.ls ? ` letter-spacing="${o.ls}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}>${esc(s)}</text>`;
const num = (x: number, y: number, size: number, fill: string, s: string, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="Jersey 10" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${size * 0.02}">${esc(s)}</text>`;
const DEFS = `<defs><linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#f3dc9c"/><stop offset="0.22" stop-color="#e2c27a"/><stop offset="0.52" stop-color="#c49c4f"/><stop offset="0.78" stop-color="#9d7a3a"/><stop offset="1" stop-color="#6f5427"/></linearGradient>
<filter id="blur" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="6"/></filter></defs>`;
/** A brass rod with its soft shadow, centred on y. */
const rod = (x0: number, x1: number, y: number, t: number, round = false) =>
  `<rect x="${x0}" y="${y + t * 0.5}" width="${x1 - x0}" height="${t * 0.6}" fill="#1a0a10" opacity="0.22" filter="url(#blur)"/><rect x="${x0}" y="${y - t / 2}" width="${x1 - x0}" height="${t}" rx="${round ? t / 2 : 0}" fill="url(#brass)"/>`;
/** A kicker with his rod row at (cx, rodY), at whole scale s. */
async function kicker(v: number, kit: Kit, s: number, cx: number, rodY: number) {
  const x = Math.round(cx - (KW * s) / 2);
  const y = Math.round(rodY - KROD * s);
  return `<image href="${await kickerUri(v, kit, s)}" x="${x}" y="${y}" width="${KW * s}" height="${136 * s}" image-rendering="optimizeSpeed"/>`;
}
const tint = async (v: number) => tintOf(await viberRgba(v));

// ---------------------------------------------------------------- banner 1500 x 500 (words inside the middle 1000)
{
  const W = 1500;
  const H = 500;
  const s = 2;
  const rodY = 398;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}`;
  svg += `<rect width="${W}" height="${H}" fill="${await tint(87)}"/>`;
  svg += `<rect y="300" width="${W}" height="${H - 300}" fill="${FELT}"/><rect y="300" width="${W}" height="6" fill="${WINE}"/>`;
  svg += rod(0, W, rodY, KROD_T * s);
  const vs = [61, 141, 30, 199, 87, 112, 5, 160, 44];
  const gap = 172;
  for (let i = 0; i < vs.length; i++) svg += await kicker(vs[i], i % 2 ? away : home, s, W / 2 + (i - 4) * gap, rodY);
  svg += num(W / 2, 128, 128, WINE, "KICKER", "middle");
  svg += text(W / 2, 178, 26, INK, "kickers for the vibe/vibe crowd. we only move sideways.", { w: 600, anchor: "middle" });
  writeFileSync(`${out}/banner-1500x500.png`, png(svg + "</svg>", W));
}

// ---------------------------------------------------------------- avatar 400: one kicker, close, readable at 48 px
{
  const W = 400;
  const s = 4;
  const v = 87;
  const kit = { a: "#6e2140", b: "#f1e4c8", p: "hoops" } as Kit;
  const rodY = 44 + (KROD - 22) * s;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${DEFS}<rect width="${W}" height="${W}" fill="${await tint(v)}"/>`;
  svg += rod(0, W, rodY, KROD_T * s);
  svg += await kicker(v, kit, s, W / 2 + 6, rodY);
  svg += "</svg>";
  const buf = png(svg, W);
  writeFileSync(`${out}/avatar-400.png`, buf);
  await sharp(buf).resize(48, 48, { kernel: "lanczos3" }).png().toFile(`${out}/avatar-48-check.png`);
}

// ---------------------------------------------------------------- the launch post 1200 x 675 and the home og:image
for (const [W, H, file] of [
  [1200, 675, `${out}/post-1200x675.png`],
  [1200, 630, `${pub}/og-1200x630.png`],
] as const) {
  const v = 141;
  const s = 4;
  const kit = home;
  const bottom = H - 20;
  const rodY = bottom - (128 - KROD) * s;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="${await tint(v)}"/>`;
  svg += rod(0, 540, rodY, KROD_T * s, true);
  svg += await kicker(v, kit, s, 300, rodY);
  svg += num(56, 84, 64, WINE, "KICKER");
  const x = 610;
  svg += text(x, 214, 26, INK, "kickers for the vibe/vibe crowd", { w: 600, op: 0.74 });
  svg += text(x, 290, 64, INK, "every kicker", { w: 700, ls: -2 });
  svg += text(x, 362, 64, INK, "is a viber.", { w: 700, ls: -2 });
  svg += text(x, 424, 26, INK, "222 vibers on brass rods. one rod a day.", { w: 400 });
  svg += text(x, 460, 26, INK, "we only move sideways. no spinning.", { w: 600 });
  svg += `<rect x="${x}" y="${H - 118}" width="282" height="56" rx="10" fill="${INK}"/>`;
  svg += text(x + 141, H - 82, 22, "#f1e4c8", "kickerhq.vercel.app", { w: 600, anchor: "middle" });
  writeFileSync(file, png(svg + "</svg>", W));
}

// ---------------------------------------------------------------- two plates: the men of the day, as posted
for (const [i, d] of [
  [1, addDays(today, -1)],
  [2, today],
] as const) {
  const man = (await manOfDay(d)).man as PublicMan;
  const { v, kit } = kickerOf(man);
  const W = 1080;
  const H = 1350;
  const s = 7;
  const rodY = 150 + (KROD - 16) * s;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="${await tint(v)}"/>`;
  svg += num(64, 112, 64, WINE, "KICKER");
  svg += text(W - 64, 100, 26, INK, `man of the day · ${d.slice(8).replace(/^0/, "")} ${["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][Number(d.slice(5, 7)) - 1]}`, { w: 600, anchor: "end", op: 0.74 });
  svg += rod(0, W, rodY, KROD_T * s);
  svg += await kicker(v, kit, s, W / 2, rodY);
  const y0 = 150 + (128 - 16) * s + 84;
  svg += `<rect x="0" y="${y0 - 52}" width="${W}" height="${H - y0 + 52}" fill="#f3ead8"/>`;
  svg += text(64, y0 + 52, 56, INK, "Kicker", { w: 700, ls: -1.5 }) + num(270, y0 + 54, 92, WINE, setNo(v));
  svg += text(64, y0 + 124, 44, INK, man.name, { w: 600 });
  svg += text(64, y0 + 184, 30, INK, man.cap ? `“${man.cap}”` : "no line. he lets the rod talk.", { w: 400, op: man.cap ? 1 : 0.74 });
  svg += text(64, H - 64, 24, INK, `${viberHandle(v)} · ${kitWords(kit)}`, { w: 600, op: 0.74 });
  svg += text(W - 64, H - 64, 24, INK, "kickerhq.vercel.app", { w: 600, anchor: "end", op: 0.74 });
  writeFileSync(`${out}/plate-${i}-1080x1350.png`, png(svg + "</svg>", W));
  console.log("man of the day", d, man.name, setNo(v));
}
void houseKit;
console.log("ok");
