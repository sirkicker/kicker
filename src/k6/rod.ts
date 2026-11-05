// KICKER 6.2: today's rod. One long brass rod across a band of felt, and on it the kickers of the launches somebody
// put on the rod today, in their colours, their pictures on their chests. Fewer than seven: the house stands in. A short row sits in the middle; a long
// one moves by drag, the arrow buttons, the arrow keys or a swipe. There is no wheel handler here at all.
import { K6_ROD, K6_ROD_T } from "../../shared/k6.js";
import { paint, spriteCanvas } from "./draw.js";

export interface RodFig {
  n: number;
  kit?: { a: string; b: string };
  crest?: string[];
  token?: string;
  symbol?: string;
  house: boolean;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Rod {
  private sc = $("band-sc");
  private row = $<HTMLUListElement>("row");
  private figs: RodFig[] = [];
  private drag: { x: number; left: number; moved: boolean; id: number } | null = null;
  private dragged = false;

  constructor() {
    $("band-prev").addEventListener("click", () => this.page(-1));
    $("band-next").addEventListener("click", () => this.page(1));
    this.sc.addEventListener("scroll", () => this.arrows(), { passive: true });
    addEventListener("resize", () => this.arrows());
    // drag with a mouse; touch and pens scroll natively (with snap on phones)
    this.sc.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      this.drag = { x: e.clientX, left: this.sc.scrollLeft, moved: false, id: e.pointerId };
      this.dragged = false;
    });
    addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 5) {
        d.moved = true;
        this.sc.classList.add("dragging");
      }
      if (d.moved) this.sc.scrollLeft = d.left - dx;
    });
    const end = () => {
      if (!this.drag) return;
      this.dragged = this.drag.moved;
      this.drag = null;
      this.sc.classList.remove("dragging");
    };
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
    this.sc.addEventListener(
      "click",
      (e) => {
        if (this.dragged) {
          e.stopPropagation();
          e.preventDefault();
          this.dragged = false;
        }
      },
      true,
    );
    let w = innerWidth;
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - w) < 40) return;
      w = innerWidth;
      this.show(this.figs);
    });
  }

  private scale() {
    return document.documentElement.clientWidth >= 760 ? 4 : 3;
  }

  show(figs: RodFig[]) {
    this.figs = figs;
    const s = this.scale();
    const band = $("band");
    band.style.setProperty("--s", String(s));
    band.style.setProperty("--fh", `${48 * s}px`);
    band.style.setProperty("--ry", `${K6_ROD * s}px`);
    band.style.setProperty("--rt", `${K6_ROD_T * s}px`);
    this.row.textContent = "";
    for (const [i, f] of figs.entries()) {
      const li = document.createElement("li");
      li.style.setProperty("--i", String(i));
      // a launch opens its meme; a house kicker is just holding the rod
      const a: HTMLElement = document.createElement(f.token ? "a" : "span");
      a.className = "fig" + (f.house ? " house" : "");
      if (a instanceof HTMLAnchorElement) {
        a.href = `/l/${f.token}`;
        a.draggable = false;
        a.setAttribute("aria-label", `${f.symbol ? "$" + f.symbol : "a launch"} on the rod: open its meme`);
      } else a.setAttribute("aria-hidden", "true");
      const cv = document.createElement("canvas");
      cv.setAttribute("aria-hidden", "true");
      const tag = document.createElement("span");
      tag.className = "tag";
      const who = document.createElement("span");
      who.className = f.house ? "h" : "nm";
      who.textContent = f.house ? "house" : f.symbol ? "$" + f.symbol : "a launch";
      tag.append(who);
      a.append(cv, tag);
      li.append(a);
      this.row.append(li);
      const look = { kit: f.kit, crest: f.crest };
      const draw = (kick: boolean) => paint(cv, spriteCanvas(f.n, { ...look, pose: kick ? "kick" : "idle" }), s);
      draw(false);
      a.addEventListener("pointerenter", (e: PointerEvent) => e.pointerType === "mouse" && !reduced() && draw(true));
      a.addEventListener("pointerleave", () => draw(false));
      a.addEventListener("focus", () => !reduced() && draw(true));
      a.addEventListener("blur", () => draw(false));
    }
    requestAnimationFrame(() => this.arrows());
  }

  private page(d: number) {
    this.sc.scrollBy({ left: d * Math.max(200, this.sc.clientWidth * 0.75), behavior: reduced() ? "auto" : "smooth" });
  }

  private arrows() {
    const over = this.sc.scrollWidth - this.sc.clientWidth > 4;
    const prev = $<HTMLButtonElement>("band-prev");
    const next = $<HTMLButtonElement>("band-next");
    prev.hidden = next.hidden = !over;
    prev.disabled = this.sc.scrollLeft < 4;
    next.disabled = this.sc.scrollLeft > this.sc.scrollWidth - this.sc.clientWidth - 4;
    $("band").classList.toggle("long", over);
  }
}
