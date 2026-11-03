// The instant replay: the season's best goal, redrawn on the table from its recorded path (RunState.best).
// Nothing is re-simulated: the path is the engine's own record of the move, one segment per kick.
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { BestGoal } from "../shared/engine.js";
import { FR, tokenTexture, txt } from "./figures.js";
import { COL, NUM } from "./theme.js";
import { ease, reduced, tween, wait } from "./tween.js";
import { LANE0, PITCH_H, TX0, TX1, colX, laneY } from "./table.js";

export interface ReplayHost {
  /** A layer over the table, cleared by the replay when it ends. */
  layer: Container;
  /** Turns text upright on a standing table. */
  upright(o: Container): void;
  /** Kit colours for the trail and the heads. */
  kit: { main: number; hi: number };
  /** Called at the moment the ball crosses the line. */
  onGoal?(): void;
  /** True to cut the replay short (a tap). */
  skip(): boolean;
}

/** Plays a best goal on the table and resolves when it is done (or skipped). */
export async function playPath(host: ReplayHost, best: BestGoal): Promise<void> {
  const L = host.layer;
  L.removeChildren().forEach((c) => c.destroy({ children: true }));
  L.visible = true;
  L.alpha = 1;
  const dim = new Graphics().rect(TX0 - 64, LANE0 - 12, TX1 - TX0 + 128, PITCH_H + 24).fill({ color: 0x05020a, alpha: 0.62 });
  L.addChild(dim);
  // the REPLAY tag, in a corner of the felt
  const tag = new Container();
  const tg = new Graphics().roundRect(-6, -20, 196, 40, 8).fill({ color: COL.ink, alpha: 0.92 }).stroke({ width: 2, color: COL.bad });
  const dot = new Graphics().circle(14, 0, 7).fill(COL.bad);
  const tt = txt("REPLAY", { fontFamily: NUM, fontSize: 28, fill: COL.cream, letterSpacing: 3 });
  tt.anchor.set(0, 0.5);
  tt.position.set(30, 0);
  tag.addChild(tg, dot, tt);
  host.upright(tag);
  tag.position.set(TX0 + 24, LANE0 + 36);
  L.addChild(tag);
  const style = txt(`${best.style} · ${best.total.toLocaleString("en-US")}`, { fontFamily: NUM, fontSize: 30, fill: COL.money, stroke: { color: COL.ink, width: 6 } });
  style.anchor.set(0.5);
  host.upright(style);
  style.position.set((TX0 + TX1) / 2, LANE0 + PITCH_H - 34);
  style.alpha = 0;
  L.addChild(style);
  const line = new Graphics();
  L.addChild(line);
  const heads = new Container();
  L.addChild(heads);
  const ball = new Graphics();
  ball.circle(3, 4, 13).fill({ color: 0x000000, alpha: 0.4 });
  ball.circle(0, 0, 13).fill(0xfff6e6).stroke({ width: 2.5, color: COL.ink });
  ball.circle(-4, -4, 4).fill({ color: 0xffffff, alpha: 0.9 });
  L.addChild(ball);
  const rm = reduced();
  const segs = best.path.filter((s) => s.length > 0);
  const P = (s: { x: number; lane: number }) => ({ x: colX(s.x), y: laneY(s.lane) });
  // the kicker of each segment: a head where the kick was taken
  segs.forEach((seg, i) => {
    const f = best.figs[Math.min(i, best.figs.length - 1)];
    const at = P(seg[0]);
    const h = new Container();
    const ring = new Graphics().circle(0, 0, FR + 3).fill(COL.ink).stroke({ width: 3, color: host.kit.hi });
    h.addChild(ring);
    if (f) {
      const sp = new Sprite(Texture.EMPTY);
      sp.anchor.set(0.5);
      sp.width = sp.height = (FR - 2) * 2;
      const mask = new Graphics().circle(0, 0, FR - 2).fill(0xffffff);
      sp.mask = mask;
      h.addChild(sp, mask);
      tokenTexture(f.c, f.s, (t) => {
        if (!sp.destroyed) {
          sp.texture = t;
          sp.width = sp.height = (FR - 2) * 2;
        }
      });
      const lb = txt("$" + f.s.slice(0, 6), { fontSize: 12, fill: COL.cream, stroke: { color: COL.ink, width: 4 } });
      lb.anchor.set(0.5, 0);
      lb.position.set(0, FR + 4);
      h.addChild(lb);
    }
    host.upright(h);
    h.position.set(at.x, at.y);
    h.scale.set(0);
    heads.addChild(h);
  });
  let last = P(segs[0]?.[0] || { x: 1, lane: 4.5 });
  ball.position.set(last.x, last.y);
  for (let i = 0; i < segs.length; i++) {
    if (host.skip()) break;
    const seg = segs[i];
    const head = heads.children[i];
    if (head) void tween(head.scale, { x: 1, y: 1 }, 200, ease.outBack);
    await wait(rm ? 0 : 160);
    const shot = i === segs.length - 1;
    const pts = seg.map(P);
    if (shot) {
      const e = pts[pts.length - 1];
      pts.push({ x: e.x + 40, y: e.y });
    }
    // the ball runs the segment; the shot's last steps go slow
    for (let j = 1; j < pts.length; j++) {
      if (host.skip()) break;
      const a = pts[j - 1];
      const b = pts[j];
      const slow = shot && j >= pts.length - 3;
      const ms = rm ? 0 : slow ? 200 : 70;
      // bounce marks where the lane turns back off a wall
      if (j >= 2) {
        const p0 = pts[j - 2];
        if (Math.sign(a.y - p0.y) !== Math.sign(b.y - a.y) && Math.abs(b.y - a.y) > 1 && Math.abs(a.y - p0.y) > 1) line.circle(a.x, a.y, 7).stroke({ width: 3, color: COL.cyan });
      }
      line.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 6, color: COL.money, alpha: 0.9, cap: "round" });
      if (ms) await tween(ball, { x: b.x, y: b.y }, ms, ease.linear);
      else ball.position.set(b.x, b.y);
      last = b;
    }
  }
  // complete whatever a skip left undrawn, so the picture is whole
  for (const seg of segs) {
    const pts = seg.map(P);
    for (let j = 1; j < pts.length; j++) line.moveTo(pts[j - 1].x, pts[j - 1].y).lineTo(pts[j].x, pts[j].y);
  }
  line.stroke({ width: 6, color: COL.money, alpha: 0.9, cap: "round" });
  for (const h of heads.children) h.scale.set(1);
  host.onGoal?.();
  const fl = new Graphics().rect(TX1, laneY(3.5), 50, 2 * 47).fill({ color: COL.money, alpha: 0.6 });
  L.addChild(fl);
  void tween(fl, { alpha: 0 }, 600);
  void tween(style, { alpha: 1 }, 200);
  if (!host.skip()) await wait(rm ? 600 : 1300);
  await tween(L, { alpha: 0 }, rm ? 60 : 260);
  L.removeChildren().forEach((c) => c.destroy({ children: true }));
  L.visible = false;
  L.alpha = 1;
  void last;
}
