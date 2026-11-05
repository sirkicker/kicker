// KICKER 6.2 "Own line": the home page. KICKER is a meme, so the page is memes: the cover is one meme (the kicker on
// his rod, "we only move sideways. no spinning.", $KICKER), then the finished meme panels (one Save each), then the
// utility (put your launch on the rod: one meme in its colours at /l/<token>) with today's rod under it, then four
// lines of lore. Nothing here listens to the wheel: the page always scrolls. The scroll moments only watch it go by.
import "./home.css";
import { Hero, dayWord } from "./hero.js";
import { Rod } from "./rod.js";
import { motion } from "./motion.js";
import "./gold.js";
import { MEMES, parseLookup, parseTokenLink, rodLineup } from "../../shared/k6react.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const today = new Date().toISOString().slice(0, 10);
const q = new URLSearchParams(location.search);

// ---------------------------------------------------------------- old and form links: straight to the right page
const where = (raw: string) => {
  const t = parseLookup(raw);
  return t ? `/l/${t}` : null;
};
// a 6.0/6.1 desk link (?t=<token>) is now that launch's meme; the /l/ page's box sends ?find=
const oldT = parseTokenLink(q.get("t") || "");
const away = oldT ? `/l/${oldT}` : q.has("find") ? where(q.get("find") || "") : null;
if (away) location.replace(away);

const hero = new Hero();
const rod = new Rod();
hero.show();
// a $KICKER holder who signed in: the kicker stands on the gold rod (gold.ts)
addEventListener("kicker:gold", (e) => hero.gold((e as CustomEvent<{ holder: boolean }>).detail.holder));

// ---------------------------------------------------------------- the memes
{
  const ul = $("grid");
  for (const [i, m] of MEMES.entries()) {
    const li = document.createElement("li");
    li.className = "mm";
    li.style.setProperty("--i", String(i % 4));
    const fig = document.createElement("figure");
    const img = new Image();
    img.width = 540;
    img.height = 540;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = `${m.top} ${m.bottom} ${m.alt}.`;
    img.src = `/api/k6?meme=${m.key}&w=540`;
    img.addEventListener("load", () => fig.classList.add("ok"));
    fig.append(img);
    const cap = document.createElement("figcaption");
    const a = document.createElement("a");
    a.className = "sv";
    a.href = `/api/k6?meme=${m.key}`;
    a.download = `kicker-${m.key}.png`;
    a.textContent = "Save";
    a.setAttribute("aria-label", `Save the meme: ${m.top} ${m.bottom}`);
    cap.append(a);
    fig.append(cap);
    li.append(fig);
    ul.append(li);
  }
}

// ---------------------------------------------------------------- put your launch on the rod
const findIn = $<HTMLInputElement>("find-in");
const findErr = $("find-err");
const say = (m: string) => {
  findErr.textContent = m;
  findErr.hidden = !m;
};
$("find").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = findIn.value.trim();
  if (!raw) return say("paste a vibe/vibe token link or a 0x address.");
  const to = where(raw);
  if (!to) return say("that is not a vibe/vibe token link. try testnet.vibevibe.fun/token/0x…");
  say("");
  $("find-go").setAttribute("aria-busy", "true");
  location.href = to;
});
findIn.addEventListener("input", () => say(""));
if (q.has("find") && !away) {
  findIn.value = q.get("find") || "";
  say("that is not a vibe/vibe token link. try testnet.vibevibe.fun/token/0x…");
  requestAnimationFrame(() => $("rod").scrollIntoView({ block: "start" }));
}
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-put]"))
  a.addEventListener("click", (e) => {
    e.preventDefault();
    $("rod").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    findIn.focus({ preventScroll: true });
  });

// ---------------------------------------------------------------- today's rod
async function loadRod() {
  $("rod-day").textContent = dayWord(today);
  let items: Parameters<typeof rodLineup>[0] = [];
  try {
    const r = await fetch("/api/k6?rod=1");
    if (r.ok) items = ((await r.json()) as { items: typeof items }).items || [];
  } catch {
    items = [];
  }
  rod.show(rodLineup(items, today));
  const n = items.length;
  $("rod-count").textContent = n ? `${n} ${n === 1 ? "launch" : "launches"} on it so far, the house fills the gaps` : "nobody yet. the house holds the rod";
}
rod.show(rodLineup([], today));
void loadRod();

// ---------------------------------------------------------------- the scroll moments
motion(hero);
