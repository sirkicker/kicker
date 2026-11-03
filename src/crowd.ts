// The stands: vibers along the cabinet, as many as you have fans. One atlas of 128 downscaled vibers
// (public/crowd/vibers.png, 64 px cells), loaded only once a table is on, so the title never waits for it.
// Every viber is a sprite from that one texture, so the whole crowd draws in a batch or two.
// They bob while they wait, stand and wave scarves in your kit on a goal, cover their faces on a block, and go
// quiet when you concede. On the Haunted table the stands are tombstones and candles, with a few pale vibers.
import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { hash32 } from "../shared/rng.js";
import { COL } from "./theme.js";
import { reduced } from "./tween.js";
import { CAB_T, CTRL_Y, STAND_T, TS_H, TS_W } from "./table.js";

const CELL = 64;
const COLS = 16;
const COUNT = 128;
let atlas: Texture | null = null;
let frames: Texture[] = [];
let loading: Promise<void> | null = null;

/** Starts loading the atlas (once). Safe to call early: it never blocks anything. */
export function loadCrowd(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      atlas = Texture.from(img);
      atlas.source.scaleMode = "nearest";
      frames = [];
      for (let i = 0; i < COUNT; i++) frames.push(new Texture({ source: atlas.source, frame: new Rectangle((i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL) }));
      res();
    };
    img.onerror = () => res();
    img.src = "/crowd/vibers.png";
  });
  return loading;
}

export type CrowdMood = "idle" | "cheer" | "cover" | "quiet";

interface Seat {
  x: number;
  y: number;
  /** Draw order: further back first. */
  depth: number;
  /** Fill order: lower fills first. */
  rank: number;
  sp: Sprite | null;
  scarf: Sprite | null;
  scarf2: Sprite | null;
  hands: Sprite | null;
  flame: Sprite | null;
  ph: number;
  rate: number;
  base: number;
}

const SIZE = 40;

/**
 * The stands, in table space. `port` turns every viber upright for the phone's standing table. The stands sit above
 * the far rail (the full length of the cabinet) and in two blocks either side of your handles.
 */
export class Crowd extends Container {
  bg = new Graphics();
  people = new Container();
  seats: Seat[] = [];
  filled = 0;
  want = 0;
  mood: CrowdMood = "idle";
  moodLeft = 0;
  kit = { main: COL.pink, hi: COL.pink };
  haunted = false;
  port = false;
  /** 0..1, how loud the stands are: rises with a goal, falls back. */
  energy = 0;

  constructor() {
    super();
    this.eventMode = "none";
    this.addChild(this.bg, this.people);
  }

  /** Lays the seats out for a table orientation and dresses the stands; keeps the crowd size. */
  build(port: boolean, haunted: boolean) {
    this.port = port;
    this.haunted = haunted;
    this.candles = [];
    this.people.removeChildren().forEach((c) => c.destroy());
    this.seats = [];
    const g = this.bg;
    g.clear();
    const add = (x: number, y: number, depth: number, front: number) => {
      const h = hash32(`${x}|${y}`);
      this.seats.push({ x, y, depth, rank: front * 1000 + (h % 997), sp: null, scarf: null, scarf2: null, hands: null, flame: null, ph: (h % 628) / 100, rate: 1.4 + (h % 7) / 6, base: 0 });
    };
    const wood = haunted ? 0x120a14 : 0x22091c;
    const step = haunted ? 0x1c1420 : 0x34112b;
    // the long stand above the far rail
    const top = -STAND_T;
    g.roundRect(4, top - 2, TS_W - 8, CAB_T - top + 8, 10).fill(wood);
    if (!port) {
      g.rect(8, top + 40, TS_W - 16, 4).fill({ color: step, alpha: 1 });
      g.rect(8, top + 72, TS_W - 16, 4).fill({ color: step, alpha: 1 });
      for (let x = 22; x < TS_W - 10; x += 30) add(x, 2, 0, 1);
      for (let x = 37; x < TS_W - 10; x += 30) add(x, 32, 1, 0);
    } else {
      // standing table: one file of upright vibers down the long side, feet towards the felt
      for (let x = 30; x < TS_W - 20; x += 44) add(x, -24, x, 0);
    }
    // two blocks either side of your handles
    const block = (x0: number, x1: number, y0: number, y1: number) => {
      g.roundRect(x0, y0, x1 - x0, y1 - y0, 10).fill(wood);
      if (!port) {
        for (let y = y1 - 6, row = 0; y - SIZE >= y0 - 2; y -= 46, row++) {
          g.rect(x0 + 4, y + 2, x1 - x0 - 8, 3).fill(step);
          for (let x = x0 + 18 + (row % 2) * 8; x <= x1 - 18; x += 30) add(x, y, y, row);
        }
      } else {
        for (let x = x0 + 6, row = 0; x + SIZE <= x1 + 2; x += 46, row++) {
          g.rect(x - 4, y0 + 4, 3, y1 - y0 - 8).fill(step);
          for (let y = y0 + 18 + (row % 2) * 8; y <= y1 - 18; y += 30) add(x, y, -x, row);
        }
      }
    };
    block(714, TS_W - 4, CTRL_Y + 4, TS_H - 2);
    block(4, 104, CTRL_Y + 4, TS_H - 2);
    if (haunted) this.dressHaunted();
    else this.dressSeats();
    this.seats.sort((a, b) => a.depth - b.depth);
    this.filled = 0;
    this.sync();
  }

  /** An empty seat at every place: a fold-down seat in the club's wine, so a thin crowd still reads as stands. */
  private dressSeats() {
    const g = this.bg;
    for (const s of this.seats) {
      if (!this.port) {
        g.roundRect(s.x - 12, s.y - 20, 24, 16, 4).fill(0x4a1838);
        g.roundRect(s.x - 12, s.y - 6, 24, 6, 2).fill(0x5e2048);
        g.rect(s.x - 10, s.y - 18, 20, 2).fill({ color: 0xffffff, alpha: 0.08 });
      } else {
        g.roundRect(s.x + 4, s.y - 12, 16, 24, 4).fill(0x4a1838);
        g.roundRect(s.x, s.y - 12, 6, 24, 2).fill(0x5e2048);
      }
    }
  }

  /** Candles on the tombstones: little flames that flicker, lit whether or not anyone is in. */
  candles: Sprite[] = [];

  /** Tombstones instead of seats, a few crosses, and candles flickering on some. */
  private dressHaunted() {
    const g = this.bg;
    for (const c of this.candles) c.destroy();
    this.candles = [];
    for (const s of this.seats) {
      const h = hash32(`t${s.x}|${s.y}`);
      if (h % 4 === 0) continue;
      const w = 16 + (h % 5);
      const tall = 20 + (h % 8);
      const stone = h % 3 === 0 ? 0x2a2632 : h % 3 === 1 ? 0x332d3c : 0x25212b;
      // drawn upright in local terms: (u along the stone's height, v across)
      const at = (u: number, v: number) => (this.port ? [s.x + u, s.y + v] : [s.x + v, s.y - u]);
      const pts: number[] = [];
      const arc = 8;
      pts.push(...at(0, -w / 2), ...at(tall - w / 2, -w / 2));
      for (let i = 0; i <= arc; i++) {
        const a = Math.PI - (i / arc) * Math.PI;
        pts.push(...at(tall - w / 2 + Math.sin(a) * (w / 2), Math.cos(a) * (w / 2)));
      }
      pts.push(...at(0, w / 2));
      g.poly(pts).fill(stone).stroke({ width: 2, color: 0x07040a });
      if (h % 5 === 1) {
        // a cross on the stone
        const [x1, y1] = at(tall * 0.35, 0);
        const [x2, y2] = at(tall * 0.8, 0);
        const [x3, y3] = at(tall * 0.62, -4);
        const [x4, y4] = at(tall * 0.62, 4);
        g.moveTo(x1, y1).lineTo(x2, y2).moveTo(x3, y3).lineTo(x4, y4).stroke({ width: 2, color: 0x5a5266 });
      } else {
        const [x1, y1] = at(tall * 0.6, -4);
        const [x2, y2] = at(tall * 0.6, 4);
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.5, color: 0x07040a, alpha: 0.7 });
      }
      if (h % 3 === 2) {
        // a candle at the foot of the stone
        const [cx, cy] = at(0, w / 2 + 4);
        const [tx, ty] = at(9, w / 2 + 4);
        g.moveTo(cx, cy).lineTo(tx, ty).stroke({ width: 4, color: 0xe8dcc0 });
        const fl = new Sprite(Texture.WHITE);
        fl.anchor.set(0.5, 1);
        fl.width = 4;
        fl.height = 8;
        fl.tint = 0xffb04a;
        if (this.port) fl.rotation = Math.PI / 2;
        fl.position.set(tx, ty);
        (fl as Sprite & { ph: number }).ph = (h % 100) / 10;
        this.candles.push(fl);
        this.people.addChild(fl);
      }
    }
  }

  /** How many fans are in: the stands fill as your fans grow. */
  level(fans: number) {
    const n = Math.max(10, Math.min(this.seats.length, Math.round(10 + fans * 2.6)));
    this.want = this.haunted ? Math.round(n * 0.35) : n;
    this.sync();
  }

  /** Your kit, for the scarves. */
  setKit(main: number, hi: number) {
    this.kit = { main, hi };
    for (const s of this.seats) {
      if (s.scarf) s.scarf.tint = main;
      if (s.scarf2) s.scarf2.tint = hi;
    }
  }

  /** Seats people up to `want` once the atlas is in; the first ranked seats fill first. */
  private sync() {
    if (!frames.length) {
      void loadCrowd().then(() => {
        if (!this.destroyed && frames.length) this.sync();
      });
      return;
    }
    const order = this.seats.slice().sort((a, b) => a.rank - b.rank);
    order.forEach((s, i) => {
      const on = i < this.want;
      if (on && !s.sp) this.seat(s);
      if (s.sp) s.sp.visible = on;
      if (s.flame) s.flame.visible = on || this.haunted;
    });
    this.filled = Math.min(this.want, order.length);
  }

  private seat(s: Seat) {
    const h = hash32(`v${s.x}|${s.y}`);
    const sp = new Sprite(frames[h % frames.length]);
    sp.anchor.set(0.5, 1);
    sp.width = sp.height = SIZE * (this.port ? 1 : s.depth < 10 ? 0.92 : 1);
    if (h & 1) sp.scale.x *= -1;
    if (this.port) sp.rotation = Math.PI / 2;
    sp.position.set(s.x, s.y);
    if (this.haunted) {
      sp.tint = 0x9fb8d0;
      sp.alpha = 0.72;
    }
    s.sp = sp;
    // a scarf in your kit, held up on a goal
    const scarf = new Sprite(Texture.WHITE);
    scarf.anchor.set(0.5);
    scarf.width = 30;
    scarf.height = 6;
    scarf.tint = this.kit.main;
    scarf.visible = false;
    const scarf2 = new Sprite(Texture.WHITE);
    scarf2.anchor.set(0.5);
    scarf2.width = 8;
    scarf2.height = 6;
    scarf2.tint = this.kit.hi;
    scarf2.visible = false;
    // two hands over the face, on a block
    const hands = new Sprite(Texture.WHITE);
    hands.anchor.set(0.5);
    hands.width = 20;
    hands.height = 7;
    hands.tint = 0xf1dcc0;
    hands.visible = false;
    s.scarf = scarf;
    s.scarf2 = scarf2;
    s.hands = hands;
    this.people.addChild(sp, scarf, scarf2, hands);
    if (this.haunted && h % 2 === 0) {
      const fl = new Sprite(Texture.WHITE);
      fl.anchor.set(0.5, 1);
      fl.width = 4;
      fl.height = 9;
      fl.tint = 0xffb04a;
      s.flame = fl;
      this.people.addChild(fl);
    }
  }

  /** The stands react: a goal of yours, a block on your shot, a goal against. */
  react(m: CrowdMood) {
    this.mood = m;
    this.moodLeft = m === "cheer" ? 3.2 : m === "cover" ? 1.4 : m === "quiet" ? 4 : 0;
    if (m === "cheer") this.energy = 1;
    for (const s of this.seats) {
      if (!s.sp) continue;
      s.sp.tint = this.haunted ? 0x9fb8d0 : m === "quiet" ? 0x8a7d90 : 0xffffff;
    }
  }

  /** Once a frame, in real seconds. Nothing runs while the stands are off screen. */
  frame(t: number, dt: number) {
    if (!this.visible || !frames.length) return;
    if (this.moodLeft > 0) {
      this.moodLeft -= dt;
      if (this.moodLeft <= 0) this.react("idle");
    }
    this.energy = Math.max(0, this.energy - dt * 0.25);
    const rm = reduced();
    const mood = this.mood;
    const port = this.port;
    for (const s of this.seats) {
      const sp = s.sp;
      if (!sp || !sp.visible) {
        if (s.scarf) s.scarf.visible = s.scarf2!.visible = s.hands!.visible = false;
        continue;
      }
      let lift = 0;
      if (!rm) {
        if (mood === "cheer") lift = Math.abs(Math.sin(t * 7 * (s.rate / 1.8) + s.ph)) * 9;
        else if (mood === "quiet") lift = -2;
        else lift = Math.max(0, Math.sin(t * s.rate + s.ph)) * (1.2 + this.energy * 3);
      }
      // "up" is -y on a wide table and +x on the standing one
      const ux = port ? 1 : 0;
      const uy = port ? 0 : -1;
      sp.position.set(s.x + ux * lift, s.y + uy * lift);
      const headX = sp.x + ux * SIZE * 0.98;
      const headY = sp.y + uy * SIZE * 0.98;
      const cheer = mood === "cheer" && !this.haunted;
      s.scarf!.visible = s.scarf2!.visible = cheer;
      if (cheer) {
        const wave = rm ? 0 : Math.sin(t * 9 + s.ph) * 0.35;
        s.scarf!.position.set(headX + ux * 6, headY + uy * 6);
        s.scarf!.rotation = (port ? Math.PI / 2 : 0) + wave;
        s.scarf2!.position.set(s.scarf!.x + (port ? 0 : 11 * Math.cos(wave)), s.scarf!.y + (port ? 11 * Math.cos(wave) : 11 * Math.sin(wave)));
        s.scarf2!.rotation = s.scarf!.rotation;
      }
      const cover = mood === "cover";
      s.hands!.visible = cover;
      if (cover) {
        s.hands!.position.set(sp.x + ux * SIZE * 0.62, sp.y + uy * SIZE * 0.62);
        s.hands!.rotation = port ? Math.PI / 2 : 0;
      }
      if (s.flame) {
        s.flame.position.set(sp.x + ux * 22 + (port ? 0 : 12), sp.y + uy * 22 + (port ? 12 : 0));
        s.flame.rotation = port ? Math.PI / 2 : 0;
        s.flame.alpha = rm ? 0.9 : 0.6 + 0.4 * Math.abs(Math.sin(t * 11 + s.ph * 3));
      }
    }
    for (const c of this.candles) {
      const ph = (c as Sprite & { ph: number }).ph;
      c.alpha = rm ? 0.9 : 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + ph * 3));
      c.scale.y = (rm ? 1 : 0.85 + 0.25 * Math.abs(Math.sin(t * 13 + ph))) * 8;
    }
  }
}
