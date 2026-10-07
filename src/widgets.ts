// Pixi UI pieces: chunky buttons, panels, stat boxes and the hover tooltip.
import { Container, Graphics, Text } from "pixi.js";
import { txt } from "./cards.js";
import { COL, NUM } from "./theme.js";
import { sfx } from "./audio.js";
import { ease, tween } from "./tween.js";

export function darken(c: number, k = 0.62): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

export class Button extends Container {
  bg = new Graphics();
  caption: Text;
  sub: Text | null = null;
  enabled = true;
  private fn: () => void;
  constructor(
    text: string,
    public w: number,
    public h: number,
    public color: number,
    fn: () => void,
    opts: { size?: number; sub?: string } = {},
  ) {
    super();
    this.fn = fn;
    this.caption = txt(text, { fontSize: opts.size || Math.min(30, h * 0.36), fontWeight: "700", fill: COL.cream });
    this.caption.anchor.set(0.5);
    this.addChild(this.bg, this.caption);
    if (opts.sub) {
      this.sub = txt(opts.sub, { fontSize: Math.min(18, h * 0.22), fill: COL.cream });
      this.sub.anchor.set(0.5);
      this.addChild(this.sub);
    }
    this.draw(false);
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", () => {
      if (!this.enabled) return;
      this.draw(true);
    });
    this.on("pointerup", () => this.draw(false));
    this.on("pointerupoutside", () => this.draw(false));
    this.on("pointertap", () => {
      if (!this.enabled) {
        sfx.error();
        return;
      }
      sfx.click();
      this.fn();
    });
  }
  setText(t: string, sub?: string) {
    this.caption.text = t;
    if (this.sub && sub !== undefined) this.sub.text = sub;
  }
  setEnabled(on: boolean) {
    if (this.enabled === on) return;
    this.enabled = on;
    this.draw(false);
  }
  setColor(c: number) {
    this.color = c;
    this.draw(false);
  }
  draw(down: boolean) {
    const { w, h } = this;
    const c = this.enabled ? this.color : 0x4a3346;
    const depth = down ? 2 : 6;
    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2 + 6, w, h, 12).fill(darken(c, 0.5));
    this.bg.roundRect(-w / 2, -h / 2 + 6 - depth, w, h, 12).fill(c);
    this.bg.roundRect(-w / 2 + 4, -h / 2 + 6 - depth + 3, w - 8, 6, 3).fill({ color: 0xffffff, alpha: this.enabled ? 0.18 : 0.06 });
    const ly = 6 - depth + (this.sub ? -h * 0.13 : 0);
    this.caption.y = ly;
    this.caption.alpha = this.enabled ? 1 : 0.5;
    if (this.sub) {
      this.sub.y = ly + h * 0.3;
      this.sub.alpha = this.enabled ? 0.9 : 0.45;
    }
  }
}

export function panel(w: number, h: number, fill = COL.panel, edge = COL.edge, r = 14): Graphics {
  const g = new Graphics();
  g.roundRect(0, 6, w, h, r).fill({ color: 0x000000, alpha: 0.35 });
  g.roundRect(0, 0, w, h, r).fill(fill).stroke({ width: 3, color: edge });
  return g;
}

/** A coloured number box (Chips / Mult) that can pop when the value changes. */
export class NumBox extends Container {
  bg = new Graphics();
  value: Text;
  private cur = "";
  constructor(
    public w: number,
    public h: number,
    public color: number,
    align: "left" | "right" | "center" = "center",
  ) {
    super();
    this.bg.roundRect(-w / 2, -h / 2, w, h, 10).fill(color);
    this.bg.roundRect(-w / 2, h / 2 - 8, w, 8, 4).fill({ color: 0x000000, alpha: 0.18 });
    this.value = txt("0", { fontFamily: NUM, fontSize: h * 0.82, fill: COL.cream, stroke: { color: darken(color, 0.4), width: 4 } });
    this.value.anchor.set(align === "left" ? 0 : align === "right" ? 1 : 0.5, 0.5);
    this.value.x = align === "left" ? -w / 2 + 12 : align === "right" ? w / 2 - 12 : 0;
    this.value.y = -2;
    this.addChild(this.bg, this.value);
  }
  set(v: string, pop = false) {
    if (v === this.cur) return;
    this.cur = v;
    this.value.text = v;
    const maxW = this.w - 16;
    const s = this.value.width > maxW ? maxW / (this.value.width / this.value.scale.x) : 1;
    this.value.scale.set(s);
    if (pop) {
      this.scale.set(1.18);
      void tween(this.scale, { x: 1, y: 1 }, 220, ease.outBack);
    }
  }
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1e11) return n.toExponential(2).replace("+", "");
  return Math.floor(n).toLocaleString("en-US");
}
export function fmtMult(m: number): string {
  const r = Math.round(m * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(r * 10 === Math.round(r * 10) ? 1 : 2);
}

/** Hover / tap info panel. */
export class Tip extends Container {
  bg = new Graphics();
  title: Text;
  body: Text;
  extra = new Container();
  constructor() {
    super();
    this.title = txt("", { fontSize: 20, fontWeight: "700", fill: COL.cream });
    this.body = txt("", { fontSize: 15, fill: COL.cream2, wordWrap: true, wordWrapWidth: 300, lineHeight: 20 });
    this.addChild(this.bg, this.title, this.body, this.extra);
    this.visible = false;
    this.eventMode = "passive";
  }
  show(title: string, body: string, x: number, y: number, bounds: { w: number; h: number }, accent = COL.money, width = 320) {
    this.body.style.wordWrapWidth = width - 28;
    this.title.text = title;
    this.body.text = body;
    this.title.position.set(14, 10);
    this.body.position.set(14, 10 + this.title.height + 6);
    const w = Math.max(width, this.title.width + 28);
    const h = this.body.y + this.body.height + 12 + (this.extra.children.length ? this.extra.height + 8 : 0);
    this.extra.position.set(14, this.body.y + this.body.height + 8);
    this.bg.clear();
    this.bg.roundRect(0, 5, w, h, 12).fill({ color: 0x000000, alpha: 0.4 });
    this.bg.roundRect(0, 0, w, h, 12).fill(COL.ink).stroke({ width: 3, color: accent });
    let px = x - w / 2;
    let py = y - h - 14;
    if (py < 8) py = y + 24;
    px = Math.max(8, Math.min(bounds.w - w - 8, px));
    py = Math.max(8, Math.min(bounds.h - h - 8, py));
    this.position.set(px, py);
    this.visible = true;
  }
  hide() {
    this.visible = false;
    this.extra.removeChildren();
  }
}
