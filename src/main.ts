// Boot: fonts, Pixi, the squad cut, URL seeds and challenges, the saved season, the Daily Match, and the coach's tips.
import { Application } from "pixi.js";
import type { Edition } from "../shared/data.js";
import { decodeTrail, encodeTrail, rerun, Run, type Action } from "../shared/engine.js";
import { newSeed, normSeed } from "../shared/rng.js";
import { bumpStreak, type Streak } from "../shared/daily.js";
import { cleanName } from "../shared/names.js";
import { sfx, unlock } from "./audio.js";
import { Game } from "./game.js";
import { attach, setSpeed } from "./tween.js";
import { playSeason } from "../shared/bot.js";
import { local, setUi, toast, ui, type Challenge, type Daily } from "./store.js";
import { house } from "./house.js";
import { rememberedAddress } from "./signin.js";
import { me, receipts, refreshProfile } from "./me.js";
import { mountUi, VERSION, type LocalGoal } from "./ui.js";
import "./style.css";

interface Saved {
  seed: string;
  edition: number;
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

let game: Game;
let coachStep = local.get<number>("kk.tips", 0);

function save(run: Run) {
  const over = run.s.phase === "over" || run.s.phase === "won";
  if (over) local.del(SAVE_KEY);
  else local.set(SAVE_KEY, { seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail), challenge: ui.challenge } satisfies Saved);
}

function setUrl(run: Run | null) {
  const u = new URL(location.href);
  u.search = "";
  if (run) {
    u.searchParams.set("s", run.s.seed);
    u.searchParams.set("e", String(run.s.edition));
  }
  history.replaceState(null, "", u.toString());
}

function coach(step: number, text: string) {
  if (coachStep > step) return;
  coachStep = step + 1;
  local.set("kk.tips", coachStep);
  setUi({ coach: { step, text } });
}

async function startRun(seed: string, edition: Edition, trail: Action[] = []) {
  unlock();
  let run: Run;
  try {
    run = rerun(edition, seed, trail);
  } catch {
    run = new Run(edition, seed);
  }
  setUi({ run, overlay: null, coach: null, bossSeen: false });
  game.start(run);
  setUrl(run);
  save(run);
  if (run.s.phase === "fixture" && run.trail.length === 0)
    coach(0, "Your eleven are live vibe/vibe launches. Curve progress gives a figure Power, trades give Pace, holders give Grip. Press Kick off.");
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
const dailyOf = (run: Run | null) => (run && ui.daily && ui.daily.seed === run.s.seed && ui.daily.edition === run.s.edition ? ui.daily.day : null);

function goalsAdd(run: Run) {
  const b = run.s.best;
  if (!b) return;
  const list = local.get<LocalGoal[]>("kk.goals", []);
  list.push({ total: b.total, style: b.style, seed: run.s.seed, edition: run.s.edition, round: run.s.round, cleared: run.s.cleared, figs: b.figs, at: Date.now() });
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
  attach(app.ticker);
  game = new Game(app, {
    onAction(a, run) {
      save(run);
      setUi({});
      if (a.t === "go" && run.s.round === 1 && run.s.kind === 0)
        coach(1, "The gold lines are your kicks: a disc in their goal is a shot, a ring on your figure is a pass. Slide a rod with the arrows under it. They react to every touch.");
      if (run.s.phase === "defend" && run.s.round === 1)
        coach(2, "Their ball. Red lines show where it can go. Slide your rods into those lanes, then press Ready.");
      if (a.t === "collect" && run.s.visit === 1) coach(3, "The dressing room. Coaches read the launches on your rods; training lasts the season; a set piece is used once. Prices are fixed.");
      if (a.t === "next" && run.s.kind === 2 && run.s.round === 1) coach(4, "A boss club next: it changes one rule for the match. Read it before you kick off.");
    },
    onOver(run) {
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
      if (run.s.phase === "over" || run.s.phase === "won") {
        goalsAdd(run);
        setUi({ overlay: "over", coach: null });
      }
    },
  };

  mountUi(document.getElementById("ui")!, {
    async newRun() {
      try {
        const ed = await fetchEdition();
        setUi({ edition: ed, challenge: null });
        await startRun(newSeed(), ed);
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
        if (sv && sv.seed === d.seed && sv.edition === d.edition) await startRun(sv.seed, ed, decodeTrail(sv.trail));
        else await startRun(d.seed, ed);
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
          await startRun(sv.seed, ed, decodeTrail(sv.trail));
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
      try {
        const u = new URL(text);
        seed = normSeed(u.searchParams.get("s") || "");
        edition = Number(u.searchParams.get("e")) || undefined;
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
        await startRun(seed, ed);
        return true;
      } catch {
        return false;
      }
    },
    restartSeed() {
      const run = ui.run;
      if (!run) return;
      void startRun(run.s.seed, run.ed);
    },
    abandon() {
      game.root.visible = false;
      setUi({ overlay: "title", coach: null });
    },
    acceptChallenge() {
      const ch = ui.challenge;
      const sd = pendingChallenge;
      if (!ch || !sd) return;
      void (async () => {
        try {
          const ed = await fetchEdition(sd.edition);
          await startRun(sd.seed, ed);
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
        const body = JSON.stringify({ seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail), name, house: claim, session });
        const j = await postJson("/api/result", body);
        if (j.receipt && name) receipts.add(name, j.receipt);
        if (j.result?.verified) void refreshProfile();
        sfx.coin();
        return { id: j.id, url: j.url, daily: j.result?.daily || null, house: !!j.result?.house, verified: !!j.result?.verified };
      } catch (e) {
        toast("Could not verify the season: " + (e as Error).message);
        return null;
      }
    },
    seedLink() {
      const run = ui.run;
      if (!run) return location.origin;
      return `${location.origin}/?s=${run.s.seed}&e=${run.s.edition}`;
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
          await startRun(h.seed, ed);
        } catch {
          toast("That season's squad cut is gone");
        }
      })();
    },
    hasSaved() {
      return !!local.get<Saved | null>(SAVE_KEY, null);
    },
  });

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
          pendingChallenge = { seed: rec.seed, edition: rec.edition };
          setUi({ challenge: { id: rec.id, name: rec.name, round: rec.round, cleared: rec.cleared, won: rec.won, best: rec.best?.total || 0, style: rec.best?.style || "" } });
          const ed = await fetchEdition(rec.edition);
          setUi({ edition: ed });
          return;
        }
        toast("That link is from an older season of KICKER. Its run can't be replayed on today's table.");
      }
    }
    if (sParam) {
      const sv = local.get<Saved | null>(SAVE_KEY, null);
      const ed = await fetchEdition(eParam);
      setUi({ edition: ed });
      if (sv && sv.seed === sParam && sv.edition === ed.id) {
        setUi({ challenge: sv.challenge });
        await startRun(sv.seed, ed, decodeTrail(sv.trail));
      } else await startRun(sParam, ed);
      return;
    }
    const ed = await fetchEdition();
    setUi({ edition: ed });
    if (ui.overlay === "title" && local.get<string>("kk.news", "") !== VERSION) setUi({ overlay: "news" });
  } catch (e) {
    setUi({ editionError: (e as Error).message });
  }
}

interface Posted {
  id: string;
  url: string;
  result?: { daily?: string; house?: boolean; verified?: boolean };
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

let pendingChallenge: { seed: string; edition: number } | null = null;

// the pill shows the last address this browser signed in with; Para itself loads only when sign-in is touched
setUi({ signedIn: rememberedAddress() });
void loadDaily();
void boot();
