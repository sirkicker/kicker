// GET /api/facecard?c=<ipfs cid>&s=<ticker>[&z=card]
// Token art for a card face. vibe/vibe's own media renders first (small and fast), public IPFS
// gateways second, a drawn placeholder last. A CID names exact bytes, so hits are cached for good.
import { hash32 } from "../shared/rng.js";

const MEDIA = "https://testnet.vibevibe.fun/media/";
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const MAX_BYTES = 2_500_000;

async function grab(url: string, ms: number): Promise<{ type: string; body: ArrayBuffer } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !/^image\/(png|jpeg|webp|gif|avif)/.test(type)) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES) return null;
    return { type, body };
  } catch {
    return null;
  }
}

function placeholder(sym: string): Response {
  const s = (sym || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "?";
  const h = hash32(s);
  const hues = [338, 186, 44, 302, 18, 160];
  const hue = hues[h % hues.length];
  let px = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 4; x++)
      if ((h >>> ((y * 4 + x) % 31)) & 1) px += `<rect x="${x * 4}" y="${y * 4}" width="4" height="4"/><rect x="${28 - x * 4}" y="${y * 4}" width="4" height="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="96" height="96" shape-rendering="crispEdges"><rect width="32" height="32" fill="hsl(${hue} 55% 18%)"/><g fill="hsl(${hue} 85% 62%)" opacity="0.55">${px}</g><rect x="4" y="11" width="24" height="10" fill="#1a0b16"/><text x="16" y="19" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${s.length > 2 ? 7 : 9}" fill="#fff3e0">${s}</text></svg>`;
  return new Response(svg, {
    status: 200,
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=600, s-maxage=3600", "x-face": "placeholder" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const cid = q.get("c") || "";
  const sym = q.get("s") || "";
  const size = q.get("z") === "card" ? "card" : "thumb";
  if (!/^[A-Za-z0-9]{40,100}$/.test(cid)) return placeholder(sym);
  let hit = await grab(`${MEDIA}${cid}.${size}.webp`, 5000);
  if (!hit) hit = await grab(`${MEDIA}${cid}.webp`, 5000);
  for (const g of GATEWAYS) {
    if (hit) break;
    hit = await grab(g + cid, 5000);
  }
  if (!hit) return placeholder(sym);
  return new Response(hit.body, {
    status: 200,
    headers: { "content-type": hit.type, "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable" },
  });
}
