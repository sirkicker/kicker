// The table: everything drawn in Pixi. State lives in the shared engine; this file shows it and plays back
// what the engine says happened (slides, kicks, blocks, goals), one event at a time.
// 3.0: the stands (crowd.ts), the desk's wire (desk.ts), boss rules on the table (rules.ts), the replay
// (replay.ts), the goal moment, the reaction preview, and music that follows the match. The screens
// around the table use Game.onMoment, playReplay and crowdLevel.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, type FederatedPointerEvent } from "pixi.js";
import { BOSS, COACH, DRILL, GHOST_RULES, LANES, MAX_COACHES, MAX_PLAYS, MOUTH, PLAY, TIER_NAME, RODS, STYLES, type DrillId } from "../shared/content.js";
import { fixtureLabel, targetOf, winFansOf } from "./season.js";
import { colOf, laneOf, slotOf, type Action, type BestGoal, type Dir, type Ev, type Kick, type Run, type RuleView, type TableEventId } from "../shared/engine.js";
import { ghostWhy, traitsOf, type Launch } from "../shared/data.js";
import { bestBlock, bestTouch, botStep } from "../shared/bot.js";
import { figureFacts } from "../shared/insight.js";
import { lineFor } from "../shared/voice.js";
import { setCrowdBed, setMood, sfx, type Mood } from "./audio.js";
import { local, setUi, showTip, toast, ui } from "./store.js";
import { CoachView, FR, FigureView, ItemView, PH, PW, hslHex, tokenTexture, txt } from "./figures.js";
import { crtFilter, setSwirlColors, swirlFilter, type FxFilter } from "./fx.js";
import { BRASS, COL, NUM, TAPE, THEM, cssHex, kitOf } from "./theme.js";
import { look } from "./house.js";
import { ease, hitStop, reduced, setTimeScale, tween, wait } from "./tween.js";
import { Button, Tip, fmt, panel } from "./widgets.js";
import { hudOf, hudStep, type Hud } from "./hud.js";
import { drawStage, type StageHost } from "./stage.js";
import { CAB_B, CAB_T, CTRL_Y, DESK_P, HANDLE_Y, LANE0, LH, PITCH_H, RAIL, RAIL_T, STAND_T, TS_H, TS_W, TX0, TX1, colX, laneY, mirror } from "./table.js";
import { Crowd, loadCrowd } from "./crowd.js";
import { Desk, type Tone } from "./desk.js";
import { EVENT_LOOK, RULE_LABEL, bellIcon, crest, eventBadge, glove, haltTape, padlock, ruleBadge, rug } from "./rules.js";
import { playPath } from "./replay.js";

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

/** The table's big moments, for the screens around it. */
export type Moment = "goal" | "conceded" | "fulltime" | "replay-ready" | "replay-done" | "boss-walkout-done" | "lane-open";

export interface GameHooks {
  onAction(a: Action, run: Run): void;
  onOver(run: Run): void;
  openOverlay(o: "squad" | "options" | "how" | "boss"): void;
  /** Optional: told about the table's big moments as they happen. */
  onMoment?(kind: Moment, data?: unknown): void;
}

// ------------------------------------------------------------ table space (drawn flat, turned upright on phones): src/table.ts
const ARROW_W = 92;
/** Handle buttons are taller (wider on screen) on phones, where the table stands upright and has no labels under them. */
let ARROW_H = 58;
const capY = () => CTRL_Y + ARROW_H * 2 + 24;
/** The phone's HUD rows above the table. */
const PORT_TOP = 252;
void LANES;

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
  // ---------------------------------------------------------------- 3.0 layers
  /** The stands, behind the cabinet. */
  crowd = new Crowd();
  /** The desk's wire on the rail. */
  desk = new Desk();
  /** Felt tint for a table event, under the rods. */
  eventLayer = new Container();
  /** The build-up's lit lanes on the felt. */
  chainLayer = new Container();
  /** Ghost rods: where theirs go if you make the slide under the pointer. */
  previewLayer = new Container();
  /** The boss rule's marks on the table. */
  ruleLayer = new Container();
  /** Corner plaques: the boss rule, the table event. */
  badgeLayer = new Container();
  /** The instant replay draws here, over everything on the table. */
  replayLayer = new Container();
  /** Ticker tape and the big centre score: over the table, in screen space. */
  tapeLayer = new Container();
  tape: { s: Sprite; sy: number; vx: number; vy: number; twirl: number; flip: number; life: number }[] = [];
  /** Lines the desk has shown this match: the count that varies them. */
  deskN = 0;
  /** The ball's trail: recent positions, drawn as a fading ribbon. */
  trail: { x: number; y: number; t: number }[] = [];
  trailG = new Graphics();
  /** Open shots on the table at the last draw, for the "lane opened" sting. */
  openShots = -1;
  lastSlide = false;
  /** Fans the stands show. */
  fansShown = 0;
  /** A replay is playing; a tap cuts it short. */
  replaying = false;
  replaySkip = false;
  /** The season best when this match kicked off: a new best gets an instant replay at full time. */
  bestAtKickoff = 0;
  /** The empty-defence auto press: pending timer. */
  autoTimer = 0;
  /** The pointer: a ring and a "Tap" tag on the next good touch. New players always see it, later only when stuck. */
  point = new Container();
  pointRing = new Graphics();
  pointTag = new Container();
  pointText = txt("", { fontSize: 20, fill: COL.ink });
  pointAt: { x: number; y: number; below: boolean } | null = null;
  /** When the player last did something on the table: the pointer comes back after a few idle seconds. */
  idleAt = 0;
  /** "What now?" was pressed: the pointer stays on until the next touch. */
  asked = false;

  constructor(
    public app: Application,
    public hooks: GameHooks,
  ) {
    this.swirl = swirlFilter();
    this.calmSwirl();
    this.crt = crtFilter();
    this.bg.filters = [this.swirl];
    app.stage.addChild(this.bg, this.root);
    this.root.addChild(this.hud, this.tbl, this.tapeLayer, this.point, this.benchLayer, this.stageLayer, this.tipLayer);
    this.tapeLayer.eventMode = "none";
    this.point.eventMode = "none";
    this.point.visible = false;
    const tagBg = new Graphics().roundRect(-56, -19, 112, 38, 10).fill(COL.money).stroke({ width: 3, color: COL.ink });
    this.pointText.anchor.set(0.5);
    this.pointTag.addChild(tagBg, this.pointText);
    this.point.addChild(this.pointRing, this.pointTag);
    this.root.visible = false;
    this.rodLayer.mask = this.rodMask;
    this.dark.texture = lantern();
    this.dark.anchor.set(0.5);
    this.dark.width = this.dark.height = 1500;
    this.dark.mask = this.darkMask;
    this.dark.eventMode = "none";
    this.dark.visible = false;
    this.mistLayer.eventMode = "none";
    this.tbl.addChild(
      this.crowd,
      this.pitch,
      this.eventLayer,
      this.mark,
      this.chainLayer,
      this.mistLayer,
      this.rodMask,
      this.dragLayer,
      this.rodLayer,
      this.rail,
      this.knobLayer,
      this.desk,
      this.badgeLayer,
      this.darkMask,
      this.dark,
      this.previewLayer,
      this.ruleLayer,
      this.guideLayer,
      this.ballLayer,
      this.ctrlLayer,
      this.fxLayer,
      this.replayLayer,
    );
    for (const l of [this.eventLayer, this.chainLayer, this.previewLayer, this.ruleLayer, this.badgeLayer, this.replayLayer, this.fxLayer]) l.eventMode = "none";
    // the fx layer (nets, flashes, the walk-out) is decoration over the kick targets: it must never take a tap
    this.ballLayer.addChild(this.trailG, this.ball);
    this.trailG.eventMode = "none";
    this.tipLayer.addChild(this.tip);
    app.stage.filters = [this.crt];
    this.crt.resolution = Math.min(2, window.devicePixelRatio || 1);
    app.stage.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointertap", (e) => {
      if (this.replaying) this.replaySkip = true;
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
    // the stands' atlas loads once the title has painted, never before
    setTimeout(() => void loadCrowd(), 2500);
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
    this.framePoint(rm);
    // the held ball rides with its figure
    if (!this.ballFree) this.placeBall();
    if (this.dark.visible) this.dark.position.set(this.ball.visible ? this.ball.x : (TX0 + TX1) / 2, this.ball.visible ? this.ball.y : LANE0 + PITCH_H / 2);
    // the figure on the ball breathes
    const b = this.disp.ball;
    if (this.ballFree && this.ball.visible) this.trail.push({ x: this.ball.x, y: this.ball.y, t: this.t });
    if (b && !this.ballFree) {
      const fv = this.rods[b.side]?.[b.rod]?.figs[b.fig];
      if (fv) fv.glow.alpha = rm ? 1 : 0.65 + 0.35 * Math.sin(this.t * 5);
    }
    const sec = dt / 1000;

    if (this.tbl.visible && this.root.renderable && this.root.visible) {
      this.crowd.frame(this.t, sec);
      this.desk.frame(sec);
      if (!rm) for (const side of this.rods) for (const rv of side) for (const f of rv.figs) f.idle(this.t, sec);
      this.drawTrail();
      this.frameRule();
    }
    this.frameTape(sec);
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
      const top = PORT_TOP;
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
    this.tipZone();
  }

  /**
   * Where the coach's tip may sit, as CSS vars in screen pixels: never over the score or the possession panel. On a
   * wide screen it is the foot of the left column (over the bench, above Squad/Rules/Menu); on a phone it sits just
   * above the bottom buttons (on match day, above Line-up), and in a match it leaves the handles column free.
   */
  tipZone() {
    const L = this.L;
    if (!L) return;
    const k = this.app.screen.width / L.W;
    const px = (u: number) => `${Math.round(u * k)}px`;
    const css = document.documentElement.style;
    if (L.mode === "land") {
      css.setProperty("--tip-left", px(14));
      css.setProperty("--tip-width", px(352 - 28));
      css.setProperty("--tip-width-round", px(352 - 28));
      css.setProperty("--tip-bottom", px(L.H - (L.H - 58 - 34)));
      return;
    }
    const matchDay = this.run?.s.phase === "fixture";
    const a = L.area;
    css.setProperty("--tip-left", px(10));
    css.setProperty("--tip-width", px(L.W - 20));
    css.setProperty("--tip-width-round", px(L.W - 20 - 210));
    css.setProperty("--tip-bottom", px(matchDay ? L.H - (a.y + a.h - 96) : L.H - (L.btnY - 46)));
  }

  /** The title covers the game: the table, HUD and panels stop drawing behind it so nothing old shows through. */
  cover(on: boolean) {
    this.root.renderable = !on;
    if (on) {
      clearTimeout(this.autoTimer);
      setMood("title");
      setCrowdBed(0, 0);
    } else this.syncMood();
  }

  /** The table's resting scale and place, kept so the goal's camera push can return to them. */
  tblHome = { k: 1, x: 0, y: 0 };

  /**
   * Fits the flat table into its area; on phones it stands upright (your goal at the bottom, your rods' ends on the
   * right). Table space runs from the stands above the far rail (y = -STAND_T) to under your handles (TS_H); on a
   * phone the desk adds a strip past their goal (x up to TS_W + DESK_P).
   */
  placeTable() {
    const a = this.L.area;
    const spanY = TS_H + STAND_T;
    const spanX = TS_W + (this.port ? DESK_P : 0);
    const tw = this.port ? spanY : spanX;
    const th = this.port ? spanX : spanY;
    const k = Math.min(a.w / tw, a.h / th);
    this.tbl.scale.set(k);
    if (this.port) {
      this.tbl.rotation = -Math.PI / 2;
      this.tbl.position.set(a.x + (a.w - tw * k) / 2 + STAND_T * k, a.y + (a.h - th * k) / 2 + th * k);
    } else {
      this.tbl.rotation = 0;
      this.tbl.position.set(a.x + (a.w - tw * k) / 2, a.y + (a.h - th * k) / 2 + STAND_T * k);
    }
    this.tblHome = { k, x: this.tbl.x, y: this.tbl.y };
  }

  /** Pushes the camera in by `z` towards a table point, or back home with z = 1. */
  push(z: number, at: { x: number; y: number }, ms: number): Promise<void> {
    const h = this.tblHome;
    if (reduced()) return Promise.resolve();
    // keep `at` where it is on screen while the scale changes
    const g0 = { x: h.x, y: h.y };
    const cos = Math.cos(this.tbl.rotation);
    const sin = Math.sin(this.tbl.rotation);
    const sx = g0.x + h.k * (at.x * cos - at.y * sin);
    const sy = g0.y + h.k * (at.x * sin + at.y * cos);
    const k = h.k * z;
    const x = sx - k * (at.x * cos - at.y * sin);
    const y = sy - k * (at.x * sin + at.y * cos);
    return Promise.all([tween(this.tbl.scale, { x: k, y: k }, ms, ease.inOut), tween(this.tbl, { x, y }, ms, ease.inOut)]).then(() => {});
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
        label(k === "round" && this.run && this.run.mode !== "season" ? "Match" : name, x + 35, y + 15, 12);
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
      // phone type: nothing on the canvas under 12 px at 390 wide (18 units here, after txt's 1.3)
      mk(14, 14, W * 0.62, 122, COL.ink2, COL.edge);
      this.clubName = label("", 14 + W * 0.31, 36, 23, COL.cream);
      this.clubRule = txt("", { fontSize: 18, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: W * 0.58, lineHeight: 19 });
      this.clubRule.anchor.set(0.5, 0);
      this.clubRule.position.set(14 + W * 0.31, 54);
      this.hud.addChild(this.clubRule);
      const sx = 26 + W * 0.62;
      const swd = W - sx - 14;
      mk(sx, 14, swd, 122, COL.ink2, COL.edge);
      label("YOU", sx + swd * 0.25, 34, 18);
      label("THEM", sx + swd * 0.75, 34, 18);
      this.scoreYou = big(sx + swd * 0.25, 86, 62, look().kitHi);
      this.scoreThem = big(sx + swd * 0.75, 86, 62, THEM.hi);
      label(":", sx + swd / 2, 80, 36, COL.dim);
      // row 2: the possession
      mk(14, 146, W - 28, 96, COL.ink, COL.edge);
      this.possText = label("", 30, 170, 19, COL.cream, 0);
      this.touchText = txt("", { fontSize: 18, fill: COL.dim, wordWrap: true, wordWrapWidth: W - 230, lineHeight: 18 });
      this.touchText.anchor.set(0, 0);
      this.touchText.position.set(30, 188);
      this.hud.addChild(this.touchText);
      this.pips.position.set(W - 120, 206);
      this.hud.addChild(this.pips);
      this.stat.round = txt("", { fontSize: 1 });
      this.stat.fans = label("", W - 30, 170, 19, COL.money, 1);
      this.stat.goals = txt("", { fontSize: 1 });
      this.stat.wins = txt("", { fontSize: 1 });
      this.benchLabel = txt("", { fontSize: 1 });
      this.playLabel = txt("", { fontSize: 1 });
      this.chalText = txt("", { fontSize: 18, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: W - 300 });
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
    this.btnHint = new Button("What now?", port ? 260 : 240, port ? 70 : 58, COL.neutral, () => this.hint(), { size: 18 });
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
    const railCol = night ? 0x14060f : BRASS.rail;
    const g = this.pitch;
    g.clear();
    const X0 = TX0 - 64;
    const XW = TX1 - TX0 + 128;
    // the cabinet and its wooden frame
    g.roundRect(TX0 - 70, CAB_T - 6, TX1 - TX0 + 140, CAB_B - CAB_T + 12, 26).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(X0, CAB_T, XW, CAB_B - CAB_T, 22).fill(wood);
    g.roundRect(X0 + 3, CAB_T + 3, XW - 6, 5, 3).fill({ color: 0xffffff, alpha: 0.06 });
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
    this.rodMask.rect(X0, LANE0 - RAIL_T, XW, PITCH_H + RAIL_T + RAIL).fill(0xffffff);
    this.darkMask.clear();
    this.darkMask.roundRect(X0, CAB_T, XW, CAB_B - CAB_T, 22).fill(0xffffff);
    this.dark.visible = night;
    // the rails on top of the bars, with brass bearings where the rods pass. The far rail is deep: the desk's wire
    // runs along it on a wide screen.
    const r = this.rail;
    r.clear();
    r.rect(X0, LANE0 - RAIL_T, XW, RAIL_T).fill(railCol);
    r.rect(X0, LANE0 + PITCH_H, XW, RAIL).fill(railCol);
    r.rect(X0, LANE0 - 3, XW, 3).fill({ color: 0x000000, alpha: 0.35 });
    r.rect(X0, LANE0 + PITCH_H, XW, 3).fill({ color: 0x000000, alpha: 0.35 });
    for (let x = 1; x <= 8; x++) {
      // collars on the inner edge of the far rail (the wire sits between them), bearings on the near one
      r.roundRect(colX(x) - 9, LANE0 - 8, 18, 8, 3).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
      r.circle(colX(x), LANE0 + PITCH_H + RAIL / 2, 8).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
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
      web(X0, CAB_T, 1, 1);
      web(X0 + XW, CAB_T, -1, 1);
      web(X0, CAB_B, 1, -1);
      web(X0 + XW, CAB_B, -1, -1);
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
    // rod ends with grips: theirs stick out over the far frame, in their club's kit; yours end in the handle controls
    this.knobLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const kg = new Graphics();
    const theirKit = night ? { main: 0x8fb6c8, hi: 0xcfe3ee } : kitOf(this.clubNow());
    for (let rod = 0; rod < 4; rod++) {
      const x = colX(colOf(1, rod));
      kg.rect(x - 4, CAB_T - 4, 8, 12).fill(BRASS.bar);
      kg.roundRect(x - 14, CAB_T - 24, 28, 22, 8).fill(theirKit.main).stroke({ width: 2.5, color: COL.ink });
      kg.roundRect(x - 10, CAB_T - 21, 20, 4, 2).fill({ color: theirKit.hi, alpha: 0.6 });
    }
    this.knobLayer.addChild(kg);
    // the stands and the wire
    this.crowd.build(this.port, night);
    const lk2 = look();
    this.crowd.setKit(lk2.kit, lk2.kitHi);
    if (this.run) this.crowd.level(this.fansShown || this.run.s.fans);
    if (this.port) {
      // a standing table: the wire runs across the far end, past their goal, upright on screen
      const len = CAB_B - CAB_T - 8;
      this.desk.layout(len, DESK_P - 8, 27, night);
      this.desk.rotation = Math.PI / 2;
      this.desk.position.set(TS_W + DESK_P - 2, CAB_T + 4);
    } else {
      this.desk.layout(XW - 40, RAIL_T - 10, 21, night);
      this.desk.rotation = 0;
      this.desk.position.set(X0 + 20, LANE0 - RAIL_T + 1);
    }
    this.syncEventTint();
  }

  /** The club on the other side right now (the match's, or the next fixture's). */
  clubNow(): string | null {
    const run = this.run;
    if (!run) return null;
    return run.s.match?.club || run.clubName();
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
    const kit = ghost ? null : kitOf(m?.club || run.clubName());
    const at = run.s.editionAt;
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
            const fv = new FigureView(side, l, f, side === 0 ? "you" : ghost ? "ghost" : "them", side === 1 ? kit : null);
            fv.position.set(0, (f * d.gap + 0.5) * LH);
            if (l) fv.setTrait(traitsOf(l, at), ghost);
            // a phone's table is too small for readable tickers: they show on a hold instead (the figure's tag)
            if (fv.tag) {
              this.upright(fv.tag);
              if (this.port) fv.tag.visible = false;
            }
            if (side === 0) {
              fv.setStats(run.stats(slot));
              this.bindFigure(fv, slot, r);
            } else this.bindRival(fv);
            c.addChild(fv);
            figs.push(fv);
          }
        } else bar.alpha = 0.25;
        this.rodLayer.addChild(c);
        this.rods[side].push({ c, bar, figs });
        // your rods can be dragged by the bar itself: a wide strip along the rod answers
        if (side === 0 && !pulled) {
          const hit = new Container();
          hit.position.set(colX(colOf(0, r)), LANE0 - RAIL_T);
          hit.hitArea = new Rectangle(-30, 0, 60, PITCH_H + RAIL_T + RAIL);
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
    this.applyRuleMarks(false);
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
      g.circle(4, 6, 15).fill({ color: 0x000000, alpha: 0.45 });
      g.circle(0, 0, 25).fill({ color: 0xff8a1c, alpha: 0.12 });
      g.ellipse(0, 0, 15, 14).fill(0xf07a12).stroke({ width: 2.5, color: COL.ink });
      g.ellipse(0, 0, 7, 14).stroke({ width: 2, color: 0xb04a08 });
      g.moveTo(0, -14).lineTo(0, 14).stroke({ width: 2, color: 0xb04a08 });
      g.rect(-2, -19, 4, 7).fill(0x3d7a2a);
      g.circle(-5.5, -5.5, 3.2).fill({ color: 0xffd28a, alpha: 0.8 });
      return;
    }
    // the protagonist: half again the old size, a soft shadow on the felt, a highlight, a seam
    g.ellipse(5, 7, 15, 12).fill({ color: 0x000000, alpha: 0.32 });
    g.circle(0, 0, 18).fill({ color: 0xfff6e6, alpha: 0.1 });
    g.circle(0, 0, 14).fill(0xfff6e6).stroke({ width: 2.5, color: COL.ink });
    g.circle(2, 3, 9).fill({ color: 0xe8d6bc, alpha: 0.6 });
    g.poly([0, -6, 5.5, -2, 3.5, 5, -3.5, 5, -5.5, -2]).fill({ color: COL.ink, alpha: 0.75 });
    g.circle(-5, -5, 3.6).fill({ color: 0xffffff, alpha: 0.95 });
  }

  /** The ball's trail: a ribbon through its last positions that thins and fades, drawn each frame. */
  drawTrail() {
    const g = this.trailG;
    const now = this.t;
    const tr = this.trail;
    while (tr.length && now - tr[0].t > (this.haunted ? 0.42 : 0.3)) tr.shift();
    g.clear();
    if (tr.length < 2 || reduced()) return;
    const col = this.haunted ? 0xff7a1c : 0xfff6e6;
    const life = this.haunted ? 0.42 : 0.3;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1];
      const b = tr[i];
      const k = 1 - (now - b.t) / life;
      if (k <= 0) continue;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 4 + 18 * k, color: col, alpha: 0.38 * k, cap: "round" });
    }
    const last = tr[tr.length - 1];
    g.circle(last.x, last.y, 12).fill({ color: this.kickTint, alpha: 0.25 });
  }
  /** Tint of the trail's head: gold for your shot, cream otherwise. */
  kickTint = 0xfff6e6;

  // ================================================================ run lifecycle
  start(run: Run) {
    this.root.visible = true;
    for (const l of run.s.squad) tokenTexture(l.c, l.s, () => {});
    this.run = run;
    this.busy = false;
    this.fansShown = 0;
    this.crowdExternal = false;
    this.deskN = 0;
    this.desk.say(run.mode === "haunt" ? "The Haunted table is open. Lights low." : "Market open. The table is live.", "flat", true);
    void loadCrowd();
    this.calmSwirl();
    this.resize();
  }

  refreshAll() {
    const run = this.run;
    if (!run) return;
    this.tip.hide();
    // a phone's bench row comes and goes with what sits on it
    if (this.port && (this.L.area.y > PORT_TOP) !== this.benchRow()) {
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
      : `${fixtureLabel(run, kind)} · ${run.mode === "haunt" ? "Haunted table" : run.mode === "daily" ? "Daily match day" : `round ${Math.min(s.round, run.rounds)} of ${run.rounds}`} · first to ${m ? m.target : 2} · ${style.name}${ghostLine}`;
    this.scoreYou.text = String(h.you);
    this.scoreThem.text = String(h.them);
    this.scoreYou.style.fill = look().kitHi;
    this.stat.round.text = run.mode !== "season" ? `${Math.min(s.kind + 1, 3)}/3` : `${Math.min(s.round, run.rounds)}/${run.rounds}`;
    this.stat.fans.text = this.port ? `${s.fans} fans` : String(s.fans);
    this.stat.goals.text = String(h.goals);
    this.stat.wins.text = String(h.wins);
    const g = this.pips;
    g.clear();
    if (h.mode === "goal") {
      this.possText.text = "Goal";
      this.touchText.text = "Kick-off next";
    } else if (m && h.mode === "attack" && s.phase === "attack" && !this.hudNow) {
      this.possText.text = `Your ball · ${m.touches} touch${m.touches === 1 ? "" : "es"} left`;
      const free = m.free.reduce((a, b) => a + b, 0) + m.freeAny;
      // what to do, in one plain line: the gold disc, the ringed figure, or a slide to open a lane
      const ks = run.myKicks();
      const doNow = ks.some((k) => k.open && k.kick.r === 4)
        ? "Open shot: tap the gold disc"
        : ks.some((k) => k.open)
          ? "Open pass: tap the ringed figure"
          : "No lane yet: slide a rod";
      const lines = [doNow];
      // a phone's panel has room for two lines, and the ghosts need the second
      if ((free || m.dummy) && !(ghost && this.port))
        lines.push([free ? `${free} free slide${free === 1 ? "" : "s"}` : "", m.dummy ? `they freeze for ${m.dummy}` : ""].filter(Boolean).join(" · "));
      if (ghost) {
        const mv = run.driftNow();
        const dir = mv ? (mv.d < 0 ? (this.port ? "left" : "up") : this.port ? "right" : "down") : "";
        if (this.port) {
          // a phone's panel has room for two lines: the touches, then the ghosts in short
          lines.push(`${RODS[ghost.rod].name} ${run.fadedRod() >= 0 ? "FADED" : "SOLID"}${mv ? ` · ${RODS[mv.r].name.toLowerCase()} drifts ${dir}` : ""}`);
        } else {
          lines.push(run.fadedRod() >= 0 ? `Their ${RODS[ghost.rod].name.toLowerCase()}: FADED now` : `Their ${RODS[ghost.rod].name.toLowerCase()}: SOLID now, faded next`);
          if (mv) lines.push(`Next kick: their ${RODS[mv.r].name.toLowerCase()} drifts ${dir}`);
        }
      }
      this.touchText.text = lines.join("\n");
      const slip = m.boss === "slip" ? 1 : 0;
      const n = m.touches + slip;
      for (let i = 0; i < m.touches; i++) g.circle((i - (n - 1) / 2) * 30, 0, 11).fill(COL.money).stroke({ width: 3, color: COL.ink });
      if (slip) {
        // Max Slippage: the touch they took, struck through
        const x = (n - 1 - (n - 1) / 2) * 30;
        g.circle(x, 0, 10).stroke({ width: 3, color: COL.bad }).moveTo(x - 9, 9).lineTo(x + 9, -9).stroke({ width: 3, color: COL.bad });
      }
    } else if (m && h.mode === "defend" && s.phase === "defend" && !this.hudNow) {
      this.possText.text = `Their ball · ${m.aiTouches} touch${m.aiTouches === 1 ? "" : "es"} left`;
      this.touchText.text = `Red line = their shot. Block it with a rod, then Ready\n${m.blockSlides} block slide${m.blockSlides === 1 ? "" : "s"} left`;
      for (let i = 0; i < m.blockSlides; i++) g.roundRect((i - (m.blockSlides - 1) / 2) * 30 - 10, -10, 20, 20, 4).fill(COL.cyan).stroke({ width: 3, color: COL.ink });
    } else if (this.hudNow && (h.mode === "attack" || h.mode === "defend")) {
      // mid-playback: whose ball it is, the counts settle when the touch is done
      this.possText.text = h.mode === "attack" ? "Your ball" : "Their ball";
      this.touchText.text = "";
    } else {
      const ph = s.phase;
      if (ph === "fixture") {
        this.possText.text = `Next up: ${fixtureLabel(run, s.kind).toLowerCase()}`;
        this.touchText.text = `${run.clubName()} · first to ${targetOf(run, s.kind)} · a win is +${winFansOf(run, s.kind)} fans`;
      } else {
        this.possText.text = ph === "room" ? "Dressing room" : ph === "fulltime" ? "Full time" : ph === "won" ? "Champions" : ph === "over" ? "Season over" : "";
        this.touchText.text = ph === "room" ? `${s.fans} fans to spend` : "";
      }
    }
    if (!this.crowdExternal) this.crowd.level(s.fans);
    this.syncMood();
    this.clubCss(name);
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
      // too small to read on a phone: the silhouette says it
      t.visible = !this.port;
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
    body += `\n${TIER_NAME[d.tier]} · lets go for ${run.sellValue(j)} fans`;
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
    this.clearPreview();
    if (!run || !this.inMatch()) return;
    this.syncGhostLook();
    const s = run.s;
    const m = run.m;
    const attack = s.phase === "attack";
    const kit = look();
    // your handles: the rod comes out of the cabinet and ends in a brass grip; its two halves slide it
    const hg = new Graphics();
    this.ctrlLayer.addChild(hg);
    for (let r = 0; r < 4; r++) {
      const x = colX(colOf(0, r));
      const pulled = m.pulled === r;
      const locked = m.frozen === r || (r === 0 && m.boss === "lockup");
      const cost = attack ? run.slideCost(r) : 0;
      const gas = m.ruleView?.kind === "cost2" && attack && cost === 2;
      hg.rect(x - 5, HANDLE_Y - 4, 10, 14).fill(pulled ? { color: BRASS.bar, alpha: 0.25 } : BRASS.bar);
      if (pulled) continue;
      // the grip's body: a dark rubber sleeve with brass end caps, in your kit colour where the grip is held
      const top = CTRL_Y - 2;
      const h = ARROW_H * 2 + 14;
      if (gas) hg.roundRect(x - ARROW_W / 2 - 12, top - 8, ARROW_W + 24, h + 16, 22).fill({ color: 0xff7a1a, alpha: 0.28 });
      hg.roundRect(x - ARROW_W / 2 - 4, top + 4, ARROW_W + 8, h, 18).fill({ color: 0x000000, alpha: 0.4 });
      hg.roundRect(x - ARROW_W / 2 - 4, top, ARROW_W + 8, h, 18).fill(BRASS.lo).stroke({ width: 3, color: COL.ink });
      hg.roundRect(x - ARROW_W / 2, top + 4, ARROW_W, h - 8, 15).fill(locked ? 0x2a1a24 : kit.kit);
      hg.roundRect(x - ARROW_W / 2 + 6, top + 8, 8, h - 16, 4).fill({ color: 0xffffff, alpha: 0.12 });
      // grip ridges across the middle
      for (let i = -2; i <= 2; i++) hg.rect(x - ARROW_W / 2 + 10, top + h / 2 + i * 5 - 1, ARROW_W - 20, 2).fill({ color: COL.ink, alpha: 0.35 });
      for (const d of [-1, 1] as Dir[]) {
        const ok = !this.busy && !pulled && run.canMove(0, r, d) && (attack ? cost <= m.touches : m.blockSlides > 0);
        const b = this.arrow(r, d, ok, () => void this.doSlide(r, d));
        b.position.set(x, CTRL_Y + 2 + ARROW_H / 2 + (d === -1 ? 0 : ARROW_H + 6));
        this.ctrlLayer.addChild(b);
        this.arrows[`${r}${d}`] = b;
      }
      if (gas) {
        // Gas Spike: a "2" on the grip, every slide costs two touches
        const bg = new Graphics().circle(0, 0, 15).fill(0xff7a1a).stroke({ width: 3, color: COL.ink });
        const t2 = txt("2", { fontFamily: NUM, fontSize: 26, fill: COL.ink });
        t2.anchor.set(0.5);
        const c = new Container();
        c.addChild(bg, t2);
        this.upright(c);
        c.position.set(x + ARROW_W / 2 + 2, CTRL_Y + 4);
        this.ctrlLayer.addChild(c);
      }
      const capText = pulled ? "PULLED" : locked ? "LOCKED" : attack && cost === 0 && (m.free[r] > 0 || m.freeAny > 0) ? "FREE SLIDE" : attack && cost === 2 ? "2 TOUCHES" : RODS[r].name.toUpperCase();
      const cap = txt(capText, { fontSize: 13, fill: pulled || locked ? COL.bad : cost === 0 && attack && capText === "FREE SLIDE" ? COL.cyan : gas ? 0xffa060 : COL.cream2, stroke: { color: COL.ink, width: 4 } });
      cap.anchor.set(0.5);
      cap.position.set(x, capY());
      this.upright(cap);
      if (this.port) cap.visible = false;
      this.ctrlLayer.addChild(cap);
    }
    this.drawGhostMarks();
    this.pointAt = null;
    if (this.busy) return;
    if (attack) this.drawKicks();
    else this.drawThreats();
    this.aimPoint();
  }

  /** The ghost rules at their handles: the phasing rod's state, and the poltergeist's next drift. */
  drawGhostMarks() {
    const run = this.run!;
    const g = run.s.match?.ghost;
    if (!g) return;
    const attack = run.s.phase === "attack";
    const px = colX(colOf(1, g.rod));
    const faded = run.fadedRod() === g.rod;
    const y = CAB_T - 40;
    const tag = txt(attack ? (faded ? "FADED" : "SOLID") : "PHASING", {
      fontSize: this.port ? 18 : 13,
      fill: !attack ? 0xcfe3ee : faded ? COL.dim : COL.cyan,
      stroke: { color: COL.ink, width: 5 },
    });
    tag.anchor.set(0.5);
    tag.position.set(px, y);
    this.upright(tag);
    this.ctrlLayer.addChild(tag);
    const mv = run.driftNow();
    if (!mv) return;
    const x = colX(colOf(1, mv.r));
    const a = new Graphics();
    const same = mv.r === g.rod;
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

  /**
   * One half of a brass grip: an arrow that slides the rod. Hovering it (or holding it on a touch screen) reads the
   * tape: their rods show as ghosts where they will go after they react. On a touch screen a hold reads, a tap slides.
   */
  arrow(r: number, d: Dir, enabled: boolean, fn: () => void): Container {
    const c = new Container();
    const g = new Graphics();
    const w = ARROW_W - 8;
    const h = ARROW_H - 4;
    const draw = (hot: boolean) => {
      g.clear();
      // the face: dark when it can't slide, warm brass when it can, cyan only under the pointer
      const face = !enabled ? 0x2a1622 : hot ? COL.play : 0x3a1630;
      g.roundRect(-w / 2, -h / 2, w, h, 12).fill(face).stroke({ width: 2, color: enabled ? (hot ? COL.cyan : BRASS.hi) : 0x4a2a3e, alpha: enabled ? 0.9 : 0.6 });
      g.roundRect(-w / 2 + 6, -h / 2 + 4, w - 12, 5, 2.5).fill({ color: 0xffffff, alpha: enabled ? 0.14 : 0.04 });
      const t = 13;
      const col = enabled ? (hot ? COL.cream : BRASS.hi) : 0x6a4a5e;
      if (d === -1) g.poly([0, -t, t * 1.2, t * 0.7, -t * 1.2, t * 0.7]).fill(col);
      else g.poly([0, t, t * 1.2, -t * 0.7, -t * 1.2, -t * 0.7]).fill(col);
    };
    draw(false);
    c.addChild(g);
    c.eventMode = "static";
    c.cursor = enabled ? "pointer" : "default";
    c.hitArea = new Rectangle(-ARROW_W / 2 - 2, -ARROW_H / 2 - 2, ARROW_W + 4, ARROW_H + 4);
    let held = 0;
    let read = false;
    c.on("pointerover", (e) => {
      if (e.pointerType !== "mouse" || !enabled) return;
      draw(true);
      this.showPreview(r, d);
    });
    c.on("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      draw(false);
      this.clearPreview();
    });
    c.on("pointerdown", (e) => {
      if (e.pointerType === "mouse" || !enabled) return;
      read = false;
      clearTimeout(held);
      draw(true);
      held = window.setTimeout(() => {
        read = true;
        sfx.tick();
        this.showPreview(r, d);
      }, 300);
    });
    const release = () => {
      clearTimeout(held);
      if (!c.destroyed) draw(false);
    };
    c.on("pointerupoutside", () => {
      release();
      if (read) this.clearPreview();
      read = false;
    });
    c.on("pointertap", () => {
      release();
      if (!enabled) {
        sfx.error();
        return;
      }
      // a hold was a read, not a slide
      if (read) {
        read = false;
        this.clearPreview();
        return;
      }
      fn();
    });
    (c as Container & { label: string }).label = d === -1 ? "up" : "down";
    return c;
  }

  /** "Read the tape": ghosts of their rods where they go after you slide rod `r` the way `d`. */
  showPreview(r: number, d: Dir) {
    const run = this.run;
    const L = this.previewLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!run || this.busy || run.s.phase !== "attack") return;
    const p = run.previewReact({ r, d });
    if (!p) return;
    const kit = run.mode === "haunt" ? { main: 0xcfe3ee, hi: 0xf4fbff } : kitOf(run.m.club);
    const g = new Graphics();
    L.addChild(g);
    // your rod, a lane over
    const yx = colX(colOf(0, r));
    for (let f = 0; f < RODS[r].n; f++) {
      const y = laneY(p.off[0][r] + f * RODS[r].gap);
      g.circle(yx, y, FR + 2).stroke({ width: 3, color: look().kitHi, alpha: 0.75 });
    }
    let moved = 0;
    for (let rr = 0; rr < 4; rr++) {
      const now = run.m.off[1][rr];
      const to = p.off[1][rr];
      if (now === to) continue;
      moved++;
      const x = colX(colOf(1, rr));
      for (let f = 0; f < RODS[rr].n; f++) {
        const y0 = laneY(now + f * RODS[rr].gap);
        const y1 = laneY(to + f * RODS[rr].gap);
        // a dashed ghost ring where the figure lands, a short arrow from where it is
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2;
          g.arc(x, y1, FR + 2, a0, a0 + Math.PI / 12).stroke({ width: 4, color: kit.hi, alpha: 0.95 });
        }
        g.circle(x, y1, FR - 2).fill({ color: kit.main, alpha: 0.28 });
        const dir = Math.sign(y1 - y0);
        g.moveTo(x, y0 + dir * (FR + 4)).lineTo(x, y1 - dir * (FR + 6)).stroke({ width: 3, color: kit.hi, alpha: 0.7 });
        g.poly([x - 7, y1 - dir * (FR + 12), x + 7, y1 - dir * (FR + 12), x, y1 - dir * (FR + 4)]).fill({ color: kit.hi, alpha: 0.85 });
      }
    }
    const label = txt(moved ? `They answer: ${moved} rod${moved === 1 ? "" : "s"} move` : "They hold still", { fontFamily: NUM, fontSize: this.port ? 30 : 24, fill: kit.hi === 0xffffff ? COL.cream : kit.hi });
    label.anchor.set(0.5);
    const pill = new Container();
    const pg = new Graphics().roundRect(-label.width / 2 - 14, -label.height / 2 - 4, label.width + 28, label.height + 8, 10).fill({ color: COL.ink, alpha: 0.88 }).stroke({ width: 2, color: kit.hi === 0xffffff ? COL.cream : kit.hi, alpha: 0.8 });
    pill.addChild(pg, label);
    this.upright(pill);
    pill.position.set(this.port ? TX1 - 34 : (TX0 + TX1) / 2, this.port ? LANE0 + PITCH_H / 2 : LANE0 + 22);
    L.addChild(pill);
  }

  clearPreview() {
    this.previewLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
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

  kickTargets: { kick: Kick; x: number; y: number; open: boolean; fig: FigureView | null; label: string; tight: boolean }[] = [];

  /**
   * Your kicks from the ball: gold where they go through, faint red dashes ending in an X at the figure in the way.
   * An open shot gets the gold disc in their mouth; a shot into a lane their keeper reaches gets an amber disc with
   * a glove. Under Mempool Jam a pass target shows three pending dots.
   */
  drawKicks() {
    const run = this.run!;
    const m = run.m;
    const ball = m.ball;
    const lane = laneOf(ball.rod, m.off[0][ball.rod], ball.fig);
    const ks = run.myKicks();
    const g = new Graphics();
    this.guideLayer.addChild(g);
    this.kickTargets = [];
    let openShots = 0;
    ks.forEach((k, i) => {
      const shot = k.kick.r === 4;
      const pts = this.pathPoints(0, ball.rod, lane, k.kick, shot ? m.drift : 0);
      const hl = this.hoverKick === i;
      // a lane beside their keeper: the reach costs one Power, unless the shot comes straight off a pass or off a wall
      const reachOn = shot && k.tight && !m.afterPass && k.tr.bounces === 0;
      const isTight = k.open && reachOn;
      if (shot && k.open) openShots++;
      if (k.open) this.dashed(g, pts, isTight ? 0xffa13d : shot ? COL.money : COL.cream, hl ? 1 : shot ? 0.9 : 0.6, hl ? 6 : 4);
      else if (shot || hl) {
        // blocked: dim dashes that stop at the blocker
        const stop = k.at ? Math.abs(colOf(1, k.at.rod) - colOf(0, ball.rod)) : undefined;
        const part = stop !== undefined ? this.pathPoints(0, ball.rod, lane, k.kick, shot ? m.drift : 0, stop) : pts;
        this.dashed(g, part, COL.bad, hl ? 0.9 : 0.45, 3);
      }
      const end = shot ? pts[pts.length - 2] : pts[pts.length - 1];
      const fig = shot ? null : this.rods[0][k.kick.r]?.figs[k.tr.to] || null;
      const to = fig ? run.s.squad[slotOf(k.kick.r, k.tr.to)] : null;
      const what = shot ? `Shot${k.kick.d ? ", angled" : ""}${k.tr.bounces ? ", off the wall" : ""}` : `Pass to $${to?.s || "?"}`;
      const how = k.open
        ? isTight
          ? "tight: Power beats their keeper's reach"
          : shot && k.tight
            ? k.tr.bounces
              ? "off the wall, past their keeper's reach"
              : "one touch, past their keeper's reach"
            : k.beaten
              ? `goes through ${k.beaten} with Power`
              : shot
                ? "open"
                : "clean"
        : reachOn && k.at?.rod === 0
          ? "tight: their keeper reaches it"
          : `blocked by their ${RODS[k.at!.rod].name.toLowerCase()}`;
      this.kickTargets.push({ kick: k.kick, x: end.x, y: end.y, open: k.open, fig, label: `${what} · ${how}`, tight: isTight });
      if (!k.open && k.at && shot && reachOn && k.at.rod === 0 && (k.at as { reach?: boolean }).reach) {
        // the keeper's reach: an amber glove in the tight lane beside him, where the ball would be stopped
        const kp = this.figPos(1, 0, 0);
        const y = laneY(k.at.lane);
        g.circle(kp.x, y, 22).fill({ color: COL.ink, alpha: 0.75 }).stroke({ width: 4, color: 0xffa13d, alpha: hl ? 1 : 0.85 });
        const gl = glove(26, 0xffa13d);
        gl.rotation = this.port ? Math.PI / 2 : 0;
        gl.position.set(kp.x, y);
        gl.eventMode = "none";
        this.guideLayer.addChild(gl);
      } else if (!k.open && k.at && (shot || hl)) {
        // the X sits just in front of the figure in the way, where the ball would stop
        const bp = this.figPos(1, k.at.rod, k.at.fig);
        const x = bp.x - FR - 14;
        const y = bp.y;
        const xg = () => g.moveTo(x - 9, y - 9).lineTo(x + 9, y + 9).moveTo(x + 9, y - 9).lineTo(x - 9, y + 9);
        xg().stroke({ width: 10, color: COL.ink, alpha: hl ? 1 : 0.8, cap: "round" });
        xg().stroke({ width: 5, color: COL.bad, alpha: hl ? 1 : 0.85, cap: "round" });
      }
    });
    // the sting: a slide of yours just opened a shot that wasn't there
    const opened = this.openShots === 0 && openShots > 0 && this.lastSlide;
    this.openShots = openShots;
    this.lastSlide = false;
    if (opened) {
      sfx.laneOpen();
      this.moment("lane-open");
    }
    // target markers: a ring on the receiver, a disc in the goal mouth (open shots only)
    this.kickTargets.forEach((t, i) => {
      if (!t.open) return;
      const c = new Container();
      const mg = new Graphics();
      if (t.kick.r === 4) {
        const col = t.tight ? 0xffa13d : COL.money;
        mg.circle(0, 0, 27).fill({ color: COL.ink, alpha: 0.78 }).stroke({ width: 5, color: col });
        if (t.tight) {
          mg.circle(0, 0, 17).fill(col);
          const gl = glove(22, COL.ink);
          gl.rotation = this.port ? Math.PI / 2 : 0;
          c.addChild(mg, gl);
        } else {
          mg.circle(0, 0, 10).fill(col);
          c.addChild(mg);
        }
      } else {
        mg.circle(0, 0, FR + 9).stroke({ width: 4, color: COL.cream, alpha: 0.95 });
        if (m.ruleView?.kind === "late") {
          // Mempool Jam: the pass is pending, it lands a turn late
          for (let j = -1; j <= 1; j++) mg.circle(FR + 18, j * 11, 4).fill({ color: COL.cream, alpha: 0.5 + 0.25 * (j + 1) });
        }
        c.addChild(mg);
      }
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
      if (t.kick.r === 4 && opened && !reduced()) {
        // the moment a lane opens: the disc arrives with a pop
        c.scale.set(0.3);
        void tween(c.scale, { x: 1, y: 1 }, 380, ease.outElastic);
      }
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
    this.tip.show(t.kick.r === 4 ? "Shoot" : "Pass", t.label, p.x, p.y - 26, { w: this.L.W, h: this.L.H }, t.tight ? 0xffa13d : t.open ? COL.money : COL.bad, 300);
  }

  /** A tap on a pass receiver kicks to it, when that pass is on. */
  tryTapKick(fv: FigureView): boolean {
    const t = this.kickTargets.find((k) => k.fig === fv);
    if (!t || this.busy || this.run?.s.phase !== "attack") return false;
    void this.doKick(t.kick);
    return true;
  }

  /** While they have the ball: the lanes it can go down. Red for shots, amber for passes. A wide body shows its two lanes. */
  drawThreats() {
    const run = this.run!;
    const m = run.m;
    const ball = m.ball;
    const lane = laneOf(ball.rod, m.off[1][ball.rod], ball.fig);
    const g = new Graphics();
    this.guideLayer.addChild(g);
    for (const rv of this.rods[0]) for (const f of rv.figs) f.setRing(null);
    // Grip at the back: a wide body covers its lane and the next toward the middle; a Grip keeper both sides
    const wide = run.wideCover();
    if (wide)
      wide.forEach((lanes, r) =>
        lanes.forEach((f, ln) => {
          if (f === undefined || f < 0) return;
          const p = this.figPos(0, r, f);
          const y0 = Math.min(p.y, laneY(ln)) - LH / 2;
          g.roundRect(p.x - 12, y0, 24, LH * 2, 10).fill({ color: COL.money, alpha: 0.16 }).stroke({ width: 2, color: COL.money, alpha: 0.6 });
        }),
      );
    const threats = run.threats();
    for (const k of threats) {
      const pts = this.pathPoints(1, ball.rod, lane, k.kick, 0);
      this.dashed(g, pts, k.kick.r === 4 ? COL.bad : COL.money, 0.95, 5);
      const end = k.kick.r === 4 ? pts[pts.length - 2] : pts[pts.length - 1];
      g.circle(end.x, end.y, 13).stroke({ width: 4, color: k.kick.r === 4 ? COL.bad : COL.money });
    }
    const holder = this.rods[1][ball.rod]?.figs[ball.fig];
    holder?.setRing(COL.bad, 5);
    // block slides left, as pips on the ball holder
    if (holder && m.blockSlides > 0) {
      const hp = this.figPos(1, ball.rod, ball.fig);
      for (let i = 0; i < m.blockSlides; i++) {
        const off = (i - (m.blockSlides - 1) / 2) * 16;
        const px = this.port ? hp.x + FR + 18 : hp.x + off;
        const py = this.port ? hp.y + off : hp.y - FR - 18;
        g.roundRect(px - 6, py - 6, 12, 12, 3).fill(COL.cyan).stroke({ width: 2.5, color: COL.ink });
      }
    }
    if (!threats.length && m.intent && m.intent.kind === "slide") {
      // the rod it is about to move
      const x = colX(colOf(1, m.intent.r));
      g.rect(x - 14, LANE0, 28, PITCH_H).fill({ color: kitOf(m.club).main, alpha: 0.12 });
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

  async perform(a: Action, fast = false) {
    const run = this.run;
    if (!run || this.busy) return;
    clearTimeout(this.autoTimer);
    this.hoverKick = null;
    this.tip.hide();
    this.clearPreview();
    const before = hudOf(run);
    this.afterPassBefore = !!run.s.match?.afterPass;
    this.lastSlide = a.t === "slide";
    if (!this.act(a)) return;
    this.asked = false;
    this.busy = true;
    this.fast = fast;
    this.hudNow = before;
    this.syncHud();
    this.syncControls();
    this.btnReady.setEnabled(false);
    this.btnHint.setEnabled(false);
    try {
      await this.playEvents(run.events.slice());
    } finally {
      this.busy = false;
      this.fast = false;
      this.hudNow = null;
      setTimeScale(1);
      this.afterEvents();
    }
  }
  /** Whether the ball had just arrived from a pass before this action (a one-touch shot beats the keeper's reach). */
  afterPassBefore = false;
  /** The kick playing now came straight off a pass. */
  shotAfterPass = false;
  /** Batched playback for the auto-skipped defence: everything moves quicker. */
  fast = false;

  afterEvents() {
    const run = this.run;
    if (!run) return;
    const ph = run.s.phase;
    this.idleAt = this.t;
    // matches played on this device: after two, the pointer only comes when asked for or when the player is stuck
    if (ph === "over" || ph === "won" || ph === "fulltime") local.set("kk.games", local.get<number>("kk.games", 0) + 1);
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
    this.autoDefend();
  }

  /**
   * Their ball with nothing to block: no threat line on the table, so Ready would be a pure wait. The table presses it
   * for you, quickly, through the same action a tap takes (the trail is the same as if you had pressed it).
   */
  autoDefend() {
    clearTimeout(this.autoTimer);
    const run = this.run;
    if (!run || run.s.phase !== "defend" || this.busy || run.threats().length) return;
    this.autoTimer = window.setTimeout(() => {
      const r = this.run;
      if (!r || r !== run || r.s.phase !== "defend" || this.busy || r.threats().length || ui.overlay) return;
      this.say("They pass it around at the back.", "flat");
      void this.perform({ t: "hold" }, true);
    }, reduced() ? 250 : 520);
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

  // ================================================================ moments, the desk, the music
  moment(kind: Moment, data?: unknown) {
    try {
      this.hooks.onMoment?.(kind, data);
    } catch {
      /* a screen's listener never stops the table */
    }
  }

  /** A line on the desk's wire. */
  say(line: string | null, tone: Tone = "flat") {
    if (line) this.desk.say(line, tone);
  }

  /** The desk line for an engine event, from shared/voice.ts. */
  deskFor(ev: Ev) {
    const run = this.run;
    if (!run) return;
    let line: string | null = null;
    try {
      line = lineFor(ev, { run, n: this.deskN });
    } catch {
      line = null;
    }
    if (!line) return;
    this.deskN++;
    let tone: Tone = "flat";
    if (ev.e === "kick") tone = ev.side === 0 ? (ev.result === "goal" ? "up" : ev.result === "kept" ? "flat" : "down") : "up";
    else if (ev.e === "goal") tone = ev.side === 0 ? "up" : "down";
    else if (ev.e === "chain") tone = "up";
    else if (ev.e === "whistle") tone = ev.reason === "lost" ? "down" : ev.reason === "draw" ? "flat" : "up";
    else if (ev.e === "turnover") tone = ev.to === 1 ? "down" : "up";
    this.desk.say(line, tone);
  }

  /** The music and the crowd's murmur follow the ball. */
  syncMood() {
    const run = this.run;
    const s = run?.s;
    const m = s?.match;
    let mood: Mood = "title";
    let tension = 0;
    if (run && s && m && (s.phase === "attack" || s.phase === "defend")) {
      const final = m.boss === "bell";
      if (s.phase === "attack") {
        const col = colOf(0, m.ball.rod);
        tension = Math.min(1, col / 7);
        mood = final ? "final" : col >= 6 ? "attack" : run.mode === "haunt" ? "haunt" : m.boss ? "boss" : "calm";
      } else {
        tension = Math.max(0, (9 - colOf(1, m.ball.rod)) / 9) * 0.5;
        mood = final ? "final" : run.mode === "haunt" ? "haunt" : "defend";
      }
    } else if (run?.mode === "haunt") mood = "haunt";
    setMood(mood);
    const full = this.crowd.seats.length ? this.crowd.filled / this.crowd.seats.length : 0;
    setCrowdBed(this.inMatch() && this.root.renderable ? 0.3 + full * 0.7 : 0, tension);
  }

  /** The club on the table, as CSS vars for the screens around it (--club-main, --club-hi, --club-trim). */
  clubCss(club: string | null) {
    if (club === this.cssClub) return;
    this.cssClub = club;
    const k = this.haunted ? { main: 0xcfe3ee, hi: 0xf4fbff, trim: 0x8fb6c8 } : kitOf(club);
    const st = document.documentElement.style;
    st.setProperty("--club-main", cssHex(k.main));
    st.setProperty("--club-hi", cssHex(k.hi));
    st.setProperty("--club-trim", cssHex(k.trim));
  }
  cssClub: string | null | undefined = undefined;

  /** The stands fill with your fans. The screens may call it with the HUD's fans as they count up. */
  crowdLevel(fans: number) {
    this.crowdExternal = true;
    this.fansShown = fans;
    this.crowd.level(fans);
  }
  /** Set once a screen drives the stands through crowdLevel; until then the table follows the season's fans. */
  crowdExternal = false;

  // ================================================================ playback
  async playEvents(evs: Ev[]) {
    let afterPass = this.afterPassBefore;
    let reactN = 0;
    for (const ev of evs) {
      if (this.hudNow) {
        this.hudNow = hudStep(this.hudNow, ev);
        this.syncHud();
      }
      this.deskFor(ev);
      switch (ev.e) {
        case "slide":
          if (ev.why === "react") reactN++;
          await this.animSlide(ev.side, ev.r, ev.d, ev.why, reactN);
          break;
        case "react":
          reactN = 0;
          break;
        case "kick": {
          this.shotAfterPass = afterPass;
          await this.animKick(ev);
          afterPass = ev.side === 0 && ev.result === "pass";
          break;
        }
        case "chain":
          this.lightChain(ev.n, ev.lanes);
          break;
        case "goal":
          this.chainLayer.removeChildren().forEach((c) => c.destroy());
          await this.animGoal(ev.side, ev.rating, ev.style);
          break;
        case "turnover":
          this.chainLayer.removeChildren().forEach((c) => c.destroy());
          await this.animTurnover(ev.to, ev.why);
          break;
        case "kickoff":
          this.chainLayer.removeChildren().forEach((c) => c.destroy());
          this.disp.ball = { side: ev.side, rod: 2, fig: 2 };
          this.ballFree = null;
          this.trail = [];
          sfx.whistle();
          await wait(220);
          break;
        case "rule":
          // Trading Halt thaws at the first goal: the tape comes off, no second walk-out
          if (ev.view.kind === "frozen" && (ev.view.rod ?? -1) < 0) this.haltLifted();
          else await this.walkout(ev.id, ev.view);
          break;
        case "event":
          // tinted at kickoff already (doGo); the beat stays
          await wait(200);
          break;
        case "whistle":
          await this.whistleBeat(ev.reason);
          break;
        case "play":
          this.flashText(PLAY[ev.id]?.name || "", COL.cyan);
          await wait(200);
          break;
        case "end":
          await this.animEnd(ev.won, ev.draw);
          break;
      }
      this.syncMood();
    }
  }

  async animSlide(side: 0 | 1, r: number, d: number, why: string, nth = 0) {
    const rv = this.rods[side][r];
    if (!rv) return;
    this.disp.off[side][r] += d;
    const ghost = why === "ghost";
    const fast = this.fast;
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
    if (why === "react") {
      // they read you: a flicker on their handle, the rods answer one after another
      sfx.read();
      this.readFlicker(r);
      if (nth === 1 && !fast) {
        const p = this.root.toLocal(this.tbl.toGlobal({ x: rv.c.x, y: CAB_T - 10 }));
        this.floatText("reads you", p.x, p.y + (this.port ? 0 : 20), kitOf(this.clubNow()).hi, 22);
      }
    }
    // the rod carries weight: it overshoots a touch and settles with a thunk
    const heavy = side === 0 && rv.figs.some((f) => f.trait === "whale") ? 1.25 : 1;
    const dur = fast ? 90 : why === "react" || why === "mirror" ? 170 : ghost ? 420 : 210 * heavy;
    await tween(rv.c, { y: LANE0 + this.disp.off[side][r] * LH }, dur, ghost ? ease.inOut : ease.outBack);
    if (side === 0 && (why === "you" || why === "block")) sfx.thunk();
    if (why === "react") await wait(fast ? 20 : 90);
    else if (why === "ai") await wait(fast ? 20 : 60);
    if (ghost) this.syncGhostLook();
  }

  /** A teal flicker on their handle as that rod reads you. */
  readFlicker(r: number) {
    if (reduced()) return;
    const x = colX(colOf(1, r));
    const kit = this.haunted ? { hi: 0xcfe3ee } : kitOf(this.clubNow());
    const f = new Graphics().roundRect(x - 20, CAB_T - 30, 40, 34, 12).fill({ color: kit.hi, alpha: 0.55 });
    this.fxLayer.addChild(f);
    void tween(f, { alpha: 0 }, 380).then(() => f.destroy());
  }

  async animKick(ev: Extract<Ev, { e: "kick" }>) {
    const side = ev.side;
    const lane = laneOf(ev.rod, this.disp.off[side][ev.rod], ev.fig);
    const x0 = colOf(side, ev.rod);
    let upTo: number | undefined;
    if (ev.at) upTo = Math.abs(colOf(side === 0 ? 1 : 0, ev.at.rod) - x0);
    const pts = this.pathPoints(side, ev.rod, lane, ev.kick, ev.drift, upTo);
    const holder = this.rods[side]?.[ev.rod]?.figs[ev.fig];
    for (const sd of this.rods) for (const rv of sd) for (const f of rv.figs) f.setGlow(null);
    const shot = ev.kick.r === 4;
    const myGoal = side === 0 && ev.result === "goal";
    // the kick: the figure swings round its rod, then the ball flies
    if (holder) holder.swing(tween, ease.outBack);
    sfx.kick(ev.beaten > 0);
    if (ev.first && holder) {
      sfx.firstTime();
      const p = this.root.toLocal(holder.getGlobalPosition());
      this.floatText("First time", p.x, p.y - 44, COL.cyan, 30);
      this.burst(p.x, p.y, COL.cyan, 10);
    }
    // the weight of a shot: the table holds still for a beat at contact
    if (shot) hitStop(side === 0 ? 70 : 50);
    await wait(70);
    this.ballFree = { x: this.ball.x, y: this.ball.y };
    this.trail = [];
    this.kickTint = shot ? (side === 0 ? COL.money : COL.bad) : 0xfff6e6;
    // the ball leaves fast and loses pace along the way
    const total = pts.length;
    const dur = Math.min(620, 150 + total * 11) / (shot ? 1.3 : 1) * (this.fast ? 0.6 : 1);
    const pos = { k: 0 };
    let last = -1;
    // a goal of yours: the last two lanes in slow motion while the camera leans in
    const slowFrom = myGoal && !reduced() ? Math.max(0, (total - 17) / (total - 1)) : 2;
    let slowed = false;
    const goalPt = { x: TX1, y: laneY((MOUTH[0] + MOUTH[1]) / 2) };
    const fly = tween(pos, { k: 1 }, dur, (t) => 1 - Math.pow(1 - t, 2.2));
    await new Promise<void>((res) => {
      const step = () => {
        const i = Math.min(total - 1, Math.floor(pos.k * (total - 1) + 1e-6));
        if (i !== last) {
          if (this.haunted) for (let j = last + 1; j <= i; j++) if (j % 2 === 0) this.trailDot(pts[j].x, pts[j].y);
          last = i;
          const p = pts[i];
          this.ball.position.set(p.x, p.y);
        }
        if (!slowed && pos.k >= slowFrom) {
          slowed = true;
          setTimeScale(0.35);
          void this.push(1.07, goalPt, 240);
          this.crowd.energy = 0.8;
        }
        if (pos.k >= 1) res();
        else requestAnimationFrame(step);
      };
      void fly.then(() => {
        pos.k = 1;
      });
      step();
    });
    setTimeScale(1);
    const pEnd = pts[total - 1];
    this.ball.position.set(pEnd.x, pEnd.y);
    if (ev.result === "blocked" || ev.result === "kept") {
      const ghostBlock = this.haunted && side === 0;
      hitStop(70);
      sfx.block();
      if (ghostBlock) sfx.ghostBlock();
      this.shake = Math.min(1, this.shake + 0.3);
      const blocker = ev.at ? this.rods[side === 0 ? 1 : 0][ev.at.rod]?.figs[ev.at.fig] : null;
      if (blocker) {
        blocker.scale.set(1.3);
        void tween(blocker.scale, { x: 1, y: 1 }, 280, ease.outBack);
      }
      // the clack: a white flash where ball meets figure
      const fl = new Graphics().circle(0, 0, 24).fill({ color: ghostBlock ? 0xcfe3ee : 0xffffff, alpha: 0.7 });
      fl.position.copyFrom(this.ball.position);
      this.fxLayer.addChild(fl);
      void tween(fl.scale, { x: 2, y: 2 }, 220);
      void tween(fl, { alpha: 0 }, 220).then(() => fl.destroy());
      const p = this.root.toLocal(this.tbl.toGlobal(this.ball.position));
      const keeper = ev.at?.rod === 0;
      if (side === 0 && shot && ev.tight && keeper && blocker) {
        // a tight shot: their keeper's glove gets there
        sfx.glove();
        const gl = glove(46, COL.cream);
        gl.position.copyFrom(blocker.position);
        const gp = this.tbl.toLocal(blocker.getGlobalPosition());
        gl.position.set(gp.x, gp.y);
        gl.rotation = this.port ? Math.PI / 2 : 0;
        this.fxLayer.addChild(gl);
        gl.scale.set(0.3);
        void tween(gl.scale, { x: 1.2, y: 1.2 }, 200, ease.outBack).then(() => tween(gl, { alpha: 0 }, 400).then(() => gl.destroy()));
        this.floatText("Tight. Gloved", p.x, p.y - 40, 0xffa13d, 30);
      } else if (side === 1 && ev.at && this.run!.wideBody(slotOf(ev.at.rod, ev.at.fig)) && ev.steps.length && ev.steps[ev.steps.length - 1].lane !== laneOf(ev.at.rod, this.disp.off[0][ev.at.rod], ev.at.fig)) {
        this.floatText("Wide body", p.x, p.y - 40, COL.money, 32);
        this.burst(p.x, p.y, COL.money, 12);
      } else this.floatText(ev.result === "kept" ? "Kept it" : side === 0 ? (ghostBlock ? "Ghost block" : "Blocked") : "Saved", p.x, p.y - 40, ev.result === "kept" ? COL.cyan : side === 0 ? COL.bad : COL.good, 30);
      if (side === 0 && shot) {
        this.crowd.react("cover");
        sfx.groan();
      } else if (side === 1) this.crowd.energy = Math.min(1, this.crowd.energy + 0.5);
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
      await wait(this.fast ? 40 : 120);
      return;
    }
    // into the net: the contact
    this.ballFree = { x: this.ball.x, y: this.ball.y };
    if (side === 0) {
      hitStop(80);
      sfx.netThud();
      if (ev.tight) {
        const p = this.root.toLocal(this.tbl.toGlobal(this.ball.position));
        this.floatText(ev.bounces ? "Off the wall, past the glove" : this.shotAfterPass ? "One touch, past the glove" : "Power past the glove", p.x, p.y - 50, 0xffa13d, 30);
      }
    }
    this.scorer = side === 0 ? holder || null : null;
    this.scorerSlot = side === 0 ? ev.slot : -1;
  }
  scorer: FigureView | null = null;
  scorerSlot = -1;

  trailDot(x: number, y: number) {
    if (reduced()) return;
    const d = new Graphics().circle(0, 0, 6).fill({ color: 0xff7a1c, alpha: 0.85 });
    d.position.set(x, y);
    this.ballLayer.addChildAt(d, 0);
    void tween(d, { alpha: 0 }, 420).then(() => d.destroy());
    void tween(d.scale, { x: 0.2, y: 0.2 }, 420);
    void tween(d, { y: y - 14 }, 420);
  }

  /** The build-up: the cells the move ran through light up on the felt, one pass after another. */
  lightChain(n: number, lanes: { x: number; lane: number }[]) {
    const L = this.chainLayer;
    L.removeChildren().forEach((c) => c.destroy());
    sfx.chain(n);
    const kit = look();
    const g = new Graphics();
    L.addChild(g);
    lanes.forEach((s, i) => {
      if (s.x < 0 || s.x > 9) return;
      const x = colX(s.x);
      const y = laneY(Math.max(0, Math.min(LANES - 1, s.lane)));
      g.roundRect(x - 26, y - LH / 2 + 3, 52, LH - 6, 8).fill({ color: i === lanes.length - 1 ? COL.money : kit.kitHi, alpha: 0.2 });
    });
    for (let i = 1; i < lanes.length; i++) {
      const a = lanes[i - 1];
      const b = lanes[i];
      g.moveTo(colX(a.x), laneY(a.lane)).lineTo(colX(b.x), laneY(b.lane));
    }
    g.stroke({ width: 3, color: kit.kitHi, alpha: 0.5 });
    if (!reduced()) {
      g.alpha = 0;
      void tween(g, { alpha: 1 }, 260);
    }
    // rules 3: the second pass puts +1 Power on the shot (a goal from here is a Team move); 2.1 named the third
    const rules3 = !!this.run?.nextRules;
    if (rules3 ? n === 2 : n >= 3) {
      const p = this.root.toLocal(this.tbl.toGlobal({ x: (TX0 + TX1) / 2, y: LANE0 + 40 }));
      this.floatText(rules3 ? "Build-up: +1 Power" : "Team move", p.x, p.y, COL.money, 36);
    }
  }

  async animGoal(side: 0 | 1, rating: number, style: string) {
    const L = this.L;
    const rm = reduced();
    const digit = side === 0 ? this.scoreYou : this.scoreThem;
    digit.scale.set(1.6);
    void tween(digit.scale, { x: 1, y: 1 }, 420, ease.outBack);
    const gx = side === 0 ? TX1 + 30 : TX0 - 30;
    const net = new Graphics().rect(side === 0 ? TX1 : TX0 - 50, laneY(MOUTH[0] - 0.5), 50, (MOUTH[1] - MOUTH[0] + 1) * LH).fill({ color: side === 0 ? COL.money : COL.bad, alpha: 0.45 });
    this.fxLayer.addChild(net);
    void tween(net, { alpha: 0 }, 900).then(() => net.destroy());
    this.ball.position.set(gx, this.ball.y);
    this.trail = [];
    // the net bellies out and settles
    const rip = { a: 18 };
    const netSide = side === 0 ? 1 : 0;
    if (!rm) {
      void tween(rip, { a: 0 }, 700, (t) => t);
      const step = () => {
        this.drawNets(netSide, rip.a * Math.cos((1 - rip.a / 18) * 9));
        if (rip.a > 0.01) requestAnimationFrame(step);
        else this.drawNets(0, 0);
      };
      step();
    }
    const h = this.hudNow || (this.run ? hudOf(this.run) : null);
    if (side === 0) {
      if (this.haunted) sfx.hauntGoal();
      else sfx.goal();
      sfx.roar();
      this.heat = 1;
      this.shake = 1;
      this.crowd.react("cheer");
      this.moment("goal", { rating, style, slot: this.scorerSlot });
      // the scorer's head pops and flips; teammates bump
      const sc = this.scorer;
      if (sc && !sc.destroyed) void sc.celebrate();
      let k = 0;
      for (const rv of this.rods[0]) for (const f of rv.figs) if (f !== sc) void f.bump(60 + k++ * 35);
      const launch = this.scorerSlot >= 0 ? this.run?.s.squad[this.scorerSlot] : null;
      const lk = look();
      this.tickerTape([TAPE[launch ? launch.u : 3], lk.kitHi, lk.kit, COL.money, COL.cream]);
      const banner = txt("GOAL", { fontFamily: NUM, fontSize: this.port ? 120 : 140, fill: this.haunted ? 0xff8a1c : COL.money, stroke: { color: COL.ink, width: 12 } });
      banner.anchor.set(0.5);
      const cx = L.area.x + L.area.w / 2;
      const cy = L.area.y + L.area.h / 2 - (this.port ? 110 : 70);
      banner.position.set(cx, cy);
      banner.scale.set(0.2);
      this.tapeLayer.addChild(banner);
      const sub = txt(`${style} · ${fmt(rating)}`, { fontFamily: NUM, fontSize: 44, fill: COL.cream, stroke: { color: COL.pink, width: 8 } });
      sub.anchor.set(0.5);
      sub.position.set(cx, cy + 92);
      sub.alpha = 0;
      this.tapeLayer.addChild(sub);
      const score = h ? this.bigScore(h.you, h.them, 0, cx, cy + (this.port ? 250 : 200)) : null;
      this.burst(cx - 220, cy, this.haunted ? 0xff8a1c : COL.money, 22);
      this.burst(cx + 220, cy, look().kitHi, 22);
      await tween(banner.scale, { x: 1, y: 1 }, 360, ease.outElastic);
      void tween(sub, { alpha: 1 }, 200);
      await wait(1000);
      void this.push(1, { x: TX1, y: laneY(4.5) }, 420);
      await Promise.all([tween(banner, { alpha: 0 }, 260), tween(sub, { alpha: 0 }, 260), score ? tween(score, { alpha: 0 }, 300) : Promise.resolve()]);
      banner.destroy();
      sub.destroy();
      score?.destroy({ children: true });
    } else {
      sfx.concede();
      sfx.groan();
      this.shake = 0.6;
      this.crowd.react("quiet");
      this.moment("conceded");
      const p = this.root.toLocal(this.tbl.toGlobal({ x: TX0 + 60, y: LANE0 + PITCH_H / 2 }));
      this.flashText("They score", COL.bad, p);
      const score = h ? this.bigScore(h.you, h.them, 1, L.area.x + L.area.w / 2, L.area.y + L.area.h / 2) : null;
      await wait(900);
      if (score) await tween(score, { alpha: 0 }, 260);
      score?.destroy({ children: true });
    }
    this.ballFree = null;
    this.disp.ball = null;
  }

  /** The score, big, in the middle of the table: the side that scored pops. */
  bigScore(you: number, them: number, popSide: 0 | 1, x: number, y: number): Container {
    const c = new Container();
    const size = this.port ? 150 : 170;
    const a = txt(String(you), { fontFamily: NUM, fontSize: size, fill: look().kitHi, stroke: { color: COL.ink, width: 12 } });
    const colon = txt(":", { fontFamily: NUM, fontSize: size * 0.8, fill: COL.cream, stroke: { color: COL.ink, width: 10 } });
    const b = txt(String(them), { fontFamily: NUM, fontSize: size, fill: this.haunted ? 0xcfe3ee : kitOf(this.clubNow()).hi, stroke: { color: COL.ink, width: 12 } });
    for (const t of [a, colon, b]) t.anchor.set(0.5);
    a.x = -size * 0.55;
    b.x = size * 0.55;
    colon.y = -size * 0.06;
    c.addChild(a, colon, b);
    c.position.set(x, y);
    this.tapeLayer.addChild(c);
    const pop = popSide === 0 ? a : b;
    if (!reduced()) {
      pop.scale.set(0.2);
      void tween(pop.scale, { x: 1.25, y: 1.25 }, 260, ease.outBack).then(() => tween(pop.scale, { x: 1, y: 1 }, 220));
    }
    return c;
  }

  /** Ticker tape: strips in the pair's and your kit's colours, falling over the table. */
  tickerTape(colors: number[]) {
    if (reduced()) return;
    const a = this.L.area;
    for (let i = 0; i < 90 && this.tape.length < 200; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.width = 5 + Math.random() * 4;
      s.height = 13 + Math.random() * 10;
      s.tint = colors[i % colors.length];
      s.position.set(a.x + Math.random() * a.w, a.y - 20 - Math.random() * a.h * 0.5);
      s.rotation = Math.random() * 6.28;
      this.tapeLayer.addChild(s);
      this.tape.push({ s, sy: s.scale.y, vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 160, twirl: (Math.random() - 0.5) * 6, flip: Math.random() * 6.28, life: 2 + Math.random() * 1 });
    }
  }

  frameTape(sec: number) {
    if (!this.tape.length) return;
    const H = this.L.H;
    for (const p of this.tape) {
      p.life -= sec;
      p.flip += sec * 9;
      p.s.x += (p.vx + Math.sin(p.flip * 0.5) * 40) * sec;
      p.s.y += p.vy * sec;
      p.s.rotation += p.twirl * sec;
      p.s.scale.y = p.sy * (0.15 + 0.85 * Math.abs(Math.cos(p.flip)));
      p.s.alpha = Math.min(1, p.life / 0.6);
      if (p.s.y > H + 40) p.life = 0;
    }
    const dead = this.tape.filter((p) => p.life <= 0);
    for (const p of dead) p.s.destroy();
    if (dead.length) this.tape = this.tape.filter((p) => p.life > 0);
  }

  async animTurnover(to: 0 | 1, why: string) {
    if (why === "touches" || why === "dead") {
      this.ballFree = null;
      this.disp.ball = { side: to, rod: 0, fig: 0 };
      const p = this.root.toLocal(this.tbl.toGlobal({ x: (TX0 + TX1) / 2, y: LANE0 + PITCH_H / 2 }));
      this.flashText(why === "touches" ? (to === 1 ? "Out of touches" : "Their touches ran out") : "Dead ball", why === "touches" && to === 1 ? COL.bad : COL.dim, p);
      if (why === "touches" && to === 1) sfx.whistle();
      else sfx.whoosh();
      await wait(this.fast ? 160 : 420);
    } else await wait(120);
  }

  /** Full time on the table: the whistle, the stands, and the season's new best goal again if this match made it. */
  async whistleBeat(reason: "won" | "lost" | "draw" | "final") {
    sfx.fullTime();
    this.moment("fulltime", { reason });
    this.crowd.react(reason === "lost" ? "quiet" : "cheer");
    if (reason !== "lost") sfx.roar();
    const dim = new Graphics().rect(TX0, LANE0, TX1 - TX0, PITCH_H).fill({ color: 0x05020a, alpha: 1 });
    dim.alpha = 0;
    this.fxLayer.addChild(dim);
    void tween(dim, { alpha: 0.35 }, 300);
    // the referee's whistle, drawn big on the centre spot
    const w = new Graphics();
    // a referee's whistle: the barrel, the round chamber with its slot, the mouthpiece and the cord
    w.moveTo(30, -2).bezierCurveTo(60, -40, 96, -10, 86, 30).stroke({ width: 4, color: COL.pink, alpha: 0.9 });
    w.roundRect(-46, -6, 22, 14, 4).fill(0x9aa6b2).stroke({ width: 4, color: COL.ink });
    w.roundRect(-30, -16, 50, 30, 8).fill(0xd8dde6).stroke({ width: 4, color: COL.ink });
    w.circle(22, 4, 22).fill(0xd8dde6).stroke({ width: 4, color: COL.ink });
    w.roundRect(-26, -12, 40, 6, 3).fill({ color: 0xffffff, alpha: 0.7 });
    w.circle(15, -3, 6).fill({ color: 0xffffff, alpha: 0.6 });
    w.rect(-8, -16, 14, 8).fill(COL.ink);
    w.circle(30, 0, 4).fill(COL.ink);
    w.position.set((TX0 + TX1) / 2, LANE0 + PITCH_H / 2);
    this.upright(w);
    this.fxLayer.addChild(w);
    if (!reduced()) {
      w.scale.set(0.2);
      await tween(w.scale, { x: 1.6, y: 1.6 }, 240, ease.outBack);
      for (let i = 0; i < 3; i++) {
        await tween(w.scale, { x: 1.75, y: 1.75 }, 70);
        await tween(w.scale, { x: 1.6, y: 1.6 }, 90);
      }
    }
    await wait(380);
    void tween(w, { alpha: 0 }, 220).then(() => w.destroy());
    const run = this.run;
    const best = run?.s.best;
    if (run && best && reason !== "lost" && best.total > this.bestAtKickoff && best.path?.length && !this.fast) {
      this.moment("replay-ready", best);
      await this.playReplay(best);
    }
    void tween(dim, { alpha: 0 }, 260).then(() => dim.destroy());
  }

  /** Plays a best goal on the table (the instant replay, called from the season recap). */
  async playReplay(best: BestGoal): Promise<void> {
    if (!best?.path?.length || this.replaying) return;
    const wasRoot = this.root.visible;
    const wasTbl = this.tbl.visible;
    this.root.visible = true;
    this.tbl.visible = true;
    this.replaying = true;
    this.replaySkip = false;
    const lk = look();
    try {
      await playPath(
        {
          layer: this.replayLayer,
          upright: (o) => this.upright(o),
          kit: { main: lk.kit, hi: lk.kitHi },
          onGoal: () => {
            if (!this.replaySkip) sfx.crowd();
          },
          skip: () => this.replaySkip,
        },
        best,
      );
    } finally {
      this.replaying = false;
      this.tbl.visible = wasTbl;
      this.root.visible = wasRoot;
      this.moment("replay-done", best);
    }
  }

  async animEnd(won: boolean, draw: boolean) {
    const L = this.L;
    if (won || draw) sfx.clear();
    else sfx.lose();
    const run = this.run!;
    const final = run.s.phase === "won";
    // a rules-3 league match: a loss is three points gone, not the season (unless the table says so)
    const league = run.league && (run.s.match?.kind ?? 2) < 2;
    const over = run.s.phase === "over";
    const text = final
      ? run.mode === "haunt"
        ? "LAID TO REST"
        : run.mode === "daily"
          ? "MATCH DAY WON"
          : "CHAMPIONS"
      : won
        ? "FULL TIME"
        : draw
          ? league
            ? "LEVEL: A POINT"
            : "LEVEL: THROUGH"
          : league
            ? over
              ? "OUT OF THE RACE"
              : "LOST: NO POINTS"
            : "KNOCKED OUT";
    const banner = txt(text, { fontFamily: NUM, fontSize: this.port ? 76 : 96, fill: won || draw ? COL.money : COL.bad, stroke: { color: COL.ink, width: 10 } });
    banner.anchor.set(0.5);
    banner.position.set(L.area.x + L.area.w / 2, L.area.y + L.area.h / 2);
    banner.scale.set(0.2);
    this.tapeLayer.addChild(banner);
    if (won) this.heat = 1;
    if (final) this.tickerTape([COL.money, look().kitHi, COL.cream, look().kit]);
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

  // ================================================================ boss rules and table events on the table
  /** A screen offset (right, down) as a table offset, whichever way the table is turned. */
  scr(dx: number, dy: number): { x: number; y: number } {
    return this.port ? { x: -dy, y: dx } : { x: dx, y: dy };
  }

  /** A data line for a launch, short: curve, holders, trades. */
  dataLine(l: Launch): string {
    return `curve ${Math.round(l.p / 100)}% · ${l.h} holders · ${l.k} trades`;
  }

  /**
   * A boss club walks out: the felt dims, the crest slams down with a brass hit, their captain (a real launch from
   * the cut) steps forward with its data tag, the rule reads out, and then the rule happens on the table. A tap
   * cuts it short. Reduced motion: the rule's mark and its corner badge, nothing else.
   */
  async walkout(id: string, view: RuleView) {
    const run = this.run;
    if (!run || !run.s.match) return;
    const m = run.m;
    const club = m.club;
    const kit = kitOf(club);
    setMood(view.kind === "bell" ? "final" : "boss");
    if (reduced() || this.fast) {
      this.walkoutPending = false;
      this.applyRuleMarks(false);
      this.moment("boss-walkout-done", { id, view });
      return;
    }
    this.replaying = true;
    this.replaySkip = false;
    const L = new Container();
    this.fxLayer.addChild(L);
    const dim = new Graphics().roundRect(TX0 - 64, CAB_T, TX1 - TX0 + 128, CAB_B - CAB_T, 22).fill({ color: 0x05020a, alpha: 1 });
    dim.alpha = 0;
    L.addChild(dim);
    await tween(dim, { alpha: 0.78 }, 220);
    const C = { x: (TX0 + TX1) / 2, y: LANE0 + PITCH_H / 2 };
    const at = (dx: number, dy: number) => {
      const o = this.scr(dx, dy);
      return { x: C.x + o.x, y: C.y + o.y };
    };
    // the crest slams down
    const cr = crest(club, kit, this.port ? 64 : 72);
    this.upright(cr);
    const cp = at(this.port ? 0 : -150, this.port ? -120 : -36);
    cr.position.set(cp.x, cp.y);
    cr.scale.set(3);
    cr.alpha = 0;
    L.addChild(cr);
    void tween(cr, { alpha: 1 }, 120);
    await tween(cr.scale, { x: 1, y: 1 }, 240, ease.inCubic);
    sfx.brassHit();
    hitStop(90);
    this.shake = 0.8;
    this.heat = 0.8;
    const ring = new Graphics().circle(0, 0, 90).stroke({ width: 6, color: kit.hi, alpha: 0.9 });
    ring.position.copyFrom(cr.position);
    L.addChild(ring);
    void tween(ring.scale, { x: 2.4, y: 2.4 }, 420);
    void tween(ring, { alpha: 0 }, 420);
    const name = txt(club.toUpperCase(), { fontFamily: NUM, fontSize: this.port ? 64 : 58, fill: kit.hi === 0xffffff ? COL.cream : kit.hi, stroke: { color: COL.ink, width: 8 }, letterSpacing: 2 });
    const rule = txt(BOSS[id]?.text || RULE_LABEL[view.kind], { fontFamily: NUM, fontSize: this.port ? 34 : 30, fill: COL.cream, stroke: { color: COL.ink, width: 6 }, wordWrap: true, wordWrapWidth: this.port ? 420 : 520, align: this.port ? "center" : "left" });
    for (const t of [name, rule]) {
      t.anchor.set(this.port ? 0.5 : 0, 0.5);
      this.upright(t);
      t.alpha = 0;
      L.addChild(t);
    }
    const np = at(this.port ? 0 : -60, this.port ? 0 : -64);
    name.position.set(np.x, np.y);
    const rp = at(this.port ? 0 : -60, this.port ? 76 : 2);
    rule.position.set(rp.x, rp.y);
    void tween(name, { alpha: 1 }, 180);
    await wait(160);
    void tween(rule, { alpha: 1 }, 200);
    // their captain steps forward: the strongest curve on their side
    const rivals = run.rivals();
    let cap: Launch | null = null;
    for (const l of rivals) if (l && (!cap || l.p > cap.p)) cap = l;
    if (cap) {
      const fv = new FigureView(1, cap, 0, "them", kit);
      fv.eventMode = "none";
      if (fv.tag) fv.tag.visible = false;
      const from = at(this.port ? 0 : 520, this.port ? 360 : 120);
      const to = at(this.port ? 0 : 180, this.port ? 200 : 120);
      fv.position.set(from.x, from.y);
      fv.scale.set(2.2);
      fv.alpha = 0;
      L.addChild(fv);
      void tween(fv, { alpha: 1 }, 200);
      await tween(fv, { x: to.x, y: to.y }, 360, ease.outBack);
      const tag = txt(`CAPTAIN $${cap.s}\n${this.dataLine(cap)}`, { fontFamily: NUM, fontSize: this.port ? 30 : 24, fill: COL.cream, stroke: { color: COL.ink, width: 6 }, align: "center", lineHeight: this.port ? 32 : 26 });
      tag.anchor.set(0.5, 0);
      this.upright(tag);
      const tp = at(this.port ? 0 : 180, this.port ? 270 : 190);
      tag.position.set(tp.x, tp.y);
      L.addChild(tag);
    }
    for (let i = 0; i < 14 && !this.replaySkip; i++) await wait(80);
    await tween(L, { alpha: 0 }, 220);
    L.destroy({ children: true });
    this.replaying = false;
    this.walkoutPending = false;
    this.applyRuleMarks(true);
    this.moment("boss-walkout-done", { id, view });
  }

  /** Trading Halt thaws at the first goal: the tape comes off the rod and the plaque says so. */
  haltLifted() {
    this.applyRuleMarks(false);
    sfx.latch();
    const p = this.root.toLocal(this.tbl.toGlobal({ x: (TX0 + TX1) / 2, y: LANE0 + PITCH_H / 2 }));
    this.floatText("Halt lifted", p.x, p.y - 60, COL.money, 40);
  }

  /** True from kickoff until a boss club's walk-out has played: the rule's marks wait for it. */
  walkoutPending = false;

  /** Graphics for the drift wobble and the bell lights, redrawn each frame. */
  ruleAnim: Graphics | null = null;
  eventAnim: Graphics | null = null;

  /**
   * The boss rule's marks on the table, all match: the pulled rod's rug, HALTED tape, a padlock on the keeper,
   * mirror tethers, their wobbling goal mouth, stats-to-shoot ticks, stadium lights for the final. `intro` plays the
   * moment it happens (the yank, the tape winding on, the lock dropping, the bell).
   */
  applyRuleMarks(intro: boolean) {
    const run = this.run;
    const L = this.ruleLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ruleAnim = null;
    this.badgeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const rv of this.rods[0] || []) for (const c of rv.c.children.slice()) if ((c as Container & { label: string }).label === "halt-tape") c.destroy({ children: true });
    const m = run?.s.match;
    if (!run || !m || !(run.s.phase === "attack" || run.s.phase === "defend") || this.walkoutPending) return;
    this.placeEventBadge();
    const v = m.ruleView;
    if (!v) return;
    const kit = kitOf(m.club);
    const anim = intro && !reduced();
    // the corner plaque
    const big = this.port;
    const b = ruleBadge(m.club, kit, v.kind === "frozen" && (v.rod ?? -1) < 0 ? "Halt lifted" : RULE_LABEL[v.kind], big ? 370 : 300, big ? 62 : 50, big ? 27 : 21);
    this.placeBadge(b, 0);
    this.badgeLayer.addChild(b);
    if (anim) {
      b.alpha = 0;
      void tween(b, { alpha: 1 }, 300);
    }
    const yours = (r: number) => this.rods[0][r];
    switch (v.kind) {
      case "pulled": {
        const r = v.rod ?? 1;
        const x = colX(colOf(0, r));
        const rg = rug(64);
        rg.position.set(x, CTRL_Y + ARROW_H);
        rg.rotation = -0.2;
        L.addChild(rg);
        if (anim) {
          sfx.clothPull();
          // the rod's two men go with the cloth
          const ghost = new Container();
          for (let f = 0; f < RODS[r].n; f++) {
            const fv = new FigureView(0, run.s.squad[slotOf(r, f)], f, "you");
            fv.eventMode = "none";
            if (fv.tag) fv.tag.visible = false;
            fv.position.set(0, laneY(m.off[0][r] + f * RODS[r].gap) - LANE0);
            ghost.addChild(fv);
          }
          ghost.position.set(x, LANE0);
          L.addChild(ghost);
          void tween(ghost, { y: LANE0 + PITCH_H + 260, alpha: 0 }, 520, ease.inCubic).then(() => ghost.destroy({ children: true }));
          rg.scale.set(0.2);
          void tween(rg.scale, { x: 1, y: 1 }, 420, ease.outBack);
        }
        break;
      }
      case "frozen": {
        const rv = yours(v.rod ?? 1);
        if (!rv) break;
        const tape = haltTape(PITCH_H + RAIL_T + RAIL);
        tape.position.set(0, LANE0 - RAIL_T + (PITCH_H + RAIL_T + RAIL) / 2 - rv.c.y);
        tape.alpha = 0.85;
        (tape as Container & { label: string }).label = "halt-tape";
        rv.c.addChildAt(tape, 1);
        const t = txt("HALTED", { fontFamily: NUM, fontSize: this.port ? 30 : 24, fill: 0xffffff, stroke: { color: 0xd83030, width: 6 }, letterSpacing: 2 });
        t.anchor.set(0.5);
        this.upright(t);
        t.position.set(rv.c.x, LANE0 + PITCH_H - 22);
        L.addChild(t);
        if (anim) {
          sfx.latch();
          tape.scale.y = 0;
          void tween(tape.scale, { y: 1 }, 520, ease.outCubic);
        }
        break;
      }
      case "locked": {
        const fv = yours(0)?.figs[0];
        if (!fv) break;
        const lock = padlock(this.port ? 44 : 38);
        this.upright(lock);
        lock.position.set(-30, -FR - 8);
        fv.addChild(lock);
        if (anim) {
          sfx.latch();
          lock.scale.set(2.4);
          lock.alpha = 0;
          void tween(lock, { alpha: 1 }, 120);
          void tween(lock.scale, { x: 1, y: 1 }, 300, ease.outBack);
        }
        break;
      }
      case "mirror": {
        // dotted tethers along the near rail: your rod and the one that copies it
        const g = new Graphics();
        const y = LANE0 + PITCH_H - 8;
        for (let r = 0; r < 4; r++) {
          if (m.pulled === r) continue;
          const a = colX(colOf(0, r));
          const bx = colX(colOf(1, [0, 3, 2, 1][r]));
          const h = 26 + Math.abs(bx - a) * 0.08;
          for (let i = 0; i <= 24; i++) {
            if (i % 2) continue;
            const t0 = i / 24;
            const t1 = (i + 1) / 24;
            const px = (t: number) => a + (bx - a) * t;
            const py = (t: number) => y - Math.sin(Math.PI * t) * h;
            g.moveTo(px(t0), py(t0)).lineTo(px(t1), py(t1));
          }
          g.circle(a, y, 5).circle(bx, y, 5);
        }
        g.stroke({ width: 3, color: kit.hi, alpha: 0.75 });
        L.addChild(g);
        if (anim) {
          g.alpha = 0;
          void tween(g, { alpha: 1 }, 500);
        }
        break;
      }
      case "drift": {
        this.ruleAnim = new Graphics();
        L.addChild(this.ruleAnim);
        const arrow = new Graphics();
        const d = v.d ?? 1;
        const y = laneY(MOUTH[d < 0 ? 0 : 1] + d * 1.2);
        arrow.poly([TX1 - 60, y - 9 * d, TX1 - 46, y + 7 * d, TX1 - 74, y + 7 * d]).fill({ color: kit.hi, alpha: 0.8 });
        L.addChild(arrow);
        break;
      }
      case "check": {
        // Vibe Check: who may shoot. A tick on the figures with a stat, a cross on the ones without
        for (const rv of this.rods[0]) {
          rv.figs.forEach((fv) => {
            const slot = this.slotOfFig(fv);
            if (slot < 0) return;
            const st = run.stats(slot);
            const ok = st.power || st.pace || st.grip;
            const g = new Graphics();
            g.circle(0, 0, 9).fill(ok ? COL.good : 0x5a4a56).stroke({ width: 2.5, color: COL.ink });
            if (ok) g.moveTo(-4, 0).lineTo(-1, 4).lineTo(5, -4).stroke({ width: 3, color: COL.ink, cap: "round" });
            else g.moveTo(-4, -4).lineTo(4, 4).moveTo(4, -4).lineTo(-4, 4).stroke({ width: 3, color: COL.ink, cap: "round" });
            this.upright(g);
            g.position.set(22, -FR - 2);
            fv.addChild(g);
            if (anim) {
              g.scale.set(0);
              void tween(g.scale, { x: 1, y: 1 }, 260, ease.outBack);
            }
          });
        }
        break;
      }
      case "bell": {
        // stadium lights for the final: four cones of light from the corners, and the bell at their goal
        this.ruleAnim = new Graphics();
        L.addChild(this.ruleAnim);
        const bell = bellIcon(this.port ? 40 : 34);
        this.upright(bell);
        bell.position.set(TX1 + 34, laneY(MOUTH[0] - 0.5) - 34);
        L.addChild(bell);
        if (anim) {
          sfx.bell();
          void (async () => {
            for (let i = 0; i < 6; i++) {
              await tween(bell, { rotation: (this.port ? Math.PI / 2 : 0) + (i % 2 ? -0.35 : 0.35) }, 90);
            }
            await tween(bell, { rotation: this.port ? Math.PI / 2 : 0 }, 120);
          })();
        }
        break;
      }
      case "cost2":
      case "late":
      case "short":
        // drawn with the handles, the pass targets and the touch pips
        if (anim) sfx.latch();
        break;
    }
  }

  /** The squad slot of one of your figures on the table, or -1. */
  slotOfFig(fv: FigureView): number {
    for (let r = 0; r < 4; r++) {
      const f = this.rods[0][r]?.figs.indexOf(fv) ?? -1;
      if (f >= 0) return slotOf(r, f);
    }
    return -1;
  }

  /** Puts a corner plaque in its slot: above the stands' left end on a wide table, the near end on a phone. */
  placeBadge(b: Container, i: number) {
    if (this.port) {
      this.upright(b);
      b.position.set(70 + i * 70, -STAND_T + 2);
    } else b.position.set(12 + i * 316, -STAND_T + 2);
  }

  /** The table event: a tint on the felt, its plaque at the corner. `intro` flashes it in at kickoff. */
  syncEventTint(id?: TableEventId | null, intro = false) {
    const L = this.eventLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.eventAnim = null;
    const run = this.run;
    const ev = id ?? (run && run.s.match && this.inMatch() ? run.s.match.event : null);
    if (!ev) return;
    const e = EVENT_LOOK[ev];
    const g = new Graphics();
    L.addChild(g);
    if (ev === "volatile") {
      this.eventAnim = g;
    } else if (ev === "thin") {
      // the sticky lane, through midfield only (columns 3 to 6), where no kick runs along it
      const lane = run?.s.match?.sticky ?? -1;
      if (lane >= 0) {
        const y = LANE0 + lane * LH;
        const half = (TX1 - TX0) / 18;
        const x0 = colX(3) - half;
        const x1 = colX(6) + half;
        g.rect(x0, y, x1 - x0, LH).fill({ color: e.tint, alpha: 0.2 });
        for (let x = x0; x < x1 - 1; x += 18) g.moveTo(x, y + LH).lineTo(Math.min(x1, x + 18), y);
        g.stroke({ width: 2, color: e.tint, alpha: 0.3 });
        g.rect(x0, y, x1 - x0, LH).stroke({ width: 2, color: e.tint, alpha: 0.55 });
      }
    } else if (ev === "green") {
      g.rect(TX0, LANE0, TX1 - TX0, PITCH_H).fill({ color: e.tint, alpha: 0.06 });
      g.rect(TX0, LANE0, TX1 - TX0, PITCH_H).stroke({ width: 6, color: e.tint, alpha: 0.35 });
    } else if (ev === "halfhalt") {
      const mid = (TX0 + TX1) / 2;
      for (let y = LANE0; y < LANE0 + PITCH_H; y += 28) g.rect(mid - 6, y, 12, 16).fill({ color: e.tint, alpha: 0.55 });
    }
    if (intro && !reduced()) {
      L.alpha = 0;
      void tween(L, { alpha: 1 }, 500);
      const p = this.root.toLocal(this.tbl.toGlobal({ x: (TX0 + TX1) / 2, y: LANE0 + PITCH_H / 2 }));
      this.floatText(e.name, p.x, p.y, e.tint, 44);
    }
    this.placeEventBadge(ev);
  }

  placeEventBadge(id?: TableEventId | null) {
    const run = this.run;
    const ev = id ?? (run && run.s.match ? run.s.match.event : null);
    for (const c of this.badgeLayer.children.slice()) if ((c as Container & { label: string }).label === "event") c.destroy({ children: true });
    if (!ev || !this.inMatch()) return;
    const big = this.port;
    const b = eventBadge(ev, big ? 370 : 300, big ? 62 : 50, big ? 27 : 21);
    (b as Container & { label: string }).label = "event";
    this.placeBadge(b, run?.s.match?.ruleView ? 1 : 0);
    this.badgeLayer.addChild(b);
  }

  /** The rule's and the event's moving parts, once a frame. */
  frameRule() {
    const t = this.t;
    const rm = reduced();
    const g = this.ruleAnim;
    const v = this.run?.s.match?.ruleView;
    if (g && v) {
      g.clear();
      if (v.kind === "drift") {
        // their goal mouth wobbles: the shot line bends
        const y0 = laneY(MOUTH[0] - 0.5);
        const h = (MOUTH[1] - MOUTH[0] + 1) * LH;
        g.moveTo(TX1 - 4, y0);
        for (let y = 0; y <= h; y += 6) g.lineTo(TX1 - 4 + (rm ? 0 : Math.sin(t * 4 + y * 0.12) * 5), y0 + y);
        g.stroke({ width: 4, color: kitOf(this.run?.s.match?.club).hi, alpha: 0.7 });
      } else if (v.kind === "bell") {
        const a = rm ? 0.06 : 0.05 + 0.02 * Math.sin(t * 1.3);
        for (const [cx, cy] of [
          [TX0 - 40, LANE0 - 30],
          [TX1 + 40, LANE0 - 30],
          [TX0 - 40, LANE0 + PITCH_H + 30],
          [TX1 + 40, LANE0 + PITCH_H + 30],
        ]) {
          const tx = (TX0 + TX1) / 2 + (cx < 500 ? -120 : 120);
          const ty = LANE0 + PITCH_H / 2;
          const nx = -(ty - cy);
          const ny = tx - cx;
          const len = Math.hypot(nx, ny) || 1;
          const w = 170;
          g.poly([cx, cy, tx + (nx / len) * w, ty + (ny / len) * w, tx - (nx / len) * w, ty - (ny / len) * w]).fill({ color: 0xfff6e0, alpha: a });
        }
      }
    }
    const e = this.eventAnim;
    if (e) {
      e.clear();
      const k = rm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2);
      const tint = EVENT_LOOK.volatile.tint;
      for (const y of [LANE0, LANE0 + PITCH_H - 10]) e.rect(TX0, y, TX1 - TX0, 10).fill({ color: tint, alpha: 0.2 + 0.25 * k });
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
    drawStage(this.stageHost(run));
    this.tipZone();
  }

  /** The table's side of the stage panels (src/stage.ts): where they draw and what their buttons do. */
  stageHost(run: Run): StageHost {
    return {
      run,
      area: this.L.area,
      port: this.port,
      layer: this.stageLayer,
      go: () => this.doGo(),
      back: () => this.doBack(),
      collect: () => this.doCollect(),
      buy: (i) => this.doBuy(i),
      next: () => this.doNext(),
      lineup: () => this.hooks.openOverlay("squad"),
    };
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
    this.bestAtKickoff = run.s.best?.total ?? 0;
    this.deskN = 0;
    this.openShots = -1;
    if (!this.act({ t: "go" })) return;
    this.walkoutPending = !!run.s.match?.ruleView;
    // a fresh match: last match's tape and scarves are put away
    for (const p of this.tape) p.s.destroy();
    this.tape = [];
    this.crowd.react("idle");
    this.crowd.energy = 0.4;
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
    const m = run.s.match;
    if (m) this.say(`${m.club} at the table. ${STYLES[m.style].name}.`, "flat");
    this.syncEventTint(null, true);
    void this.playEvents(run.events.slice()).finally(() => {
      this.busy = false;
      this.afterEvents();
    });
  }

  doCollect() {
    if (!this.act({ t: "collect" })) return;
    sfx.coin();
    this.refreshAll();
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
    this.asked = true;
    if (run.s.phase === "attack") {
      const p = bestTouch(run);
      if (!p) return;
      if (p.t === "kick") {
        const i = this.kickTargets.findIndex((t) => t.kick.r === p.r && t.kick.d === p.d);
        if (i >= 0) this.hoverTarget(i);
        showTip("hint", "table", p.r === 4 ? "Shoot: the gold disc in their goal mouth." : "Pass: the ringed figure. Tap it.", "touch");
      } else {
        showTip("hint", "table", `Slide your ${RODS[p.r].name.toLowerCase()} ${p.d < 0 ? (this.port ? "left" : "up") : this.port ? "right" : "down"} one lane: drag the rod, or the ${p.d < 0 ? "top" : "bottom"} button at its handle.`, "touch");
        this.pulseArrow(p.r, p.d);
      }
    } else if (run.s.phase === "defend") {
      const b = bestBlock(run);
      showTip("hint", "table", b ? `Block: slide your ${RODS[b.r].name.toLowerCase()} ${b.d < 0 ? "up" : "down"}.` : "Nothing to block that helps. Press Ready.", "touch");
      if (b) this.pulseArrow(b.r, b.d);
    }
  }

  /** Puts the pointer on the coach's next touch. Called whenever the controls are redrawn. */
  aimPoint() {
    this.pointAt = null;
    const c = this.coachTap();
    if (!c) return;
    const p = this.root.toLocal({ x: c.x, y: c.y });
    const a = c.a;
    const defend = this.run?.s.phase === "defend";
    this.pointText.text = a.t === "kick" ? (a.r === 4 ? "SHOOT" : "PASS") : a.t === "hold" ? "READY" : defend ? "BLOCK" : "SLIDE";
    // the tag sits off the side of the target it names, never over the other button of the same handle
    this.pointAt = { x: p.x, y: p.y, below: a.t === "slide" && a.d === 1 && !this.port };
    this.pointRing.clear();
    const r = a.t === "hold" ? 0 : (a.t === "kick" ? FR + 16 : 40) * this.tbl.scale.x;
    if (r) this.pointRing.circle(0, 0, r).stroke({ width: 5, color: COL.money }).circle(0, 0, r + 7).stroke({ width: 3, color: COL.ink, alpha: 0.6 });
    this.pointTag.position.set(0, this.pointAt.below ? (r || 30) + 30 : -(r || 30) - 30);
  }
  /** Shows the pointer to a new player, to anyone who asked, and to anyone stuck for a few seconds. */
  framePoint(rm: boolean) {
    const at = this.pointAt;
    const run = this.run;
    const ph = run?.s.phase;
    const novice = local.get<number>("kk.games", 0) < 2 || ui.tut !== null;
    const want = !!at && !!run && !this.busy && !this.replaying && (ph === "attack" || ph === "defend") && (novice || this.asked || this.t - this.idleAt > 7);
    this.point.visible = want;
    if (!want || !at) return;
    const k = rm ? 1 : 1 + 0.08 * Math.sin(this.t * 6);
    this.pointRing.scale.set(k);
    const bob = rm ? 0 : Math.abs(Math.sin(this.t * 4)) * 8;
    this.point.position.set(at.x, at.y + (at.below ? bob : -bob));
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
  /**
   * For QA: plays on with the coach's bot, without animation, until the next fixture against boss club `boss` (any
   * boss when empty), then shows it. Same actions a tap would take, so the trail stays honest. False if the run ends.
   */
  fastForward(boss = ""): boolean {
    const run = this.run;
    if (!run) return false;
    // the sim's bot, dressing room included, so a QA season goes as far as the balance numbers say
    for (let i = 0; i < 20000; i++) {
      const ph = run.s.phase;
      if (ph === "over" || ph === "won") break;
      const b = run.bossOf();
      if (ph === "fixture" && b && (!boss || b === boss)) break;
      try {
        if (!botStep(run)) break;
      } catch {
        break;
      }
    }
    this.hooks.onAction(run.trail[run.trail.length - 1] || { t: "go" }, run);
    this.refreshAll();
    if (run.s.phase === "over" || run.s.phase === "won") this.hooks.onOver(run);
    return run.s.phase === "fixture";
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

  /**
   * For QA: the coach's next touch and where to tap for it on screen (a rod's handle button, a kick target, Ready),
   * so a test plays through the real pointer paths. Null when there is nothing to tap.
   */
  coachTap(): { a: Action; x: number; y: number } | null {
    const run = this.run;
    if (!run || this.busy) return null;
    if (run.s.phase === "attack") {
      const p = bestTouch(run);
      if (!p) return null;
      if (p.t === "kick") {
        const t = this.kickTargets.find((k) => k.kick.r === p.r && k.kick.d === p.d);
        if (!t) return null;
        const g = this.tbl.toGlobal({ x: t.x, y: t.y });
        return { a: { t: "kick", r: p.r, d: p.d }, x: g.x, y: g.y };
      }
      const g = this.screenOfArrow(p.r, p.d);
      return g ? { a: { t: "slide", r: p.r, d: p.d }, ...g } : null;
    }
    if (run.s.phase === "defend") {
      const b = run.m.blockSlides > 0 ? bestBlock(run) : null;
      if (b) {
        const g = this.screenOfArrow(b.r, b.d);
        return g ? { a: { t: "slide", r: b.r, d: b.d }, ...g } : null;
      }
      if (!this.btnReady.visible) return null;
      const g = this.btnReady.getGlobalPosition();
      return { a: { t: "hold" }, x: g.x, y: g.y };
    }
    return null;
  }
}
