// A tiny store shared by the Pixi table and the Preact overlays.
import type { Edition, Launch } from "../shared/data.js";
import type { Run, RunMode } from "../shared/engine.js";
import type { Profile } from "../shared/profile.js";

export type Overlay = null | "title" | "how" | "pool" | "squad" | "boss" | "over" | "seed" | "options" | "hall" | "house" | "news" | "table" | "more" | "league";

/**
 * A stage screen between matches (match day, full time, the dressing room), drawn in HTML over the table's panel
 * area. `rect` is that area in CSS pixels; `host` carries the run and the actions behind its buttons (src/stage.ts).
 */
export interface StageView {
  phase: "fixture" | "fulltime" | "room";
  rect: { x: number; y: number; w: number; h: number };
  port: boolean;
  host: StageHostLike;
  /** Bumped on every draw, so the screen re-reads the run. */
  n: number;
}
/** What the HTML stage needs from src/stage.ts's StageHost (kept structural so the store stays Pixi-free). */
export interface StageHostLike {
  readonly run: Run;
  go(): void;
  back(): void;
  collect(): void;
  buy(i: number): void;
  next(): void;
  lineup(): void;
}

/** Today's Daily Match as /api/daily serves it. */
export interface Daily {
  day: string;
  label: string;
  seed: string;
  edition: number;
  players: number;
}

export interface Challenge {
  id: string;
  name: string | null;
  round: number;
  cleared: number;
  won: boolean;
  best: number;
  style: string;
}

/** The screens a tip can belong to. A tip shows only on its own screen. */
export type TipScreen = "title" | "matchday" | "table" | "fulltime" | "room" | "over";

/**
 * A coach's tip. One at a time; it belongs to one screen, shows only there, and is dropped as soon as that screen
 * goes (a match kicks off, the room closes...). A "touch" tip also goes after the next action (the coach's hint).
 * Where it sits is set by the table (CSS vars --tip-*), clear of the score and possession panels.
 */
export interface Coach {
  key: string;
  text: string;
  screen: TipScreen;
  until: "screen" | "touch";
}

export interface Detail {
  l: Launch;
  /** Its place in your squad, when it is one of your figures. */
  slot?: number;
}

export interface UiState {
  overlay: Overlay;
  edition: Edition | null;
  editionError: string | null;
  run: Run | null;
  challenge: Challenge | null;
  coach: Coach | null;
  detail: Detail | null;
  toast: string | null;
  daily: Daily | null;
  /** The address signed in through Para (or the last one this browser saw, until Para says otherwise). */
  signedIn: string | null;
  signinBusy: boolean;
  /** "Your table" from the server, while signed in. */
  profile: Profile | null;
  /** The boss intro was shown for this fixture; the next Kick off plays. */
  bossSeen: boolean;
  /** A seed link opened on the title: shown with a Play button, never started by itself. */
  pendingSeed: { seed: string; edition: number; mode: RunMode } | null;
  /** The first-match walkthrough: the step on screen, or null. */
  tut: number | null;
  /** The stage screen on show between matches, or null while a match is on (or no run). */
  stage: StageView | null;
  version: number;
}

const listeners = new Set<() => void>();
export const ui: UiState = {
  overlay: "title",
  edition: null,
  editionError: null,
  run: null,
  challenge: null,
  coach: null,
  detail: null,
  toast: null,
  daily: null,
  signedIn: null,
  signinBusy: false,
  profile: null,
  bossSeen: false,
  pendingSeed: null,
  tut: null,
  stage: null,
  version: 0,
};

export function setUi(p: Partial<UiState>) {
  Object.assign(ui, p);
  ui.version++;
  for (const l of listeners) l();
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The screen on show now, as tips see it; null while an overlay (other than the title) covers it. */
export function screenNow(u: UiState = ui): TipScreen | null {
  if (u.overlay === "title") return "title";
  if (u.overlay) return null;
  const ph = u.run?.s.phase;
  if (!ph) return null;
  if (ph === "fixture") return "matchday";
  if (ph === "attack" || ph === "defend") return "table";
  if (ph === "fulltime") return "fulltime";
  if (ph === "room") return "room";
  return "over";
}
/** The screen a phase belongs to (for a tip asked for ahead of its screen). */
export function screenOfPhase(ph: string): TipScreen {
  return ph === "fixture" ? "matchday" : ph === "attack" || ph === "defend" ? "table" : ph === "fulltime" ? "fulltime" : ph === "room" ? "room" : "over";
}
/** Shows a tip on a screen; any other tip goes (one at a time). */
export function showTip(key: string, screen: TipScreen, text: string, until: Coach["until"] = "screen") {
  setUi({ coach: { key, text, screen, until } });
}
/** Drops the tip once its screen has gone; after an action (`touched`), a touch tip goes too. */
export function settleTip(touched = false) {
  const c = ui.coach;
  if (!c) return;
  const now = screenNow();
  const sameScreen = now === c.screen || (now === null && ui.run && screenOfPhase(ui.run.s.phase) === c.screen);
  if (!sameScreen || (touched && c.until === "touch")) setUi({ coach: null });
}

/** Reduced motion, as the player's system asks for it. The table and the screens both read this. */
export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}


// ------------------------------------------------------------ head to head, kept on this device only
/** Your record against one club on this device: wins, draws, losses. */
export interface H2H {
  w: number;
  d: number;
  l: number;
}
const H2H_KEY = "kk.h2h";
export function h2hOf(club: string): H2H {
  const all = local.get<Keyed<string, H2H>>(H2H_KEY, {});
  return all[club] || { w: 0, d: 0, l: 0 };
}
/** Counts one full-time result against a club. Local only: nothing is sent anywhere. */
export function h2hAdd(club: string, key: "won" | "draw" | "lost") {
  const all = local.get<Keyed<string, H2H>>(H2H_KEY, {});
  const r = all[club] || { w: 0, d: 0, l: 0 };
  if (key === "won") r.w++;
  else if (key === "draw") r.d++;
  else r.l++;
  all[club] = r;
  local.set(H2H_KEY, all);
}
/** "You lead 3–1", "They lead 2–0", "Level 1–1", or "First meeting". Draws are counted but don't decide who leads. */
export function h2hLine(r: H2H): string {
  if (!r.w && !r.d && !r.l) return "First meeting";
  const d = r.d ? `, ${r.d} drawn` : "";
  if (r.w > r.l) return `You lead ${r.w}–${r.l}${d}`;
  if (r.l > r.w) return `They lead ${r.l}–${r.w}${d}`;
  return `Level ${r.w}–${r.l}${d}`;
}

let toastTimer = 0;
export function toast(msg: string) {
  setUi({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setUi({ toast: null }), 2600);
}

export const local = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage blocked */
    }
  },
};
