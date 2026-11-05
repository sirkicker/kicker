// KICKER 6 in the browser: a kicker's sprite (shared/k6.ts) onto a canvas at a whole device scale, crisp.
import { drawK6, traitsOf, type K6Opts, type K6Sprite } from "../../shared/k6.js";

const cache = new Map<string, HTMLCanvasElement>();
/** A sprite as a 1:1 canvas, cached by kicker and options. */
export function spriteCanvas(n: number, o: K6Opts & { look?: 1 | -1 } = {}): HTMLCanvasElement {
  const key = `${n}|${o.pose || ""}|${o.kit ? o.kit.a + o.kit.b : ""}|${o.crest ? o.crest.join("") : ""}|${o.gold ? 1 : 0}|${o.mouth || ""}|${o.look || ""}`;
  let c = cache.get(key);
  if (c) return c;
  // look: the same kicker with his eyes the other way (the cover's eyes follow him along the rod)
  const t = traitsOf(n);
  const sp: K6Sprite = drawK6(o.look ? { ...t, look: o.look } : t, o);
  c = document.createElement("canvas");
  c.width = sp.w;
  c.height = sp.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(sp.px), sp.w, sp.h), 0, 0);
  if (cache.size > 1600) cache.clear();
  cache.set(key, c);
  return c;
}

export const dpr = () => Math.min(3, window.devicePixelRatio || 1);

/** Paint a sprite into a canvas element: `css` CSS px per sprite px, rounded to whole device px. Crop rows optional. */
export function paint(cv: HTMLCanvasElement, sprite: HTMLCanvasElement, css: number, crop?: { y: number; h: number }) {
  const d = dpr();
  const s = Math.max(1, Math.round(css * d));
  const y = crop?.y ?? 0;
  const h = crop?.h ?? sprite.height;
  cv.width = sprite.width * s;
  cv.height = h * s;
  cv.style.width = `${(sprite.width * s) / d}px`;
  cv.style.height = `${(h * s) / d}px`;
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(sprite, 0, y, sprite.width, h, 0, 0, sprite.width * s, h * s);
  return s / d;
}
