// KICKER 5.1 "Kickers": every kicker is a viber. This turns any 96x96 viber sprite (public/vibers/*.png) into a
// foosball figure, as plain pixel arithmetic shared by the browser (canvas) and the server (sharp + resvg):
//  - the legs are cut off and replaced by the fused kicking foot of a table-football man;
//  - the lower body is painted in a team kit (two colours and a pattern), keeping the voxel light and shade;
//  - the brass rod passes through the body: the body hides it, the bore shows on both flanks and a pin on the front;
//  - every figure is placed in one fixed frame (KW x KH) with the rod on row KROD, so any viber stands on any rod.
// No DOM, no Node: RGBA in, RGBA out.

export const KW = 96;
export const KH = 136;
/** The row of the frame the rod's centre passes through, for every figure. */
export const KROD = 96;
/** The rod's thickness in sprite pixels. */
export const KROD_T = 6;
const SRC = 96;
const INK: RGB = [26, 8, 22];

export type RGB = [number, number, number];
export const KIT_PATTERNS = ["plain", "hoops", "stripes", "halves", "sash", "pin", "quarters", "band"] as const;
export type KitPattern = (typeof KIT_PATTERNS)[number];
export interface Kit {
  /** Shirt colour, #rrggbb. */
  a: string;
  /** Second colour (pattern, collar, foot), #rrggbb. */
  b: string;
  p: KitPattern;
}
export type Pose = "idle" | "kick";

export const hexRgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Lighter (k > 0) toward cream or darker (k < 0) toward a wine ink, so shading stays in the house gamut. */
export function tone(c: RGB, k: number): RGB {
  const to: RGB = k > 0 ? [255, 241, 220] : [22, 6, 16];
  const t = Math.min(1, Math.abs(k));
  return [c[0] + (to[0] - c[0]) * t, c[1] + (to[1] - c[1]) * t, c[2] + (to[2] - c[2]) * t].map(Math.round) as RGB;
}

/** What the composition learns about a viber: where his body ends, how wide it is, where the rod goes. */
export interface Anatomy {
  x0: number;
  x1: number;
  y0: number;
  /** The first row of his legs (cut from here down). */
  legTop: number;
  /** Body columns at the waist. */
  bx0: number;
  bx1: number;
  /** The jersey: rows [jTop, legTop). */
  jTop: number;
  /** The rod's row in the source sprite. */
  rod: number;
}

const isInk = (d: ArrayLike<number>, o: number) => d[o + 3] > 0 && Math.abs(d[o] - INK[0]) + Math.abs(d[o + 1] - INK[1]) + Math.abs(d[o + 2] - INK[2]) < 30;

export function anatomy(src: ArrayLike<number>): Anatomy {
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < SRC && y < SRC && src[(y * SRC + x) * 4 + 3] > 0;
  let x0 = SRC;
  let x1 = 0;
  let y0 = SRC;
  let y1 = 0;
  for (let y = 0; y < SRC; y++)
    for (let x = 0; x < SRC; x++)
      if (op(x, y)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < x0) return { x0: 30, x1: 66, y0: 20, legTop: 80, bx0: 32, bx1: 64, jTop: 62, rod: 70 };
  const h = y1 - y0 + 1;
  // row widths of the silhouette, and how many separate runs a row has (two legs make two runs)
  const runs = (y: number) => {
    let n = 0;
    let inside = false;
    for (let x = x0; x <= x1; x++) {
      const s = op(x, y) && !isInk(src, (y * SRC + x) * 4);
      if (s && !inside) n++;
      inside = s;
    }
    return n;
  };
  const width = (y: number) => {
    let a = -1;
    let b = -1;
    for (let x = x0; x <= x1; x++)
      if (op(x, y)) {
        if (a < 0) a = x;
        b = x;
      }
    return a < 0 ? [0, 0, 0] : [b - a + 1, a, b];
  };
  // the legs: climb from the feet while rows split into two or more runs, or stay narrower than the body
  const minLeg = y1 - Math.round(h * 0.3);
  let legTop = y1 + 1;
  for (let y = y1; y >= minLeg; y--) {
    if (runs(y) >= 2) legTop = y;
    else if (legTop <= y1 && legTop - y > 2) break;
  }
  if (legTop > y1 - Math.round(h * 0.08)) legTop = y1 - Math.round(h * 0.13);
  if (legTop < y1 - Math.round(h * 0.26)) legTop = y1 - Math.round(h * 0.26);
  // the waist: the widest row just above the legs gives the body's span
  let best = [0, 0, 0];
  for (let y = legTop - 1; y >= legTop - 6; y--) {
    const w = width(y);
    if (w[0] > best[0]) best = w;
  }
  const bx0 = best[1];
  const bx1 = best[2];
  const jh = Math.max(11, Math.round(h * 0.2));
  const jTop = legTop - jh;
  const rod = Math.round(jTop + jh * 0.5);
  return { x0, x1, y0, legTop, bx0, bx1, jTop, rod };
}

/** True when jersey pixel (x, y) of a w x h front takes the second colour. */
function patternAt(p: KitPattern, x: number, y: number, w: number, h: number): boolean {
  switch (p) {
    case "hoops":
      return Math.floor((y - 2) / 3) % 2 === 1;
    case "stripes":
      return Math.floor((x - 1) / 3) % 2 === 1;
    case "halves":
      return x >= w / 2;
    case "sash":
      return Math.abs(x - y * 1.15 + 1) <= 2.5;
    case "pin":
      return x % 4 === 2;
    case "quarters":
      return x >= w / 2 === y >= h / 2 + 1;
    case "band":
      return y >= h * 0.4 && y < h * 0.66;
    default:
      return false;
  }
}

export interface Composed {
  /** KW x KH RGBA. */
  px: Uint8ClampedArray;
  an: Anatomy;
  /** Frame x-range of the body at the rod, for hit tests and the bore. */
  body: [number, number];
}

/**
 * The viber as a kicker, in the fixed frame. `pose` "kick" swings the foot up toward the viewer (the lower body
 * shortens around the rod, as a real figure does when it is turned).
 */
export function composeKicker(src: ArrayLike<number>, kit: Kit, pose: Pose = "idle"): Composed {
  const an = anatomy(src);
  const out = new Uint8ClampedArray(KW * KH * 4);
  const put = (x: number, y: number, c: RGB, a = 255) => {
    if (x < 0 || y < 0 || x >= KW || y >= KH) return;
    const o = (y * KW + x) * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = a;
  };
  const A = hexRgb(kit.a);
  const B = hexRgb(kit.b);
  const kick = pose === "kick";
  const g = geometry(an);
  const dy = KROD - g.rodSrc;
  // 1. the viber himself, untouched, down to where his legs began
  for (let y = 0; y < an.legTop; y++)
    for (let x = 0; x < SRC; x++) {
      const o = (y * SRC + x) * 4;
      if (src[o + 3]) put(x, y + dy, [src[o], src[o + 1], src[o + 2]]);
    }
  // his own colour, for the hands: the commonest non-ink colour on his lower flanks
  const hand = flankColour(src, an);
  const cx = g.cx;
  const jw = g.jw;
  const jx0 = cx - (jw >> 1);
  const jTop = an.legTop - 3 + dy;
  const JH = 19;
  const side = Math.max(4, Math.round(jw * 0.16));
  // 2. the jersey: a cast torso with shoulders, tapering a little to the waist; the front lit, the right flank in
  // shade, the pattern on the front, a collar band on top
  const taper = (y: number) => (y >= JH - 6 ? 1 : 0);
  for (let y = 0; y < JH; y++) {
    const inset = taper(y);
    for (let x = inset; x < jw - inset; x++) {
      // round shoulders: the top corners are not shirt
      if (y === 0 && (x < 2 || x >= jw - 2)) continue;
      if (y === 1 && (x < 1 || x >= jw - 1)) continue;
      let c = patternAt(kit.p, x, y, jw - side, JH) ? B : A;
      let k = 0;
      if (y < 2) (c = B), (k = y === 0 ? 0.14 : -0.1);
      if (x >= jw - inset - side) k -= 0.2;
      else if (x <= inset) k += 0.08;
      if (y === JH - 1) k -= 0.14;
      put(jx0 + x, jTop + y, tone(c, k));
    }
  }
  // arms cast along his sides, down past the rod, the hands in his own colour
  for (let y = 2; y < 15; y++) {
    const c = y >= 12 ? hand : y < 6 ? tone(A, 0.02) : tone(A, -0.06);
    for (let x = 0; x < 4; x++) {
      put(jx0 - 4 + x, jTop + y, tone(c, x === 0 ? 0.06 : x === 3 ? -0.18 : 0));
      put(jx0 + jw + x, jTop + y, tone(c, x === 0 ? -0.34 : -0.24));
    }
  }
  // 3. the bore: the rod enters both flanks of the jersey (dark sockets), a brass pin on the front
  const rodY = KROD;
  for (let y = rodY - KROD_T / 2; y < rodY + KROD_T / 2; y++) {
    for (const [x, d] of [
      [jx0 - 4, 1],
      [jx0 + jw + 3, -1],
    ] as [number, number][]) {
      put(x, y, [36, 12, 22]);
      put(x + d, y, [70, 30, 40]);
    }
  }
  const pinX = jx0 + Math.round((jw - side) / 2) - 1;
  put(pinX, rodY - 1, [255, 236, 180]);
  put(pinX + 1, rodY - 1, [214, 178, 94]);
  put(pinX, rodY, [214, 178, 94]);
  put(pinX + 1, rodY, [110, 80, 40]);
  // 4. shorts, then both legs cast as one block that flares into the kicking foot
  const sTop = jTop + JH;
  const sw = jw - 2;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < sw; x++) put(jx0 + 1 + x, sTop + y, tone(B, x >= sw - side ? -0.42 : y === 0 ? -0.32 : -0.22));
  const legW = Math.max(10, Math.round(jw * 0.56));
  const footW = Math.max(16, Math.round(jw * 0.92));
  const H = kick ? 11 : 17;
  const footTop = Math.round(H * 0.6);
  for (let y = 0; y < H; y++) {
    const boot = y >= footTop;
    // the boots flare out over three rows, toes a little forward and to our left
    const f = boot ? Math.min(1, (y - footTop + 1) / 3) : 0;
    const w = Math.round(legW + (footW - legW) * f);
    const x0 = cx - (w >> 1) - Math.round(f * 2);
    const yy = sTop + 4 + y;
    for (let x = x0; x < x0 + w; x++) {
      // the two feet are cast together, but the last rows show the parting between them
      if (boot && y >= H - 3 && Math.abs(x - (cx - 1)) <= 0) continue;
      let c = boot ? B : y < 2 ? tone(B, -0.2) : A;
      let k = 0;
      if (x >= x0 + w - 3) k = -0.24;
      else if (x <= x0) k = 0.1;
      if (boot && y === footTop) k += 0.16;
      if (y === H - 1) c = tone(B, -0.6);
      if (kick && boot) k += 0.1;
      put(x, yy, tone(c, k));
    }
    if (!boot && y >= 2) put(cx - 1, yy, tone(A, -0.36));
  }
  // 5. one ink outline around everything that is new (the viber keeps his own)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < KW && y < KH && out[(y * KW + x) * 4 + 3] > 0;
  const add: [number, number][] = [];
  for (let y = Math.max(0, jTop - 1); y < KH; y++)
    for (let x = 0; x < KW; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) put(x, y, INK);
  return { px: out, an, body: [jx0 - 4, jx0 + jw + 3] };
}

/** The jersey and rod, placed from what the viber looks like. */
export function geometry(an: Anatomy) {
  const cx = Math.round((an.bx0 + an.bx1) / 2);
  const bw = an.bx1 - an.bx0 + 1;
  const jw = Math.max(22, Math.min(40, Math.round(bw * 0.78)));
  // the rod passes through the jersey, a little above its middle
  return { cx, jw, rodSrc: an.legTop - 3 + 8 };
}

function flankColour(src: ArrayLike<number>, an: Anatomy): RGB {
  const m = new Map<string, number>();
  for (let y = an.legTop - 8; y < an.legTop; y++)
    for (let x = an.x0; x <= an.x1; x++) {
      const o = (y * SRC + x) * 4;
      if (!src[o + 3] || isInk(src, o)) continue;
      const k = `${src[o]},${src[o + 1]},${src[o + 2]}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
  let best = "200,180,150";
  let n = 0;
  for (const [k, v] of m) if (v > n) (best = k), (n = v);
  return best.split(",").map(Number) as RGB;
}

/** The soft contact shadow under the foot, as alpha over the frame (for the felt). */
export function footShadow(c: Composed): { x: number; y: number; w: number } {
  let y = KH - 1;
  for (; y > 0; y--) {
    let any = false;
    for (let x = 0; x < KW; x++) if (c.px[(y * KW + x) * 4 + 3]) any = true;
    if (any) break;
  }
  const cx = Math.round((c.an.bx0 + c.an.bx1) / 2);
  const w = Math.round((c.an.bx1 - c.an.bx0) * 0.9);
  return { x: cx - (w >> 1), y, w };
}
