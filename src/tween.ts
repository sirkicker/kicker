// Minimal tweening on the Pixi ticker, promise-based so animation code reads top to bottom.
import type { Ticker } from "pixi.js";

export const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

interface Job {
  t0: number;
  dur: number;
  step: (k: number) => void;
  done: () => void;
  ease: Ease;
  key?: object;
  keys?: string[];
}

let jobs: Job[] = [];
let now = 0;
let speed = 1;

export function setSpeed(x: number) {
  speed = x;
}

export function attach(ticker: Ticker) {
  ticker.add((tk) => {
    now += tk.deltaMS;
    const live = jobs;
    jobs = [];
    for (const j of live) {
      const k = Math.min(1, (now - j.t0) / Math.max(1, j.dur));
      j.step(j.ease(k));
      if (k >= 1) j.done();
      else jobs.push(j);
    }
  });
}

export function clock() {
  return now;
}

/** Animate numeric props of an object. A new tween on the same target+key cancels the old one. */
export function tween(target: object, to: Keyed<string, number>, dur: number, e: Ease = ease.outCubic): Promise<void> {
  const from: Keyed<string, number> = {};
  for (const k in to) from[k] = (target as Keyed<string, number>)[k];
  const keys = Object.keys(to);
  jobs = jobs.filter((j) => {
    const clash = j.key === target && keys.some((k) => j.keys?.includes(k));
    if (clash) j.done();
    return !clash;
  });
  const d = reduced() ? Math.min(dur, 90) : dur / speed;
  return new Promise((res) => {
    const job: Job = {
      t0: now,
      dur: d,
      ease: e,
      key: target,
      keys,
      step: (k) => {
        for (const p in to) (target as Keyed<string, number>)[p] = from[p] + (to[p] - from[p]) * k;
      },
      done: res,
    };
    jobs.push(job);
  });
}

export function wait(ms: number): Promise<void> {
  const d = reduced() ? Math.min(ms, 40) : ms / speed;
  return new Promise((res) => jobs.push({ t0: now, dur: d, ease: ease.linear, step: () => {}, done: res }));
}

export function every(fn: (k: number) => void, dur: number): Promise<void> {
  const d = reduced() ? Math.min(dur, 90) : dur / speed;
  return new Promise((res) => jobs.push({ t0: now, dur: d, ease: ease.linear, step: fn, done: res }));
}
