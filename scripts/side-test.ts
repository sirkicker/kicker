// KICKER 5 "Sideways" API, in memory: make a man, the word filter, the rate limit, hide, day rods, the man of the
// day, the launch colours and the pictures.
import sharp from "sharp";
import { GET, POST } from "../api/side.js";
import { POST as HIDE } from "../api/man/hide.js";
import { putMan, wordProblem, rods, manOfDay, launchLook, SideError } from "../api/_side.js";
import { addDays, defaultMan, pattern, pickOfDay, placeDay, sprite, SW, SH, paletteFrom, clampHex, type PublicMan } from "../shared/side.js";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};
const D0 = Date.parse("2026-11-01T12:00:00Z");
const day = (k: number) => D0 + k * 86_400_000;
const shirt = pattern("hoops", 0, 3, 3);
const base = { name: "ferro", cap: "sideways is still a direction", shirt, head: 1, hair: 2, skin: 3 };
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e as SideError;
  }
};

// ---------------------------------------------------------------- the sprite
{
  const px = sprite({ shirt, head: 0, hair: 0, skin: 0 }, ["#f1e4c8", "#6e2140"]);
  ok(px.length === SW * SH && px.filter(Boolean).length > 400, "sprite: 22x42, filled");
  const up = sprite({ shirt, head: 0, hair: 0, skin: 0 }, ["#f1e4c8", "#6e2140"], "up");
  ok(px.join() !== up.join(), "sprite: the hover pose differs");
  const lazy = defaultMan("x");
  ok(/^[0-9a-f]{256}$/.test(lazy.shirt) && lazy.shirt !== "0".repeat(256), "a lazy man gets a real shirt");
  const pal = paletteFrom([255, 0, 255, 0, 255, 0, 255, 255, 255, 0, 0, 0]);
  ok(pal.length === 16 && pal.every((c) => /^#[0-9a-f]{6}$/.test(c)), "launch palette: 16 colours");
  ok(clampHex("#ff00ff") !== "#ff00ff" && clampHex("#000000") !== "#000000", "palette clamp: no neon, no pure black");
}

// ---------------------------------------------------------------- the word filter
{
  for (const bad of ["visit kicker.fun", "https://x.co", "follow @someone", "free airdrop", "buy now", "n1gg3r", "f u c k", "b.u.y", "my $PEPE", "0x1234567890abcdef", "w w w . site . com", "porn", "send nudes", "t.me/abc"])
    ok(!!wordProblem(bad), `filter refuses "${bad}"`);
  for (const good of ["sideways is still a direction", "class act", "scrap metal", "the accountant", "ana b.", "no spinning. house rules", "assessment pending", "cocktail hour"])
    ok(!wordProblem(good), `filter lets "${good}" through`);
}

// ---------------------------------------------------------------- make a man
const a = await putMan(base, { now: day(0), ip: "1.1.1.1" });
ok(a.man.n === 1 && a.man.day === "2026-11-01" && a.man.name === "ferro" && !("addr" in a.man) && !("t" in a.man), "create: number, day, no private fields");
const e1 = await err(putMan({ ...base, name: "" }, { now: day(0), ip: "1.1.1.2" }));
ok(e1?.status === 400, "create: a name is needed");
const e2 = await err(putMan({ ...base, cap: "dm me for the airdrop" }, { now: day(0), ip: "1.1.1.2" }));
ok(e2?.status === 400 && /not on this table/.test(e2.message), "create: promo caption refused");
const e3 = await err(putMan({ ...base, name: "@kicker_art" }, { now: day(0), ip: "1.1.1.2" }));
ok(e3?.status === 400, "create: @handle name refused");
const e4 = await err(putMan({ ...base, shirt: "zz" }, { now: day(0), ip: "1.1.1.2" }));
ok(e4?.status === 400, "create: a broken shirt refused");
const e5 = await err(putMan({ ...base, head: 99 }, { now: day(0), ip: "1.1.1.2" }));
ok(e5?.status === 400, "create: a head out of range refused");
const long = await putMan({ ...base, name: "x".repeat(40), cap: "y ".repeat(80) }, { now: day(0), ip: "1.1.1.3" });
ok(long.man.name.length === 16 && long.man.cap.length <= 60, "create: name 16, line 60");

// ---------------------------------------------------------------- the rate limit
await putMan(base, { now: day(0), ip: "1.1.1.1" });
await putMan(base, { now: day(0), ip: "1.1.1.1" });
const e6 = await err(putMan(base, { now: day(0), ip: "1.1.1.1" }));
ok(e6?.status === 429, "rate limit: the fourth man from one place waits");
const e7 = await err(putMan({ ...base, name: "" }, { now: day(0), ip: "1.1.1.9" }));
const after = await putMan(base, { now: day(0), ip: "1.1.1.9" });
ok(e7?.status === 400 && !!after.man, "rate limit: a refused man is not counted");
const next = await putMan(base, { now: day(1), ip: "1.1.1.1" });
ok(next.man.day === "2026-11-02", "rate limit: a new day opens the rod again");

// ---------------------------------------------------------------- holders and launches
const g = await putMan({ ...base, addr: "0x" + "ab".repeat(20) }, { now: day(1), ip: "2.2.2.2", balanceOf: async () => 5n });
const ng = await putMan({ ...base, addr: "0x" + "cd".repeat(20) }, { now: day(1), ip: "2.2.2.3", balanceOf: async () => 0n });
const down = await putMan({ ...base, addr: "0x" + "ef".repeat(20) }, { now: day(1), ip: "2.2.2.4", balanceOf: async () => Promise.reject(new Error("rpc")) });
ok(g.man.gold === true && !ng.man.gold && !down.man.gold, "holders stand on the gold, others and a silent chain on brass");
const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 40, b: 120 } } }).png().toBuffer();
const fetchLaunch = async () => ({ name: "Test Launch", symbol: "TST", image: img });
const look = await launchLook("0x" + "12".repeat(20), { fetchLaunch });
ok(look.pal.length === 16 && look.badge.px.length === 216 && look.symbol === "TST", "launch: palette and 6x6 badge");
const withL = await putMan({ ...base, token: "https://testnet.vibevibe.fun/token/0x" + "12".repeat(20) }, { now: day(1), ip: "2.2.2.5", fetchLaunch });
ok(withL.man.pal?.length === 16 && withL.man.badge?.sym === "TST", "create: wears the launch's colours and badge");
const e8 = await err(putMan({ ...base, token: "0x" + "34".repeat(20) }, { now: day(1), ip: "2.2.2.6", fetchLaunch: async () => null }));
ok(e8?.status === 404, "create: a launch that does not answer is refused before counting");

// ---------------------------------------------------------------- day rods
for (let i = 0; i < 4; i++) await putMan({ ...base, name: "man " + i }, { now: day(2), ip: "3.3.3." + i });
const r = await rods("", 6, day(2));
ok(r.first === "2026-11-01" && r.today === "2026-11-03" && r.days.map((d) => d.day).join() === "2026-11-01,2026-11-02,2026-11-03", "rods: from the first day to today, oldest first");
ok(r.days[2].count === 4 && r.days[0].count === 5 && r.days[1].count === 5, "rods: every man on his day");
const r2 = await rods("2026-11-02", 1, day(2));
ok(r2.days.length === 1 && r2.days[0].day === "2026-11-02", "rods: a page ending at a day");
const pl = placeDay(r.days[1].men);
ok(pl.gold[0] + pl.gold[1] === 1 && (pl.rods[0][0]?.man.gold || pl.rods[1][0]?.man.gold) === true, "rods: holders first, on the gold");
ok(pl.rods[0].length + pl.rods[1].length === r.days[1].men.length, "rods: two teams, everyone placed");

// ---------------------------------------------------------------- man of the day
const m1 = await manOfDay("2026-11-03", day(2));
const ids = r.days[1].men.map((m) => m.id);
ok(m1.from === "2026-11-02" && m1.man?.id === pickOfDay("2026-11-03", ids), "man of the day: from yesterday's finished rod, deterministic");
const m1b = await manOfDay("2026-11-03", day(2));
ok(m1b.man?.id === m1.man?.id, "man of the day: the same on every ask");
const first = await manOfDay("2026-11-01", day(2));
ok(first.from === "2026-11-01" && !!first.man, "man of the day: the first day picks from itself");

// ---------------------------------------------------------------- hide
process.env.KICKER_ADMIN_KEY = "test-admin-key-not-real";
const victim = m1.man!.id;
const hBad = await HIDE(new Request("http://x/api/man/hide", { method: "POST", body: JSON.stringify({ id: victim }), headers: { "x-admin": "nope" } }));
ok(hBad.status === 403, "hide: wrong key refused");
const hNone = await HIDE(new Request("http://x/api/man/hide", { method: "POST", body: JSON.stringify({ id: victim }) }));
ok(hNone.status === 403, "hide: no key refused");
const hOk = await HIDE(new Request("http://x/api/man/hide", { method: "POST", body: JSON.stringify({ id: victim }), headers: { "x-admin": "test-admin-key-not-real" } }));
ok(hOk.status === 200, "hide: the admin key hides");
const r3 = await rods("", 6, day(2));
ok(!r3.days.some((d) => d.men.some((m) => m.id === victim)) && r3.days[1].count === r.days[1].count - 1, "hide: gone from the rods");
const m2 = await manOfDay("2026-11-03", day(2));
ok(!!m2.man && m2.man.id !== victim, "hide: the man of the day is picked again among the rest");
const gone = await GET(new Request(`http://x/api/side?man=${victim}`));
const goneImg = await GET(new Request(`http://x/api/side?img=portrait&id=${victim}`));
const gonePage = await GET(new Request(`http://x/api/side?view=man&id=${victim}`));
ok(gone.status === 404 && goneImg.status === 404 && gonePage.status === 404, "hide: gone from his page and his pictures");
const viaSide = await POST(new Request("http://x/api/side", { method: "POST", body: JSON.stringify({ op: "hide", id: a.man.id }), headers: { "x-admin": "test-admin-key-not-real" } }));
ok(viaSide.status === 200, "hide: also through POST /api/side");
delete process.env.KICKER_ADMIN_KEY;
const noKey = await HIDE(new Request("http://x/api/man/hide", { method: "POST", body: JSON.stringify({ id: next.man.id }), headers: { "x-admin": "" } }));
ok(noKey.status === 403, "hide: with no key set on the server, nobody can hide");

// ---------------------------------------------------------------- the pictures and his page
const card = await GET(new Request(`http://x/api/side?img=portrait&id=${withL.man.id}`));
const cbuf = Buffer.from(await card.arrayBuffer());
const cm = await sharp(cbuf).metadata();
ok(card.status === 200 && card.headers.get("content-type") === "image/png" && cm.width === 1080 && cm.height === 1350, "card: 1080x1350 PNG");
ok(/max-age/.test(card.headers.get("cache-control") || ""), "card: cached");
const og = await GET(new Request(`http://x/api/side?img=og&id=${g.man.id}`));
const om = await sharp(Buffer.from(await og.arrayBuffer())).metadata();
ok(og.status === 200 && om.width === 1200 && om.height === 630, "og: 1200x630 PNG");
const page = await GET(new Request(`http://x/api/side?view=man&id=${g.man.id}`));
const html = await page.text();
ok(page.status === 200 && html.includes(`/api/side?img=og&id=${g.man.id}`) && html.includes("og:image") && html.includes("ferro"), "his page: og:image and his name");
ok(!/download/i.test(html.replace(/download="/g, "")), "his page: says Save, never the other word");
const fake = await GET(new Request(`http://x/api/side?img=portrait&id=${g.man.id}&motd=2026-11-03`));
ok(fake.status === 200, "card: a man of the day label is only drawn for the real pick (no error otherwise)");
const put = await POST(new Request("http://x/api/side", { method: "POST", body: JSON.stringify({ op: "put", ...base, name: "via post" }), headers: { "x-forwarded-for": "4.4.4.4" } }));
const pj = (await put.json()) as { man: PublicMan };
ok(put.status === 200 && pj.man.name === "via post", "POST /api/side put");
const today = await GET(new Request("http://x/api/side?rods=&n=3"));
ok(today.status === 200 && /s-maxage/.test(today.headers.get("cache-control") || ""), "rods: CDN cached");
ok(addDays("2026-11-01", -1) === "2026-10-31", "days: arithmetic");

console.log(fails ? `\n${fails} FAILED` : "\nall side tests passed");
process.exit(fails ? 1 : 0);
