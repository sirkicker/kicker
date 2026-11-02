// The table: everything drawn in Pixi. State lives in the shared engine; this file shows it and plays back
// what the engine says happened (slides, kicks, blocks, goals), one event at a time.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { BOSS, COACH, DRILL, DRILLS, FIXTURE_NAME, LANES, MAX_COACHES, MAX_PLAYS, MOUTH, PLAY, RARITY_NAME, RODS, ROUNDS, WIN_FANS, drillCost, type DrillId } from "../shared/content.js";
import { colOf, laneOf, slotOf, type Action, type Dir, type Ev, type Kick, type Run } from "../shared/engine.js";
import { bestBlock, bestTouch } from "../shared/bot.js";
import { figureFacts, roomHint } from "../shared/insight.js";
import { sfx } from "./audio.js";
import { setUi, toast, ui } from "./store.js";
import { CoachView, FR, FigureView, ItemView, PH, PW, hslHex, tokenTexture, txt } from "./figures.js";
import { crtFilter, setSwirlColors, swirlFilter, type FxFilter } from "./fx.js";
import { BRASS, COL, NUM, THEM } from "./theme.js";
import { look } from "./house.js";
import { ease, reduced, tween, wait } from "./tween.js";
import { Button, Tip, fmt, panel } from "./widgets.js";

type Mode = "land" | "port";
interface Layout {
  mode: Mode;
  W: number;
  H: number;
  /** Where the table (or a stage panel) sits, in root units. */
  area: { x: number; y: number; w: number; h: number };
  coachX: number;
  coachY: number;
  coachStep: number;
  coachScale: number;
  playX: number;
  playY: number;
  playStep: number;
  btnY: number;
  btnX: number;
}

export interface GameHooks {
  onAction(a: Action, run: Run): void;
  onOver(run: Run): void;
  openOverlay(o: "squad" | "options" | "how" | "boss"): void;
}

// ------------------------------------------------------------ table space (drawn flat, turned upright on phones)
const TX0 = 74; // your goal line
const TX1 = 926; // theirs
const LH = 47; // one lane
const LANE0 = 52; // top edge of lane 0
const PITCH_H = LANES * LH;
const RAIL = 22;
const CTRL_Y = LANE0 + PITCH_H + RAIL + 18; // your rod controls, below the rod ends
const ARROW_W = 84;
const ARROW_H = 58;
const TS_W = 1000;
const TS_H = CTRL_Y + ARROW_H * 2 + 26;
const colX = (x: number) => TX0 + (x * (TX1 - TX0)) / 9;
const laneY = (l: number) => LANE0 + (l + 0.5) * LH;

/** Continuous mirror of a lane off the side walls (walls sit half a lane outside lanes 0 and 9). */
function mirror(v: number): number {
  const p = 2 * LANES;
  const m = (((v + 0.5) % p) + p) % p;
  return m < LANES ? m - 0.5 : p - 0.5 - m;
}

interface RodView {
  c: Container;
  bar: Graphics;
  figs: FigureView[];
}

export class Game {
  root = new Container();
  bg = new Sprite(Texture.WHITE);
  swirl: FxFilter;
  crt: FxFilter;
  hud = new Container();
  tbl = new Container();
  pitch = new Graphics();
  mark = new Container();
  rodLayer = new Container();
  rodMask = new Graphics();
  rail = new Graphics();
  knobLayer = new Container();
  guideLayer = new Container();
  ballLayer = new Container();
  ctrlLayer = new Container();
  fxLayer = new Container();
  benchLayer = new Container();
  stageLayer = new Container();
  tipLayer = new Container();
  tip = new Tip();
  ball = new Graphics();
  trail: Graphics[] = [];
  L!: Layout;
  run: Run | null = null;
  rods: RodView[][] = [[], []];
  disp: { off: number[][]; ball: { side: 0 | 1; rod: number; fig: number } | null } = { off: [[], []], ball: null };
  ballFree: { x: number; y: number } | null = null;
  busy = false;
  shake = 0;
  heat = 0;
  t = 0;
  coachViews: CoachView[] = [];
  playViews: ItemView[] = [];
  synFocus: string | null = null;
  tipPinned = false;
  hoverKick: number | null = null;
  // hud parts
  clubName!: Text;
  clubRule!: Text;
  scoreYou!: Text;
  scoreThem!: Text;
  possText!: Text;
  touchText!: Text;
  pips = new Graphics();
  stat: Keyed<string, Text> = {};
  chalText!: Text;
  btnReady!: Button;
  btnHint!: Button;
  benchLabel!: Text;
  particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];

  constructor(
    public app: Application,
    public hooks: GameHooks,
  ) {
    this.swirl = swirlFilter();
    this.calmSwirl();
    this.crt = crtFilter();
    this.bg.filters = [this.swirl];
    app.stage.addChild(this.bg, this.root);
    this.root.addChild(this.hud, this.tbl, this.benchLayer, this.stageLayer, this.tipLayer);
    this.root.visible = false;
    this.rodLayer.mask = this.rodMask;
    this.tbl.addChild(this.pitch, this.mark, this.rodMask, this.rodLayer, this.rail, this.knobLayer, this.guideLayer, this.ballLayer, this.ctrlLayer, this.fxLayer);
    this.ballLayer.addChild(this.ball);
    this.tipLayer.addChild(this.tip);
    app.stage.filters = [this.crt];
    this.crt.resolution = Math.min(2, window.devicePixelRatio || 1);
    app.stage.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointertap", (e) => {
      if (e.target === app.stage || e.target === this.bg) this.tip.hide();
    });
    app.ticker.add((tk) => this.frame(tk.deltaMS));
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (e) => this.key(e));
    const drop = () => {
      if (this.tip.visible) this.tip.hide();
    };
    window.addEventListener("wheel", drop, { passive: true });
    window.addEventListener("scroll", drop, { passive: true, capture: true });
    this.resize();
  }

  // ================================================================ frame loop
  frame(dt: number) {
    const rm = reduced();
    this.t += dt / 1000;
    this.heat = Math.max(0, this.heat - dt / 2500);
    this.swirl.u.uTime = rm ? 4 : this.t;
    this.swirl.u.uHeat = rm ? 0 : this.heat;
    this.crt.u.uTime = rm ? 0 : this.t;
    this.shake = Math.max(0, this.shake - dt / 300);
    const s = this.L ? this.app.screen.width / this.L.W : 1;
    if (this.shake > 0 && !rm) {
      this.root.position.set((Math.random() - 0.5) * this.shake * 12 * s, (Math.random() - 0.5) * this.shake * 12 * s);
      this.crt.u.uShake = this.shake;
    } else {
      this.root.position.set(0, 0);
      this.crt.u.uShake = 0;
    }
    if (!rm) {
      for (const v of [...this.coachViews, ...this.playViews]) {
        v.body.y = Math.sin(this.t * 1.4 + v.wob) * 2;
        v.body.rotation = Math.sin(this.t * 0.9 + v.wob) * 0.02;
      }
    }
    // the held ball rides with its figure
    if (!this.ballFree) this.placeBall();
    for (const p of this.particles) {
      p.vy += 0.35;
      p.g.x += p.vx;
      p.g.y += p.vy;
      p.life -= dt;
      p.g.alpha = Math.max(0, p.life / 700);
    }
    const dead = this.particles.filter((p) => p.life <= 0);
    for (const p of dead) p.g.destroy();
    if (dead.length) this.particles = this.particles.filter((p) => p.life > 0);
  }

  calmSwirl() {
    const [a, b, c] = look().swirl;
    setSwirlColors(this.swirl, a, b, c);
  }

  /** Re-dress the table after house colours change. Cosmetic only: the season itself is untouched. */
  applyLook() {
    if (!(this.run && this.run.s.match && this.run.s.match.boss)) this.calmSwirl();
    this.resize();
  }

  // ================================================================ layout
  get port() {
    return this.L.mode === "port";
  }

  resize() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    this.app.renderer.resize(sw, sh);
    const ar = sw / sh;
    const mode: Mode = ar >= 1.05 ? "land" : "port";
    let W: number, H: number;
    if (mode === "land") {
      W = Math.max(1400, 900 * ar);
      H = W / ar;
    } else {
      W = Math.max(720, 1280 * ar);
      H = W / ar;
    }
    this.root.scale.set(sw / W);
    this.bg.width = sw;
    this.bg.height = sh;
    this.app.stage.filterArea = new Rectangle(0, 0, sw, sh);
    this.app.stage.hitArea = new Rectangle(0, 0, sw, sh);
    if (mode === "land") {
      const left = 380;
      this.L = {
        mode,
        W,
        H,
        area: { x: left, y: 186, w: W - left - 20, h: H - 186 - 92 },
        coachX: left + 58,
        coachY: 100,
        coachStep: 100,
        coachScale: 0.74,
        playX: W - 210,
        playY: 100,
        playStep: 92,
        btnY: H - 52,
        btnX: (left + W - 20) / 2,
      };
    } else {
      const top = 248;
      const bench = 118;
      this.L = {
        mode,
        W,
        H,
        area: { x: 12, y: top + bench, w: W - 24, h: H - top - bench - 108 },
        coachX: 54,
        coachY: top + bench / 2 - 2,
        coachStep: 74,
        coachScale: 0.56,
        playX: W - 128,
        playY: top + bench / 2 - 2,
        playStep: 72,
        btnY: H - 56,
        btnX: W / 2,
      };
    }
    this.buildHud();
    this.buildTable();
    this.placeTable();
    if (this.run) this.refreshAll();
  }

  /** Fits the flat table into its area; on phones it stands upright (your goal at the bottom, your rods' ends on the right). */
  placeTable() {
    const a = this.L.area;
    const tw = this.port ? TS_H : TS_W;
    const th = this.port ? TS_W : TS_H;
    const k = Math.min(a.w / tw, a.h / th);
    this.tbl.scale.set(k);
    if (this.port) {
      this.tbl.rotation = -Math.PI / 2;
      this.tbl.position.set(a.x + (a.w - tw * k) / 2, a.y + (a.h - th * k) / 2 + th * k);
    } else {
      this.tbl.rotation = 0;
      this.tbl.position.set(a.x + (a.w - tw * k) / 2, a.y + (a.h - th * k) / 2);
    }
  }

  /** Text inside the table stays upright on screen whichever way the table is turned. */
  upright(o: Container) {
    o.rotation = this.port ? Math.PI / 2 : 0;
  }

  // ================================================================ HUD
  buildHud() {
    const L = this.L;
    this.hud.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.stat = {};
    const port = this.port;
    const mk = (x: number, y: number, w: number, h: number, fill = COL.panel, edge = COL.edge) => {
      const p = panel(w, h, fill, edge);
      p.position.set(x, y);
      this.hud.addChild(p);
      return p;
    };
    const label = (s: string, x: number, y: number, size = 15, color = COL.dim, anchor = 0.5) => {
      const t = txt(s, { fontSize: size, fill: color });
      t.anchor.set(anchor, 0.5);
      t.position.set(x, y);
      this.hud.addChild(t);
      return t;
    };
    const big = (x: number, y: number, size: number, color: number) => {
      const t = txt("0", { fontFamily: NUM, fontSize: size, fill: color, stroke: { color: COL.ink, width: 6 } });
      t.anchor.set(0.5);
      t.position.set(x, y);
      this.hud.addChild(t);
      return t;
    };
    this.pips = new Graphics();
    if (!port) {
      mk(20, 20, 340, L.H - 40, COL.ink2, COL.edge);
      // the bench band above the table
      mk(L.area.x, 14, L.W - L.area.x - 20, 160, COL.ink, COL.edge).alpha = 0.7;
      this.clubName = label("", 190, 56, 26, COL.cream);
      this.clubRule = txt("", { fontSize: 14, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: 300, lineHeight: 18 });
      this.clubRule.anchor.set(0.5, 0);
      this.clubRule.position.set(190, 80);
      this.hud.addChild(this.clubRule);
      // score
      mk(36, 150, 308, 104, COL.ink, COL.edge);
      label("YOU", 104, 172, 14, COL.dim);
      label("THEM", 276, 172, 14, COL.dim);
      this.scoreYou = big(104, 214, 62, look().kitHi);
      this.scoreThem = big(276, 214, 62, THEM.hi);
      label(":", 190, 208, 40, COL.dim);
      // the possession: whose ball, touches as pips
      mk(36, 268, 308, 128, COL.ink, COL.edge);
      this.possText = label("", 190, 292, 18, COL.cream);
      this.touchText = label("", 190, 372, 14, COL.dim);
      this.pips.position.set(190, 330);
      this.hud.addChild(this.pips);
      const stats: [string, string, number][] = [
        ["round", "Round", COL.cream],
        ["fans", "Fans", COL.money],
        ["goals", "Goals", look().kitHi],
        ["wins", "Wins", COL.cyan],
      ];
      stats.forEach(([k, name, color], i) => {
        const x = 36 + (i % 2) * 156;
        const y = 410 + Math.floor(i / 2) * 82;
        mk(x, y, 152, 72, COL.ink, COL.edge);
        label(name, x + 76, y + 16, 13);
        const v = txt("-", { fontFamily: NUM, fontSize: 40, fill: color });
        v.anchor.set(0.5);
        v.position.set(x + 76, y + 46);
        this.hud.addChild(v);
        this.stat[k] = v;
      });
      const by = Math.min(L.H - 70, 650);
      const b1 = new Button("Squad", 96, 54, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 18 });
      b1.position.set(36 + 48, by);
      const b2 = new Button("Rules", 96, 54, COL.neutral, () => this.hooks.openOverlay("how"), { size: 18 });
      b2.position.set(36 + 48 + 106, by);
      const b3 = new Button("Menu", 96, 54, COL.neutral, () => this.hooks.openOverlay("options"), { size: 18 });
      b3.position.set(36 + 48 + 212, by);
      this.hud.addChild(b1, b2, b3);
      this.chalText = txt("", { fontSize: 14, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: 300 });
      this.chalText.anchor.set(0.5, 0);
      this.chalText.position.set(190, by + 40);
      this.hud.addChild(this.chalText);
      this.benchLabel = label("", L.area.x + 18, 28, 14, COL.dim, 0);
    } else {
      const W = L.W;
      // row 1: the club and its rule, the score
      mk(16, 16, W * 0.6, 122, COL.ink2, COL.edge);
      this.clubName = label("", 16 + W * 0.3, 40, 22, COL.cream);
      this.clubRule = txt("", { fontSize: 13, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: W * 0.56, lineHeight: 17 });
      this.clubRule.anchor.set(0.5, 0);
      this.clubRule.position.set(16 + W * 0.3, 58);
      this.hud.addChild(this.clubRule);
      const sx = 28 + W * 0.6;
      const swd = W - sx - 16;
      mk(sx, 16, swd, 122, COL.ink2, COL.edge);
      label("YOU", sx + swd * 0.25, 36, 13);
      label("THEM", sx + swd * 0.75, 36, 13);
      this.scoreYou = big(sx + swd * 0.25, 86, 58, look().kitHi);
      this.scoreThem = big(sx + swd * 0.75, 86, 58, THEM.hi);
      label(":", sx + swd / 2, 80, 36, COL.dim);
      // row 2: the possession
      mk(16, 150, W - 32, 88, COL.ink, COL.edge);
      this.possText = label("", 32, 176, 17, COL.cream, 0);
      this.touchText = label("", 32, 212, 13, COL.dim, 0);
      this.pips.position.set(W - 150, 194);
      this.hud.addChild(this.pips);
      this.stat.round = txt("", { fontSize: 1 });
      this.stat.fans = label("", W - 32, 176, 15, COL.money, 1);
      this.stat.goals = txt("", { fontSize: 1 });
      this.stat.wins = txt("", { fontSize: 1 });
      this.benchLabel = label("", 18, L.coachY - 52, 13, COL.dim, 0);
      this.chalText = txt("", { fontSize: 13, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: W - 360 });
      this.chalText.anchor.set(0.5, 0.5);
      this.chalText.position.set(W / 2 + 60, L.H - 22);
      this.hud.addChild(this.chalText);
      const b1 = new Button("Squad", 104, 60, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 17 });
      const b3 = new Button("Menu", 104, 60, COL.neutral, () => this.hooks.openOverlay("options"), { size: 17 });
      b1.position.set(70, L.btnY);
      b3.position.set(W - 70, L.btnY);
      this.hud.addChild(b1, b3);
    }
    // the main button: let the rival take its touch while you defend
    const bw = port ? 260 : 300;
    this.btnReady = new Button("Ready", bw, port ? 76 : 70, COL.play, () => void this.doHold(), { size: 26 });
    this.btnReady.position.set(port ? L.W / 2 : L.btnX + 110, L.btnY);
    this.btnHint = new Button("Show me a touch", port ? 200 : 230, port ? 60 : 56, COL.neutral, () => this.hint(), { size: 17 });
    this.btnHint.position.set(port ? L.W / 2 : L.btnX - 200, port ? L.btnY : L.btnY);
    this.hud.addChild(this.btnReady, this.btnHint);
  }

  // ================================================================ the table
  buildTable() {
    const lk = look();
    const g = this.pitch;
    g.clear();
    // the cabinet and its wooden rail
    g.roundRect(TX0 - 70, LANE0 - RAIL - 18, TX1 - TX0 + 140, PITCH_H + 2 * RAIL + 36, 26).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(TX0 - 64, LANE0 - RAIL - 12, TX1 - TX0 + 128, PITCH_H + 2 * RAIL + 24, 22).fill(BRASS.wood);
    // goal mouths: dark nets behind each goal line
    for (const side of [0, 1]) {
      const gx = side === 0 ? TX0 - 50 : TX1;
      const y0 = laneY(MOUTH[0] - 0.5);
      const h = (MOUTH[1] - MOUTH[0] + 1) * LH;
      g.rect(gx, y0, 50, h).fill(0x08030a);
      for (let i = 1; i < 5; i++) g.moveTo(gx + i * 10, y0).lineTo(gx + i * 10, y0 + h);
      for (let j = 1; j < h / 10; j++) g.moveTo(gx, y0 + j * 10).lineTo(gx + 50, y0 + j * 10);
      g.stroke({ width: 1, color: COL.cream, alpha: 0.18 });
    }
    // the felt
    g.rect(TX0, LANE0, TX1 - TX0, PITCH_H).fill(lk.felt);
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      g.roundRect(TX0 + 20 + k * 120, LANE0 + 14 + k * 70, TX1 - TX0 - 40 - k * 240, PITCH_H - 28 - k * 140, 30).fill({ color: lk.feltHi, alpha: 0.05 });
    }
    // felt grain: faint diagonal threads
    for (let x = TX0 - PITCH_H; x < TX1; x += 9) {
      const a = Math.max(TX0, x);
      const b = Math.min(TX1, x + PITCH_H);
      if (b <= a) continue;
      g.moveTo(a, LANE0 + (a - x)).lineTo(b, LANE0 + (b - x));
    }
    g.stroke({ width: 1, color: 0x000000, alpha: 0.05 });
    // lanes, very faint: the grid the ball runs on
    for (let l = 1; l < LANES; l++) {
      for (let x = TX0 + 6; x < TX1 - 6; x += 16) g.moveTo(x, LANE0 + l * LH).lineTo(x + 6, LANE0 + l * LH);
    }
    g.stroke({ width: 1, color: COL.cream, alpha: 0.07 });
    // markings: halfway line, centre circle, boxes
    const mid = (TX0 + TX1) / 2;
    const cy = LANE0 + PITCH_H / 2;
    g.moveTo(mid, LANE0).lineTo(mid, LANE0 + PITCH_H);
    g.circle(mid, cy, 74);
    g.circle(mid, cy, 4);
    g.rect(TX0, cy - 150, 96, 300);
    g.rect(TX1 - 96, cy - 150, 96, 300);
    g.rect(TX0, cy - 72, 36, 144);
    g.rect(TX1 - 36, cy - 72, 36, 144);
    g.stroke({ width: 3, color: COL.cream, alpha: 0.22 });
    // goal posts
    for (const gx of [TX0, TX1]) {
      g.rect(gx - 4, laneY(MOUTH[0] - 0.5) - 6, 8, 8).fill(COL.cream);
      g.rect(gx - 4, laneY(MOUTH[1] + 0.5) - 2, 8, 8).fill(COL.cream);
    }
    this.drawMark(COL.cream);
    // the mask that keeps rod bars inside the cabinet
    this.rodMask.clear();
    this.rodMask.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, PITCH_H + 2 * RAIL).fill(0xffffff);
    // the rail on top of the bars, with brass bearings where the rods pass
    const r = this.rail;
    r.clear();
    r.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, RAIL).fill(BRASS.rail);
    r.rect(TX0 - 64, LANE0 + PITCH_H, TX1 - TX0 + 128, RAIL).fill(BRASS.rail);
    r.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, 4).fill({ color: 0xffffff, alpha: 0.06 });
    for (let x = 1; x <= 8; x++) {
      for (const y of [LANE0 - RAIL / 2, LANE0 + PITCH_H + RAIL / 2]) r.circle(colX(x), y, 8).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
    }
    // rod ends with grips: yours stick out the bottom, theirs the top (fixed; the rod slides through the bearing)
    this.knobLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const kg = new Graphics();
    for (const side of [0, 1] as (0 | 1)[]) {
      for (let rod = 0; rod < 4; rod++) {
        const x = colX(colOf(side, rod));
        const kit = side === 0 ? { main: lk.kit, trim: lk.trim } : { main: THEM.main, trim: THEM.trim };
        if (side === 0) {
          kg.rect(x - 4, LANE0 + PITCH_H + RAIL, 8, 12).fill(BRASS.bar);
          kg.roundRect(x - 12, LANE0 + PITCH_H + RAIL + 8, 24, 14, 6).fill(kit.main).stroke({ width: 2, color: COL.ink });
        } else {
          kg.rect(x - 4, LANE0 - RAIL - 14, 8, 14).fill(BRASS.bar);
          kg.roundRect(x - 12, LANE0 - RAIL - 26, 24, 16, 6).fill(kit.main).stroke({ width: 2, color: COL.ink });
        }
      }
    }
    this.knobLayer.addChild(kg);
  }

  /** A faint woven KICKER mark in the centre circle: stitched ring, a weave, the name. */
  drawMark(tone: number) {
    const m = this.mark;
    m.removeChildren().forEach((c) => c.destroy());
    const rx = 230;
    const ry = 120;
    const g = new Graphics();
    for (let t = -rx; t <= rx; t += 14) {
      const half = ry * Math.sqrt(Math.max(0, 1 - (t * t) / (rx * rx))) * 0.86;
      if (half < 6) continue;
      g.moveTo(t - half * 0.5, -half).lineTo(t + half * 0.5, half);
      g.moveTo(t + half * 0.5, -half).lineTo(t - half * 0.5, half);
    }
    g.stroke({ width: 2, color: tone, alpha: 0.025 });
    for (let i = 0; i < 64; i++) {
      const a0 = (i / 64) * Math.PI * 2;
      const a1 = a0 + Math.PI / 96;
      g.moveTo(Math.cos(a0) * (rx - 14), Math.sin(a0) * (ry - 12)).lineTo(Math.cos(a1) * (rx - 14), Math.sin(a1) * (ry - 12));
    }
    g.stroke({ width: 3, color: tone, alpha: 0.07 });
    m.addChild(g);
    const word = txt("KICKER", { fontFamily: NUM, fontSize: 96, fill: tone, letterSpacing: 16 });
    word.anchor.set(0.5);
    word.alpha = 0.06;
    this.upright(word);
    m.addChild(word);
    m.position.set((TX0 + TX1) / 2, LANE0 + PITCH_H / 2);
  }

  /** Builds the eight rods with their figures from the run (your squad, their plain turquoise men). */
  buildRods() {
    const run = this.run;
    this.rodLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rods = [[], []];
    if (!run) return;
    const m = run.s.match;
    const off = m ? m.off : [[4, 2, 0, 1], [5, 3, 1, 2]];
    this.disp.off = off.map((o) => o.slice());
    for (const side of [0, 1] as (0 | 1)[]) {
      for (let r = 0; r < 4; r++) {
        const d = RODS[r];
        const c = new Container();
        c.position.set(colX(colOf(side, r)), LANE0 + off[side][r] * LH);
        const bar = new Graphics();
        const span = (d.max + 2) * LH + PITCH_H + 200;
        bar.rect(-5, -span, 10, span * 2).fill(BRASS.bar);
        bar.rect(-5, -span, 3, span * 2).fill({ color: BRASS.hi, alpha: 0.7 });
        bar.rect(2, -span, 3, span * 2).fill({ color: BRASS.lo, alpha: 0.7 });
        c.addChild(bar);
        const pulled = side === 0 && m && m.pulled === r;
        const figs: FigureView[] = [];
        if (!pulled) {
          for (let f = 0; f < d.n; f++) {
            const slot = slotOf(r, f);
            const fv = new FigureView(side, side === 0 ? run.s.squad[slot] : null, f);
            fv.position.set(0, (f * d.gap + 0.5) * LH);
            if (fv.tag) {
              this.upright(fv.tag);
              if (this.port) fv.tag.position.set(-(FR + 3), 0);
            }
            if (side === 0) {
              fv.setStats(run.stats(slot));
              this.bindFigure(fv, slot);
            }
            c.addChild(fv);
            figs.push(fv);
          }
        } else bar.alpha = 0.25;
        if (side === 0 && m && m.frozen === r) {
          const ice = new Graphics().rect(-9, -span, 18, span * 2).fill({ color: COL.cyan, alpha: 0.22 });
          c.addChildAt(ice, 1);
        }
        this.rodLayer.addChild(c);
        this.rods[side].push({ c, bar, figs });
      }
    }
    // their side in front of yours where they cross, like a real table: draw order by column
    this.rodLayer.sortableChildren = true;
  }

  figPos(side: 0 | 1, rod: number, fig: number): { x: number; y: number } {
    return { x: colX(colOf(side, rod)), y: laneY(this.disp.off[side][rod] + fig * RODS[rod].gap) };
  }

  placeBall() {
    const b = this.disp.ball;
    if (!b || !this.rods[b.side]?.[b.rod]) {
      this.ball.visible = !!this.ballFree;
      return;
    }
    const rv = this.rods[b.side][b.rod];
    const fwd = b.side === 0 ? 1 : -1;
    this.ball.visible = true;
    this.ball.position.set(rv.c.x + fwd * 15, rv.c.y + (b.fig * RODS[b.rod].gap + 0.5) * LH + 9);
  }

  drawBall() {
    this.ball.clear();
    this.ball.circle(3, 4, 9).fill({ color: 0x000000, alpha: 0.4 });
    this.ball.circle(0, 0, 9).fill(0xfff6e6).stroke({ width: 2, color: COL.ink });
    this.ball.circle(-3, -3, 3).fill({ color: 0xffffff, alpha: 0.9 });
  }

  // ================================================================ run lifecycle
  start(run: Run) {
    this.root.visible = true;
    for (const l of run.s.squad) tokenTexture(l.c, l.s, () => {});
    this.run = run;
    this.busy = false;
    this.refreshAll();
  }

  refreshAll() {
    const run = this.run;
    if (!run) return;
    this.tip.hide();
    this.drawBall();
    this.buildRods();
    this.syncBall();
    this.syncBench();
    this.syncHud();
    this.showStage();
    this.syncControls();
  }

  syncBall() {
    const m = this.run?.s.match;
    this.ballFree = null;
    this.disp.ball = m && (this.run!.s.phase === "attack" || this.run!.s.phase === "defend") ? { ...m.ball } : null;
    this.placeBall();
  }

  inMatch() {
    const p = this.run?.s.phase;
    return p === "attack" || p === "defend";
  }

  syncHud() {
    const run = this.run;
    if (!run) return;
    const s = run.s;
    const m = s.match;
    const kind = m ? m.kind : s.kind;
    const boss = m ? m.boss : run.bossOf();
    const name = m ? m.club : run.clubName();
    this.clubName.text = name;
    this.clubName.style.fill = kind === 0 ? COL.cyan : kind === 1 ? COL.money : COL.pink;
    this.clubRule.text = boss ? BOSS[boss].text : `${FIXTURE_NAME[kind]} · round ${Math.min(s.round, ROUNDS)} of ${ROUNDS} · first to ${m ? m.target : 2}`;
    this.scoreYou.text = String(m ? m.score[0] : 0);
    this.scoreThem.text = String(m ? m.score[1] : 0);
    this.scoreYou.style.fill = look().kitHi;
    this.stat.round.text = `${Math.min(s.round, ROUNDS)}/${ROUNDS}`;
    this.stat.fans.text = this.port ? `${s.fans} fans` : String(s.fans);
    this.stat.goals.text = String(s.goalsFor);
    this.stat.wins.text = String(s.cleared);
    const g = this.pips;
    g.clear();
    if (m && s.phase === "attack") {
      this.possText.text = `Your ball · possession ${m.poss[0]} of ${m.limit}`;
      const free = m.free.reduce((a, b) => a + b, 0) + m.freeAny;
      this.touchText.text = `${m.touches} touch${m.touches === 1 ? "" : "es"} left${free ? ` · ${free} free slide${free === 1 ? "" : "s"}` : ""}${m.dummy ? ` · they freeze for ${m.dummy}` : ""}`;
      for (let i = 0; i < m.touches; i++) g.circle((i - (m.touches - 1) / 2) * 30, 0, 11).fill(COL.money).stroke({ width: 3, color: COL.ink });
    } else if (m && s.phase === "defend") {
      this.possText.text = `Their ball · ${m.aiTouches} touch${m.aiTouches === 1 ? "" : "es"} left`;
      this.touchText.text = `${m.blockSlides} block slide${m.blockSlides === 1 ? "" : "s"} left this possession`;
      for (let i = 0; i < m.blockSlides; i++) g.roundRect((i - (m.blockSlides - 1) / 2) * 30 - 10, -10, 20, 20, 4).fill(COL.cyan).stroke({ width: 3, color: COL.ink });
    } else {
      this.possText.text = s.phase === "room" ? "Dressing room" : s.phase === "fulltime" ? "Full time" : s.phase === "fixture" ? "Next up" : "";
      this.touchText.text = "";
    }
    const ch = ui.challenge;
    this.chalText.text = ch ? `Beat ${ch.name || "the challenger"}: ${ch.won ? "won the season" : `round ${ch.round}`}, best goal ${fmt(ch.best)}` : "";
    this.benchLabel.text = `COACHES ${s.coaches.length}/${MAX_COACHES}${this.port ? "" : `      SET PIECES ${s.plays.length}/${MAX_PLAYS}`}`;
    this.btnReady.visible = s.phase === "defend";
    this.btnHint.visible = s.phase === "attack" || (s.phase === "defend" && false);
    if (this.port) this.btnHint.visible = s.phase === "attack";
    this.btnReady.setEnabled(!this.busy);
    this.btnHint.setEnabled(!this.busy);
    if (s.phase === "defend" && m) {
      const it = m.intent;
      const read = run.ai().read;
      this.btnReady.setText(it && it.kind === "kick" ? (read ? "Ready: they pick" : "Ready: they kick") : "Ready: they move");
    }
  }

  // ================================================================ bench: coaches and set pieces
  syncBench() {
    const run = this.run;
    if (!run) return;
    const L = this.L;
    this.benchLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.coachViews = [];
    this.playViews = [];
    const slots = new Graphics();
    const sc = L.coachScale;
    for (let i = 0; i < MAX_COACHES; i++) {
      const x = L.coachX + i * L.coachStep;
      slots.roundRect(x - (PW * sc) / 2, L.coachY - (PH * sc) / 2, PW * sc, PH * sc, 10).fill({ color: 0x000000, alpha: 0.22 }).stroke({ width: 2, color: COL.edge, alpha: 0.7 });
    }
    for (let i = 0; i < MAX_PLAYS; i++) {
      const x = L.playX + i * L.playStep;
      slots.roundRect(x - (PW * sc * 0.92) / 2, L.playY - (PH * sc * 0.92) / 2, PW * sc * 0.92, PH * sc * 0.92, 10).fill({ color: 0x000000, alpha: 0.22 }).stroke({ width: 2, color: COL.edge, alpha: 0.7 });
    }
    this.benchLayer.addChild(slots);
    run.s.coaches.forEach((j, i) => {
      const v = new CoachView(j.id);
      v.scale.set(sc);
      v.position.set(L.coachX + i * L.coachStep, L.coachY);
      v.on("pointertap", () => {
        this.coachTip(i, v);
        this.focusCoach(j.id);
      });
      v.on("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        this.coachTip(i, v, false);
        this.focusCoach(j.id);
      });
      v.on("pointerout", (e) => {
        if (e.pointerType !== "mouse") return;
        if (!this.tipPinned) this.tip.hide();
        this.focusCoach(null);
      });
      this.benchLayer.addChild(v);
      this.coachViews.push(v);
    });
    run.s.plays.forEach((id, i) => {
      const v = new ItemView("play", id);
      v.scale.set(sc * 0.92);
      v.position.set(L.playX + i * L.playStep, L.playY);
      v.on("pointertap", () => this.playTip(i, v));
      v.on("pointerover", (e) => {
        if (e.pointerType === "mouse") this.playTip(i, v, false);
      });
      v.on("pointerout", (e) => {
        if (e.pointerType === "mouse" && !this.tipPinned) this.tip.hide();
      });
      this.benchLayer.addChild(v);
      this.playViews.push(v);
    });
  }

  /** Hovering a coach lights the figures it works on: the engine's own check. */
  focusCoach(id: string | null) {
    if (this.synFocus === id) return;
    this.synFocus = id;
    const run = this.run;
    const lit = new Set(id && run ? run.coachSlots(id) : []);
    const hue = id ? hslHex(COACH[id]?.hue ?? 0, 0.85, 0.62) : null;
    this.rods[0].forEach((rv, r) => rv.figs.forEach((fv, f) => fv.setSynergy(lit.has(slotOf(r, f)) ? hue : null)));
  }

  private tipAt(obj: Container, h = PH): { x: number; y: number } {
    const p = this.root.toLocal(obj.getGlobalPosition());
    return { x: p.x, y: p.y - (h * obj.scale.y) / 2 };
  }

  coachTip(i: number, v: CoachView, pin = true) {
    const run = this.run;
    if (!run) return;
    const j = run.s.coaches[i];
    if (!j) return;
    const d = COACH[j.id];
    this.tip.hide();
    const n = run.coachSlots(j.id).length;
    let body = d.text;
    if (d.reads) body += `\nWorks on ${n} of your figures right now.`;
    body += `\n${RARITY_NAME[d.rarity]} · lets go for ${run.sellValue(j)} fans`;
    const offPitch = run.s.phase === "fixture" || run.s.phase === "room";
    if (pin && offPitch) {
      const b = new Button(`Let go +${run.sellValue(j)}`, 160, 46, COL.danger, () => {
        this.act({ t: "sell", i });
        sfx.coin();
        this.tip.hide();
        this.refreshAll();
      }, { size: 17 });
      b.position.set(80, 26);
      this.tip.extra.addChild(b);
    }
    this.tipPinned = pin;
    const at = this.tipAt(v);
    this.tip.show(d.name, body, at.x, at.y, { w: this.L.W, h: this.L.H }, COL.money, 320);
    if (this.tip.y < at.y && this.tip.y + this.tip.height > at.y) this.tip.y = at.y + PH * v.scale.y + 8;
  }

  playTip(i: number, v: ItemView, pin = true) {
    const run = this.run;
    if (!run) return;
    const id = run.s.plays[i];
    const d = PLAY[id];
    this.tip.hide();
    const ph = run.s.phase;
    const ok = d.when === "any" ? ph !== "over" && ph !== "won" : d.when === "attack" ? ph === "attack" : ph === "defend";
    const body = `${d.text}\n${d.when === "any" ? "Any time." : d.when === "attack" ? "While you have the ball." : "While they have the ball."}`;
    if (pin) {
      const b = new Button("Use", 110, 46, COL.play, () => void this.doUse(i), { size: 18 });
      b.position.set(55, 26);
      b.setEnabled(ok && !this.busy);
      this.tip.extra.addChild(b);
    }
    this.tipPinned = pin;
    const at = this.tipAt(v);
    this.tip.show(d.name, body, at.x, at.y, { w: this.L.W, h: this.L.H }, COL.cyan, 300);
  }

  // ================================================================ figures: the data tag
  bindFigure(fv: FigureView, slot: number) {
    let timer = 0;
    let hoverT = 0;
    let held = false;
    const stop = () => clearTimeout(timer);
    const full = () => {
      held = true;
      sfx.tick();
      this.tip.hide();
      const run = this.run;
      if (!run) return;
      const l = run.s.squad[slot];
      setUi({ detail: { l, slot } });
    };
    fv.on("pointerdown", (e) => {
      held = false;
      stop();
      clearTimeout(hoverT);
      if (e.pointerType === "mouse") {
        timer = window.setTimeout(full, 650);
        return;
      }
      timer = window.setTimeout(() => {
        held = true;
        sfx.tick();
        this.figTag(fv, slot, true);
        timer = window.setTimeout(full, 800);
      }, 380);
    });
    fv.on("pointerup", stop);
    fv.on("pointerupoutside", () => {
      stop();
      if (held) this.tip.hide();
    });
    fv.on("pointertap", () => {
      stop();
      if (held) {
        held = false;
        return;
      }
      // a tap on the ball holder's target is a kick; on any other figure, the tag
      if (!this.tryTapKick(fv)) this.figTag(fv, slot, true);
    });
    fv.on("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverT);
      hoverT = window.setTimeout(() => {
        if (!fv.destroyed) this.figTag(fv, slot, false);
      }, 280);
    });
    fv.on("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverT);
      if (!this.tipPinned) this.tip.hide();
    });
  }

  figTag(fv: FigureView, slot: number, pinned: boolean) {
    const run = this.run;
    if (!run || fv.destroyed) return;
    const l = run.s.squad[slot];
    const f = figureFacts(l, run.ageHours(l), run.statSources(l));
    const lines = f.lines.map(([k, v]) => `${k}: ${v}`);
    lines.push(pinned ? "Keep holding for its launch page" : "Hold the figure for its launch page");
    this.tipPinned = pinned;
    this.tip.hide();
    const p = this.root.toLocal(fv.getGlobalPosition());
    this.tip.show(`${f.title} · ${RODS[slot === 0 ? 0 : slot <= 2 ? 1 : slot <= 7 ? 2 : 3].name.toLowerCase()}`, lines.join("\n"), p.x, p.y - 30, { w: this.L.W, h: this.L.H }, look().kitHi, 380);
  }

  // ================================================================ controls: rod arrows, kick targets, threats
  syncControls() {
    const run = this.run;
    this.ctrlLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.guideLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!run || !this.inMatch()) return;
    const s = run.s;
    const m = run.m;
    const attack = s.phase === "attack";
    // rod arrows under your rod ends
    for (let r = 0; r < 4; r++) {
      const x = colX(colOf(0, r));
      const pulled = m.pulled === r;
      const locked = m.frozen === r || (r === 0 && m.boss === "lockup");
      const cost = attack ? run.slideCost(r) : 0;
      for (const d of [-1, 1] as Dir[]) {
        const ok = !this.busy && !pulled && run.canMove(0, r, d) && (attack ? cost <= m.touches : m.blockSlides > 0);
        const b = this.arrow(d, ok, () => void this.doSlide(r, d));
        b.position.set(x, CTRL_Y + (d === -1 ? ARROW_H / 2 : ARROW_H * 1.5 + 6));
        this.ctrlLayer.addChild(b);
      }
      const cap = txt(pulled ? "PULLED" : locked ? "LOCKED" : attack && cost === 0 && (m.free[r] > 0 || m.freeAny > 0) ? "FREE" : attack && cost === 2 ? "2 TOUCH" : RODS[r].name.toUpperCase(), {
        fontSize: 9,
        fill: pulled || locked ? COL.bad : cost === 0 && attack ? COL.cyan : COL.dim,
      });
      cap.anchor.set(0.5);
      cap.position.set(x, CTRL_Y + ARROW_H * 2 + 20);
      this.upright(cap);
      this.ctrlLayer.addChild(cap);
    }
    if (this.busy) return;
    if (attack) this.drawKicks();
    else this.drawThreats();
  }

  arrow(d: Dir, enabled: boolean, fn: () => void): Container {
    const c = new Container();
    const g = new Graphics();
    const w = ARROW_W;
    const h = ARROW_H;
    const col = enabled ? COL.play : 0x4a3346;
    g.roundRect(-w / 2, -h / 2 + 4, w, h, 10).fill(0x0a2a30);
    g.roundRect(-w / 2, -h / 2, w, h, 10).fill(col).stroke({ width: 3, color: COL.ink });
    const t = 13;
    if (d === -1) g.poly([0, -t, t * 1.2, t * 0.7, -t * 1.2, t * 0.7]).fill({ color: COL.cream, alpha: enabled ? 1 : 0.35 });
    else g.poly([0, t, t * 1.2, -t * 0.7, -t * 1.2, -t * 0.7]).fill({ color: COL.cream, alpha: enabled ? 1 : 0.35 });
    c.addChild(g);
    c.eventMode = "static";
    c.cursor = enabled ? "pointer" : "default";
    c.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    c.on("pointertap", () => {
      if (!enabled) {
        sfx.error();
        return;
      }
      fn();
    });
    (c as Container & { label: string }).label = d === -1 ? "up" : "down";
    return c;
  }

  /** Dashed path of a kick through table space, mirrored off the side walls where it bounces. */
  pathPoints(side: 0 | 1, rod: number, lane: number, k: Kick, drift: number, upTo?: number): { x: number; y: number }[] {
    const x0 = colOf(side, rod);
    const dir = side === 0 ? 1 : -1;
    const x1 = k.r === 4 ? (side === 0 ? 9 : 0) : colOf(side, k.r);
    const n = Math.abs(x1 - x0);
    const stop = upTo ?? n;
    const pts: { x: number; y: number }[] = [];
    for (let t = 0; t <= stop + 1e-9; t += 0.125) {
      const v = lane + k.d * t + drift * Math.min(1, t);
      pts.push({ x: colX(x0 + dir * t), y: laneY(mirror(v)) });
    }
    if (k.r === 4 && upTo === undefined) {
      const last = pts[pts.length - 1];
      pts.push({ x: last.x + dir * 36, y: last.y });
    }
    return pts;
  }

  dashed(g: Graphics, pts: { x: number; y: number }[], color: number, alpha: number, width = 4) {
    let on = true;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      acc += len;
      if (on) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      if (acc > 12) {
        acc = 0;
        on = !on;
      }
    }
    g.stroke({ width, color, alpha, cap: "round" });
  }

  kickTargets: { kick: Kick; x: number; y: number; open: boolean; fig: FigureView | null; label: string }[] = [];

  /** Your kicks from the ball: gold where they go through, faint red where a figure is in the way. */
  drawKicks() {
    const run = this.run!;
    const m = run.m;
    const ball = m.ball;
    const lane = laneOf(ball.rod, m.off[0][ball.rod], ball.fig);
    const ks = run.myKicks();
    const g = new Graphics();
    this.guideLayer.addChild(g);
    this.kickTargets = [];
    ks.forEach((k, i) => {
      const shot = k.kick.r === 4;
      const pts = this.pathPoints(0, ball.rod, lane, k.kick, shot ? m.drift : 0);
      const hl = this.hoverKick === i;
      if (k.open) this.dashed(g, pts, shot ? COL.money : COL.cream, hl ? 1 : shot ? 0.9 : 0.55, hl ? 6 : 4);
      else if (shot || hl) this.dashed(g, pts, COL.bad, hl ? 0.9 : 0.35, 3);
      const end = shot ? pts[pts.length - 2] : pts[pts.length - 1];
      const fig = shot ? null : this.rods[0][k.kick.r]?.figs[k.tr.to] || null;
      const to = fig ? run.s.squad[slotOf(k.kick.r, k.tr.to)] : null;
      const what = shot ? `Shot${k.kick.d ? ", angled" : ""}${k.tr.bounces ? ", off the wall" : ""}` : `Pass to $${to?.s || "?"}`;
      const how = k.open ? (k.beaten ? `goes through ${k.beaten} with Power` : shot ? "open" : "clean") : `blocked by their ${RODS[k.at!.rod].name.toLowerCase()}`;
      this.kickTargets.push({ kick: k.kick, x: end.x, y: end.y, open: k.open, fig, label: `${what} · ${how}` });
      if (!k.open && k.at) {
        const bp = this.figPos(1, k.at.rod, k.at.fig);
        if (shot || hl) g.moveTo(bp.x - 10, bp.y - 10).lineTo(bp.x + 10, bp.y + 10).moveTo(bp.x + 10, bp.y - 10).lineTo(bp.x - 10, bp.y + 10).stroke({ width: 4, color: COL.bad, alpha: hl ? 1 : 0.6 });
      }
    });
    // target markers: a ring on the receiver, a disc in the goal mouth
    this.kickTargets.forEach((t, i) => {
      if (!t.open && t.kick.r !== 4) return;
      const c = new Container();
      const mg = new Graphics();
      const col = t.open ? (t.kick.r === 4 ? COL.money : COL.cream) : COL.bad;
      if (t.kick.r === 4) {
        mg.circle(0, 0, 24).fill({ color: COL.ink, alpha: 0.75 }).stroke({ width: 5, color: col });
        mg.circle(0, 0, 9).fill(col);
      } else mg.circle(0, 0, FR + 7).stroke({ width: 4, color: col, alpha: 0.9 });
      c.addChild(mg);
      c.position.set(t.x, t.y);
      c.eventMode = "static";
      c.cursor = "pointer";
      // generous, but never wider than a lane and a half, so two targets side by side stay apart
      c.hitArea = new Rectangle(-44, -25, 88, 50);
      c.on("pointertap", () => void this.doKick(t.kick));
      c.on("pointerover", () => this.hoverTarget(i));
      c.on("pointerout", () => this.hoverTarget(null));
      (c as Container & { label: string }).label = t.kick.r === 4 ? "shot" : "pass";
      this.guideLayer.addChild(c);
    });
    const holder = this.rods[0][ball.rod]?.figs[ball.fig];
    for (const rv of this.rods[0]) for (const f of rv.figs) f.setRing(null);
    holder?.setRing(COL.money, 4);
  }

  hoverTarget(i: number | null) {
    if (this.hoverKick === i) return;
    this.hoverKick = i;
    if (i === null) {
      this.tip.hide();
      this.syncControls();
      return;
    }
    const t = this.kickTargets[i];
    this.syncControls();
    if (!t) return;
    const p = this.root.toLocal(this.tbl.toGlobal({ x: t.x, y: t.y }));
    this.tipPinned = false;
    this.tip.show(t.kick.r === 4 ? "Shoot" : "Pass", t.label, p.x, p.y - 26, { w: this.L.W, h: this.L.H }, t.open ? COL.money : COL.bad, 300);
  }

  /** A tap on a pass receiver kicks to it, when that pass is on. */
  tryTapKick(fv: FigureView): boolean {
    const t = this.kickTargets.find((k) => k.fig === fv);
    if (!t || this.busy || this.run?.s.phase !== "attack") return false;
    void this.doKick(t.kick);
    return true;
  }

  /** While they have the ball: the lanes it can go down. Red for shots, amber for passes. */
  drawThreats() {
    const run = this.run!;
    const m = run.m;
    const ball = m.ball;
    const lane = laneOf(ball.rod, m.off[1][ball.rod], ball.fig);
    const g = new Graphics();
    this.guideLayer.addChild(g);
    for (const rv of this.rods[0]) for (const f of rv.figs) f.setRing(null);
    const threats = run.threats();
    for (const k of threats) {
      const pts = this.pathPoints(1, ball.rod, lane, k.kick, 0);
      this.dashed(g, pts, k.kick.r === 4 ? COL.bad : COL.money, 0.95, 5);
      const end = k.kick.r === 4 ? pts[pts.length - 2] : pts[pts.length - 1];
      g.circle(end.x, end.y, 12).stroke({ width: 4, color: k.kick.r === 4 ? COL.bad : COL.money });
    }
    const holder = this.rods[1][ball.rod]?.figs[ball.fig];
    holder?.setRing(COL.bad, 4);
    if (!threats.length && m.intent && m.intent.kind === "slide") {
      // the rod it is about to move
      const x = colX(colOf(1, m.intent.r));
      g.rect(x - 14, LANE0, 28, PITCH_H).fill({ color: THEM.main, alpha: 0.12 });
    }
  }

  // ================================================================ actions
  act(a: Action): boolean {
    const run = this.run;
    if (!run) return false;
    try {
      run.apply(a);
    } catch (err) {
      sfx.error();
      toast(String((err as Error).message || err));
      return false;
    }
    this.hooks.onAction(a, run);
    return true;
  }

  async perform(a: Action) {
    const run = this.run;
    if (!run || this.busy) return;
    this.hoverKick = null;
    this.tip.hide();
    if (!this.act(a)) return;
    this.busy = true;
    this.syncControls();
    this.btnReady.setEnabled(false);
    this.btnHint.setEnabled(false);
    try {
      await this.playEvents(run.events.slice());
    } finally {
      this.busy = false;
      this.afterEvents();
    }
  }

  afterEvents() {
    const run = this.run;
    if (!run) return;
    const ph = run.s.phase;
    if (ph === "over" || ph === "won") {
      this.syncHud();
      this.hooks.onOver(run);
      return;
    }
    if (ph === "fulltime" || ph === "room" || ph === "fixture") {
      this.calmSwirl();
      this.refreshAll();
      return;
    }
    // snap the display to the engine
    this.disp.off = run.m.off.map((o) => o.slice());
    for (const side of [0, 1] as (0 | 1)[]) this.rods[side].forEach((rv, r) => (rv.c.y = LANE0 + this.disp.off[side][r] * LH));
    this.syncBall();
    this.syncHud();
    this.syncControls();
  }

  doSlide(r: number, d: Dir) {
    void this.perform({ t: "slide", r, d });
  }
  doKick(k: Kick) {
    void this.perform({ t: "kick", r: k.r, d: k.d });
  }
  doHold() {
    if (this.run?.s.phase !== "defend") return;
    void this.perform({ t: "hold" });
  }
  async doUse(i: number) {
    const run = this.run;
    if (!run || this.busy) return;
    if (!this.act({ t: "use", i })) return;
    this.tip.hide();
    sfx.boost();
    this.heat = Math.min(1, this.heat + 0.3);
    this.syncBench();
    this.syncHud();
    this.syncControls();
    if (run.s.phase === "room" || run.s.phase === "fixture") this.showStage();
  }

  key(e: KeyboardEvent) {
    if (!this.run || this.busy) return;
    if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
    if (document.querySelector(".ov-backdrop")) return;
    if (e.key === "Enter" && this.run.s.phase === "defend") this.doHold();
    else if (e.key.toLowerCase() === "h" && this.run.s.phase === "attack") this.hint();
  }

  // ================================================================ playback
  async playEvents(evs: Ev[]) {
    for (const ev of evs) {
      switch (ev.e) {
        case "slide":
          await this.animSlide(ev.side, ev.r, ev.d, ev.why);
          break;
        case "kick":
          await this.animKick(ev);
          break;
        case "goal":
          await this.animGoal(ev.side, ev.rating, ev.style);
          break;
        case "turnover":
          await this.animTurnover(ev.to, ev.why);
          break;
        case "kickoff":
          this.disp.ball = { side: ev.side, rod: 2, fig: 2 };
          this.ballFree = null;
          sfx.whistle();
          await wait(220);
          break;
        case "play":
          this.flashText(PLAY[ev.id]?.name || "", COL.cyan);
          await wait(200);
          break;
        case "end":
          await this.animEnd(ev.won, ev.draw);
          break;
      }
    }
  }

  async animSlide(side: 0 | 1, r: number, d: number, why: string) {
    const rv = this.rods[side][r];
    if (!rv) return;
    this.disp.off[side][r] += d;
    sfx.slide(side === 0);
    const dur = why === "react" || why === "mirror" ? 150 : 190;
    await tween(rv.c, { y: LANE0 + this.disp.off[side][r] * LH }, dur, ease.outBack);
    if (why === "react" || why === "ai") await wait(60);
  }

  async animKick(ev: Extract<Ev, { e: "kick" }>) {
    const side = ev.side;
    const lane = laneOf(ev.rod, this.disp.off[side][ev.rod], ev.fig);
    const x0 = colOf(side, ev.rod);
    let upTo: number | undefined;
    if (ev.at) upTo = Math.abs(colOf(side === 0 ? 1 : 0, ev.at.rod) - x0);
    const pts = this.pathPoints(side, ev.rod, lane, ev.kick, ev.drift, upTo);
    const holder = this.rods[side][ev.rod]?.figs[ev.fig];
    // the kick: the figure rocks forward, then the ball flies
    if (holder) {
      holder.rotation = side === 0 ? -0.4 : 0.4;
      void tween(holder, { rotation: 0 }, 260, ease.outBack);
    }
    sfx.kick(ev.beaten > 0);
    this.ballFree = { x: this.ball.x, y: this.ball.y };
    const speed = ev.kick.r === 4 ? 1.35 : 1;
    const total = pts.length;
    const per = Math.max(6, Math.min(26, 420 / Math.max(1, total))) / speed;
    for (let i = 0; i < total; i++) {
      const p = pts[i];
      this.ball.position.set(p.x, p.y);
      if (i % 2 === 0) this.trailDot(p.x, p.y);
      await wait(per);
    }
    if (ev.result === "blocked" || ev.result === "kept") {
      sfx.block();
      this.shake = Math.min(1, this.shake + 0.25);
      const blocker = ev.at ? this.rods[side === 0 ? 1 : 0][ev.at.rod]?.figs[ev.at.fig] : null;
      if (blocker) {
        blocker.scale.set(1.25);
        void tween(blocker.scale, { x: 1, y: 1 }, 260, ease.outBack);
      }
      const p = this.root.toLocal(this.tbl.toGlobal(this.ball.position));
      this.floatText(ev.result === "kept" ? "Kept it" : side === 0 ? "Blocked" : "Saved", p.x, p.y - 40, ev.result === "kept" ? COL.cyan : side === 0 ? COL.bad : COL.good, 30);
      if (ev.result === "kept") {
        await wait(120);
        this.ballFree = null;
        this.disp.ball = { side, rod: ev.rod, fig: ev.fig };
      } else if (ev.at) {
        this.ballFree = null;
        this.disp.ball = { side: side === 0 ? 1 : 0, rod: ev.at.rod, fig: ev.at.fig };
        if (side === 1) this.burst(this.ball.x, this.ball.y, COL.good, 10);
      }
      await wait(260);
      return;
    }
    if (ev.result === "pass") {
      this.ballFree = null;
      this.disp.ball = { side, rod: ev.kick.r, fig: ev.to };
      sfx.trap();
      const rcv = this.rods[side][ev.kick.r]?.figs[ev.to];
      if (rcv) {
        rcv.scale.set(1.18);
        void tween(rcv.scale, { x: 1, y: 1 }, 220, ease.outBack);
      }
      await wait(120);
      return;
    }
    // into the net
    this.ballFree = { x: this.ball.x, y: this.ball.y };
  }

  trailDot(x: number, y: number) {
    if (reduced()) return;
    const d = new Graphics().circle(0, 0, 7).fill({ color: 0xfff6e6, alpha: 0.5 });
    d.position.set(x, y);
    this.ballLayer.addChildAt(d, 0);
    void tween(d, { alpha: 0 }, 260).then(() => d.destroy());
    void tween(d.scale, { x: 0.3, y: 0.3 }, 260);
  }

  async animGoal(side: 0 | 1, rating: number, style: string) {
    const L = this.L;
    const digit = side === 0 ? this.scoreYou : this.scoreThem;
    digit.text = String((Number(digit.text) || 0) + 1);
    digit.scale.set(1.6);
    void tween(digit.scale, { x: 1, y: 1 }, 420, ease.outBack);
    const gx = side === 0 ? TX1 + 30 : TX0 - 30;
    const net = new Graphics().rect(side === 0 ? TX1 : TX0 - 50, laneY(MOUTH[0] - 0.5), 50, (MOUTH[1] - MOUTH[0] + 1) * LH).fill({ color: side === 0 ? COL.money : COL.bad, alpha: 0.5 });
    this.fxLayer.addChild(net);
    void tween(net, { alpha: 0 }, 900).then(() => net.destroy());
    this.ball.position.set(gx, this.ball.y);
    if (side === 0) {
      sfx.goal();
      this.heat = 1;
      this.shake = 1;
      const banner = txt("GOAL", { fontFamily: NUM, fontSize: this.port ? 120 : 140, fill: COL.money, stroke: { color: COL.ink, width: 12 } });
      banner.anchor.set(0.5);
      const cx = L.area.x + L.area.w / 2;
      const cy = L.area.y + L.area.h / 2 - 30;
      banner.position.set(cx, cy);
      banner.scale.set(0.2);
      this.root.addChild(banner);
      const sub = txt(`${style} · ${fmt(rating)}`, { fontFamily: NUM, fontSize: 44, fill: COL.cream, stroke: { color: COL.pink, width: 8 } });
      sub.anchor.set(0.5);
      sub.position.set(cx, cy + 92);
      sub.alpha = 0;
      this.root.addChild(sub);
      this.burst(cx - 220, cy, COL.money, 22);
      this.burst(cx + 220, cy, look().kitHi, 22);
      await tween(banner.scale, { x: 1, y: 1 }, 360, ease.outElastic);
      void tween(sub, { alpha: 1 }, 200);
      await wait(900);
      await Promise.all([tween(banner, { alpha: 0 }, 260), tween(sub, { alpha: 0 }, 260)]);
      banner.destroy();
      sub.destroy();
    } else {
      sfx.concede();
      this.shake = 0.6;
      const p = this.root.toLocal(this.tbl.toGlobal({ x: TX0 + 60, y: LANE0 + PITCH_H / 2 }));
      this.flashText("They score", COL.bad, p);
      await wait(900);
    }
    this.ballFree = null;
    this.disp.ball = null;
  }

  async animTurnover(to: 0 | 1, why: string) {
    if (why === "touches" || why === "dead") {
      this.ballFree = null;
      this.disp.ball = { side: to, rod: 0, fig: 0 };
      const p = this.root.toLocal(this.tbl.toGlobal({ x: (TX0 + TX1) / 2, y: LANE0 + PITCH_H / 2 }));
      this.flashText(why === "touches" ? (to === 1 ? "Out of touches" : "Their touches ran out") : "Dead ball", COL.dim, p);
      sfx.whoosh();
      await wait(420);
    } else await wait(120);
  }

  async animEnd(won: boolean, draw: boolean) {
    const L = this.L;
    sfx.whistle();
    if (won || draw) sfx.clear();
    else sfx.lose();
    const run = this.run!;
    const final = run.s.phase === "won";
    const text = final ? "CHAMPIONS" : won ? "FULL TIME" : draw ? "LEVEL: THROUGH" : "KNOCKED OUT";
    const banner = txt(text, { fontFamily: NUM, fontSize: this.port ? 76 : 96, fill: won || draw ? COL.money : COL.bad, stroke: { color: COL.ink, width: 10 } });
    banner.anchor.set(0.5);
    banner.position.set(L.area.x + L.area.w / 2, L.area.y + L.area.h / 2);
    banner.scale.set(0.2);
    this.root.addChild(banner);
    if (won) this.heat = 1;
    await tween(banner.scale, { x: 1, y: 1 }, 380, ease.outElastic);
    await wait(900);
    await tween(banner, { alpha: 0 }, 260);
    banner.destroy();
  }

  private floatText(text: string, x: number, y: number, color: number, size = 30) {
    const t = txt(text, { fontFamily: NUM, fontSize: size, fill: color, stroke: { color: COL.ink, width: 6 } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.4);
    this.root.addChild(t);
    void (async () => {
      await tween(t.scale, { x: 1, y: 1 }, 160, ease.outBack);
      await wait(260);
      await tween(t, { y: y - 30, alpha: 0 }, 380, ease.inCubic);
      t.destroy();
    })();
  }

  private flashText(text: string, color: number, at?: { x: number; y: number }) {
    const L = this.L;
    const p = at || { x: L.area.x + L.area.w / 2, y: L.area.y + 40 };
    this.floatText(text, p.x, p.y, color, 40);
  }

  private burst(x: number, y: number, color: number, n = 14) {
    if (reduced()) return;
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const g = new Graphics().rect(-4, -4, 8, 8).fill(color);
      g.position.set(x, y);
      this.root.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, life: 500 + Math.random() * 400 });
    }
  }

  // ================================================================ stage panels: fixtures, full time, dressing room
  showStage() {
    const run = this.run;
    this.stageLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!run) return;
    const ph = run.s.phase;
    const inMatch = ph === "attack" || ph === "defend";
    this.tbl.visible = inMatch || ph === "over" || ph === "won";
    if (ph === "fixture") this.fixturePanel();
    else if (ph === "fulltime") this.fulltimePanel();
    else if (ph === "room") this.roomPanel();
  }

  private stageBox(h: number, title: string, color: number): { c: Container; w: number } {
    const a = this.L.area;
    const w = Math.min(a.w, this.port ? a.w : 1000);
    const x = a.x + (a.w - w) / 2;
    const y = this.port ? a.y : a.y + Math.max(0, (a.h - h) / 2 - 20);
    const c = new Container();
    c.position.set(x, y);
    c.addChild(panel(w, h, COL.ink2, color));
    const t = txt(title, { fontFamily: NUM, fontSize: 46, fill: color, stroke: { color: COL.ink, width: 6 } });
    t.anchor.set(0.5, 0);
    t.position.set(w / 2, 10);
    c.addChild(t);
    this.stageLayer.addChild(c);
    c.alpha = 0;
    c.y += 30;
    void tween(c, { alpha: 1, y }, 260, ease.outCubic);
    return { c, w };
  }

  fixturePanel() {
    const run = this.run!;
    const s = run.s;
    const port = this.port;
    const h = Math.min(this.L.area.h, port ? 640 : 540);
    const { c, w } = this.stageBox(h, `ROUND ${s.round}`, COL.money);
    const tw = (w - 48 - 2 * 16) / 3;
    for (let k = 0; k < 3; k++) {
      const x = 24 + k * (tw + 16);
      const y = 76;
      const th = h - 100;
      const cur = k === s.kind;
      const done = k < s.kind;
      const boss = run.bossOf(k);
      const col = k === 0 ? COL.cyan : k === 1 ? COL.money : COL.pink;
      const tile = panel(tw, th, cur ? COL.panelHi : COL.ink, cur ? col : COL.edge);
      tile.position.set(x, y);
      c.addChild(tile);
      const kindT = txt(FIXTURE_NAME[k].toUpperCase(), { fontSize: 13, fill: COL.dim });
      kindT.anchor.set(0.5, 0);
      kindT.position.set(x + tw / 2, y + 12);
      const name = txt(run.clubName(k), { fontSize: port ? 18 : 22, fill: col, align: "center", wordWrap: true, wordWrapWidth: tw - 16 });
      name.anchor.set(0.5, 0);
      name.position.set(x + tw / 2, y + 34);
      c.addChild(kindT, name);
      // a crest: a shield in the club's colour with a ball
      const em = new Graphics();
      const R = port ? 30 : 40;
      em.poly([-R, -R * 0.9, R, -R * 0.9, R, R * 0.2, 0, R * 1.1, -R, R * 0.2]).fill(boss ? COL.pink : THEM.main).stroke({ width: 5, color: COL.ink });
      em.circle(0, -R * 0.05, R * 0.42).fill(COL.cream).stroke({ width: 3, color: COL.ink });
      em.poly([0, -R * 0.3, R * 0.2, -R * 0.12, R * 0.12, R * 0.15, -R * 0.12, R * 0.15, -R * 0.2, -R * 0.12]).fill(COL.ink);
      em.position.set(x + tw / 2, y + (port ? 116 : 130));
      c.addChild(em);
      const lv = run.levelOf(k);
      const p = lv >= 10 ? "Full strength" : lv >= 8 ? "Shoots through a blocker" : lv >= 6 ? "More touches" : lv >= 4 ? "Reads your blocks" : lv >= 3 ? "Two slides a touch" : lv >= 2 ? "Shuts passing lanes" : "Covers the shots";
      const info = txt(`First to ${boss === "bell" ? 3 : 2}\n${p}\nWin: +${WIN_FANS[k]} fans`, { fontSize: 14, fill: COL.cream2, align: "center", lineHeight: 19 });
      info.anchor.set(0.5, 0);
      info.position.set(x + tw / 2, y + (port ? 160 : 186));
      c.addChild(info);
      if (boss) {
        const bt = txt(BOSS[boss].text, { fontSize: port ? 13 : 15, fill: COL.cream, align: "center", wordWrap: true, wordWrapWidth: tw - 20 });
        bt.anchor.set(0.5, 0);
        bt.position.set(x + tw / 2, info.y + info.height + 10);
        const room = y + th - (cur ? 92 : 70) - bt.y;
        if (bt.height > room) bt.scale.set(Math.max(0.55, room / bt.height));
        c.addChild(bt);
      }
      if (cur) {
        const btn = new Button("Kick off", Math.min(tw - 16, 190), port ? 76 : 64, COL.play, () => this.doGo(), { size: 24 });
        btn.position.set(x + tw / 2, y + th - (port ? 58 : 52));
        btn.hitArea = new Rectangle(-tw / 2 + 4, -(port ? 64 : 56), tw - 8, port ? 120 : 104);
        c.addChild(btn);
      } else {
        const st = txt(done ? "DONE" : "UP NEXT", { fontFamily: NUM, fontSize: 30, fill: done ? COL.good : COL.dim });
        st.anchor.set(0.5);
        st.position.set(x + tw / 2, y + th - 46);
        c.addChild(st);
      }
    }
  }

  /** Kick off; a boss club gets its intro first (once, from the overlay). */
  doGo() {
    const run = this.run;
    if (!run || this.busy) return;
    if (run.bossOf() && ui.overlay !== "boss" && !ui.bossSeen) {
      setUi({ bossSeen: true });
      this.hooks.openOverlay("boss");
      return;
    }
    setUi({ bossSeen: false });
    const boss = run.bossOf();
    if (!this.act({ t: "go" })) return;
    if (boss) {
      setSwirlColors(this.swirl, 0x2e0612, 0x3d0b1c, 0xb3123f);
      this.heat = 0.6;
    } else this.calmSwirl();
    this.busy = true;
    this.buildRods();
    this.showStage();
    this.syncHud();
    this.syncControls();
    void this.playEvents(run.events.slice()).finally(() => {
      this.busy = false;
      this.afterEvents();
    });
  }

  fulltimePanel() {
    const run = this.run!;
    const ft = run.s.fulltime;
    if (!ft) return;
    const port = this.port;
    const h = port ? 470 : 430;
    const m = run.s.match;
    const { c, w } = this.stageBox(h, m ? `FULL TIME ${m.score[0]}:${m.score[1]}` : "FULL TIME", COL.money);
    ft.rows.forEach(([k, v], i) => {
      const y = 90 + i * 52;
      const a = txt(k, { fontSize: port ? 18 : 22, fill: COL.cream, wordWrap: true, wordWrapWidth: w - 160 });
      a.position.set(36, y);
      const b = txt(`+${v}`, { fontFamily: NUM, fontSize: 40, fill: COL.money });
      b.anchor.set(1, 0);
      b.position.set(w - 36, y - 8);
      c.addChild(a, b);
      a.alpha = 0;
      b.alpha = 0;
      void wait(i * 180).then(() => {
        sfx.coin();
        void tween(a, { alpha: 1 }, 150);
        void tween(b, { alpha: 1 }, 150);
      });
    });
    const btn = new Button(`Collect ${ft.total} fans`, Math.min(w - 60, 380), 76, COL.money, () => this.doCollect(), { size: 26 });
    btn.caption.style.fill = COL.ink;
    btn.position.set(w / 2, h - 60);
    c.addChild(btn);
  }

  doCollect() {
    if (!this.act({ t: "collect" })) return;
    sfx.coin();
    this.refreshAll();
  }

  roomPanel() {
    const run = this.run!;
    const s = run.s;
    const port = this.port;
    const h = Math.min(this.L.area.h - 6, port ? 700 : 560);
    const { c, w } = this.stageBox(h, "DRESSING ROOM", COL.cyan);
    const fans = txt(`${s.fans} fans in the stands`, { fontSize: 20, fill: COL.money });
    fans.anchor.set(0.5, 0);
    fans.position.set(w / 2, 62);
    c.addChild(fans);
    const hint = roomHint(s.squad, (l) => run.ageHours(l), s.offers.filter((o) => o.kind === "coach" && !o.sold).map((o) => o.id));
    let drop = 0;
    if (hint) {
      const ht = txt(hint.text, { fontSize: 15, fill: COL.cyan, align: "center", wordWrap: true, wordWrapWidth: w - 60, lineHeight: 19 });
      ht.anchor.set(0.5, 0);
      ht.position.set(w / 2, 92);
      c.addChild(ht);
      drop = Math.max(0, ht.height - 6);
    }
    const n = s.offers.length;
    const sc = port ? 1.1 : 1.08;
    const step = Math.min((w - 40) / Math.max(1, n), PW * sc + 40);
    const y0 = (port ? 112 : 120) + (PH * sc) / 2 + drop;
    const desc = txt("Tap an item to read it. Coaches work every match; training stays for the season; a set piece is used once.", {
      fontSize: port ? 15 : 16,
      fill: COL.cream2,
      align: "center",
      wordWrap: true,
      wordWrapWidth: w - 60,
      lineHeight: 21,
    });
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, y0 + (PH * sc) / 2 + 72);
    c.addChild(desc);
    s.offers.forEach((o, i) => {
      const x = w / 2 - ((n - 1) * step) / 2 + i * step;
      const v: Container = o.kind === "coach" ? new CoachView(o.id) : new ItemView(o.kind, o.id);
      v.scale.set(sc);
      v.position.set(x, y0);
      if (o.sold) v.alpha = 0.25;
      c.addChild(v);
      const say = () => {
        if (o.kind === "coach") {
          const d = COACH[o.id];
          return `${d.name} (${RARITY_NAME[d.rarity]} coach): ${d.text}.`;
        }
        if (o.kind === "drill") {
          const d = DRILL[o.id as DrillId];
          const lv = s.drills[d.id];
          return `${d.name} training, level ${lv} to ${lv + 1}: ${d.text(lv + 1)}.`;
        }
        return `${PLAY[o.id].name} (set piece, one use): ${PLAY[o.id].text}.`;
      };
      v.on("pointertap", () => {
        desc.text = say();
        sfx.tick();
      });
      v.on("pointerover", (e) => {
        if (e.pointerType === "mouse") desc.text = say();
      });
      const full = (o.kind === "coach" && s.coaches.length >= MAX_COACHES) || (o.kind === "play" && s.plays.length >= MAX_PLAYS);
      const b = new Button(o.sold ? "Signed" : `${o.cost} fans`, Math.min(step - 12, 130), 52, COL.money, () => this.doBuy(i), { size: 21 });
      b.caption.style.fill = COL.ink;
      b.position.set(x, y0 + (PH * sc) / 2 + 34);
      b.setEnabled(!o.sold && s.fans >= o.cost && !full);
      c.addChild(b);
    });
    const by = h - 50;
    const sq = new Button("Line-up", port ? 230 : 230, 64, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 21 });
    sq.position.set(w / 2 - (port ? 130 : 140), by);
    const next = new Button("Next match", port ? 230 : 230, 64, COL.play, () => this.doNext(), { size: 21 });
    next.position.set(w / 2 + (port ? 130 : 140), by);
    c.addChild(sq, next);
    // training levels, printed: nothing on this shelf is hidden
    const lv = DRILLS.filter((d) => s.drills[d.id] > 0).map((d) => `${d.name} ${s.drills[d.id]}`);
    if (lv.length) {
      const t = txt(`Training: ${lv.join(" · ")}. Next level prices: ${DRILLS.map((d) => `${d.name} ${s.drills[d.id] >= d.max ? "max" : drillCost(s.drills[d.id])}`).join(", ")}.`, { fontSize: 13, fill: COL.dim, align: "center", wordWrap: true, wordWrapWidth: w - 60 });
      t.anchor.set(0.5, 1);
      t.position.set(w / 2, by - 40);
      c.addChild(t);
    }
  }

  doBuy(i: number) {
    const run = this.run!;
    const o = run.s.offers[i];
    if (!this.act({ t: "buy", i })) return;
    sfx.coin();
    this.heat = Math.min(1, this.heat + 0.2);
    if (o.kind === "drill") toast(`${DRILL[o.id as DrillId].name} is now level ${run.s.drills[o.id as DrillId]}`);
    this.refreshAll();
    const last = o.kind === "coach" ? this.coachViews[this.coachViews.length - 1] : o.kind === "play" ? this.playViews[this.playViews.length - 1] : null;
    if (last) this.burst(last.x, last.y, COL.money, 12);
  }
  doNext() {
    if (!this.act({ t: "next" })) return;
    this.refreshAll();
  }
  /** Swaps two squad slots (from the line-up overlay). */
  swap(a: number, b: number): boolean {
    if (!this.act({ t: "swap", a, b })) return false;
    sfx.trap();
    this.refreshAll();
    return true;
  }

  /** The coach's suggestion: one good touch now, or the block it would make. */
  hint() {
    const run = this.run;
    if (!run || this.busy) return;
    if (run.s.phase === "attack") {
      const p = bestTouch(run);
      if (!p) return;
      if (p.t === "kick") {
        const i = this.kickTargets.findIndex((t) => t.kick.r === p.r && t.kick.d === p.d);
        if (i >= 0) this.hoverTarget(i);
        setUi({ coach: { step: 9, text: p.r === 4 ? "Shoot: the gold disc in their goal mouth." : "Pass: the ringed figure. Tap it." } });
      } else {
        setUi({ coach: { step: 9, text: `Slide your ${RODS[p.r].name.toLowerCase()} ${p.d < 0 ? "up" : "down"} one lane: ${p.d < 0 ? "the top" : "the bottom"} arrow under that rod.` } });
        this.pulseArrow(p.r, p.d);
      }
    } else if (run.s.phase === "defend") {
      const b = bestBlock(run);
      setUi({ coach: { step: 9, text: b ? `Block: slide your ${RODS[b.r].name.toLowerCase()} ${b.d < 0 ? "up" : "down"}.` : "Nothing to block that helps. Press Ready." } });
      if (b) this.pulseArrow(b.r, b.d);
    }
  }

  pulseArrow(r: number, d: Dir) {
    const a = this.ctrlLayer.children[r * 3 + (d === -1 ? 0 : 1)] as Container | undefined;
    if (!a) return;
    a.scale.set(1.3);
    void tween(a.scale, { x: 1, y: 1 }, 400, ease.outElastic);
  }

  /** One step the way the coach would play it, through the same paths a tap takes. For QA and demos. */
  async autoStep(): Promise<string> {
    const run = this.run;
    if (!run || this.busy) return "busy";
    const ph = run.s.phase;
    if (ph === "attack") {
      const p = bestTouch(run);
      if (!p) return "none";
      await this.perform(p.t === "kick" ? { t: "kick", r: p.r, d: p.d } : { t: "slide", r: p.r, d: p.d });
    } else if (ph === "defend") {
      const b = run.m.blockSlides > 0 ? bestBlock(run) : null;
      await this.perform(b ? { t: "slide", r: b.r, d: b.d } : { t: "hold" });
    } else if (ph === "fulltime") this.doCollect();
    else if (ph === "room") {
      const i = run.s.offers.findIndex((o) => !o.sold && o.cost <= run.s.fans && (o.kind !== "coach" || run.s.coaches.length < MAX_COACHES) && (o.kind !== "play" || run.s.plays.length < MAX_PLAYS));
      if (i >= 0) this.doBuy(i);
      else this.doNext();
    } else if (ph === "fixture") this.doGo();
    return ph;
  }
  /** True when the coach's next touch is a shot that goes in. */
  nextIsGoal(): boolean {
    const run = this.run;
    if (!run || run.s.phase !== "attack") return false;
    const p = bestTouch(run);
    return !!p && p.score >= 100000;
  }

  /** For QA and the tutorial: where a squad slot's figure is on screen. */
  screenOfSlot(slot: number): { x: number; y: number } | null {
    const r = slot === 0 ? 0 : slot <= 2 ? 1 : slot <= 7 ? 2 : 3;
    const f = slot - RODS[r].slot;
    const fv = this.rods[0][r]?.figs[f];
    if (!fv) return null;
    const p = fv.getGlobalPosition();
    return { x: p.x, y: p.y };
  }
}

