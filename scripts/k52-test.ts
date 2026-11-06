// KICKER 5.2: the home page's rules. The page never takes the vertical wheel; today's rod always stands at least
// seven kickers; the cover's pick and the tints are fixed and readable.
import { readFileSync, readdirSync } from "node:fs";
import { ROD_MIN, contrast, featuredOfDay, houseLine, rodLineup, tintOf, viberHandle } from "../shared/home.js";
import { SET_SIZE, VIBERS, type PublicMan } from "../shared/side.js";
import sharp from "sharp";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  } else console.log("ok  ", m);
};

// ---------------------------------------------------------------- no wheel hijack on the home page
{
  // everything the home page loads: index.html and every module of src/side (the editor included)
  const files = ["index.html", ...readdirSync("src/side").filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => "src/side/" + f)];
  const src = files.map((f) => [f, readFileSync(f, "utf8")] as const);
  const wheel = src.filter(([, s]) => /addEventListener\(\s*["'`](wheel|mousewheel|DOMMouseScroll)["'`]|onwheel|onWheel\s*=/.test(s)).map(([f]) => f);
  ok(wheel.length === 0, `home: no wheel handler anywhere on the home page${wheel.length ? " (" + wheel.join(", ") + ")" : ""}`);
  // and no CSS that would turn the vertical wheel off over a section
  const css = readFileSync("src/side/home.css", "utf8");
  ok(!/overscroll-behavior(-y)?\s*:\s*(contain|none)/.test(css.replace(/overscroll-behavior-x[^;]*;/g, "")), "home: no vertical overscroll lock in the CSS");
  ok(!/touch-action\s*:\s*(none|pan-x)\b/.test(css), "home: no touch-action that blocks vertical panning");
  const main = readFileSync("src/side/main.ts", "utf8");
  ok(!/table\.js|album\.js/.test(main), "home: the 5.1 table and album are not loaded");
}

// ---------------------------------------------------------------- the rod always has at least seven
{
  const man = (i: number, day: string): PublicMan => ({ id: "m" + String(i).padStart(7, "0"), n: i + 1, day, name: "man " + i, cap: "", v: ((i * 37) % SET_SIZE) + 1 });
  let short = 0;
  let dup = 0;
  let order = 0;
  for (const day of ["2026-11-05", "2026-11-06", "2027-01-01", "2026-12-31"])
    for (let n = 0; n <= 20; n++) {
      const men = Array.from({ length: n }, (_, i) => man(i, day));
      const r = rodLineup(men, day);
      if (r.length < Math.max(ROD_MIN, n)) short++;
      const house = r.filter((f) => f.house).map((f) => f.v);
      if (new Set(house).size !== house.length || house.some((v) => men.some((m) => m.v === v))) dup++;
      if (r.slice(0, n).some((f, i) => f.id !== men[i].id || f.house) || r.slice(n).some((f) => !f.house)) order++;
    }
  ok(ROD_MIN === 7 && short === 0, `rod: always at least ${ROD_MIN} figures (0..20 fielded, 4 days)`);
  ok(dup === 0, "rod: the house never repeats a viber already on the rod");
  ok(order === 0, "rod: fielded men first in the order they came, the house after them, marked");
  const a = rodLineup([], "2026-11-05");
  const b = rodLineup([], "2026-11-05");
  ok(a.length === 7 && a.every((f, i) => f.v === b[i].v && f.house && f.name && f.line) && a.some((f) => f.team === 0) && a.some((f) => f.team === 1), "rod: an empty day gets a fixed house line-up of seven in both kits");
  ok(rodLineup([], "2026-11-06").map((f) => f.v).join() !== a.map((f) => f.v).join(), "rod: another day, another house line-up");
}

// ---------------------------------------------------------------- the cover
{
  const d = featuredOfDay("2026-11-05");
  ok(d >= 1 && d <= SET_SIZE && d === featuredOfDay("2026-11-05"), "cover: one of the set, fixed for the day");
  const days = new Set(Array.from({ length: 30 }, (_, i) => featuredOfDay(`2026-11-${String(i + 1).padStart(2, "0")}`)));
  ok(days.size >= 20, `cover: rotates day to day (${days.size} different in 30 days)`);
  ok(viberHandle(1) === "agent 34" && /^roll \d+(\.\d+)?$/.test(viberHandle(40)) && houseLine(5) === houseLine(5), "cover: handles and house lines");
  let worst = 99;
  let worstWine = 99;
  const tints = new Set<string>();
  for (let v = 1; v <= SET_SIZE; v++) {
    const px = await sharp(`public/vibers/${VIBERS[v - 1]}.png`).ensureAlpha().raw().toBuffer();
    const t = tintOf(px);
    tints.add(t);
    worst = Math.min(worst, contrast(t, "#2a0f1c"));
    worstWine = Math.min(worstWine, contrast(t, "#6e2140"));
  }
  ok(worst >= 7, `cover: the ink is AAA on every tint (worst ${worst.toFixed(2)})`);
  ok(worstWine >= 4.5, `cover: the wine number is AA on every tint (worst ${worstWine.toFixed(2)})`);
  ok(tints.size >= 12, `cover: the tint follows the viber (${tints.size} different tints)`);
  const words = readFileSync("index.html", "utf8").replace(/<[^>]+>/g, " ");
  ok(!/\b(card|poker|bet|odds|jackpot|loot|payout|graduation|official|partner|sponsor|reward|earn|prize|guarantee|download|mint|rarity)\b/i.test(words), "copy: no off-limits words on the home page");
  ok(!/!/.test(words.replace(/<!--[\s\S]*?-->/g, "").replace(/!doctype/i, "").replace(/!==|!=/g, "")), "copy: no exclamation marks");
}

console.log(fails ? `\n${fails} FAILED` : "\nall 5.2 home tests passed");
process.exit(fails ? 1 : 0);
