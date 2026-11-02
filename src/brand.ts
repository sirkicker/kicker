// Brand pack rendered from the game's own pieces: swirl shader, CRT pass, figures on a brass rod, the felt.
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { buildSquad, type Edition } from "../shared/data.js";
import { FigureView, txt } from "./figures.js";
import { crtFilter, swirlFilter } from "./fx.js";
import { BRASS, COL, NUM } from "./theme.js";
import { look } from "./house.js";

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
  const mid = txt(text, { fontFamily: NUM, fontSize: size, fill: COL.pink });
  const front = txt(text, { fontFamily: NUM, fontSize: size, fill: COL.cream });
  for (const t of [back, mid, front]) t.anchor.set(0.5);
  back.position.set(size * 0.1, size * 0.1);
  mid.position.set(size * 0.05, size * 0.05);
  c.addChild(back, mid, front);
  return c;
}

/** A strip of felt with a brass rod across it and figures on the rod, turned so the rod runs left to right. */
function rodRow(root: Container, figs: FigureView[], cx: number, cy: number, scale: number, gap: number) {
  const n = figs.length;
  const w = gap * (n - 1) + 160;
  const strip = new Graphics();
  strip.roundRect(-w / 2 - 18, -86, w + 36, 172, 26).fill(BRASS.wood);
  strip.roundRect(-w / 2, -70, w, 140, 16).fill(look().felt);
  strip.rect(-w / 2 - 40, -5, w + 80, 10).fill(BRASS.bar);
  strip.rect(-w / 2 - 40, -5, w + 80, 3).fill({ color: BRASS.hi, alpha: 0.7 });
  const c = new Container();
  c.addChild(strip);
  figs.forEach((f, i) => {
    f.rotation = -Math.PI / 2;
    if (f.tag) {
      f.tag.rotation = Math.PI / 2;
      f.tag.position.set(-30, 0);
    }
    f.position.set(-((n - 1) * gap) / 2 + i * gap, 0);
    c.addChild(f);
  });
  c.scale.set(scale);
  c.position.set(cx, cy);
  root.addChild(c);
}

async function main() {
  const ed = (await (await fetch("/api/shuffle")).json()) as Edition;
  await document.fonts.load('40px "Jersey 10"');
  const squad = buildSquad(ed, "BRND-0004");
  const five = () => [squad[8], squad[3], squad[9], squad[5], squad[10]].map((l) => new FigureView(0, l));
  // wait for the token pictures to land on the heads
  await new Promise((r) => setTimeout(r, 1500));

  const token = (root: Container, w: number, h: number) => {
    const g = new Graphics();
    const r = w * 0.44;
    g.circle(0, 0, r).fill(look().felt).stroke({ width: w * 0.035, color: COL.ink });
    g.circle(0, 0, r * 0.9).stroke({ width: w * 0.012, color: COL.cream, alpha: 0.3 });
    g.rect(-r, -w * 0.02, r * 2, w * 0.04).fill(BRASS.bar);
    // a figure from above: shoulders across the rod, a boot, the head
    g.roundRect(-w * 0.075, -w * 0.22, w * 0.15, w * 0.44, w * 0.06).fill(COL.ink);
    g.roundRect(-w * 0.06, -w * 0.205, w * 0.12, w * 0.41, w * 0.05).fill(look().kit);
    g.roundRect(w * 0.05, -w * 0.05, w * 0.1, w * 0.1, w * 0.03).fill(COL.money).stroke({ width: w * 0.012, color: COL.ink });
    g.circle(0, 0, w * 0.2).fill(COL.ink);
    g.circle(0, 0, w * 0.175).fill(COL.cream);
    g.position.set(w / 2, h / 2);
    root.addChild(g);
    const k = logo("K", w * 0.36);
    k.position.set(w / 2 - w * 0.012, h / 2 - w * 0.02);
    root.addChild(k);
  };
  await scene("token-512", 512, 512, token);
  await scene("x-avatar-400", 400, 400, token);

  await scene("x-banner-1500x500", 1500, 500, (root, w, h) => {
    const l = logo("KICKER", 230);
    l.position.set(w * 0.33, h * 0.36);
    root.addChild(l);
    const t = txt("turn-based table football, live vibe/vibe launches on the rods", { fontSize: 20, fill: COL.cream });
    t.anchor.set(0.5);
    t.position.set(w * 0.33, h * 0.66);
    root.addChild(t);
    rodRow(root, five(), w * 0.8, h * 0.52, 1.8, 44);
  });

  await scene("og-1200x630", 1200, 630, (root, w, h) => {
    const l = logo("KICKER", 170);
    l.position.set(w * 0.25, h * 0.27);
    root.addChild(l);
    const t = txt("Turn-based table football.\nEvery figure is a live\nvibe/vibe launch. Beat my seed.", { fontSize: 21, fill: COL.cream, align: "center", lineHeight: 26 });
    t.anchor.set(0.5);
    t.position.set(w * 0.25, h * 0.57);
    root.addChild(t);
    const row = new Container();
    const pills: [string, number, number][] = [
      ["POWER", COL.pink, COL.cream],
      ["PACE", COL.cyan, COL.ink],
      ["GRIP", COL.money, COL.ink],
    ];
    pills.forEach(([word, bg, fg], i) => {
      const p = new Graphics().roundRect(-66, -28, 132, 56, 12).fill(bg).stroke({ width: 4, color: COL.ink });
      const s = txt(word, { fontFamily: NUM, fontSize: 36, fill: fg });
      s.anchor.set(0.5);
      p.position.set((i - 1) * 150, 0);
      s.position.set((i - 1) * 150, -2);
      row.addChild(p, s);
    });
    row.scale.set(0.85);
    row.position.set(w * 0.25, h * 0.82);
    root.addChild(row);
    rodRow(root, five(), w * 0.745, h * 0.5, 1.9, 44);
  });
  (window as unknown as { brandReady: boolean }).brandReady = false;
  setTimeout(() => ((window as unknown as { brandReady: boolean }).brandReady = true), 3500);
}
void main();
