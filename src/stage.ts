// The stage between matches: match day, full time and the dressing room. Since 3.0 they are HTML screens
// (src/screens.tsx) laid over the table's panel area: drawStage works out where that area is on the screen and hands
// it, with the host, to the store. Everything they do goes back through the StageHost (the table owns the run).
// src/game.ts builds the host and calls drawStage.
import { Container, Graphics } from "pixi.js";
import type { Run } from "../shared/engine.js";
import { hash32 } from "../shared/rng.js";
import { setUi, ui } from "./store.js";
import { hslHex } from "./figures.js";
import { COL } from "./theme.js";

/** What a stage panel needs from the table: the run, where to draw, and the actions behind its buttons. */
export interface StageHost {
  readonly run: Run;
  /** The panel area, in root units. */
  readonly area: { x: number; y: number; w: number; h: number };
  /** Phone layout (the table stands upright). */
  readonly port: boolean;
  /** The container the panels go in; the host clears it before each draw. */
  readonly layer: Container;
  /** Kick off the current fixture (a boss club gets its intro first). */
  go(): void;
  /** From match day back to the dressing room. */
  back(): void;
  /** Collect the full-time fans. */
  collect(): void;
  /** Buy shelf item `i`. */
  buy(i: number): void;
  /** From the dressing room to match day. */
  next(): void;
  /** Open the line-up overlay. */
  lineup(): void;
}

let draws = 0;

/**
 * Shows the screen for the run's phase (match day, full time or the dressing room) over the panel area; any other
 * phase takes it away. The canvas draws only a soft shadow under it, so the table's frame still reads around it.
 */
export function drawStage(st: StageHost) {
  const ph = st.run.s.phase;
  if (ph !== "fixture" && ph !== "fulltime" && ph !== "room") {
    if (ui.stage) setUi({ stage: null });
    return;
  }
  // on a wide screen the band under the table (its handles and Ready) is empty between matches: the screen takes it
  const a = st.port ? st.area : { ...st.area, h: st.area.h + 84 };
  const p0 = st.layer.toGlobal({ x: a.x, y: a.y });
  const p1 = st.layer.toGlobal({ x: a.x + a.w, y: a.y + a.h });
  const shade = new Graphics().roundRect(a.x + 6, a.y + 10, a.w, a.h, 18).fill({ color: 0x000000, alpha: 0.35 });
  st.layer.addChild(shade);
  setUi({
    stage: {
      phase: ph,
      rect: { x: Math.round(p0.x), y: Math.round(p0.y), w: Math.round(p1.x - p0.x), h: Math.round(p1.y - p0.y) },
      port: st.port,
      host: st,
      n: ++draws,
    },
  });
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
