// Drawing the pieces: figures on the rods (seen from above), coaches and shelf items as dressing-room name plates,
// plus token-art loading.
import { Circle, Container, Graphics, Sprite, Text, Texture, type TextStyleOptions } from "pixi.js";
import { facePath, type Launch, type TraitId } from "../shared/data.js";
import { COACH, COACH_VIBER, DRILL, PLAY, TIER_NAME, type DrillId } from "../shared/content.js";
import { hash32 } from "../shared/rng.js";
import { COL, FONT, THEM, type Kit } from "./theme.js";
import { ease, reduced, tween, wait } from "./tween.js";
import { look } from "./house.js";

/** Locker-bay size for coaches and shelf items. */
export const PW = 112;
export const PH = 156;
/** Figure head radius on the table. */
export const FR = 19;

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
/** How a figure is dressed: your kit, the rival's club kit, or a ghost club's pale sheet. */
export type FigLook = "you" | "them" | "ghost";
export const GHOST = { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 };

/** Body half-width and half-length (along the rod): the kit is the biggest shape on a figure, so a side reads at a glance. */
const BW = 19;
const BL = FR + 19;

/**
 * A table-football man from above: a kit-coloured disc on the felt under it, broad shoulders and arms across the rod
 * in the kit, the launch's own picture as the head, and a boot that shows under the body towards the goal it attacks
 * (it swings out on a kick). Your side wears your kit (house colours); a rival wears its club's kit (turquoise when
 * the club has none); a ghost club is pale and see-through. Stat badges sit behind the shoulders; a trait sets the idle.
 */
export class FigureView extends Container {
  floor = new Graphics();
  glow = new Graphics();
  body = new Graphics();
  foot = new Graphics();
  headBox = new Container();
  head = new Graphics();
  ring = new Graphics();
  pips = new Graphics();
  syn = new Graphics();
  spark: Graphics | null = null;
  tag: Text | null = null;
  tex: Texture | null = null;
  hover = 0;
  look: FigLook;
  /** The idle this figure plays, from its launch's numbers (cosmetic only). */
  trait: TraitId | null = null;
  ph = Math.random() * 6.28;
  /** Real-time seconds until a dipped figure slumps again after a goal. */
  perk = 0;
  /** True while a celebration owns the head's transform. */
  busy = false;

  constructor(
    public side: 0 | 1,
    public launch: Launch | null,
    public number = 0,
    look?: FigLook,
    public club: Kit | null = null,
  ) {
    super();
    this.look = look || (side === 0 ? "you" : "them");
    this.headBox.addChild(this.head);
    this.addChild(this.floor, this.syn, this.glow, this.foot, this.body, this.pips, this.headBox, this.ring);
    this.draw();
    if (launch) {
      tokenTexture(launch.c, launch.s, (t) => {
        if (this.destroyed) return;
        this.tex = t;
        this.drawHead();
      });
      const lb = txt("$" + launch.s.slice(0, 6), { fontSize: 11, fill: this.look === "you" ? COL.cream : this.look === "ghost" ? GHOST.hi : this.kit().hi, stroke: { color: COL.ink, width: 4 } });
      lb.anchor.set(0.5, 0);
      lb.position.set(0, BL + 2);
      this.tag = lb;
      this.addChild(lb);
    }
    if (this.look === "ghost") this.alpha = 0.82;
    this.eventMode = "static";
    this.cursor = "pointer";
    // a finger is bigger than a figure: the whole lane square answers
    this.hitArea = new Circle(0, 0, FR + 12);
  }

  kit(): Kit {
    if (this.look === "ghost") return GHOST;
    if (this.look === "them") return this.club || THEM;
    const lk = look();
    return { main: lk.kit, hi: lk.kitHi, trim: lk.trim };
  }

  get fwd() {
    return this.side === 0 ? 1 : -1;
  }

  /** Re-dress in another kit (a rival club's). */
  setKit(k: Kit | null) {
    this.club = k;
    this.draw();
    if (this.tag && this.look === "them") this.tag.style.fill = this.kit().hi;
  }

  /** Sets the trait idle; `haunted` lets a 0-trade launch show as a ghost. */
  setTrait(list: TraitId[], haunted: boolean) {
    this.trait = list.find((t) => t !== "ghost" || haunted) || null;
    if (this.spark) {
      this.spark.destroy();
      this.spark = null;
    }
    if (this.trait === "fresh") {
      // a four-point twinkle at the head's shoulder
      const s = new Graphics();
      s.poly([0, -7, 1.6, -1.6, 7, 0, 1.6, 1.6, 0, 7, -1.6, 1.6, -7, 0, -1.6, -1.6]).fill(0xffffff);
      s.position.set(FR * 0.75, -FR * 0.75);
      this.headBox.addChild(s);
      this.spark = s;
    }
    if (this.trait === "ghost" && this.look !== "ghost") this.alpha = 0.6;
    this.draw();
  }

  draw() {
    const k = this.kit();
    const b = this.body;
    const fwd = this.fwd;
    const ghost = this.look === "ghost";
    const wide = this.trait === "whale" ? 1.14 : 1;
    const w = BW * wide;
    // the floor disc: the team's colour on the felt, so a side reads from arm's length
    const f = this.floor;
    f.clear();
    if (!ghost) {
      f.circle(0, 0, FR + 15).fill({ color: this.look === "you" ? k.hi : k.main, alpha: 0.2 });
      f.circle(0, 0, FR + 15).stroke({ width: 2.5, color: this.look === "you" ? k.hi : k.main, alpha: 0.55 });
    } else f.circle(0, 0, FR + 13).fill({ color: GHOST.main, alpha: 0.08 });
    b.clear();
    // shadow across the felt
    b.roundRect(-w + 4, -BL + 5, w * 2, BL * 2, w).fill({ color: 0x000000, alpha: ghost ? 0.15 : 0.38 });
    // shoulders and arms along the rod: a broad capsule, darker at the hands
    b.roundRect(-w, -BL, w * 2, BL * 2, w).fill(COL.ink);
    b.roundRect(-w + 2.5, -BL + 2.5, w * 2 - 5, BL * 2 - 5, w - 2.5).fill(k.main);
    // hands: trim-coloured ends
    b.roundRect(-w + 2.5, -BL + 2.5, w * 2 - 5, 10, 7).fill({ color: k.trim, alpha: 0.95 });
    b.roundRect(-w + 2.5, BL - 12.5, w * 2 - 5, 10, 7).fill({ color: k.trim, alpha: 0.95 });
    // a shirt highlight on the side facing the light, and a collar ring
    b.roundRect(-w + 4, -BL + 8, 6, BL * 2 - 16, 3).fill({ color: k.hi, alpha: 0.55 });
    b.circle(0, 0, FR + 5).fill(COL.ink);
    b.circle(0, 0, FR + 3.5).fill(k.main);
    if (this.launch) pairGlyph(b, this.launch.u, fwd * -5, -BL + 16, 8, COL.ink);
    // the boot: under the body, pointing at the goal this side attacks
    this.foot.clear();
    if (ghost) {
      // a ghost has no boot: a ragged sheet hem instead
      this.foot.poly([0, -10, fwd * 24, -9, fwd * 19, -3, fwd * 26, 2, fwd * 19, 7, fwd * 24, 10, 0, 10]).fill({ color: k.main, alpha: 0.75 });
    } else {
      const boot = this.trait === "flown" ? COL.money : this.trait === "fresh" ? 0xffffff : k.trim;
      this.foot.roundRect(fwd > 0 ? 6 : -30, -8, 24, 16, 6).fill(COL.ink);
      this.foot.roundRect(fwd > 0 ? 8 : -28, -6, 20, 12, 5).fill(boot);
      this.foot.rect(fwd > 0 ? 24 : -28, -6, 4, 12).fill({ color: COL.ink, alpha: 0.5 });
      if (this.trait === "flown") this.foot.roundRect(fwd > 0 ? 10 : -26, -5, 10, 3, 1.5).fill({ color: 0xfff0b0, alpha: 0.9 });
    }
    this.drawHead();
  }

  drawHead() {
    const k = this.kit();
    const h = this.head;
    const ghost = this.look === "ghost" || this.trait === "ghost";
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
    h.circle(0, 0, FR - 2).stroke({ width: 3, color: this.look === "you" ? k.hi : k.trim === COL.ink ? k.main : k.trim, alpha: 0.95 });
    if (ghost) {
      // two hollow eyes over the picture
      h.ellipse(-6, -3, 3, 4).fill({ color: COL.ink, alpha: 0.75 });
      h.ellipse(6, -3, 3, 4).fill({ color: COL.ink, alpha: 0.75 });
    }
  }

  /** The kick: the boot swings out and back, the shoulders flick round the rod. */
  swing(tw: (o: object, to: Keyed<string, number>, ms: number, e?: (t: number) => number) => Promise<void>, back: (t: number) => number) {
    const fwd = this.fwd;
    this.foot.x = 0;
    this.rotation = -fwd * 0.28;
    this.body.scale.x = 0.7;
    const quick = this.trait === "degen" ? 0.7 : 1;
    void tw(this.foot, { x: fwd * 16 }, 90 * quick).then(() => tw(this.foot, { x: 0 }, 220 * quick, back));
    void tw(this.body.scale, { x: 1 }, 260 * quick, back);
    void tw(this, { rotation: 0 }, 280 * quick, back);
  }

  /** The scorer: the head pops up and flips over, then lands. */
  async celebrate() {
    if (reduced()) return;
    this.busy = true;
    this.perk = 8;
    const hb = this.headBox;
    hb.rotation = 0;
    await tween(hb.scale, { x: 1.75, y: 1.75 }, 160, ease.outBack);
    await tween(hb.scale, { x: -1.75 }, 170, ease.inOut);
    await tween(hb.scale, { x: 1.75 }, 170, ease.inOut);
    void tween(hb, { rotation: 0 }, 1);
    await tween(hb.scale, { x: 1, y: 1 }, 320, ease.outElastic);
    this.busy = false;
  }

  /** A teammate's bump: a short hop after `delay` ms. */
  async bump(delay = 0) {
    if (reduced()) return;
    this.perk = 8;
    await wait(delay);
    if (this.destroyed) return;
    await tween(this.headBox.scale, { x: 1.25, y: 1.25 }, 110, ease.outCubic);
    await tween(this.headBox.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  /** Idle life, once a frame: a small breath for everyone, and the trait's own way of waiting. */
  idle(t: number, dt: number) {
    if (this.busy || this.destroyed) return;
    const hb = this.headBox;
    const p = this.ph;
    if (this.perk > 0) this.perk -= dt;
    let rot = Math.sin(t * 1.3 + p) * 0.05;
    let x = 0;
    let s = 1;
    switch (this.trait) {
      case "whale":
        rot = Math.sin(t * 0.7 + p) * 0.08;
        break;
      case "degen":
        rot = (Math.sin(t * 23 + p) * 0.6 + Math.sin(t * 37 + p * 2) * 0.4) * 0.07;
        x = Math.sin(t * 29 + p) * 0.8;
        break;
      case "dip":
        // slumped: a smaller head, sunk back; it perks up for a while after a goal
        if (this.perk <= 0) {
          s = 0.88;
          x = -this.fwd * 2.5;
          rot = Math.sin(t * 0.6 + p) * 0.03 - this.fwd * 0.12;
        }
        break;
      case "ghost":
        x = Math.sin(t * 1.1 + p) * 2;
        this.body.alpha = 0.7 + Math.sin(t * 1.7 + p) * 0.15;
        break;
    }
    hb.rotation = rot;
    hb.x = x;
    if (hb.scale.x !== s && Math.abs(hb.scale.x) < 1.2) hb.scale.set(s);
    if (this.spark) {
      const k = Math.max(0, Math.sin(t * 2.6 + p));
      this.spark.alpha = k;
      this.spark.scale.set(0.4 + k * 0.8);
      this.spark.rotation = t * 0.8;
    }
  }

  /** Badges for the stats this figure plays with: a bolt for Power, chevrons for Pace, a shield for Grip. */
  setStats(st: { power: boolean; pace: boolean; grip: boolean } | null) {
    const g = this.pips;
    g.clear();
    if (!st) return;
    const list: ("power" | "pace" | "grip")[] = [];
    if (st.power) list.push("power");
    if (st.pace) list.push("pace");
    if (st.grip) list.push("grip");
    const fwd = this.fwd;
    list.forEach((k, i) => {
      const x = -fwd * (BW + 9);
      const y = (i - (list.length - 1) / 2) * 19;
      statBadge(g, k, x, y, 9);
    });
  }

  /** A ring: the ball holder, a pass target, a hovered coach's figure. */
  setRing(color: number | null, width = 3) {
    this.ring.clear();
    if (color === null) return;
    this.ring.circle(0, 0, FR + 4).stroke({ width, color });
  }

  /** The ball holder: a soft halo under the figure, pulsed by the table's frame loop. */
  setGlow(color: number | null) {
    this.glow.clear();
    if (color === null) return;
    this.glow.circle(0, 0, FR + 20).fill({ color, alpha: 0.18 });
    this.glow.circle(0, 0, FR + 12).fill({ color, alpha: 0.3 });
  }

  /** A soft halo in a coach's hue while that coach is hovered. */
  setSynergy(color: number | null) {
    this.syn.clear();
    if (color === null) return;
    this.syn.circle(0, 0, FR + 14).fill({ color, alpha: 0.28 });
    this.syn.circle(0, 0, FR + 9).stroke({ width: 3, color, alpha: 0.9 });
  }
}

/** Stat colours: Power hot pink, Pace cyan, Grip gold. */
export const STAT_COL = { power: COL.pink, pace: COL.cyan, grip: COL.money } as const;

/** One stat badge: an ink disc with the stat's glyph, readable at a glance. `r` is the disc radius. */
export function statBadge(g: Graphics, k: "power" | "pace" | "grip", x: number, y: number, r: number) {
  const c = STAT_COL[k];
  g.circle(x, y, r + 1.5).fill(COL.ink);
  g.circle(x, y, r).fill(c);
  const u = r / 9;
  if (k === "power") {
    // a lightning bolt
    g.poly([x + 1.5 * u, y - 6.5 * u, x - 4 * u, y + 1 * u, x - 0.3 * u, y + 1 * u, x - 1.8 * u, y + 6.5 * u, x + 4.2 * u, y - 1.2 * u, x + 0.4 * u, y - 1.2 * u]).fill(COL.ink);
  } else if (k === "pace") {
    // two chevrons
    for (const dx of [-2.6, 2.2]) g.poly([x + (dx - 2.2) * u, y - 4.5 * u, x + (dx + 2.4) * u, y, x + (dx - 2.2) * u, y + 4.5 * u, x + (dx - 0.4) * u, y + 4.5 * u, x + (dx + 0.6) * u, y, x + (dx - 0.4) * u, y - 4.5 * u]).fill(COL.ink);
  } else {
    // a shield
    g.poly([x, y - 5.5 * u, x + 4.6 * u, y - 3.8 * u, x + 4 * u, y + 1.5 * u, x, y + 5.8 * u, x - 4 * u, y + 1.5 * u, x - 4.6 * u, y - 3.8 * u]).fill(COL.ink);
    g.poly([x, y - 3 * u, x + 2.4 * u, y - 2 * u, x + 2 * u, y + 1 * u, x, y + 3 * u]).fill(c);
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

/** The brass of a coach's name plate by standing: steel for the Academy, brass for the first team, gold for a legend. */
const PLATE = {
  1: { face: 0xa9b6bf, hi: 0xe2eaef, lo: 0x5d6a73 },
  2: { face: 0xc9a24a, hi: 0xf2d98c, lo: 0x7a5a1c },
  3: { face: 0xffc23d, hi: 0xfff0b0, lo: 0x9a6a10 },
} as const;
const PLATE_H = 34;

/**
 * A spot on the dressing-room wall: a locker bay in the item's colour with slats and two vents, its label at the top, and an
 * engraved name plate screwed on below. What stands in the bay is drawn by the caller. Used by coaches and items.
 */
function lockerBay(wall: number, plate: { face: number; hi: number; lo: number }, label: string): { g: Graphics; label: Text } {
  const g = new Graphics();
  const x0 = -PW / 2;
  const y0 = -PH / 2;
  g.roundRect(x0, y0, PW, PH, 8).fill(COL.ink);
  g.roundRect(x0 + 4, y0 + 4, PW - 8, PH - 8, 5).fill(wall);
  // slats and vents: a locker door, not a picture frame
  for (const fx of [-0.25, 0.25]) g.rect(fx * PW - 1, y0 + 34, 2, PH - PLATE_H - 44).fill({ color: COL.ink, alpha: 0.28 });
  for (let i = 0; i < 2; i++) g.roundRect(-18, y0 + 8 + i * 5, 36, 3, 1.5).fill({ color: COL.ink, alpha: 0.55 });
  // the name plate, screwed on
  const py = PH / 2 - PLATE_H - 6;
  g.roundRect(x0 + 7, py, PW - 14, PLATE_H, 4).fill(plate.lo);
  g.roundRect(x0 + 7, py, PW - 14, PLATE_H - 3, 4).fill(plate.face).stroke({ width: 2, color: COL.ink });
  g.rect(x0 + 11, py + 3, PW - 22, 2).fill({ color: plate.hi, alpha: 0.85 });
  for (const sx of [x0 + 13, -x0 - 13]) g.circle(sx, py + PLATE_H / 2 - 1, 2.2).fill(plate.lo);
  const lb = txt(label, { fontSize: 8, fill: COL.cream2, letterSpacing: 1 });
  lb.anchor.set(0.5);
  lb.alpha = 0.85;
  lb.position.set(0, y0 + 25);
  return { g, label: lb };
}

/** The name, engraved on the plate: ink on brass, one or two lines. */
function plateName(name: string): Text {
  const nm = txt(name, { fontSize: name.length > 10 ? 10 : 12, fill: COL.ink, align: "center", wordWrap: true, wordWrapWidth: PW - 30, lineHeight: 11 });
  nm.anchor.set(0.5);
  nm.position.set(0, PH / 2 - PLATE_H / 2 - 7);
  return nm;
}

/** A coach in the dressing room: their viber standing in a locker bay, the name on a plate in the brass of their standing. */
export class CoachView extends Container {
  shadow = new Graphics();
  body = new Container();
  wob = Math.random() * 6.28;
  constructor(public coachId: string) {
    super();
    const d = COACH[coachId];
    this.shadow.roundRect(-PW / 2 + 5, -PH / 2 + 7, PW, PH, 8).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const bay = lockerBay(hsl(d.hue, 0.32, 0.22), PLATE[d.tier], (d.reads ? `${TIER_NAME[d.tier]} · reads` : TIER_NAME[d.tier]).toUpperCase());
    this.body.addChild(bay.g);
    // a floor shadow for the coach to stand on
    const floor = new Graphics().ellipse(0, PH / 2 - PLATE_H - 14, 30, 6).fill({ color: COL.ink, alpha: 0.4 });
    this.body.addChild(floor);
    const p = portrait(d.id, d.hue, 5);
    p.position.set(0, -2);
    this.body.addChild(p);
    const vb = COACH_VIBER[d.id];
    if (vb) {
      viberTexture(vb, (t) => {
        if (this.destroyed) return;
        p.visible = false;
        const sp = new Sprite(t);
        sp.anchor.set(0.5, 1);
        sp.width = 84;
        sp.height = 84;
        sp.position.set(0, PH / 2 - PLATE_H - 10);
        this.body.addChildAt(sp, this.body.getChildIndex(p));
      });
    }
    this.body.addChild(bay.label, plateName(d.name));
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
    this.shadow.roundRect(-PW / 2 + 5, -PH / 2 + 7, PW, PH, 8).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const wall = kind === "drill" ? 0x0f4a50 : 0x4a1240;
    const band = kind === "drill" ? COL.cyan : COL.money;
    const bay = lockerBay(wall, { face: COL.cream2, hi: 0xffffff, lo: 0x8a7460 }, kind === "drill" ? "TRAINING" : "SET PIECE");
    const e = new Graphics();
    if (kind === "drill") {
      // a cone and a ball on the floor of the bay: training kit
      e.poly([0, -34, 16, 8, -16, 8]).fill(COL.money).stroke({ width: 3, color: COL.ink });
      e.rect(-12, -10, 24, 5).fill(COL.cream);
      e.circle(22, 16, 9).fill(COL.cream).stroke({ width: 3, color: COL.ink });
    } else {
      // a tactics slate in the bay: a set piece
      e.roundRect(-28, -32, 56, 52, 8).fill(COL.ink).stroke({ width: 3, color: band });
      e.circle(-12, -14, 4).fill(band);
      e.circle(12, 4, 4).fill(band);
      e.moveTo(-12, -14).lineTo(12, 4).stroke({ width: 2, color: COL.cream, alpha: 0.8 });
      e.poly([12, 4, 4, 3, 9, -3]).fill(COL.cream);
    }
    e.position.set(0, 0);
    e.scale.set(0.9);
    const name = kind === "drill" ? DRILL[itemId as DrillId].name : PLAY[itemId].name;
    this.body.addChild(bay.g, e, bay.label, plateName(name));
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}
