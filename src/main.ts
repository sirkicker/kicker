// Boot: fonts, Pixi, the squad cut, URL seeds and challenges, the saved season, the Daily Match, and the coach's tips.
import { Application } from "pixi.js";
import type { Edition } from "../shared/data.js";
import { CURRENT_RULES, encodeTrail, parseTrail, rerun, Run, type Action, type Rules, type RunMode } from "../shared/engine.js";
import { newSeed, normSeed } from "../shared/rng.js";
import { bumpStreak, utcDay, type Streak } from "../shared/daily.js";
import { cleanName } from "../shared/names.js";
import { sfx, unlock } from "./audio.js";
import { Game } from "./game.js";
import { attach, setSpeed } from "./tween.js";
import { playSeason } from "../shared/bot.js";
import { h2hAdd, local, setUi, settleTip, showTip, subscribe, toast, ui, type Challenge, type Daily, type TipScreen } from "./store.js";
import { house } from "./house.js";
import { rememberedAddress } from "./signin.js";
import { me, receipts, refreshProfile } from "./me.js";
import { mountUi, VERSION, type LocalGoal, type UiActions } from "./ui.js";
import { gainHauntKit } from "./haunt.js";
import { dailyDone } from "./screens.js";
import "./style.css";

interface Saved {
  seed: string;
  edition: number;
  /** encodeTrail with the rules and the mode: "R3" marks the 3.0 rules, "H" a Haunted table trail. */
  trail: string;
  challenge: Challenge | null;
}

/** The saved season; the key is new in 2.0, so a saved run from the old game is simply not found. */
const SAVE_KEY = "kk.season";
const editions = new Map<number, Edition>();

async function fetchEdition(id?: number): Promise<Edition> {
  if (id && editions.has(id)) return editions.get(id)!;
  const res = await fetch(id ? `/api/shuffle?e=${id}` : "/api/shuffle");
  if (!res.ok) throw new Error(res.status === 404 ? "that squad cut is gone" : `HTTP ${res.status}`);
  const ed = (await res.json()) as Edition;
  editions.set(ed.id, ed);
  return ed;
}

/**
 * The Daily Match is one match day: friendly, league match and boss club under rules 3, played in its own run mode
 * ("daily", trail token R3_D). The engine ends it after fixture 3 or at the first loss, and the server posts it to
 * the Daily board only.
 */
const DAILY_MODE: RunMode = "daily";
const dailyModeOf = (): RunMode => DAILY_MODE;

let game: Game;
let coachStep = local.get<number>("kk.tips", 0);

function save(run: Run) {
  const over = run.s.phase === "over" || run.s.phase === "won" || (dailyOf(run) !== null && dailyDone(run));
  if (over) local.del(SAVE_KEY);
  else local.set(SAVE_KEY, { seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail, run.mode, run.rules), challenge: ui.challenge } satisfies Saved);
}

/** The address bar stays bare during play: a reload or a bookmark always lands on the title (with Continue). */
function setUrl() {
  const u = new URL(location.href);
  if (!u.search && u.pathname === "/") return;
  u.search = "";
  u.pathname = "/";
  history.replaceState(null, "", u.toString());
}

/** The share link for a seed. Opening it shows the seed on the title; it never starts by itself. */
export function seedUrl(seed: string, edition: number, mode: RunMode = "season") {
  return `${location.origin}/?s=${seed}&e=${edition}${mode === "haunt" ? "&m=haunt" : ""}`;
}

/** The first-match walkthrough: four prompts, each moves on when the player does the thing. Shown once, skippable. */
function tutorial(a: Action, run: Run) {
  const done = () => {
    local.set("kk.tut", "done");
    setUi({ tut: null });
  };
  let t = ui.tut;
  if (t === null) {
    if (a.t === "go" && local.get<string>("kk.tut", "") !== "done" && run.s.phase === "attack") setUi({ tut: 0 });
    return;
  }
  const ph = run.s.phase;
  if (ph !== "attack" && ph !== "defend") return done();
  if (t === 0 && a.t === "slide") t = 1;
  else if (t === 1 && a.t === "kick") t = a.r === 4 ? 3 : 2;
  else if (t === 2 && a.t === "kick" && a.r === 4) t = 3;
  else if (t === 3 && a.t === "hold") return done();
  if (ph === "defend" && t < 3) t = 3;
  if (t === 3 && ph === "attack" && a.t === "hold") return done();
  if (t !== ui.tut) setUi({ tut: t });
}

/** A first-time tip, shown once per device in the order of `step`, on the screen it is about. */
function coach(step: number, screen: TipScreen, text: string) {
  if (coachStep > step) return;
  coachStep = step + 1;
  local.set("kk.tips", coachStep);
  showTip("first" + step, screen, text);
}

/** Starts a run, or carries one on from its trail. A run carried on keeps the rules it was started under. */
async function startRun(seed: string, edition: Edition, trail: Action[] = [], mode: RunMode = "season", rules: Rules = CURRENT_RULES) {
  unlock();
  let run: Run;
  try {
    run = rerun(edition, seed, trail, mode, trail.length ? rules : CURRENT_RULES);
  } catch {
    run = new Run(edition, seed, mode);
  }
  setUi({ run, overlay: null, coach: null, bossSeen: false, pendingSeed: null, tut: null });
  game.start(run);
  setUrl();
  save(run);
  if (run.s.phase === "fixture" && run.trail.length === 0)
    coach(0, "matchday", "Your eleven are live vibe/vibe launches. Curve progress gives a figure Power, trades give Pace, holders give Grip. Press Kick off.");
}

async function loadDaily(): Promise<Daily | null> {
  try {
    const r = await fetch("/api/daily");
    if (!r.ok) return null;
    const d = (await r.json()) as Daily;
    setUi({ daily: d });
    return d;
  } catch {
    return null;
  }
}

/** The day, when this season is today's Daily Match. */
const dailyOf = (run: Run | null) => {
  if (!run) return null;
  const today = ui.daily && ui.daily.seed === run.s.seed && ui.daily.edition === run.s.edition ? ui.daily.day : null;
  return run.mode === "daily" ? today || utcDay() : today;
};

function goalsAdd(run: Run) {
  const b = run.s.best;
  if (!b) return;
  const list = local.get<LocalGoal[]>("kk.goals", []);
  const sc = run.s.squad[b.scorer];
  list.push({
    total: b.total,
    style: b.style,
    seed: run.s.seed,
    edition: run.s.edition,
    round: run.s.round,
    cleared: run.s.cleared,
    figs: b.figs,
    at: Date.now(),
    path: b.path,
    ...(sc ? { scorer: { t: sc.t, s: sc.s, c: sc.c, u: sc.u } } : {}),
  });
  list.sort((a, c) => c.total - a.total);
  local.set("kk.goals", list.slice(0, 12));
}

async function boot() {
  const app = new Application();
  await Promise.all([
    app.init({
      preference: "webgl",
      background: 0x12060f,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
    document.fonts.load('32px "Jersey 10"').catch(() => null),
  ]);
  document.getElementById("stage")!.appendChild(app.canvas);
  // any screen change (an overlay opening or closing, a new run) drops a tip that belonged to the old one, and the
  // title gets a clear table behind it
  subscribe(() => {
    settleTip();
    game?.cover(ui.overlay === "title");
  });
  attach(app.ticker);
  game = new Game(app, {
    onAction(a, run) {
      save(run);
      setUi({});
      // your record against each club, kept on this device
      if (run.events.some((e) => e.e === "end")) {
        const st = run.s.story[run.s.story.length - 1];
        if (st && (st.key === "won" || st.key === "draw" || st.key === "lost")) h2hAdd(String(st.args.club), st.key);
      }
      if (dailyOf(run) && run.s.phase === "fulltime" && dailyDone(run)) dailyFinish(run);
      tutorial(a, run);
      if (run.mode === "haunt" && run.events.some((e) => e.e === "end" && e.won) && gainHauntKit()) toast("Haunted kit: yours, on this device. For the look only.");
      // a tip lives on its screen only: the action may have moved on from it
      settleTip(true);
      if (a.t === "collect" && run.s.visit === 1) coach(3, "room", "The dressing room. Coaches read the launches on your rods; training lasts the season; a set piece is used once. Prices are fixed.");
      if (a.t === "next" && run.s.kind === 2 && run.s.round === 1 && run.mode === "season") coach(4, "matchday", run.league ? "A cup tie next: the boss club changes one rule for the match, and a draw is not enough. Read the rule before you kick off." : "A boss club next: it changes one rule for the match. Read it before you kick off.");
    },
    onOver(run) {
      if (finished === run) return;
      finished = run;
      goalsAdd(run);
      const day = dailyOf(run);
      if (day) local.set("kk.streak", bumpStreak(local.get<Streak | null>("kk.streak", null), day));
      save(run);
      setTimeout(() => setUi({ overlay: "over", coach: null }), 300);
    },
    openOverlay(o) {
      setUi({ overlay: o });
    },
  });

  /** Today's match day is done after its third fixture: the programme shows once the table has played full time. */
  let finished: Run | null = null;
  function dailyFinish(run: Run) {
    if (finished === run) return;
    finished = run;
    goalsAdd(run);
    const day = dailyOf(run);
    if (day) local.set("kk.streak", bumpStreak(local.get<Streak | null>("kk.streak", null), day));
    save(run);
    const busy = () => (game as unknown as { busy?: boolean }).busy === true;
    const t0 = Date.now();
    const wait = () => (busy() && Date.now() - t0 < 8000 ? setTimeout(wait, 120) : setTimeout(() => ui.run === run && setUi({ overlay: "over", coach: null }), 700));
    wait();
  }

  // QA hook: lets the test bot drive the same code paths taps use
  (window as unknown as { kicker: unknown }).kicker = {
    game,
    ui,
    setUi,
    screenOfSlot(slot: number) {
      return game.screenOfSlot(slot);
    },
    speed(x: number) {
      setSpeed(x);
    },
    /** Plays the rest of the season with the coach's bot, at once, and shows the result. */
    finish() {
      const run = ui.run;
      if (!run) return;
      playSeason(run);
      save(run);
      game.refreshAll();
      if (run.s.phase === "over" || run.s.phase === "won" || (dailyOf(run) && dailyDone(run))) {
        goalsAdd(run);
        setUi({ overlay: "over", coach: null });
      }
    },
  };

  const actions: UiActions = {
    async newRun(mode: RunMode = "season") {
      try {
        const ed = await fetchEdition();
        setUi({ edition: ed, challenge: null });
        await startRun(newSeed(), ed, [], mode);
      } catch (e) {
        toast("Could not load the squad: " + (e as Error).message);
      }
    },
    async dailyRun() {
      const d = (await loadDaily()) || ui.daily;
      if (!d) {
        toast("The Daily Match is not drawn yet. Try again in a minute.");
        return;
      }
      try {
        const ed = await fetchEdition(d.edition);
        const sv = local.get<Saved | null>(SAVE_KEY, null);
        setUi({ challenge: null });
        const p = sv ? parseSaved(sv) : null;
        if (sv && p && p.mode === dailyModeOf() && sv.seed === d.seed && sv.edition === d.edition) await startRun(sv.seed, ed, p.actions, p.mode, p.rules);
        else await startRun(d.seed, ed, [], dailyModeOf());
      } catch (e) {
        toast("Could not load the daily squad: " + (e as Error).message);
      }
    },
    isDaily() {
      return dailyOf(ui.run);
    },
    lookChanged() {
      game.applyLook();
    },
    continueRun() {
      const sv = local.get<Saved | null>(SAVE_KEY, null);
      if (!sv) return;
      void (async () => {
        try {
          const ed = await fetchEdition(sv.edition);
          setUi({ challenge: sv.challenge });
          const p = parseSaved(sv);
          await startRun(sv.seed, ed, p?.actions || [], p?.mode || "season", p?.rules);
        } catch {
          toast("That season's squad cut is gone");
          local.del(SAVE_KEY);
          setUi({});
        }
      })();
    },
    async playSeed(raw) {
      const text = raw.trim();
      let seed: string | null = null;
      let edition: number | undefined;
      let mode: RunMode = "season";
      try {
        const u = new URL(text);
        seed = normSeed(u.searchParams.get("s") || "");
        edition = Number(u.searchParams.get("e")) || undefined;
        if (u.searchParams.get("m") === "haunt") mode = "haunt";
        const c = u.pathname.match(/\/c\/([0-9a-z]{10})/);
        if (c) {
          location.href = `/c/${c[1]}`;
          return true;
        }
      } catch {
        const m = text.match(/(\d{6})\D+(.+)/);
        if (m) {
          edition = Number(m[1]);
          seed = normSeed(m[2]);
        } else seed = normSeed(text);
      }
      if (!seed) return false;
      try {
        const ed = await fetchEdition(edition);
        setUi({ challenge: null });
        await startRun(seed, ed, [], mode);
        return true;
      } catch {
        return false;
      }
    },
    restartSeed() {
      const run = ui.run;
      if (!run) return;
      void startRun(run.s.seed, run.ed, [], run.mode);
    },
    abandon() {
      game.root.visible = false;
      setUi({ overlay: "title", coach: null, tut: null });
    },
    acceptChallenge() {
      const ch = ui.challenge;
      const sd = pendingChallenge;
      if (!ch || !sd) return;
      void (async () => {
        try {
          const ed = await fetchEdition(sd.edition);
          await startRun(sd.seed, ed, [], sd.mode);
        } catch {
          toast("The challenge's squad cut is gone");
        }
      })();
    },
    async share(name) {
      const run = ui.run;
      if (!run) return null;
      try {
        const h = house.get();
        const mine = (n: string | undefined) => !!n && !!name && cleanName(name).toLowerCase() === n.toLowerCase();
        const claim = h && mine(h.name) ? h.claim : undefined;
        const s = me.get();
        const session = s && mine(s.name) ? s.session : undefined;
        const body = JSON.stringify({ seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail, run.mode, run.rules), mode: run.mode, name, house: claim, session });
        const j = await postJson("/api/result", body);
        if (j.receipt && name) receipts.add(name, j.receipt);
        if (j.result?.verified) void refreshProfile();
        sfx.coin();
        return { id: j.id, url: j.url, daily: j.result?.daily || null, house: !!j.result?.house, verified: !!j.result?.verified, kit: !!j.result?.kit };
      } catch (e) {
        toast("Could not verify the season: " + (e as Error).message);
        return null;
      }
    },
    seedLink() {
      const run = ui.run;
      if (!run) return location.origin;
      return seedUrl(run.s.seed, run.s.edition, run.mode);
    },
    swap(a, b) {
      return game.swap(a, b);
    },
    kickOff() {
      setUi({ overlay: null });
      game.doGo();
    },
    playEntry(h) {
      void (async () => {
        try {
          const ed = await fetchEdition(h.edition);
          setUi({ challenge: { id: h.id, name: h.name, round: h.round, cleared: h.cleared, won: h.won, best: h.total, style: h.style } });
          await startRun(h.seed, ed, [], h.mode === "haunt" ? "haunt" : h.mode === "daily" && ui.daily?.seed === h.seed ? "daily" : "season");
        } catch {
          toast("That season's squad cut is gone");
        }
      })();
    },
    hasSaved() {
      return !!local.get<Saved | null>(SAVE_KEY, null);
    },
    canReplay() {
      const g = game as unknown as { playReplay?: unknown };
      return typeof g.playReplay === "function" && !!ui.run?.s.best?.path?.length;
    },
    replay() {
      const g = game as unknown as { playReplay?: (b: unknown) => Promise<void> };
      const b = ui.run?.s.best;
      if (typeof g.playReplay !== "function" || !b) return null;
      try {
        return Promise.resolve(g.playReplay(b)).catch(() => undefined);
      } catch {
        return null;
      }
    },
    edition(id: number) {
      return fetchEdition(id);
    },
    savedMode() {
      const sv = local.get<Saved | null>(SAVE_KEY, null);
      return sv ? parseSaved(sv)?.mode || null : null;
    },
    playPending() {
      const p = ui.pendingSeed;
      if (!p) return;
      void (async () => {
        try {
          const ed = await fetchEdition(p.edition || undefined);
          const sv = local.get<Saved | null>(SAVE_KEY, null);
          const sp = sv ? parseSaved(sv) : null;
          setUi({ challenge: null });
          // the same season already under way on this device: carry on where it was
          if (sv && sp && sv.seed === p.seed && sv.edition === ed.id && sp.mode === p.mode) await startRun(sv.seed, ed, sp.actions, sp.mode, sp.rules);
          else await startRun(p.seed, ed, [], p.mode);
        } catch {
          toast("That seed's squad cut is gone");
        }
      })();
    },
  };
  mountUi(document.getElementById("ui")!, actions);
  Object.assign((window as unknown as { kicker: object }).kicker, { newRun: actions.newRun, playPending: actions.playPending, continueRun: actions.continueRun });

  const first = () => {
    unlock();
    window.removeEventListener("pointerdown", first);
  };
  window.addEventListener("pointerdown", first);

  // URL: ?c=<challenge> or ?s=<seed>&e=<cut>
  const q = new URLSearchParams(location.search);
  const cId = q.get("c");
  const sParam = normSeed(q.get("s") || "");
  const eParam = Number(q.get("e")) || undefined;
  try {
    if (cId && /^[0-9a-z]{10}$/.test(cId)) {
      const r = await fetch(`/api/result?id=${cId}`);
      if (r.ok) {
        const rec = await r.json();
        if (rec.v === 2) {
          pendingChallenge = { seed: rec.seed, edition: rec.edition, mode: rec.mode === "haunt" ? "haunt" : rec.mode === "daily" && ui.daily?.seed === rec.seed ? "daily" : "season" };
          setUi({ challenge: { id: rec.id, name: rec.name, round: rec.round, cleared: rec.cleared, won: rec.won, best: rec.best?.total || 0, style: rec.best?.style || "" } });
          const ed = await fetchEdition(rec.edition);
          setUi({ edition: ed });
          return;
        }
        toast("That link is from an older season of KICKER. Its run can't be replayed on today's table.");
      }
    }
    // a seed link shows the seed on the title with a button; nothing starts until the player presses it
    if (sParam) {
      setUi({ pendingSeed: { seed: sParam, edition: eParam || 0, mode: q.get("m") === "haunt" ? "haunt" : "season" } });
      setUrl();
    }
    const ed = await fetchEdition();
    setUi({ edition: ed });
    // What's new is for returning players only: a first visit just notes the version, so the next update shows
    const seen = local.get<string>("kk.news", "");
    if (!seen) local.set("kk.news", VERSION);
    else if (!sParam && ui.overlay === "title" && seen !== VERSION) setUi({ overlay: "news" });
  } catch (e) {
    setUi({ editionError: (e as Error).message });
  }
}

interface Posted {
  id: string;
  url: string;
  result?: { daily?: string; house?: boolean; verified?: boolean; kit?: boolean };
  receipt?: string;
}

function postJson(url: string, body: string): Promise<Posted> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("content-type", "application/json");
    x.onload = () => {
      let j: Partial<Posted> & { error?: string } = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {
        /* not json */
      }
      if (x.status >= 200 && x.status < 300 && j.id) res(j as Posted);
      else rej(new Error(j.error || `HTTP ${x.status}`));
    };
    x.onerror = () => rej(new Error("network"));
    x.send(body);
  });
}

let pendingChallenge: { seed: string; edition: number; mode: RunMode } | null = null;

function parseSaved(sv: Saved): { rules: Rules; mode: RunMode; actions: Action[] } | null {
  try {
    return parseTrail(sv.trail);
  } catch {
    return null;
  }
}

// the pill shows the last address this browser signed in with; Para itself loads only when sign-in is touched
setUi({ signedIn: rememberedAddress() });
void loadDaily();
void boot();
