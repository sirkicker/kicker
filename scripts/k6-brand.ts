// KICKER 6.2 brand assets (KICKER is a meme), on the walnut house palette: the X banner, the avatar, a launch post,
// the 4 x 2 sheet of the meme panels, the home og:image and the favicon. X: @kicker_art.
//   npx tsx scripts/k6-brand.ts
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import sharp from "sharp";
import { K6_ROD, drawK6, traitsOf, type K6Sprite } from "../shared/k6.js";
import { HOUSE, k6Tint } from "../shared/k6look.js";
import { KICKER_N, MEMES } from "../shared/k6react.js";
import { esc, png, spriteUri } from "../api/_k6card.js";
import { GET } from "../api/k6.js";

const out = "brand/k6";
const pub = "public/brand/k6";
mkdirSync(out, { recursive: true });
mkdirSync(pub, { recursive: true });
rmSync(`${out}/reactions-2x4.png`, { force: true });
const N = KICKER_N;
const t = traitsOf(N);
const TINT = k6Tint(t);
const CREAM = HOUSE.cream;
const BRASS = HOUSE.brassHi;
const floor = (y: number, W: number, H: number) => `<rect x="0" y="${y}" width="${W}" height="${H}" fill="${HOUSE.walnutDeep}" opacity="0.3"/>`;

const display = (x: number, y: number, size: number, fill: string, s: string, anchor = "middle", w = 400) =>
  `<text x="${x}" y="${y}" font-family="Fraunces Display" font-weight="${w}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${s === "KICKER" ? (size * 0.08).toFixed(1) : (size * -0.02).toFixed(1)}">${esc(s)}</text>`;
const words = (x: number, y: number, size: number, fill: string, s: string, anchor = "start", w = 400, op = 1) =>
  `<text x="${x}" y="${y}" font-family="Fraunces Text" font-weight="${w}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;
const rod = (x0: number, x1: number, cy: number, s: number) => {
  const y = cy - 2 * s;
  return `<rect x="${x0}" y="${y + 5 * s}" width="${x1 - x0}" height="${s}" fill="#000" opacity="0.22"/><rect x="${x0}" y="${y}" width="${x1 - x0}" height="${s}" fill="#e3c47c"/><rect x="${x0}" y="${y}" width="${x1 - x0}" height="${s / 2}" fill="#fff1c4"/><rect x="${x0}" y="${y + s}" width="${x1 - x0}" height="${2 * s}" fill="#b48b3f"/><rect x="${x0}" y="${y + 3 * s}" width="${x1 - x0}" height="${s}" fill="#6b4c20"/>`;
};
const cap = (x: number, cy: number, s: number) => `<rect x="${x - 2 * s}" y="${cy - 3 * s}" width="${4 * s}" height="${6 * s}" fill="#1b0f15"/><rect x="${x - s}" y="${cy - 2 * s}" width="${2 * s}" height="${4 * s}" fill="#b48b3f"/><rect x="${x - s}" y="${cy - 2 * s}" width="${s}" height="${s}" fill="#e3c47c"/>`;
async function fig(sp: K6Sprite, s: number, cx: number, rodY: number) {
  return `<image href="${await spriteUri(sp, s)}" x="${Math.round(cx - (sp.w * s) / 2)}" y="${rodY - K6_ROD * s}" width="${sp.w * s}" height="${sp.h * s}"/>`;
}
const save = async (name: string, svg: string, w: number, dirs = [out]) => {
  const buf = png(svg, w);
  for (const d of dirs) writeFileSync(`${d}/${name}`, buf);
  console.log(name, (await sharp(buf).metadata()).width, buf.length);
};

// ---------------------------------------------------------------- avatar 400: the kicker, head and shoulders, side-eye
{
  const sp = drawK6(t);
  const crop: K6Sprite = { w: 32, h: 32, px: sp.px.slice(1 * 32 * 4, 33 * 32 * 4) };
  const s = 11;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="${TINT}"/>${rod(0, 400, 24 + 30 * s + 4, s)}<image href="${await spriteUri(crop, s)}" x="${200 - 16 * s}" y="24" width="${32 * s}" height="${32 * s}"/></svg>`;
  await save("avatar-400.png", svg, 400);
  writeFileSync(`${out}/avatar-48-check.png`, await sharp(png(svg, 400)).resize(48, 48, { kernel: "lanczos3" }).png().toBuffer());
  const fav = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="${TINT}"/><image href="${await spriteUri(crop, 2)}" x="0" y="2" width="64" height="64"/></svg>`;
  await save("favicon-64.png", fav, 64, [pub]);
}

// ---------------------------------------------------------------- banner 1500 x 500: the meme across the middle 1000
{
  const W = 1500;
  const H = 500;
  const s = 7;
  const rodY = 300;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${HOUSE.walnut}"/>`;
  svg += `<rect x="250" y="0" width="1000" height="${H}" fill="${TINT}"/>` + floor(rodY + 14 * s, W, H);
  svg += rod(0, W, rodY, s);
  svg += await fig(drawK6(t), s, W / 2, rodY);
  svg += display(W / 2, 92, 54, CREAM, "we only move sideways.");
  svg += display(W / 2, 466, 66, CREAM, "no spinning.", "middle", 600);
  svg += words(270, 484, 20, CREAM, "$KICKER", "start", 600, 0.8) + words(1230, 484, 20, CREAM, "@kicker_art", "end", 400, 0.7);
  await save("banner-1500x500.png", svg + "</svg>", W);
}

// ---------------------------------------------------------------- post 1200 x 675 and the home og:image 1200 x 630
for (const [name, H, dirs] of [["post-1200x675.png", 675, [out]], ["og-1200x630.png", 630, [out, pub]]] as const) {
  const W = 1200;
  const s = H > 650 ? 11 : 10;
  const rodY = Math.round(H * 0.5);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${TINT}"/>`;
  svg += floor(rodY + 15 * s, W, H);
  svg += rod(300 - 22 * s, 300 + 22 * s, rodY, s) + cap(300 - 22 * s, rodY, s) + cap(300 + 22 * s, rodY, s);
  svg += await fig(drawK6(t), s, 300, rodY);
  const L = 610;
  svg += display(L, 250, 68, CREAM, "KICKER is a meme.", "start");
  svg += display(L, 330, 56, BRASS, "we only move sideways.", "start");
  svg += display(L, 400, 56, BRASS, "no spinning.", "start", 600);
  svg += words(L, H - 46, 22, CREAM, "kickerhq.vercel.app · $KICKER · @kicker_art", "start", 400, 0.72);
  await save(name, svg + "</svg>", W, [...dirs]);
}

// ---------------------------------------------------------------- the meme panels, 4 x 2
{
  const tile = 540;
  const gap = 12;
  const cols = 4;
  const rows = Math.ceil(MEMES.length / cols);
  const comps: sharp.OverlayOptions[] = [];
  for (const [i, m] of MEMES.entries()) {
    const buf = Buffer.from(await (await GET(new Request(`http://x/api/k6?meme=${m.key}&w=${tile}`))).arrayBuffer());
    comps.push({ input: buf, left: gap + (i % cols) * (tile + gap), top: gap + Math.floor(i / cols) * (tile + gap) });
  }
  const [r, g, b] = [0x22, 0x17, 0x0f];
  const buf = await sharp({ create: { width: gap + cols * (tile + gap), height: gap + rows * (tile + gap), channels: 4, background: { r, g, b, alpha: 1 } } }).composite(comps).png().toBuffer();
  writeFileSync(`${out}/memes-4x2.png`, buf);
  console.log("memes-4x2.png", buf.length);
}
