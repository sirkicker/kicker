// KICKER 5.2: the cover. One big kicker on his rod on the left, his card on the right, the whole cover tinted from
// his own colours. Prev / next walk the set along the rod: the tint cross-fades and the figure slides in sideways.
import { KROD, KROD_T, type Kit } from "../../shared/kicker.js";
import { SET_SIZE, familyOf, houseKit, kickerOf, setNo, type PublicMan } from "../../shared/side.js";
import { houseLine, tintOf, viberHandle } from "../../shared/home.js";
import { paintKicker, viberPixels } from "./sprites.js";
import { jersey } from "./jersey.js";
import { api } from "./api.js";

export interface Fielded {
  id: string;
  day: string;
  name: string;
}
export interface HeroItem {
  v: number;
  kit: Kit;
  name: string;
  line: string;
  /** What the small line above the number says. */
  when: string;
  /** His page: /m/<id> for a fielded man, /k/<n> for the set. */
  href: string;
  kitWord: string;
  /** The second fact on the card: [label, value]. Absent: which viber he is. */
  fact?: [string, string];
}

const COLOUR: Record<string, string> = {
  "#f1e4c8": "cream", "#d6b25e": "brass", "#a2733a": "ochre", "#6e2140": "wine", "#a3344d": "claret", "#cf5b3e": "vermilion",
  "#e3a27a": "peach", "#2f6f62": "felt", "#1e4a53": "teal", "#8db5a3": "sage", "#3e5d8c": "slate", "#a3bad6": "powder",
  "#221419": "ink", "#5c4a50": "smoke", "#b9ada0": "stone", "#e2c3cf": "rose",
};
export const kitText = (k: Kit) => {
  const a = COLOUR[k.a];
  const b = COLOUR[k.b];
  if (!a || !b) return k.p === "plain" ? "his own colours" : `his own colours, ${k.p}`;
  return `${a} and ${b}${k.p === "plain" ? "" : `, ${k.p}`}`;
};

/** The top of the frame the cover shows (a few tall hats reach up to here). */
const CROP_Y = 6;
const CROP_H = 126;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hero {
  private start: HeroItem | null = null;
  private at = 0;
  private fielded: Record<string, Fielded> = {};
  private men = new Map<string, Promise<PublicMan | null>>();
  private token = 0;
  private cv = $<HTMLCanvasElement>("hero-cv");
  private fig = $("hero-fig");
  private root = $("hero");
  current: HeroItem | null = null;

  constructor(private onField: (v: number) => void) {
    $("hero-prev").addEventListener("click", () => this.step(-1));
    $("hero-next").addEventListener("click", () => this.step(1));
    $("hero-field").addEventListener("click", () => this.current && this.onField(this.current.v));
    // the figure answers to the arrow keys while the card has focus
    this.root.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=region]")) return;
      if (!t.closest(".hero-card")) return;
      if (e.key === "ArrowLeft") this.step(-1);
      else if (e.key === "ArrowRight") this.step(1);
    });
    let w = innerWidth;
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - w) < 40 || !this.current) return;
      w = innerWidth;
      void this.paint(this.current, false);
    });
  }

  setFielded(f: Record<string, Fielded>) {
    this.fielded = f;
  }

  /** The cover's first kicker: the man of the day, a man asked for by link, or one of the set. */
  show(item: HeroItem) {
    this.start = item;
    this.at = 0;
    void this.paint(item, false);
  }

  step(d: number) {
    if (!this.start) return;
    this.at += d;
    if (this.at === 0) return void this.paint(this.start, true, d);
    const v = ((((this.start.v - 1 + this.at) % SET_SIZE) + SET_SIZE) % SET_SIZE) + 1;
    void this.setItem(v).then((it) => this.paint(it, true, d));
    // the next ones along, fetched ahead so the arrow feels instant
    for (const k of [1, -1]) void viberPixels(((((v - 1 + d * k) % SET_SIZE) + SET_SIZE) % SET_SIZE) + 1).catch(() => {});
  }

  /** No. v of the set: the first man to field him if there is one (his kit, his line), else the house plate. */
  async setItem(v: number): Promise<HeroItem> {
    const f = this.fielded[String(v)];
    const fam = familyOf(v).name;
    if (f) {
      let p = this.men.get(f.id);
      if (!p) {
        p = api
          .man(f.id)
          .then((r) => r.man)
          .catch(() => null);
        this.men.set(f.id, p);
      }
      const m = await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 900))]);
      const kit = m ? kickerOf(m).kit : houseKit(v);
      return { v, kit, name: f.name, line: m?.cap || houseLine(v), when: `in the set · ${fam} · fielded`, href: `/m/${f.id}`, kitWord: m && m.kit ? "his own" : "house", fact: ["slot", `taken ${dayShortWord(f.day)} · ${viberHandle(v)}`] };
    }
    return { v, kit: houseKit(v), name: viberHandle(v), line: houseLine(v), when: `in the set · ${fam}`, href: `/k/${v}`, kitWord: "house", fact: ["slot", "open · nobody has fielded him"] };
  }

  private async paint(it: HeroItem, animate: boolean, dir = 1) {
    const my = ++this.token;
    this.current = it;
    const px = await viberPixels(it.v).catch(() => null);
    if (my !== this.token) return;
    const tint = px ? tintOf(px) : "#ece0c8";
    const slide = animate && !reduced();
    if (slide) {
      this.fig.style.setProperty("--dir", String(dir));
      this.fig.classList.add("out");
      await new Promise((r) => setTimeout(r, 170));
      if (my !== this.token) return;
    }
    this.root.style.setProperty("--tint", tint);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tint);
    const s = this.scale();
    await paintKicker(this.cv, it.v, it.kit, s, 0, { y: CROP_Y, h: CROP_H });
    if (my !== this.token) return;
    // the rod runs through his bore: its row in the canvas follows the scale he was drawn at
    const h = parseFloat(this.cv.style.height) || this.cv.clientHeight;
    const k = h / CROP_H;
    $("hero-rod").style.setProperty("--y", `${Math.round((KROD - CROP_Y) * k)}px`);
    $("hero-rod").style.setProperty("--t", `${Math.max(8, Math.round(KROD_T * k))}px`);
    this.fig.style.setProperty("--fh", `${h}px`);
    this.cv.setAttribute("aria-label", `${setNo(it.v)}, ${it.name}, a viber cast as a foosball kicker in ${kitText(it.kit)}`);
    $("hero-no").textContent = setNo(it.v);
    $("hero-name").textContent = it.name;
    $("hero-when").textContent = it.when;
    $("hero-line").textContent = it.line ? `“${it.line}”` : " ";
    const fact = it.fact || ["viber", `${viberHandle(it.v)} · ${familyOf(it.v).name}`];
    $("hero-fact-k").textContent = fact[0];
    $("hero-viber").textContent = fact[1];
    $("hero-kit-w").textContent = `${it.kitWord} · ${kitText(it.kit)}`;
    jersey($<HTMLCanvasElement>("hero-kit"), it.kit, 1);
    $<HTMLAnchorElement>("hero-plate").href = it.href;
    $("hero-plate").firstChild!.textContent = it.href.startsWith("/m/") ? "his page " : "his plate ";
    if (slide) {
      this.fig.classList.remove("out");
      this.fig.classList.add("in");
      void this.fig.offsetWidth;
      this.fig.classList.remove("in");
    }
    this.root.classList.add("on");
  }

  private scale(): number {
    const w = document.documentElement.clientWidth;
    if (w >= 1200) return 4;
    if (w >= 760) return 3;
    // a phone: as large as the column allows, whole device pixels per sprite pixel
    const dpr = Math.min(3, devicePixelRatio || 1);
    const fit = Math.min((w - 40) / 96, (innerHeight * 0.46) / CROP_H);
    return Math.max(2, Math.floor(fit * dpr) / dpr);
  }
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const dayShortWord = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MON[m - 1]}`;
};
