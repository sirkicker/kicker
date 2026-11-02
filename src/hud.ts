// The numbers on the HUD as a plain model: read off the engine when the table is still, and stepped event by
// event while a touch plays back, so the score, the Goals count and the touch pips never disagree mid-animation.
import type { Ev, Run } from "../shared/engine.js";

export interface Hud {
  you: number;
  them: number;
  goals: number;
  against: number;
  wins: number;
  /** What the possession panel shows: your ball, theirs, a goal being celebrated, or no match on. */
  mode: "attack" | "defend" | "goal" | "idle";
  touches: number;
  blocks: number;
  aiTouches: number;
}

export function hudOf(run: Run): Hud {
  const s = run.s;
  const m = s.match;
  const ph = s.phase;
  return {
    you: m ? m.score[0] : 0,
    them: m ? m.score[1] : 0,
    goals: s.goalsFor,
    against: s.goalsAgainst,
    wins: s.cleared,
    mode: ph === "attack" ? "attack" : ph === "defend" ? "defend" : "idle",
    touches: m && ph === "attack" ? m.touches : 0,
    blocks: m && ph === "defend" ? m.blockSlides : 0,
    aiTouches: m && ph === "defend" ? m.aiTouches : 0,
  };
}

/** One event later. Counts the engine settles after the event (touches for the next possession) read 0 until then. */
export function hudStep(h: Hud, ev: Ev): Hud {
  const n = { ...h };
  switch (ev.e) {
    case "goal":
      if (ev.side === 0) {
        n.you++;
        n.goals++;
      } else {
        n.them++;
        n.against++;
      }
      n.mode = "goal";
      n.touches = n.blocks = n.aiTouches = 0;
      break;
    case "turnover":
      n.mode = ev.to === 0 ? "attack" : "defend";
      n.touches = n.blocks = n.aiTouches = 0;
      break;
    case "kickoff":
      if (h.mode === "idle") n.you = n.them = 0;
      n.mode = ev.side === 0 ? "attack" : "defend";
      n.touches = n.blocks = n.aiTouches = 0;
      break;
    case "end":
      if (ev.won) n.wins++;
      n.mode = "idle";
      n.touches = n.blocks = n.aiTouches = 0;
      break;
    case "slide":
      if (ev.side === 0 && ev.why === "block") n.blocks = Math.max(0, n.blocks - 1);
      break;
  }
  return n;
}
