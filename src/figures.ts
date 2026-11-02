// Drawing the pieces: figures on the rods (seen from above), coach plaques, shelf items, plus token-art loading.
import { Circle, Container, Graphics, Sprite, Text, Texture, type TextStyleOptions } from "pixi.js";
import { facePath, type Launch } from "../shared/data.js";
import { COACH, COACH_VIBER, DRILL, PLAY, type DrillId } from "../shared/content.js";
import { hash32 } from "../shared/rng.js";
import { COL, FONT, THEM } from "./theme.js";
import { look } from "./house.js";

/** Plaque size for coaches and shelf items. */
export const PW = 112;
export const PH = 156;
/** Figure head radius on the table. */
export const FR = 21;

export function txt(text: string, style: TextStyleOptions): Text {
  const st: TextStyleOptions = { ...style };
  // body text is set in the same pixel face; it reads smaller, so scale it up and never fake-bold it
  if (!st.fontFamily && typeof st.fontSize === "number") st.fontSize = Math.round(st.fontSize * 1.3);
  if (!st.fontFamily && typeof st.lineHeight === "number") st.lineHeight = Math.round(st.lineHeight * 1.2);
  delete st.fontWeight;
  const t = new Text({ text, style: { fontFamily: FONT, fill: COL.cream, letterSpacing: 0.5, ...st } });
  t.resolution = Math.min(3, (window.devicePixelRatio || 1) * 1.6);
  return t;
}

// ------------------------------------------------------------ token art
const texCache = new Map<string, Texture>();
const waiting = new Map<string, ((t: Texture) => void)[]>();

export function tokenTexture(cid: string | null, sym: string, cb: (t: Texture) => void): void {
  const key = cid || "sym:" + sym;
  const hit = texCache.get(key);
  if (hit) return cb(hit);
  const q = waiting.get(key);
  if (q) {
    q.push(cb);
    return;
  }
  waiting.set(key, [cb]);
  const img = new Image();
  img.decoding = "async";
  const finish = (t: Texture) => {
    texCache.set(key, t);
    for (const f of waiting.get(key) || []) f(t);
    waiting.delete(key);
  };
  img.onload = () => {
    const N = 32;
    const cv = document.createElement("canvas");
    cv.width = N;
    cv.height = N;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = true;
    const s = Math.min(img.naturalWidth, img.naturalHeight) || 1;
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, N, N);
    const t = Texture.from(cv);
    t.source.scaleMode = "nearest";
    finish(t);
  };
  img.onerror = () => finish(Texture.WHITE);
  img.src = facePath(cid, sym);
}

// ------------------------------------------------------------ viber sprites (static, already pixel art)
const viberCache = new Map<string, Texture>();
export function viberTexture(name: string, cb: (t: Texture) => void): void {
  const hit = viberCache.get(name);
  if (hit) return cb(hit);
  const img = new Image();
  img.onload = () => {
    const t = Texture.from(img);
    t.source.scaleMode = "nearest";
    viberCache.set(name, t);
    cb(t);
  };
  img.src = `/vibers/${name}.png`;
}

/** Pair kinds as small shapes, for the kit stripe on a figure's shoulders. */
export function pairGlyph(g: Graphics, u: number, x: number, y: number, s: number, color: number) {
  const h = s / 2;
  if (u === 0) g.poly([x, y - h, x + h * 0.8, y, x, y + h, x - h * 0.8, y]).fill(color);
  else if (u === 1) g.poly([x, y - h, x + h, y + h * 0.8, x - h, y + h * 0.8]).fill(color);
  else if (u === 2) g.circle(x, y, h * 0.9).fill(color);
  else g.rect(x - h * 0.8, y - h * 0.8, h * 1.6, h * 1.6).fill(color);
}

// ------------------------------------------------------------ a figure on a rod, seen from above
/** How a figure is dressed: your kit, the rival's turquoise, or a ghost club's pale sheet. */
export type FigLook = "you" | "them" | "ghost";
export const GHOST = { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 };

/**
 * A table-football man from above: shoulders and arms across the rod in the kit colour, the launch's own picture
 * as the head, and a boot that shows under the body towards the goal it attacks (it swings out on a kick).
 * Your side wears the kit (house colours); a rival wears turquoise; a ghost club is pale and see-through.
 */
export class FigureView extends Container {
  glow = new Graphics();
  body = new Graphics();
  foot = new Graphics();
  head = new Graphics();
  ring = new Graphics();
  pips = new Graphics();
  syn = new Graphics();
  tag: Text | null = null;
  tex: Texture | null = null;
  hover = 0;
  look: FigLook;

  constructor(
    public side: 0 | 1,
    public launch: Launch | null,
    public number = 0,
    look?: FigLook,
  ) {
    super();
    this.look = look || (side === 0 ? "you" : "them");
    this.addChild(this.syn, this.glow, this.foot, this.body, this.head, this.ring, this.pips);
    this.draw();
    if (launch) {
      tokenTexture(launch.c, launch.s, (t) => {
        if (this.destroyed) return;
        this.tex = t;
        this.drawHead();
      });
      const lb = txt("$" + launch.s.slice(0, 6), { fontSize: 11, fill: this.look === "you" ? COL.cream : this.look === "ghost" ? GHOST.hi : THEM.hi, stroke: { color: COL.ink, width: 4 } });
      lb.anchor.set(0.5, 0);
      lb.position.set(0, FR + 12);
      this.tag = lb;
      this.addChild(lb);
    }
    if (this.look === "ghost") this.alpha = 0.82;
    this.eventMode = "static";
    this.cursor = "pointer";
    // a finger is bigger than a figure: the whole lane square answers
    this.hitArea = new Circle(0, 0, FR + 10);
  }

  kit(): { main: number; hi: number; trim: number } {
    if (this.look === "ghost") return GHOST;
    if (this.look === "them") return THEM;
    const lk = look();
    return { main: lk.kit, hi: lk.kitHi, trim: lk.trim };
  }

  get fwd() {
    return this.side === 0 ? 1 : -1;
  }

  draw() {
    const k = this.kit();
    const b = this.body;
    const fwd = this.fwd;
    const ghost = this.look === "ghost";
    b.clear();
    // shadow across the felt
    b.roundRect(-13 + 4, -FR - 12 + 5, 26, 2 * FR + 24, 12).fill({ color: 0x000000, alpha: ghost ? 0.15 : 0.35 });
    // shoulders and arms along the rod: a long capsule, darker at the hands
    b.roundRect(-13, -FR - 12, 26, 2 * FR + 24, 12).fill(COL.ink);
    b.roundRect(-11, -FR - 10, 22, 2 * FR + 20, 10).fill(k.main);
    b.roundRect(-11, -FR - 10, 22, 9, 6).fill({ color: k.trim, alpha: 0.9 });
    b.roundRect(-11, FR + 1, 22, 9, 6).fill({ color: k.trim, alpha: 0.9 });
    // a shirt highlight on the side facing the light
    b.roundRect(-10, -FR - 6, 6, 2 * FR + 12, 3).fill({ color: k.hi, alpha: 0.5 });
    if (this.launch) pairGlyph(b, this.launch.u, fwd * -6, -FR - 5, 7, COL.ink);
    // the boot: under the body, pointing at the goal this side attacks
    this.foot.clear();
    if (ghost) {
      // a ghost has no boot: a ragged sheet hem instead
      this.foot.poly([0, -10, fwd * 22, -9, fwd * 17, -3, fwd * 24, 2, fwd * 17, 7, fwd * 22, 10, 0, 10]).fill({ color: k.main, alpha: 0.75 });
    } else {
      this.foot.roundRect(fwd > 0 ? 4 : -26, -7, 22, 14, 6).fill(COL.ink);
      this.foot.roundRect(fwd > 0 ? 6 : -24, -5, 18, 10, 5).fill(k.trim);
      this.foot.rect(fwd > 0 ? 20 : -24, -5, 4, 10).fill({ color: COL.ink, alpha: 0.5 });
    }
    this.drawHead();
  }

  drawHead() {
    const k = this.kit();
    const h = this.head;
    const ghost = this.look === "ghost";
    h.clear();
    h.circle(0, 0, FR).fill(COL.ink);
    if (this.launch && this.tex && this.tex !== Texture.WHITE) {
      h.circle(0, 0, FR - 3).fill({ texture: this.tex, textureSpace: "local", color: ghost ? 0xbfe0f0 : 0xffffff });
      if (ghost) h.circle(0, 0, FR - 3).fill({ color: GHOST.hi, alpha: 0.28 });
    } else if (this.launch) {
      h.circle(0, 0, FR - 3).fill(k.hi);
      const n = hash32(this.launch.s);
      h.rect(-5, -5, 10, 10).fill({ color: COL.ink, alpha: 0.4 + (n % 5) / 10 });
    } else {
      h.circle(0, 0, FR - 3).fill(k.hi);
      h.circle(-5, -4, 2.5).fill(COL.ink);
      h.circle(5, -4, 2.5).fill(COL.ink);
    }
    h.circle(0, 0, FR - 2).stroke({ width: 3, color: k.trim, alpha: 0.95 });
    if (ghost) {
      // two hollow eyes over the picture
      h.ellipse(-6, -3, 3, 4).fill({ color: COL.ink, alpha: 0.75 });
      h.ellipse(6, -3, 3, 4).fill({ color: COL.ink, alpha: 0.75 });
    }
  }

  /** The kick: the boot swings out and back, the shoulders flick round the rod. */
  swing(tween: (o: object, to: Keyed<string, number>, ms: number, e?: (t: number) => number) => Promise<void>, back: (t: number) => number) {
    const fwd = this.fwd;
    this.foot.x = 0;
    this.rotation = -fwd * 0.28;
    this.body.scale.x = 0.7;
    void tween(this.foot, { x: fwd * 14 }, 90).then(() => tween(this.foot, { x: 0 }, 220, back));
    void tween(this.body.scale, { x: 1 }, 260, back);
    void tween(this, { rotation: 0 }, 280, back);
  }

  /** Small coloured pips for the stats this figure plays with: Power, Pace, Grip. */
  setStats(st: { power: boolean; pace: boolean; grip: boolean } | null) {
    const g = this.pips;
    g.clear();
    if (!st) return;
    const list: number[] = [];
    if (st.power) list.push(COL.pink);
    if (st.pace) list.push(COL.cyan);
    if (st.grip) list.push(COL.money);
    const fwd = this.fwd;
    list.forEach((c, i) => {
      const x = -fwd * 18;
      const y = -12 + i * 12;
      g.circle(x, y, 6).fill(COL.ink);
      g.circle(x, y, 4.2).fill(c);
    });
  }

  /** A ring: the ball holder, a pass target, a hovered coach's figure. */
  setRing(color: number | null, width = 3) {
    this.ring.clear();
    if (color === null) return;
    this.ring.circle(0, 0, FR + 3).stroke({ width, color });
  }

  /** The ball holder: a soft halo under the figure, pulsed by the table's frame loop. */
  setGlow(color: number | null) {
    this.glow.clear();
    if (color === null) return;
    this.glow.circle(0, 0, FR + 16).fill({ color, alpha: 0.18 });
    this.glow.circle(0, 0, FR + 9).fill({ color, alpha: 0.3 });
  }

  /** A soft halo in a coach's hue while that coach is hovered. */
  setSynergy(color: number | null) {
    this.syn.clear();
    if (color === null) return;
    this.syn.circle(0, 0, FR + 12).fill({ color, alpha: 0.28 });
    this.syn.circle(0, 0, FR + 7).stroke({ width: 3, color, alpha: 0.9 });
  }
}

// ------------------------------------------------------------ coach portraits
export function portrait(id: string, hue: number, size = 12): Graphics {
  const g = new Graphics();
  const h = hash32(id);
  const skin = hsl(hue, 0.55, 0.62);
  const dark = hsl(hue, 0.6, 0.2);
  const accent = hsl((hue + 160) % 360, 0.85, 0.6);
  const N = 12;
  const px = size;
  const head = (x: number, y: number) => {
    const cx = x - 5.5;
    const cy = y - 6.2;
    return (cx * cx) / 22 + (cy * cy) / 30 < 1;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N / 2; x++) {
      const bit = (h >>> ((y * 6 + x) % 29)) & 1;
      let c: number | null = null;
      if (head(x, y)) c = skin;
      if (y <= 3 && head(x, y + 1) && (bit || y <= 2)) c = h & 4 ? accent : dark;
      if (y === 5 && x === 3) c = COL.ink;
      if (y === 6 && x === 3 && h & 8) c = 0xffffff;
      if (y === 8 && x >= 4) c = h & 16 ? COL.ink : dark;
      if (y >= 10 && x >= 1) c = accent;
      if (c !== null) {
        g.rect(x * px, y * px, px, px).fill(c);
        g.rect((N - 1 - x) * px, y * px, px, px).fill(c);
      }
    }
  }
  g.pivot.set((N * px) / 2, (N * px) / 2);
  return g;
}

function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
export const hslHex = hsl;

const RARE_COL = { 1: 0x27c4e8, 2: 0x3ddc97, 3: 0xff3d7f } as const;

/** A coach on the bench: a plaque with one of the vibers. */
export class CoachView extends Container {
  shadow = new Graphics();
  body = new Container();
  wob = Math.random() * 6.28;
  constructor(public coachId: string) {
    super();
    const d = COACH[coachId];
    this.shadow.roundRect(-PW / 2 + 5, -PH / 2 + 7, PW, PH, 10).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const g = new Graphics();
    g.roundRect(-PW / 2, -PH / 2, PW, PH, 10).fill(COL.ink);
    g.roundRect(-PW / 2 + 4, -PH / 2 + 4, PW - 8, PH - 8, 7).fill(hsl(d.hue, 0.45, 0.24));
    g.rect(-PW / 2 + 4, -PH / 2 + 4, PW - 8, 14).fill(RARE_COL[d.rarity]);
    this.body.addChild(g);
    const disc = new Graphics().circle(0, -12, 40).fill({ color: hsl(d.hue, 0.6, 0.45), alpha: 0.35 });
    this.body.addChild(disc);
    const p = portrait(d.id, d.hue, 6);
    p.position.set(0, -10);
    this.body.addChild(p);
    const vb = COACH_VIBER[d.id];
    if (vb) {
      viberTexture(vb, (t) => {
        if (this.destroyed) return;
        p.visible = false;
        const sp = new Sprite(t);
        sp.anchor.set(0.5);
        sp.width = 96;
        sp.height = 96;
        sp.position.set(0, -14);
        this.body.addChildAt(sp, this.body.getChildIndex(p));
      });
    }
    const nm = txt(d.name, { fontSize: d.name.length > 12 ? 11 : 13, fill: COL.cream, align: "center", wordWrap: true, wordWrapWidth: PW - 14 });
    nm.anchor.set(0.5);
    nm.position.set(0, 50);
    this.body.addChild(nm);
    const tag = txt(d.reads ? "COACH · READS" : "COACH", { fontSize: 9, fill: COL.ink });
    tag.anchor.set(0.5);
    tag.position.set(0, -PH / 2 + 11);
    this.body.addChild(tag);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}

/** A training drill or a set piece on the shelf or the bench. */
export class ItemView extends Container {
  shadow = new Graphics();
  body = new Container();
  wob = Math.random() * 6.28;
  constructor(
    public kind: "drill" | "play",
    public itemId: string,
  ) {
    super();
    this.shadow.roundRect(-PW / 2 + 5, -PH / 2 + 7, PW, PH, 10).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const g = new Graphics();
    const tone = kind === "drill" ? 0x0f4a50 : 0x4a1240;
    const band = kind === "drill" ? COL.cyan : COL.money;
    g.roundRect(-PW / 2, -PH / 2, PW, PH, 10).fill(COL.ink);
    g.roundRect(-PW / 2 + 4, -PH / 2 + 4, PW - 8, PH - 8, 7).fill(tone);
    g.rect(-PW / 2 + 4, -PH / 2 + 4, PW - 8, 14).fill(band);
    const e = new Graphics();
    if (kind === "drill") {
      // a cone and a ball: training
      e.poly([0, -34, 16, 8, -16, 8]).fill(COL.money).stroke({ width: 3, color: COL.ink });
      e.rect(-12, -10, 24, 5).fill(COL.cream);
      e.circle(22, 16, 9).fill(COL.cream).stroke({ width: 3, color: COL.ink });
    } else {
      // a whistle-board: a set piece drawn on a slate
      e.roundRect(-28, -32, 56, 52, 8).fill(COL.ink).stroke({ width: 3, color: band });
      e.circle(-12, -14, 4).fill(band);
      e.circle(12, 4, 4).fill(band);
      e.moveTo(-12, -14).lineTo(12, 4).stroke({ width: 2, color: COL.cream, alpha: 0.8 });
      e.poly([12, 4, 4, 3, 9, -3]).fill(COL.cream);
    }
    e.position.set(0, -6);
    this.body.addChild(g, e);
    const name = kind === "drill" ? DRILL[itemId as DrillId].name : PLAY[itemId].name;
    const nm = txt(name, { fontSize: name.length > 12 ? 11 : 13, fill: COL.cream, align: "center", wordWrap: true, wordWrapWidth: PW - 14 });
    nm.anchor.set(0.5);
    nm.position.set(0, 50);
    const tag = txt(kind === "drill" ? "TRAINING" : "SET PIECE", { fontSize: 9, fill: COL.ink });
    tag.anchor.set(0.5);
    tag.position.set(0, -PH / 2 + 11);
    this.body.addChild(nm, tag);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}
