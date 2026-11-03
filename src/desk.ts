// The desk: a one-line market wire set into the table's rail. It shows the line shared/voice.ts writes for what
// just happened, swapping lines like a ticker board and crawling a line that is too long for the window.
import { Container, Graphics, Text } from "pixi.js";
import { COL, NUM } from "./theme.js";
import { txt } from "./figures.js";
import { ease, reduced, tween } from "./tween.js";

export type Tone = "up" | "down" | "flat";
const TONE = { up: COL.good, down: COL.bad, flat: COL.money };

export class Desk extends Container {
  bg = new Graphics();
  win = new Container();
  maskG = new Graphics();
  badge = new Container();
  cur: Text | null = null;
  arrow = new Graphics();
  line = "";
  len = 0;
  h = 0;
  size = 20;
  /** Crawl state: the text slides left at this pace (units per second) after a short hold. */
  crawl = { on: false, hold: 0, x: 0, w: 0 };

  constructor() {
    super();
    this.eventMode = "none";
    this.win.mask = this.maskG;
    this.addChild(this.bg, this.badge, this.win, this.maskG, this.arrow);
  }

  /**
   * Lays the strip out along `len` units, `h` deep, drawn horizontally in local space (the caller turns it).
   * `size` is the line's type size in table units.
   */
  layout(len: number, h: number, size: number, night: boolean) {
    this.len = len;
    this.h = h;
    this.size = size;
    const g = this.bg;
    g.clear();
    // the brass bezel and the dark glass of the wire
    g.roundRect(0, 0, len, h, 7).fill(night ? 0x2a2230 : 0x7a5a1c);
    g.roundRect(2, 2, len - 4, h - 4, 6).fill(night ? 0x05080a : 0x0b0309);
    // faint LED rows behind the text
    for (let y = 6; y < h - 4; y += 4) g.rect(4, y, len - 8, 1).fill({ color: 0xffffff, alpha: 0.025 });
    // the badge: a gold block that says what this is
    this.badge.removeChildren().forEach((c) => c.destroy());
    const bw = size * 2.9;
    const bb = new Graphics().roundRect(4, 4, bw, h - 8, 4).fill(night ? 0x8fb6c8 : COL.money);
    const bt = txt("WIRE", { fontFamily: NUM, fontSize: size * 0.95, fill: COL.ink, letterSpacing: 2 });
    bt.anchor.set(0.5);
    bt.position.set(4 + bw / 2, h / 2 + 1);
    this.badge.addChild(bb, bt);
    const x0 = 10 + bw;
    this.maskG.clear().rect(x0, 2, len - x0 - 26, h - 4).fill(0xffffff);
    this.win.position.set(x0 + 6, 0);
    this.arrow.position.set(len - 14, h / 2);
    const keep = this.line;
    this.line = "";
    if (this.cur) {
      this.cur.destroy();
      this.cur = null;
    }
    if (keep) this.say(keep, "flat", true);
  }

  /** Puts a new line on the wire. The old one rolls up and out, the new one rolls in from below. */
  say(line: string, tone: Tone = "flat", instant = false) {
    if (!line || line === this.line) return;
    this.line = line;
    const old = this.cur;
    const t = txt(line.toUpperCase(), { fontFamily: NUM, fontSize: this.size, fill: tone === "flat" ? COL.money : tone === "up" ? 0xbff5d8 : 0xffc2bd, letterSpacing: 1 });
    t.anchor.set(0, 0.5);
    this.cur = t;
    this.win.addChild(t);
    const room = this.len - this.win.x - 30;
    this.crawl = { on: t.width > room, hold: 1.4, x: 0, w: t.width - room + 24 };
    const a = this.arrow;
    a.clear();
    const c = TONE[tone];
    if (tone === "up") a.poly([0, -6, 6, 4, -6, 4]).fill(c);
    else if (tone === "down") a.poly([0, 6, 6, -4, -6, -4]).fill(c);
    else a.rect(-5, -2, 10, 4).fill(c);
    if (instant || reduced()) {
      old?.destroy();
      t.position.set(0, this.h / 2);
      return;
    }
    t.position.set(0, this.h * 1.3);
    t.alpha = 0;
    void tween(t, { y: this.h / 2, alpha: 1 }, 260, ease.outCubic);
    if (old) void tween(old, { y: -this.h * 0.4, alpha: 0 }, 220, ease.inCubic).then(() => old.destroy());
  }

  /** Crawls a long line left and back, once a frame. */
  frame(dt: number) {
    const t = this.cur;
    const c = this.crawl;
    if (!t || !c.on || reduced()) return;
    if (c.hold > 0) {
      c.hold -= dt;
      return;
    }
    c.x += dt * 70;
    if (c.x >= c.w) {
      t.x = -c.w;
      c.on = false;
      // after a pause, the line comes back to its start so it can be read again
      setTimeout(() => {
        if (this.cur === t && !t.destroyed) {
          void tween(t, { x: 0 }, 400, ease.inOut);
          this.crawl = { on: true, hold: 2.4, x: 0, w: c.w };
        }
      }, 1600);
      return;
    }
    t.x = -c.x;
  }
}
