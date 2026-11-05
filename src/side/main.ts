// KICKER 5.2: the home page. The cover (one big kicker, tinted from his colours), today's rod on a felt band, the set
// as one wall of 222, and how it works. The editor loads when asked for. Nothing here listens to the wheel: the page
// always scrolls.
import "./home.css";
import { Hero, dayShortWord, type HeroItem } from "./hero.js";
import { Rod } from "./rod.js";
import { Wall, type State } from "./wall.js";
import { api, type DayRod } from "./api.js";
import { SET_SIZE, kickerOf, setNo, utcDay, type PublicMan } from "../../shared/side.js";
import { featuredOfDay, houseLine, rodLineup, type Fig } from "../../shared/home.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let editor: Promise<typeof import("./editor.js")> | null = null;
const loadEditor = () => (editor ||= import("./editor.js"));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let today = utcDay();
let days: DayRod[] = [];
/** Which rod the band shows: 0 today, 1 yesterday. */
let back = 0;

const hero = new Hero((v) => void make(v));
const rod = new Rod(plate);
const wall = new Wall($("wall"));

function plate(f: Fig) {
  $("pl-no").textContent = setNo(f.v);
  $("pl-name").textContent = f.house ? `${f.name}, the house line-up` : f.name;
  $("pl-line").textContent = f.line ? `“${f.line}”` : "";
  const a = $<HTMLAnchorElement>("pl-link");
  a.hidden = false;
  a.href = f.id ? `/m/${f.id}` : `/k/${f.v}`;
  a.firstChild!.textContent = f.id ? "his page " : "his plate ";
  $("plate").classList.add("on");
}

const prevDay = (d: string) => utcDay(new Date(Date.parse(d + "T00:00:00Z") - 86_400_000));
function showRod(pickId?: string) {
  const day = back ? prevDay(today) : today;
  const d = days.find((x) => x.day === day);
  const figs = rodLineup(d ? d.men : [], day);
  rod.show(figs, pickId);
  $("rod-which").textContent = back ? "yesterday's rod" : "today's rod";
  $("rod-day").textContent = dayShortWord(day);
  const n = d ? d.count : 0;
  const house = figs.filter((f) => f.house).length;
  $("rod-count").innerHTML = `<span class="num">${n}</span> ${n === 1 ? "kicker" : "kickers"} fielded${house ? ` <span class="sep">·</span> <span class="num">${house}</span> from the house` : ""}`;
  $("rod-other").textContent = back ? "back to today's rod" : "see yesterday's rod";
  $("rod-other").hidden = !back && !days.some((x) => x.day === prevDay(today));
}

$("rod-other").addEventListener("click", () => {
  back = back ? 0 : 1;
  showRod();
});

async function make(v?: number) {
  const m = await loadEditor();
  m.openEditor({
    today,
    v,
    onPlaced: (man: PublicMan) => {
      const d = days.find((x) => x.day === man.day);
      if (d) {
        d.men = [...d.men.filter((x) => x.id !== man.id), man];
        d.count++;
      } else days.push({ day: man.day, kits: [], count: 1, men: [man] });
      back = 0;
      showRod();
      void refreshSet();
    },
    onSee: (man: PublicMan) => {
      m.closeEditor();
      back = 0;
      $("table").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
      showRod(man.id);
    },
  });
}
const wantV = () => {
  const v = Number(new URLSearchParams(location.search).get("v"));
  return Number.isInteger(v) && v >= 1 && v <= SET_SIZE ? v : undefined;
};
for (const id of ["make", "make2"]) {
  $(id).addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", location.search + "#make");
    void make(wantV());
  });
  $(id).addEventListener("pointerenter", () => void loadEditor(), { once: true });
}
addEventListener("hashchange", () => {
  if (location.hash === "#make") void make(wantV());
});

// ---------------------------------------------------------------- the set's filters
let state: State = "all";
let family = "";
for (const b of document.querySelectorAll<HTMLButtonElement>("#fl-state button"))
  b.addEventListener("click", () => {
    for (const o of document.querySelectorAll<HTMLButtonElement>("#fl-state button")) o.setAttribute("aria-pressed", String(o === b));
    state = b.dataset.s as State;
    wall.filter(state, family);
  });
for (const b of document.querySelectorAll<HTMLButtonElement>("#fl-fam button"))
  b.addEventListener("click", () => {
    for (const o of document.querySelectorAll<HTMLButtonElement>("#fl-fam button")) o.setAttribute("aria-pressed", String(o === b));
    family = b.dataset.f || "";
    wall.filter(state, family);
  });

async function refreshSet() {
  try {
    const r = await api.album();
    wall.set(r.fielded);
    hero.setFielded(r.fielded);
    $("fielded").textContent = String(Object.keys(r.fielded).length);
  } catch {
    $("fielded").textContent = "?";
  }
}

// ---------------------------------------------------------------- boot
const manItem = (man: PublicMan, when: string): HeroItem => {
  const k = kickerOf(man);
  return { v: k.v, kit: k.kit, name: man.name, line: man.cap, when, href: `/m/${man.id}`, kitWord: man.kit ? "his own" : man.n % 2 ? "away" : "home" };
};

async function cover(setP: Promise<void>) {
  const m = new URLSearchParams(location.search).get("m");
  if (m && /^[0-9a-z]{6,12}$/.test(m)) {
    const r = await api.man(m).catch(() => null);
    if (r?.man) return hero.show(manItem(r.man, `fielded ${dayShortWord(r.man.day)}`));
  }
  const motd = await Promise.race([api.motd().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
  if (motd?.man) return hero.show(manItem(motd.man, `man of the day · ${dayShortWord(motd.day)}`));
  await Promise.race([setP, new Promise((r) => setTimeout(r, 1200))]);
  const v = featuredOfDay(today);
  const it = await hero.setItem(v);
  hero.show({ ...it, line: it.line || houseLine(v), when: `on the cover · ${dayShortWord(today)}` });
}

async function boot() {
  const setP = refreshSet();
  void cover(setP);
  try {
    const r = await api.rods("", 2);
    today = r.today;
    days = r.days;
  } catch {
    $("rod-count").textContent = "the rod did not answer. the house line-up stands in.";
  }
  const m = new URLSearchParams(location.search).get("m");
  showRod(m && days.some((d) => d.day === today && d.men.some((x) => x.id === m)) ? m : undefined);
  if (location.hash === "#make") void make(wantV());
  await setP;
}
void boot();
