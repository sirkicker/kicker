// KICKER Club: the table. The same felt, brass rods, stands and wire as the season table (src/game.ts), drawn for two
// clubs: home on the near rods (left on a wide screen, bottom on a phone), away on the far ones. It does not run a
// match itself: shared/club.ts decides every chance, and this file plays one Moment at a time (the build-up along
// the chain, the shot, the outcome, and a goal's moment). It also hosts the Training drill.
// HTML screens sit around it: fit() takes the CSS-pixel rectangle the table may use.
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { LANES, MOUTH, RODS } from "../../shared/content.js";
import { traitsOf, type Launch } from "../../shared/data.js";
import { ROD_SLOTS, type Moment, type Side } from "../../shared/club.js";
import { mulberry32, hash32, type Rand } from "../../shared/rng.js";
import { sfx } from "../audio.js";
import { Crowd, loadCrowd } from "../crowd.js";
import { Desk, type Tone } from "../desk.js";
import { FR, FigureView, txt } from "../figures.js";
import { crtFilter, setSwirlColors, swirlFilter, type FxFilter } from "../fx.js";
import { look } from "../house.js";
import { CAB_B, CAB_T, DESK_P, LANE0, LH, PITCH_H, RAIL, RAIL_T, STAND_T, TS_H, TS_W, TX0, TX1, colX, laneY } from "../table.js";
import { BRASS, COL, NUM, TAPE, type Kit } from "../theme.js";
import { attach, ease, hitStop, reduced, setTimeScale, tween, wait } from "../tween.js";
import { darken } from "../widgets.js";

type SideId = 0 | 1;
const colOf = (side: SideId, rod: number) => (side === 0 ? RODS[rod].x : 9 - RODS[rod].x);
/** Where each side's rods rest between chances. */
const REST = [
  [4, 2, 0, 1],
  [5, 3, 1, 2],
];
const MID_LANE = (MOUTH[0] + MOUTH[1]) / 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** The lighter of a kit's two colours (cream if both are dark), so a club's name reads on the dark plate. */
export function nameInk(kit: [number, number]): number {
  const lum = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  const c = lum(kit[1]) >= lum(kit[0]) ? kit[1] : kit[0];
  return lum(c) < 90 ? COL.cream : c;
}
const kitOfSide = (s: Side): Kit => ({ main: s.kit[0], hi: s.kit[1], trim: darken(s.kit[0], 0.42) });
/** Hue in degrees (or -1 for a grey) and lightness 0..1 of a colour. */
function hueOf(c: number): [number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx - mn < 0.12) return [-1, l];
  const d = mx - mn;
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, l];
}
/** Two shirts that read alike from across the table: near hues (or two greys) at a similar lightness. */
function alike(a: number, b: number): boolean {
  const [ha, la] = hueOf(a);
  const [hb, lb] = hueOf(b);
  if (Math.abs(la - lb) > 0.38) return false;
  if (ha < 0 || hb < 0) return ha < 0 && hb < 0;
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d) < 40;
}
export function awayKit(home: Side, away: Side): [number, number] {
  const h = home.kit[0];
  if (!alike(h, away.kit[0])) return away.kit;
  if (!alike(h, away.kit[1])) return [away.kit[1], away.kit[0]];
  return alike(h, 0xf1dcc0) ? [0x2a2a30, 0xf1dcc0] : [0xf1dcc0, 0x2a2a30];
}

interface RodView {
  c: Container;
  /** The figures ride above the rails (so the end men on a five-man rod are not cut off by them); fc follows c. */
  fc: Container;
  bar: Graphics;
  figs: FigureView[];
}
/** Figures on the club table are a touch smaller than the season table's, so a five-man rod reads without crowding. */
const FIG_K = 0.88;

/** A tween or a pause the table is running now: skip() finishes them at once. */
interface Live {
  target: object;
  to: Keyed<string, number>;
}

export class ClubTable {
  root = new Container();
  bg = new Sprite(Texture.WHITE);
  swirl: FxFilter;
  crt: FxFilter;
  tbl = new Container();
  pitch = new Graphics();
  mark = new Container();
  rodMask = new Graphics();
  rodLayer = new Container();
  figLayer = new Container();
  rail = new Graphics();
  knobLayer = new Container();
  boardLayer = new Container();
  ballLayer = new Container();
  fxLayer = new Container();
  /** Screen space (CSS px): ticker tape, banners, floating words, sparks. */
  screen = new Container();
  ball = new Graphics();
  trailG = new Graphics();
  netG = new Graphics();
  crowdV = new Crowd();
  desk = new Desk();
  rods: RodView[][] = [[], []];
  /** Rod offsets as shown, per side. */
  off: number[][] = REST.map((r) => r.slice());
  home: Side | null = null;
  away: Side | null = null;
  /** The away side as it is dressed for this match (its change kit on a clash). */
  awayDress: Side | null = null;
  xi: [number[], number[]] = [[], []];
  rect = { x: 0, y: 0, w: 800, h: 600 };
  private portMode = false;
  /** Bumped whenever the sides are re-dressed: a chance played for an older dressing stops touching the table. */
  private gen = 0;
  private playGen = 0;
  private built = false;
  t = 0;
  shake = 0;
  heat = 0;
  ballFree = false;
  trail: { x: number; y: number; t: number }[] = [];
  kickTint = 0xfff6e6;
  tape: { s: Sprite; sy: number; vx: number; vy: number; twirl: number; flip: number; life: number }[] = [];
  particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];
  tblHome = { k: 1, x: 0, y: 0 };
  board: { score: [number, number]; min: number | null } = { score: [0, 0], min: null };
  /** Replaces the score on the plate while a drill runs. */
  boardNote: string | null = null;
  // play and skip
  private playing = false;
  private skipping = false;
  private live = new Set<Live>();
  private pauses = new Set<() => void>();
  /** While a drill runs, only this rod of yours shows (kept through a re-fit). */
  private only: number | null = null;
  // training
  private drill: {
    rod: number;
    y: number;
    v: number;
    stopped: boolean;
    onStop: (() => void) | null;
  } | null = null;

  constructor(
    public app: Application,
    opts: { attachTweens?: boolean } = {},
  ) {
    if (opts.attachTweens !== false) attach(app.ticker);
    this.swirl = swirlFilter();
    const [a, b, c] = look().swirl;
    setSwirlColors(this.swirl, a, b, c);
    this.crt = crtFilter();
    this.bg.filters = [this.swirl];
    app.stage.addChild(this.bg, this.root);
    this.root.addChild(this.tbl, this.screen);
    this.screen.eventMode = "none";
    this.rodLayer.mask = this.rodMask;
    this.tbl.addChild(this.crowdV, this.pitch, this.mark, this.rodMask, this.rodLayer, this.rail, this.knobLayer, this.figLayer, this.desk, this.boardLayer, this.ballLayer, this.fxLayer);
    for (const l of [this.fxLayer, this.boardLayer, this.ballLayer, this.figLayer]) l.eventMode = "none";
    this.ballLayer.addChild(this.trailG, this.ball);
    this.fxLayer.addChild(this.netG);
    app.stage.filters = [this.crt];
    this.crt.resolution = Math.min(2, window.devicePixelRatio || 1);
    app.stage.eventMode = "static";
    // a tap anywhere stops the drill ball, except on a button (Back)
    window.addEventListener("pointerdown", (e) => {
      if (this.drill && !(e.target instanceof Element && e.target.closest("button, a, input"))) this.drillTap();
    });
    window.addEventListener("keydown", (e) => {
      if (this.drill && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        this.drillTap();
      }
    });
    app.ticker.add((tk) => this.frame(tk.deltaMS));
    this.drawBall();
    this.fit({ x: 0, y: 0, w: app.screen.width, h: app.screen.height });
    setTimeout(() => void loadCrowd(), 1200);
  }

  /** The table as it stands now, for the result image. */
  snapshot(): HTMLCanvasElement | null {
    try {
      const r = this.rect;
      const res = this.app.renderer.resolution;
      const full = this.app.renderer.extract.canvas({ target: this.app.stage, frame: new Rectangle(0, 0, this.app.screen.width, this.app.screen.height) }) as HTMLCanvasElement;
      const c = document.createElement("canvas");
      c.width = Math.round(r.w * res);
      c.height = Math.round(r.h * res);
      const k = full.width / this.app.screen.width;
      c.getContext("2d")!.drawImage(full, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
      return c;
    } catch {
      return null;
    }
  }

  get port() {
    return this.portMode;
  }

  // ================================================================ layout
  fit(rect: { x: number; y: number; w: number; h: number }) {
    this.rect = { ...rect };
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.bg.width = sw;
    this.bg.height = sh;
    this.app.stage.filterArea = new Rectangle(0, 0, sw, sh);
    this.app.stage.hitArea = new Rectangle(0, 0, sw, sh);
    const port = rect.h > rect.w * 1.05;
    // a re-fit in the same orientation only moves and scales the table: rebuilding the rods mid-chance would pull
    // the figures out from under a running animation
    const turned = port !== this.portMode || !this.built;
    this.portMode = port;
    this.built = true;
    if (turned) {
      this.buildTable();
      this.buildRods();
      this.drawBoard();
    }
    const spanY = TS_H + STAND_T;
    const spanX = TS_W + (port ? DESK_P : 0);
    const tw = port ? spanY : spanX;
    const th = port ? spanX : spanY;
    const k = Math.min(rect.w / tw, rect.h / th);
    this.tbl.scale.set(k);
    if (port) {
      this.tbl.rotation = -Math.PI / 2;
      this.tbl.position.set(rect.x + (rect.w - tw * k) / 2 + STAND_T * k, rect.y + (rect.h - th * k) / 2 + th * k);
    } else {
      this.tbl.rotation = 0;
      this.tbl.position.set(rect.x + (rect.w - tw * k) / 2, rect.y + (rect.h - th * k) / 2 + STAND_T * k);
    }
    this.tblHome = { k, x: this.tbl.x, y: this.tbl.y };
  }

  private upright(o: Container) {
    o.rotation = this.port ? Math.PI / 2 : 0;
  }

  cover(on: boolean) {
    this.root.renderable = !on;
  }

  // ================================================================ dressing
  setSides(home: Side, away: Side | null, xiHome?: number[], xiAway?: number[]) {
    // a chance still running on the old sides finishes at once and leaves the new figures alone
    this.gen++;
    if (this.playing) this.skip();
    this.home = home;
    this.away = away;
    this.awayDress = away ? { ...away, kit: awayKit(home, away) } : null;
    this.xi = [(xiHome || home.xi).slice(), away ? (xiAway || away.xi).slice() : []];
    this.crowdV.setKit(home.kit[0], home.kit[1]);
    this.off = REST.map((r) => r.slice());
    this.buildTable();
    this.buildRods();
    this.drawBoard();
    this.ballFree = false;
    this.ball.visible = !!away;
    this.ball.position.set((TX0 + TX1) / 2, laneY(MID_LANE));
    this.trail = [];
  }

  /** Swaps who stands on the rods mid-match (a substitution), keeping the rods where they are. */
  setXi(side: SideId, xi: number[]) {
    this.xi[side] = xi.slice();
    this.buildRods();
  }

  /** The scoreboard plate under the table: both clubs, the score, the minute (null hides the minute). */
  setScore(score: [number, number], min: number | null) {
    this.board = { score: [score[0], score[1]], min };
    this.drawBoard();
    this.onScore?.(this.board.score);
  }
  /** Told whenever the plate's score changes (a goal goes up the moment the ball is in). */
  onScore: ((score: [number, number]) => void) | null = null;

  /** Listeners for the wire (a phone shows the line as text too). */
  sayers = new Set<(line: string, tone: Tone) => void>();
  lastSay: [string, Tone] = ["", "flat"];
  say(line: string, tone: Tone = "flat") {
    this.desk.say(line, tone);
    this.lastSay = [line, tone];
    for (const f of this.sayers) f(line, tone);
  }

  crowd(level: number, mood?: "idle" | "cheer" | "quiet") {
    this.crowdV.level(clamp(level, 0, 1) * 50);
    if (mood) this.crowdV.react(mood);
  }

  private buildTable() {
    const lk = look();
    const g = this.pitch;
    g.clear();
    const X0 = TX0 - 64;
    const XW = TX1 - TX0 + 128;
    g.roundRect(TX0 - 70, CAB_T - 6, TX1 - TX0 + 140, CAB_B - CAB_T + 12, 26).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(X0, CAB_T, XW, CAB_B - CAB_T, 22).fill(BRASS.wood);
    g.roundRect(X0 + 3, CAB_T + 3, XW - 6, 5, 3).fill({ color: 0xffffff, alpha: 0.06 });
    for (const side of [0, 1]) {
      const gx = side === 0 ? TX0 - 50 : TX1;
      g.rect(gx, laneY(MOUTH[0] - 0.5), 50, (MOUTH[1] - MOUTH[0] + 1) * LH).fill(0x08030a);
    }
    this.drawNets(0, 0);
    g.rect(TX0, LANE0, TX1 - TX0, PITCH_H).fill(lk.felt);
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      g.roundRect(TX0 + 20 + k * 120, LANE0 + 14 + k * 70, TX1 - TX0 - 40 - k * 240, PITCH_H - 28 - k * 140, 30).fill({ color: lk.feltHi, alpha: 0.05 });
    }
    for (let x = TX0 - PITCH_H; x < TX1; x += 9) {
      const a = Math.max(TX0, x);
      const b = Math.min(TX1, x + PITCH_H);
      if (b <= a) continue;
      g.moveTo(a, LANE0 + (a - x)).lineTo(b, LANE0 + (b - x));
    }
    g.stroke({ width: 1, color: 0x000000, alpha: 0.05 });
    for (let l = 1; l < LANES; l++) for (let x = TX0 + 6; x < TX1 - 6; x += 16) g.moveTo(x, LANE0 + l * LH).lineTo(x + 6, LANE0 + l * LH);
    g.stroke({ width: 1, color: COL.cream, alpha: 0.07 });
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
    for (const gx of [TX0, TX1]) {
      g.rect(gx - 4, laneY(MOUTH[0] - 0.5) - 6, 8, 8).fill(COL.cream);
      g.rect(gx - 4, laneY(MOUTH[1] + 0.5) - 2, 8, 8).fill(COL.cream);
    }
    this.drawMark();
    this.rodMask.clear().rect(X0, LANE0 - RAIL_T, XW, PITCH_H + RAIL_T + RAIL).fill(0xffffff);
    const r = this.rail;
    r.clear();
    r.rect(X0, LANE0 - RAIL_T, XW, RAIL_T).fill(BRASS.rail);
    r.rect(X0, LANE0 + PITCH_H, XW, RAIL).fill(BRASS.rail);
    r.rect(X0, LANE0 - 3, XW, 3).fill({ color: 0x000000, alpha: 0.35 });
    r.rect(X0, LANE0 + PITCH_H, XW, 3).fill({ color: 0x000000, alpha: 0.35 });
    for (let x = 1; x <= 8; x++) {
      r.roundRect(colX(x) - 9, LANE0 - 8, 18, 8, 3).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
      r.circle(colX(x), LANE0 + PITCH_H + RAIL / 2, 8).fill(BRASS.lo).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
    }
    // rod ends with grips: theirs over the far frame in their kit, yours under the near frame in yours
    this.knobLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const kg = new Graphics();
    const hk = this.home ? kitOfSide(this.home) : { main: lk.kit, hi: lk.kitHi, trim: lk.trim };
    const ak = this.awayDress ? kitOfSide(this.awayDress) : { main: 0x3a2034, hi: 0x5a3050, trim: COL.ink };
    for (let rod = 0; rod < 4; rod++) {
      const xa = colX(colOf(1, rod));
      kg.rect(xa - 4, CAB_T - 4, 8, 12).fill(BRASS.bar);
      kg.roundRect(xa - 14, CAB_T - 24, 28, 22, 8).fill(ak.main).stroke({ width: 2.5, color: COL.ink });
      kg.roundRect(xa - 10, CAB_T - 21, 20, 4, 2).fill({ color: ak.hi, alpha: 0.6 });
      const xh = colX(colOf(0, rod));
      kg.rect(xh - 4, CAB_B - 8, 8, 12).fill(BRASS.bar);
      kg.roundRect(xh - 14, CAB_B + 2, 28, 22, 8).fill(hk.main).stroke({ width: 2.5, color: COL.ink });
      kg.roundRect(xh - 10, CAB_B + 18, 20, 4, 2).fill({ color: hk.hi, alpha: 0.6 });
    }
    this.knobLayer.addChild(kg);
    this.crowdV.build(this.port, false);
    this.crowdV.setKit(hk.main, hk.hi);
    if (!this.crowdV.want) this.crowdV.level(18);
    // upright on a phone the rail is too thin to read: the screens show the wire as text there instead
    this.desk.visible = !this.port;
    if (this.port) {
      const len = CAB_B - CAB_T - 8;
      this.desk.layout(len, DESK_P - 8, 27, false);
      this.desk.rotation = Math.PI / 2;
      this.desk.position.set(TS_W + DESK_P - 2, CAB_T + 4);
    } else {
      this.desk.layout(XW - 40, RAIL_T - 10, 21, false);
      this.desk.rotation = 0;
      this.desk.position.set(X0 + 20, LANE0 - RAIL_T + 1);
    }
  }

  private drawNets(side: number, amp: number) {
    const g = this.netG;
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
    g.stroke({ width: 1, color: COL.cream, alpha: 0.2 });
  }

  private drawMark() {
    const m = this.mark;
    m.removeChildren().forEach((c) => c.destroy());
    const tone = COL.cream;
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

  private buildRods() {
    this.rodLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.figLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.rods = [[], []];
    const at = Date.now() / 1000;
    for (const side of [0, 1] as SideId[]) {
      const club = side === 0 ? this.home : this.awayDress;
      const kit = club ? kitOfSide(club) : null;
      for (let r = 0; r < 4; r++) {
        const d = RODS[r];
        const c = new Container();
        c.position.set(colX(colOf(side, r)), LANE0 + this.off[side][r] * LH);
        c.zIndex = colOf(side, r);
        const bar = new Graphics();
        const span = (d.max + 2) * LH + PITCH_H + 200;
        bar.rect(-5, -span, 10, span * 2).fill(BRASS.bar);
        bar.rect(-5, -span, 3, span * 2).fill({ color: BRASS.hi, alpha: 0.7 });
        bar.rect(2, -span, 3, span * 2).fill({ color: BRASS.lo, alpha: 0.7 });
        c.addChild(bar);
        const figs: FigureView[] = [];
        const fc = new Container();
        fc.position.copyFrom(c.position);
        fc.zIndex = c.zIndex;
        if (!club && side === 1 && this.home) {
          // no rival yet (the club office): their rods hold blank, dimmed men, so the far half reads as waiting
          for (let f = 0; f < d.n; f++) {
            const fv = new FigureView(1, null, f, "them", { main: 0x3a2034, hi: 0x6a4060, trim: COL.ink });
            fv.position.set(0, (f * d.gap + 0.5) * LH);
            fv.scale.set(FIG_K);
            fv.alpha = 0.32;
            fv.eventMode = "none";
            fc.addChild(fv);
          }
        }
        if (club) {
          for (let f = 0; f < d.n; f++) {
            const slot = ROD_SLOTS[r][f];
            const l: Launch | null = club.squad[this.xi[side][slot]] || null;
            const fv = new FigureView(side, l, f, "them", kit);
            fv.position.set(0, (f * d.gap + 0.5) * LH);
            fv.scale.set(FIG_K);
            fv.eventMode = "none";
            if (l) fv.setTrait(traitsOf(l, at).filter((t) => t !== "ghost"), false);
            if (fv.tag) {
              this.upright(fv.tag);
              if (this.port) fv.tag.visible = false;
            }
            fc.addChild(fv);
            figs.push(fv);
          }
        }
        if (this.only !== null) c.visible = fc.visible = side === 0 && r === this.only;
        this.rodLayer.addChild(c);
        this.figLayer.addChild(fc);
        this.rods[side].push({ c, fc, bar, figs });
      }
    }
    this.rodLayer.sortableChildren = true;
    this.figLayer.sortableChildren = true;
  }

  /** The brass plate under the table, between the near stands: crests, names, score, minute. */
  private drawBoard() {
    const L = this.boardLayer;
    L.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.home) return;
    const x0 = 118;
    const x1 = 700;
    const y0 = CAB_B + 34;
    const y1 = TS_H - 8;
    const w = x1 - x0;
    const h = y1 - y0;
    const g = new Graphics();
    g.roundRect(x0, y0, w, h, 12).fill(BRASS.lo).stroke({ width: 3, color: BRASS.hi, alpha: 0.7 });
    g.roundRect(x0 + 6, y0 + 6, w - 12, h - 12, 8).fill(0x0b0309);
    for (let y = y0 + 10; y < y1 - 8; y += 4) g.rect(x0 + 8, y, w - 16, 1).fill({ color: 0xffffff, alpha: 0.025 });
    L.addChild(g);
    // the contents sit in a box that stays upright on screen
    const box = new Container();
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    box.position.set(cx, cy);
    this.upright(box);
    L.addChild(box);
    // upright on a phone the plate is h wide and w tall on screen
    const bw = this.port ? h : w;
    if (!this.away && !this.boardNote) {
      this.drawIdleBoard(box, w, h);
      return;
    }
    const centre = this.boardNote || (this.away ? `${this.board.score[0]} : ${this.board.score[1]}` : "KICKER");
    const small = centre.length > 7;
    const name = (s: Side | null, right: boolean) => {
      const label = s ? s.name : "Awaiting a rival";
      const t = txt(label.toUpperCase(), { fontFamily: NUM, fontSize: this.port ? 22 : 30, fill: s ? nameInk(s.kit) : COL.dim, letterSpacing: 1 });
      t.anchor.set(right ? 1 : 0, 0.5);
      return t;
    };
    if (this.port) {
      // a standing plate: home under the score (your end of a phone's table), away above it
      const a = name(this.home, false);
      const b = name(this.awayDress, false);
      b.visible = !!this.away;
      a.anchor.set(0.5);
      b.anchor.set(0.5);
      a.position.set(0, w / 2 - 40);
      b.position.set(0, -w / 2 + 40);
      const sc = txt(centre, { fontFamily: NUM, fontSize: small ? 30 : 64, fill: COL.money, letterSpacing: small ? 2 : 0 });
      sc.anchor.set(0.5);
      const mn = txt(this.board.min === null ? "" : `${this.board.min}'`, { fontFamily: NUM, fontSize: 24, fill: COL.cream });
      mn.anchor.set(0.5);
      mn.position.set(0, 46);
      for (const t of [a, b]) if (t.width > bw - 16) t.scale.set((bw - 16) / t.width);
      box.addChild(a, b, sc, mn);
      return;
    }
    const ch = kitShield(this.home.kit, this.home.name, 26);
    ch.position.set(-w / 2 + 44, 0);
    box.addChild(ch);
    if (this.away) {
      const ca = kitShield(this.awayDress?.kit || this.away.kit, this.away.name, 26);
      ca.position.set(w / 2 - 44, 0);
      box.addChild(ca);
    }
    const a = name(this.home, false);
    a.position.set(-w / 2 + 80, -14);
    const b = name(this.awayDress, true);
    b.position.set(w / 2 - 80, -14);
    b.visible = !!this.away;
    const room = w / 2 - 80 - 74;
    for (const t of [a, b]) if (t.width > room) t.scale.set(room / t.width);
    const sc = txt(centre, { fontFamily: NUM, fontSize: small ? 40 : 70, fill: COL.money, letterSpacing: small ? 3 : 0 });
    sc.anchor.set(0.5);
    sc.y = -4;
    const mn = txt(this.board.min === null ? "" : `${this.board.min}'`, { fontFamily: NUM, fontSize: 24, fill: COL.cream });
    mn.anchor.set(0.5);
    mn.position.set(0, 34);
    const ha = txt(this.home.tactic.toUpperCase(), { fontFamily: NUM, fontSize: 18, fill: COL.dim, letterSpacing: 2 });
    ha.anchor.set(0, 0.5);
    ha.position.set(-w / 2 + 80, 18);
    box.addChild(a, b, sc, mn, ha);
    if (this.away) {
      const hb = txt(this.away.tactic.toUpperCase(), { fontFamily: NUM, fontSize: 18, fill: COL.dim, letterSpacing: 2 });
      hb.anchor.set(1, 0.5);
      hb.position.set(w / 2 - 80, 18);
      box.addChild(hb);
    }
  }

  /** The plate with no rival on the table (the club office): your crest and name, the tactic and captain, and who is next. */
  private drawIdleBoard(box: Container, w: number, h: number) {
    const home = this.home!;
    const info = this.idle;
    const cap = home.squad[home.captain];
    const sub = `${home.tactic.toUpperCase()}${cap ? ` · CAPTAIN $${cap.s.slice(0, 8)}` : ""}`;
    if (this.port) {
      // upright: the plate is h wide and w tall on screen
      const bw = h - 20;
      const nm = txt(home.name.toUpperCase(), { fontFamily: NUM, fontSize: 30, fill: nameInk(home.kit), letterSpacing: 1 });
      nm.anchor.set(0.5);
      nm.position.set(0, 40);
      const sb = txt(sub, { fontFamily: NUM, fontSize: 16, fill: COL.dim, letterSpacing: 1 });
      sb.anchor.set(0.5);
      sb.position.set(0, 72);
      const ch = kitShield(home.kit, home.name, 30);
      ch.position.set(0, -10);
      box.addChild(ch, nm, sb);
      if (info.next) {
        const nl = txt("NEXT UP", { fontFamily: NUM, fontSize: 16, fill: COL.dim, letterSpacing: 2 });
        nl.anchor.set(0.5);
        nl.position.set(0, -w / 2 + 40);
        const nn = txt(info.next.toUpperCase(), { fontFamily: NUM, fontSize: 24, fill: info.nextKit ? nameInk(info.nextKit) : COL.cream, letterSpacing: 1 });
        nn.anchor.set(0.5);
        nn.position.set(0, -w / 2 + 64);
        box.addChild(nl, nn);
        if (nn.width > bw) nn.scale.set(bw / nn.width);
      }
      for (const t of [nm, sb]) if (t.width > bw) t.scale.set(bw / t.width);
      return;
    }
    const ch = kitShield(home.kit, home.name, 30);
    ch.position.set(-w / 2 + 48, 0);
    box.addChild(ch);
    const left = -w / 2 + 88;
    const half = info.next ? w * 0.52 - 88 : w - 120;
    const nm = txt(home.name.toUpperCase(), { fontFamily: NUM, fontSize: 40, fill: nameInk(home.kit), letterSpacing: 1 });
    nm.anchor.set(0, 0.5);
    nm.position.set(left, -12);
    const sb = txt(sub, { fontFamily: NUM, fontSize: 18, fill: COL.dim, letterSpacing: 2 });
    sb.anchor.set(0, 0.5);
    sb.position.set(left, 22);
    for (const t of [nm, sb]) if (t.width > half) t.scale.set(half / t.width);
    box.addChild(nm, sb);
    if (info.next) {
      const right = w / 2 - 24;
      const room = w * 0.42 - 40;
      const nl = txt(info.nextLabel || "NEXT UP", { fontFamily: NUM, fontSize: 18, fill: COL.dim, letterSpacing: 2 });
      nl.anchor.set(1, 0.5);
      nl.position.set(right, -16);
      const nn = txt(info.next.toUpperCase(), { fontFamily: NUM, fontSize: 28, fill: info.nextKit ? nameInk(info.nextKit) : COL.cream, letterSpacing: 1 });
      nn.anchor.set(1, 0.5);
      nn.position.set(right, 14);
      if (nn.width > room) nn.scale.set(room / nn.width);
      const div = new Graphics().rect(w * 0.06, -24, 2, 48).fill({ color: BRASS.hi, alpha: 0.35 });
      box.addChild(div, nl, nn);
    }
  }

  /** What the idle plate says about the next fixture. */
  idle: { next: string | null; nextKit?: [number, number]; nextLabel?: string } = { next: null };
  setIdle(info: { next: string | null; nextKit?: [number, number]; nextLabel?: string }) {
    this.idle = info;
    this.drawBoard();
  }

  private drawBall() {
    const g = this.ball;
    g.clear();
    g.ellipse(5, 7, 15, 12).fill({ color: 0x000000, alpha: 0.32 });
    g.circle(0, 0, 18).fill({ color: 0xfff6e6, alpha: 0.1 });
    g.circle(0, 0, 14).fill(0xfff6e6).stroke({ width: 2.5, color: COL.ink });
    g.circle(2, 3, 9).fill({ color: 0xe8d6bc, alpha: 0.6 });
    g.poly([0, -6, 5.5, -2, 3.5, 5, -3.5, 5, -5.5, -2]).fill({ color: COL.ink, alpha: 0.75 });
    g.circle(-5, -5, 3.6).fill({ color: 0xffffff, alpha: 0.95 });
  }

  // ================================================================ frame loop
  private frame(dt: number) {
    const rm = reduced();
    this.t += dt / 1000;
    const sec = dt / 1000;
    this.heat = Math.max(0, this.heat - dt / 2500);
    this.swirl.u.uTime = rm ? 4 : this.t;
    this.swirl.u.uHeat = rm ? 0 : this.heat;
    this.crt.u.uTime = rm ? 0 : this.t;
    this.shake = Math.max(0, this.shake - dt / 300);
    if (this.bg.width !== this.app.screen.width || this.bg.height !== this.app.screen.height) {
      this.bg.width = this.app.screen.width;
      this.bg.height = this.app.screen.height;
      this.app.stage.filterArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    }
    if (this.shake > 0 && !rm) {
      this.root.position.set((Math.random() - 0.5) * this.shake * 12, (Math.random() - 0.5) * this.shake * 12);
      this.crt.u.uShake = this.shake;
    } else {
      this.root.position.set(0, 0);
      this.crt.u.uShake = 0;
    }
    if (this.root.renderable) {
      this.crowdV.frame(this.t, sec);
      this.desk.frame(sec);
      for (const side of this.rods) for (const rv of side) if (!rv.c.destroyed) rv.fc.position.copyFrom(rv.c.position);
      if (!rm) for (const side of this.rods) for (const rv of side) for (const f of rv.figs) f.idle(this.t, sec);
      if (this.ballFree && this.ball.visible) this.trail.push({ x: this.ball.x, y: this.ball.y, t: this.t });
      this.drawTrail();
      this.frameDrill(sec);
    }
    this.frameTape(sec);
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

  private drawTrail() {
    const g = this.trailG;
    const now = this.t;
    const tr = this.trail;
    while (tr.length && now - tr[0].t > 0.3) tr.shift();
    g.clear();
    if (tr.length < 2 || reduced()) return;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1];
      const b = tr[i];
      const k = 1 - (now - b.t) / 0.3;
      if (k <= 0) continue;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 4 + 18 * k, color: 0xfff6e6, alpha: 0.38 * k, cap: "round" });
    }
    const last = tr[tr.length - 1];
    g.circle(last.x, last.y, 12).fill({ color: this.kickTint, alpha: 0.25 });
  }

  // ================================================================ skippable animation
  private tw(target: object, to: Keyed<string, number>, dur: number, e = ease.outCubic): Promise<void> {
    if (this.playing && this.playGen !== this.gen) return Promise.resolve();
    if (this.skipping) {
      try {
        Object.assign(target, to);
      } catch {
        /* its view has gone */
      }
      return Promise.resolve();
    }
    const rec: Live = { target, to };
    let run: Promise<void>;
    try {
      run = tween(target, to, dur, e);
    } catch {
      // the view went away under a chained tween (a kick's follow-through after the rods were re-dressed)
      return Promise.resolve();
    }
    this.live.add(rec);
    return run.finally(() => this.live.delete(rec));
  }
  private pause(ms: number): Promise<void> {
    if (this.skipping) return Promise.resolve();
    return new Promise((res) => {
      const done = () => {
        this.pauses.delete(done);
        res();
      };
      this.pauses.add(done);
      void wait(ms).then(done);
    });
  }

  /** Cuts the chance being played short: everything lands where it would have ended. */
  skip() {
    if (!this.playing || this.skipping) return;
    this.skipping = true;
    setTimeScale(1);
    for (const rec of [...this.live]) {
      // a 1 ms tween to the same end cancels the running one (its promise resolves) and lands the value;
      // a target whose view has gone (the rods were rebuilt) is left alone
      try {
        void tween(rec.target, rec.to, 1);
        Object.assign(rec.target, rec.to);
      } catch {
        /* destroyed */
      }
    }
    this.live.clear();
    for (const p of [...this.pauses]) p();
  }

  // ================================================================ positions
  private rodY(side: SideId, rod: number) {
    return LANE0 + this.off[side][rod] * LH;
  }
  private figPos(side: SideId, slot: number): { x: number; y: number; rod: number; fig: number } {
    const rod = slotRod(slot);
    const fig = ROD_SLOTS[rod].indexOf(slot);
    return { x: colX(colOf(side, rod)), y: laneY(this.off[side][rod] + fig * RODS[rod].gap), rod, fig };
  }
  private figView(side: SideId, slot: number): FigureView | null {
    const rod = slotRod(slot);
    return this.rods[side][rod]?.figs[ROD_SLOTS[rod].indexOf(slot)] || null;
  }
  /** Slides a rod so figure `fig` stands on (or as near as it can to) `lane`. */
  private slideTo(side: SideId, rod: number, fig: number, lane: number, ms = 220): Promise<void> {
    const d = RODS[rod];
    const off = clamp(Math.round(lane - fig * d.gap), d.min, d.max);
    if (off === this.off[side][rod]) return Promise.resolve();
    this.off[side][rod] = off;
    const rv = this.rods[side][rod];
    if (!rv) return Promise.resolve();
    if (!this.skipping) sfx.slide(side === 0);
    return this.tw(rv.c.position, { y: this.rodY(side, rod) }, ms, ease.outCubic);
  }
  /** Where the ball sits at a figure's feet, towards the goal it attacks. */
  private atFeet(side: SideId, slot: number) {
    const p = this.figPos(side, slot);
    return { x: p.x + (side === 0 ? 30 : -30), y: p.y };
  }
  private toScreen(p: { x: number; y: number }) {
    return this.root.toLocal(this.tbl.toGlobal(p));
  }

  // ================================================================ one chance
  async play(m: Moment, home: Side, away: Side): Promise<void> {
    if (this.home !== home || this.away !== away) this.setSides(home, away);
    if (this.playing) this.skip();
    this.playing = true;
    this.skipping = false;
    this.playGen = this.gen;
    try {
      await this.playChance(m);
    } finally {
      setTimeScale(1);
      const wasSkip = this.skipping;
      this.playing = false;
      this.skipping = false;
      this.live.clear();
      this.pauses.clear();
      if (this.playGen === this.gen) {
        if (wasSkip) this.settle(m);
        this.setScore(m.score, m.min);
      }
    }
  }

  /** After a skip, puts everything exactly where the chance ended, once any cancelled tween has had its last tick. */
  private settle(m: Moment) {
    const apply = () => {
      for (const side of [0, 1] as SideId[]) for (let r = 0; r < 4; r++) {
        const rv = this.rods[side][r];
        if (rv && !rv.c.destroyed) rv.c.y = this.rodY(side, r);
        if (rv?.c.destroyed) continue;
        for (const f of rv?.figs || []) {
          if (f.destroyed) continue;
          f.scale.set(FIG_K);
          f.rotation = 0;
          f.foot.x = 0;
          f.body.scale.x = 1;
        }
      }
      this.ball.position.set(this.ballRest.x, this.ballRest.y);
      this.ball.alpha = 1;
      this.ball.visible = true;
      this.ballFree = false;
      this.trail = [];
      this.drawNets(0, 0);
      this.tbl.scale.set(this.tblHome.k);
      this.tbl.position.set(this.tblHome.x, this.tblHome.y);
      void m;
    };
    apply();
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }
  private ballRest = { x: (TX0 + TX1) / 2, y: laneY(MID_LANE) };

  private async playChance(m: Moment) {
    const r: Rand = mulberry32(hash32(`${m.i}|${m.min}|${m.side}|${m.shooter}`));
    const A = m.side as SideId;
    const D: SideId = A === 0 ? 1 : 0;
    const dir = A === 0 ? 1 : -1;
    for (const sd of this.rods) for (const rv of sd) for (const f of rv.figs) f.setGlow(null);
    // the ball comes to the first man of the move
    const first = m.chain[0];
    const firstRod = slotRod(first);
    await this.slideTo(A, firstRod, ROD_SLOTS[firstRod].indexOf(first), 1 + Math.floor(r() * 8), 180);
    const p0 = this.atFeet(A, first);
    this.ball.visible = true;
    this.ballFree = true;
    this.kickTint = 0xfff6e6;
    await this.tw(this.ball.position, { x: p0.x, y: p0.y }, 300, ease.inOut);
    this.ballFree = false;
    const fv0 = this.figView(A, first);
    if (fv0) {
      fv0.setGlow(A === 0 ? kitOfSide(this.home!).hi : kitOfSide(this.awayDress!).hi);
      if (!this.skipping) {
        fv0.scale.set(1.15 * FIG_K);
        void this.tw(fv0.scale, { x: FIG_K, y: FIG_K }, 220, ease.outBack);
      }
    }
    await this.pause(160);
    // the build-up: pass to pass along the chain
    for (let k = 1; k < m.chain.length; k++) {
      const from = m.chain[k - 1];
      const to = m.chain[k];
      const rod = slotRod(to);
      const fig = ROD_SLOTS[rod].indexOf(to);
      const ballLane = (this.ball.y - LANE0) / LH - 0.5;
      const lane = clamp(Math.round(ballLane + (r() * 5 - 2.5)), 0, LANES - 1);
      // the receiver's rod comes to meet it; a rod of theirs in between leans the wrong way
      const lean = this.leanDefender(D, A, rod, r);
      await Promise.all([this.slideTo(A, rod, fig, lane, 200), lean]);
      await this.kick(A, from, false);
      const p = this.atFeet(A, to);
      this.ballFree = true;
      const dist = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
      await this.tw(this.ball.position, { x: p.x, y: p.y }, Math.min(520, 160 + dist * 0.75), (t) => 1 - Math.pow(1 - t, 2.2));
      this.ballFree = false;
      if (!this.skipping) sfx.trap();
      const rv = this.figView(A, to);
      this.figView(A, from)?.setGlow(null);
      if (rv) {
        rv.setGlow(A === 0 ? kitOfSide(this.home!).hi : kitOfSide(this.awayDress!).hi);
        if (!this.skipping) {
          rv.scale.set(1.18 * FIG_K);
          void this.tw(rv.scale, { x: FIG_K, y: FIG_K }, 220, ease.outBack);
        }
      }
      await this.pause(140);
    }
    // the shot
    const shooter = this.figView(A, m.shooter);
    shooter?.setGlow(null);
    const goalX = A === 0 ? TX1 : TX0;
    let end: { x: number; y: number };
    let meet: FigureView | null = null;
    if (m.out === "goal") {
      const lane = MOUTH[0] + (r() < 0.5 ? 0 : 1) + (r() - 0.5) * 0.6;
      // their keeper goes the wrong way
      const wrong = lane < MID_LANE ? MOUTH[1] + 1 : MOUTH[0] - 1;
      await this.slideTo(D, 0, 0, wrong, 160);
      end = { x: goalX + dir * 30, y: laneY(lane) };
    } else if (m.out === "save") {
      const lane = MOUTH[0] - 0.5 + r() * 2;
      await this.slideTo(D, 0, 0, Math.round(lane), 160);
      const kp = this.figPos(D, 0);
      end = { x: kp.x - dir * 20, y: kp.y };
      meet = this.figView(D, 0);
    } else if (m.out === "block") {
      const slot = m.blocker >= 1 && m.blocker <= 2 ? m.blocker : 1;
      const fig = ROD_SLOTS[1].indexOf(slot);
      const ballLane = (this.ball.y - LANE0) / LH - 0.5;
      const lane = clamp(Math.round((ballLane + MID_LANE) / 2), 0, LANES - 1);
      await this.slideTo(D, 1, fig, lane, 160);
      const bp = this.figPos(D, slot);
      end = { x: bp.x - dir * 20, y: bp.y };
      meet = this.figView(D, slot);
    } else {
      const high = r() < 0.5;
      const lane = high ? MOUTH[0] - 1.2 - r() * 0.8 : MOUTH[1] + 1.2 + r() * 0.8;
      await this.slideTo(D, 0, 0, high ? MOUTH[1] : MOUTH[0], 160);
      end = { x: goalX + dir * 44, y: laneY(lane) };
    }
    await this.kick(A, m.shooter, true);
    this.ballFree = true;
    this.kickTint = A === 0 ? COL.money : COL.bad;
    const dist = Math.hypot(end.x - this.ball.x, end.y - this.ball.y);
    const dur = Math.min(640, 200 + dist * 0.55);
    const homeGoal = m.out === "goal" && A === 0 && !reduced();
    if (homeGoal && !this.skipping) {
      // the last stretch in slow motion while the camera leans in
      const fly = this.tw(this.ball.position, { x: end.x, y: end.y }, dur, (t) => 1 - Math.pow(1 - t, 2.2));
      await this.pause(dur * 0.45);
      if (!this.skipping) {
        setTimeScale(0.35);
        void this.push(1.07, { x: goalX, y: laneY(MID_LANE) }, 240);
        this.crowdV.energy = 0.8;
      }
      await fly;
      setTimeScale(1);
    } else await this.tw(this.ball.position, { x: end.x, y: end.y }, dur, (t) => 1 - Math.pow(1 - t, 2.2));
    this.ballFree = false;
    if (m.out === "goal") {
      this.ballRest = { x: (TX0 + TX1) / 2, y: laneY(MID_LANE) };
      await this.goal(m, A);
    } else {
      await this.stopped(m, A, meet, end);
    }
    this.trail = [];
  }

  /** A rod of the defending side between the ball and the receiver leans one lane, for life on the table. */
  private leanDefender(D: SideId, A: SideId, rodTo: number, r: Rand): Promise<void> {
    const toCol = colOf(A, rodTo);
    const ballCol = (this.ball.x - TX0) / ((TX1 - TX0) / 9);
    const cands = [0, 1, 2, 3].filter((rod) => {
      const c = colOf(D, rod);
      return c > Math.min(toCol, ballCol) && c < Math.max(toCol, ballCol);
    });
    if (!cands.length) return Promise.resolve();
    const rod = cands[Math.floor(r() * cands.length)];
    const d = RODS[rod];
    const off = clamp(this.off[D][rod] + (r() < 0.5 ? -1 : 1), d.min, d.max);
    return this.slideTo(D, rod, 0, off, 200);
  }

  private async kick(side: SideId, slot: number, shot: boolean) {
    const fv = this.figView(side, slot);
    if (this.skipping) return;
    if (fv) fv.swing((o, to, ms, e) => this.tw(o, to, ms, e), ease.outBack);
    sfx.kick(shot);
    if (shot) hitStop(side === 0 ? 70 : 50);
    await this.pause(70);
  }

  private async stopped(m: Moment, A: SideId, meet: FigureView | null, end: { x: number; y: number }) {
    const label = m.out === "save" ? "Saved" : m.out === "block" ? "Blocked" : "Wide";
    const homeShot = A === 0;
    if (m.out === "wide") {
      void this.tw(this.ball, { alpha: 0 }, 260);
      if (!this.skipping) {
        sfx.whoosh();
        this.floatText(label, this.toScreen(end), COL.dim, 32);
      }
      await this.pause(380);
      this.ball.alpha = 1;
      this.ballRest = this.atKeeper(A === 0 ? 1 : 0);
      this.ball.position.set(this.ballRest.x, this.ballRest.y);
    } else {
      this.ballRest = { x: end.x, y: end.y };
      if (!this.skipping) {
        hitStop(70);
        sfx.block();
        if (m.out === "save") sfx.glove();
        this.shake = Math.min(1, this.shake + 0.3);
        if (meet) {
          meet.scale.set(1.3 * FIG_K);
          void this.tw(meet.scale, { x: FIG_K, y: FIG_K }, 280, ease.outBack);
        }
        const fl = new Graphics().circle(0, 0, 24).fill({ color: 0xffffff, alpha: 0.7 });
        fl.position.set(end.x, end.y);
        this.fxLayer.addChild(fl);
        void tween(fl.scale, { x: 2, y: 2 }, 220);
        void tween(fl, { alpha: 0 }, 220).then(() => fl.destroy());
        this.floatText(label, this.toScreen(end), homeShot ? COL.bad : COL.good, 32);
        if (!homeShot) this.burst(this.toScreen(end), COL.good, 10);
      }
      await this.pause(420);
    }
    if (!this.skipping) {
      if (homeShot) {
        this.crowdV.react("cover");
        sfx.groan();
      } else this.crowdV.energy = Math.min(1, this.crowdV.energy + 0.5);
    }
  }
  private atKeeper(side: SideId) {
    return this.atFeet(side, 0);
  }

  private async goal(m: Moment, A: SideId) {
    const rm = reduced();
    const net = new Graphics()
      .rect(A === 0 ? TX1 : TX0 - 50, laneY(MOUTH[0] - 0.5), 50, (MOUTH[1] - MOUTH[0] + 1) * LH)
      .fill({ color: A === 0 ? COL.money : COL.bad, alpha: 0.45 });
    this.fxLayer.addChild(net);
    void tween(net, { alpha: 0 }, 900).then(() => net.destroy());
    this.setScore(m.score, m.min);
    if (this.skipping) {
      this.crowdV.react(A === 0 ? "cheer" : "quiet");
      return;
    }
    hitStop(80);
    sfx.netThud();
    const netSide = A === 0 ? 1 : 0;
    if (!rm) {
      const rip = { a: 18 };
      void tween(rip, { a: 0 }, 700, (t) => t);
      const step = () => {
        this.drawNets(netSide, rip.a * Math.cos((1 - rip.a / 18) * 9));
        if (rip.a > 0.01) requestAnimationFrame(step);
        else this.drawNets(0, 0);
      };
      step();
    }
    const R = this.rect;
    const cx = R.x + R.w / 2;
    const cy = R.y + R.h / 2 - (this.port ? 90 : 60);
    const big = Math.min(1, R.w / 900);
    const club = A === 0 ? this.home! : this.away!;
    const scorerLaunch = club.squad[m.who];
    if (A === 0) {
      sfx.goal();
      sfx.roar();
      this.heat = 1;
      this.shake = 1;
      this.crowdV.react("cheer");
      const sc = this.figView(0, m.shooter);
      if (sc && !sc.destroyed) void sc.celebrate();
      let k = 0;
      for (const rv of this.rods[0]) for (const f of rv.figs) if (f !== sc) void f.bump(60 + k++ * 35);
      this.tickerTape([TAPE[scorerLaunch ? scorerLaunch.u : 3], club.kit[1], club.kit[0], COL.money, COL.cream]);
      const banner = txt("GOAL", { fontFamily: NUM, fontSize: Math.round(140 * Math.max(0.6, big)), fill: COL.money, stroke: { color: COL.ink, width: 12 } });
      banner.anchor.set(0.5);
      banner.position.set(cx, cy);
      banner.scale.set(0.2);
      this.screen.addChild(banner);
      const sub = txt(scorerLaunch ? `$${scorerLaunch.s} · ${m.min}'` : `${m.min}'`, { fontFamily: NUM, fontSize: Math.round(44 * Math.max(0.7, big)), fill: COL.cream, stroke: { color: COL.pink, width: 8 } });
      sub.anchor.set(0.5);
      sub.position.set(cx, cy + 86 * Math.max(0.6, big));
      sub.alpha = 0;
      this.screen.addChild(sub);
      const score = this.bigScore(m.score, 0, cx, cy + 190 * Math.max(0.6, big), big);
      this.burst({ x: cx - 200 * big, y: cy }, COL.money, 22);
      this.burst({ x: cx + 200 * big, y: cy }, club.kit[1], 22);
      await this.tw(banner.scale, { x: 1, y: 1 }, 360, ease.outElastic);
      void this.tw(sub, { alpha: 1 }, 200);
      await this.pause(1000);
      void this.push(1, { x: TX1, y: laneY(MID_LANE) }, 420);
      await Promise.all([this.tw(banner, { alpha: 0 }, 260), this.tw(sub, { alpha: 0 }, 260), this.tw(score, { alpha: 0 }, 300)]);
      banner.destroy();
      sub.destroy();
      score.destroy({ children: true });
    } else {
      sfx.concede();
      sfx.groan();
      this.shake = 0.6;
      this.crowdV.react("quiet");
      // their figures have their own small party
      const sc = this.figView(1, m.shooter);
      if (sc && !sc.destroyed) void sc.celebrate();
      this.floatText(`${club.name} score`, this.toScreen({ x: TX0 + 120, y: LANE0 + PITCH_H / 2 }), COL.bad, 36);
      const score = this.bigScore(m.score, 1, cx, cy + 60, big);
      await this.pause(1000);
      await this.tw(score, { alpha: 0 }, 260);
      score.destroy({ children: true });
    }
  }

  /** Pushes the camera in by `z` towards a table point, or back home with z = 1. */
  private push(z: number, at: { x: number; y: number }, ms: number): Promise<void> {
    const h = this.tblHome;
    if (reduced() || this.skipping) return Promise.resolve();
    const cos = Math.cos(this.tbl.rotation);
    const sin = Math.sin(this.tbl.rotation);
    const sx = h.x + h.k * (at.x * cos - at.y * sin);
    const sy = h.y + h.k * (at.x * sin + at.y * cos);
    const k = h.k * z;
    const x = sx - k * (at.x * cos - at.y * sin);
    const y = sy - k * (at.x * sin + at.y * cos);
    void tween(this.tbl.scale, { x: k, y: k }, ms, ease.outCubic);
    return tween(this.tbl.position, { x: z === 1 ? h.x : x, y: z === 1 ? h.y : y }, ms, ease.outCubic);
  }

  private bigScore(score: [number, number], popSide: SideId, x: number, y: number, big: number): Container {
    const c = new Container();
    const size = Math.round((this.port ? 130 : 160) * Math.max(0.6, big));
    const hk = this.home ? this.home.kit[1] : COL.cream;
    const ak = this.awayDress ? this.awayDress.kit[1] : COL.cream;
    const a = txt(String(score[0]), { fontFamily: NUM, fontSize: size, fill: hk, stroke: { color: COL.ink, width: 12 } });
    const colon = txt(":", { fontFamily: NUM, fontSize: size * 0.8, fill: COL.cream, stroke: { color: COL.ink, width: 10 } });
    const b = txt(String(score[1]), { fontFamily: NUM, fontSize: size, fill: ak, stroke: { color: COL.ink, width: 12 } });
    for (const t of [a, colon, b]) t.anchor.set(0.5);
    a.x = -size * 0.55;
    b.x = size * 0.55;
    colon.y = -size * 0.06;
    c.addChild(a, colon, b);
    c.position.set(x, y);
    this.screen.addChild(c);
    const pop = popSide === 0 ? a : b;
    if (!reduced()) {
      pop.scale.set(0.2);
      void tween(pop.scale, { x: 1.25, y: 1.25 }, 260, ease.outBack).then(() => tween(pop.scale, { x: 1, y: 1 }, 220));
    }
    return c;
  }

  private tickerTape(colors: number[]) {
    if (reduced()) return;
    const a = this.rect;
    for (let i = 0; i < 90 && this.tape.length < 200; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.width = 5 + Math.random() * 4;
      s.height = 13 + Math.random() * 10;
      s.tint = colors[i % colors.length];
      s.position.set(a.x + Math.random() * a.w, a.y - 20 - Math.random() * a.h * 0.5);
      s.rotation = Math.random() * 6.28;
      this.screen.addChild(s);
      this.tape.push({ s, sy: s.scale.y, vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 160, twirl: (Math.random() - 0.5) * 6, flip: Math.random() * 6.28, life: 2 + Math.random() });
    }
  }

  private frameTape(sec: number) {
    if (!this.tape.length) return;
    const H = this.app.screen.height;
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

  private floatText(text: string, at: { x: number; y: number }, color: number, size = 30) {
    const k = Math.max(0.7, Math.min(1.2, this.rect.w / 1000));
    const t = txt(text, { fontFamily: NUM, fontSize: Math.round(size * k), fill: color, stroke: { color: COL.ink, width: 6 } });
    t.anchor.set(0.5);
    t.position.set(at.x, at.y - 40 * k);
    t.scale.set(0.4);
    this.screen.addChild(t);
    void (async () => {
      await tween(t.scale, { x: 1, y: 1 }, 160, ease.outBack);
      await wait(320);
      await tween(t, { y: t.y - 30, alpha: 0 }, 380, ease.inCubic);
      t.destroy();
    })();
  }

  private burst(at: { x: number; y: number }, color: number, n = 14) {
    if (reduced()) return;
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const g = new Graphics().rect(-4, -4, 8, 8).fill(color);
      g.position.set(at.x, at.y);
      this.screen.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, life: 500 + Math.random() * 400 });
    }
  }

  // ================================================================ the Training drill
  /**
   * One rod of yours on an empty table. A ball rolls across the lanes in front of it, faster each time; a tap stops
   * it, and a ball stopped within reach of a figure is a hit. Five balls. Resolves with the hits.
   */
  async training(rod: number, side: Side): Promise<number> {
    rod = clamp(Math.floor(rod), 0, 3);
    if (this.home !== side) this.setSides(side, null);
    this.only = rod;
    this.rods.forEach((sd, s) => sd.forEach((rv, r) => (rv.c.visible = rv.fc.visible = s === 0 && r === rod)));
    this.ball.visible = false;
    this.boardNote = "TRAINING";
    this.drawBoard();
    // the count sits on a dark pill in the near rail, clear of the bearings
    const pill = new Container();
    const pillBg = new Graphics().roundRect(-78, -12, 156, 24, 8).fill(0x0b0309).stroke({ width: 2, color: BRASS.hi, alpha: 0.6 });
    const counter = txt("", { fontFamily: NUM, fontSize: 18, fill: COL.money, letterSpacing: 2 });
    counter.anchor.set(0.5);
    pill.addChild(pillBg, counter);
    pill.position.set(colX(colOf(0, rod)) + (rod === 3 ? -150 : 150), LANE0 + PITCH_H + RAIL / 2);
    this.upright(pill);
    this.fxLayer.addChild(pill);
    const x = colX(colOf(0, rod)) + 30;
    const d = RODS[rod];
    let hits = 0;
    this.say(`Training: ${["keeper", "defence", "midfield", "attack"][rod]} rod. Tap to stop the ball on a figure.`, "flat");
    for (let n = 0; n < 5; n++) {
      counter.text = `BALL ${n + 1}/5 · ${hits} HIT${hits === 1 ? "" : "S"}`;
      // the rod sets itself somewhere new, so the spot can't be learned
      const off = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      this.off[0][rod] = off;
      await tween(this.rods[0][rod].c.position, { y: this.rodY(0, rod) }, 260, ease.outCubic);
      const down = Math.random() < 0.5;
      const top = LANE0 + 14;
      const bot = LANE0 + PITCH_H - 14;
      this.ball.position.set(x, down ? top : bot);
      this.ball.alpha = 1;
      this.ball.visible = true;
      this.ballFree = true;
      const speed = 430 * Math.pow(1.24, n);
      await new Promise<void>((res) => {
        this.drill = { rod, y: down ? top : bot, v: down ? speed : -speed, stopped: false, onStop: res };
        // a ball nobody stops in 7 s counts as a miss
        setTimeout(() => this.drill && !this.drill.stopped && this.drillTap(), 7000);
      });
      this.ballFree = false;
      // nearest figure on the rod
      const by = this.ball.y;
      let best = Infinity;
      let fig: FigureView | null = null;
      this.rods[0][rod].figs.forEach((f, i) => {
        const fy = laneY(off + i * d.gap);
        const dd = Math.abs(fy - by);
        if (dd < best) {
          best = dd;
          fig = f;
        }
      });
      // a crowded rod covers more of the table, so each of its figures reaches a little less
      const hit = best <= FR + (d.n >= 5 ? 4 : d.n >= 3 ? 7 : 10);
      const sp = this.toScreen({ x: this.ball.x, y: by });
      if (hit) {
        hits++;
        sfx.block();
        hitStop(60);
        const f = fig as FigureView | null;
        if (f) {
          f.swing((o, to, ms, e) => {
            try {
              return tween(o, to, ms, e);
            } catch {
              return Promise.resolve();
            }
          }, ease.outBack);
          f.scale.set(1.25 * FIG_K);
          void tween(f.scale, { x: FIG_K, y: FIG_K }, 260, ease.outBack);
        }
        this.floatText("Hit", sp, COL.good, 36);
        this.burst(sp, COL.money, 10);
        this.crowdV.energy = Math.min(1, this.crowdV.energy + 0.4);
      } else {
        sfx.error();
        this.floatText("Miss", sp, COL.bad, 36);
      }
      counter.text = `BALL ${n + 1}/5 · ${hits} HIT${hits === 1 ? "" : "S"}`;
      await wait(700);
      this.ball.visible = false;
    }
    this.drill = null;
    this.say(`Training done. ${hits} of 5.`, hits >= 3 ? "up" : hits ? "flat" : "down");
    if (hits >= 4) this.crowdV.react("cheer");
    await wait(500);
    pill.destroy({ children: true });
    this.boardNote = null;
    this.drawBoard();
    this.only = null;
    this.rods.forEach((sd) => sd.forEach((rv) => (rv.c.visible = rv.fc.visible = true)));
    this.ball.visible = !!this.away;
    this.ball.position.set(this.ballRest.x, this.ballRest.y);
    return hits;
  }

  private drillTap() {
    const d = this.drill;
    if (!d || d.stopped) return;
    d.stopped = true;
    sfx.click();
    const cb = d.onStop;
    d.onStop = null;
    cb?.();
  }

  private frameDrill(sec: number) {
    const d = this.drill;
    if (!d || d.stopped) return;
    const top = LANE0 + 14;
    const bot = LANE0 + PITCH_H - 14;
    d.y += d.v * sec;
    if (d.y > bot) {
      d.y = bot - (d.y - bot);
      d.v = -d.v;
      sfx.tick();
    } else if (d.y < top) {
      d.y = top + (top - d.y);
      d.v = -d.v;
      sfx.tick();
    }
    this.ball.position.set(this.ball.x, d.y);
  }
}

const slotRod = (slot: number) => ROD_SLOTS.findIndex((s) => s.includes(slot));

/** A club's shield in its kit, the same one the screens draw (src/club/app.tsx ClubCrest). */
function kitShield(kit: [number, number], name: string, R: number): Graphics {
  const g = new Graphics();
  const k = R / 50;
  const shield = [-50, -45, 50, -45, 50, 12, 0, 57, -50, 12].map((v) => v * k);
  g.poly(shield).fill(kit[0]);
  const h = hash32(name);
  const pat = (h >> 4) % 4;
  if (pat === 0) for (const x of [-30, -6, 18]) g.rect(x * k, -45 * k, 12 * k, 70 * k).fill({ color: kit[1], alpha: 0.9 });
  else if (pat === 1) g.poly([0, -45, 50, -45, 50, 12, 0, 57].map((v) => v * k)).fill({ color: kit[1], alpha: 0.9 });
  else if (pat === 2) g.poly([-50, -5, 0, 30, 50, -5, 50, 12, 0, 57, -50, 12].map((v) => v * k)).fill({ color: kit[1], alpha: 0.9 });
  else for (const y of [-30, -5]) g.rect(-50 * k, y * k, 100 * k, 11 * k).fill({ color: kit[1], alpha: 0.9 });
  g.poly(shield).stroke({ width: 5, color: COL.ink });
  g.circle(0, -3 * k, 20 * k).fill(COL.cream).stroke({ width: 3, color: COL.ink });
  g.circle(0, -3 * k, 8 * k).fill(kit[0]);
  return g;
}
