// Boot: fonts, Pixi, the deck snapshot, URL seeds/challenges, saved runs, and the tutorial coach.
import { Application } from "pixi.js";
import { HAND } from "../shared/content.js";
import type { Edition } from "../shared/data.js";
import { decodeTrail, encodeTrail, rerun, Run, type Action } from "../shared/engine.js";
import { newSeed, normSeed } from "../shared/rng.js";
import { sfx, unlock } from "./audio.js";
import { Game } from "./game.js";
import { attach } from "./tween.js";
import { local, setUi, toast, ui, type Challenge } from "./store.js";
import { mountUi, type HallEntry } from "./ui.js";
import "./style.css";

interface Saved {
  seed: string;
  edition: number;
  trail: string;
  challenge: Challenge | null;
}

const editions = new Map<number, Edition>();

async function fetchEdition(id?: number): Promise<Edition> {
  if (id && editions.has(id)) return editions.get(id)!;
  const res = await fetch(id ? `/api/shuffle?e=${id}` : "/api/shuffle");
  if (!res.ok) throw new Error(res.status === 404 ? "deck not found" : `HTTP ${res.status}`);
  const ed = (await res.json()) as Edition;
  editions.set(ed.id, ed);
  return ed;
}

let game: Game;
let coachStep = local.get<number>("kk.coach", 0);

function save(run: Run) {
  const over = run.s.phase === "over" || run.s.phase === "won";
  if (over) local.del("kk.run");
  else local.set("kk.run", { seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail), challenge: ui.challenge } satisfies Saved);
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
  local.set("kk.coach", coachStep);
  setUi({ coach: { step, text } });
}

function coachLater(step: number, text: string) {
  setTimeout(() => {
    if (ui.run && ui.run.s.phase === "round") coach(step, text);
  }, 3600);
}

async function startRun(seed: string, edition: Edition, trail: Action[] = []) {
  unlock();
  let run: Run;
  try {
    run = rerun(edition, seed, trail);
  } catch {
    run = new Run(edition, seed);
  }
  setUi({ run, overlay: null, coach: null });
  game.start(run);
  setUrl(run);
  save(run);
  if (run.s.phase === "blind" && run.trail.length === 0)
    coach(0, "Every card here is a live vibe/vibe launch. Suit = the asset it's paired with, rank = how far along its bonding curve it is. Press Play to deal the first blind.");
}

function hallAdd(run: Run) {
  const b = run.s.best;
  if (!b) return;
  const list = local.get<HallEntry[]>("kk.hall", []);
  list.push({ total: b.total, hand: HAND[b.hand].name, seed: run.s.seed, edition: run.s.edition, ante: run.s.ante, cleared: run.s.cleared, cards: b.cards, at: Date.now() });
  list.sort((a, c) => c.total - a.total);
  local.set("kk.hall", list.slice(0, 12));
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
      if (a.t === "go" && run.s.round === 1)
        coach(1, "Tap up to 5 cards. The panel names the hand you're holding and its Chips x Mult. Then press Play hand.");
      if (a.t === "play" && run.s.handsTotal === 1 && run.s.phase === "round")
        coachLater(2, "Score = Chips x Mult, added up over your hands. Reach the target before hands run out. Weak cards? Select them and Discard to draw new ones.");
      if (a.t === "cash" && run.s.shopVisit === 1) coach(3, "The shop. Insiders are jokers that bend the scoring, many of them reading the launch behind a card. Buy one, then Next blind.");
      if (a.t === "next" && run.s.blind === 2 && run.s.ante === 1) coach(4, "Boss blind ahead: it changes one rule for the round. Read it before you press Play.");
    },
    onSelect(run) {
      if (ui.coach && ui.coach.step <= 1 && game.sel.length >= 1 && run.s.handsTotal === 0)
        setUi({ coach: { step: 1, text: "Good. Chips x Mult on the left is what this hand is worth before card bonuses. Press Play hand when ready." } });
    },
    onOver(run) {
      hallAdd(run);
      save(run);
      setTimeout(() => setUi({ overlay: "over", coach: null }), 300);
    },
    openOverlay(o) {
      setUi({ overlay: o });
    },
  });

  // QA handle: lets the test bot drive the same code paths taps use
  (window as unknown as { kicker: unknown }).kicker = {
    game,
    ui,
    setUi,
    screenOf(id: number) {
      const v = game.views.get(id);
      if (!v) return null;
      const p = v.getGlobalPosition();
      return { x: p.x, y: p.y };
    },
  };

  mountUi(document.getElementById("ui")!, {
    async newRun() {
      try {
        const ed = await fetchEdition();
        setUi({ edition: ed, challenge: null });
        await startRun(newSeed(), ed);
      } catch (e) {
        toast("Could not load the deck: " + (e as Error).message);
      }
    },
    continueRun() {
      const sv = local.get<Saved | null>("kk.run", null);
      if (!sv) return;
      void (async () => {
        try {
          const ed = await fetchEdition(sv.edition);
          setUi({ challenge: sv.challenge });
          await startRun(sv.seed, ed, decodeTrail(sv.trail));
        } catch {
          toast("That run's deck is gone");
          local.del("kk.run");
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
          toast("The challenge deck is gone");
        }
      })();
    },
    async share(name) {
      const run = ui.run;
      if (!run) return null;
      try {
        const body = JSON.stringify({ seed: run.s.seed, edition: run.s.edition, trail: encodeTrail(run.trail), name });
        const j = await postJson("/api/showdown", body);
        sfx.coin();
        return { id: j.id, url: j.url };
      } catch (e) {
        toast("Could not verify the run: " + (e as Error).message);
        return null;
      }
    },
    seedLink() {
      const run = ui.run;
      if (!run) return location.origin;
      return `${location.origin}/?s=${run.s.seed}&e=${run.s.edition}`;
    },
    hint() {
      const ids = game.hint();
      if (ids.length) {
        game.selectIds(ids);
        game.pulse(ids);
        setUi({ coach: { step: 1, text: "That's the strongest hand you hold right now. Press Play hand." } });
      }
    },
    playEntry(h) {
      void (async () => {
        try {
          const ed = await fetchEdition(h.edition);
          setUi({ challenge: { id: h.id, name: h.name, ante: h.ante, blind: 0, cleared: h.cleared, won: h.won, best: h.total, handName: h.handName } });
          await startRun(h.seed, ed);
        } catch {
          toast("That run's deck is gone");
        }
      })();
    },
    hasSaved() {
      return !!local.get<Saved | null>("kk.run", null);
    },
  });

  // first gesture unlocks audio
  const first = () => {
    unlock();
    window.removeEventListener("pointerdown", first);
  };
  window.addEventListener("pointerdown", first);

  // URL: ?c=<challenge> or ?s=<seed>&e=<deck>
  const q = new URLSearchParams(location.search);
  const cId = q.get("c");
  const sParam = normSeed(q.get("s") || "");
  const eParam = Number(q.get("e")) || undefined;
  try {
    if (cId && /^[0-9a-z]{10}$/.test(cId)) {
      const r = await fetch(`/api/showdown?id=${cId}`);
      if (r.ok) {
        const rec = await r.json();
        pendingChallenge = { seed: rec.seed, edition: rec.edition };
        setUi({
          challenge: { id: rec.id, name: rec.name, ante: rec.ante, blind: rec.blind, cleared: rec.cleared, won: rec.won, best: rec.best?.total || 0, handName: rec.best?.handName || "" },
        });
        const ed = await fetchEdition(rec.edition);
        setUi({ edition: ed });
        return;
      }
    }
    if (sParam) {
      const sv = local.get<Saved | null>("kk.run", null);
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
  } catch (e) {
    setUi({ editionError: (e as Error).message });
  }
}

function postJson(url: string, body: string): Promise<{ id: string; url: string }> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("content-type", "application/json");
    x.onload = () => {
      let j: { id?: string; url?: string; error?: string } = {};
      try {
        j = JSON.parse(x.responseText);
      } catch {
        /* not json */
      }
      if (x.status >= 200 && x.status < 300 && j.id) res(j as { id: string; url: string });
      else rej(new Error(j.error || `HTTP ${x.status}`));
    };
    x.onerror = () => rej(new Error("network"));
    x.send(body);
  });
}

let pendingChallenge: { seed: string; edition: number } | null = null;

void boot();
