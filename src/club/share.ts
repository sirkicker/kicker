// KICKER Club: the result as an image to save and post. 1200x675: the table as it stood at full time behind a
// dark plate with both crests, the score, the scorers and the calls. Drawn on a 2D canvas, saved on the device only.
import type { Side } from "../../shared/club.js";
import { hash32 } from "../../shared/rng.js";

const W = 1200;
const H = 675;
const FONT = '"Jersey 10", ui-monospace, monospace';
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
/** The lighter of a kit's two colours, so a name in it reads on the dark plate. */
export function readable(kit: [number, number]): string {
  const lum = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  const c = lum(kit[1]) >= lum(kit[0]) ? kit[1] : kit[0];
  return lum(c) < 90 ? "#fff1dc" : hex(c);
}

function shield(g: CanvasRenderingContext2D, kit: [number, number], name: string, x: number, y: number, R: number) {
  const k = R / 50;
  const path = () => {
    g.beginPath();
    g.moveTo(x - 50 * k, y - 45 * k);
    g.lineTo(x + 50 * k, y - 45 * k);
    g.lineTo(x + 50 * k, y + 12 * k);
    g.lineTo(x, y + 57 * k);
    g.lineTo(x - 50 * k, y + 12 * k);
    g.closePath();
  };
  g.save();
  path();
  g.fillStyle = hex(kit[0]);
  g.fill();
  g.clip();
  g.fillStyle = hex(kit[1]);
  g.globalAlpha = 0.9;
  const pat = (hash32(name) >> 4) % 4;
  if (pat === 0) for (const sx of [-30, -6, 18]) g.fillRect(x + sx * k, y - 50 * k, 12 * k, 110 * k);
  else if (pat === 1) g.fillRect(x, y - 50 * k, 60 * k, 110 * k);
  else if (pat === 2) {
    g.beginPath();
    g.moveTo(x - 60 * k, y - 5 * k);
    g.lineTo(x, y + 30 * k);
    g.lineTo(x + 60 * k, y - 5 * k);
    g.lineTo(x + 60 * k, y + 60 * k);
    g.lineTo(x - 60 * k, y + 60 * k);
    g.closePath();
    g.fill();
  } else for (const sy of [-30, -5, 20]) g.fillRect(x - 60 * k, y + sy * k, 120 * k, 11 * k);
  g.restore();
  path();
  g.lineWidth = 6 * k;
  g.strokeStyle = "#1a0816";
  g.stroke();
  g.beginPath();
  g.arc(x, y - 3 * k, 20 * k, 0, Math.PI * 2);
  g.fillStyle = "#fff1dc";
  g.fill();
  g.lineWidth = 4 * k;
  g.stroke();
  g.beginPath();
  g.arc(x, y - 3 * k, 8 * k, 0, Math.PI * 2);
  g.fillStyle = hex(kit[0]);
  g.fill();
}

function fitText(g: CanvasRenderingContext2D, t: string, x: number, y: number, max: number, size: number) {
  g.font = `${size}px ${FONT}`;
  const w = g.measureText(t).width;
  if (w > max) g.font = `${Math.floor((size * max) / w)}px ${FONT}`;
  g.fillText(t, x, y);
}

export interface ResultImage {
  home: Side;
  away: Side;
  score: [number, number];
  scorers: { side: 0 | 1; s: string; min: number }[];
  friendly: boolean;
  pens: { won: boolean; a: number; b: number } | null;
  calls: string[];
}

/** Draws the result over `backdrop` (the table as it stands, if the caller has it). */
export function drawResult(r: ResultImage, backdrop?: HTMLCanvasElement | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#12060f";
  g.fillRect(0, 0, W, H);
  if (backdrop && backdrop.width && backdrop.height) {
    const k = Math.max(W / backdrop.width, H / backdrop.height);
    const bw = backdrop.width * k;
    const bh = backdrop.height * k;
    g.drawImage(backdrop, (W - bw) / 2, (H - bh) / 2, bw, bh);
  }
  // the plate
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(18,6,15,0.8)");
  grad.addColorStop(0.45, "rgba(18,6,15,0.72)");
  grad.addColorStop(1, "rgba(18,6,15,0.94)");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillStyle = "#ffc23d";
  g.font = `44px ${FONT}`;
  g.fillText("KICKER CLUB", W / 2, 58);
  g.fillStyle = "#c9a7b8";
  g.font = `26px ${FONT}`;
  g.fillText(r.friendly ? "FRIENDLY · FULL TIME" : "LEAGUE MATCH · FULL TIME", W / 2, 98);
  // crests, names, score
  shield(g, r.home.kit, r.home.name, 190, 300, 92);
  shield(g, r.away.kit, r.away.name, W - 190, 300, 92);
  g.fillStyle = readable(r.home.kit);
  fitText(g, r.home.name.toUpperCase(), 190, 430, 320, 44);
  g.fillStyle = readable(r.away.kit);
  fitText(g, r.away.name.toUpperCase(), W - 190, 430, 320, 44);
  g.fillStyle = "#ffc23d";
  g.font = `200px ${FONT}`;
  g.lineWidth = 14;
  g.strokeStyle = "#1a0816";
  const sc = `${r.score[0]}:${r.score[1]}`;
  g.strokeText(sc, W / 2, 290);
  g.fillText(sc, W / 2, 290);
  if (r.pens) {
    g.fillStyle = "#fff1dc";
    g.font = `32px ${FONT}`;
    g.fillText(`PENALTIES ${r.pens.a}-${r.pens.b}`, W / 2, 400);
  }
  // scorers under each name
  g.font = `26px ${FONT}`;
  for (const side of [0, 1] as const) {
    const list = r.scorers.filter((s) => s.side === side).map((s) => `$${s.s.slice(0, 8)} ${s.min}'`);
    g.fillStyle = side === 0 ? "#7cf0b0" : "#ff8a80";
    list.slice(0, 4).forEach((t, i) => g.fillText(t, side === 0 ? 190 : W - 190, 474 + i * 30));
  }
  if (r.calls.length) {
    g.fillStyle = "#c9a7b8";
    fitText(g, "CALLS: " + r.calls.join(" · ").toUpperCase(), W / 2, 600, W - 120, 26);
  }
  g.fillStyle = "#ffc23d";
  g.font = `28px ${FONT}`;
  g.fillText("kickerhq.vercel.app", W / 2, 642);
  return c;
}

/** Draws the result and saves it as a PNG on this device. */
export async function saveResult(r: ResultImage, backdrop?: HTMLCanvasElement | null): Promise<void> {
  try {
    await document.fonts.load(`44px "Jersey 10"`);
  } catch {
    /* the fallback face will do */
  }
  const c = drawResult(r, backdrop);
  const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/png"));
  if (!blob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const slug = (s: string) => s.replace(/\W+/g, "-").toLowerCase();
  a.download = `kicker-${slug(r.home.name)}-${r.score[0]}-${r.score[1]}-${slug(r.away.name)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
