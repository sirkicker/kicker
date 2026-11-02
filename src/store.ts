// A tiny store shared by the Pixi table and the Preact overlays.
import type { Edition, Launch } from "../shared/data.js";
import type { Run } from "../shared/engine.js";
import type { Profile } from "../shared/profile.js";

export type Overlay = null | "title" | "how" | "pool" | "squad" | "boss" | "over" | "seed" | "options" | "hall" | "house" | "news" | "table" | "more";

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

export interface Coach {
  text: string;
  step: number;
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
