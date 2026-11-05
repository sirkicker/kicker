// KICKER 6 "Side-eye" / 6.2 "Own line" (KICKER is a meme): the kicker, the memes and the home page's rules.
//  - every kicker 0..1110 renders, the same way twice, inside the palette, closed by an unbroken ink outline;
//  - the meme panels render; a launch's meme renders for three real vibe/vibe launches and for no launch;
//  - the token-link and lookup parsers; today's rod is never short; the home page takes no wheel; the words stay clean.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { INK, K6H, K6RW, K6W, K6_PALETTE, K6_SIZE, POSES, drawK6, hexRgb, kickerOfToken, traitsOf, type K6Sprite } from "../shared/k6.js";
import { KICKER_N, MEMES, ROD_MIN, crestOf, launchCaption, launchKit, parseLookup, parseTokenLink, rodLineup } from "../shared/k6react.js";
import { esc, launchMemeSvg, memeSvg, ogSvg, png } from "../api/_k6card.js";
import { launchOf, lookOf, cleanName } from "../api/_k6.js";
import { GET } from "../api/k6.js";
import { HOUSE, k6Tint, toOklch } from "../shared/k6look.js";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};
const hash = (s: K6Sprite) => createHash("sha1").update(s.px).digest("hex");

// ---------------------------------------------------------------- the set
{
  const pal = new Set(K6_PALETTE.map((c) => hexRgb(c).join(",")));
  const ink = hexRgb(INK).join(",");
  let size = 0;
  let det = 0;
  let outPal = 0;
  let open = 0;
  let edge = 0;
  let bare = 0;
  const seen = new Set<string>();
  for (let n = 0; n < K6_SIZE; n++) {
    const t = traitsOf(n);
    const a = drawK6(t);
    const b = drawK6(traitsOf(n));
    if (a.w !== K6W || a.h !== K6H || a.px.length !== K6W * K6H * 4) size++;
    if (hash(a) !== hash(b)) det++;
    seen.add(hash(a));
    let painted = 0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= a.w || y >= a.h ? 0 : a.px[(y * a.w + x) * 4 + 3]);
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        const o = (y * a.w + x) * 4;
        if (!a.px[o + 3]) continue;
        painted++;
        const c = `${a.px[o]},${a.px[o + 1]},${a.px[o + 2]}`;
        if (!pal.has(c)) outPal++;
        // the outline: a painted pixel that is not ink never touches the empty frame
        if (c !== ink && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1))) open++;
        if (c !== ink && (x === 0 || x === a.w - 1 || y === 0 || y === a.h - 1)) edge++;
      }
    if (painted < 400) bare++;
  }
  ok(size === 0, `set: all ${K6_SIZE} kickers are 32 x 48`);
  ok(det === 0, `set: every kicker 0..${K6_SIZE - 1} renders the same way twice`);
  ok(seen.size === K6_SIZE, `set: ${seen.size} different pictures for ${K6_SIZE} numbers`);
  ok(outPal === 0, `set: every pixel of every kicker is in the fixed palette of ${K6_PALETTE.length} (${outPal} outside)`);
  ok(open === 0, `set: the ink outline is closed on every kicker (${open} painted pixels touch the empty frame)`);
  ok(edge === 0, "set: no paint on the frame's edge (the outline always has room)");
  ok(bare === 0, "set: every kicker is a whole figure");
  ok(traitsOf(0).n === 0 && traitsOf(K6_SIZE).n === 0 && traitsOf(-1).n === K6_SIZE - 1, "set: numbers wrap into 0..1110");
  // poses close too, and stay in the palette
  let poseBad = 0;
  for (const n of [0, 5, 218, 427, 1110])
    for (const pose of POSES) {
      const s = drawK6(traitsOf(n), { pose });
      if (s.w !== (pose === "idle" || pose === "kick" ? K6W : K6RW)) poseBad++;
      for (let i = 0; i < s.px.length; i += 4) if (s.px[i + 3] && !pal.has(`${s.px[i]},${s.px[i + 1]},${s.px[i + 2]}`)) poseBad++;
    }
  ok(poseBad === 0, `set: all ${POSES.length} poses draw in the palette at their frame width`);
  // the specials exist and are rare, without the site ever saying so
  const sp: Record<string, number> = {};
  for (let n = 0; n < K6_SIZE; n++) sp[traitsOf(n).special] = (sp[traitsOf(n).special] || 0) + 1;
  ok(sp["gold leaf"] > 0 && sp.glow > 0 && sp.keeper > 0 && sp.ref > 0 && sp.none > 1000, `set: gold leaf ${sp["gold leaf"]}, glow ${sp.glow}, keepers ${sp.keeper}, refs ${sp.ref}`);
  // every kicker looks sideways
  let front = 0;
  for (let n = 0; n < K6_SIZE; n++) if (Math.abs(traitsOf(n).look) !== 1) front++;
  ok(front === 0, "set: every one of them looks sideways");
}

// ---------------------------------------------------------------- the token link
{
  const T = "0x0207a8675d4a56d6955db805bf5f09db1d21d755";
  const good = [
    `https://testnet.vibevibe.fun/token/${T}`,
    `testnet.vibevibe.fun/token/${T}`,
    `https://testnet.vibevibe.fun/token/${T.toUpperCase().replace("0X", "0x")}/`,
    `https://testnet.vibevibe.fun/token/${T}?ref=x`,
    `  ${T}  `,
    `http://vibevibe.fun/token/${T}#top`,
  ];
  const bad = ["", "hello", `https://evil.example/token/${T}`, `https://testnet.vibevibe.fun.evil.io/token/${T}`, `${T}0`, "0x123", `javascript:alert(1)//${T}`, `https://testnet.vibevibe.fun/launch/${T}`, null, 42];
  ok(good.every((g) => parseTokenLink(g) === T), "link: vibe/vibe token links and bare addresses parse to the lower-case address");
  ok(bad.every((b) => parseTokenLink(b) === null), "link: other sites, look-alike hosts, short or long addresses and junk do not");
  ok(kickerOfToken(T) === kickerOfToken(T.toUpperCase().replace("0X", "0x")) && kickerOfToken(T) >= 0 && kickerOfToken(T) < K6_SIZE, "link: a launch always gets the same kicker of the set");
  const kit = launchKit(["#21211c", "#5f4416", "#a07326", "#f1e4c8", "#221419"]);
  ok(/^#[0-9a-f]{6}$/.test(kit.a) && kit.a !== kit.b && /^#[0-9a-f]{6}$/.test(kit.tint), "link: a launch palette becomes a shirt, a trim and a tint");
  ok(crestOf("ab".repeat(108))?.length === 36 && crestOf("xyz") === undefined, "link: the 6x6 crest only from a whole badge");
  // 6.2: the "put your launch on the rod" box takes a token link, a 0x address or a KICKER /l/ link
  const lk = [`testnet.vibevibe.fun/token/${T}`, `  ${T.toUpperCase().replace("0X", "0x")} `, `https://kickerhq.vercel.app/l/${T}`, `kickerhq.vercel.app/l/${T}/`];
  ok(lk.every((raw) => parseLookup(raw) === T), "lookup: token links, 0x and KICKER /l/ links open the launch's meme");
  const lkBad = ["", "427", "No. 0427", "kickerhq.vercel.app/k/427", "hello", `https://evil.example/token/${T}`, "kickerhq.vercel.app/l/0x123", `https://evil.example/l/${T}`, null, 7];
  ok(lkBad.every((b) => parseLookup(b) === null), "lookup: numbers, /k/ links, junk, other sites and broken links do not");
  ok(cleanName("Haunted Index", "HAUNT").name === "Haunted Index" && cleanName("free airdrop here", "BUY").name === "" && cleanName("x", "BUY").symbol === "", "link: launch names and symbols go through the word filter");
}

// ---------------------------------------------------------------- 6.2: the memes, and a launch's meme for three real launches and none
{
  const tokens = ["0x0207a8675d4a56d6955db805bf5f09db1d21d755", "0xa2a57b7f3368d89d0942e383d5545b527736d33c", "0x0e76e43c28e1094dd0912c33bff34004e110c323"];
  const looks: [string, Awaited<ReturnType<typeof launchOf>> | null][] = [["no token", null]];
  for (const t of tokens) {
    try {
      looks.push([t.slice(0, 8), await launchOf(t)]);
    } catch (e) {
      ok(false, `meme: the launch ${t.slice(0, 10)} answered (${(e as Error).message})`);
    }
  }
  ok(looks.length === 4, `meme: ${looks.length - 1} real vibe/vibe launches read live, plus the house`);
  let bad = 0;
  let made = 0;
  const seen = new Set<string>();
  for (const [, l] of looks) {
    const n = l ? l.n : KICKER_N;
    const cap = l ? launchCaption(l.symbol) : { top: "he's on the rod.", bottom: "sideways only. no spinning." };
    const svg = await launchMemeSvg(traitsOf(n), lookOf(n, l), cap);
    const buf = png(svg, 1080);
    const m = await sharp(buf).metadata();
    const corner = await sharp(buf).extract({ left: 0, top: 0, width: 1, height: 1 }).ensureAlpha().raw().toBuffer();
    made++;
    seen.add(createHash("sha1").update(buf).digest("hex"));
    if (m.width !== 1080 || m.height !== 1080 || corner[3] !== 255) bad++;
    // the caption names the launch's $SYMBOL; no numbers of a set anywhere on it
    if (l && l.symbol && !svg.includes(`$${l.symbol} is on the rod.`)) bad++;
    if (/No\. \d{4}/.test(svg) || /1,111/.test(svg)) bad++;
  }
  ok(bad === 0 && made === 4 && seen.size === 4, `meme: one 1080 meme for 3 launches and none, each its own, naming $SYMBOL, no numbers (${made} memes)`);
  // the finished panels: 6 to 9, each its own picture, no numbers, through the API with cache headers
  ok(MEMES.length >= 6 && MEMES.length <= 9 && new Set(MEMES.map((m) => m.key)).size === MEMES.length, `memes: ${MEMES.length} finished panels`);
  const ph = new Set<string>();
  let pbad = 0;
  for (const m of MEMES) {
    const r = await GET(new Request(`http://x/api/k6?meme=${m.key}`));
    const b = Buffer.from(await r.arrayBuffer());
    const md = await sharp(b).metadata();
    ph.add(createHash("sha1").update(b).digest("hex"));
    if (r.status !== 200 || r.headers.get("content-type") !== "image/png" || !/s-maxage/.test(r.headers.get("cache-control") || "") || md.width !== 1080 || md.height !== 1080) pbad++;
    const svg = await memeSvg(m, traitsOf(KICKER_N), lookOf(KICKER_N, null));
    if (!svg.includes(esc(m.bottom)) || /No\. \d{4}/.test(svg)) pbad++;
  }
  ok(pbad === 0 && ph.size === MEMES.length, `memes: every panel renders at 1080, its own picture, with its punchline (${ph.size})`);
  const og = await sharp(png(await ogSvg(traitsOf(5), lookOf(5, null), { top: "he's on the rod.", bottom: "no spinning." }), 1200)).metadata();
  ok(og.width === 1200 && og.height === 630, "meme: the og:image is 1200 x 630");
  // through the handler: a launch meme, a 404 for a made-up meme, old reaction/gesture/card links
  const r0 = await GET(new Request("http://x/api/k6?img=launch&n=12&w=300"));
  const r2 = await GET(new Request("http://x/api/k6?meme=moon"));
  const r3 = await GET(new Request("http://x/api/k6?img=launch&t=hello"));
  const r4 = await GET(new Request("http://x/api/k6?r=wen-kickoff&n=12&f=sticker"));
  const r5 = await GET(new Request("http://x/api/k6?img=plate&no=12"));
  const r6 = await GET(new Request(`http://x/api/k6?r=goal&t=${tokens[0]}`));
  ok(r0.status === 200 && r0.headers.get("content-type") === "image/png" && r2.status === 404 && r3.status === 404, "meme: the API draws on request, refuses an unknown meme and a bad link");
  ok(r4.status === 301 && /meme=sideways/.test(r4.headers.get("location") || "") && !/sticker/.test(r4.headers.get("location") || "") && r5.status === 200 && r6.status === 301 && /img=launch&t=/.test(r6.headers.get("location") || ""), "meme: old reaction, sticker and plate links land on a meme");
  const kp = await (await GET(new Request("http://x/api/k6?view=k&no=427"))).text();
  ok(/img=launch&n=427/.test(kp) && (kp.match(/>Save/g) || []).length === 1 && !/No\. 0427|traits|eyes<|1,111/.test(kp), "meme: /k/N (old links) shows one meme, one Save, no number and no traits");
  const old = await GET(new Request("http://x/api/k6?view=m&id=abc12345"));
  ok(old.status === 302 && /^\/k\/\d+$/.test(old.headers.get("location") || ""), "meme: an old /m/ link still lands somewhere");
}

// ---------------------------------------------------------------- today's rod and the home page
{
  let short = 0;
  for (const day of ["2026-11-05", "2026-11-06", "2027-01-01"])
    for (let k = 0; k <= 12; k++) {
      const items = Array.from({ length: k }, (_, i) => ({ token: "0x" + String(i).padStart(40, "0"), symbol: "T" + i, n: (i * 97) % K6_SIZE, kit: { a: "#6e2140", b: "#f1e4c8" } }));
      const r = rodLineup(items, day);
      if (r.length < Math.max(ROD_MIN, k) || new Set(r.map((f) => f.n)).size !== r.length || r.slice(0, k).some((f) => f.house)) short++;
    }
  ok(short === 0, `rod: always at least ${ROD_MIN} kickers, launches first, the house never twice`);
  const files = ["index.html", ...readdirSync("src/k6").filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => "src/k6/" + f)];
  const src = files.map((f) => [f, readFileSync(f, "utf8")] as const);
  const wheel = src.filter(([, s]) => /addEventListener\(\s*["'`](wheel|mousewheel|DOMMouseScroll)["'`]|onwheel|onWheel\s*=/.test(s)).map(([f]) => f);
  ok(wheel.length === 0, `home: no wheel handler anywhere on the home page${wheel.length ? " (" + wheel.join(", ") + ")" : ""}`);
  const css = readFileSync("src/k6/home.css", "utf8");
  ok(!/overscroll-behavior(-y)?\s*:\s*(contain|none)/.test(css.replace(/overscroll-behavior-x[^;]*;/g, "")), "home: no vertical overscroll lock in the CSS");
  ok(!/touch-action\s*:\s*(none|pan-x)\b/.test(css), "home: no touch-action that blocks vertical panning");
  const html = readFileSync("index.html", "utf8");
  ok(/src="\/src\/k6\/main\.ts"/.test(html) && !/vibers|viber/i.test(html.replace(/<meta[^>]*>/g, "")), "home: the K6 page, no vibers on it");
  ok(!src.some(([, s]) => /pixi|window\.ethereum|eip6963/i.test(s)), "home: no Pixi, no wallet calls in the home code");
  // the words: what a visitor reads on the home page and the new pages
  const strs = (f: string) => readFileSync(f, "utf8").replace(/download="[^"]*"/g, "").replace(/^\s*\/\/.*$/gm, "").match(/`[^`]*`|"[^"]*"/g)!.join(" ");
  const visible = (html.replace(/download="[^"]*"/g, "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ") + " " + strs("api/k6.ts") + " " + strs("api/_k6card.ts") + " " + MEMES.map((m) => `${m.top} ${m.bottom} ${m.alt}`).join(" ") + " " + strs("src/k6/main.ts") + " " + strs("src/k6/hero.ts") + " " + strs("src/k6/rod.ts")).toLowerCase();
  const banned = ["download", "price", "chart", "buy", "sell", "moon", "poker", "gambl", "bet ", " odds", "jackpot", "loot", "payout", "graduation", "official", "partner", "sponsor", "reward", "earn ", "prize", "guarantee", "rarity", "rare ", "mint", "to the moon"];
  const hits = banned.filter((w) => visible.includes(w));
  ok(hits.length === 0, `words: none of the Spotlight words on the page, the pages or the memes${hits.length ? " (" + hits.join(", ") + ")" : ""}`);
  // 6.2: no pack studio, no meme-reaction kit, no collection words anywhere a visitor reads
  const gone = [/\bzip\b/, /sticker/, /\bcopy\b/, /\bwen\b/, /clipboard/, /recent launches/, /reaction desk/, /make (his|a|the) pack/, /on the bench/, /1,111/, /\bthe set\b/, /kicker of the day/, /no\. 0/, /\btraits?\b/, /player card/, /collection/];
  const left = gone.filter((r) => r.test(visible)).map(String);
  ok(left.length === 0, `6.2 words: no zip, sticker, Copy, wen, chips, numbers, set or traits in the copy${left.length ? " (" + left.join(", ") + ")" : ""}`);
  ok(/kicker is a meme/.test(visible) && /we only move sideways/.test(visible) && /no spinning/.test(visible) && /\$kicker/.test(visible), "6.2 words: the first screen says it is a meme, the meme line and $KICKER");
  ok(!readdirSync("src/k6").some((f) => /desk|zip|wall/.test(f)), "6.2: the desk, the zip writer and the set wall are gone from the code");
  ok(!/kyriektnrv/.test(html + readFileSync("api/k6.ts", "utf8") + readFileSync("shared/side.ts", "utf8") + readFileSync("privacy.html", "utf8")) && /@kicker_art/.test(html), "6.2: the X account is @kicker_art");
}


// ---------------------------------------------------------------- 6.1 "Clean sheet": tints, one typeface, the footer, motion
{
  const lum = (h: string) => {
    const c = hexRgb(h).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  let worstCream = 99;
  let worstBrass = 99;
  let off = 0;
  for (let n = 0; n < K6_SIZE; n++) {
    const t = k6Tint(traitsOf(n));
    worstCream = Math.min(worstCream, contrast(HOUSE.cream, t));
    worstBrass = Math.min(worstBrass, contrast(HOUSE.brassHi, t));
    const [L, C] = toOklch(t);
    if (L < 0.2 || L > 0.42 || C > 0.07) off++;
  }
  ok(worstCream >= 7 && worstBrass >= 4.5, `6.2 tints: cream AAA (${worstCream.toFixed(1)}) and brass AA (${worstBrass.toFixed(1)}) on every kicker's and launch's tint`);
  ok(off === 0, "6.2 tints: every tint is a deep stain of the same table (OKLCH L 0.20..0.42, C <= 0.07)");
  ok(toOklch(HOUSE.walnut)[0] < 0.3 && contrast(HOUSE.cream, HOUSE.walnut) >= 12, `6.2 palette: the page is walnut, not paper (cream on walnut ${contrast(HOUSE.cream, HOUSE.walnut).toFixed(1)})`);
  ok(!/#f6f1e8|#fdfaf4/i.test(readFileSync("src/k6/home.css", "utf8") + readFileSync("api/k6.ts", "utf8") + readFileSync("api/_k6card.ts", "utf8")), "6.2 palette: the old off-white paper is gone from the page, the pages and the pictures");
  const css = readFileSync("src/k6/home.css", "utf8");
  const html = readFileSync("index.html", "utf8");
  const page = readFileSync("api/k6.ts", "utf8");
  const fams = new Set([...css.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]));
  ok(fams.size === 1 && fams.has("Fraunces K") && !/Jersey|Archivo|fonts\.googleapis/.test(css + html + page), "6.1 type: one self-hosted typeface on the home page and the pages");
  const card = readFileSync("api/_k6card.ts", "utf8");
  ok(!/Jersey 10|Archivo/.test(card) && /FrauncesDisplay-600\.ttf/.test(card), "6.1 type: the pictures use the same typeface");
  ok(!/not affiliated|the old table|href="\/club"/.test(html + page), "6.1 footer: no fan-desk line, no link to the old table");
  const motion = readFileSync("src/k6/motion.ts", "utf8");
  ok(/prefers-reduced-motion/.test(motion) && /passive: true/.test(motion) && !/preventDefault|scrollTo|scrollBy/.test(motion), "6.1 motion: passive, never moves the page, off with reduced motion");
}

// ---------------------------------------------------------------- 6.2: the quiet sign-in for $KICKER holders, the privacy page
{
  const html = readFileSync("index.html", "utf8");
  const gold = readFileSync("src/k6/gold.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
  const signin = readFileSync("src/side/signin.ts", "utf8");
  const page = await (await GET(new Request("http://x/api/k6?view=l&t=0x0207a8675d4a56d6955db805bf5f09db1d21d755"))).text();
  ok(/data-gold/.test(html) && /sign in for the gold rod/.test(html) && /data-gold/.test(page) && /k6-gold\.js|gold\.ts/.test(page), "gold: a quiet sign-in link in the footer and on /l/");
  const staticImports = signin.split("\n").filter((l) => /^import /.test(l) && !/^import type/.test(l)).join("\n");
  ok(!/window\.ethereum|eip6963|@getpara|para\/island/.test(gold) && /import\("\.\.\/para\/island\.js"\)/.test(signin) && !/para\/island/.test(staticImports), "gold: Para loads only on click (dynamic import), no wallet calls in our code");
  const house = readFileSync("api/_house.ts", "utf8") + readFileSync("shared/data.ts", "utf8");
  ok(/0x7e1be1573fD7Fe434a53Abb38356AcfFDF15c1C4/.test(house) && /to: GAME_TOKEN\.address/.test(house), "gold: balanceOf reads the new $KICKER token");
  const pv = readFileSync("privacy.html", "utf8");
  const pvText = pv.replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " ").toLowerCase();
  ok(/Fraunces/.test(pv) && /#22170f/.test(pv) && !/ibm plex|jersey|googleapis/i.test(pv), "privacy: walnut and Fraunces, no other fonts");
  ok(!/\bnumber\b|collection|\bthe set\b|\btraits?\b|your man/.test(pvText) && /today's rod/.test(pvText) && /hash/.test(pvText) && /para/.test(pvText) && /@kicker_art/.test(pvText), "privacy: says what is kept (rod, IP hash, optional Para address) and how to ask, no collection words");
}

console.log(fails ? `\n${fails} failing` : "\nall green");
process.exit(fails ? 1 : 0);
