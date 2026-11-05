// KICKER 5.1 "Kickers": every kicker is a viber. The composition (any viber renders, the rod is skewered through
// him, the kit takes), the set and its album, and the 5.1 API, in memory.
import sharp from "sharp";
import { GET } from "../api/side.js";
import { POST as HIDE } from "../api/man/hide.js";
import { putMan, album, SideError } from "../api/_side.js";
import { KH, KROD, KROD_T, KW, KIT_PATTERNS, anatomy, composeKicker, hexRgb, type Kit } from "../shared/kicker.js";
import { SET_SIZE, VIBERS, dayTeams, familyOf, houseKit, kickerOf, setNo, FAMILIES } from "../shared/side.js";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e as SideError;
  }
};
const px = (v: number) => sharp(`public/vibers/${VIBERS[v - 1]}.png`).ensureAlpha().raw().toBuffer();
const at = (a: ArrayLike<number>, x: number, y: number) => [a[(y * KW + x) * 4], a[(y * KW + x) * 4 + 1], a[(y * KW + x) * 4 + 2], a[(y * KW + x) * 4 + 3]];
const KIT: Kit = { a: "#6e2140", b: "#f1e4c8", p: "hoops" };

// ---------------------------------------------------------------- the set
ok(SET_SIZE === 222 && new Set(VIBERS).size === SET_SIZE, "the set: 222 vibers, no repeats");
ok(FAMILIES.reduce((n, f) => n + VIBERS.filter((x) => f.test(x)).length, 0) === SET_SIZE, "the set: every viber in exactly one family");
ok(familyOf(1).name === "the agents" && familyOf(SET_SIZE).name === "the vibers" && setNo(7) === "No. 007", "the set: families and numbers");

// ---------------------------------------------------------------- composition: any viber renders, the rod goes through
{
  let rendered = 0;
  let skewered = 0;
  let headKept = 0;
  let bores = 0;
  const bad: number[] = [];
  for (let v = 1; v <= SET_SIZE; v++) {
    const src = await px(v);
    const c = composeKicker(src, KIT);
    const filled = c.px.reduce((n, _, i) => (i % 4 === 3 && c.px[i] ? n + 1 : n), 0);
    if (c.px.length === KW * KH * 4 && filled > 1500) rendered++;
    else bad.push(v);
    // the rod's rows: every column inside the body is solid (the rod is hidden there, behind him) ...
    const [l, r] = c.body;
    let inside = true;
    for (let y = KROD - KROD_T / 2; y < KROD + KROD_T / 2; y++) for (let x = l; x <= r; x++) if (!at(c.px, x, y)[3]) inside = false;
    // ... and right outside his flanks it is clear, so the rod is seen going in and coming out
    let outside = true;
    for (let y = KROD - KROD_T / 2; y < KROD + KROD_T / 2; y++) for (const x of [l - 2, r + 2]) if (at(c.px, x, y)[3]) outside = false;
    if (inside && outside) skewered++;
    // the bore: dark sockets on both flanks at the rod, a brass pin on the front
    const dark = (p: number[]) => p[0] + p[1] + p[2] < 200;
    if (dark(at(c.px, l, KROD)) && dark(at(c.px, r, KROD))) bores++;
    // the viber himself is untouched above where his legs began
    const an = anatomy(src);
    const dy = KROD - (an.legTop + 5);
    let same = true;
    for (let y = an.y0; y < an.legTop - 4 && same; y++)
      for (let x = 0; x < 96; x++) {
        const o = (y * 96 + x) * 4;
        if (!src[o + 3]) continue;
        const q = at(c.px, x, y + dy);
        if (q[0] !== src[o] || q[1] !== src[o + 1] || q[2] !== src[o + 2]) {
          same = false;
          break;
        }
      }
    if (same) headKept++;
  }
  ok(rendered === SET_SIZE, `composition: every viber renders as a kicker (${rendered}/${SET_SIZE})${bad.length ? " bad " + bad.join(",") : ""}`);
  ok(skewered === SET_SIZE, `composition: the rod is hidden inside his body and clear at both flanks (${skewered}/${SET_SIZE})`);
  ok(bores === SET_SIZE, `composition: the bore shows on both flanks (${bores}/${SET_SIZE})`);
  ok(headKept === SET_SIZE, `composition: the viber's own pixels are kept above the jersey (${headKept}/${SET_SIZE})`);
}

// ---------------------------------------------------------------- the kit takes
{
  const src = await px(87);
  const near = (p: number[], hex: string, tol = 90) => {
    const c = hexRgb(hex);
    return Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < tol;
  };
  const count = (k: Kit, hex: string) => {
    const c = composeKicker(src, k);
    let n = 0;
    for (let y = KROD - 6; y < KROD + 10; y++) for (let x = c.body[0]; x <= c.body[1]; x++) if (near(at(c.px, x, y), hex)) n++;
    return n;
  };
  ok(count({ a: "#3e5d8c", b: "#f1e4c8", p: "plain" }, "#3e5d8c") > 120, "kit: the shirt is painted in colour a");
  {
    const x = composeKicker(src, { a: "#3e5d8c", b: "#f1e4c8", p: "plain" });
    const y = composeKicker(src, { a: "#cf5b3e", b: "#221419", p: "plain" });
    let diff = 0;
    let headDiff = 0;
    for (let i = 0; i < x.px.length; i += 4) {
      const d = x.px[i] !== y.px[i] || x.px[i + 1] !== y.px[i + 1] || x.px[i + 2] !== y.px[i + 2];
      if (!d) continue;
      if (i / 4 / KW < KROD - 12) headDiff++;
      else diff++;
    }
    ok(count({ a: "#cf5b3e", b: "#221419", p: "plain" }, "#cf5b3e") > 120 && diff > 400 && headDiff === 0, "kit: another kit repaints the body and leaves the viber's head alone");
  }
  ok(count({ a: "#3e5d8c", b: "#f1e4c8", p: "hoops" }, "#f1e4c8") > count({ a: "#3e5d8c", b: "#f1e4c8", p: "plain" }, "#f1e4c8") + 30, "kit: a pattern brings in colour b");
  const shapes = new Set(KIT_PATTERNS.map((p) => composeKicker(src, { a: "#6e2140", b: "#f1e4c8", p }).px.join()));
  ok(shapes.size === KIT_PATTERNS.length, "kit: every pattern draws differently");
  const idle = composeKicker(src, KIT);
  const kick = composeKicker(src, KIT, "kick");
  ok(idle.px.join() !== kick.px.join(), "pose: the kick differs from standing");
  ok(dayTeams("2026-11-05")[0].a !== dayTeams("2026-11-05")[1].a || dayTeams("2026-11-05")[0].p !== dayTeams("2026-11-05")[1].p, "kit: home and away differ");
  ok(houseKit(5).a === houseKit(5).a && /^#[0-9a-f]{6}$/.test(houseKit(200).b), "kit: a house kit for every number");
}

// ---------------------------------------------------------------- 5.0 men are kickers too
{
  const old = { id: "abc12345", n: 3, day: "2026-11-05", shirt: "3".repeat(200) + "0".repeat(56) };
  const k1 = kickerOf(old);
  const k2 = kickerOf(old);
  ok(k1.v >= 1 && k1.v <= SET_SIZE && k1.v === k2.v && k1.kit.a === "#6e2140" && k1.kit.b === "#f1e4c8", "5.0 men: a fixed viber, a kit from their shirt");
  const bare = kickerOf({ id: "zzz99999", n: 4, day: "2026-11-05" });
  ok(bare.kit.a === dayTeams("2026-11-05")[0].a, "a man with no kit wears his team's kit of the day");
}

// ---------------------------------------------------------------- the 5.1 API
const D0 = Date.parse("2026-11-05T12:00:00Z");
const base = { name: "ferro", cap: "sideways is still a direction" };
const a = await putMan({ ...base, v: 87, kit: KIT }, { now: D0, ip: "9.9.9.1" });
ok(a.man.v === 87 && a.man.kit?.a === "#6e2140" && !("shirt" in a.man), "put: a viber in a kit");
const noKit = await putMan({ ...base, name: "lou", v: 12 }, { now: D0, ip: "9.9.9.2" });
ok(noKit.man.v === 12 && !noKit.man.kit, "put: no kit means the team's kit");
for (const [bad, why] of [
  [{ v: 0 }, "number 0"],
  [{ v: SET_SIZE + 1 }, "past the set"],
  [{ v: 2.5 }, "not whole"],
  [{ v: 5, kit: { a: "red", b: "#f1e4c8", p: "hoops" } }, "a bad colour"],
  [{ v: 5, kit: { a: "#f1e4c8", b: "#f1e4c8", p: "spiral" } }, "a bad pattern"],
] as [object, string][]) {
  const e = await err(putMan({ ...base, ...bad }, { now: D0, ip: "9.9.9.3" }));
  ok(e?.status === 400, `put: refuses ${why}`);
}
const neon = await putMan({ ...base, name: "neon", v: 6, kit: { a: "#ff00ff", b: "#000000", p: "plain" } }, { now: D0, ip: "9.9.9.4" });
ok(neon.man.kit!.a !== "#ff00ff" && neon.man.kit!.b !== "#000000", "put: kit colours are clamped into the house gamut");

// ---------------------------------------------------------------- the album
const al = await album();
ok(al.size === SET_SIZE && al.fielded["87"]?.id === a.man.id && al.fielded["12"]?.name === "lou", "album: the first to field a viber gets the slot");
const second = await putMan({ ...base, name: "second", v: 87, kit: KIT }, { now: D0, ip: "9.9.9.5" });
ok((await album()).fielded["87"].id === a.man.id && second.man.v === 87, "album: a second one of him does not take the slot");
process.env.KICKER_ADMIN_KEY = "test-admin-key-not-real";
const h = await HIDE(new Request("http://x/api/man/hide", { method: "POST", body: JSON.stringify({ id: a.man.id }), headers: { "x-admin": "test-admin-key-not-real" } }));
ok(h.status === 200 && !(await album()).fielded["87"], "album: hiding the first one opens the slot again");
delete process.env.KICKER_ADMIN_KEY;
const ar = await GET(new Request("http://x/api/side?album=1"));
ok(ar.status === 200 && /max-age/.test(ar.headers.get("cache-control") || ""), "album: GET, cached");

// ---------------------------------------------------------------- plates
const plate = await GET(new Request("http://x/api/side?img=plate&no=12"));
const pm = await sharp(Buffer.from(await plate.arrayBuffer())).metadata();
ok(plate.status === 200 && pm.width === 1080 && pm.height === 1350, "plate: No. 012 as a 1080x1350 PNG");
const pog = await GET(new Request("http://x/api/side?img=plate-og&no=222"));
const pom = await sharp(Buffer.from(await pog.arrayBuffer())).metadata();
ok(pog.status === 200 && pom.width === 1200 && pom.height === 630, "plate: the last of the set for X, 1200x630");
const card = await GET(new Request(`http://x/api/side?img=portrait&id=${noKit.man.id}`));
const cm = await sharp(Buffer.from(await card.arrayBuffer())).metadata();
ok(card.status === 200 && cm.width === 1080 && cm.height === 1350, "card: a viber-kicker's plate card");
const pp = await GET(new Request("http://x/api/side?view=plate&no=12"));
const ph = await pp.text();
ok(pp.status === 200 && ph.includes("api/side?img=plate-og&amp;no=12") === false && ph.includes("img=plate-og&no=12") && ph.includes("first fielded by") && ph.includes("lou"), "plate page: og:image, and who fielded him first");
ok(ph.includes('href="/k/11"') && ph.includes('href="/k/13"'), "plate page: the ones before and after");
for (const n of ["0", "223", "x"]) ok((await GET(new Request(`http://x/api/side?view=plate&no=${n}`))).status === 404, `plate page: ${n} is not in the set`);
const mp = await (await GET(new Request(`http://x/api/side?view=man&id=${noKit.man.id}`))).text();
ok(mp.includes("/k/12") && mp.includes("vibe/vibe") && !/official|partner|sponsor/i.test(mp), "his page: links his viber, says vibe/vibe, no partner words");
for (const html of [ph, mp]) ok(!/download/i.test(html.replace(/download="/g, "")), "pages say Save, never the other word");

console.log(fails ? `\n${fails} FAILED` : "\nall kicker tests passed");
process.exit(fails ? 1 : 0);
