// The pictures of KICKER 5.1, drawn as SVG and rendered with resvg on request (no Blob): the 1080x1350 plate of a
// kicker, the 1200x630 picture for X, and the table strips the brand assets are cut from. Every kicker is a viber:
// his sprite is read from public/vibers, cast as a foosball figure (shared/kicker.ts) and embedded pixel-exact.
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { KH, KROD, KW, composeKicker, type Kit, type Pose } from "../shared/kicker.js";
import { SET_SIZE, dayLong, familyOf, kickerOf, manNo, placeDay, setNo, viberName, type PublicMan } from "../shared/side.js";

const font = (f: string) => fileURLToPath(new URL(`./_fonts/${f}`, import.meta.url));
const FONTS = () => [font("Jersey10.ttf"), font("IBMPlexMono-Regular.ttf"), font("IBMPlexMono-Medium.ttf")];

export const INK = "#140b10";
export const STOCK = "#2a0f1c";
export const WALL = "#160a10";
export const CREAM = "#f1e4c8";
export const BRASS = "#d0ab5c";
export const DIM = "rgba(241,228,200,0.62)";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---------------------------------------------------------------- vibers as kickers
const rgbaCache = new Map<number, Promise<Buffer>>();
/** A viber's 96x96 RGBA, read once per instance. */
export function viberRgba(v: number): Promise<Buffer> {
  let p = rgbaCache.get(v);
  if (!p) {
    const file = fileURLToPath(new URL(`../public/vibers/${viberName(v)}.png`, import.meta.url));
    p = sharp(file).ensureAlpha().raw().toBuffer();
    rgbaCache.set(v, p);
  }
  return p;
}
/** The kicker as a PNG data URI at a whole scale (nearest neighbour, so every voxel stays square). */
export async function kickerUri(v: number, kit: Kit, s: number, pose: Pose = "idle"): Promise<string> {
  const c = composeKicker(await viberRgba(v), kit, pose);
  const buf = await sharp(Buffer.from(c.px.buffer, c.px.byteOffset, c.px.byteLength), { raw: { width: KW, height: KH, channels: 4 } })
    .resize(KW * s, KH * s, { kernel: "nearest" })
    .png()
    .toBuffer();
  return "data:image/png;base64," + buf.toString("base64");
}
/** The kicker standing on a rod at (cx, rodY): his blurred shadow on the felt, then him. */
export function standing(uri: string, s: number, cx: number, rodY: number, shadow: [number, number]): string {
  const x = Math.round(cx - (KW * s) / 2);
  const y = Math.round(rodY - KROD * s);
  return `<image href="${uri}" x="${x + shadow[0]}" y="${y + shadow[1]}" width="${KW * s}" height="${KH * s}" filter="url(#sil)" opacity="0.5"/><image href="${uri}" x="${x}" y="${y}" width="${KW * s}" height="${KH * s}" image-rendering="optimizeSpeed"/>`;
}

// ---------------------------------------------------------------- the house materials
/** Felt, studio light, grain, brass and gold, the shadow filter. */
export function defs(w: number, h: number, lx: number, ly: number): string {
  return `<defs>
<radialGradient id="light" cx="${lx}" cy="${ly}" r="${Math.max(w, h) * 0.75}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#1b6061"/><stop offset="0.45" stop-color="#11403f"/><stop offset="1" stop-color="#061a1c"/></radialGradient>
<linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#33251a"/><stop offset="0.2" stop-color="#7c6440"/><stop offset="0.36" stop-color="#e3cd96"/><stop offset="0.5" stop-color="#a98c58"/><stop offset="0.8" stop-color="#5c4a30"/><stop offset="1" stop-color="#241a10"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#5a3c00"/><stop offset="0.2" stop-color="#e0aa16"/><stop offset="0.36" stop-color="#fff7cc"/><stop offset="0.5" stop-color="#ffd54d"/><stop offset="0.8" stop-color="#b07f06"/><stop offset="1" stop-color="#3f2a00"/></linearGradient>
<linearGradient id="collar" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#4a3416"/><stop offset="0.35" stop-color="#e2c27a"/><stop offset="0.55" stop-color="#b48e45"/><stop offset="1" stop-color="#3a2810"/></linearGradient>
<filter id="softer" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${Math.round(w / 70)}"/></filter>
<filter id="sil" x="-20%" y="-20%" width="140%" height="140%"><feColorMatrix type="matrix" values="0 0 0 0 0.01  0 0 0 0 0.04  0 0 0 0 0.04  0 0 0 0.9 0"/><feGaussianBlur stdDeviation="${Math.max(3, Math.round(w / 140))}"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.9  0 0 0 0 0.95  0 0 0 0 0.9  0 0 0 0.55 0"/></filter>
<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
</defs>`;
}
export function felt(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#light)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" filter="url(#grain)" opacity="0.07"/>`;
}
export function stock(w: number, h: number, fill = STOCK): string {
  return `<rect width="${w}" height="${h}" fill="${fill}"/><rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.05"/>`;
}
/** A brass rod along y (its centre), with its shadow on the felt below. */
export function rod(x0: number, x1: number, y: number, t: number, sh: number, gold?: [number, number][]): string {
  let s = `<rect x="${x0}" y="${y + sh - t / 2}" width="${x1 - x0}" height="${t * 0.9}" fill="#000" opacity="0.5" filter="url(#softer)"/>`;
  s += `<rect x="${x0}" y="${y - t / 2}" width="${x1 - x0}" height="${t}" fill="url(#brass)"/>`;
  for (const [a, b] of gold || []) s += `<rect x="${a}" y="${y - t / 2}" width="${b - a}" height="${t}" fill="url(#gold)"/>`;
  return s;
}
export function collar(x: number, y: number, t: number): string {
  const w = Math.round(t * 1.1);
  const h = Math.round(t * 1.8);
  return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.round(t * 0.18)}" fill="url(#collar)"/><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${Math.max(2, Math.round(t * 0.12))}" fill="#f6e3a8" opacity="0.5"/>`;
}
/** A printer's registration mark. */
export const reg = (x: number, y: number, r: number, c = BRASS, o = 0.55) =>
  `<g stroke="${c}" stroke-width="${Math.max(1, r / 7)}" fill="none" opacity="${o}"><circle cx="${x}" cy="${y}" r="${r * 0.55}"/><line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}"/><line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/></g>`;

function wrap(text: string, max: number, lines: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) out.push(cur);
      cur = w.slice(0, max);
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const keep = out.slice(0, lines);
    keep[lines - 1] = keep[lines - 1].slice(0, max - 1) + "…";
    return keep;
  }
  return out;
}
export const mono = (x: number, y: number, size: number, fill: string, text: string, o: { w?: number; anchor?: string; ls?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="IBM Plex Mono" font-weight="${o.w || 400}" font-size="${size}" fill="${fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${esc(text)}</text>`;
export const jersey = (x: number, y: number, size: number, fill: string, text: string, anchor = "start", ls = 0.04) =>
  `<text x="${x}" y="${y}" font-family="Jersey 10" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${size * ls}">${esc(text)}</text>`;
export const mark = (x: number, y: number, size: number, fill = CREAM, anchor = "start") => jersey(x, y, size, fill, "KICKER", anchor);

/** A kit described in words, for the plates: "wine and cream, hoops". */
const NAMES: Keyed<string, string> = {
  "#f1e4c8": "cream", "#d6b25e": "brass", "#a2733a": "ochre", "#6e2140": "wine", "#a3344d": "claret", "#cf5b3e": "vermilion",
  "#e3a27a": "peach", "#2f6f62": "felt", "#1e4a53": "teal", "#8db5a3": "sage", "#3e5d8c": "slate", "#a3bad6": "powder",
  "#221419": "ink", "#5c4a50": "smoke", "#b9ada0": "stone", "#e2c3cf": "rose",
};
export const kitWords = (k: Kit) => {
  const a = NAMES[k.a] || "his own colour";
  const b = NAMES[k.b] || "a second";
  return k.p === "plain" ? `${a}, ${b} trim` : `${a} and ${b}, ${k.p}`;
};

// ---------------------------------------------------------------- the plate
export interface PlateOpts {
  motd?: string;
}
/** What a plate shows: a man on a rod, or a viber of the set in his house kit. */
export interface PlateSubject {
  v: number;
  kit: Kit;
  gold?: boolean;
  title: string;
  line: string;
  /** Small catalogue fields, joined with " · ". */
  fields: string[];
  /** Top right, under the number. */
  kicker: string;
}
export function subjectOfMan(m: PublicMan): PlateSubject {
  const { v, kit } = kickerOf(m);
  return {
    v,
    kit,
    gold: !!m.gold,
    title: m.name,
    line: m.cap ? `“${m.cap}”` : "he said nothing. he stood there.",
    fields: [familyOf(v).name, kitWords(kit), `rod of ${dayLong(m.day)}`],
    kicker: `${manNo(m.n)} on the table`,
  };
}

/** 1080 x 1350: the kicker on brass in a felt well, printed on programme stock, with his label. */
export async function plateSvg(sub: PlateSubject, o: PlateOpts = {}): Promise<string> {
  const W = 1080;
  const H = 1350;
  const M = 48; // the printed area's margin
  const wx = M + 24;
  const wy = 176;
  const ww = W - wx * 2;
  const wh = 812;
  const s = 6;
  const rodY = wy + 560;
  const cx = W / 2;
  const uri = await kickerUri(sub.v, sub.kit, s);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(ww, wh, cx, wy + 300)}`;
  svg += stock(W, H);
  svg += reg(24, 24, 12) + reg(W - 24, 24, 12) + reg(24, H - 24, 12) + reg(W - 24, H - 24, 12);
  svg += `<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="${BRASS}" stroke-opacity="0.3" stroke-width="1.5"/>`;
  // head: the mark, and the number as a serial plate
  svg += mark(wx - 2, 142, 84);
  svg += jersey(W - wx, 122, 72, BRASS, setNo(sub.v).replace("No. ", "No."), "end", 0.02);
  svg += mono(W - wx, 150, 17, DIM, o.motd ? `man of the day · ${dayLong(o.motd)}` : sub.kicker, { anchor: "end", ls: 2.2, w: 500 });
  // the well: felt under studio light, the rod, the man
  svg += felt(wx, wy, ww, wh);
  const half = (KW * s) / 2;
  svg += rod(wx, wx + ww, rodY, 30, 84, sub.gold ? [[cx - half - 90, cx + half + 90]] : undefined);
  svg += collar(cx - half - 60, rodY, 30) + collar(cx + half + 60, rodY, 30);
  svg += standing(uri, s, cx, rodY, [24, 66]);
  svg += `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="url(#vig)"/>`;
  // the label
  const ly = wy + wh + 80;
  const nameSize = Math.min(60, Math.floor(ww / (0.6 * Math.max(1, sub.title.length))));
  svg += mono(wx, ly, nameSize, CREAM, sub.title, { w: 500 });
  wrap(sub.line, 46, 2).forEach((l, i) => (svg += mono(wx, ly + 50 + i * 38, 28, "rgba(241,228,200,0.84)", l)));
  svg += `<rect x="${wx}" y="${H - M - 66}" width="${ww}" height="1.5" fill="${BRASS}" opacity="0.32"/>`;
  svg += mono(wx, H - M - 28, 18, DIM, sub.fields.join(" · "), { ls: 0.4 });
  svg += mono(W - wx, H - M - 28, 18, BRASS, "we only move sideways.", { anchor: "end", ls: 0.4, w: 500 });
  return svg + "</svg>";
}

/** 1200 x 630 for X: the kicker on felt to the left, his label on programme stock to the right. */
export async function ogSvg(sub: PlateSubject, o: PlateOpts = {}): Promise<string> {
  const W = 1200;
  const H = 630;
  const FW = 600;
  const s = 4;
  const cx = FW / 2;
  const rodY = 390;
  const uri = await kickerUri(sub.v, sub.kit, s);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(FW, H, FW / 2, 220)}`;
  svg += stock(W, H);
  svg += felt(0, 0, FW, H);
  const half = (KW * s) / 2;
  svg += rod(0, FW, rodY, 20, 56, sub.gold ? [[cx - half - 60, cx + half + 60]] : undefined);
  svg += collar(cx - half - 40, rodY, 20) + collar(cx + half + 40, rodY, 20);
  svg += standing(uri, s, cx, rodY, [16, 44]);
  svg += `<rect x="0" y="0" width="${FW}" height="${H}" fill="url(#vig)"/>`;
  svg += `<rect x="${FW}" y="0" width="2" height="${H}" fill="${BRASS}" opacity="0.5"/>`;
  const L = FW + 56;
  const avail = W - L - 56;
  svg += mark(L - 2, 116, 76);
  svg += jersey(W - 56, 108, 54, BRASS, setNo(sub.v).replace("No. ", "No."), "end", 0.02);
  svg += mono(L, 160, 16, BRASS, o.motd ? `man of the day · ${dayLong(o.motd)}` : sub.kicker, { ls: 2, w: 500 });
  const nameSize = Math.min(48, Math.floor(avail / (0.6 * Math.max(1, sub.title.length))));
  svg += mono(L, 300, nameSize, CREAM, sub.title, { w: 500 });
  const per = Math.floor(avail / (0.6 * 22));
  wrap(sub.line, per, 3).forEach((l, i) => (svg += mono(L, 348 + i * 33, 22, "rgba(241,228,200,0.84)", l)));
  svg += mono(L, H - 76, 16, DIM, "kickers for the vibe/vibe crowd.", { ls: 0.3 });
  svg += mono(L, H - 48, 16, DIM, "we only move sideways · kickerhq.vercel.app", { ls: 0.3 });
  return svg + "</svg>";
}

// ---------------------------------------------------------------- strips, for the brand assets
export interface StripDay {
  day: string;
  men: PublicMan[];
}
/**
 * A stretch of the table: two rods, each day's men on them, the day plates on the rail. With `wallAt` (a fraction of
 * the width) the table ends there: its end wall, the handles, then the room, where `extra` (more SVG) can sit.
 */
export async function stripSvg(days: StripDay[], W: number, H: number, o: { s: number; wallAt?: number; extra?: string }): Promise<string> {
  const s = o.s;
  const rail = Math.round(H * 0.06);
  const top = rail;
  const FH = H - rail * 2;
  const step = Math.round(66 * s);
  const rodYs = [Math.round(top + KROD * s * 0.82), Math.round(top + KROD * s * 0.82 + KH * s * 0.6)];
  const wallX = o.wallAt ? Math.round(W * o.wallAt) : W + step;
  const wallW = Math.round(s * 7);
  const handle = Math.round(step * 0.9);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(W, H, Math.min(wallX, W) * 0.5, H * 0.3)}`;
  svg += felt(0, top, W, FH);
  const figs: [number, string][] = [];
  let x = wallX - Math.round(step * 0.5);
  const plates: string[] = [];
  const collars: number[] = [];
  const golds: [number, number][][] = [[], []];
  for (let di = days.length - 1; di >= 0 && x > -step; di--) {
    const d = days[di];
    const { rods } = placeDay(d.men);
    const len = Math.max(rods[0].length, rods[1].length, 2);
    const x1 = x;
    const x0 = x - len * step;
    for (const r of [0, 1] as const)
      for (const p of rods[r]) {
        const cx = Math.round(x0 + (p.slot + 0.5) * step);
        if (cx < -step || cx > Math.min(W, wallX) + step * 0.3) continue;
        const { v, kit } = kickerOf(p.man);
        figs.push([r, standing(await kickerUri(v, kit, s), s, cx, rodYs[r], [Math.round(s * 4), Math.round(s * 11)])]);
        if (p.man.gold) golds[r].push([cx - step * 0.5, cx + step * 0.5]);
      }
    plates.push(mono(Math.max(x0 + 110, Math.min(x1 - 110, (x0 + x1) / 2)), H - rail / 2 + Math.round(rail * 0.14), Math.round(rail * 0.36), BRASS, `${d.day.slice(8)}.${d.day.slice(5, 7)} · ${d.men.length} kickers`, { anchor: "middle", ls: 1, w: 500 }));
    collars.push(x0 - Math.round(step * 0.12), x1 + Math.round(step * 0.12));
    x = x0 - Math.round(step * 0.35);
  }
  const t = Math.max(8, Math.round(s * 6));
  // the upper rod and its men first, then the lower (which stands nearer to us)
  for (const r of [0, 1] as const) {
    svg += rod(-10, Math.min(W + 10, wallX + wallW + Math.round(handle * 0.35)), rodYs[r], t, Math.round(s * 10), golds[r]);
    for (const cxx of collars) svg += collar(cxx, rodYs[r], t);
    svg += figs.filter((f) => f[0] === r).map((f) => f[1]).join("");
  }
  svg += `<rect x="0" y="${top}" width="${W}" height="${FH}" fill="url(#vig)" opacity="0.8"/>`;
  svg += `<rect x="0" y="0" width="${W}" height="${rail}" fill="${STOCK}"/><rect x="0" y="${rail - 2}" width="${W}" height="2" fill="${BRASS}" opacity="0.45"/>`;
  svg += `<rect x="0" y="${H - rail}" width="${W}" height="${rail}" fill="${STOCK}"/><rect x="0" y="${H - rail}" width="${W}" height="2" fill="${BRASS}" opacity="0.45"/>`;
  svg += plates.join("");
  if (o.wallAt) {
    svg += `<rect x="${wallX + wallW}" y="0" width="${W}" height="${H}" fill="${STOCK}"/><rect x="${wallX + wallW}" y="0" width="${W}" height="${H}" filter="url(#grain)" opacity="0.05"/>`;
    svg += `<defs><linearGradient id="fall" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="grip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14070c"/><stop offset="0.3" stop-color="#5a2338"/><stop offset="0.45" stop-color="#7a3a52"/><stop offset="0.7" stop-color="#2a0f1c"/><stop offset="1" stop-color="#0c0407"/></linearGradient><linearGradient id="wallg" x1="0" x2="1"><stop offset="0" stop-color="#1c0912"/><stop offset="0.3" stop-color="#3a1426"/><stop offset="1" stop-color="#1a0710"/></linearGradient></defs>`;
    svg += `<rect x="${wallX + wallW}" y="0" width="${handle * 1.4}" height="${H}" fill="url(#fall)"/>`;
    svg += `<rect x="${wallX}" y="0" width="${wallW}" height="${H}" fill="url(#wallg)"/><rect x="${wallX}" y="0" width="1.5" height="${H}" fill="${BRASS}" opacity="0.4"/><rect x="${wallX + wallW - 1.5}" y="0" width="1.5" height="${H}" fill="${BRASS}" opacity="0.4"/>`;
    for (const ry of rodYs) {
      const x0 = wallX + wallW;
      svg += `<rect x="${x0}" y="${ry - t / 2}" width="${Math.round(handle * 0.35)}" height="${t}" fill="url(#brass)"/>`;
      const gx = x0 + Math.round(handle * 0.35);
      const gh = Math.round(t * 2.3);
      svg += `<rect x="${gx}" y="${ry - gh / 2}" width="${Math.round(handle * 0.65)}" height="${gh}" rx="${gh / 2}" fill="url(#grip)"/><rect x="${gx}" y="${ry - gh / 2}" width="${gh}" height="${gh}" fill="url(#grip)"/>`;
    }
  }
  return svg + (o.extra || "") + "</svg>";
}

export function png(svg: string, width: number): Buffer {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false, fontFiles: FONTS(), defaultFontFamily: "IBM Plex Mono", monospaceFamily: "IBM Plex Mono" },
  });
  return r.render().asPng();
}
