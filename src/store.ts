// A tiny shared store between the Pixi table and the Preact overlays.
import type { Edition, PoolCard } from "../shared/data.js";
import type { Run } from "../shared/engine.js";

export type Overlay = null | "title" | "how" | "deck" | "levels" | "over" | "seed" | "options" | "hall";

export interface Challenge {
  id: string;
  name: string | null;
  ante: number;
  blind: number;
  cleared: number;
  won: boolean;
  best: number;
  handName: string;
}

export interface Coach {
  text: string;
  step: number;
}

export interface Detail {
  l: PoolCard;
  rank?: number;
  suit?: number;
  enh?: string | null;
  q?: string;
  bridged?: boolean;
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
