// KICKER 5 "Sideways".
// GET  /api/side?rods=<day>&n=<k>       -> up to k day rods ending at that day (today if absent), oldest first
// GET  /api/side?motd=<day>             -> the man of the day
// GET  /api/side?man=<id>               -> one man
// GET  /api/side?holder=<0x…>         -> does that address hold $KICKER (cosmetic: the gold rod)
// GET  /api/side?token=<0x… or link>    -> a vibe/vibe launch's name, symbol, clamped palette and 6x6 badge
// GET  /api/side?img=portrait|og&id=<id>[&motd=<day>] -> PNG, 1080x1350 portrait or 1200x630 for X, drawn on request
// GET  /api/side?view=man&id=<id|today> -> /m/<id>: his page
// GET  /api/side?album=1                -> which vibers of the set have been fielded, and by whom first
// GET  /api/side?img=plate|plate-og&no=<n> -> PNG of No. n of the set, in his house kit
// GET  /api/side?view=plate&no=<n>      -> /k/<n>: his plate page in the set
// POST /api/side {op:"put", name, cap, shirt, head, hair, skin, token?, badge?, addr?} -> {man, today}
// POST /api/side {op:"hide", id} with header x-admin  (also POST /api/man/hide)
import { SITE, SET_SIZE, dayLong, familyOf, houseKit, kickerOf, manNo, setNo, utcDay, DAY_RE, X_URL, TOKEN_URL, SOURCE, type PublicMan } from "../shared/side.js";
import { SideError, album, clientIp, fieldedBy, getMan, hideMan, launchLook, manOfDay, putMan, rods, tokenOf } from "./_side.js";
import { esc, kitWords, ogSvg, plateSvg, png, subjectOfMan, type PlateSubject } from "./_sidecard.js";
import { kickerBalance } from "./_house.js";
import { publicMan } from "../shared/side.js";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

const fail = (e: unknown) => {
  if (e instanceof SideError) return json({ error: e.message }, e.status);
  return json({ error: "the table did not answer. try again" }, 500);
};

/** Is he the man of the day for `day`? Only then does a picture say so. */
async function motdFor(day: string | null, id: string): Promise<string | undefined> {
  if (!day || !DAY_RE.test(day)) return undefined;
  const r = await manOfDay(day);
  return r.man?.id === id ? r.day : undefined;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  try {
    if (q.has("rods")) {
      const r = await rods(q.get("rods") || "", Number(q.get("n") || 6));
      const past = (q.get("rods") || "") < r.today && !!q.get("rods");
      return json(r, 200, past ? "public, max-age=60, s-maxage=600, stale-while-revalidate=600" : "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
    }
    if (q.has("motd")) {
      const r = await manOfDay(q.get("motd") || utcDay());
      return json(r, 200, "public, max-age=60, s-maxage=300");
    }
    if (q.has("man")) {
      const m = await getMan(q.get("man") || "");
      return m ? json({ man: publicMan(m) }, 200, "public, max-age=60, s-maxage=300") : json({ error: "no such man" }, 404, "public, max-age=30");
    }
    if (q.has("holder")) {
      const a = q.get("holder") || "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return json({ error: "bad address" }, 400);
      let holder: boolean | null = null;
      try {
        holder = (await kickerBalance(a)) > 0n;
      } catch {
        holder = null;
      }
      return json({ holder }, 200, "private, max-age=120");
    }
    if (q.has("token")) {
      const t = tokenOf(q.get("token"));
      if (!t) return json({ error: "that is not a vibe/vibe token link" }, 400);
      const l = await launchLook(t);
      return json({ token: l.token, name: l.name, symbol: l.symbol, pal: l.pal, badge: l.badge }, 200, "public, max-age=3600, s-maxage=86400");
    }
    if (q.has("album")) return json(await album(), 200, "public, max-age=20, s-maxage=60, stale-while-revalidate=120");
    if (q.get("img") === "plate" || q.get("img") === "plate-og") {
      const v = setNum(q.get("no"));
      if (!v) return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=30" } });
      const sub = setSubject(v, await fieldedBy(v));
      const og = q.get("img") === "plate-og";
      const buf = png(og ? await ogSvg(sub) : await plateSvg(sub), og ? 1200 : 1080);
      return new Response(new Uint8Array(buf), { headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } });
    }
    if (q.has("img")) {
      const m = await getMan(q.get("id") || "");
      if (!m) return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=30" } });
      const motd = await motdFor(q.get("motd"), m.id);
      const og = q.get("img") === "og";
      const sub = subjectOfMan(publicMan(m));
      const buf = png(og ? await ogSvg(sub, { motd }) : await plateSvg(sub, { motd }), og ? 1200 : 1080);
      return new Response(new Uint8Array(buf), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
      });
    }
    if (q.get("view") === "plate") {
      const v = setNum(q.get("no"));
      if (!v) return new Response(missingPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" } });
      return new Response(platePage(v, await fieldedBy(v)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300" } });
    }
    if (q.get("view") === "man") {
      const id = q.get("id") || "";
      let m: PublicMan | null = null;
      let motd: string | undefined;
      if (id === "today") {
        const r = await manOfDay(utcDay());
        m = r.man;
        motd = r.man ? r.day : undefined;
      } else {
        const got = await getMan(id);
        m = got ? publicMan(got) : null;
        if (m) motd = await motdFor(utcDay(), m.id);
      }
      if (!m) return new Response(missingPage(), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" } });
      return new Response(manPage(m, motd, id === "today"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300" } });
    }
    return json({ error: "unknown" }, 400);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    if (body.op === "put") return json(await putMan(body, { ip: clientIp(req) }));
    if (body.op === "hide") return json({ hidden: await hideMan(String(body.id || ""), req.headers.get("x-admin")) });
    return json({ error: "unknown op" }, 400);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- the plate pages (/m/<id> and /k/<n>)
const setNum = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= SET_SIZE ? n : 0;
};
interface Fielded {
  id: string;
  day: string;
  name: string;
}
function setSubject(v: number, f: Fielded | null): PlateSubject {
  const fam = familyOf(v);
  const kit = houseKit(v);
  return {
    v,
    kit,
    title: setNo(v),
    line: f ? `first fielded by ${f.name}, ${dayLong(f.day)}.` : "not fielded yet. the slot is open.",
    fields: [fam.name, kitWords(kit), `${v - fam.from + 1} of ${fam.to - fam.from + 1} in the family`],
    kicker: `${fam.name} · ${SET_SIZE} in the set`,
  };
}

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#2a0f1c">
<link rel="icon" type="image/png" href="/brand/side/favicon-64.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&family=Jersey+10&display=swap" rel="stylesheet">`;
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 .95 0 0 0 0 .86 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E")`;
const CSS = `*{box-sizing:border-box}html{background:#2a0f1c;color:#f1e4c8;font:400 15px/1.6 "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:${GRAIN},#2a0f1c}
a{color:inherit;text-underline-offset:4px;text-decoration-thickness:1px}a:hover{color:#e6c67c}a:focus-visible,button:focus-visible{outline:2px solid #e6c67c;outline-offset:4px;border-radius:1px}
.top{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:18px clamp(20px,4vw,56px);border-bottom:1px solid rgba(208,171,92,.28)}
.mark{font-family:"Jersey 10",monospace;font-size:44px;line-height:.8;letter-spacing:.04em;text-decoration:none}
.tag{font-size:12px;letter-spacing:.06em;color:rgba(241,228,200,.66);margin:0}.tag b{font-weight:500;color:#f1e4c8}
.nav{display:flex;gap:22px;font-size:13px}.nav a{display:inline-flex;align-items:center;min-height:44px}
main{flex:1;display:grid;grid-template-columns:minmax(0,600px) minmax(0,420px);gap:clamp(32px,6vw,96px);align-items:center;justify-content:center;padding:clamp(28px,5vw,72px) clamp(20px,5vw,64px)}
figure{margin:0}figure img{display:block;width:100%;height:auto;aspect-ratio:1080/1350;background:#2a0f1c;box-shadow:0 40px 80px -30px rgba(0,0,0,.75),0 0 0 1px rgba(208,171,92,.22)}
.kick{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#d0ab5c;margin:0 0 14px;font-weight:500}
h1{font-weight:500;font-size:clamp(30px,4vw,46px);line-height:1.08;margin:0 0 16px;letter-spacing:-.01em;overflow-wrap:anywhere}
h1.no{font-family:"Jersey 10",monospace;font-weight:400;font-size:clamp(64px,8vw,104px);line-height:.85;letter-spacing:.02em;color:#d0ab5c}
.cap{font-size:18px;line-height:1.55;margin:0 0 28px;color:rgba(241,228,200,.88);overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:7.5em 1fr;margin:0 0 30px;font-size:13px;border-top:1px solid rgba(208,171,92,.28)}
dt,dd{margin:0;padding:9px 0;border-bottom:1px solid rgba(208,171,92,.16)}dt{color:rgba(241,228,200,.56)}dd{color:rgba(241,228,200,.9)}
.acts{display:flex;flex-wrap:wrap;gap:10px 22px;font-size:14px;align-items:center}.acts a{display:inline-flex;align-items:center;min-height:44px}
.btn{padding:0 18px;background:#d0ab5c;color:#2a0f1c;text-decoration:none;font-weight:500}.btn:hover{background:#e6c67c;color:#2a0f1c}
.pn{display:flex;justify-content:space-between;margin-top:30px;padding-top:14px;border-top:1px solid rgba(208,171,92,.28);font-size:13px}.pn a{min-height:44px;display:inline-flex;align-items:center}
footer{padding:20px clamp(20px,4vw,56px) 28px;font-size:12px;color:rgba(241,228,200,.66);display:flex;flex-wrap:wrap;gap:6px 18px;border-top:1px solid rgba(208,171,92,.2)}
footer a{display:inline-flex;min-height:28px;align-items:center}
@media (max-width:860px){main{grid-template-columns:1fr;gap:28px;padding-top:24px}figure{max-width:520px;margin:0 auto;width:100%}.tag{display:none}.top{grid-template-columns:auto 1fr}.nav{justify-content:flex-end;gap:14px}}`;
export const FOOTER = `<footer><span>KICKER · <a href="${X_URL}" rel="noopener">@kicker_art</a></span><a href="${TOKEN_URL}" rel="noopener">$KICKER ↗</a><a href="/club">the old table</a><a href="${SOURCE}" rel="noopener">Source</a><a href="/privacy">Privacy</a></footer>`;
const TOP = `<header class="top"><a class="mark" href="/" aria-label="KICKER, home">KICKER</a><p class="tag">kickers for the <b>vibe/vibe</b> crowd. we only move sideways.</p><nav class="nav" aria-label="KICKER"><a href="/#table">today's rod</a><a href="/#set">the set</a><a href="/#make">field a kicker</a></nav></header>`;

function shell(o: { title: string; desc: string; url: string; canonical: string; img: string; alt: string }, body: string): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${o.canonical}"><meta property="og:type" content="website"><meta property="og:url" content="${o.url}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${o.img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(o.alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@kicker_art"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.desc)}"><meta name="twitter:image" content="${o.img}">
<style>${CSS}</style></head><body>${TOP}${body}${FOOTER}</body></html>`;
}

function manPage(m: PublicMan, motd: string | undefined, today: boolean): string {
  const { v, kit } = kickerOf(m);
  const fam = familyOf(v);
  const title = motd ? `${m.name}, man of the day · KICKER` : `${m.name} · KICKER`;
  const desc = `${m.cap ? `“${m.cap}” ` : ""}${setNo(v)} of the set, on the rod of ${dayLong(m.day)}. Kickers for the vibe/vibe crowd. We only move sideways.`;
  const card = `/api/side?img=portrait&id=${m.id}${motd ? `&motd=${motd}` : ""}`;
  const rodName = m.n % 2 ? "the lower rod" : "the upper rod";
  const body = `<main><figure><img src="${card}" width="1080" height="1350" alt="${esc(m.name)}, a viber cast as a foosball kicker, on a brass rod${m.cap ? `: ${esc(m.cap)}` : ""}"></figure>
<section aria-labelledby="who"><p class="kick">${motd ? `man of the day · ${esc(dayLong(motd))}` : `${esc(manNo(m.n))} on the table`}</p>
<h1 id="who">${esc(m.name)}</h1>${m.cap ? `<p class="cap">“${esc(m.cap)}”</p>` : ""}
<dl><dt>viber</dt><dd><a href="/k/${v}">${setNo(v)}</a>, ${esc(fam.name)}</dd><dt>kit</dt><dd>${esc(kitWords(kit))}</dd><dt>rod</dt><dd>${dayLong(m.day)}, ${rodName}</dd>${m.badge ? `<dt>colours</dt><dd>from $${esc(m.badge.sym)} on vibe/vibe</dd>` : ""}${m.gold ? `<dt>stands on</dt><dd>the gold</dd>` : ""}<dt>medium</dt><dd>paint on a viber, brass rod</dd><dt>moves</dt><dd>sideways</dd></dl>
<div class="acts"><a class="btn" href="/?m=${m.id}#table">see him on the rod</a><a href="${card}" download="kicker-${String(m.n).padStart(4, "0")}.png">Save image</a><a href="/?v=${v}#make">make one of him</a></div></section></main>`;
  return shell(
    {
      title,
      desc,
      url: `${SITE}/m/${today ? "today" : m.id}`,
      canonical: `${SITE}/m/${m.id}`,
      img: `${SITE}/api/side?img=og&id=${m.id}${motd ? `&motd=${motd}` : ""}`,
      alt: `${m.name}, a voxel viber cast as a foosball kicker on a brass rod over green felt`,
    },
    body,
  );
}

function platePage(v: number, f: Fielded | null): string {
  const fam = familyOf(v);
  const kit = houseKit(v);
  const card = `/api/side?img=plate&no=${v}`;
  const prev = v > 1 ? v - 1 : SET_SIZE;
  const next = v < SET_SIZE ? v + 1 : 1;
  const body = `<main><figure><img src="${card}" width="1080" height="1350" alt="${setNo(v)}, a voxel viber cast as a foosball kicker in the house kit, on a brass rod"></figure>
<section aria-labelledby="who"><p class="kick">the set · ${esc(fam.name)}</p>
<h1 id="who" class="no">${setNo(v).replace("No. ", "No.")}</h1><p class="cap">${f ? `first fielded by <b>${esc(f.name)}</b>, on the rod of ${dayLong(f.day)}.` : "not fielded yet. nobody has put him on a rod. the slot in the album is open."}</p>
<dl><dt>number</dt><dd>${v} of ${SET_SIZE}</dd><dt>family</dt><dd>${esc(fam.name)}, ${setNo(fam.from)} to ${setNo(fam.to)}</dd><dt>house kit</dt><dd>${esc(kitWords(kit))}</dd><dt>medium</dt><dd>paint on a viber, brass rod</dd><dt>moves</dt><dd>sideways</dd></dl>
<div class="acts"><a class="btn" href="/?v=${v}#make">field him</a>${f ? `<a href="/m/${esc(f.id)}">the first one</a>` : ""}<a href="${card}" download="kicker-no-${String(v).padStart(3, "0")}.png">Save image</a></div>
<nav class="pn" aria-label="the set"><a href="/k/${prev}" rel="prev">← ${setNo(prev)}</a><a href="/#set">the set</a><a href="/k/${next}" rel="next">${setNo(next)} →</a></nav></section></main>`;
  return shell(
    {
      title: `${setNo(v)} · the set · KICKER`,
      desc: `${setNo(v)} of ${SET_SIZE}, ${fam.name}. Every kicker is a viber. ${f ? `First fielded by ${f.name}.` : "Not fielded yet."} We only move sideways.`,
      url: `${SITE}/k/${v}`,
      canonical: `${SITE}/k/${v}`,
      img: `${SITE}/api/side?img=plate-og&no=${v}`,
      alt: `${setNo(v)}, a voxel viber cast as a foosball kicker on a brass rod`,
    },
    body,
  );
}

function missingPage(): string {
  return `<!doctype html><html lang="en"><head>${HEAD}<title>not on the table · KICKER</title><style>${CSS}main{display:block;text-align:left;max-width:640px}</style></head><body>${TOP}
<main><p class="kick">not on the table</p><h1>nobody stands here.</h1><p class="cap">he may have been taken off the rod, or he was never on it.</p><div class="acts"><a class="btn" href="/">back to the table</a></div></main>
${FOOTER}</body></html>`;
}
