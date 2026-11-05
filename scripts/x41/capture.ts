// KICKER 4.1 X assets, drawn by the game's own club table (src/club/table.ts) and figures, not a mockup.
// ?a=banner (1500x500), ?a=avatar (400x400). Rendered by scripts/x41/render.mjs on the dev server.
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { houseSide, type Side } from "../../shared/club.js";
import type { Launch } from "../../shared/data.js";
import { ClubTable } from "../../src/club/table.js";
import { FigureView, txt } from "../../src/figures.js";
import { crtFilter, swirlFilter } from "../../src/fx.js";
import { BRASS, COL, NUM } from "../../src/theme.js";
import { look } from "../../src/house.js";
import cut from "../edition.json";

const q = new URLSearchParams(location.search);
const kind = q.get("a") || "banner";
const W = kind === "avatar" ? 400 : 1500;
const H = kind === "avatar" ? 400 : 500;
const pool = (cut as { pool: Launch[][] }).pool.flat();
const done = () => ((window as unknown as { x41Ready: boolean }).x41Ready = true);

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

async function boot() {
  await document.fonts.load('64px "Jersey 10"');
  const app = new Application();
  await app.init({ width: W, height: H, preference: "webgl", antialias: true, resolution: 2, autoDensity: true, preserveDrawingBuffer: true, background: 0x12060f });
  document.getElementById("stage")!.appendChild(app.canvas);
  if (kind === "avatar") return avatar(app);
  // two house clubs from the real cut on the real table, the camera in close on the middle of the pitch
  const home: Side = houseSide(pool, 7, 3, 2);
  const away: Side = houseSide(pool, 7, 3, 5);
  const t = new ClubTable(app);
  t.setSides(home, away);
  // the table is 1000 x 810 in its own units: scale it to the banner's width and slide it up so the felt fills it
  const k = W / 1000;
  t.fit({ x: 0, y: H / 2 - (46 + 339) * k, w: W, h: 810 * k });
  t.crowd(0.8, "cheer");
  t.say("", "flat");
  t.desk.visible = false;
  // a plate in the middle third for the wordmark and the line (clear of the avatar at bottom-left, and of a phone's crop)
  const plate = new Graphics();
  plate.roundRect(-330, -118, 660, 236, 22).fill({ color: 0x12060f, alpha: 0.86 }).stroke({ width: 4, color: BRASS.hi, alpha: 0.75 });
  plate.roundRect(-318, -106, 636, 212, 16).stroke({ width: 2, color: 0x7a5a1c, alpha: 0.9 });
  const ui = new Container();
  ui.position.set(W / 2, H / 2 - 18);
  ui.addChild(plate);
  const lg = logo("KICKER", 150);
  lg.position.set(0, -30);
  ui.addChild(lg);
  const club = txt("CLUB", { fontFamily: NUM, fontSize: 40, fill: COL.money, letterSpacing: 10 });
  club.anchor.set(0.5);
  club.position.set(0, 50);
  const line = txt("Eleven live launches on brass rods. You make the calls.", { fontFamily: NUM, fontSize: 28, fill: COL.cream });
  line.anchor.set(0.5);
  line.position.set(0, 88);
  ui.addChild(club, line);
  app.stage.addChild(ui);
  // let the faces load and the crowd fill in
  setTimeout(done, 6000);
}

function avatar(app: Application) {
  const bg = new Sprite(Texture.WHITE);
  bg.width = W;
  bg.height = H;
  const sw = swirlFilter();
  sw.u.uTime = 5.1;
  bg.filters = [sw];
  app.stage.addChild(bg);
  const lk = look();
  const g = new Graphics();
  // the felt disc, a brass ring, the rod straight through
  g.circle(W / 2, H / 2, 188).fill(BRASS.wood);
  g.circle(W / 2, H / 2, 172).fill(lk.felt);
  g.circle(W / 2, H / 2, 150).stroke({ width: 4, color: COL.cream, alpha: 0.16 });
  g.rect(W / 2 - 13, H / 2 - 180, 26, 360).fill(BRASS.bar);
  g.rect(W / 2 - 13, H / 2 - 180, 8, 360).fill({ color: BRASS.hi, alpha: 0.75 });
  g.rect(W / 2 + 6, H / 2 - 180, 7, 360).fill({ color: BRASS.lo, alpha: 0.75 });
  app.stage.addChild(g);
  // one man on the rod, in the house wine and gold, no face picture (it would be a smudge at 48px)
  const f = new FigureView(0, null, 0, "you");
  f.scale.set(3.6);
  f.position.set(W / 2, H / 2);
  app.stage.addChild(f);
  const crt = crtFilter();
  crt.u.uCurve = 0.2;
  crt.u.uScan = 0.5;
  app.stage.filters = [crt];
  setTimeout(done, 800);
}
void boot();
