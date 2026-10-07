// The table: everything drawn in Pixi. State lives in the shared engine; this file only shows it.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { BLIND_NAME, BLIND_REWARD, BOSS, HAND, INSIDER, MAX_ANTE, MAX_INSIDERS, MAX_MOVES, MOVE, RARITY_NAME, type HandId } from "../shared/content.js";
import { ENH, RANK_LABEL, SUITS, type Card } from "../shared/data.js";
import { targetFor, type Action, type Run, type Scored, type Step } from "../shared/engine.js";
import { bestPlay } from "../shared/bot.js";
import { sfx } from "./audio.js";
import { setUi, toast, ui } from "./store.js";
import { CardView, CH, CW, InsiderView, ItemView, tokenTexture, txt } from "./cards.js";
import { crtFilter, setSwirlColors, swirlFilter, type FxFilter } from "./fx.js";
import { COL, NUM, SUIT_BRIGHT } from "./theme.js";
import { ease, reduced, tween, wait } from "./tween.js";
import { Button, NumBox, Tip, fmt, fmtMult, panel } from "./widgets.js";

type Mode = "land" | "port";
interface Layout {
  mode: Mode;
  W: number;
  H: number;
  handY: number;
  handX0: number;
  handX1: number;
  handScale: number;
  playY: number;
  playX: number;
  playScale: number;
  insX: number;
  insY: number;
  insStep: number;
  insScale: number;
  movX: number;
  movY: number;
  movStep: number;
  deckX: number;
  deckY: number;
  btnY: number;
  stage: { x: number; y: number; w: number; h: number };
}

export interface GameHooks {
  onAction(a: Action, run: Run): void;
  onOver(run: Run): void;
  onSelect(run: Run): void;
  openOverlay(o: "levels" | "deck" | "options" | "how"): void;
}

const SPEED_STEP = 0.9;

export class Game {
  root = new Container();
  bg = new Sprite(Texture.WHITE);
  swirl: FxFilter;
  crt: FxFilter;
  hud = new Container();
  table = new Container();
  stageLayer = new Container();
  felt = new Graphics();
  insLayer = new Container();
  handLayer = new Container();
  playLayer = new Container();
  fxLayer = new Container();
  tipLayer = new Container();
  tip = new Tip();
  L!: Layout;
  run: Run | null = null;
  views = new Map<number, CardView>();
  insViews: InsiderView[] = [];
  movViews: ItemView[] = [];
  sel: number[] = [];
  busy = false;
  sortBy: "rank" | "suit" = "rank";
  shake = 0;
  heat = 0;
  t = 0;
  hintIds: number[] = [];
  focusCard: Card | null = null;
  // hud parts
  hudMode: Mode | null = null;
  blindName!: Text;
  blindText!: Text;
  blindTarget!: Text;
  blindBadge!: Graphics;
  scoreText!: Text;
  handName!: Text;
  handLevel!: Text;
  chipsBox!: NumBox;
  multBox!: NumBox;
  stat: Keyed<string, Text> = {};
  info!: Text;
  chalText!: Text;
  btnPlay!: Button;
  btnDisc!: Button;
  btnSort!: Button;
  deckCount!: Text;
  deckPile = new Container();
  insLabel!: Text;
  movLabel!: Text;
  particles: { g: Graphics; vx: number; vy: number; life: number }[] = [];

  constructor(
    public app: Application,
    public hooks: GameHooks,
  ) {
    this.swirl = swirlFilter();
    this.crt = crtFilter();
    this.bg.filters = [this.swirl];
    app.stage.addChild(this.bg, this.root);
    this.root.addChild(this.hud, this.table, this.tipLayer);
    this.root.visible = false;
    this.hud.addChildAt(this.felt, 0);
    this.table.addChild(this.stageLayer, this.insLayer, this.deckPile, this.playLayer, this.handLayer, this.fxLayer);
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
      this.root.position.set((Math.random() - 0.5) * this.shake * 14 * s, (Math.random() - 0.5) * this.shake * 14 * s);
      this.crt.u.uShake = this.shake;
    } else {
      this.root.position.set(0, 0);
      this.crt.u.uShake = 0;
    }
    // idle float of cards
    if (!rm) {
      for (const v of this.views.values()) {
        if (v.parent !== this.handLayer) continue;
        v.body.y = Math.sin(this.t * 1.6 + v.wob) * 2.2 - v.hover * 8;
        v.body.rotation = Math.sin(this.t * 1.1 + v.wob) * 0.012;
      }
      for (const v of [...this.insViews, ...this.movViews]) {
        v.body.y = Math.sin(this.t * 1.4 + v.wob) * 2;
        v.body.rotation = Math.sin(this.t * 0.9 + v.wob) * 0.02;
      }
    }
    // particles
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

  // ================================================================ layout
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
    const s = sw / W;
    this.root.scale.set(s);
    this.bg.width = sw;
    this.bg.height = sh;
    this.app.stage.filterArea = new Rectangle(0, 0, sw, sh);
    this.app.stage.hitArea = new Rectangle(0, 0, sw, sh);
    if (mode === "land") {
      const left = 380;
      const cx = (left + W - 20) / 2;
      this.L = {
        mode,
        W,
        H,
        handY: H - 228,
        handX0: left + 100,
        handX1: W - 232,
        handScale: 1.24,
        playY: H * 0.5 - 70,
        playX: cx,
        playScale: 1,
        insX: left + 70,
        insY: 118,
        insStep: 114,
        insScale: 0.9,
        movX: W - 250,
        movY: 118,
        movStep: 108,
        deckX: W - 92,
        deckY: H - 228,
        btnY: H - 62,
        stage: { x: left, y: 228, w: W - left - 20, h: H - 248 },
      };
    } else {
      this.L = {
        mode,
        W,
        H,
        handY: H - 330,
        handX0: 72,
        handX1: W - 72,
        handScale: 1.0,
        playY: Math.round(410 + (H - 330 - 410) * 0.5),
        playX: W / 2,
        playScale: 0.9,
        insX: 56,
        insY: 400,
        insStep: 88,
        insScale: 0.7,
        movX: W - 136,
        movY: 400,
        movStep: 84,
        deckX: W - 50,
        deckY: H - 44,
        btnY: H - 100,
        stage: { x: 16, y: 480, w: W - 32, h: H - 496 },
      };
    }
    this.buildHud();
    if (this.run) this.refreshAll(false);
  }

  // ================================================================ HUD
  buildHud() {
    const L = this.L;
    this.hud.removeChildren().forEach((c) => {
      if (c !== this.felt) c.destroy({ children: true });
    });
    this.hud.addChild(this.felt);
    this.felt.clear();
    if (L.mode === "land") {
      this.felt.roundRect(L.stage.x, 222, L.W - L.stage.x - 20, L.H - 242, 18).fill({ color: COL.felt, alpha: 0.5 }).stroke({ width: 3, color: COL.feltHi, alpha: 0.8 });
      this.felt.roundRect(L.stage.x, 20, L.W - L.stage.x - 20, 190, 18).fill({ color: COL.ink, alpha: 0.45 }).stroke({ width: 3, color: COL.edge, alpha: 0.8 });
    } else {
      this.felt.roundRect(16, 326, L.W - 32, 150, 16).fill({ color: COL.ink, alpha: 0.45 }).stroke({ width: 3, color: COL.edge, alpha: 0.8 });
      this.felt.roundRect(16, 488, L.W - 32, L.H - 488 - 76, 18).fill({ color: COL.felt, alpha: 0.5 }).stroke({ width: 3, color: COL.feltHi, alpha: 0.8 });
    }
    this.stat = {};
    const port = L.mode === "port";
    const mk = (x: number, y: number, w: number, h: number, fill = COL.panel, edge = COL.edge) => {
      const p = panel(w, h, fill, edge);
      p.position.set(x, y);
      this.hud.addChild(p);
      return p;
    };
    const label = (s: string, x: number, y: number, size = 15, color = COL.dim, anchor = 0.5) => {
      const t = txt(s, { fontSize: size, fill: color, fontWeight: "700" });
      t.anchor.set(anchor, 0.5);
      t.position.set(x, y);
      this.hud.addChild(t);
      return t;
    };
    if (!port) {
      // side column
      mk(20, 20, 340, L.H - 40, COL.ink2, COL.edge);
      // blind
      this.blindBadge = new Graphics();
      this.blindBadge.position.set(36, 36);
      this.hud.addChild(this.blindBadge);
      this.blindName = label("", 190, 62, 26, COL.cream);
      this.blindText = txt("", { fontSize: 15, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: 290 });
      this.blindText.anchor.set(0.5, 0);
      this.blindText.position.set(190, 92);
      this.hud.addChild(this.blindText);
      mk(36, 140, 308, 70, COL.ink, COL.edge);
      label("Score at least", 110, 175, 15);
      this.blindTarget = txt("0", { fontFamily: NUM, fontSize: 46, fill: COL.mult });
      this.blindTarget.anchor.set(0, 0.5);
      this.blindTarget.position.set(190, 172);
      this.hud.addChild(this.blindTarget);
      // round score
      mk(36, 226, 308, 76, COL.ink, COL.edge);
      label("Round score", 110, 264, 15);
      this.scoreText = txt("0", { fontFamily: NUM, fontSize: 54, fill: COL.cream });
      this.scoreText.anchor.set(0, 0.5);
      this.scoreText.position.set(190, 261);
      this.hud.addChild(this.scoreText);
      // hand
      mk(36, 318, 308, 150, COL.ink, COL.edge);
      this.handName = label("Pick up to 5 cards", 190, 346, 22, COL.cream);
      this.handLevel = label("", 190, 372, 14, COL.dim);
      this.chipsBox = new NumBox(124, 58, COL.chips, "right");
      this.chipsBox.position.set(116, 424);
      this.multBox = new NumBox(124, 58, COL.mult, "left");
      this.multBox.position.set(264, 424);
      this.hud.addChild(this.chipsBox, this.multBox);
      label("X", 190, 424, 28, COL.mult);
      // stats grid
      const stats: [string, string, number][] = [
        ["hands", "Hands", COL.chips],
        ["discards", "Discards", COL.mult],
        ["money", "Money", COL.money],
        ["ante", "Ante", COL.cream],
        ["round", "Round", COL.cream],
        ["deck", "Deck", COL.cream],
      ];
      stats.forEach(([k, name, color], i) => {
        const x = 36 + (i % 2) * 156;
        const y = 486 + Math.floor(i / 2) * 82;
        mk(x, y, 152, 72, COL.ink, COL.edge);
        label(name, x + 76, y + 16, 13);
        const v = txt("-", { fontFamily: NUM, fontSize: 40, fill: color });
        v.anchor.set(0.5);
        v.position.set(x + 76, y + 46);
        this.hud.addChild(v);
        this.stat[k] = v;
      });
      // menu buttons
      const by = Math.min(L.H - 70, 760);
      const bInfo = new Button("Hands", 96, 54, COL.neutral, () => this.hooks.openOverlay("levels"), { size: 18 });
      bInfo.position.set(36 + 48, by);
      const bDeck = new Button("Deck", 96, 54, COL.neutral, () => this.hooks.openOverlay("deck"), { size: 18 });
      bDeck.position.set(36 + 48 + 106, by);
      const bOpt = new Button("Menu", 96, 54, COL.neutral, () => this.hooks.openOverlay("options"), { size: 18 });
      bOpt.position.set(36 + 48 + 212, by);
      this.hud.addChild(bInfo, bDeck, bOpt);
      this.chalText = txt("", { fontSize: 14, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: 300 });
      this.chalText.anchor.set(0.5, 0);
      this.chalText.position.set(190, by + 40);
      this.hud.addChild(this.chalText);
      this.info = txt("", { fontSize: 15, fill: COL.cream2, wordWrap: true, wordWrapWidth: 640, lineHeight: 20 });
      this.info.position.set(L.stage.x + 10, L.insY + 82);
      this.info.visible = false;
      this.hud.addChild(this.info);
      this.insLabel = label("", L.insX - 50, 34, 17, COL.dim, 0);
      this.movLabel = label("", L.movX - 50, 34, 17, COL.dim, 0);
    } else {
      const W = L.W;
      // row 1: blind + score
      this.blindBadge = new Graphics();
      this.blindBadge.position.set(16, 16);
      this.hud.addChild(this.blindBadge);
      mk(16, 16, W * 0.56, 120, COL.ink2, COL.edge);
      this.blindName = label("", 16 + W * 0.28, 40, 22, COL.cream);
      this.blindText = txt("", { fontSize: 14, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: W * 0.52 });
      this.blindText.anchor.set(0.5, 0);
      this.blindText.position.set(16 + W * 0.28, 58);
      this.hud.addChild(this.blindText);
      this.blindTarget = txt("0", { fontFamily: NUM, fontSize: 40, fill: COL.mult });
      this.blindTarget.anchor.set(0.5, 0.5);
      this.blindTarget.position.set(16 + W * 0.28, 112);
      this.hud.addChild(this.blindTarget);
      const sx = 28 + W * 0.56;
      const swd = W - sx - 16;
      mk(sx, 16, swd, 120, COL.ink2, COL.edge);
      label("Round score", sx + swd / 2, 38, 14);
      this.scoreText = txt("0", { fontFamily: NUM, fontSize: 56, fill: COL.cream });
      this.scoreText.anchor.set(0.5);
      this.scoreText.position.set(sx + swd / 2, 88);
      this.hud.addChild(this.scoreText);
      // row 2: hand + chips x mult
      mk(16, 148, W - 32, 92, COL.ink, COL.edge);
      this.handName = label("Pick up to 5 cards", 36, 176, 20, COL.cream, 0);
      this.handLevel = label("", 36, 206, 13, COL.dim, 0);
      this.chipsBox = new NumBox(130, 60, COL.chips, "right");
      this.chipsBox.position.set(W - 250, 194);
      this.multBox = new NumBox(130, 60, COL.mult, "left");
      this.multBox.position.set(W - 98, 194);
      this.hud.addChild(this.chipsBox, this.multBox);
      label("X", W - 174, 194, 24, COL.mult);
      // row 3: stats
      const stats: [string, string, number][] = [
        ["hands", "Hands", COL.chips],
        ["discards", "Disc.", COL.mult],
        ["money", "Money", COL.money],
        ["ante", "Ante", COL.cream],
      ];
      const sw4 = (W - 32 - 3 * 8) / 4;
      stats.forEach(([k, name, color], i) => {
        const x = 16 + i * (sw4 + 8);
        mk(x, 252, sw4, 64, COL.ink, COL.edge);
        label(name, x + 30, 284, 13, COL.dim, 0.5);
        const v = txt("-", { fontFamily: NUM, fontSize: 38, fill: color });
        v.anchor.set(0.5);
        v.position.set(x + sw4 / 2 + 22, 283);
        this.hud.addChild(v);
        this.stat[k] = v;
      });
      this.stat.round = txt("", { fontSize: 1 });
      this.stat.deck = txt("", { fontSize: 1 });
      this.insLabel = label("", 18, 336, 15, COL.dim, 0);
      this.movLabel = label("", L.movX - 44, 336, 15, COL.dim, 0);
      this.info = txt("", { fontSize: 14, fill: COL.cream2, align: "center", wordWrap: true, wordWrapWidth: W - 48, lineHeight: 19 });
      this.info.anchor.set(0.5, 0);
      this.info.position.set(W / 2, L.handY - 160);
      this.hud.addChild(this.info);
      this.chalText = txt("", { fontSize: 14, fill: COL.money, align: "center", wordWrap: true, wordWrapWidth: W - 420 });
      this.chalText.anchor.set(0.5, 0.5);
      this.chalText.position.set((316 + W - 96) / 2, L.H - 34);
      this.hud.addChild(this.chalText);
      // menu buttons (small, top of hand)
      const bInfo = new Button("Hands", 92, 46, COL.neutral, () => this.hooks.openOverlay("levels"), { size: 16 });
      const bDeck = new Button("Deck", 92, 46, COL.neutral, () => this.hooks.openOverlay("deck"), { size: 16 });
      const bOpt = new Button("Menu", 92, 46, COL.neutral, () => this.hooks.openOverlay("options"), { size: 16 });
      bInfo.position.set(62, L.H - 34);
      bDeck.position.set(162, L.H - 34);
      bOpt.position.set(262, L.H - 34);
      this.hud.addChild(bInfo, bDeck, bOpt);
    }
    // action buttons (in table layer so they hide with stage panels)
    const bw = port ? 200 : 220;
    const bh = port ? 84 : 76;
    this.btnPlay = new Button("Play hand", bw, bh, COL.play, () => void this.doPlay(), { size: port ? 26 : 26 });
    this.btnDisc = new Button("Discard", bw, bh, COL.discard, () => void this.doDiscard(), { size: port ? 26 : 26 });
    this.btnSort = new Button("Sort: rank", port ? 130 : 150, port ? 60 : 56, COL.neutral, () => this.toggleSort(), { size: 17 });
    const cx = L.mode === "land" ? (L.handX0 + L.handX1) / 2 : L.W / 2;
    if (port) {
      const y = L.btnY - 46;
      this.btnPlay.position.set(cx - 180, y);
      this.btnSort.position.set(cx, y);
      this.btnDisc.position.set(cx + 180, y);
    } else {
      this.btnPlay.position.set(cx - 210, L.btnY);
      this.btnSort.position.set(cx, L.btnY);
      this.btnDisc.position.set(cx + 210, L.btnY);
    }
    this.hud.addChild(this.btnPlay, this.btnDisc, this.btnSort);
    // deck pile
    this.deckPile.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (let i = 0; i < 3; i++) {
      const b = new CardView({ id: -1, l: { t: "", s: "", n: "", c: null, q: "", u: 0, p: 0, x: null, k: 0, h: 0, a: 0, g: false, d: false }, rank: 2, suit: 0, q: "", enh: null });
      b.showBack(true);
      b.eventMode = "none";
      b.position.set(-i * 3, -i * 3);
      this.deckPile.addChild(b);
    }
    this.deckCount = txt("", { fontFamily: NUM, fontSize: 30, fill: COL.cream, stroke: { color: COL.ink, width: 5 } });
    this.deckCount.anchor.set(0.5);
    this.deckCount.position.set(-6, CH / 2 + 18);
    this.deckPile.addChild(this.deckCount);
    this.deckPile.position.set(L.deckX, L.deckY);
    this.deckPile.scale.set(L.mode === "port" ? 0.42 : 0.85);
    if (port) {
      this.deckCount.position.set(-CW / 2 - 70, 0);
      this.deckCount.scale.set(2);
    }
    this.hudMode = L.mode;
  }

  // ================================================================ run lifecycle
  start(run: Run) {
    this.root.visible = true;
    for (const c of run.s.deck) tokenTexture(c.l.c, c.l.s, () => {});
    this.run = run;
    this.sel = [];
    this.focusCard = null;
    for (const v of this.views.values()) v.destroy({ children: true });
    this.views.clear();
    this.playLayer.removeChildren();
    this.handLayer.removeChildren();
    this.refreshAll(true);
  }

  refreshAll(deal: boolean) {
    const run = this.run;
    if (!run) return;
    this.tip.hide();
    this.syncInsiders();
    this.syncHud();
    this.showStage();
    if (run.s.phase === "round") void this.syncHand(deal ? run.s.hand : []);
    else this.clearHand();
  }

  clearHand() {
    for (const v of this.views.values()) v.destroy({ children: true });
    this.views.clear();
    this.handLayer.removeChildren();
    this.playLayer.removeChildren();
  }

  syncHud() {
    const run = this.run;
    if (!run) return;
    const s = run.s;
    const boss = s.blind === 2 ? BOSS[s.bosses[s.ante - 1]] : null;
    const blindCol = s.blind === 0 ? COL.chips : s.blind === 1 ? COL.money : COL.mult;
    this.blindName.text = boss ? boss.name : BLIND_NAME[s.blind];
    this.blindName.style.fill = blindCol;
    this.blindText.text = boss ? boss.text : `Reward $${BLIND_REWARD[s.blind]}`;
    const target = s.phase === "round" ? s.target : targetFor(s.ante, s.blind, s.bosses[s.ante - 1]);
    this.blindTarget.text = fmt(target);
    this.scoreText.text = fmt(s.phase === "round" ? s.score : 0);
    this.stat.hands.text = String(s.phase === "round" ? s.hands : "-");
    this.stat.discards.text = String(s.phase === "round" ? s.discards : "-");
    this.stat.money.text = "$" + s.money;
    this.stat.ante.text = `${Math.min(s.ante, MAX_ANTE)}/${MAX_ANTE}`;
    this.stat.round.text = String(s.round);
    this.stat.deck.text = `${s.deck.length}`;
    this.deckCount.text = s.phase === "round" ? `${s.draw.length}/${s.deck.length}` : `${s.deck.length}`;
    const ch = ui.challenge;
    this.chalText.text = ch ? `Beat ${ch.name || "the challenger"}'s ${ch.handName || "best hand"} (${fmt(ch.best)})` : "";
    this.insLabel.text = `INSIDERS ${s.insiders.length}/${MAX_INSIDERS}`;
    this.movLabel.text = `MOVES ${s.moves.length}/${MAX_MOVES}`;
    this.syncSelectionHud();
    this.syncButtons();
  }

  syncSelectionHud() {
    const run = this.run;
    if (!run) return;
    if (this.busy) return;
    if (run.s.phase === "round" && this.sel.length) {
      const ev = run.evaluate(this.sel);
      const v = run.handValue(ev.hand);
      let { chips, mult } = v;
      if (run.bossNow() === "slip") {
        chips = Math.floor(chips / 2);
        mult = Math.max(1, Math.floor(mult / 2));
      }
      this.handName.text = HAND[ev.hand].name;
      this.handLevel.text = `level ${run.s.levels[ev.hand]}${run.bossNow() === "wash" && run.s.typesRound.includes(ev.hand) ? " · already played: scores 0" : ""}`;
      this.chipsBox.set(fmt(chips));
      this.multBox.set(fmtMult(mult));
    } else {
      this.handName.text = run.s.phase === "round" ? "Pick up to 5 cards" : run.s.phase === "shop" ? "Shop" : "";
      this.handLevel.text = "";
      this.chipsBox.set("0");
      this.multBox.set("0");
    }
  }

  syncButtons() {
    const run = this.run;
    const inRound = !!run && run.s.phase === "round";
    for (const b of [this.btnPlay, this.btnDisc, this.btnSort]) b.visible = inRound;
    if (!run || !inRound) return;
    const n = this.sel.length;
    this.btnPlay.setEnabled(!this.busy && n >= run.minPlay() && n <= 5 && n > 0);
    this.btnDisc.setEnabled(!this.busy && n >= 1 && n <= 5 && run.s.discards > 0);
    this.btnSort.setText(this.sortBy === "rank" ? "Sort: rank" : "Sort: suit");
    this.btnDisc.setText("Discard", undefined);
  }

  // ================================================================ insiders & moves row
  syncInsiders() {
    const run = this.run;
    if (!run) return;
    const L = this.L;
    this.insLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.insViews = [];
    this.movViews = [];
    // empty slots
    const slots = new Graphics();
    for (let i = 0; i < MAX_INSIDERS; i++) {
      const x = L.insX + i * L.insStep;
      slots.roundRect(x - (CW * L.insScale) / 2, L.insY - (CH * L.insScale) / 2, CW * L.insScale, CH * L.insScale, 10).fill({ color: 0x000000, alpha: 0.22 }).stroke({ width: 2, color: COL.edge, alpha: 0.7 });
    }
    for (let i = 0; i < MAX_MOVES; i++) {
      const x = L.movX + i * L.movStep;
      const sc = L.insScale * 0.92;
      slots.roundRect(x - (CW * sc) / 2, L.movY - (CH * sc) / 2, CW * sc, CH * sc, 10).fill({ color: 0x000000, alpha: 0.22 }).stroke({ width: 2, color: COL.edge, alpha: 0.7 });
    }
    this.insLayer.addChild(slots);
    run.s.insiders.forEach((j, i) => {
      const v = new InsiderView(j.id, j.v);
      v.scale.set(L.insScale);
      v.position.set(L.insX + i * L.insStep, L.insY);
      v.on("pointertap", () => this.insiderTip(i, v));
      v.on("pointerover", (e) => {
        if (e.pointerType === "mouse") this.insiderTip(i, v, false);
      });
      v.on("pointerout", (e) => {
        if (e.pointerType === "mouse" && !this.tipPinned) this.tip.hide();
      });
      this.insLayer.addChild(v);
      this.insViews.push(v);
    });
    run.s.moves.forEach((m, i) => {
      const v = new ItemView("move", m);
      v.scale.set(L.insScale * 0.92);
      v.position.set(L.movX + i * L.movStep, L.movY);
      v.on("pointertap", () => this.moveTip(i, v));
      v.on("pointerover", (e) => {
        if (e.pointerType === "mouse") this.moveTip(i, v, false);
      });
      v.on("pointerout", (e) => {
        if (e.pointerType === "mouse" && !this.tipPinned) this.tip.hide();
      });
      this.insLayer.addChild(v);
      this.movViews.push(v);
    });
  }

  tipPinned = false;
  private tipAt(obj: Container): { x: number; y: number } {
    const p = this.root.toLocal(obj.getGlobalPosition());
    const hgt = (CH * obj.scale.y) / 2;
    return { x: p.x, y: p.y - hgt };
  }

  insiderTip(i: number, v: InsiderView, pin = true) {
    const run = this.run;
    if (!run) return;
    const j = run.s.insiders[i];
    if (!j) return;
    const d = INSIDER[j.id];
    this.tip.hide();
    let body = d.text;
    if (j.id === "bag") body += `\nNow: +${j.v} Mult`;
    if (j.id === "bonding") body += `\nNow: x${fmtMult(1 + 0.25 * j.v)} Mult`;
    body += `\n${RARITY_NAME[d.rarity]} · sells for $${run.sellValue(j)}`;
    if (pin) {
      const b = new Button(`Sell $${run.sellValue(j)}`, 140, 46, COL.discard, () => {
        this.act({ t: "sell", i });
        sfx.coin();
        this.tip.hide();
        this.syncInsiders();
        this.syncHud();
        this.showStage();
      }, { size: 17 });
      b.position.set(70, 26);
      b.setEnabled(!this.busy);
      this.tip.extra.addChild(b);
    }
    this.tipPinned = pin;
    const at = this.tipAt(v);
    this.tip.show(d.name, body, at.x, at.y, { w: this.L.W, h: this.L.H }, COL.money, 300);
    if (this.tip.y < at.y && this.tip.y + this.tip.height > at.y) this.tip.y = at.y + CH * v.scale.y + 8;
  }

  moveTip(i: number, v: ItemView, pin = true) {
    const run = this.run;
    if (!run) return;
    const id = run.s.moves[i];
    const d = MOVE[id];
    this.tip.hide();
    let body = d.text;
    const inRound = run.s.phase === "round";
    if (d.min > 0) body += inRound ? `\nSelect ${d.min === d.max ? d.min : `${d.min}-${d.max}`} card${d.max > 1 ? "s" : ""} in hand, then use.` : "\nUse it during a round.";
    if (pin) {
      const ok = !this.busy && (d.min === 0 || (inRound && this.sel.length >= d.min && this.sel.length <= d.max));
      const b = new Button("Use", 110, 46, COL.play, () => void this.doUse(i), { size: 18 });
      b.position.set(55, 26);
      b.setEnabled(ok);
      this.tip.extra.addChild(b);
    }
    this.tipPinned = pin;
    const at = this.tipAt(v);
    this.tip.show(d.name, body, at.x, at.y, { w: this.L.W, h: this.L.H }, COL.chips, 300);
  }

  toastMsg(m: string) {
    toast(m);
  }

  // ================================================================ hand
  sortedHand(): number[] {
    const run = this.run!;
    const ids = run.s.hand.slice();
    const c = (i: number) => run.card(i);
    if (this.sortBy === "rank") ids.sort((a, b) => c(b).rank - c(a).rank || c(a).suit - c(b).suit || a - b);
    else ids.sort((a, b) => c(a).suit - c(b).suit || c(b).rank - c(a).rank || a - b);
    return ids;
  }

  handPos(i: number, n: number): { x: number; y: number; r: number } {
    const L = this.L;
    const cw = CW * L.handScale;
    const span = L.handX1 - L.handX0;
    const step = n > 1 ? Math.min(cw + 10, span / (n - 1)) : 0;
    const total = step * (n - 1);
    const cx = (L.handX0 + L.handX1) / 2;
    const x = cx - total / 2 + i * step;
    const k = n > 1 ? i / (n - 1) - 0.5 : 0;
    const fan = L.mode === "port" ? 0.12 : 0.08;
    return { x, y: L.handY + Math.abs(k) * k * 0 + k * k * 34, r: k * fan };
  }

  async syncHand(dealIds: number[]) {
    const run = this.run;
    if (!run) return;
    const seq = this.sortedHand();
    // remove views for cards no longer in hand
    for (const [id, v] of this.views) {
      if (!run.s.hand.includes(id) && v.parent === this.handLayer) {
        v.destroy({ children: true });
        this.views.delete(id);
      }
    }
    const L = this.L;
    const deal: CardView[] = [];
    seq.forEach((id, i) => {
      let v = this.views.get(id);
      const p = this.handPos(i, seq.length);
      if (!v) {
        v = new CardView(run.card(id));
        this.bindCard(v);
        this.views.set(id, v);
        this.handLayer.addChild(v);
        if (dealIds.includes(id)) {
          v.position.set(L.deckX, L.deckY);
          v.scale.set(0.6);
          v.showBack(true);
          deal.push(v);
        } else {
          v.position.set(p.x, p.y);
        }
      }
      v.setDebuffed(run.debuffed(run.card(id)));
      v.zIndex = i;
    });
    this.handLayer.sortableChildren = true;
    // deal animation
    let k = 0;
    const jobs: Promise<void>[] = [];
    seq.forEach((id, i) => {
      const v = this.views.get(id)!;
      const p = this.handPos(i, seq.length);
      const lift = this.sel.includes(id) ? -26 : 0;
      if (deal.includes(v)) {
        const delay = k++ * 70;
        jobs.push(
          (async () => {
            await wait(delay);
            sfx.deal(k);
            void tween(v.scale, { x: L.handScale, y: L.handScale }, 260, ease.outCubic);
            await tween(v, { x: p.x, y: p.y + lift, rotation: p.r }, 300, ease.outCubic);
            await this.flip(v, false);
          })(),
        );
      } else {
        v.scale.set(L.handScale);
        jobs.push(tween(v, { x: p.x, y: p.y + lift, rotation: p.r }, 220, ease.outCubic));
      }
    });
    await Promise.all(jobs);
  }

  async flip(v: CardView, toBack: boolean) {
    const sx = v.scale.x;
    await tween(v.scale, { x: 0.01 }, 90, ease.inCubic);
    v.showBack(toBack);
    await tween(v.scale, { x: sx }, 110, ease.outCubic);
  }

  bindCard(v: CardView) {
    // press and hold opens the full card; a short tap selects it
    let timer = 0;
    let held = false;
    let start = { x: 0, y: 0 };
    v.on("pointerdown", (e) => {
      held = false;
      start = { x: e.global.x, y: e.global.y };
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        held = true;
        sfx.tick();
        this.tip.hide();
        const c = v.card;
        setUi({ detail: { l: c.l, rank: c.rank, suit: c.suit, enh: c.enh, q: c.q, bridged: c.bridged } });
      }, 480);
    });
    v.on("pointermove", (e) => {
      if (Math.hypot(e.global.x - start.x, e.global.y - start.y) > 12) clearTimeout(timer);
    });
    v.on("pointerup", () => clearTimeout(timer));
    v.on("pointerupoutside", () => clearTimeout(timer));
    v.on("pointertap", () => {
      clearTimeout(timer);
      if (held) {
        held = false;
        return;
      }
      this.tapCard(v);
    });
    v.on("pointerover", (e) => {
      if (e.pointerType !== "mouse") return;
      void tween(v, { hover: 1 }, 120);
      sfx.tick();
      this.cardTip(v);
    });
    v.on("pointerout", (e) => {
      if (e.pointerType !== "mouse") return;
      void tween(v, { hover: 0 }, 160);
      if (!this.tipPinned) this.tip.hide();
    });
  }

  cardText(c: Card): { title: string; body: string } {
    const run = this.run!;
    const l = c.l;
    const age = Math.max(0, run.ageHours(c));
    const ageS = age < 1 ? `${Math.max(1, Math.round(age * 60))}m` : age < 48 ? `${Math.round(age)}h` : `${Math.round(age / 24)}d`;
    const ch = l.x === null ? "n/a" : `${l.x >= 0 ? "+" : ""}${(l.x / 100).toFixed(1)}%`;
    const lines = [
      `${l.n}`,
      `${SUITS[c.suit].name} suit${c.bridged ? " (bridged)" : ` · paired with ${c.q}`}`,
      `Curve ${(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}%${l.g ? " (graduated)" : ""} -> rank ${RANK_LABEL(c.rank)}`,
      `Price ${ch} · ${l.k} trades/24h · ${l.h} holders · ${ageS} old`,
    ];
    if (c.enh) lines.push(`${ENH[c.enh].name}: ${ENH[c.enh].text}`);
    if (run.debuffed(c)) lines.push("Debuffed by the boss: scores nothing");
    lines.push("Hold the card for the full launch card");
    return { title: `${RANK_LABEL(c.rank)} · $${l.s}`, body: lines.join("\n") };
  }

  cardTip(v: CardView) {
    const { title, body } = this.cardText(v.card);
    this.tipPinned = false;
    this.tip.hide();
    const at = this.tipAt(v);
    this.tip.show(title, body, at.x, at.y - 10, { w: this.L.W, h: this.L.H }, SUIT_BRIGHT[v.card.suit], 330);
  }

  showInfo(c: Card | null) {
    if (this.L.mode !== "port") return;
    if (!c) {
      this.info.text = "";
      return;
    }
    const { title, body } = this.cardText(c);
    const parts = body.split("\n");
    this.info.text = `${title} · ${parts[0]}\n${parts.slice(1).join(" · ")}`;
  }

  tapCard(v: CardView) {
    const run = this.run;
    if (!run || run.s.phase !== "round" || this.busy) return;
    if (v.parent !== this.handLayer) return;
    this.tipPinned = false;
    this.tip.hide();
    const id = v.card.id;
    const i = this.sel.indexOf(id);
    if (i >= 0) {
      this.sel.splice(i, 1);
      v.setSelected(false);
      sfx.deselect();
    } else {
      if (this.sel.length >= 5) {
        sfx.error();
        return;
      }
      this.sel.push(id);
      v.setSelected(true);
      sfx.select(v.card.rank);
    }
    this.focusCard = v.card;
    this.showInfo(v.card);
    this.layoutHandQuick();
    this.syncSelectionHud();
    this.syncButtons();
    this.hooks.onSelect(run);
  }

  layoutHandQuick() {
    const seq = this.sortedHand().filter((id) => this.views.get(id)?.parent === this.handLayer);
    seq.forEach((id, i) => {
      const v = this.views.get(id);
      if (!v) return;
      const p = this.handPos(i, seq.length);
      v.zIndex = i;
      void tween(v, { x: p.x, y: p.y + (this.sel.includes(id) ? -26 : 0), rotation: p.r }, 160, ease.outBack);
    });
  }

  toggleSort() {
    this.sortBy = this.sortBy === "rank" ? "suit" : "rank";
    this.syncButtons();
    this.layoutHandQuick();
  }

  key(e: KeyboardEvent) {
    if (!this.run || this.run.s.phase !== "round" || this.busy) return;
    if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
    if (document.querySelector(".ov-backdrop")) return;
    if (e.key === "Enter") void this.doPlay();
    else if (e.key.toLowerCase() === "x") void this.doDiscard();
    else if (e.key.toLowerCase() === "s") this.toggleSort();
  }

  // ================================================================ actions
  act(a: Action): boolean {
    const run = this.run;
    if (!run) return false;
    try {
      run.apply(a);
    } catch (err) {
      sfx.error();
      this.toastMsg(String((err as Error).message || err));
      return false;
    }
    this.hooks.onAction(a, run);
    return true;
  }

  async doPlay() {
    const run = this.run;
    if (!run || this.busy || run.s.phase !== "round") return;
    if (this.sel.length < run.minPlay()) {
      sfx.error();
      this.toastMsg(run.bossNow() === "lockup" ? "Lockup: play exactly 5 cards" : "Select cards first");
      return;
    }
    const ids = this.sel.slice();
    const pre = { score: run.s.score };
    if (!this.act({ t: "play", c: ids })) return;
    const sc = run.lastScored!;
    const drawn = run.lastDrawn.slice();
    this.busy = true;
    this.sel = [];
    this.tip.hide();
    this.syncButtons();
    try {
      await this.animatePlay(sc, pre.score);
      const s = run.s;
      if (s.phase === "round") {
        this.syncHud();
        await this.syncHand(drawn);
      } else if (s.phase === "cashout" || s.phase === "won") {
        await this.roundWon();
      } else if (s.phase === "over") {
        sfx.lose();
        this.heat = 0;
        await wait(500);
        this.syncHud();
        this.hooks.onOver(run);
      }
    } finally {
      this.busy = false;
      this.syncHud();
    }
  }

  async doDiscard() {
    const run = this.run;
    if (!run || this.busy || run.s.phase !== "round") return;
    const ids = this.sel.slice();
    if (!ids.length) return;
    if (!this.act({ t: "disc", c: ids })) return;
    const drawn = run.lastDrawn.slice();
    this.busy = true;
    this.sel = [];
    this.syncButtons();
    sfx.whoosh();
    const L = this.L;
    await Promise.all(
      ids.map(async (id, i) => {
        const v = this.views.get(id);
        if (!v) return;
        await wait(i * 40);
        await tween(v, { x: L.W + 200, y: v.y - 120, rotation: 0.6 }, 320, ease.inCubic);
        v.destroy({ children: true });
        this.views.delete(id);
      }),
    );
    this.syncHud();
    await this.syncHand(drawn);
    this.busy = false;
    this.syncHud();
  }

  async doUse(i: number) {
    const run = this.run;
    if (!run || this.busy) return;
    const id = run.s.moves[i];
    const d = MOVE[id];
    const ids = d.min === 0 ? [] : this.sel.slice();
    const before = new Set(run.s.hand);
    if (!this.act({ t: "use", i, c: ids })) return;
    this.tip.hide();
    sfx.xmult();
    this.heat = Math.min(1, this.heat + 0.3);
    // refresh affected cards
    if (id === "burn") {
      for (const cid of ids) {
        const v = this.views.get(cid);
        if (v) {
          await tween(v, { alpha: 0 }, 260);
          v.destroy({ children: true });
          this.views.delete(cid);
        }
      }
    }
    for (const cid of ids) {
      const v = this.views.get(cid);
      if (v) {
        v.card = run.card(cid);
        v.redraw();
        v.scale.set(this.L.handScale * 1.25);
        void tween(v.scale, { x: this.L.handScale, y: this.L.handScale }, 300, ease.outBack);
      }
    }
    this.sel = this.sel.filter((x) => run.s.hand.includes(x));
    for (const v of this.views.values()) v.setSelected(this.sel.includes(v.card.id));
    const added = run.s.hand.filter((x) => !before.has(x));
    this.syncInsiders();
    this.syncHud();
    if (run.s.phase === "round") await this.syncHand(added);
    if (run.s.phase === "shop") this.showStage();
  }

  // ================================================================ scoring animation
  private floatText(text: string, x: number, y: number, color: number, size = 30) {
    const t = txt(text, { fontFamily: NUM, fontSize: size, fill: color, stroke: { color: COL.ink, width: 6 } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.4);
    this.fxLayer.addChild(t);
    void (async () => {
      await tween(t.scale, { x: 1, y: 1 }, 160, ease.outBack);
      await wait(220);
      await tween(t, { y: y - 30, alpha: 0 }, 380, ease.inCubic);
      t.destroy();
    })();
  }

  private burst(x: number, y: number, color: number, n = 14) {
    if (reduced()) return;
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const g = new Graphics().rect(-4, -4, 8, 8).fill(color);
      g.position.set(x, y);
      this.fxLayer.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, life: 500 + Math.random() * 400 });
    }
  }

  private jiggle(c: Container, base: number) {
    c.scale.set(base * 1.22);
    c.rotation = (Math.random() - 0.5) * 0.25;
    void tween(c.scale, { x: base, y: base }, 240, ease.outBack);
    void tween(c, { rotation: 0 }, 260, ease.outBack);
  }

  async animatePlay(sc: Scored, scoreBefore: number) {
    const run = this.run!;
    const L = this.L;
    const n = sc.played.length;
    const ps = L.playScale;
    const gap = Math.min(CW * ps + 14, (L.stage.w - 40) / Math.max(1, n));
    sfx.whoosh();
    // move played cards to the table
    const played = sc.played
      .map((id) => this.views.get(id))
      .filter((v): v is CardView => !!v)
      .sort((a, b) => a.x - b.x);
    for (const v of played) {
      v.setSelected(false);
      this.handLayer.removeChild(v);
      this.playLayer.addChild(v);
      v.hover = 0;
      v.body.y = 0;
    }
    await Promise.all(
      played.map((v, i) => tween(v, { x: L.playX - ((n - 1) * gap) / 2 + i * gap, y: L.playY, rotation: 0 }, 260, ease.outCubic).then(() => tween(v.scale, { x: ps, y: ps }, 120))),
    );
    this.layoutHandQuick();
    // non-scoring cards dim
    for (const v of played) if (!sc.scoring.includes(v.card.id)) v.alpha = 0.55;
    // scoring cards lift
    await Promise.all(played.filter((v) => sc.scoring.includes(v.card.id)).map((v) => tween(v, { y: L.playY - 24 }, 140, ease.outBack)));
    let chips = 0;
    let mult = 0;
    let stepNo = 0;
    const base = sc.steps[0];
    chips = base.chips || 0;
    mult = base.mult || 0;
    this.handName.text = HAND[sc.hand].name;
    this.handLevel.text = `level ${sc.level}`;
    this.chipsBox.set(fmt(chips), true);
    this.multBox.set(fmtMult(mult), true);
    sfx.chip(0);
    await wait(260);
    const steps = sc.steps.slice(1);
    for (const st of steps) {
      const delay = Math.max(90, 300 * Math.pow(SPEED_STEP, stepNo));
      stepNo++;
      const anchor = this.stepAnchor(st);
      if (st.kind === "debuff") {
        if (anchor) {
          this.floatText("Debuffed", anchor.x, anchor.y - 40, COL.bad, 26);
          this.jiggle(anchor.view, anchor.base);
        }
        sfx.error();
        await wait(delay);
        continue;
      }
      if (anchor) this.jiggle(anchor.view, anchor.base);
      if (st.chips) {
        chips += st.chips;
        this.chipsBox.set(fmt(chips), true);
        if (anchor) this.floatText(`+${st.chips}`, anchor.x, anchor.y - 40, COL.chips);
        sfx.chip(stepNo);
      }
      if (st.mult) {
        mult += st.mult;
        this.multBox.set(fmtMult(mult), true);
        if (anchor) this.floatText(`+${st.mult} Mult`, anchor.x, anchor.y - (st.chips ? 74 : 40), COL.mult);
        sfx.mult(stepNo);
      }
      if (st.xmult) {
        mult *= st.xmult;
        this.multBox.set(fmtMult(mult), true);
        if (anchor) this.floatText(`X${fmtMult(st.xmult)}`, anchor.x, anchor.y - 44, COL.mult, 40);
        sfx.xmult();
        this.shake = Math.min(1, this.shake + 0.35);
        this.heat = Math.min(1, this.heat + 0.15);
      }
      if (st.label && anchor && !st.chips && !st.mult && !st.xmult) this.floatText(st.label, anchor.x, anchor.y - 40, COL.cream, 24);
      await wait(delay);
    }
    // final
    this.chipsBox.set(fmt(sc.chips));
    this.multBox.set(fmtMult(sc.mult));
    await wait(160);
    const total = sc.total;
    const big = total >= run.s.target * 0.5;
    const tt = txt(sc.zeroed ? "0" : fmt(total), { fontFamily: NUM, fontSize: 92, fill: COL.cream, stroke: { color: COL.mult, width: 10 } });
    tt.anchor.set(0.5);
    tt.position.set(L.playX, L.playY - (L.mode === "port" ? 150 : 170));
    tt.scale.set(0.2);
    this.fxLayer.addChild(tt);
    sfx.total(big);
    this.shake = Math.min(1.2, 0.4 + Math.log10(Math.max(10, total)) / 8);
    this.heat = Math.min(1, this.heat + 0.25 + (big ? 0.35 : 0));
    this.burst(L.playX, L.playY - 120, COL.money, big ? 26 : 12);
    if (sc.zeroed) this.floatText(sc.zeroed, L.playX, L.playY - 90, COL.bad, 26);
    await tween(tt.scale, { x: 1, y: 1 }, 320, ease.outBack);
    // count into round score
    const from = scoreBefore;
    const to = scoreBefore + total;
    const counter = { v: from };
    const tick = setInterval(() => {
      this.scoreText.text = fmt(counter.v);
    }, 30);
    await tween(counter, { v: to }, 520, ease.outCubic);
    clearInterval(tick);
    this.scoreText.text = fmt(to);
    this.scoreText.scale.set(1.25);
    void tween(this.scoreText.scale, { x: 1, y: 1 }, 260, ease.outBack);
    await tween(tt, { alpha: 0, y: tt.y - 30 }, 300);
    tt.destroy();
    // clear the table
    sfx.whoosh();
    await Promise.all(
      played.map(async (v, i) => {
        await wait(i * 35);
        await tween(v, { x: L.W + 220, y: v.y - 80, rotation: 0.5 }, 300, ease.inCubic);
        v.destroy({ children: true });
        this.views.delete(v.card.id);
      }),
    );
    this.chipsBox.set("0");
    this.multBox.set("0");
  }

  private stepAnchor(st: Step): { x: number; y: number; view: Container; base: number } | null {
    if (st.kind === "insider" && st.ins !== undefined) {
      const v = this.insViews[st.ins];
      if (!v) return null;
      return { x: v.x, y: v.y + (CH * this.L.insScale) / 2 + 60, view: v, base: this.L.insScale };
    }
    if (st.card !== undefined) {
      const v = this.views.get(st.card);
      if (!v) return null;
      return { x: v.x, y: v.y - (CH * this.L.playScale) / 2 + 20, view: v, base: this.L.playScale };
    }
    return null;
  }

  async roundWon() {
    const run = this.run!;
    const L = this.L;
    sfx.clear();
    this.heat = 1;
    const won = run.s.phase === "won";
    const banner = txt(won ? "ALL 8 ANTES CLEARED" : "BLIND CLEARED", { fontFamily: NUM, fontSize: L.mode === "port" ? 64 : 84, fill: COL.money, stroke: { color: COL.ink, width: 10 } });
    banner.anchor.set(0.5);
    banner.position.set(L.playX, L.playY);
    banner.scale.set(0.2);
    this.fxLayer.addChild(banner);
    this.burst(L.playX - 200, L.playY, COL.chips, 20);
    this.burst(L.playX + 200, L.playY, COL.mult, 20);
    await tween(banner.scale, { x: 1, y: 1 }, 380, ease.outElastic);
    await wait(700);
    await tween(banner, { alpha: 0 }, 260);
    banner.destroy();
    // discard the rest of the hand
    for (const v of [...this.views.values()]) {
      void tween(v, { y: L.H + 200 }, 300, ease.inCubic).then(() => v.destroy({ children: true }));
    }
    await wait(320);
    this.views.clear();
    this.syncHud();
    if (won) this.hooks.onOver(run);
    else this.showStage();
  }

  // ================================================================ stage panels: blind select, cashout, shop
  showStage() {
    const run = this.run;
    this.stageLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!run) return;
    const ph = run.s.phase;
    this.insLayer.visible = true;
    this.deckPile.visible = ph === "round";
    this.info.visible = this.L.mode === "port" && ph === "round";
    if (ph === "blind") this.blindPanel();
    else if (ph === "cashout") this.cashPanel();
    else if (ph === "shop") this.shopPanel();
    this.syncButtons();
  }

  private stageBox(h: number, title: string, color: number): { c: Container; w: number; x: number; y: number } {
    const L = this.L;
    const st = L.stage;
    const w = Math.min(st.w, L.mode === "port" ? st.w : 1000);
    const x = st.x + (st.w - w) / 2;
    const y = L.mode === "port" ? st.y : st.y + Math.max(0, (st.h - h) / 2 - 30);
    const c = new Container();
    c.position.set(x, y);
    const p = panel(w, h, COL.ink2, color);
    c.addChild(p);
    const t = txt(title, { fontFamily: NUM, fontSize: 46, fill: color, stroke: { color: COL.ink, width: 6 } });
    t.anchor.set(0.5, 0);
    t.position.set(w / 2, 10);
    c.addChild(t);
    this.stageLayer.addChild(c);
    c.alpha = 0;
    c.y += 30;
    void tween(c, { alpha: 1, y }, 260, ease.outCubic);
    return { c, w, x, y };
  }

  blindPanel() {
    const run = this.run!;
    const s = run.s;
    const port = this.L.mode === "port";
    const h = port ? 560 : 560;
    const { c, w } = this.stageBox(h, `ANTE ${s.ante}`, COL.money);
    const tw = (w - 48 - 2 * 16) / 3;
    for (let b = 0; b < 3; b++) {
      const x = 24 + b * (tw + 16);
      const y = 76;
      const th = h - 100;
      const cur = b === s.blind;
      const done = b < s.blind;
      const bossId = s.bosses[s.ante - 1];
      const boss = b === 2 ? BOSS[bossId] : null;
      const col = b === 0 ? COL.chips : b === 1 ? COL.money : COL.mult;
      const tile = panel(tw, th, cur ? COL.panelHi : COL.ink, cur ? col : COL.edge);
      tile.position.set(x, y);
      c.addChild(tile);
      const name = txt(boss ? boss.name : BLIND_NAME[b], { fontSize: port ? 19 : 24, fontWeight: "700", fill: col, align: "center", wordWrap: true, wordWrapWidth: tw - 16 });
      name.anchor.set(0.5, 0);
      name.position.set(x + tw / 2, y + 14);
      c.addChild(name);
      // chip emblem
      const em = new Graphics();
      em.circle(0, 0, port ? 34 : 44).fill(col).stroke({ width: 5, color: COL.ink });
      em.circle(0, 0, port ? 22 : 30).stroke({ width: 4, color: COL.cream, alpha: 0.6 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        em.rect(Math.cos(a) * (port ? 28 : 37) - 3, Math.sin(a) * (port ? 28 : 37) - 3, 6, 6).fill(COL.cream);
      }
      em.position.set(x + tw / 2, y + (port ? 96 : 110));
      c.addChild(em);
      const tl = txt("Score at least", { fontSize: 14, fill: COL.dim });
      tl.anchor.set(0.5, 0);
      tl.position.set(x + tw / 2, y + (port ? 142 : 170));
      const tv = txt(fmt(targetFor(s.ante, b, bossId)), { fontFamily: NUM, fontSize: port ? 36 : 44, fill: COL.mult });
      tv.anchor.set(0.5, 0);
      tv.position.set(x + tw / 2, y + (port ? 160 : 190));
      const rw = txt(`Reward $${BLIND_REWARD[b]}`, { fontSize: 16, fill: COL.money, fontWeight: "700" });
      rw.anchor.set(0.5, 0);
      rw.position.set(x + tw / 2, y + (port ? 206 : 244));
      c.addChild(tl, tv, rw);
      if (boss) {
        const bt = txt(boss.text, { fontSize: port ? 14 : 16, fill: COL.cream, align: "center", wordWrap: true, wordWrapWidth: tw - 20 });
        bt.anchor.set(0.5, 0);
        bt.position.set(x + tw / 2, y + (port ? 234 : 274));
        // keep the whole rule inside the tile, clear of the Play button / status line
        const room = y + th - (cur ? 92 : 78) - bt.y;
        if (bt.height > room) bt.scale.set(Math.max(0.6, room / bt.height));
        c.addChild(bt);
      }
      if (cur) {
        const btn = new Button("Play", Math.min(tw - 24, 180), 64, COL.play, () => this.doGo(), { size: 26 });
        btn.position.set(x + tw / 2, y + th - 52);
        c.addChild(btn);
      } else {
        const st = txt(done ? "CLEARED" : "UP NEXT", { fontFamily: NUM, fontSize: 30, fill: done ? COL.good : COL.dim });
        st.anchor.set(0.5);
        st.position.set(x + tw / 2, y + th - 50);
        c.addChild(st);
      }
    }
  }

  doGo() {
    const run = this.run;
    if (!run || this.busy) return;
    if (!this.act({ t: "go" })) return;
    this.sel = [];
    this.stageLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const boss = run.bossDef();
    if (boss) {
      setSwirlColors(this.swirl, 0x2e0612, 0x3d0b1c, 0xb3123f);
      this.heat = 0.6;
    } else setSwirlColors(this.swirl, 0x3a0a2c, 0x0e5257, 0xb01a66);
    this.showStage();
    this.syncHud();
    void this.syncHand(run.s.hand);
  }

  cashPanel() {
    const run = this.run!;
    const co = run.s.cashout;
    if (!co) return;
    setSwirlColors(this.swirl, 0x3a0a2c, 0x0e5257, 0xb01a66);
    const port = this.L.mode === "port";
    const h = port ? 470 : 430;
    const { c, w } = this.stageBox(h, "CASH OUT", COL.money);
    const rows: [string, number][] = [["Blind reward", co.reward]];
    if (co.handsLeft) rows.push([`Hands left (${co.handsLeft} x $1)`, co.handsLeft]);
    if (co.interest) rows.push([`Interest ($1 per $5 held, max $5)`, co.interest]);
    if (co.extra) rows.push(["Market Maker", co.extra]);
    rows.forEach(([k, v], i) => {
      const y = 90 + i * 52;
      const a = txt(k, { fontSize: port ? 20 : 22, fill: COL.cream });
      a.position.set(40, y);
      const b = txt(`$${v}`, { fontFamily: NUM, fontSize: 40, fill: COL.money });
      b.anchor.set(1, 0);
      b.position.set(w - 40, y - 8);
      c.addChild(a, b);
      a.alpha = 0;
      b.alpha = 0;
      void wait(i * 180).then(() => {
        sfx.coin();
        void tween(a, { alpha: 1 }, 150);
        void tween(b, { alpha: 1 }, 150);
      });
    });
    const btn = new Button(`Cash out $${co.total}`, Math.min(w - 60, 380), 76, COL.money, () => this.doCash(), { size: 28 });
    btn.caption.style.fill = COL.ink;
    btn.position.set(w / 2, h - 60);
    c.addChild(btn);
  }

  doCash() {
    if (!this.act({ t: "cash" })) return;
    sfx.coin();
    this.syncHud();
    this.showStage();
  }

  shopPanel() {
    const run = this.run!;
    const s = run.s;
    const port = this.L.mode === "port";
    const h = port ? Math.min(this.L.stage.h - 10, 660) : 520;
    const { c, w } = this.stageBox(h, "SHOP", COL.chips);
    const money = txt(`You have $${s.money}`, { fontSize: 20, fill: COL.money, fontWeight: "700" });
    money.anchor.set(0.5, 0);
    money.position.set(w / 2, 62);
    c.addChild(money);
    const n = s.offers.length;
    const sc = port ? 1.2 : 1.12;
    const step = Math.min((w - 40) / n, CW * sc + 40);
    const y0 = port ? 110 + (CH * sc) / 2 : 120 + (CH * sc) / 2;
    const descBox = txt("Tap an item to read it. Insiders change how hands score; Alpha leaks level up a hand; Moves are one-shot tricks.", {
      fontSize: port ? 16 : 17,
      fill: COL.cream2,
      align: "center",
      wordWrap: true,
      wordWrapWidth: w - 60,
      lineHeight: 22,
    });
    descBox.anchor.set(0.5, 0);
    descBox.position.set(w / 2, y0 + (CH * sc) / 2 + 74);
    c.addChild(descBox);
    s.offers.forEach((o, i) => {
      const x = w / 2 - ((n - 1) * step) / 2 + i * step;
      let v: Container;
      if (o.kind === "insider") v = new InsiderView(o.id);
      else v = new ItemView(o.kind, o.id);
      v.scale.set(sc);
      v.position.set(x, y0);
      if (o.sold) v.alpha = 0.25;
      c.addChild(v);
      const desc = () => {
        if (o.kind === "insider") {
          const d = INSIDER[o.id];
          return `${d.name} (${RARITY_NAME[d.rarity]} insider): ${d.text}`;
        }
        if (o.kind === "alpha") {
          const hd = HAND[o.id as HandId];
          const lv = s.levels[o.id as HandId];
          const now = run.handValue(o.id as HandId);
          return `Alpha leak: ${hd.name} (${hd.rule}). Level ${lv} -> ${lv + 1}: ${now.chips} x ${now.mult} becomes ${now.chips + hd.upChips} x ${now.mult + hd.upMult}.`;
        }
        return `${MOVE[o.id].name} (move): ${MOVE[o.id].text}`;
      };
      v.on("pointertap", () => {
        descBox.text = desc();
        sfx.tick();
      });
      v.on("pointerover", (e) => {
        if (e.pointerType === "mouse") descBox.text = desc();
      });
      const full = (o.kind === "insider" && s.insiders.length >= MAX_INSIDERS) || (o.kind === "move" && s.moves.length >= MAX_MOVES);
      const b = new Button(o.sold ? "Sold" : `$${o.cost}`, Math.min(step - 14, 120), 52, COL.money, () => this.doBuy(i), { size: 24 });
      b.caption.style.fill = COL.ink;
      b.position.set(x, y0 + (CH * sc) / 2 + 36);
      b.setEnabled(!o.sold && s.money >= o.cost && !full);
      c.addChild(b);
    });
    const by = h - 52;
    const roll = new Button(`Reroll $${run.rerollCost()}`, port ? 250 : 240, 66, COL.mult, () => this.doRoll(), { size: 22 });
    roll.position.set(w / 2 - (port ? 140 : 150), by);
    roll.setEnabled(s.money >= run.rerollCost());
    const next = new Button("Next blind", port ? 250 : 240, 66, COL.play, () => this.doNext(), { size: 22 });
    next.position.set(w / 2 + (port ? 140 : 150), by);
    c.addChild(roll, next);
  }

  doBuy(i: number) {
    const run = this.run!;
    const o = run.s.offers[i];
    if (!this.act({ t: "buy", i })) return;
    sfx.coin();
    this.heat = Math.min(1, this.heat + 0.2);
    if (o.kind === "alpha") this.toastMsg(`${HAND[o.id as HandId].name} is now level ${run.s.levels[o.id as HandId]}`);
    this.syncInsiders();
    this.syncHud();
    this.showStage();
    const last = o.kind === "insider" ? this.insViews[this.insViews.length - 1] : o.kind === "move" ? this.movViews[this.movViews.length - 1] : null;
    if (last) {
      this.jiggle(last, last.scale.x);
      this.burst(last.x, last.y, COL.money, 12);
    }
  }
  doRoll() {
    if (!this.act({ t: "roll" })) return;
    sfx.whoosh();
    this.syncHud();
    this.showStage();
  }
  doNext() {
    if (!this.act({ t: "next" })) return;
    this.syncHud();
    this.showStage();
  }

  /** Coach helper: the best play in hand right now. */
  hint(): number[] {
    if (!this.run || this.run.s.phase !== "round") return [];
    return bestPlay(this.run).ids;
  }
  selectIds(ids: number[]) {
    this.sel = ids.slice(0, 5);
    for (const v of this.views.values()) v.setSelected(this.sel.includes(v.card.id));
    this.layoutHandQuick();
    this.syncSelectionHud();
    this.syncButtons();
  }
  pulse(ids: number[]) {
    for (const id of ids) {
      const v = this.views.get(id);
      if (v) this.jiggle(v, v.scale.x);
    }
  }
}
