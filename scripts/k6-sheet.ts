// KICKER 6: contact sheets of the set for the drawing passes. Usage: tsx scripts/k6-sheet.ts <out.png> [first] [poses]
import sharp from "sharp";
import { K6H, K6W, K6RW, K6_ROD, K6_ROD_T, POSES, drawK6, traitsOf, hexRgb, BRASS, type K6Pose } from "../shared/k6.js";
import { k6Tint } from "../shared/k6look.js";

const out = process.argv[2] || "qa/k6/sheet.png";
const first = Number(process.argv[3] || 0);
const list = (process.env.K6_LIST || "").split(",").filter(Boolean).map(Number);
const mode = process.argv[4] || "set";
const S = 6;
const PAD = 2;
const COLS = 6;
const ROWS = 4;
const FW = mode === "poses" ? K6RW : K6W;
const TW = (FW + PAD * 2) * S;
const TH = (K6H + PAD * 2) * S;
const W = TW * COLS;
const H = TH * ROWS;
const buf = Buffer.alloc(W * H * 4);
const put = (x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
  buf[o + 3] = 255;
};
for (let i = 0; i < COLS * ROWS; i++) {
  const n = list.length ? list[i % list.length] : mode === "poses" ? first : (first + i * 47) % 1111;
  const pose: K6Pose = mode === "poses" ? POSES[i % POSES.length] : "idle";
  const t = traitsOf(mode === "poses" ? first + Math.floor(i / POSES.length) * 13 : n);
  if (list.length && mode !== "poses") Object.assign(t, traitsOf(n));
  const sp = drawK6(t, { pose });
  const ox = (i % COLS) * TW;
  const oy = Math.floor(i / COLS) * TH;
  const bg = hexRgb(k6Tint(t));
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) put(ox + x, oy + y, bg);
  // the rod behind him
  const ry = oy + (PAD + K6_ROD) * S;
  for (let y = -((K6_ROD_T / 2) * S); y < (K6_ROD_T / 2) * S; y++) {
    const k = (y + (K6_ROD_T / 2) * S) / (K6_ROD_T * S);
    const c = k < 0.2 ? BRASS[0] : k < 0.45 ? BRASS[2] : k < 0.75 ? BRASS[1] : BRASS[0];
    for (let x = 0; x < TW; x++) put(ox + x, ry + y, hexRgb(c));
  }
  const dx = (FW - sp.w) / 2;
  for (let y = 0; y < K6H; y++)
    for (let x = 0; x < sp.w; x++) {
      const o = (y * sp.w + x) * 4;
      if (!sp.px[o + 3]) continue;
      const c: [number, number, number] = [sp.px[o], sp.px[o + 1], sp.px[o + 2]];
      for (let j = 0; j < S; j++) for (let k = 0; k < S; k++) put(ox + (PAD + dx + x) * S + k, oy + (PAD + y) * S + j, c);
    }
}
await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
console.log(out, W, H);
