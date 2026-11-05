// KICKER 6.2 pictures, drawn as SVG and rendered with resvg on request (no Blob, cached by the CDN): the finished meme
// panels and a launch's own meme (1080 x 1080), and the og:images (1200 x 630). All on the walnut house palette with cream type. The kicker himself is the pixel sprite of
// shared/k6.ts, scaled up nearest-neighbour so every pixel stays square.
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { BRASS, GOLD, INK, K6H, K6_SIZE, traitsOf, K6_ROD, K6_ROD_T, drawK6, mix, type K6Pose, type K6Sprite, type Traits } from "../shared/k6.js";
import { HOUSE } from "../shared/k6look.js";

const font = (f: string) => fileURLToPath(new URL(`./_fonts/${f}`, import.meta.url));
// 6.1: one typeface, Fraunces (OFL), as static cuts: Display (144 pt optical size) for captions and numbers, Text for
// the small lines. Built from the variable font by scripts/k61-fonts.py.
const FONTS = () => [font("FrauncesDisplay-400.ttf"), font("FrauncesDisplay-600.ttf"), font("FrauncesText-400.ttf"), font("FrauncesText-600.ttf")];
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CREAM = HOUSE.cream;
const BRASS_HI = HOUSE.brassHi;

/** A sprite as a PNG data URI at a whole scale. */
export async function spriteUri(sp: K6Sprite, s: number): Promise<string> {
  const buf = await sharp(Buffer.from(sp.px.buffer, sp.px.byteOffset, sp.px.byteLength), { raw: { width: sp.w, height: sp.h, channels: 4 } })
    .resize(sp.w * s, sp.h * s, { kernel: "nearest" })
    .png({ compressionLevel: 6 })
    .toBuffer();
  return "data:image/png;base64," + buf.toString("base64");
}

/** Display lines: captions, the wordmark, numbers (Fraunces Display). */
const display = (x: number, y: number, size: number, fill: string, text: string, anchor = "middle", extra = "", w: 400 | 600 = 600) =>
  `<text x="${x}" y="${y}" font-family="Fraunces Display" font-weight="${w}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${/letter-spacing/.test(extra) ? "" : ` letter-spacing="${(size * -0.02).toFixed(1)}"`}${extra}>${esc(text)}</text>`;
const words = (x: number, y: number, size: number, fill: string, text: string, o: { anchor?: string; w?: 400 | 600; op?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="Fraunces Text" font-weight="${o.w || 400}" font-size="${size}" fill="${fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}>${esc(text)}</text>`;

/** Brass (or gold) across, lit from above, as flat pixel bands so it sits with the sprite. */
function rodSvg(x0: number, x1: number, cy: number, s: number, gold?: boolean, shadow = true): string {
  const r = gold ? GOLD : BRASS;
  const t = K6_ROD_T * s;
  const y = cy - t / 2;
  const band = (k: number, h: number, c: string) => `<rect x="${x0}" y="${y + k * s}" width="${x1 - x0}" height="${h * s}" fill="${c}"/>`;
  let out = shadow ? `<rect x="${x0}" y="${y + t + s}" width="${x1 - x0}" height="${s}" fill="#000" opacity="0.22"/>` : "";
  out += band(0, 1, r[2]) + band(0, 0.5, r[3] || r[2]) + band(1, 2, r[1]) + band(3, 1, r[0]);
  return out;
}
/** A rod through a kicker standing at cx: the same length either side of him, a ball cap at each end. */
function centredRod(cx: number, cy: number, s: number, gold?: boolean, half = 24): string {
  const x0 = cx - half * s;
  const x1 = cx + half * s;
  return rodSvg(x0, x1, cy, s, gold) + capSvg(x0, cy, s, gold) + capSvg(x1, cy, s, gold);
}
/** A rod's end: a brass ball cap. */
const capSvg = (cx: number, cy: number, s: number, gold?: boolean) => {
  const r = gold ? GOLD : BRASS;
  const k = s;
  return `<rect x="${cx - 2 * k}" y="${cy - 3 * k}" width="${4 * k}" height="${6 * k}" fill="${INK}"/><rect x="${cx - k}" y="${cy - 2 * k}" width="${2 * k}" height="${4 * k}" fill="${r[1]}"/><rect x="${cx - k}" y="${cy - 2 * k}" width="${k}" height="${k}" fill="${r[2]}"/>`;
};

/** Pixel shapes for the props, in sprite pixels from an origin, scaled. */
function pixels(ox: number, oy: number, s: number, pts: [number, number][], fill: string): string {
  return pts.map(([x, y]) => `<rect x="${ox + x * s}" y="${oy + y * s}" width="${s}" height="${s}" fill="${fill}"/>`).join("");
}

export interface CardLook {
  /** The tint behind him. */
  tint: string;
  /** Launch kit, or none for his own. */
  kit?: { a: string; b: string };
  crest?: string[];
  /** "$SYM", "a vibe/vibe launch" or "$KICKER". */
  label: string;
  /** The launch's name (already through the word filter), if any. */
  name?: string;
  gold?: boolean;
}

/** The floor he stands over: the tint, a shade toward the walnut. */
const floor = (tint: string) => mix(tint, HOUSE.walnutDeep, 0.32);
/** A caption's size: as big as it may be, small enough to fit the width (Fraunces runs about half an em a letter). */
const fit = (text: string, max: number, width: number) => Math.floor(Math.min(max, width / (Math.max(1, text.length) * 0.5)));

/** Pixel arcs round a man who is spinning: the rod turned, he went over the top. */
function spinArcs(cx: number, cy: number, s: number, r: number): string {
  let out = "";
  for (const [a0, a1] of [[200, 290], [20, 110]]) {
    for (let a = a0; a <= a1; a += 9) {
      const x = Math.round((cx + Math.cos((a * Math.PI) / 180) * r) / s) * s;
      const y = Math.round((cy + Math.sin((a * Math.PI) / 180) * r) / s) * s;
      out += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${CREAM}" opacity="${(0.25 + ((a - a0) / (a1 - a0)) * 0.55).toFixed(2)}"/>`;
    }
  }
  return out;
}
/** A brass nut on the rod: the bolt that holds him. */
const nut = (cx: number, cy: number, s: number) =>
  `<rect x="${cx - 3 * s}" y="${cy - 4 * s}" width="${6 * s}" height="${8 * s}" fill="${INK}"/><rect x="${cx - 2 * s}" y="${cy - 3 * s}" width="${4 * s}" height="${6 * s}" fill="${BRASS[1]}"/><rect x="${cx - 2 * s}" y="${cy - 3 * s}" width="${4 * s}" height="${s}" fill="${BRASS[2]}"/><rect x="${cx - s}" y="${cy - s}" width="${2 * s}" height="${2 * s}" fill="${BRASS[0]}"/>`;
/** The ball: ink ring, cream body. */
function ball(x: number, y: number, s: number): string {
  const ring: [number, number][] = [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [4, 3], [1, 4], [2, 4], [3, 4]];
  const fill: [number, number][] = [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]];
  return pixels(x, y, s, ring, INK) + pixels(x, y, s, fill, CREAM) + pixels(x, y, s, [[2, 2], [3, 3]], INK);
}

interface Scene {
  top: string;
  bottom: string;
  pose: K6Pose;
  mouth?: Traits["mouth"] | "open";
  key: string;
}

/**
 * One meme, 1080 x 1080: a hand-composed scene round the kicker on his rod, a small top line and a big punchline,
 * "$KICKER" (or the launch) and the site along the foot. The rod always runs the whole width: he is bolted through
 * its middle.
 */
export async function memeSvg(m: Scene, t: Traits, look: CardLook): Promise<string> {
  const W = 1080;
  const H = W;
  const rodY = m.key === "table-spins" || m.key === "no-spinning" ? 540 : 600;
  const sc = m.key === "gg" ? 10 : m.key === "table-spins" ? 9 : m.key === "no-spinning" ? 11 : 13;
  const top = rodY - K6_ROD * sc;
  const L = t.look;
  const sp = drawK6(t, { pose: m.pose, mouth: m.mouth, kit: look.kit, crest: look.crest, gold: look.gold });
  let cx = W / 2;
  if (m.key === "no-spinning") cx = W / 2 - 150 * L;
  if (m.key === "own-goal") cx = W / 2 + 90 * L;
  let back = "";
  let front = "";
  const figs: { sp: K6Sprite; cx: number; flip?: boolean }[] = [];
  const s = sc;
  if (m.key === "table-spins") {
    // his neighbours went over the top; he did not
    for (const [k, d] of [[-2, 1], [-1, 2], [1, 3], [2, 4]] as const) {
      const other = traitsOf((t.n + d * 131) % K6_SIZE);
      const x = W / 2 + k * 330;
      figs.push({ sp: drawK6(other), cx: x, flip: true });
      back += spinArcs(x, rodY, s, 30 * s);
    }
  }
  if (m.key === "no-spinning") {
    const x = cx + L * 390;
    figs.push({ sp: drawK6(traitsOf((t.n + 277) % K6_SIZE)), cx: x, flip: true });
    back += spinArcs(x, rodY, s, 30 * s);
    // ticks either side of the finger
    const fx = cx - 22 * s + 22 * s + L * 12 * s - (L > 0 ? 0 : s);
    const fy = top + 8 * s;
    front += pixels(fx - 3 * s, fy, s, [[0, 0], [1, 1]], CREAM) + pixels(fx + 3 * s, fy, s, [[1, 0], [0, 1]], CREAM);
  }
  if (m.key === "gg") {
    const other = { ...traitsOf((t.n + 555) % K6_SIZE), look: (-L) as 1 | -1 };
    const gap = 31 * s;
    cx = W / 2 - (L * gap) / 2;
    figs.push({ sp: drawK6(other, { pose: "shake", mouth: "smirk" }), cx: W / 2 + (L * gap) / 2 });
  }
  if (m.key === "sideways") {
    const y = rodY - 2 * s;
    const chev = (x: number, d: number) => pixels(x, y - 2 * s, s, d < 0 ? [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] : [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]], CREAM);
    for (const k of [0, 1, 2]) {
      front += chev(cx - 22 * s - k * 6 * s, -1);
      front += chev(cx + 19 * s + k * 6 * s, 1);
    }
  }
  if (m.key === "bolted") front += nut(cx - 19 * s, rodY, s) + nut(cx + 19 * s, rodY, s);
  if (m.key === "own-goal") {
    // the net behind him, the ball in it
    const nx0 = L > 0 ? 70 : W - 70 - 300;
    const ny0 = top + 6 * s;
    const ny1 = top + 46 * s;
    let net = `<rect x="${nx0}" y="${ny0}" width="300" height="${ny1 - ny0}" fill="${HOUSE.walnutDeep}" opacity="0.35"/>`;
    for (let x = nx0; x <= nx0 + 300; x += 30) net += `<rect x="${x}" y="${ny0}" width="2" height="${ny1 - ny0}" fill="${CREAM}" opacity="0.28"/>`;
    for (let y = ny0; y <= ny1; y += 30) net += `<rect x="${nx0}" y="${y}" width="300" height="2" fill="${CREAM}" opacity="0.28"/>`;
    net += `<rect x="${nx0 - 8}" y="${ny0 - 8}" width="316" height="8" fill="${CREAM}"/><rect x="${L > 0 ? nx0 + 300 : nx0 - 8}" y="${ny0 - 8}" width="8" height="${ny1 - ny0 + 8}" fill="${CREAM}"/>`;
    back += net + ball(nx0 + 120, ny1 - 6 * s, s);
  }
  if (m.key === "goal") {
    const cols = [look.kit?.a || "#cf5b3e", look.kit?.b || CREAM, BRASS[2], CREAM, "#a3bad6", "#e3a27a"];
    let seed = t.n * 7 + 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 54; i++) {
      const x = Math.round((rnd() * W) / s) * s;
      const y = Math.round((220 + rnd() * (rodY - 120)) / s) * s;
      if (Math.abs(x - cx) < 9 * s && y > top) continue;
      const tall = rnd() < 0.5;
      back += `<rect x="${x}" y="${y}" width="${tall ? s : 2 * s}" height="${tall ? 2 * s : s}" fill="${cols[i % cols.length]}"/>`;
    }
  }
  figs.unshift({ sp, cx });
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${look.tint}"/>`;
  svg += `<rect x="0" y="${top + 45 * s}" width="${W}" height="${H}" fill="${floor(look.tint)}"/>`;
  svg += back;
  svg += rodSvg(0, W, rodY, s, look.gold);
  for (const f of figs) {
    const img = `<image href="${await spriteUri(f.sp, s)}" x="${Math.round(f.cx - (f.sp.w * s) / 2)}" y="${top}" width="${f.sp.w * s}" height="${K6H * s}"/>`;
    // over the top: mirrored about the rod, so he hangs upside down from it
    svg += f.flip ? `<g transform="translate(0 ${2 * rodY}) scale(1 -1)">${img}</g>` : img;
  }
  svg += front;
  svg += display(W / 2, 150, fit(m.top, 66, 940), CREAM, m.top, "middle", "", 400);
  svg += display(W / 2, 972, fit(m.bottom, 120, 980), CREAM, m.bottom);
  svg += words(48, H - 30, 22, CREAM, look.label, { op: 0.8, w: 600 });
  svg += words(W - 48, H - 30, 22, CREAM, "kickerhq.vercel.app", { anchor: "end", op: 0.66 });
  if (look.gold) svg += goldFrame(W, H);
  return svg + "</svg>";
}

/** The launch's meme: the kicker in its colours, its picture on his chest, "$SYM is on the rod." */
export function launchMemeSvg(t: Traits, look: CardLook, caption: { top: string; bottom: string }): Promise<string> {
  return memeSvg({ key: "launch", pose: "idle", ...caption }, t, look);
}

/** A gold-leaf frame for $KICKER holders' pictures (cosmetic). */
function goldFrame(W: number, H: number): string {
  const m = 18;
  const w = 10;
  return `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${GOLD[1]}" stroke-width="${w}"/><rect x="${m - w / 2}" y="${m - w / 2}" width="${W - 2 * m + w}" height="${H - 2 * m + w}" fill="none" stroke="${GOLD[2]}" stroke-width="2"/><rect x="${m + w / 2}" y="${m + w / 2}" width="${W - 2 * m - w}" height="${H - 2 * m - w}" fill="none" stroke="${GOLD[0]}" stroke-width="2"/>`;
}

/** 1200 x 630 for X: the kicker on his rod, left; the meme's two lines, right. */
export async function ogSvg(t: Traits, look: CardLook, caption: { top: string; bottom: string }): Promise<string> {
  const W = 1200;
  const H = 630;
  const s = 11;
  const sp = drawK6(t, { kit: look.kit, crest: look.crest, gold: look.gold });
  const fx = 110;
  const top = 50;
  const rodY = top + K6_ROD * s;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${look.tint}"/>`;
  svg += `<rect x="0" y="${top + 45 * s}" width="${W}" height="${H}" fill="${floor(look.tint)}"/>`;
  svg += centredRod(fx + (sp.w * s) / 2, rodY, s, look.gold);
  svg += `<image href="${await spriteUri(sp, s)}" x="${fx}" y="${top}" width="${sp.w * s}" height="${sp.h * s}"/>`;
  const X = 600;
  svg += display(X, 130, 40, CREAM, "KICKER", "start", ` letter-spacing="5"`);
  svg += display(X, 250, fit(caption.top, 64, 560), CREAM, caption.top, "start", "", 400);
  svg += display(X, 350, fit(caption.bottom, 64, 560), BRASS_HI, caption.bottom, "start", "", 600);
  svg += words(X, H - 46, 22, CREAM, `kickerhq.vercel.app · ${look.label}`, { op: 0.7 });
  if (look.gold) svg += goldFrame(W, H);
  return svg + "</svg>";
}

export function png(svg: string, width: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false, fontFiles: FONTS(), defaultFontFamily: "Fraunces Text" } }).render().asPng();
}
