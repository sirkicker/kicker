// KICKER 6.2 "Own line": KICKER is a meme. The server draws the memes and the two share pages.
// GET  /api/k6?meme=<key> [&w=<px>]   -> one of the finished meme panels, 1080 PNG (the kicker in his own kit)
// GET  /api/k6?img=launch&t=<token> [&w=<px>][&h=<0x holder>] -> a launch's meme: its kicker in its colours, 1080 PNG
// GET  /api/k6?img=launch&n=<n>       -> the same meme for a house kicker (old /k/ links)
// GET  /api/k6?img=og&t=<token> | img=og&n=<n> -> 1200 x 630 og:image (img=launch-og / plate-og: the same)
// GET  /api/k6?img=card|plate&...     -> 6.x links: the launch meme
// GET  /api/k6?r=<old reaction>&...   -> 6.x links: 301 to the matching meme panel, or the launch meme
// GET  /api/k6?launch=<link or 0x…>   -> the launch as its kicker: kit, tint, crest, cleaned name and symbol
// GET  /api/k6?rod=1                  -> today's rod: launches somebody put on the rod today
// GET  /api/k6?holder=<0x…>           -> does that address hold $KICKER (cosmetic: the gold rod and frame)
// GET  /api/k6?view=l&t=<token>       -> /l/<token>: the launch's meme, one Save; og:image is that meme
// GET  /api/k6?view=k&no=<n>          -> /k/<n> (old links): a house kicker's meme, no numbers, no traits
// GET  /api/k6?view=m&id=<id>         -> /m/<id> (5.x men): on to a kicker
// POST /api/k6 {op:"look"|"made", token} -> the launch joins today's rod
import { K6_SIZE, traitsOf } from "../shared/k6.js";
import { HOUSE, tintFrom } from "../shared/k6look.js";
import { KICKER_N, MEMES, RETIRED, launchCaption, memeOf, parseTokenLink } from "../shared/k6react.js";
import { hash32 } from "../shared/rng.js";
import { SITE, SOURCE, TOKEN_URL, X_URL } from "../shared/side.js";
import { SideError, clientIp } from "./_side.js";
import { isHolder, launchOf, lookOf, made, rodToday, type Launch } from "./_k6.js";
import { esc, launchMemeSvg, memeSvg, ogSvg, png, type CardLook } from "./_k6card.js";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });
const pngRes = (buf: Buffer, cache: string) => new Response(new Uint8Array(buf), { headers: { "content-type": "image/png", "cache-control": cache } });
const IMG_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const SET_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";
const html = (body: string, status = 200, cache = "public, max-age=60, s-maxage=600") => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache } });
const notFound = () => new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
const num = (raw: string | null): number | null => {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < K6_SIZE ? n : null;
};
const width = (raw: string | null, full: number) => Math.round(Math.min(full, Math.max(120, Number(raw) || full)));

/** Each finished panel stands on its own stain of the table. */
const PANEL_STAIN: Record<string, string> = {
  "table-spins": "#2f6f62",
  sideways: "#6e2140",
  bolted: "#3e5d8c",
  "no-spinning": "#a3344d",
  "own-goal": "#1e4a53",
  held: "#a2733a",
  goal: "#cf5b3e",
  gg: "#5c4a50",
};
const panelLook = (key: string): CardLook => ({ tint: tintFrom(PANEL_STAIN[key] || "#6e2140"), label: "$KICKER" });

/** Whose meme: a launch (t=) or a house kicker (n= or no=), the kicker himself by default. */
async function who(q: URLSearchParams): Promise<{ n: number; launch: Launch | null } | "bad"> {
  const raw = q.get("t");
  if (raw) {
    const token = parseTokenLink(raw);
    if (!token) return "bad";
    const launch = await launchOf(token);
    return { n: launch.n, launch };
  }
  return { n: num(q.get("n")) ?? num(q.get("no")) ?? KICKER_N, launch: null };
}
const caption = (l: Launch | null) => (l ? launchCaption(l.symbol) : { top: "he's on the rod.", bottom: "sideways only. no spinning." });

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  try {
    if (q.has("meme")) {
      const m = memeOf(q.get("meme") || "");
      if (!m) return json({ error: "no such meme" }, 404, "public, max-age=300");
      return pngRes(png(await memeSvg(m, traitsOf(KICKER_N), panelLook(m.key)), width(q.get("w"), 1080)), SET_CACHE);
    }
    if (q.has("r")) {
      // a 6.x reaction or gesture link: with a launch, that launch's meme; without, the matching panel
      const rest = new URLSearchParams();
      if (q.get("t")) {
        rest.set("img", "launch");
        rest.set("t", q.get("t") || "");
      } else rest.set("meme", RETIRED[q.get("r") || ""] || "sideways");
      if (q.get("w")) rest.set("w", q.get("w") || "");
      return new Response(null, { status: 301, headers: { location: `/api/k6?${rest}`, "cache-control": "public, max-age=86400" } });
    }
    const img = q.get("img");
    if (img === "launch" || img === "card" || img === "plate") {
      if (img === "plate" && num(q.get("no")) === null) return notFound();
      const w = await who(q);
      if (w === "bad") return notFound();
      const gold = await isHolder(q.get("h"));
      const svg = await launchMemeSvg(traitsOf(w.n), lookOf(w.n, w.launch, gold), caption(w.launch));
      return pngRes(png(svg, width(q.get("w"), 1080)), w.launch || gold ? IMG_CACHE : SET_CACHE);
    }
    if (img === "og" || img === "plate-og" || img === "launch-og") {
      if (img === "plate-og" && num(q.get("no")) === null) return notFound();
      if (img === "launch-og" && !parseTokenLink(q.get("t"))) return notFound();
      const w = await who(q);
      if (w === "bad") return notFound();
      return pngRes(png(await ogSvg(traitsOf(w.n), lookOf(w.n, w.launch), caption(w.launch)), 1200), w.launch ? IMG_CACHE : SET_CACHE);
    }
    if (q.has("launch")) {
      const token = parseTokenLink(q.get("launch"));
      if (!token) return json({ error: "that is not a vibe/vibe token link. paste testnet.vibevibe.fun/token/0x…" }, 400);
      return json(await launchOf(token), 200, "public, max-age=600, s-maxage=3600");
    }
    if (q.has("rod")) return json(await rodToday(), 200, "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    if (q.has("holder")) return json({ holder: await isHolder(q.get("holder")) }, 200, "private, max-age=120");
    if (q.get("view") === "k") {
      const n = num(q.get("no"));
      if (n === null) return html(missing(), 404, "public, max-age=60");
      return html(memePage(n, null));
    }
    if (q.get("view") === "l") {
      const token = parseTokenLink(q.get("t"));
      if (!token) return html(missing(), 404, "public, max-age=60");
      let l: Launch;
      try {
        l = await launchOf(token);
      } catch {
        return html(missing("that launch did not answer. check the link."), 404, "public, max-age=60");
      }
      return html(memePage(l.n, l));
    }
    if (q.get("view") === "m") {
      // a 5.x man: his link still lands on a kicker, the one his id picks
      const id = (q.get("id") || "").toLowerCase();
      const to = /^[0-9a-z]{4,12}$/.test(id) ? `/k/${hash32("k6-man|" + id) % K6_SIZE}` : "/";
      return new Response(null, { status: 302, headers: { location: to, "cache-control": "public, max-age=3600" } });
    }
    return json({ error: "unknown" }, 400);
  } catch (e) {
    if (e instanceof SideError) return json({ error: e.message }, e.status);
    return json({ error: "the table did not answer. try again" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: { op?: unknown; token?: unknown };
  try {
    const text = await req.text();
    if (text.length > 600) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    if (body.op === "look" || body.op === "made") {
      const token = parseTokenLink(body.token);
      if (!token) return json({ error: "that is not a vibe/vibe token link" }, 400);
      return json(await made(token, clientIp(req)));
    }
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    if (e instanceof SideError) return json({ error: e.message }, e.status);
    return json({ error: "the table did not answer. try again" }, 500);
  }
}

// ---------------------------------------------------------------- pages: the walnut table and one meme
const H = HOUSE;
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${H.walnut}">
<link rel="icon" type="image/png" href="/brand/k6/favicon-64.png"><link rel="preload" href="/fonts/fraunces-k.woff2" as="font" type="font/woff2" crossorigin>`;
const CSS = `@font-face{font-family:"Fraunces K";src:url(/fonts/fraunces-k.woff2) format("woff2");font-weight:300 800;font-display:swap}*{box-sizing:border-box}
html{background:${H.walnut};color:${H.cream};font:400 17px/1.55 "Fraunces K",Georgia,serif;font-optical-sizing:auto;-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;overflow-x:clip}
a{color:inherit;text-underline-offset:4px;text-decoration-thickness:1px}:focus-visible{outline:2px solid ${H.brassHi};outline-offset:3px}
.top{display:flex;align-items:center;gap:24px;justify-content:space-between;max-width:1240px;width:100%;margin:0 auto;padding:20px clamp(20px,5vw,56px)}
.mark{font-weight:650;font-size:24px;line-height:1;letter-spacing:.08em;text-decoration:none}
.nav{display:flex;gap:22px;font-size:15px}.nav a{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;color:rgba(241,229,204,.8)}.nav a:hover{color:${H.brassHi}}
main{flex:1;display:grid;grid-template-columns:minmax(0,600px) minmax(0,440px);gap:clamp(28px,5vw,72px);align-items:center;justify-content:center;max-width:1240px;width:100%;margin:0 auto;padding:clamp(12px,3vw,40px) clamp(20px,5vw,56px) 72px}
figure{margin:0}.meme img{display:block;width:100%;height:auto;aspect-ratio:1;border-radius:6px;background:${H.walnutHi};box-shadow:0 30px 60px -30px #000,0 0 0 1px rgba(232,207,142,.18)}
.kick{font-size:15px;margin:0 0 8px;color:rgba(241,229,204,.72)}.kick b{font-weight:600;color:${H.cream}}
h1{font-weight:400;font-size:clamp(44px,5vw,72px);line-height:1;margin:0 0 18px;letter-spacing:-.03em}h1 em{font-style:normal;color:${H.brassHi}}
.sub{font-size:19px;line-height:1.45;margin:0 0 26px;color:rgba(241,229,204,.82)}
.acts{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center;font-size:15px}.acts a{min-height:44px;display:inline-flex;align-items:center}
.btn{padding:0 26px;background:${H.brassHi};color:${H.walnut};text-decoration:none;font-weight:600;font-size:16px;border-radius:999px}.btn:hover{background:${H.cream}}
.ne{width:9px;height:9px;fill:currentColor;margin-left:6px}
.find{display:grid;gap:6px;margin-top:44px;padding-top:26px;border-top:1px solid rgba(241,229,204,.18);max-width:440px}.find label{font-size:15px;font-style:italic;color:rgba(241,229,204,.72)}
.find span{display:flex;gap:6px;padding:4px;border-radius:999px;background:${H.walnutHi};box-shadow:0 0 0 1px rgba(241,229,204,.2)}
.find input{flex:1;min-width:0;min-height:44px;padding:0 14px;border:0;border-radius:999px;background:transparent;color:${H.cream};font:inherit;font-size:16px}.find input:focus-visible{outline:none}
.find input::placeholder{color:rgba(241,229,204,.5)}.find button{min-height:44px;padding:0 18px;border:0;border-radius:999px;background:${H.brassHi};color:${H.walnut};font:inherit;font-weight:600;font-size:15px;cursor:pointer}
.gold-line{margin:22px 0 0;font-size:14px;color:rgba(241,229,204,.62)}.gold-line button{min-height:40px;padding:0;border:0;background:none;color:${H.cream};font:inherit;text-decoration:underline;text-decoration-color:rgba(241,229,204,.3);text-underline-offset:5px;cursor:pointer}.gold-line button:hover{color:${H.brassHi}}
.gold .meme img{box-shadow:0 30px 60px -30px #000,0 0 0 2px #d19b2a}
footer{background:${H.walnutDeep};padding:22px clamp(20px,5vw,56px) 28px;font-size:14px;display:flex;flex-wrap:wrap;gap:6px 24px;color:rgba(241,229,204,.78)}footer a{min-height:40px;display:inline-flex;align-items:center;text-decoration:none}footer a:hover{color:${H.brassHi}}
@media (max-width:900px){main{grid-template-columns:1fr;gap:28px}.nav{gap:14px;font-size:14px}}`;
const NE = `<svg class="ne" viewBox="0 0 8 8" aria-hidden="true"><path d="M2 0h6v6H6V3.4L1.4 8 0 6.6 4.6 2H2z"/></svg>`;
const TOP = `<header class="top"><a class="mark" href="/" aria-label="KICKER, home">KICKER</a><nav class="nav" aria-label="KICKER"><a href="/#memes">the memes</a><a href="/#rod">today's rod</a></nav></header>`;
const FOOT = `<footer><a href="/">KICKER</a><a href="${X_URL}" rel="noopener">@kicker_art</a><a href="${TOKEN_URL}" rel="noopener">$KICKER</a><a href="${SOURCE}" rel="noopener">Source</a><a href="/privacy">Privacy</a></footer>`;
/** The quiet, optional sign-in for $KICKER holders (src/k6/gold.ts; Para loads only when it is pressed). */
const GOLD_LINE = `<p class="gold-line" data-gold><span class="gold-say">holding $KICKER?</span> <button type="button">sign in for the gold rod</button></p>`;
/** gold.ts: Vite serves the source in dev; the build writes it as dist/k6-gold.js (vite.config.ts). */
const GOLD_JS = process.env.VERCEL ? "/k6-gold.js" : "/src/k6/gold.ts";
const FIND = `<form class="find" action="/" method="get"><label for="find">put another launch on the rod</label><span><input id="find" name="find" type="text" inputmode="url" spellcheck="false" autocomplete="off" maxlength="200" placeholder="vibe/vibe token link or 0x…"><button type="submit">Put it on</button></span></form>`;

function shell(o: { title: string; desc: string; url: string; img: string; alt: string }, body: string, script = ""): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${o.url}"><meta property="og:type" content="website"><meta property="og:url" content="${o.url}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${o.img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(o.alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@kicker_art"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.desc)}"><meta name="twitter:image" content="${o.img}">
<style>${CSS}</style></head><body>${TOP}${body}${FOOT}${script}</body></html>`;
}

/** /l/<token> (a launch's meme) and /k/<n> (old links: a house kicker's meme). One meme, one Save. */
function memePage(n: number, l: Launch | null): string {
  const q = l ? `t=${l.token}` : `n=${n}`;
  const cap = caption(l);
  const sym = l ? (l.symbol ? "$" + l.symbol : "this launch") : "";
  const file = l ? (l.symbol ? l.symbol.toLowerCase() : l.token.slice(0, 8)) : "house";
  const kick = l ? `<b>${esc(sym)}</b>${l.name ? ` · ${esc(l.name)}` : ""} · a vibe/vibe launch` : "from the house";
  const h1 = l ? `${esc(sym)} is <em>on the rod.</em>` : `he's <em>on the rod.</em>`;
  const sub = l
    ? `its kicker wears its colours, with its picture on his chest. he only moves sideways. one meme, yours to post.`
    : `a kicker from the house, in his own kit. he only moves sideways.`;
  const alt = `${cap.top} ${cap.bottom} A pixel table-football man bolted to a brass rod${l ? ` in ${sym}'s colours, its picture on his chest` : ""}, giving the side-eye.`;
  const body = `<main><figure class="meme"><img src="/api/k6?img=launch&${q}&w=1000" data-gold-src="/api/k6?img=launch&${q}" data-gold-w="1000" width="1080" height="1080" alt="${esc(alt)}"></figure>
<section aria-labelledby="who"><p class="kick">${kick}</p>
<h1 id="who">${h1}</h1>
<p class="sub">${esc(sub)}</p>
<div class="acts"><a class="btn" id="save" href="/api/k6?img=launch&${q}" data-gold-src="/api/k6?img=launch&${q}" download="kicker-${file}.png">Save the meme</a>${l ? `<a href="https://testnet.vibevibe.fun/token/${l.token}" rel="noopener">the launch on vibe/vibe${NE}</a>` : `<a href="/#memes">more memes</a>`}</div>
${l ? GOLD_LINE : ""}
${FIND}</section></main>`;
  // a launch's page puts its kicker on today's rod (once a day per launch, server side); after load, body read
  const script = l
    ? `<script type="module" src="${GOLD_JS}"></script><script>addEventListener("load",function(){setTimeout(function(){try{fetch("/api/k6",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({op:"look",token:${JSON.stringify(l.token)}})}).then(function(r){return r.text()}).catch(function(){})}catch(e){}},200)})</script>`
    : "";
  return shell(
    {
      title: l ? `${sym} is on the rod · KICKER` : "on the rod · KICKER",
      desc: l ? `${sym} is on the rod. Its kicker only moves sideways. No spinning.` : "KICKER is a meme. He only moves sideways. No spinning.",
      url: l ? `${SITE}/l/${l.token}` : `${SITE}/k/${n}`,
      img: `${SITE}/api/k6?img=og&${q}`,
      alt,
    },
    body,
    script,
  );
}

function missing(line = "nobody on this rod."): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>not on the rod · KICKER</title><style>${CSS}main{display:block;max-width:640px}</style></head><body>${TOP}
<main><p class="kick">not on the rod</p><h1>nobody here.</h1><p class="sub">${esc(line)}</p><div class="acts"><a class="btn" href="/">back to the table</a></div>${FIND}</main>${FOOT}</body></html>`;
}

/** For the tests and the brand script: the panel keys in order. */
export const PANELS = MEMES.map((m) => m.key);
