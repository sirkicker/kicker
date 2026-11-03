// How this run's rules name its fixtures and pay for them: shared by the table (game.ts) and the screens.
import { DRAW_FANS_R3, MATCHDAYS, WIN_FANS, WIN_FANS_R3, fixtureName } from "../shared/content.js";
import type { Run } from "../shared/engine.js";

/** A fixture's name: League match / Cup tie / Final in a rules-3 season; Friendly / League match / Boss club in the Daily and a 2.1 season. */
export function fixtureLabel(run: Run, kind: number, round = run.s.round): string {
  if (run.mode === "haunt") return ["Ghost friendly", "Ghost league match", "The last ghost club"][kind] || "";
  return fixtureName(kind, run.rules, run.isFinal(kind, round), run.mode);
}
/** Fans for a win in this fixture. */
export const winFansOf = (run: Run, kind: number) => (run.league ? WIN_FANS_R3[kind] : WIN_FANS[kind]);
/** Fans for a draw here: a point's worth in a rules-3 league match, else none. */
export const drawFansOf = (run: Run, kind: number) => (run.league && kind < 2 ? DRAW_FANS_R3 : 0);
/** Goals to win the fixture. */
export const targetOf = (run: Run, kind: number, round = run.s.round) => (run.bossOf(kind, round) === "bell" ? 3 : 2);
/** "matchday 5 of 14" for a league match of a rules-3 season, else null. */
export function matchdayLabel(run: Run, kind: number, round = run.s.round): string | null {
  if (!run.league || kind > 1) return null;
  return `Matchday ${(round - 1) * 2 + kind + 1} of ${MATCHDAYS}`;
}
/** "1st", "2nd"... */
export const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
