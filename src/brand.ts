// Brand pack rendered from the game's own pieces: swirl shader, CRT pass, card faces and backs.
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { buildDeck, type Edition } from "../shared/data.js";
import { CardView, CH, CW, txt } from "./cards.js";
import { crtFilter, swirlFilter } from "./fx.js";
import { COL, NUM } from "./theme.js";

async function scene(name: string, w: number, h: number, build: (root: Container, w: number, h: number) => void) {
  const app = new Application();
  await app.init({ width: w, height: h, preference: "webgl", antialias: true, resolution: 1, preserveDrawingBuffer: true, background: 0x12060f });
  app.canvas.id = name;
  document.body.appendChild(app.canvas);
  const bg = new Sprite(Texture.WHITE);
  bg.width = w;
  bg.height = h;
  const sw = swirlFilter();
  sw.u.uTime = 7.3;
  bg.filters = [sw];
  const root = new Container();
  app.stage.addChild(bg, root);
  const crt = crtFilter();
  crt.u.uCurve = 0.35;
  crt.u.uScan = 0.7;
  app.stage.filters = [crt];
  build(root, w, h);
  return app;
}

function logo(text: string, size: number) {
  const c = new Container();
  const back = txt(text, { fontFamily: NUM, fontSize: size, fill: COL.ink });
  const mid = txt(text, { fontFamily: NUM, fontSize: size, fill: COL.mult });
  const front = txt(text, { fontFamily: NUM, fontSize: size, fill: COL.cream });
  for (const t of [back, mid, front]) t.anchor.set(0.5);
  back.position.set(size * 0.1, size * 0.1);
  mid.position.set(size * 0.05, size * 0.05);
  c.addChild(back, mid, front);
  return c;
}


function fan(root: Container, cards: CardView[], cx: number, cy: number, scale: number, spread: number) {
  const n = cards.length;
  cards.forEach((v, i) => {
    const k = n > 1 ? i / (n - 1) - 0.5 : 0;
    v.scale.set(scale);
    v.rotation = k * 0.55;
    v.position.set(cx + k * spread, cy + Math.abs(k) * k * 0 + k * k * spread * 0.35);
    root.addChild(v);
  });
}

async function main() {
  const ed = (await (await fetch("/api/shuffle")).json()) as Edition;
  await document.fonts.load('40px "Jersey 10"');
  const deck = buildDeck(ed, "BRND-0001");
  // a showy hand: one Ace per suit plus a graduated or hot card
  const aces = [0, 1, 2, 3].map((u) => deck.filter((c) => c.suit === u).sort((a, b) => b.rank - a.rank)[0]);
  const extra = deck.find((c) => c.enh === "grad" && !aces.includes(c)) || deck[5];
  const hand = () => [aces[0], aces[1], extra, aces[2], aces[3]].map((c) => new CardView(c));

  const token = (root: Container, w: number, h: number) => {
    const chip = new Graphics();
    const r = w * 0.44;
    chip.circle(0, 0, r).fill(COL.mult).stroke({ width: w * 0.035, color: COL.ink });
    chip.circle(0, 0, r * 0.74).fill(COL.ink2).stroke({ width: w * 0.02, color: COL.cream });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      chip.rect(Math.cos(a) * r * 0.87 - w * 0.03, Math.sin(a) * r * 0.87 - w * 0.03, w * 0.06, w * 0.06).fill(COL.cream);
    }
    chip.position.set(w / 2, h / 2);
    root.addChild(chip);
    const k = logo("K", w * 0.62);
    k.position.set(w / 2 - w * 0.02, h / 2 - w * 0.03);
    root.addChild(k);
  };
  await scene("token-512", 512, 512, token);
  await scene("x-avatar-400", 400, 400, token);

  await scene("x-banner-1500x500", 1500, 500, (root, w, h) => {
    const l = logo("KICKER", 230);
    l.position.set(w * 0.42, h * 0.36);
    root.addChild(l);
    const t = txt("a poker roguelike dealt from live vibe/vibe launches", { fontSize: 30, fill: COL.cream });
    t.anchor.set(0.5);
    t.position.set(w * 0.42, h * 0.66);
    root.addChild(t);
    fan(root, hand(), w * 0.82, h * 0.52, 1.35, 300);
  });

  await scene("og-1200x630", 1200, 630, (root, w, h) => {
    const l = logo("KICKER", 200);
    l.position.set(w * 0.3, h * 0.3);
    root.addChild(l);
    const t = txt("Poker roguelike. Every card is a live\nvibe/vibe launch. Beat my seed.", { fontSize: 32, fill: COL.cream, align: "center", lineHeight: 34 });
    t.anchor.set(0.5);
    t.position.set(w * 0.3, h * 0.6);
    root.addChild(t);
    const chips = txt("CHIPS", { fontFamily: NUM, fontSize: 40, fill: COL.ink });
    const pill = new Graphics().roundRect(-80, -30, 160, 60, 12).fill(COL.chips);
    const pill2 = new Graphics().roundRect(-80, -30, 160, 60, 12).fill(COL.mult);
    const mult = txt("MULT", { fontFamily: NUM, fontSize: 40, fill: COL.cream });
    const x = txt("X", { fontFamily: NUM, fontSize: 44, fill: COL.mult });
    for (const o of [chips, mult, x]) o.anchor.set(0.5);
    const row = new Container();
    pill.position.set(-110, 0);
    chips.position.set(-110, -2);
    pill2.position.set(110, 0);
    mult.position.set(110, -2);
    row.addChild(pill, chips, pill2, mult, x);
    row.position.set(w * 0.3, h * 0.82);
    root.addChild(row);
    fan(root, hand(), w * 0.76, h * 0.5, 1.6, 330);
  });
  (window as unknown as { brandReady: boolean }).brandReady = false;
  setTimeout(() => ((window as unknown as { brandReady: boolean }).brandReady = true), 3500);
  void CW;
  void CH;
}
void main();
