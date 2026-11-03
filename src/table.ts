// Table space: the flat table the game draws in, before it is scaled into its area (and turned upright on phones).
// Shared by the table (game.ts) and its layers: the stands (crowd.ts), the desk (desk.ts), the boss rules (rules.ts)
// and the replay (replay.ts).
import { LANES } from "../shared/content.js";

export const TX0 = 70; // your goal line
export const TX1 = 930; // theirs
export const LH = 47; // one lane
/** The far rail is deep: on a wide screen the desk's wire runs along it. */
export const RAIL_T = 40;
export const RAIL = 22;
/** Top edge of lane 0. Above it: the far rail, their handles and the stands. */
export const LANE0 = 104;
export const PITCH_H = LANES * LH;
/** The cabinet's outer edge, top and bottom. */
export const CAB_T = LANE0 - RAIL_T - 12;
export const CAB_B = LANE0 + PITCH_H + RAIL + 12;
/** Where your rods leave the cabinet. */
export const HANDLE_Y = LANE0 + PITCH_H + RAIL;
/** Your handles: the slide buttons sit on the rod end. */
export const CTRL_Y = HANDLE_Y + 6;
export const TS_W = 1000;
export const TS_H = CTRL_Y + 58 * 2 + 46;
/** The stands above the far rail. */
export const STAND_T = 46;
/** On a phone the desk sits across the far end of the table, past their goal. */
export const DESK_P = 46;

export const colX = (x: number) => TX0 + (x * (TX1 - TX0)) / 9;
export const laneY = (l: number) => LANE0 + (l + 0.5) * LH;

/** Continuous mirror of a lane off the side walls (walls sit half a lane outside lanes 0 and 9). */
export function mirror(v: number): number {
  const p = 2 * LANES;
  const m = (((v + 0.5) % p) + p) % p;
  return m < LANES ? m - 0.5 : p - 0.5 - m;
}
