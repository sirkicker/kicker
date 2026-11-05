// KICKER 6.2: the cover is one meme. The kicker, big, bolted through the middle of a brass rod that runs across the
// panel, "we only move sideways." over him and "no spinning." under him, like a meme image you could save. On scroll
// he slides along his rod (sideways, never a spin) and his eyes follow the way he goes (motion.ts).
import { K6_ROD, K6_ROD_T, traitsOf } from "../../shared/k6.js";
import { k6Tint } from "../../shared/k6look.js";
import { KICKER_N } from "../../shared/k6react.js";
import { dpr, paint, spriteCanvas } from "./draw.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const dayWord = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MON[m - 1]}`;
};

export class Hero {
  readonly n = KICKER_N;
  private s = 10;
  /** Which way his eyes point now (1 right, -1 left). */
  private eyes: 1 | -1 = 1;
  private isGold = false;
  private cv = $<HTMLCanvasElement>("hero-cv");
  private fig = $("hero-fig");
  private panel = $("hero-meme");

  constructor() {
    let w = innerWidth;
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - w) < 40) return;
      w = innerWidth;
      this.paint();
    });
  }

  show() {
    this.panel.style.setProperty("--tint", k6Tint(traitsOf(this.n)));
    this.paint();
  }

  /** How far he may slide either way along the rod, in CSS px: the rod's half length less his half body and a knob. */
  room(): number {
    const rod = $("hero-rod").getBoundingClientRect().width;
    return Math.max(0, Math.round(rod / 2 - this.s * 21));
  }

  /** Look one way or the other: the same sprite with the pupils moved. */
  look(dir: 1 | -1) {
    if (dir === this.eyes) return;
    this.eyes = dir;
    paint(this.cv, spriteCanvas(this.n, { look: dir, gold: this.isGold }), this.s);
  }
  /** $KICKER holders: his brass turns gold, the rod and the panel's frame too (CSS, html.gold). */
  gold(on: boolean) {
    if (on === this.isGold) return;
    this.isGold = on;
    paint(this.cv, spriteCanvas(this.n, { look: this.eyes, gold: on }), this.s);
  }
  /** Back to his own side-eye. */
  rest() {
    this.look(traitsOf(this.n).look);
  }

  private paint() {
    const s = Math.max(1, Math.round(this.scale() * dpr())) / dpr();
    this.s = s;
    this.eyes = traitsOf(this.n).look;
    paint(this.cv, spriteCanvas(this.n, { gold: this.isGold }), s);
    $("hero-rod").style.setProperty("--y", `${Math.round(K6_ROD * s)}px`);
    $("hero-rod").style.setProperty("--t", `${Math.round(K6_ROD_T * s)}px`);
    this.fig.style.setProperty("--fh", `${Math.round(48 * s)}px`);
    $("hero").classList.add("on");
    $("hero").dispatchEvent(new CustomEvent("kicker"));
  }

  /** As big as the panel allows: the height left between the two captions, less a little air. */
  private scale(): number {
    const h = this.panel.clientHeight || 560;
    let free = h;
    for (const c of this.panel.querySelectorAll<HTMLElement>(".cap")) free -= c.offsetHeight;
    return Math.max(3, Math.min(12, (free - 6) / 48));
  }
}
