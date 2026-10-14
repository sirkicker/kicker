// The Daily Deal: one seed per UTC day, the same for everybody, dealt from the day's pinned deck.
import { hash32 } from "./rng.js";

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hour number (deck id) of 00:00 UTC on that day. */
export const dayStartHour = (day: string) => Math.floor(Date.parse(day + "T00:00:00Z") / 3_600_000);

export const prevDay = (day: string) => utcDay(new Date(Date.parse(day + "T00:00:00Z") - 86_400_000));

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The day's seed. Pure arithmetic on the date, so anyone can check it. */
export function dailySeed(day: string): string {
  let a = hash32("kicker daily|" + day);
  let b = hash32("house deal|" + day);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += B32[a & 31];
    a >>>= 5;
  }
  for (let i = 0; i < 4; i++) {
    s += B32[b & 31];
    b >>>= 5;
  }
  return s.slice(0, 4) + "-" + s.slice(4);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-14" -> "Oct 14" */
export const dayLabel = (day: string) => `${MON[Number(day.slice(5, 7)) - 1] || "?"} ${Number(day.slice(8, 10))}`;

/** The pinned deal of a day, as the server stores and serves it. */
export interface DailyPin {
  day: string;
  seed: string;
  edition: number;
  at: string;
}

/** Device streak: consecutive UTC days with a finished Daily Deal. */
export interface Streak {
  last: string;
  n: number;
  best: number;
}
export function bumpStreak(st: Streak | null, day: string): Streak {
  if (!st || !st.last) return { last: day, n: 1, best: 1 };
  if (st.last === day) return st;
  const n = prevDay(day) === st.last ? st.n + 1 : 1;
  return { last: day, n, best: Math.max(st.best || 0, n) };
}
/** The streak as it stands today: it breaks once a whole day is skipped. */
export const liveStreak = (st: Streak | null, today: string) => (st && (st.last === today || st.last === prevDay(today)) ? st.n : 0);
