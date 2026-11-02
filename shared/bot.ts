// A plain, decent player: looks one touch ahead, expects the rival's reaction, and blocks what it can.
// Used for balance sims, tests, QA and the in-game "Show me a good touch" button.
import type { Ball, Dir, Run } from "./engine.js";
import { laneOf, slotOf, trace } from "./engine.js";
import { COACH, DRILLS, MAX_COACHES, MAX_PLAYS, PLAY, RODS } from "./content.js";

/** How promising your ball is with `touches` left. */
function value(run: Run, off: number[][], ball: Ball, touches: number, afterPass: boolean): number {
  if (touches <= 0) return -300;
  const ks = run.myKicks(off, ball, touches, afterPass);
  const shots = ks.filter((k) => k.open && k.kick.r === 4).length;
  if (shots) return 1000 + 50 * shots;
  let v = 0;
  for (const k of ks) {
    if (!k.open || k.kick.r === 4) continue;
    let pv = 200 + 40 * (k.kick.r - ball.rod);
    if (touches >= 2 && run.myKicks(off, { side: 0, rod: k.kick.r, fig: k.tr.to }, touches - 1, true).some((x) => x.open && x.kick.r === 4)) pv += 500;
    v = Math.max(v, pv);
  }
  if (touches >= 2) {
    for (const d of [-1, 1]) {
      if (!run.canMove(0, ball.rod, d, off)) continue;
      const o2 = [off[0].slice(), off[1]];
      o2[0][ball.rod] += d;
      if (run.myKicks(o2, ball, touches - 1, false).some((x) => x.open && x.kick.r === 4)) v = Math.max(v, 300);
    }
  }
  return v + 10 * ks.filter((k) => k.kick.r === 4).length + 3 * ball.rod;
}

export interface Pick {
  t: "slide" | "kick";
  r: number;
  d: Dir;
  score: number;
}

interface Node {
  pick: Pick;
  off: number[][];
  ball: Ball;
  touches: number;
  afterPass: boolean;
  terminal: number | null;
}

/** Every touch from a position, each with where the rival's rods end up after it reacts. */
function expand(run: Run, off: number[][], ball: Ball, touches: number, afterPass: boolean, dummy: boolean): Node[] {
  const m = run.m;
  const jam = m.boss === "jam";
  const react = (o: number[][], b: Ball) => (dummy ? o : run.reactTo(o, b).off);
  const out: Node[] = [];
  for (const k of run.myKicks(off, ball, touches, afterPass)) {
    const pick: Pick = { t: "kick", r: k.kick.r, d: k.kick.d, score: 0 };
    if (k.kick.r === 4) {
      // a blocked shot still ends the possession at their figure, far from your goal
      out.push({ pick, off, ball, touches, afterPass, terminal: k.open ? 100000 + k.beaten * 10 + k.tr.bounces : -350 });
      continue;
    }
    const left = touches - 1;
    let open = k.open;
    let off2 = off;
    if (jam) {
      off2 = react(off, ball);
      const lane = laneOf(ball.rod, off2[0][ball.rod], ball.fig);
      open = m.longball || trace(off2, run.pulledArr(), 0, ball.rod, lane, k.kick, 0).blockers.length === 0;
    }
    if (!open) {
      const slot = slotOf(ball.rod, ball.fig);
      const keeps = (run.stats(slot).grip && !m.gripUsed.includes(slot)) || m.saves < run.s.drills.pass;
      if (keeps) out.push({ pick, off: react(off, ball), ball, touches: left, afterPass: false, terminal: left <= 0 ? -300 : null });
      else out.push({ pick, off, ball, touches: left, afterPass, terminal: -400 });
      continue;
    }
    const nb: Ball = { side: 0, rod: k.kick.r, fig: k.tr.to };
    out.push({ pick, off: jam ? off2 : react(off, nb), ball: nb, touches: left, afterPass: true, terminal: left <= 0 ? -300 : null });
  }
  for (let r = 0; r < 4; r++) {
    for (const d of [-1, 1] as Dir[]) {
      if (!run.canMove(0, r, d, off)) continue;
      const cost = run.slideCost(r);
      if (cost > touches) continue;
      const o2 = [off[0].slice(), off[1]];
      o2[0][r] += d;
      if (m.boss === "wash") {
        const facing = [0, 3, 2, 1][r];
        if (run.canMove(1, facing, d, o2)) {
          o2[1] = o2[1].slice();
          o2[1][facing] += d;
        }
      }
      const left = touches - cost;
      out.push({ pick: { t: "slide", r, d, score: 0 }, off: left <= 0 ? o2 : react(o2, ball), ball, touches: left, afterPass: false, terminal: left <= 0 ? -300 : null });
    }
  }
  return out;
}

/** The touch this player would make now, with the ball: two touches deep, expecting the rival's reaction each time. */
export function bestTouch(run: Run): Pick | null {
  const m = run.m;
  let best: Pick | null = null;
  for (const n of expand(run, m.off, m.ball, m.touches, m.afterPass, m.dummy > 0)) {
    let score: number;
    if (n.terminal !== null) score = n.terminal;
    else {
      let deep = value(run, n.off, n.ball, n.touches, n.afterPass);
      if (n.touches >= 1) {
        for (const n2 of expand(run, n.off, n.ball, n.touches, n.afterPass, m.dummy > 1)) {
          const v2 = n2.terminal !== null ? (n2.terminal > 0 ? 1500 : n2.terminal) : value(run, n2.off, n2.ball, n2.touches, n2.afterPass);
          deep = Math.max(deep, v2 * 0.9);
        }
      }
      // a touch spent is a touch gone: a slide has to buy something
      score = deep + (n.pick.t === "kick" ? 5 : 0) - (n.pick.t === "slide" ? (run.slideCost(n.pick.r) === 0 ? 1 : 25) : 0);
    }
    if (!best || score > best.score) best = { ...n.pick, score };
  }
  return best;
}

/** The block slide this player would make now, or null to let them play. */
export function bestBlock(run: Run): { r: number; d: Dir } | null {
  const m = run.m;
  const read = run.ai().read;
  const outcome = (off: number[][]) => {
    const plan = read ? run.aiChoose(off) : m.intent;
    if (!plan || plan.kind === "slide") return 5;
    const k = run.theirKicks(off).find((x) => x.kick.r === plan.kick.r && x.kick.d === plan.kick.d);
    if (!k || !k.open) return -100;
    return k.value;
  };
  const moves: { r: number; d: Dir }[] = [];
  for (let r = 0; r < 4; r++) for (const d of [-1, 1] as Dir[]) moves.push({ r, d });
  const base = outcome(m.off);
  let best = { v: base, first: null as { r: number; d: Dir } | null };
  const depth = Math.min(2, m.blockSlides);
  const walk = (off: number[][], left: number, first: { r: number; d: Dir } | null, n: number) => {
    if (first) {
      const v = outcome(off) + n * 0.5;
      if (v < best.v - 1e-9) best = { v, first };
    }
    if (!left) return;
    for (const mv of moves) {
      if (!run.canMove(0, mv.r, mv.d, off)) continue;
      const o2 = [off[0].slice(), off[1]];
      o2[0][mv.r] += mv.d;
      walk(o2, left - 1, first || mv, n + 1);
    }
  };
  walk(m.off, depth, null, 0);
  return best.first;
}

/** One step of the bot. Returns false when the season is over. */
export function botStep(run: Run): boolean {
  const s = run.s;
  switch (s.phase) {
    case "fixture": {
      const t = s.plays.indexOf("tickets");
      if (t >= 0) run.apply({ t: "use", i: t });
      else run.apply({ t: "go" });
      return true;
    }
    case "attack": {
      const m = run.m;
      const pi = (id: string) => s.plays.indexOf(id);
      const p = bestTouch(run);
      if (pi("onetwo") >= 0 && m.touches <= 1 && (!p || p.score < 1000)) {
        run.apply({ t: "use", i: pi("onetwo") });
        return true;
      }
      if (pi("freekick") >= 0 && m.freekick === 0 && (!p || p.score < 100000) && run.myKicks().some((k) => k.kick.r === 4 && !k.open && k.tr.blockers.length === k.beaten + 1)) {
        run.apply({ t: "use", i: pi("freekick") });
        return true;
      }
      if (pi("dummy") >= 0 && m.dummy === 0 && m.boss && m.passes === 0) {
        run.apply({ t: "use", i: pi("dummy") });
        return true;
      }
      if (!p) throw new Error("the bot found no legal touch while the engine says there is one");
      run.apply(p.t === "kick" ? { t: "kick", r: p.r, d: p.d } : { t: "slide", r: p.r, d: p.d });
      return true;
    }
    case "defend": {
      const m = run.m;
      if (m.blockSlides > 0) {
        const mv = bestBlock(run);
        if (mv) {
          run.apply({ t: "slide", r: mv.r, d: mv.d });
          return true;
        }
      }
      const bus = s.plays.indexOf("bus");
      if (bus >= 0 && run.threats().some((k) => k.kick.r === 4)) {
        run.apply({ t: "use", i: bus });
        return true;
      }
      run.apply({ t: "hold" });
      return true;
    }
    case "fulltime":
      run.apply({ t: "collect" });
      return true;
    case "room": {
      const seq = s.offers
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => !o.sold && o.cost <= s.fans)
        .filter(({ o }) => (o.kind === "coach" ? s.coaches.length < MAX_COACHES : o.kind === "play" ? s.plays.length < MAX_PLAYS && PLAY[o.id].id !== "longball" : true))
        .sort((a, b) => rank(a.o) - rank(b.o) || b.o.cost - a.o.cost);
      if (seq.length) {
        run.apply({ t: "buy", i: seq[0].i });
        return true;
      }
      run.apply({ t: "next" });
      return true;
    }
    default:
      return false;
  }
}

const rank = (o: { kind: string; id: string }) => (o.kind === "coach" ? (COACH[o.id] ? 0 : 3) : o.kind === "drill" ? (DRILLS.find((d) => d.id === o.id) ? 1 : 3) : 2);

/** Plays a whole season with the bot; returns the finished run. */
export function playSeason(run: Run, maxSteps = 20000): Run {
  let n = 0;
  while (n++ < maxSteps && botStep(run));
  return run;
}

export const ROD_NAMES = RODS.map((r) => r.name);
