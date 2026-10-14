// Card drawing: launch cards, insider cards, move cards, card backs, plus token-art loading.
import { Container, Graphics, Sprite, Text, Texture, type TextStyleOptions } from "pixi.js";
import { RANK_LABEL, facePath, type Card } from "../shared/data.js";
import { INSIDER, INSIDER_VIBER, MOVE, HAND, type HandId } from "../shared/content.js";
import { hash32 } from "../shared/rng.js";
import { COL, ENH_COL, FONT, NUM, SUIT_FACE } from "./theme.js";
import { look } from "./house.js";

export const CW = 112;
const SHORT_Q: Keyed<string, string> = { VIBEVIBE: "VIBE", ANTHROPIC: "ANTH", OPENAI: "OAI" };
export const CH = 156;

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

// ------------------------------------------------------------ suit glyphs
export function suitGlyph(g: Graphics, u: number, x: number, y: number, s: number, color: number) {
  const h = s / 2;
  if (u === 0) g.poly([x, y - h, x + h * 0.8, y, x, y + h, x - h * 0.8, y]).fill(color);
  else if (u === 1) g.poly([x, y - h, x + h, y + h * 0.8, x - h, y + h * 0.8]).fill(color);
  else if (u === 2) g.circle(x, y, h * 0.9).fill(color);
  else g.rect(x - h * 0.8, y - h * 0.8, h * 1.6, h * 1.6).fill(color);
}

// ------------------------------------------------------------ launch card
export class CardView extends Container {
  body = new Container();
  shadow = new Graphics();
  glow = new Graphics();
  face = new Container();
  back = new Container();
  art = new Sprite(Texture.EMPTY);
  debuffMark = new Graphics();
  selected = false;
  baseY = 0;
  hover = 0;
  wob = Math.random() * 6.28;
  flipped = false;

  constructor(public card: Card) {
    super();
    this.shadow.roundRect(-CW / 2 + 5, -CH / 2 + 7, CW, CH, 10).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    this.body.addChild(this.glow, this.face, this.back, this.debuffMark);
    this.drawBack();
    this.back.visible = false;
    this.redraw();
    this.eventMode = "static";
    this.cursor = "pointer";
  }

  redraw() {
    const c = this.card;
    const f = this.face;
    f.removeChildren().forEach((ch) => ch.destroy());
    const col = SUIT_FACE[c.suit];
    const g = new Graphics();
    g.roundRect(-CW / 2, -CH / 2, CW, CH, 10).fill(COL.ink);
    g.roundRect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, CH - 8, 7).fill(COL.cream);
    // enhancement frame
    if (c.enh) {
      const ec = ENH_COL[c.enh];
      g.roundRect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, CH - 8, 7).stroke({ width: 3, color: ec });
    }
    // art frame
    g.rect(-34, -40, 68, 68).fill(COL.ink);
    f.addChild(g);
    this.art = new Sprite(Texture.EMPTY);
    this.art.anchor.set(0.5);
    this.art.position.set(0, -6);
    this.art.width = 64;
    this.art.height = 64;
    f.addChild(this.art);
    tokenTexture(c.l.c, c.l.s, (t) => {
      if (this.art.destroyed) return;
      this.art.texture = t;
      this.art.width = 64;
      this.art.height = 64;
      if (t === Texture.WHITE) this.art.tint = col;
    });
    const rk = txt(RANK_LABEL(c.rank), { fontFamily: NUM, fontSize: 34, fill: col });
    rk.anchor.set(0.5, 0);
    rk.position.set(-CW / 2 + 17, -CH / 2 + 3);
    f.addChild(rk);
    const sg = new Graphics();
    suitGlyph(sg, c.suit, -CW / 2 + 17, -CH / 2 + 45, 13, col);
    suitGlyph(sg, c.suit, CW / 2 - 17, CH / 2 - 45, 13, col);
    f.addChild(sg);
    const rk2 = txt(RANK_LABEL(c.rank), { fontFamily: NUM, fontSize: 34, fill: col });
    rk2.anchor.set(0.5, 0);
    rk2.rotation = Math.PI;
    rk2.position.set(CW / 2 - 17, CH / 2 - 3);
    f.addChild(rk2);
    // quote badge
    const q = c.bridged ? "BRIDGE" : (SHORT_Q[c.q] ?? c.q.slice(0, 5));
    const qt = txt(q, { fontSize: 12, fill: COL.cream, fontWeight: "700" });
    qt.anchor.set(0.5);
    const qw = Math.max(30, qt.width + 8);
    const qb = new Graphics().roundRect(CW / 2 - 8 - qw, -CH / 2 + 9, qw, 17, 4).fill(col);
    qt.position.set(CW / 2 - 8 - qw / 2, -CH / 2 + 17.5);
    f.addChild(qb, qt);
    // ticker
    const sym = txt("$" + c.l.s.slice(0, 9), { fontSize: c.l.s.length > 7 ? 11 : 13, fill: COL.ink, fontWeight: "700" });
    sym.anchor.set(0.5);
    sym.position.set(0, 42);
    f.addChild(sym);
    // enhancement sticker
    if (c.enh) {
      const label = { grad: "GRAD", hot: "HOT", pump: "PUMP", dip: "DIP" }[c.enh];
      const et = txt(label, { fontSize: 10, fill: COL.ink, fontWeight: "700" });
      et.anchor.set(0.5);
      const ew = et.width + 10;
      const eb = new Graphics().roundRect(-ew / 2, 52, ew, 14, 3).fill(ENH_COL[c.enh]);
      et.position.set(0, 59);
      f.addChild(eb, et);
    }
    this.drawGlow();
  }

  drawGlow() {
    this.glow.clear();
    if (this.selected) this.glow.roundRect(-CW / 2 - 5, -CH / 2 - 5, CW + 10, CH + 10, 13).fill({ color: COL.chips, alpha: 0.9 });
  }

  setDebuffed(on: boolean) {
    this.debuffMark.clear();
    if (!on) return;
    this.debuffMark.roundRect(-CW / 2, -CH / 2, CW, CH, 10).fill({ color: 0x12030d, alpha: 0.55 });
    this.debuffMark.moveTo(-30, -30).lineTo(30, 30).moveTo(30, -30).lineTo(-30, 30).stroke({ width: 8, color: COL.bad, cap: "round" });
  }

  /** The back follows the table's look (house colours are cosmetic only). */
  drawBack() {
    this.back.removeChildren().forEach((ch) => ch.destroy());
    const lk = look();
    const g = new Graphics();
    g.roundRect(-CW / 2, -CH / 2, CW, CH, 10).fill(COL.ink);
    g.roundRect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, CH - 8, 7).fill(lk.back);
    for (let y = -CH / 2 + 10; y < CH / 2 - 10; y += 12)
      for (let x = -CW / 2 + 10; x < CW / 2 - 10; x += 12) if (((x + y) / 12) % 2 === 0) g.rect(x, y, 6, 6).fill({ color: lk.dots, alpha: lk.dotsAlpha });
    if (lk.id !== "house") g.roundRect(-CW / 2 + 8, -CH / 2 + 8, CW - 16, CH - 16, 5).stroke({ width: 2, color: lk.frame, alpha: 0.7 });
    g.roundRect(-26, -26, 52, 52, 6).fill(COL.ink).stroke({ width: 3, color: lk.frame });
    this.back.addChild(g);
    const k = txt("K", { fontFamily: NUM, fontSize: 44, fill: lk.frame });
    k.anchor.set(0.5);
    k.position.set(0, -2);
    this.back.addChild(k);
  }

  showBack(on: boolean) {
    this.flipped = on;
    this.back.visible = on;
    this.face.visible = !on;
  }

  setSelected(on: boolean) {
    this.selected = on;
    this.drawGlow();
  }
}

// ------------------------------------------------------------ insider portraits
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
      if (y <= 3 && head(x, y + 1) && (bit || y <= 2)) c = (h & 4) ? accent : dark; // hair/hat
      if (y === 5 && x === 3) c = COL.ink; // eyes
      if (y === 6 && x === 3 && h & 8) c = 0xffffff;
      if (y === 8 && x >= 4) c = (h & 16) ? COL.ink : dark; // mouth
      if (y >= 10 && x >= 1) c = accent; // collar
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

export class InsiderView extends Container {
  shadow = new Graphics();
  body = new Container();
  baseY = 0;
  wob = Math.random() * 6.28;
  constructor(public insiderId: string, public value = 0) {
    super();
    const d = INSIDER[insiderId];
    this.shadow.roundRect(-CW / 2 + 5, -CH / 2 + 7, CW, CH, 10).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const g = new Graphics();
    g.roundRect(-CW / 2, -CH / 2, CW, CH, 10).fill(COL.ink);
    g.roundRect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, CH - 8, 7).fill(hsl(d.hue, 0.45, 0.24));
    g.rect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, 14).fill(RARE_COL[d.rarity]);
    this.body.addChild(g);
    // a soft spotlight disc behind the character
    const disc = new Graphics().circle(0, -12, 40).fill({ color: hsl(d.hue, 0.6, 0.45), alpha: 0.35 });
    this.body.addChild(disc);
    const p = portrait(d.id, d.hue, 6);
    p.position.set(0, -10);
    this.body.addChild(p);
    const vb = INSIDER_VIBER[d.id];
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
    const nm = txt(d.name, { fontSize: d.name.length > 12 ? 11 : 13, fill: COL.cream, fontWeight: "700", align: "center", wordWrap: true, wordWrapWidth: CW - 14 });
    nm.anchor.set(0.5);
    nm.position.set(0, 50);
    this.body.addChild(nm);
    const tag = txt("INSIDER", { fontSize: 9, fill: COL.ink, fontWeight: "700" });
    tag.anchor.set(0.5);
    tag.position.set(0, -CH / 2 + 11);
    this.body.addChild(tag);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}

export class ItemView extends Container {
  shadow = new Graphics();
  body = new Container();
  baseY = 0;
  wob = Math.random() * 6.28;
  constructor(public kind: "alpha" | "move", public itemId: string) {
    super();
    this.shadow.roundRect(-CW / 2 + 5, -CH / 2 + 7, CW, CH, 10).fill({ color: 0x000000, alpha: 0.38 });
    this.addChild(this.shadow, this.body);
    const g = new Graphics();
    const tone = kind === "alpha" ? 0x0f4a50 : 0x4a1240;
    const band = kind === "alpha" ? COL.chips : COL.money;
    g.roundRect(-CW / 2, -CH / 2, CW, CH, 10).fill(COL.ink);
    g.roundRect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, CH - 8, 7).fill(tone);
    g.rect(-CW / 2 + 4, -CH / 2 + 4, CW - 8, 14).fill(band);
    // emblem
    const e = new Graphics();
    if (kind === "alpha") {
      e.poly([0, -36, 10, -12, 34, -12, 14, 2, 22, 26, 0, 12, -22, 26, -14, 2, -34, -12, -10, -12]).fill(COL.money).stroke({ width: 3, color: COL.ink });
    } else {
      e.roundRect(-26, -32, 52, 52, 8).fill(COL.ink).stroke({ width: 3, color: band });
      e.poly([-8, -22, 10, -6, -2, -4, 8, 12, -12, -6, 0, -8]).fill(band);
    }
    e.position.set(0, -6);
    this.body.addChild(g, e);
    const name = kind === "alpha" ? HAND[itemId as HandId].name : MOVE[itemId].name;
    const nm = txt(name, { fontSize: name.length > 12 ? 11 : 13, fill: COL.cream, fontWeight: "700", align: "center", wordWrap: true, wordWrapWidth: CW - 14 });
    nm.anchor.set(0.5);
    nm.position.set(0, 50);
    const tag = txt(kind === "alpha" ? "ALPHA LEAK" : "MOVE", { fontSize: 9, fill: COL.ink, fontWeight: "700" });
    tag.anchor.set(0.5);
    tag.position.set(0, -CH / 2 + 11);
    this.body.addChild(nm, tag);
    this.eventMode = "static";
    this.cursor = "pointer";
  }
}
