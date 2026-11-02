// The table: everything drawn in Pixi. State lives in the shared engine; this file shows it and plays back
// what the engine says happened (slides, kicks, blocks, goals), one event at a time.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from "pixi.js";
import { BOSS, COACH, DRILL, DRILLS, FIXTURE_NAME, GHOST_RULES, LANES, MAX_COACHES, MAX_PLAYS, MOUTH, PLAY, RARITY_NAME, RODS, STYLES, WIN_FANS, drillCost, type DrillId } from "../shared/content.js";
import { colOf, laneOf, slotOf, type Action, type Dir, type Ev, type Kick, type Run } from "../shared/engine.js";
import { ghostWhy, type Launch } from "../shared/data.js";
import { bestBlock, bestTouch } from "../shared/bot.js";
import { figureFacts, roomHint } from "../shared/insight.js";
import { hash32 } from "../shared/rng.js";
import { sfx } from "./audio.js";
import { setUi, toast, ui } from "./store.js";
import { CoachView, FR, FigureView, ItemView, PH, PW, hslHex, tokenTexture, txt } from "./figures.js";
import { crtFilter, setSwirlColors, swirlFilter, type FxFilter } from "./fx.js";
import { BRASS, COL, NUM, THEM } from "./theme.js";
import { look } from "./house.js";
import { ease, reduced, tween, wait } from "./tween.js";
import { Button, Tip, fmt, panel } from "./widgets.js";
import { hudOf, hudStep, type Hud } from "./hud.js";

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
  playX: number;
  playY: number;
  playStep: number;
  benchScale: number;
  btnY: number;
  btnX: number;
}

export interface GameHooks {
  onAction(a: Action, run: Run): void;
  onOver(run: Run): void;
  openOverlay(o: "squad" | "options" | "how" | "boss"): void;
}

// ------------------------------------------------------------ table space (drawn flat, turned upright on phones)
const TX0 = 70; // your goal line
const TX1 = 930; // theirs
const LH = 47; // one lane
const LANE0 = 86; // top edge of lane 0 (room above for their handles and the ghost marks)
const PITCH_H = LANES * LH;
const RAIL = 22;
const HANDLE_Y = LANE0 + PITCH_H + RAIL; // where your rods leave the cabinet
const CTRL_Y = HANDLE_Y + 6; // your handles: the slide buttons sit on the rod end
const ARROW_W = 92;
/** Handle buttons are taller (wider on screen) on phones, where the table stands upright and has no labels under them. */
let ARROW_H = 58;
const capY = () => CTRL_Y + ARROW_H * 2 + 24;
const TS_W = 1000;
const TS_H = CTRL_Y + 58 * 2 + 46;
const colX = (x: number) => TX0 + (x * (TX1 - TX0)) / 9;
const laneY = (l: number) => LANE0 + (l + 0.5) * LH;

/** Continuous mirror of a lane off the side walls (walls sit half a lane outside lanes 0 and 9). */
function mirror(v: number): number {
  const p = 2 * LANES;
  const m = (((v + 0.5) % p) + p) % p;
  return m < LANES ? m - 0.5 : p - 0.5 - m;
}

/** A soft black vignette with a clear centre: the Graveyard shift's lantern, drawn once. */
let lanternTex: Texture | null = null;
function lantern(): Texture {
  if (lanternTex) return lanternTex;
  const N = 256;
  const cv = document.createElement("canvas");
  cv.width = N;
  cv.height = N;
  const g = cv.getContext("2d")!;
  const r = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  r.addColorStop(0, "rgba(10,4,12,0)");
  r.addColorStop(0.09, "rgba(10,4,12,0)");
  r.addColorStop(0.22, "rgba(10,4,12,0.5)");
  r.addColorStop(0.36, "rgba(10,4,12,0.66)");
  r.addColorStop(1, "rgba(10,4,12,0.7)");
  g.fillStyle = r;
  g.fillRect(0, 0, N, N);
  lanternTex = Texture.from(cv);
  return lanternTex;
}

interface RodView {
  c: Container;
  bar: Graphics;
  figs: FigureView[];
}

/** A club crest from its name: two colours, a field pattern and an emblem. A boss crest is spiked; a ghost club's is a headstone. */
export function crest(name: string, kind: "club" | "boss" | "ghost", R: number): Graphics {
  const g = new Graphics();
  const h = hash32(name);
  const c1 = hslHex(h % 360, 0.62, 0.42);
  const c2 = hslHex((h >> 9) % 360, 0.7, 0.62);
  if (kind === "ghost") {
    g.roundRect(-R * 0.9, -R * 1.05, R * 1.8, R * 2.15, R * 0.9).fill(0x3b4a55).stroke({ width: 5, color: COL.ink });
    g.roundRect(-R * 0.7, -R * 0.85, R * 1.4, R * 1.8, R * 0.7).fill(0x56697a);
    g.poly([-R * 0.38, R * 0.55, -R * 0.38, -R * 0.15, 0, -R * 0.5, R * 0.38, -R * 0.15, R * 0.38, R * 0.55, R * 0.22, R * 0.38, R * 0.07, R * 0.55, -R * 0.07, R * 0.38, -R * 0.22, R * 0.55]).fill(0xeaf6ff);
    g.ellipse(-R * 0.14, -R * 0.12, R * 0.07, R * 0.1).fill(COL.ink);
    g.ellipse(R * 0.14, -R * 0.12, R * 0.07, R * 0.1).fill(COL.ink);
    return g;
  }
  const shield = [-R, -R * 0.9, R, -R * 0.9, R, R * 0.25, 0, R * 1.15, -R, R * 0.25];
  if (kind === "boss") {
    g.poly([-R * 1.12, -R * 1.2, -R * 0.55, -R * 0.92, 0, -R * 1.3, R * 0.55, -R * 0.92, R * 1.12, -R * 1.2, R, R * 0.25, 0, R * 1.2, -R, R * 0.25]).fill(COL.ink);
    g.poly(shield).fill(0x2a0618).stroke({ width: 5, color: COL.pink });
    g.poly([-R, -R * 0.2, R, -R * 0.2, R, R * 0.1, -R, R * 0.1]).fill({ color: COL.pink, alpha: 0.85 });
  } else {
    g.poly(shield).fill(c1).stroke({ width: 5, color: COL.ink });
    const p = (h >> 4) % 4;
    if (p === 0) for (let i = -2; i <= 2; i += 2) g.rect(i * R * 0.22 - R * 0.11, -R * 0.9, R * 0.22, R * 1.9).fill({ color: c2, alpha: 0.9 });
    else if (p === 1) g.poly([0, -R * 0.9, R, -R * 0.9, R, R * 0.25, 0, R * 1.15]).fill({ color: c2, alpha: 0.9 });
    else if (p === 2) g.poly([-R, -R * 0.1, 0, R * 0.55, R, -R * 0.1, R, R * 0.25, 0, R * 1.0, -R, R * 0.25]).fill({ color: c2, alpha: 0.9 });
    else for (let y = -0.6; y < 0.4; y += 0.5) g.rect(-R, y * R, R * 2, R * 0.22).fill({ color: c2, alpha: 0.9 });
    g.poly(shield).stroke({ width: 5, color: COL.ink });
  }
  // the emblem in a disc
  g.circle(0, -R * 0.05, R * 0.44).fill(COL.cream).stroke({ width: 3, color: COL.ink });
  const e = (h >> 12) % 5;
  const ec = kind === "boss" ? COL.pink : c1;
  const s = R * 0.26;
  if (e === 0) g.circle(0, -R * 0.05, s * 0.8).fill(COL.ink);
  else if (e === 1) {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.45 : s;
      pts.push(Math.cos(a) * rr, -R * 0.05 + Math.sin(a) * rr);
    }
    g.poly(pts).fill(ec);
  } else if (e === 2) g.poly([0, -R * 0.05 - s, s, -R * 0.05, 0, -R * 0.05 + s, -s, -R * 0.05]).fill(ec);
  else if (e === 3) g.poly([-s * 0.2, -R * 0.05 - s, s * 0.6, -R * 0.05 - s * 0.1, 0, -R * 0.05, s * 0.3, -R * 0.05 + s, -s * 0.6, -R * 0.05 + s * 0.05, 0, -R * 0.05]).fill(ec);
  else g.poly([-s, -R * 0.05 + s * 0.5, -s, -R * 0.05 - s * 0.4, -s * 0.5, -R * 0.05, 0, -R * 0.05 - s * 0.7, s * 0.5, -R * 0.05, s, -R * 0.05 - s * 0.4, s, -R * 0.05 + s * 0.5]).fill(ec);
  return g;
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
  mistLayer = new Container();
  dragLayer = new Container();
  rodLayer = new Container();
  rodMask = new Graphics();
  rail = new Graphics();
  knobLayer = new Container();
  dark = new Sprite(Texture.EMPTY);
  darkMask = new Graphics();
  guideLayer = new Container();
  ballLayer = new Container();
  ctrlLayer = new Container();
  fxLayer = new Container();
  benchLayer = new Container();
  stageLayer = new Container();
  tipLayer = new Container();
  tip = new Tip();
  ball = new Graphics();
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
  /** The HUD's numbers: from the engine when still, stepped by events during playback. */
  hudNow: Hud | null = null;
  mists: { g: Graphics; x0: number; y0: number; ph: number }[] = [];
  /** Drag on a rod: the rod, where the pointer started (table space), whether it already moved the rod. */
  drag: { r: number; y0: number; done: boolean; id: number } | null = null;
  dragged = false;
  arrows: Keyed<string, Container> = {};
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
  playLabel!: Text;
  particles: { g: Graphics; vx: number; vy: number; life: number; up?: boolean }[] = [];

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
    this.dark.texture = lantern();
    this.dark.anchor.set(0.5);
    this.dark.width = this.dark.height = 1500;
    this.dark.mask = this.darkMask;
    this.dark.eventMode = "none";
    this.dark.visible = false;
    this.mistLayer.eventMode = "none";
    this.tbl.addChild(this.pitch, this.mark, this.mistLayer, this.rodMask, this.dragLayer, this.rodLayer, this.rail, this.knobLayer, this.darkMask, this.dark, this.guideLayer, this.ballLayer, this.ctrlLayer, this.fxLayer);
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
    app.stage.on("globalpointermove", (e) => this.dragMove(e));
    app.stage.on("pointerup", () => this.dragEnd());
    app.stage.on("pointerupoutside", () => this.dragEnd());
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

  get haunted() {
    return this.run?.mode === "haunt";
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
      for (const m of this.mists) {
        m.g.x = m.x0 + Math.sin(this.t * 0.35 + m.ph) * 26;
        m.g.y = m.y0 + Math.cos(this.t * 0.27 + m.ph) * 14;
        m.g.alpha = 0.55 + 0.35 * Math.sin(this.t * 0.6 + m.ph * 2);
      }
    }
    // the held ball rides with its figure
    if (!this.ballFree) this.placeBall();
    if (this.dark.visible) this.dark.position.set(this.ball.visible ? this.ball.x : (TX0 + TX1) / 2, this.ball.visible ? this.ball.y : LANE0 + PITCH_H / 2);
    // the figure on the ball breathes
    const b = this.disp.ball;
    if (b && !this.ballFree) {
      const fv = this.rods[b.side]?.[b.rod]?.figs[b.fig];
      if (fv) fv.glow.alpha = rm ? 1 : 0.65 + 0.35 * Math.sin(this.t * 5);
    }
    for (const p of this.particles) {
      if (p.up) p.vy -= 0.04;
      else p.vy += 0.35;
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
    if (this.haunted) {
      setSwirlColors(this.swirl, 0x0a0710, 0x10232a, 0x5a2a08);
      return;
    }
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

  /** Phones keep a bench row only when something sits on it. */
  benchRow(): boolean {
    const s = this.run?.s;
    return !!s && (s.coaches.length > 0 || s.plays.length > 0);
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
      // a slim column on the left (club, score, touches, bench), the table takes the rest
      const left = 352;
      this.L = {
        mode,
        W,
        H,
        area: { x: left, y: 12, w: W - left - 16, h: H - 12 - 96 },
        coachX: 62,
        coachY: 570,
        coachStep: 60,
        playX: 62,
        playY: 702,
        playStep: 60,
        benchScale: 0.5,
        btnY: H - 50,
        btnX: left + (W - left - 16) / 2,
      };
    } else {
      const top = 236;
      const bench = this.benchRow() ? 104 : 0;
      this.L = {
        mode,
        W,
        H,
        area: { x: 10, y: top + bench, w: W - 20, h: H - top - bench - 104 },
        coachX: 46,
        coachY: top + bench / 2 - 4,
        coachStep: 62,
        playX: W - 106,
        playY: top + bench / 2 - 4,
        playStep: 62,
        benchScale: 0.5,
        btnY: H - 54,
        btnX: W / 2,
      };
    }
    ARROW_H = mode === "port" ? 72 : 58;
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
      const cx = 176;
      mk(16, 16, 320, L.H - 32, COL.ink2, COL.edge);
      this.clubName = label("", cx, 46, 26, COL.cream);
      this.clubRule = txt("", { fontSize: 13, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: 292, lineHeight: 17 });
      this.clubRule.anchor.set(0.5, 0);
      this.clubRule.position.set(cx, 66);
      this.hud.addChild(this.clubRule);
      // score
      mk(30, 150, 292, 96, COL.ink, COL.edge);
      label("YOU", 96, 170, 14, COL.dim);
      label("THEM", 256, 170, 14, COL.dim);
      this.scoreYou = big(96, 210, 60, look().kitHi);
      this.scoreThem = big(256, 210, 60, THEM.hi);
      label(":", cx, 204, 40, COL.dim);
      // the possession: whose ball, touches as pips
      mk(30, 258, 292, 136, COL.ink, COL.edge);
      this.possText = label("", cx, 280, 17, COL.cream);
      this.touchText = txt("", { fontSize: 13, fill: COL.dim, align: "center", wordWrap: true, wordWrapWidth: 270, lineHeight: 16 });
      this.touchText.anchor.set(0.5, 0);
      this.touchText.position.set(cx, 332);
      this.hud.addChild(this.touchText);
      this.pips.position.set(cx, 310);
      this.hud.addChild(this.pips);
      const stats: [string, string, number][] = [
        ["round", "Round", COL.cream],
        ["fans", "Fans", COL.money],
        ["goals", "Goals", look().kitHi],
        ["wins", "Wins", COL.cyan],
      ];
      stats.forEach(([k, name, color], i) => {
        const x = 30 + i * 74;
        const y = 406;
        mk(x, y, 70, 70, COL.ink, COL.edge);
        label(name, x + 35, y + 15, 12);
        const v = txt("-", { fontFamily: NUM, fontSize: 32, fill: color });
        v.anchor.set(0.5);
        v.position.set(x + 35, y + 45);
        this.hud.addChild(v);
        this.stat[k] = v;
      });
      this.benchLabel = label("", 32, 500, 13, COL.dim, 0);
      this.playLabel = label("", 32, 632, 13, COL.dim, 0);
      const by = L.H - 58;
      const b1 = new Button("Squad", 92, 54, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 18 });
      b1.position.set(30 + 46, by);
      const b2 = new Button("Rules", 92, 54, COL.neutral, () => this.hooks.openOverlay("how"), { size: 18 });
      b2.position.set(30 + 46 + 100, by);
      const b3 = new Button("Menu", 92, 54, COL.neutral, () => this.hooks.openOverlay("options"), { size: 18 });
      b3.position.set(30 + 46 + 200, by);
      this.hud.addChild(b1, b2, b3);
      this.chalText = txt("", { fontSize: 13, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: 290 });
      this.chalText.anchor.set(0.5, 1);
      this.chalText.position.set(cx, by - 40);
      this.hud.addChild(this.chalText);
    } else {
      const W = L.W;
      // row 1: the club and its rule, the score
      mk(14, 14, W * 0.62, 112, COL.ink2, COL.edge);
      this.clubName = label("", 14 + W * 0.31, 36, 22, COL.cream);
      this.clubRule = txt("", { fontSize: 12, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: W * 0.58, lineHeight: 16 });
      this.clubRule.anchor.set(0.5, 0);
      this.clubRule.position.set(14 + W * 0.31, 54);
      this.hud.addChild(this.clubRule);
      const sx = 26 + W * 0.62;
      const swd = W - sx - 14;
      mk(sx, 14, swd, 112, COL.ink2, COL.edge);
      label("YOU", sx + swd * 0.25, 32, 13);
      label("THEM", sx + swd * 0.75, 32, 13);
      this.scoreYou = big(sx + swd * 0.25, 80, 58, look().kitHi);
      this.scoreThem = big(sx + swd * 0.75, 80, 58, THEM.hi);
      label(":", sx + swd / 2, 74, 36, COL.dim);
      // row 2: the possession
      mk(14, 138, W - 28, 88, COL.ink, COL.edge);
      this.possText = label("", 30, 162, 17, COL.cream, 0);
      this.touchText = txt("", { fontSize: 12, fill: COL.dim, wordWrap: true, wordWrapWidth: W - 250, lineHeight: 16 });
      this.touchText.anchor.set(0, 0);
      this.touchText.position.set(30, 182);
      this.hud.addChild(this.touchText);
      this.pips.position.set(W - 130, 192);
      this.hud.addChild(this.pips);
      this.stat.round = txt("", { fontSize: 1 });
      this.stat.fans = label("", W - 30, 162, 15, COL.money, 1);
      this.stat.goals = txt("", { fontSize: 1 });
      this.stat.wins = txt("", { fontSize: 1 });
      this.benchLabel = txt("", { fontSize: 1 });
      this.playLabel = txt("", { fontSize: 1 });
      this.chalText = txt("", { fontSize: 12, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: W - 360 });
      this.chalText.anchor.set(0.5, 0.5);
      this.chalText.position.set(W / 2, L.H - 112);
      this.hud.addChild(this.chalText);
      const b1 = new Button("Squad", 110, 64, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 17 });
      const b3 = new Button("Menu", 110, 64, COL.neutral, () => this.hooks.openOverlay("options"), { size: 17 });
      b1.position.set(70, L.btnY);
      b3.position.set(W - 70, L.btnY);
      this.hud.addChild(b1, b3);
    }
    // the main button: let the rival take its touch while you defend
    const bw = port ? 280 : 300;
    this.btnReady = new Button("Ready", bw, port ? 76 : 68, COL.play, () => void this.doHold(), { size: 26 });
    this.btnReady.position.set(port ? L.W / 2 : L.btnX + 160, L.btnY);
    this.btnHint = new Button("Show me a touch", port ? 260 : 240, port ? 70 : 58, COL.neutral, () => this.hint(), { size: 18 });
    this.btnHint.position.set(port ? L.W / 2 : L.btnX - 160, L.btnY);
    this.hud.addChild(this.btnReady, this.btnHint);
  }

  // ================================================================ the table
  buildTable() {
    const lk = look();
    const night = this.haunted;
    const felt = night ? 0x071a1e : lk.felt;
    const feltHi = night ? 0x10303a : lk.feltHi;
    const wood = night ? 0x1c0b18 : BRASS.wood;
    const g = this.pitch;
    g.clear();
    // the cabinet and its wooden rail
    g.roundRect(TX0 - 70, LANE0 - RAIL - 18, TX1 - TX0 + 140, PITCH_H + 2 * RAIL + 36, 26).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(TX0 - 64, LANE0 - RAIL - 12, TX1 - TX0 + 128, PITCH_H + 2 * RAIL + 24, 22).fill(wood);
    // goal mouths: dark nets behind each goal line (the net lines live in fxLayer so a goal can shake them)
    for (const side of [0, 1]) {
      const gx = side === 0 ? TX0 - 50 : TX1;
      const y0 = laneY(MOUTH[0] - 0.5);
      const h = (MOUTH[1] - MOUTH[0] + 1) * LH;
      if (night) g.circle(gx + 25, y0 + h / 2, 70).fill({ color: 0xff8a1c, alpha: 0.12 });
      g.rect(gx, y0, 50, h).fill(0x08030a);
    }
    this.drawNets(0, 0);
    // the felt
    g.rect(TX0, LANE0, TX1 - TX0, PITCH_H).fill(felt);
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      g.roundRect(TX0 + 20 + k * 120, LANE0 + 14 + k * 70, TX1 - TX0 - 40 - k * 240, PITCH_H - 28 - k * 140, 30).fill({ color: feltHi, alpha: 0.05 });
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
    g.stroke({ width: 3, color: night ? 0xbfe6ef : COL.cream, alpha: night ? 0.14 : 0.22 });
    // goal posts
    for (const gx of [TX0, TX1]) {
      g.rect(gx - 4, laneY(MOUTH[0] - 0.5) - 6, 8, 8).fill(COL.cream);
      g.rect(gx - 4, laneY(MOUTH[1] + 0.5) - 2, 8, 8).fill(COL.cream);
    }
    this.drawMark(night ? 0xbfe6ef : COL.cream);
    // the mask that keeps rod bars inside the cabinet
    this.rodMask.clear();
    this.rodMask.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, PITCH_H + 2 * RAIL).fill(0xffffff);
    this.darkMask.clear();
    this.darkMask.roundRect(TX0 - 64, LANE0 - RAIL - 12, TX1 - TX0 + 128, PITCH_H + 2 * RAIL + 24, 22).fill(0xffffff);
    this.dark.visible = night;
    // the rail on top of the bars, with brass bearings where the rods pass
    const r = this.rail;
    r.clear();
    r.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, RAIL).fill(night ? 0x14060f : BRASS.rail);
    r.rect(TX0 - 64, LANE0 + PITCH_H, TX1 - TX0 + 128, RAIL).fill(night ? 0x14060f : BRASS.rail);
    r.rect(TX0 - 64, LANE0 - RAIL, TX1 - TX0 + 128, 4).fill({ color: 0xffffff, alpha: 0.06 });
    for (let x = 1; x <= 8; x++) {
      for (const y of [LANE0 - RAIL / 2, LANE0 + PITCH_H + RAIL / 2]) r.circle(colX(x), y, 8).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
    }
    if (night) {
      // cobwebs in the four corners of the frame
      const web = (x: number, y: number, sx: number, sy: number) => {
        for (let i = 0; i < 5; i++) {
          const a = (i / 4) * (Math.PI / 2);
          r.moveTo(x, y).lineTo(x + sx * Math.cos(a) * 64, y + sy * Math.sin(a) * 64);
        }
        for (const k of [18, 34, 50]) {
          r.moveTo(x + sx * k, y);
          for (let i = 1; i <= 4; i++) {
            const a = (i / 4) * (Math.PI / 2);
            r.quadraticCurveTo(x + sx * Math.cos(a - 0.2) * k * 0.8, y + sy * Math.sin(a - 0.2) * k * 0.8, x + sx * Math.cos(a) * k, y + sy * Math.sin(a) * k);
          }
        }
        r.stroke({ width: 1.5, color: 0xdbe9f0, alpha: 0.45 });
      };
      web(TX0 - 64, LANE0 - RAIL - 12, 1, 1);
      web(TX1 + 64, LANE0 - RAIL - 12, -1, 1);
      web(TX0 - 64, LANE0 + PITCH_H + RAIL + 12, 1, -1);
      web(TX1 + 64, LANE0 + PITCH_H + RAIL + 12, -1, -1);
      // a carved lantern on each goal
      for (const gx of [TX0 - 58, TX1 + 58]) {
        const y = laneY(MOUTH[0] - 0.5) - 26;
        r.circle(gx, y, 15).fill(0xff8a1c).stroke({ width: 3, color: COL.ink });
        r.rect(gx - 2, y - 20, 4, 7).fill(0x3d7a2a);
        r.poly([gx - 8, y - 4, gx - 3, y - 4, gx - 5.5, y - 9]).fill(0xffe28a);
        r.poly([gx + 3, y - 4, gx + 8, y - 4, gx + 5.5, y - 9]).fill(0xffe28a);
        r.poly([gx - 8, y + 4, gx + 8, y + 4, gx + 4, y + 8, gx, y + 5, gx - 4, y + 8]).fill(0xffe28a);
      }
    }
    // mist drifting at the goal mouths
    this.mistLayer.removeChildren().forEach((c) => c.destroy());
    this.mists = [];
    if (night) {
      for (let i = 0; i < 8; i++) {
        const side = i % 2;
        const m = new Graphics();
        const w = 120 + (i % 3) * 40;
        m.ellipse(0, 0, w, 40).fill({ color: 0xcfe3ee, alpha: 0.05 });
        m.ellipse(0, 0, w * 0.6, 24).fill({ color: 0xcfe3ee, alpha: 0.06 });
        const x0 = side === 0 ? TX0 + 40 + (i % 3) * 30 : TX1 - 40 - (i % 3) * 30;
        const y0 = LANE0 + PITCH_H / 2 + (Math.floor(i / 2) - 1.5) * 70;
        m.position.set(x0, y0);
        this.mistLayer.addChild(m);
        this.mists.push({ g: m, x0, y0, ph: i * 1.7 });
      }
    }
    // rod ends with grips: theirs stick out the top; yours end in the handle controls (drawn with them)
    this.knobLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const kg = new Graphics();
    for (let rod = 0; rod < 4; rod++) {
      const x = colX(colOf(1, rod));
      kg.rect(x - 4, LANE0 - RAIL - 14, 8, 14).fill(BRASS.bar);
      kg.roundRect(x - 13, LANE0 - RAIL - 30, 26, 20, 7).fill(night ? 0x8fb6c8 : THEM.main).stroke({ width: 2, color: COL.ink });
    }
    this.knobLayer.addChild(kg);
  }

  /** The two nets; `side` ripples with `amp` (0 = still). */
  netG = new Graphics();
  drawNets(side: number, amp: number) {
    const g = this.netG;
    if (!g.parent) this.fxLayer.addChildAt(g, 0);
    g.clear();
    for (const s of [0, 1]) {
      const gx = s === 0 ? TX0 - 50 : TX1;
      const y0 = laneY(MOUTH[0] - 0.5);
      const h = (MOUTH[1] - MOUTH[0] + 1) * LH;
      const a = s === side ? amp : 0;
      const bend = (y: number) => a * Math.sin(((y - y0) / h) * Math.PI) * (s === 0 ? -1 : 1);
      for (let i = 1; i < 5; i++) {
        g.moveTo(gx + i * 10 + bend(y0), y0);
        for (let y = y0; y <= y0 + h; y += 8) g.lineTo(gx + i * 10 + bend(y) * (i / 5), y);
      }
      for (let j = 1; j < h / 10; j++) {
        const y = y0 + j * 10;
        g.moveTo(gx, y).lineTo(gx + 50 + bend(y), y);
      }
    }
    g.stroke({ width: 1, color: this.haunted ? 0xcfe3ee : COL.cream, alpha: 0.2 });
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

  /** Builds the eight rods with their figures: your squad, and the rival's own launches (ghosts on the Haunted table). */
  buildRods() {
    const run = this.run;
    this.rodLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.dragLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rods = [[], []];
    if (!run) return;
    const m = run.s.match;
    const off = m ? m.off : [[4, 2, 0, 1], [5, 3, 1, 2]];
    const rivals = run.rivals();
    const ghost = run.mode === "haunt";
    this.disp.off = off.map((o) => o.slice());
    for (const side of [0, 1] as (0 | 1)[]) {
      for (let r = 0; r < 4; r++) {
        const d = RODS[r];
        const c = new Container();
        c.position.set(colX(colOf(side, r)), LANE0 + off[side][r] * LH);
        c.zIndex = colOf(side, r);
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
            const l = side === 0 ? run.s.squad[slot] : rivals[slot] || null;
            const fv = new FigureView(side, l, f, side === 0 ? "you" : ghost ? "ghost" : "them");
            fv.position.set(0, (f * d.gap + 0.5) * LH);
            if (fv.tag) {
              this.upright(fv.tag);
              if (this.port) {
                fv.tag.anchor.set(0, 0.5);
                fv.tag.position.set(-(FR + 4), side === 0 ? -FR - 18 : FR + 18);
                fv.tag.anchor.set(0.5, 0.5);
              }
            }
            if (side === 0) {
              fv.setStats(run.stats(slot));
              this.bindFigure(fv, slot, r);
            } else this.bindRival(fv);
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
        // your rods can be dragged by the bar itself: a wide strip along the rod answers
        if (side === 0 && !pulled) {
          const hit = new Container();
          hit.position.set(colX(colOf(0, r)), LANE0 - RAIL);
          hit.hitArea = new Rectangle(-30, 0, 60, PITCH_H + 2 * RAIL);
          hit.eventMode = "static";
          hit.cursor = "ns-resize";
          hit.on("pointerdown", (e) => this.dragStart(r, e));
          this.dragLayer.addChild(hit);
        }
      }
    }
    // the figures cross in column order, like a real table
    this.rodLayer.sortableChildren = true;
    this.syncGhostLook();
  }

  /** The phasing rod: see-through while it lets the ball pass. */
  syncGhostLook() {
    const run = this.run;
    const g = run?.s.match?.ghost;
    for (const rv of this.rods[1]) rv.c.alpha = 1;
    if (!run || !g) return;
    const rv = this.rods[1][g.rod];
    if (rv) rv.c.alpha = run.fadedRod() === g.rod ? 0.3 : 1;
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
    this.ball.position.set(rv.c.x + fwd * 30, rv.c.y + (b.fig * RODS[b.rod].gap + 0.5) * LH);
  }

  drawBall() {
    const g = this.ball;
    g.clear();
    if (this.haunted) {
      // a pumpkin: ribs, a stem
      g.circle(3, 4, 11).fill({ color: 0x000000, alpha: 0.45 });
      g.circle(0, 0, 18).fill({ color: 0xff8a1c, alpha: 0.12 });
      g.ellipse(0, 0, 11, 10).fill(0xf07a12).stroke({ width: 2, color: COL.ink });
      g.ellipse(0, 0, 5, 10).stroke({ width: 1.5, color: 0xb04a08 });
      g.moveTo(0, -10).lineTo(0, 10).stroke({ width: 1.5, color: 0xb04a08 });
      g.rect(-1.5, -14, 3, 5).fill(0x3d7a2a);
      g.circle(-4, -4, 2.5).fill({ color: 0xffd28a, alpha: 0.8 });
      return;
    }
    g.circle(3, 4, 10).fill({ color: 0x000000, alpha: 0.4 });
    g.circle(0, 0, 10).fill(0xfff6e6).stroke({ width: 2, color: COL.ink });
    g.circle(-3, -3, 3).fill({ color: 0xffffff, alpha: 0.9 });
  }

  // ================================================================ run lifecycle
  start(run: Run) {
    this.root.visible = true;
    for (const l of run.s.squad) tokenTexture(l.c, l.s, () => {});
    this.run = run;
    this.busy = false;
    this.calmSwirl();
    this.resize();
  }

  refreshAll() {
    const run = this.run;
    if (!run) return;
    this.tip.hide();
    // a phone's bench row comes and goes with what sits on it
    if (this.port && (this.L.area.y > 236) !== this.benchRow()) {
      this.resize();
      return;
    }
    this.drawBall();
    this.buildRods();
    this.syncBall();
    this.syncBench();
    this.hudNow = null;
    this.syncHud();
    this.showStage();
    this.syncControls();
  }

  syncBall() {
    const m = this.run?.s.match;
    this.ballFree = null;
    this.disp.ball = m && (this.run!.s.phase === "attack" || this.run!.s.phase === "defend") ? { ...m.ball } : null;
    this.placeBall();
    for (const side of this.rods) for (const rv of side) for (const f of rv.figs) f.setGlow(null);
    const b = this.disp.ball;
    if (b) this.rods[b.side]?.[b.rod]?.figs[b.fig]?.setGlow(b.side === 0 ? COL.money : COL.bad);
  }

  inMatch() {
    const p = this.run?.s.phase;
    return p === "attack" || p === "defend";
  }

  /** The left column (or the phone's top rows). Numbers come from `hudNow` while a touch plays back. */
  syncHud() {
    const run = this.run;
    if (!run) return;
    const s = run.s;
    const m = s.match;
    const h = this.hudNow || hudOf(run);
    const kind = m ? m.kind : s.kind;
    const boss = m ? m.boss : run.bossOf();
    const name = m ? m.club : run.clubName();
    const style = STYLES[m ? m.style : run.styleOf()];
    this.clubName.text = name;
    this.clubName.style.fill = run.mode === "haunt" ? 0xcfe3ee : kind === 0 ? COL.cyan : kind === 1 ? COL.money : COL.pink;
    const ghost = m?.ghost;
    const ghostLine = run.mode === "haunt" ? ` · ${GHOST_RULES.phasing.name}, ${GHOST_RULES.polter.name}, ${GHOST_RULES.dark.name}` : "";
    this.clubRule.text = boss
      ? `${BOSS[boss].text}. ${style.name}.${ghostLine}`
      : `${FIXTURE_NAME[kind]} · ${run.mode === "haunt" ? "Haunted table" : `round ${Math.min(s.round, run.rounds)} of ${run.rounds}`} · first to ${m ? m.target : 2} · ${style.name}${ghostLine}`;
    this.scoreYou.text = String(h.you);
    this.scoreThem.text = String(h.them);
    this.scoreYou.style.fill = look().kitHi;
    this.stat.round.text = run.mode === "haunt" ? `${Math.min(s.kind + 1, 3)}/3` : `${Math.min(s.round, run.rounds)}/${run.rounds}`;
    this.stat.fans.text = this.port ? `${s.fans} fans` : String(s.fans);
    this.stat.goals.text = String(h.goals);
    this.stat.wins.text = String(h.wins);
    const g = this.pips;
    g.clear();
    if (h.mode === "goal") {
      this.possText.text = "Goal";
      this.touchText.text = "Kick-off next";
    } else if (m && h.mode === "attack" && s.phase === "attack" && !this.hudNow) {
      this.possText.text = `Your ball · possession ${m.poss[0]} of ${m.limit}`;
      const free = m.free.reduce((a, b) => a + b, 0) + m.freeAny;
      const lines = [`${m.touches} touch${m.touches === 1 ? "" : "es"} left${free ? ` · ${free} free slide${free === 1 ? "" : "s"}` : ""}${m.dummy ? ` · they freeze for ${m.dummy}` : ""}`];
      if (ghost) {
        lines.push(run.fadedRod() >= 0 ? `Their ${RODS[ghost.rod].name.toLowerCase()} is FADED this touch` : `Their ${RODS[ghost.rod].name.toLowerCase()} is SOLID this touch, faded next`);
        const mv = run.driftNow();
        if (mv) lines.push(`After your next kick their ${RODS[mv.r].name.toLowerCase()} drifts ${mv.d < 0 ? (this.port ? "left" : "up") : this.port ? "right" : "down"}`);
      }
      this.touchText.text = lines.join("\n");
      for (let i = 0; i < m.touches; i++) g.circle((i - (m.touches - 1) / 2) * 30, 0, 11).fill(COL.money).stroke({ width: 3, color: COL.ink });
    } else if (m && h.mode === "defend" && s.phase === "defend" && !this.hudNow) {
      this.possText.text = `Their ball · ${m.aiTouches} touch${m.aiTouches === 1 ? "" : "es"} left`;
      this.touchText.text = `${m.blockSlides} block slide${m.blockSlides === 1 ? "" : "s"} left. Slide into the red lanes, then Ready.`;
      for (let i = 0; i < m.blockSlides; i++) g.roundRect((i - (m.blockSlides - 1) / 2) * 30 - 10, -10, 20, 20, 4).fill(COL.cyan).stroke({ width: 3, color: COL.ink });
    } else if (this.hudNow && (h.mode === "attack" || h.mode === "defend")) {
      // mid-playback: whose ball it is, the counts settle when the touch is done
      this.possText.text = h.mode === "attack" ? "Your ball" : "Their ball";
      this.touchText.text = "";
    } else {
      const ph = s.phase;
      if (ph === "fixture") {
        this.possText.text = `Next up: ${FIXTURE_NAME[s.kind].toLowerCase()}`;
        this.touchText.text = `${run.clubName()} · first to ${boss === "bell" ? 3 : 2} · a win is +${WIN_FANS[s.kind]} fans`;
      } else {
        this.possText.text = ph === "room" ? "Dressing room" : ph === "fulltime" ? "Full time" : ph === "won" ? "Champions" : ph === "over" ? "Season over" : "";
        this.touchText.text = ph === "room" ? `${s.fans} fans to spend` : "";
      }
    }
    const ch = ui.challenge;
    this.chalText.text = ch ? `Beat ${ch.name || "the challenger"}: ${ch.won ? "won the season" : `round ${ch.round}`}, best goal ${fmt(ch.best)}` : "";
    this.benchLabel.text = `COACHES ${s.coaches.length}/${MAX_COACHES}`;
    this.playLabel.text = `SET PIECES ${s.plays.length}/${MAX_PLAYS}`;
    // during playback the buttons follow what is on the table, not where the engine already is
    const shown = this.hudNow ? this.hudNow.mode : s.phase;
    this.btnReady.visible = shown === "defend";
    this.btnHint.visible = shown === "attack";
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
    if (this.port && !this.benchRow()) return;
    const sc = L.benchScale;
    const w = PW * sc;
    const h = PH * sc;
    // empty seats read as seats: a dim silhouette and what goes there
    const seat = (x: number, y: number, what: string, coach: boolean) => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-w / 2, -h / 2, w, h, 8).fill({ color: 0x000000, alpha: 0.2 }).stroke({ width: 2, color: COL.edge, alpha: 0.8 });
      if (coach) {
        g.circle(0, -h * 0.18, w * 0.17).fill({ color: COL.edge, alpha: 0.6 });
        g.roundRect(-w * 0.28, -h * 0.02, w * 0.56, h * 0.22, 8).fill({ color: COL.edge, alpha: 0.6 });
      } else {
        // a corner flag: pole, pennant and the corner arc
        g.moveTo(-w * 0.12, h * 0.14).lineTo(-w * 0.12, -h * 0.34).stroke({ width: 2, color: COL.edge, alpha: 0.8 });
        g.poly([-w * 0.12, -h * 0.34, w * 0.2, -h * 0.24, -w * 0.12, -h * 0.13]).fill({ color: COL.edge, alpha: 0.6 });
        g.arc(-w * 0.12, h * 0.14, w * 0.22, -Math.PI / 2, 0).stroke({ width: 2, color: COL.edge, alpha: 0.5 });
      }
      const t = txt(what, { fontSize: 9, fill: COL.dim, align: "center", wordWrap: true, wordWrapWidth: w - 6, lineHeight: 10 });
      t.anchor.set(0.5, 0);
      t.position.set(0, h * 0.24);
      t.alpha = 0.85;
      c.addChild(g, t);
      c.position.set(x, y);
      this.benchLayer.addChild(c);
    };
    for (let i = run.s.coaches.length; i < MAX_COACHES; i++) seat(L.coachX + i * L.coachStep, L.coachY, "Coach slot", true);
    for (let i = run.s.plays.length; i < MAX_PLAYS; i++) seat(L.playX + i * L.playStep, L.playY, "Set piece", false);
    if (!this.port && !run.s.coaches.length && !run.s.plays.length) {
      const t = txt("Empty for now. Coaches and set pieces come from the dressing room after your first match.", { fontSize: 11, fill: COL.dim, wordWrap: true, wordWrapWidth: 170, lineHeight: 14 });
      t.position.set(150, L.playY - 30);
      t.alpha = 0.8;
      this.benchLayer.addChild(t);
    }
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
      v.scale.set(sc);
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

  // ================================================================ figures: the data tag, and dragging their rod
  bindFigure(fv: FigureView, slot: number, rod: number) {
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
      this.dragStart(rod, e);
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
    fv.on("globalpointermove", () => {
      if (this.dragged) stop();
    });
    fv.on("pointertap", () => {
      stop();
      if (this.dragged) {
        this.dragged = false;
        return;
      }
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
        if (!fv.destroyed && !this.drag) this.figTag(fv, slot, false);
      }, 280);
    });
    fv.on("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverT);
      if (!this.tipPinned) this.tip.hide();
    });
  }

  /** Their figures are launches too: hover or tap for the tag, hold for the full page. */
  bindRival(fv: FigureView) {
    const l = fv.launch;
    if (!l) return;
    let timer = 0;
    fv.on("pointerover", (e) => {
      if (e.pointerType === "mouse") this.rivalTag(fv, l, false);
    });
    fv.on("pointerout", (e) => {
      if (e.pointerType === "mouse" && !this.tipPinned) this.tip.hide();
    });
    fv.on("pointerdown", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setUi({ detail: { l } }), 800);
    });
    fv.on("pointerup", () => clearTimeout(timer));
    fv.on("pointerupoutside", () => clearTimeout(timer));
    fv.on("pointertap", () => {
      clearTimeout(timer);
      this.rivalTag(fv, l, true);
    });
  }

  rivalTag(fv: FigureView, l: Launch, pinned: boolean) {
    const run = this.run;
    if (!run || fv.destroyed) return;
    const f = figureFacts(l, run.ageHours(l));
    const club = run.s.match?.club || run.clubName();
    const lines = [run.mode === "haunt" ? `Ghost: ${ghostWhy(l)}` : `Plays for ${club}`, ...f.lines.slice(1, 7).map(([k, v]) => `${k}: ${v}`)];
    this.tipPinned = pinned;
    this.tip.hide();
    const p = this.root.toLocal(fv.getGlobalPosition());
    this.tip.show(`${f.title} · ${club}`, lines.join("\n"), p.x, p.y - 30, { w: this.L.W, h: this.L.H }, run.mode === "haunt" ? 0xcfe3ee : THEM.hi, 360);
  }

  figTag(fv: FigureView, slot: number, pinned: boolean) {
    const run = this.run;
    if (!run || fv.destroyed) return;
    const l = run.s.squad[slot];
    const f = figureFacts(l, run.ageHours(l), run.statSources(l));
    const lines = f.lines.map(([k, v]) => `${k}: ${v}`);
    lines.push(pinned ? "Keep holding for its launch page" : "Hold the figure for its launch page. Drag it to slide its rod.");
    this.tipPinned = pinned;
    this.tip.hide();
    const p = this.root.toLocal(fv.getGlobalPosition());
    this.tip.show(`${f.title} · ${RODS[slot === 0 ? 0 : slot <= 2 ? 1 : slot <= 7 ? 2 : 3].name.toLowerCase()}`, lines.join("\n"), p.x, p.y - 30, { w: this.L.W, h: this.L.H }, look().kitHi, 380);
  }

  // ---------------------------------------------------------------- drag a rod: half a lane of travel slides it one lane
  dragStart(r: number, e: FederatedPointerEvent) {
    if (!this.inMatch() || this.busy) return;
    this.dragged = false;
    this.drag = { r, y0: this.tbl.toLocal(e.global).y, done: false, id: e.pointerId };
  }
  dragMove(e: FederatedPointerEvent) {
    const d = this.drag;
    if (!d || d.done || e.pointerId !== d.id) return;
    const dy = this.tbl.toLocal(e.global).y - d.y0;
    if (Math.abs(dy) > 10) this.dragged = true;
    if (Math.abs(dy) < LH * 0.45) return;
    d.done = true;
    const dir: Dir = dy < 0 ? -1 : 1;
    this.tip.hide();
    const run = this.run;
    if (!run || this.busy) return;
    if (!run.canMove(0, d.r, dir) || (run.s.phase === "attack" ? run.slideCost(d.r) > run.m.touches : run.m.blockSlides <= 0)) {
      sfx.error();
      // the rod knocks against its stop
      const rv = this.rods[0][d.r];
      if (rv) {
        const y = rv.c.y;
        void tween(rv.c, { y: y + dir * 6 }, 60).then(() => tween(rv.c, { y }, 140, ease.outBack));
      }
      return;
    }
    this.doSlide(d.r, dir);
  }
  dragEnd() {
    this.drag = null;
    // the tap that ends a drag must not count as a tap on a figure
    setTimeout(() => (this.dragged = false), 0);
  }

  // ================================================================ controls: rod handles, kick targets, threats
  syncControls() {
    const run = this.run;
    this.ctrlLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.guideLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.arrows = {};
    if (!run || !this.inMatch()) return;
    this.syncGhostLook();
    const s = run.s;
    const m = run.m;
    const attack = s.phase === "attack";
    // your handles: the rod comes out of the cabinet, the two slide buttons are its grip
    const hg = new Graphics();
    this.ctrlLayer.addChild(hg);
    for (let r = 0; r < 4; r++) {
      const x = colX(colOf(0, r));
      const pulled = m.pulled === r;
      const locked = m.frozen === r || (r === 0 && m.boss === "lockup");
      const cost = attack ? run.slideCost(r) : 0;
      hg.rect(x - 5, HANDLE_Y - 4, 10, ARROW_H * 2 + 18).fill(pulled ? { color: BRASS.bar, alpha: 0.25 } : BRASS.bar);
      hg.roundRect(x - ARROW_W / 2 - 4, CTRL_Y - 2, ARROW_W + 8, ARROW_H * 2 + 14, 14).fill({ color: COL.ink, alpha: 0.85 });
      for (const d of [-1, 1] as Dir[]) {
        const ok = !this.busy && !pulled && run.canMove(0, r, d) && (attack ? cost <= m.touches : m.blockSlides > 0);
        const b = this.arrow(d, ok, () => void this.doSlide(r, d));
        b.position.set(x, CTRL_Y + 2 + ARROW_H / 2 + (d === -1 ? 0 : ARROW_H + 6));
        this.ctrlLayer.addChild(b);
        this.arrows[`${r}${d}`] = b;
      }
      const capText = pulled ? "PULLED" : locked ? "LOCKED" : attack && cost === 0 && (m.free[r] > 0 || m.freeAny > 0) ? "FREE SLIDE" : attack && cost === 2 ? "2 TOUCHES" : RODS[r].name.toUpperCase();
      const cap = txt(capText, { fontSize: 13, fill: pulled || locked ? COL.bad : cost === 0 && attack && capText === "FREE SLIDE" ? COL.cyan : COL.cream2, stroke: { color: COL.ink, width: 4 } });
      cap.anchor.set(0.5);
      cap.position.set(x, capY());
      this.upright(cap);
      if (this.port) cap.position.set(x, CTRL_Y + ARROW_H + 6);
      if (this.port) cap.visible = false;
      this.ctrlLayer.addChild(cap);
    }
    this.drawGhostMarks();
    if (this.busy) return;
    if (attack) this.drawKicks();
    else this.drawThreats();
  }

  /** The ghost rules at their handles: the phasing rod's state, and the poltergeist's next drift. */
  drawGhostMarks() {
    const run = this.run!;
    const g = run.s.match?.ghost;
    if (!g) return;
    const attack = run.s.phase === "attack";
    const px = colX(colOf(1, g.rod));
    const faded = run.fadedRod() === g.rod;
    const tag = txt(attack ? (faded ? "FADED" : "SOLID") : "PHASING", {
      fontSize: 12,
      fill: !attack ? 0xcfe3ee : faded ? COL.dim : COL.cyan,
      stroke: { color: COL.ink, width: 4 },
    });
    tag.anchor.set(0.5);
    tag.position.set(px, LANE0 - RAIL - 38);
    this.upright(tag);
    this.ctrlLayer.addChild(tag);
    const mv = run.driftNow();
    if (!mv) return;
    const x = colX(colOf(1, mv.r));
    const a = new Graphics();
    const same = mv.r === g.rod;
    const y = LANE0 - RAIL - 38;
    // a wisp arrow: the way the rod will drift after your next kick
    a.circle(0, 0, 16).fill({ color: 0xcfe3ee, alpha: 0.18 }).stroke({ width: 2, color: 0xcfe3ee, alpha: 0.8 });
    const t = 8;
    if (mv.d < 0) a.poly([-t, 0, t * 0.6, -t * 0.9, t * 0.6, t * 0.9]).fill(0xcfe3ee);
    else a.poly([t, 0, -t * 0.6, -t * 0.9, -t * 0.6, t * 0.9]).fill(0xcfe3ee);
    a.rotation = Math.PI / 2;
    a.position.set(x + (same ? 44 : 0), y);
    (a as Container & { label: string }).label = "drift";
    this.ctrlLayer.addChild(a);
  }

  arrow(d: Dir, enabled: boolean, fn: () => void): Container {
    const c = new Container();
    const g = new Graphics();
    const w = ARROW_W;
    const h = ARROW_H;
    const col = enabled ? COL.play : 0x4a3346;
    g.roundRect(-w / 2, -h / 2 + 4, w, h, 12).fill(0x0a2a30);
    g.roundRect(-w / 2, -h / 2, w, h, 12).fill(col).stroke({ width: 3, color: COL.ink });
    g.roundRect(-w / 2 + 6, -h / 2 + 4, w - 12, 6, 3).fill({ color: 0xffffff, alpha: enabled ? 0.18 : 0.05 });
    const t = 14;
    if (d === -1) g.poly([0, -t, t * 1.2, t * 0.7, -t * 1.2, t * 0.7]).fill({ color: COL.cream, alpha: enabled ? 1 : 0.35 });
    else g.poly([0, t, t * 1.2, -t * 0.7, -t * 1.2, -t * 0.7]).fill({ color: COL.cream, alpha: enabled ? 1 : 0.35 });
    c.addChild(g);
    c.eventMode = "static";
    c.cursor = enabled ? "pointer" : "default";
    c.hitArea = new Rectangle(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
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
      if (k.open) this.dashed(g, pts, shot ? COL.money : COL.cream, hl ? 1 : shot ? 0.9 : 0.6, hl ? 6 : 4);
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
        mg.circle(0, 0, 25).fill({ color: COL.ink, alpha: 0.75 }).stroke({ width: 5, color: col });
        mg.circle(0, 0, 9).fill(col);
      } else mg.circle(0, 0, FR + 9).stroke({ width: 4, color: col, alpha: 0.95 });
      c.addChild(mg);
      c.position.set(t.x, t.y);
      c.eventMode = "static";
      c.cursor = "pointer";
      // generous, but never wider than a lane and a half, so two targets side by side stay apart
      c.hitArea = new Rectangle(-44, -25, 88, 50);
      c.on("pointertap", () => void this.doKick(t.kick));
      // hover previews only for a mouse: a finger's pointerover would rebuild the targets under the tap
      c.on("pointerover", (e) => e.pointerType === "mouse" && this.hoverTarget(i));
      c.on("pointerout", (e) => e.pointerType === "mouse" && this.hoverTarget(null));
      (c as Container & { label: string }).label = t.kick.r === 4 ? "shot" : "pass";
      this.guideLayer.addChild(c);
    });
    const holder = this.rods[0][ball.rod]?.figs[ball.fig];
    for (const rv of this.rods[0]) for (const f of rv.figs) f.setRing(null);
    holder?.setRing(COL.money, 5);
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
    holder?.setRing(COL.bad, 5);
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
    const before = hudOf(run);
    if (!this.act(a)) return;
    this.busy = true;
    this.hudNow = before;
    this.syncHud();
    this.syncControls();
    this.btnReady.setEnabled(false);
    this.btnHint.setEnabled(false);
    try {
      await this.playEvents(run.events.slice());
    } finally {
      this.busy = false;
      this.hudNow = null;
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
    if (this.port && !this.benchRow()) {
      this.refreshAll();
      return;
    }
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
      if (this.hudNow) {
        this.hudNow = hudStep(this.hudNow, ev);
        this.syncHud();
      }
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
    const ghost = why === "ghost";
    if (ghost) {
      sfx.polter();
      // a wisp runs down the rod before it moves
      const w = new Graphics().rect(-16, LANE0, 32, PITCH_H).fill({ color: 0xcfe3ee, alpha: 0.22 });
      w.x = rv.c.x;
      this.fxLayer.addChild(w);
      void tween(w, { alpha: 0 }, 700).then(() => w.destroy());
      const p = this.root.toLocal(this.tbl.toGlobal({ x: rv.c.x, y: LANE0 + 20 }));
      this.floatText("Poltergeist", p.x, p.y, 0xcfe3ee, 26);
      await wait(160);
    } else sfx.slide(side === 0);
    // the rod carries weight: it overshoots a touch and settles with a thunk
    const dur = why === "react" || why === "mirror" ? 160 : ghost ? 420 : 210;
    await tween(rv.c, { y: LANE0 + this.disp.off[side][r] * LH }, dur, ghost ? ease.inOut : ease.outBack);
    if (side === 0 && (why === "you" || why === "block")) sfx.thunk();
    if (why === "react" || why === "ai") await wait(60);
    if (ghost) this.syncGhostLook();
  }

  async animKick(ev: Extract<Ev, { e: "kick" }>) {
    const side = ev.side;
    const lane = laneOf(ev.rod, this.disp.off[side][ev.rod], ev.fig);
    const x0 = colOf(side, ev.rod);
    let upTo: number | undefined;
    if (ev.at) upTo = Math.abs(colOf(side === 0 ? 1 : 0, ev.at.rod) - x0);
    const pts = this.pathPoints(side, ev.rod, lane, ev.kick, ev.drift, upTo);
    const holder = this.rods[side][ev.rod]?.figs[ev.fig];
    for (const sd of this.rods) for (const rv of sd) for (const f of rv.figs) f.setGlow(null);
    // the kick: the figure swings round its rod, then the ball flies
    if (holder) holder.swing(tween, ease.outBack);
    sfx.kick(ev.beaten > 0);
    await wait(70);
    this.ballFree = { x: this.ball.x, y: this.ball.y };
    // the ball leaves fast and loses pace along the way
    const total = pts.length;
    const dur = Math.min(620, 150 + total * 11) / (ev.kick.r === 4 ? 1.3 : 1);
    const pos = { k: 0 };
    let last = -1;
    const run = tween(pos, { k: 1 }, dur, (t) => 1 - Math.pow(1 - t, 2.2));
    await new Promise<void>((res) => {
      const step = () => {
        const i = Math.min(total - 1, Math.floor(pos.k * (total - 1) + 1e-6));
        if (i !== last) {
          for (let j = last + 1; j <= i; j++) if (j % 2 === 0) this.trailDot(pts[j].x, pts[j].y);
          last = i;
          const p = pts[i];
          this.ball.position.set(p.x, p.y);
        }
        if (pos.k >= 1) res();
        else requestAnimationFrame(step);
      };
      void run.then(() => {
        pos.k = 1;
      });
      step();
    });
    const pEnd = pts[total - 1];
    this.ball.position.set(pEnd.x, pEnd.y);
    if (ev.result === "blocked" || ev.result === "kept") {
      const ghostBlock = this.haunted && side === 0;
      sfx.block();
      if (ghostBlock) sfx.ghostBlock();
      this.shake = Math.min(1, this.shake + 0.3);
      const blocker = ev.at ? this.rods[side === 0 ? 1 : 0][ev.at.rod]?.figs[ev.at.fig] : null;
      if (blocker) {
        blocker.scale.set(1.3);
        void tween(blocker.scale, { x: 1, y: 1 }, 280, ease.outBack);
      }
      // the clack: a white flash where ball meets figure
      const fl = new Graphics().circle(0, 0, 22).fill({ color: ghostBlock ? 0xcfe3ee : 0xffffff, alpha: 0.7 });
      fl.position.copyFrom(this.ball.position);
      this.fxLayer.addChild(fl);
      void tween(fl.scale, { x: 2, y: 2 }, 220);
      void tween(fl, { alpha: 0 }, 220).then(() => fl.destroy());
      const p = this.root.toLocal(this.tbl.toGlobal(this.ball.position));
      this.floatText(ev.result === "kept" ? "Kept it" : side === 0 ? (ghostBlock ? "Ghost block" : "Blocked") : "Saved", p.x, p.y - 40, ev.result === "kept" ? COL.cyan : side === 0 ? COL.bad : COL.good, 30);
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
    const ember = this.haunted;
    const d = new Graphics().circle(0, 0, ember ? 5 : 7).fill({ color: ember ? 0xff7a1c : 0xfff6e6, alpha: ember ? 0.85 : 0.5 });
    d.position.set(x, y);
    this.ballLayer.addChildAt(d, 0);
    void tween(d, { alpha: 0 }, ember ? 420 : 260).then(() => d.destroy());
    void tween(d.scale, { x: 0.2, y: 0.2 }, ember ? 420 : 260);
    if (ember) void tween(d, { y: y - 14 }, 420);
  }

  async animGoal(side: 0 | 1, rating: number, style: string) {
    const L = this.L;
    const digit = side === 0 ? this.scoreYou : this.scoreThem;
    digit.scale.set(1.6);
    void tween(digit.scale, { x: 1, y: 1 }, 420, ease.outBack);
    const gx = side === 0 ? TX1 + 30 : TX0 - 30;
    const net = new Graphics().rect(side === 0 ? TX1 : TX0 - 50, laneY(MOUTH[0] - 0.5), 50, (MOUTH[1] - MOUTH[0] + 1) * LH).fill({ color: side === 0 ? COL.money : COL.bad, alpha: 0.4 });
    this.fxLayer.addChild(net);
    void tween(net, { alpha: 0 }, 900).then(() => net.destroy());
    this.ball.position.set(gx, this.ball.y);
    // the net bellies out and settles
    const rip = { a: 18 };
    const netSide = side === 0 ? 1 : 0;
    if (!reduced()) {
      const ripple = tween(rip, { a: 0 }, 700, (t) => t);
      const step = () => {
        this.drawNets(netSide, rip.a * Math.cos((1 - rip.a / 18) * 9));
        if (rip.a > 0.01) requestAnimationFrame(step);
        else this.drawNets(0, 0);
      };
      step();
      void ripple;
    }
    if (side === 0) {
      if (this.haunted) sfx.hauntGoal();
      else sfx.goal();
      sfx.crowd();
      this.heat = 1;
      this.shake = 1;
      const banner = txt("GOAL", { fontFamily: NUM, fontSize: this.port ? 120 : 140, fill: this.haunted ? 0xff8a1c : COL.money, stroke: { color: COL.ink, width: 12 } });
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
      this.burst(cx - 220, cy, this.haunted ? 0xff8a1c : COL.money, 22);
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
    if (won) sfx.crowd();
    const run = this.run!;
    const final = run.s.phase === "won";
    const text = final ? (run.mode === "haunt" ? "LAID TO REST" : "CHAMPIONS") : won ? "FULL TIME" : draw ? "LEVEL: THROUGH" : "KNOCKED OUT";
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

  // ================================================================ stage panels: match day, full time, dressing room
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

  private stageBox(h: number, title: string, color: number, full = false): { c: Container; w: number } {
    const a = this.L.area;
    const w = full ? a.w : Math.min(a.w, this.port ? a.w : 1000);
    const x = a.x + (a.w - w) / 2;
    const y = this.port || full ? a.y : a.y + Math.max(0, (a.h - h) / 2 - 20);
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

  /** Match day: the round's three clubs with their crests and how they play, your eleven, and the way to the dressing room. */
  fixturePanel() {
    const run = this.run!;
    const s = run.s;
    const port = this.port;
    const haunt = run.mode === "haunt";
    const h = this.L.area.h;
    const { c, w } = this.stageBox(h, haunt ? "HAUNTED TABLE" : `ROUND ${s.round} · MATCH DAY`, haunt ? 0xcfe3ee : COL.money, true);
    const sub = txt(
      haunt
        ? `Three ghost clubs made of the cut's quietest launches. Live ${"through " + "6 Nov"}. ${s.fans} fans.`
        : `${s.fans} fans · ${s.cleared} won · round ${s.round} of ${run.rounds}`,
      { fontSize: 15, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: w - 40 },
    );
    sub.anchor.set(0.5, 0);
    sub.position.set(w / 2, 62);
    c.addChild(sub);
    // the three tiles take the upper part, your line-up the lower
    const tilesTop = 96;
    let lineupH = port ? 330 : 290;
    const buttonsH = 84;
    const spare = h - tilesTop - lineupH - buttonsH - 10;
    const th = Math.min(spare, port ? 440 : 420);
    lineupH += spare - th;
    const gap = 14;
    const tw = (w - 32 - 2 * gap) / 3;
    for (let k = 0; k < 3; k++) {
      const x = 16 + k * (tw + gap);
      const y = tilesTop;
      const cur = k === s.kind;
      const done = k < s.kind;
      const boss = run.bossOf(k);
      const col = haunt ? 0xcfe3ee : k === 0 ? COL.cyan : k === 1 ? COL.money : COL.pink;
      const tile = panel(tw, th, cur ? COL.panelHi : COL.ink, cur ? col : COL.edge);
      tile.position.set(x, y);
      if (done) tile.alpha = 0.6;
      c.addChild(tile);
      const kindT = txt(FIXTURE_NAME[k].toUpperCase(), { fontSize: 12, fill: COL.dim });
      kindT.anchor.set(0.5, 0);
      kindT.position.set(x + tw / 2, y + 10);
      const nm = run.clubName(k);
      const name = txt(nm, { fontSize: port ? 16 : 20, fill: col, align: "center", wordWrap: true, wordWrapWidth: tw - 14 });
      name.anchor.set(0.5, 0);
      name.position.set(x + tw / 2, y + 30);
      c.addChild(kindT, name);
      const R = Math.max(22, Math.min(port ? 34 : 46, th * 0.11));
      const em = crest(nm, haunt ? "ghost" : boss ? "boss" : "club", R);
      em.position.set(x + tw / 2, name.y + name.height + R * 1.25);
      c.addChild(em);
      const lv = run.levelOf(k);
      const st = STYLES[run.styleOf(k)];
      const p = lv >= 10 ? "Full strength" : lv >= 8 ? "Shoots through a blocker" : lv >= 6 ? "More touches" : lv >= 4 ? "Reads your blocks" : lv >= 3 ? "Two slides a touch" : lv >= 2 ? "Shuts passing lanes" : "Covers the shots";
      const info = txt(`${st.name}\n${p}\nFirst to ${boss === "bell" ? 3 : 2} · win +${WIN_FANS[k]} fans`, { fontSize: port ? 12 : 14, fill: COL.cream2, align: "center", lineHeight: port ? 16 : 19, wordWrap: true, wordWrapWidth: tw - 12 });
      info.anchor.set(0.5, 0);
      info.position.set(x + tw / 2, em.y + R * 1.3);
      c.addChild(info);
      const bottom = y + th - (cur ? (port ? 84 : 76) : 50);
      if (boss) {
        const bt = txt(BOSS[boss].text, { fontSize: port ? 12 : 14, fill: COL.cream, align: "center", wordWrap: true, wordWrapWidth: tw - 16, lineHeight: port ? 15 : 18 });
        bt.anchor.set(0.5, 0);
        bt.position.set(x + tw / 2, info.y + info.height + 8);
        const room = bottom - bt.y;
        if (bt.height > room) bt.scale.set(Math.max(0.6, room / bt.height));
        c.addChild(bt);
      }
      if (cur) {
        const btn = new Button("Kick off", Math.min(tw - 16, 200), port ? 72 : 62, COL.play, () => this.doGo(), { size: 24 });
        btn.position.set(x + tw / 2, y + th - (port ? 46 : 42));
        btn.hitArea = new Rectangle(-tw / 2 + 4, -(port ? 44 : 40), tw - 8, port ? 84 : 76);
        c.addChild(btn);
      } else {
        const st2 = txt(done ? "DONE" : "UP NEXT", { fontFamily: NUM, fontSize: 28, fill: done ? COL.good : COL.dim });
        st2.anchor.set(0.5);
        st2.position.set(x + tw / 2, y + th - 28);
        c.addChild(st2);
      }
    }
    // your eleven on four short rods, front line first, each rod across the box like the table seen from your end
    const ly = tilesTop + th + 10;
    const box = panel(w - 32, lineupH - 10, COL.ink, COL.edge);
    box.position.set(16, ly);
    c.addChild(box);
    const head = txt("YOUR ELEVEN · tap a figure for its launch", { fontSize: 12, fill: COL.dim });
    head.position.set(30, ly + 8);
    c.addChild(head);
    const rowH = (lineupH - 46) / 4;
    const labW = port ? 0 : 110;
    [3, 2, 1, 0].forEach((r, i) => {
      const cy = ly + 34 + rowH * (i + 0.5);
      if (labW) {
        const lab = txt(RODS[r].name.toUpperCase(), { fontSize: 12, fill: COL.cream2 });
        lab.anchor.set(0, 0.5);
        lab.position.set(32, cy);
        c.addChild(lab);
      }
      const x0 = 32 + labW;
      const x1 = w - 40;
      const bar = new Graphics().rect(x0, -3, x1 - x0, 6).fill(BRASS.bar);
      bar.y = cy;
      c.addChild(bar);
      const n = RODS[r].n;
      const k = Math.min(port ? 1.05 : 0.78, rowH / 78);
      for (let f = 0; f < n; f++) {
        const slot = RODS[r].slot + f;
        const fv = new FigureView(0, s.squad[slot], f);
        fv.rotation = -Math.PI / 2;
        fv.scale.set(k);
        if (fv.tag) {
          fv.tag.rotation = Math.PI / 2;
          fv.tag.anchor.set(0, 0.5);
          fv.tag.position.set(0, 0);
          fv.tag.position.set(-6, FR + 16);
        }
        fv.setStats(run.stats(slot));
        fv.position.set(x0 + ((x1 - x0) * (f + 0.5)) / n - 20 * k, cy);
        fv.on("pointertap", () => setUi({ detail: { l: s.squad[slot], slot } }));
        c.addChild(fv);
      }
    });
    // the way to the line-up and the dressing room
    const by = h - buttonsH / 2 - 6;
    const bw = Math.min(260, (w - 60) / 2);
    const sq = new Button("Line-up", bw, 62, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 21 });
    sq.position.set(w / 2 - bw / 2 - 10, by);
    const canRoom = s.visit > 0;
    const room = new Button(canRoom ? `Dressing room · ${s.fans} fans` : "Dressing room after match 1", bw, 62, canRoom ? COL.money : COL.neutral, () => this.doBack(), { size: canRoom ? 19 : 15 });
    if (canRoom) room.caption.style.fill = COL.ink;
    room.setEnabled(canRoom);
    room.position.set(w / 2 + bw / 2 + 10, by);
    c.addChild(sq, room);
  }

  doBack() {
    if (!this.act({ t: "back" })) return;
    sfx.click();
    this.refreshAll();
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
    if (boss && !this.haunted) {
      setSwirlColors(this.swirl, 0x2e0612, 0x3d0b1c, 0xb3123f);
      this.heat = 0.6;
    } else this.calmSwirl();
    this.busy = true;
    this.buildRods();
    this.showStage();
    this.hudNow = null;
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
    const h = Math.min(this.L.area.h - 6, port ? 640 : 600);
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
    const sc = port ? 1.1 : 1.12;
    const step = Math.min((w - 40) / Math.max(1, n), PW * sc + 44);
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
    const sq = new Button("Line-up", 230, 64, COL.neutral, () => this.hooks.openOverlay("squad"), { size: 21 });
    sq.position.set(w / 2 - (port ? 130 : 140), by);
    const next = new Button("Match day", 230, 64, COL.play, () => this.doNext(), { size: 21 });
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
        setUi({ coach: { step: 9, text: `Slide your ${RODS[p.r].name.toLowerCase()} ${p.d < 0 ? (this.port ? "left" : "up") : this.port ? "right" : "down"} one lane: drag the rod, or the ${p.d < 0 ? "top" : "bottom"} button at its handle.` } });
        this.pulseArrow(p.r, p.d);
      }
    } else if (run.s.phase === "defend") {
      const b = bestBlock(run);
      setUi({ coach: { step: 9, text: b ? `Block: slide your ${RODS[b.r].name.toLowerCase()} ${b.d < 0 ? "up" : "down"}.` : "Nothing to block that helps. Press Ready." } });
      if (b) this.pulseArrow(b.r, b.d);
    }
  }

  pulseArrow(r: number, d: Dir) {
    const a = this.arrows[`${r}${d}`];
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
  /** For QA: where a handle button of your rod is on screen. */
  screenOfArrow(r: number, d: Dir): { x: number; y: number } | null {
    const a = this.arrows[`${r}${d}`];
    if (!a) return null;
    const p = a.getGlobalPosition();
    return { x: p.x, y: p.y };
  }
}
