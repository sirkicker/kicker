// GET /api/felt?id=<id>            -> 1200x630 PNG challenge card for X (CDN-cached for good)
// GET /api/felt?id=<id>&view=page  -> /c/<id>: tiny page whose og:image is that card, then into the game
import { readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import { BLIND_NAME } from "../shared/content.js";
import { RANK_LABEL } from "../shared/data.js";
import { dayLabel } from "../shared/daily.js";
import { getShowdown, type Showdown } from "./_runs.js";

const SITE = "https://kickerhq.vercel.app";
const C = {
  ink: "#1a0816",
  wine: "#3a0b2b",
  teal: "#0c3b40",
  cream: "#fff1dc",
  chips: "#27c4e8",
  mult: "#ff3d7f",
  money: "#ffc23d",
  dim: "#c9a9bd",
};
const SUIT_FACE = ["#1f8fc9", "#e0521b", "#d42a8f", "#b98a00"];

type Node = { type: string; props: Keyed<string, unknown> };
const h = (type: string, style: Keyed<string, unknown>, ...children: (Node | string | null | false)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null && c !== false) },
});
const img = (src: string, style: Keyed<string, unknown>): Node => ({ type: "img", props: { src, style } });

let fonts: { name: string; data: ArrayBuffer; weight: 400; style: "normal" }[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const ab = (x: Buffer) => x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength) as ArrayBuffer;
  const j = await readFile(new URL("./_fonts/Jersey10.ttf", import.meta.url));
  fonts = [{ name: "Jersey", data: ab(j), weight: 400, style: "normal" }];
  return fonts;
}

async function art(cid: string | null): Promise<string | null> {
  if (!cid || !/^[A-Za-z0-9]{40,100}$/.test(cid)) return null;
  try {
    const res = await fetch(`https://testnet.vibevibe.fun/media/${cid}.thumb.webp`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 600_000) return null;
    // the renderer can't read webp: decode, and pixelate the same way the game does (32px, nearest)
    const small = await sharp(buf).resize(32, 32, { fit: "cover" }).png().toBuffer();
    const png = await sharp(small).resize(128, 128, { kernel: "nearest" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

function suitGlyph(u: number, size: number, color: string): Node {
  const paths = [
    `<path d="M8 0 16 8 8 16 0 8Z"/>`,
    `<path d="M8 1 16 15H0Z"/>`,
    `<circle cx="8" cy="8" r="7.5"/>`,
    `<path d="M1 1h14v14H1Z"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}"><g fill="${color}">${paths[u] || paths[0]}</g></svg>`;
  return img(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, { width: size, height: size });
}

function miniCard(c: { s: string; rank: number; suit: number }, pic: string | null, i: number, n: number): Node {
  const tilt = (i - (n - 1) / 2) * 5;
  const col = SUIT_FACE[c.suit] || C.ink;
  return h(
    "div",
    {
      width: 150,
      height: 214,
      background: C.cream,
      borderRadius: 10,
      border: `5px solid ${C.ink}`,
      boxShadow: "0 10px 0 rgba(0,0,0,0.45)",
      flexDirection: "column",
      alignItems: "center",
      padding: 8,
      marginLeft: i === 0 ? 0 : -26,
      transform: `rotate(${tilt}deg) translateY(${Math.abs(tilt) * 2}px)`,
    },
    h(
      "div",
      { width: "100%", justifyContent: "space-between", alignItems: "center" },
      h("div", { fontFamily: "Jersey", fontSize: 38, color: col, lineHeight: 1 }, RANK_LABEL(c.rank)),
      suitGlyph(c.suit, 22, col),
    ),
    pic
      ? img(pic, { width: 104, height: 104, borderRadius: 4, border: `3px solid ${C.ink}`, marginTop: 4 })
      : h("div", { width: 104, height: 104, background: C.wine, borderRadius: 4, marginTop: 4 }),
    h("div", { fontFamily: "Jersey", fontSize: 20, color: C.ink, marginTop: 8 }, "$" + c.s.slice(0, 8)),
  );
}

/** The small house mark a $KICKER holder gets next to their name. Cosmetic only. */
function houseMark(size: number): Node {
  return h(
    "div",
    { width: size, height: size, background: C.ink, border: `3px solid ${C.money}`, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 12, fontSize: size * 0.72, color: C.money, lineHeight: 1 },
    "K",
  );
}

/** "Daily Deal · Oct 14 · 41,250" */
export const dailyLine = (rec: Showdown) => `Daily Deal · ${dayLabel(rec.daily || "")}${rec.best ? ` · ${rec.best.total.toLocaleString("en-US")}` : ""}`;

async function cardPng(rec: Showdown): Promise<Buffer> {
  const cards = (rec.best?.cards.slice(0, 5) || []).sort((a, b) => a.rank - b.rank);
  const pics = await Promise.all(cards.map((c) => art(c.c)));
  const reached = rec.won ? "Cleared all 8 antes" : `Reached ante ${rec.ante} · ${BLIND_NAME[rec.blind]}`;
  const tree = h(
    "div",
    {
      width: 1200,
      height: 630,
      background: `radial-gradient(circle at 30% 30%, #5b1243 0%, ${C.wine} 38%, #160611 100%)`,
      fontFamily: "Jersey",
      color: C.cream,
      position: "relative",
      overflow: "hidden",
    },
    h("div", { position: "absolute", left: -200, top: 380, width: 1700, height: 120, background: C.teal, transform: "rotate(-12deg)", opacity: 0.85 }),
    h("div", { position: "absolute", left: -200, top: 520, width: 1700, height: 40, background: C.mult, transform: "rotate(-12deg)", opacity: 0.5 }),
    h(
      "div",
      { position: "absolute", left: 64, top: 52, flexDirection: "column", width: 560 },
      h("div", { fontFamily: "Jersey", fontSize: 120, lineHeight: 1, color: C.cream, letterSpacing: 4 }, "KICKER"),
      h("div", { fontSize: 28, color: C.dim, marginTop: 4, width: 420 }, "poker roguelike dealt from live vibe/vibe launches"),
      h(
        "div",
        { marginTop: 34, background: C.ink, border: `4px solid ${C.money}`, borderRadius: 10, padding: "10px 18px", alignSelf: "flex-start", fontSize: 30, color: C.money, alignItems: "center" },
        rec.house && rec.name ? houseMark(30) : null,
        rec.daily ? (rec.name ? `${rec.name} dares you` : "Beat this deal") : rec.name ? `${rec.name} dares you: beat my seed` : "Beat my seed",
      ),
      rec.daily
        ? h("div", { marginTop: 22, fontFamily: "Jersey", fontSize: 58, color: C.cream, lineHeight: 1 }, `Daily Deal · ${dayLabel(rec.daily)}`)
        : h("div", { marginTop: 22, fontFamily: "Jersey", fontSize: 64, color: C.cream, lineHeight: 1 }, rec.seed),
      h("div", { marginTop: 10, fontSize: 24, color: C.dim }, rec.daily ? `seed ${rec.seed} · ${rec.won ? "cleared all 8 antes" : `ante ${rec.ante}`}` : `deck #${rec.edition} · ${reached}`),
      rec.best
        ? h(
            "div",
            { marginTop: 26, alignItems: "center" },
            h("div", { background: C.chips, color: C.ink, borderRadius: 8, padding: "6px 14px", fontSize: 28 }, rec.best.handName),
            h("div", { marginLeft: 16, fontFamily: "Jersey", fontSize: 58, color: C.mult, lineHeight: 1 }, rec.best.total.toLocaleString("en-US")),
            h("div", { marginLeft: 10, fontSize: 22, color: C.dim }, "best hand"),
          )
        : null,
    ),
    h(
      "div",
      { position: "absolute", right: 56, top: 190, alignItems: "flex-start" },
      ...cards.map((c, i) => miniCard(c, pics[i], i, cards.length)),
    ),
    h("div", { position: "absolute", right: 64, bottom: 40, fontSize: 26, color: C.cream }, "kickerhq.vercel.app"),
  );
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(rec: Showdown): string {
  const title = rec.daily ? `${esc(dailyLine(rec))} on KICKER` : `Beat ${rec.name ? esc(rec.name) + "'s" : "this"} seed ${rec.seed} on KICKER`;
  const desc = rec.best
    ? `${rec.won ? "Cleared all 8 antes" : `Ante ${rec.ante}`} with a best hand of ${rec.best.total.toLocaleString("en-US")} (${rec.best.handName}). Same deck, same deal: your turn.`
    : `Same deck, same deal: your turn.`;
  const imgUrl = `${SITE}/api/felt?id=${rec.id}`;
  const to = `/?c=${rec.id}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${SITE}/c/${rec.id}"><meta property="og:title" content="${title}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${imgUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${imgUrl}">
<meta http-equiv="refresh" content="0;url=${to}"><style>body{background:#160611;color:#fff1dc;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0}a{color:#ffc23d}</style>
</head><body><a href="${to}">Deal me in</a><script>location.replace(${JSON.stringify(to)})</script></body></html>`;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const rec = await getShowdown(q.get("id") || "");
  if (!rec) {
    if (q.get("view") === "page") return Response.redirect(`${SITE}/`, 302);
    return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=30" } });
  }
  if (q.get("view") === "page") {
    return new Response(page(rec), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=31536000" } });
  }
  try {
    const png = await cardPng(rec);
    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch (e) {
    return new Response("render failed: " + String((e as Error)?.message || e), { status: 500, headers: { "cache-control": "no-store" } });
  }
}
