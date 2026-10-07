// Redraws the vibe/vibe viber characters as KICKER sprites.
// Source: the 1080px PNGs (flat one-colour background). Steps:
//  1. exact flood fill of the background from the edges (with tolerance), then a 1px halo pass
//  2. crop to the character and downsample to a 96px grid by per-block colour MODE
//     (voxel faces stay flat, edges stay sharp, no blur)
//  3. soft grade toward the game's gamut (no posterising, no dither)
//  4. one clean 1px ink outline around the silhouette
// Usage: node scripts/vibers.mjs <dir with <file>.png>  ->  public/vibers/<file>.png (96x96) + index.json
// Shown with nearest-neighbour scaling (image-rendering: pixelated / Pixi scaleMode "nearest").
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [src] = process.argv.slice(2);
const OUT = "public/vibers";
mkdirSync(OUT, { recursive: true });

const G = 96; // output canvas; the character fills up to G-4 px
const INK = [26, 8, 22];
const WINE = [58, 10, 44];
const TEAL = [14, 82, 87];
const CREAM = [255, 241, 220];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

async function redraw(file) {
  const { data, info } = await sharp(join(src, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  // background colour: median of edge samples
  const samples = [];
  for (let i = 0; i < W; i += 37) samples.push((0 * W + i) * 3, ((H - 1) * W + i) * 3);
  for (let i = 0; i < H; i += 37) samples.push((i * W) * 3, (i * W + W - 1) * 3);
  const bg = [0, 1, 2].map((k) => samples.map((s) => data[s + k]).sort((a, b) => a - b)[samples.length >> 1]);
  const d2 = (o) => (data[o] - bg[0]) ** 2 + (data[o + 1] - bg[1]) ** 2 + (data[o + 2] - bg[2]) ** 2;

  // 1. flood fill from the edges
  const clear = new Uint8Array(W * H);
  const TOL = 16 ** 2 * 3;
  const q = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;
  const push = (k) => {
    if (clear[k] || d2(k * 3) > TOL) return;
    clear[k] = 1;
    q[qt++] = k;
  };
  for (let x = 0; x < W; x++) {
    push(x);
    push((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    push(y * W);
    push(y * W + W - 1);
  }
  while (qh < qt) {
    const k = q[qh++];
    const x = k % W;
    if (x > 0) push(k - 1);
    if (x < W - 1) push(k + 1);
    if (k >= W) push(k - W);
    if (k < W * (H - 1)) push(k + W);
  }
  // halo: anti-aliased pixels touching the cleared area that are still close to the background
  const HALO = 60 ** 2 * 3;
  const halo = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (!clear[k] && (clear[k - 1] || clear[k + 1] || clear[k - W] || clear[k + W]) && d2(k * 3) < HALO) halo.push(k);
    }
  for (const k of halo) clear[k] = 1;

  // 2. crop + mode downsample
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (!clear[y * W + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const cell = Math.max(bw, bh) / (G - 4);
  const ow = Math.round(bw / cell);
  const oh = Math.round(bh / cell);
  const ox = Math.floor((G - ow) / 2);
  const oy = G - 2 - oh;
  const out = Buffer.alloc(G * G * 4);
  for (let gy = 0; gy < oh; gy++)
    for (let gx = 0; gx < ow; gx++) {
      const sx0 = Math.floor(x0 + gx * cell);
      const sy0 = Math.floor(y0 + gy * cell);
      const sx1 = Math.max(sx0 + 1, Math.min(x1 + 1, Math.floor(x0 + (gx + 1) * cell)));
      const sy1 = Math.max(sy0 + 1, Math.min(y1 + 1, Math.floor(y0 + (gy + 1) * cell)));
      const buckets = new Map();
      let opaque = 0;
      let total = 0;
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          total++;
          const k = y * W + x;
          if (clear[k]) continue;
          opaque++;
          const o = k * 3;
          const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
          let b = buckets.get(key);
          if (!b) buckets.set(key, (b = [0, 0, 0, 0]));
          b[0] += data[o];
          b[1] += data[o + 1];
          b[2] += data[o + 2];
          b[3]++;
        }
      if (opaque * 2 < total) continue;
      let best = null;
      for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
      let r = best[0] / best[3];
      let g = best[1] / best[3];
      let b = best[2] / best[3];
      // 3. soft grade: a touch more saturation; deep shadows lean wine, mids a hint of teal, highlights cream
      const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
      const m = (r + g + b) / 3;
      r = m + (r - m) * 1.1;
      g = m + (g - m) * 1.1;
      b = m + (b - m) * 1.1;
      const tint = l < 0.3 ? WINE : l > 0.78 ? CREAM : TEAL;
      const w = l < 0.3 ? 0.28 * (1 - l / 0.3) : l > 0.78 ? 0.1 : 0.05;
      const k = ((oy + gy) * G + ox + gx) * 4;
      out[k] = clamp(r + (tint[0] - r) * w);
      out[k + 1] = clamp(g + (tint[1] - g) * w);
      out[k + 2] = clamp(b + (tint[2] - b) * w);
      out[k + 3] = 255;
    }

  // 4. one clean 1px ink outline, outside the silhouette
  const res = Buffer.from(out);
  const solid = (x, y) => x >= 0 && y >= 0 && x < G && y < G && out[(y * G + x) * 4 + 3] > 0;
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const k = (y * G + x) * 4;
      if (out[k + 3]) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) {
        res[k] = INK[0];
        res[k + 1] = INK[1];
        res[k + 2] = INK[2];
        res[k + 3] = 255;
      }
    }
  return sharp(res, { raw: { width: G, height: G, channels: 4 } }).png({ palette: true, colours: 128, dither: 0, compressionLevel: 9 }).toBuffer();
}

const files = readdirSync(src).filter((f) => f.endsWith(".png")).sort();
const names = [];
let bytes = 0;
for (const f of files) {
  const png = await redraw(f);
  const name = f.replace(/\.png$/, "");
  writeFileSync(join(OUT, name + ".png"), png);
  bytes += png.length;
  names.push(name);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(names));
console.info("redrawn", names.length, "total KB", Math.round(bytes / 1024));
