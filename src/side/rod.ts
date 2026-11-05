// KICKER 5.2: today's rod. One long brass rod across a band of felt, the day's kickers standing on it in a row,
// large and evenly spaced. A short row sits in the middle; a long one moves by drag, the arrow buttons, the arrow
// keys or a swipe. The page's vertical wheel is never taken: there is no wheel handler here at all.
import { KROD, KROD_T } from "../../shared/kicker.js";
import { setNo } from "../../shared/side.js";
import type { Fig } from "../../shared/home.js";
import { paintKicker } from "./sprites.js";

const CROP_Y = 14;
const CROP_H = 118;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Rod {
  private sc = $("band-sc");
  private row = $<HTMLUListElement>("row");
  private figs: Fig[] = [];
  private drag: { x: number; left: number; moved: boolean; id: number } | null = null;
  private dragged = false;

  constructor(private onPick: (f: Fig) => void) {
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
        this.sc.setPointerCapture?.(e.pointerId);
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
    // a drag that ends over a kicker is not a pick
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
    return document.documentElement.clientWidth >= 760 ? 3 : 2;
  }

  show(figs: Fig[], pickId?: string) {
    this.figs = figs;
    const s = this.scale();
    const band = $("band");
    band.style.setProperty("--s", String(s));
    band.style.setProperty("--fh", `${CROP_H * s}px`);
    band.style.setProperty("--ry", `${(KROD - CROP_Y) * s}px`);
    band.style.setProperty("--rt", `${KROD_T * s}px`);
    this.row.textContent = "";

    figs.forEach((f, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fig" + (f.house ? " house" : "");
      b.setAttribute("aria-label", `${setNo(f.v)}, ${f.name}${f.house ? ", the house line-up" : ""}`);
      const cv = document.createElement("canvas");
      cv.setAttribute("aria-hidden", "true");
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.innerHTML = `<span class="num">${String(f.v).padStart(3, "0")}</span>${f.house ? '<span class="h">house</span>' : `<span class="nm"></span>`}`;
      if (!f.house) tag.querySelector(".nm")!.textContent = f.name;
      b.append(cv, tag);
      li.append(b);
      this.row.append(li);
      const paint = (frame: 0 | 1) => void paintKicker(cv, f.v, f.kit, s, frame, { y: CROP_Y, h: CROP_H }).catch(() => {});
      paint(0);
      // he kicks while the pointer is on him
      b.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && !reduced() && paint(1));
      b.addEventListener("pointerleave", () => paint(0));
      b.addEventListener("focus", () => !reduced() && paint(1));
      b.addEventListener("blur", () => paint(0));
      b.addEventListener("click", () => this.pick(i));
    });
    requestAnimationFrame(() => this.arrows());
    if (pickId) {
      const i = figs.findIndex((f) => f.id === pickId);
      if (i >= 0) this.pick(i, true);
    }
  }

  pick(i: number, bring = false) {
    const f = this.figs[i];
    if (!f) return;

    this.row.querySelectorAll(".fig").forEach((el, k) => el.classList.toggle("on", k === i));
    if (bring) {
      const li = this.row.children[i] as HTMLElement;
      const left = li.offsetLeft + li.offsetWidth / 2 - this.sc.clientWidth / 2;
      this.sc.scrollTo({ left, behavior: reduced() ? "auto" : "smooth" });
    }
    this.onPick(f);
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
