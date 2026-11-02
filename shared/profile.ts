// "Your table": a signed-in player's record, kept on the server as one JSON per address and updated only when a
// verified season is posted. Pure, so the server, the page and the tests merge it the same way.
import { bumpStreak, type Streak } from "./daily.js";

export interface ProfileRun {
  id: string;
  seed: string;
  edition: number;
  /** The season's best goal. */
  total: number;
  style: string;
  round: number;
  won: boolean;
  at: string;
  daily?: string;
}

export interface Profile {
  address: string;
  name: string;
  streak: Streak | null;
  /** The best goal of each UTC day, newest day first. */
  best: { day: string; id: string; total: number; style: string }[];
  /** The latest posted runs, newest first. */
  recent: ProfileRun[];
  updated: string;
}

export const PROFILE_DAYS = 30;
export const PROFILE_RECENT = 30;

export const emptyProfile = (address: string, name: string): Profile => ({ address: address.toLowerCase(), name, streak: null, best: [], recent: [], updated: "" });

/** Folds one verified season into the record. A season already in it changes nothing. Lines from before 2.0
 * (the game before 2.0, stored under the same address) carry no `style` and are left behind on the next merge. */
export function mergeProfile(p: Profile | null, address: string, name: string, run: ProfileRun): Profile {
  const own = p && p.address === address.toLowerCase() ? p : emptyProfile(address, name);
  const base: Profile = { ...own, best: own.best.filter((b) => typeof b.style === "string"), recent: own.recent.filter((r) => typeof r.style === "string") };
  if (own.recent.some((r) => r.id === run.id)) return own;
  const day = run.at.slice(0, 10);
  const recent = [run, ...base.recent].sort((a, b) => b.at.localeCompare(a.at)).slice(0, PROFILE_RECENT);
  const have = base.best.find((b) => b.day === day);
  const best =
    have && have.total >= run.total
      ? base.best
      : [...base.best.filter((b) => b.day !== day), { day, id: run.id, total: run.total, style: run.style }]
          .sort((a, b) => b.day.localeCompare(a.day))
          .slice(0, PROFILE_DAYS);
  const streak = run.daily ? bumpStreak(base.streak, run.daily) : base.streak;
  return { address: base.address, name, streak, best, recent, updated: run.at };
}
