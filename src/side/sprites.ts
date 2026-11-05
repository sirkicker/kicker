// Kickers in the browser: each viber's PNG is read once, cast as a foosball figure (shared/kicker.ts) per kit, and
// kept as a two-frame sheet (0: standing, 1: the kick, used on hover) at one pixel per sprite pixel. Drawn scaled up
// with smoothing off, so he is crisp at every whole scale. Plus a soft shadow for the felt.
import { KH, KW, composeKicker, type Kit } from "../../shared/kicker.js";
import { viberName } from "../../shared/side.js";

const pixels = new Map<number, Promise<Uint8ClampedArray>>();
const ready = new Map<number, Uint8ClampedArray>();
const sheets = new Map<string, HTMLCanvasElement>();
const shadows = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();
/** Called whenever a viber that was asked for has arrived, so the caller can redraw. */
export const whenReady = (f: () => void) => listeners.add(f);

export const viberUrl = (v: number) => `/vibers/${viberName(v)}.png`;

/** A viber's 96x96 RGBA. */
export function viberPixels(v: number): Promise<Uint8ClampedArray> {
  let p = pixels.get(v);
  if (!p) {
    p = new Promise<Uint8ClampedArray>((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 96;
        const g = c.getContext("2d", { willReadFrequently: true })!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, 96, 96).data;
        ready.set(v, d);
        res(d);
        listeners.forEach((f) => f());
      };
      img.onerror = () => rej(new Error("viber " + v));
      img.src = viberUrl(v);
    });
    p.catch(() => pixels.delete(v));
    pixels.set(v, p);
  }
  return p;
}

const kitKey = (v: number, k: Kit) => `${v}|${k.a}|${k.b}|${k.p}`;

/** The two-frame sheet of viber v in kit k, or null while his picture is still on its way. */
export function sheetOf(v: number, kit: Kit): HTMLCanvasElement | null {
  const key = kitKey(v, kit);
  const have = sheets.get(key);
  if (have) return have;
  const px = ready.get(v);
  if (!px) {
    void viberPixels(v).catch(() => {});
    return null;
  }
  const c = document.createElement("canvas");
  c.width = KW * 2;
  c.height = KH;
  const g = c.getContext("2d")!;
  for (const [i, pose] of [
    [0, "idle"],
    [1, "kick"],
  ] as const) {
    const out = composeKicker(px, kit, pose);
    g.putImageData(new ImageData(out.px as Uint8ClampedArray<ArrayBuffer>, KW, KH), i * KW, 0);
  }
  sheets.set(key, c);
  return c;
}

/** His silhouette, blurred: drawn under him with smoothing on, offset away from the light. */
export const PAD = 4;
export function shadowOf(v: number, kit: Kit): HTMLCanvasElement | null {
  const key = kitKey(v, kit);
  const have = shadows.get(key);
  if (have) return have;
  const sheet = sheetOf(v, kit);
  if (!sheet) return null;
  const w = KW + PAD * 2;
  const h = KH + PAD * 2;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.filter = "blur(2px)";
  g.drawImage(sheet, 0, 0, KW, KH, PAD, PAD, KW, KH);
  g.filter = "none";
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "rgb(3,10,10)";
  g.fillRect(0, 0, w, h);
  shadows.set(key, c);
  return c;
}

/** One frame of a kicker onto any canvas, at a whole device scale. */
export function drawKicker(ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, frame: 0 | 1, x: number, y: number, s: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, frame * KW, 0, KW, KH, x, y, KW * s, KH * s);
}

/** A kicker painted into a canvas element at a whole device scale (editor preview, album stickers). */
export async function paintKicker(c: HTMLCanvasElement, v: number, kit: Kit, cssScale: number, frame: 0 | 1 = 0, crop?: { y: number; h: number }) {
  await viberPixels(v);
  const sheet = sheetOf(v, kit);
  if (!sheet) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const s = Math.max(1, Math.round(cssScale * dpr));
  const cy = crop?.y ?? 0;
  const ch = crop?.h ?? KH;
  c.width = KW * s;
  c.height = ch * s;
  c.style.width = (KW * s) / dpr + "px";
  c.style.height = (ch * s) / dpr + "px";
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(sheet, frame * KW, cy, KW, ch, 0, 0, KW * s, ch * s);
}
