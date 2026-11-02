// HTML overlays: title, how to play, today's transfer list, the line-up, boss intros, the season over + challenge
// links, menus, coach tips, the Daily board, sign-in (through Para), team kits and the what's-new note.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { BOSS, BOSSES, COACHES, DRILLS, FINAL_BOSS, FIXTURE_NAME, LANES, MOUTH, PLAYS, RODS, ROUNDS, WIN_FANS } from "../shared/content.js";
import { GAME_TOKEN, PAIRS, SOURCE_URL, STAT, facePath, tokenUrl, type Launch } from "../shared/data.js";
import type { FigInfo } from "../shared/engine.js";
import { BASE_BLOCKS, BASE_TOUCHES, GOALS_TO_WIN, POSSESSIONS } from "../shared/engine.js";
import { ageLabel, figureFacts } from "../shared/insight.js";
import { audioState, setMusic, setSfx, unlock } from "./audio.js";
import { local, setUi, subscribe, toast, ui } from "./store.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { dayLabel, liveStreak, utcDay, type Streak } from "../shared/daily.js";
import { CHAIN_NAME, LOOKS, house, look, type Look } from "./house.js";
import { endSession, me, refreshProfile, startSession } from "./me.js";
import { PARA, openSignIn, short, signOut, warm } from "./signin.js";

export const VERSION = "2.0.0";
export const X_URL = "https://x.com/kyriektnrv";

export interface Shared {
  id: string;
  url: string;
  daily: string | null;
  house: boolean;
  verified: boolean;
}

export interface UiActions {
  newRun(): void;
  continueRun(): void;
  playSeed(raw: string): Promise<boolean>;
  restartSeed(): void;
  abandon(): void;
  acceptChallenge(): void;
  share(name: string): Promise<Shared | null>;
  dailyRun(): void;
  isDaily(): string | null;
  lookChanged(): void;
  seedLink(): string;
  swap(a: number, b: number): boolean;
  kickOff(): void;
  hasSaved(): boolean;
  playEntry(h: { id: string; name: string; round: number; cleared: number; won: boolean; total: number; style: string; seed: string; edition: number }): void;
}

/** Your best goal of a season, kept in this browser. */
export interface LocalGoal {
  total: number;
  style: string;
  seed: string;
  edition: number;
  round: number;
  cleared: number;
  figs: FigInfo[];
  at: number;
}

let A: UiActions;

const PAIR_HEX = ["#5ad7ff", "#ff7a3d", "#ff4fb4", "#ffd43b"];
const PAIR_SHAPE = ["◆", "▲", "●", "■"];
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

function useUi() {
  const [, set] = useState(0);
  const seen = ui.version;
  useEffect(() => {
    const off = subscribe(() => set((x) => x + 1));
    if (ui.version !== seen) set((x) => x + 1);
    return () => {
      off();
    };
  }, []);
  return ui;
}

function close() {
  setUi({ overlay: ui.run && !(ui.run.s.phase === "over" || ui.run.s.phase === "won") ? null : ui.run ? "over" : "title" });
}

function Modal(props: { title: string; children: preact.ComponentChildren; wide?: boolean; onClose?: () => void; accent?: string }) {
  return (
    <div class="ov-backdrop" onClick={(e) => e.target === e.currentTarget && (props.onClose || close)()}>
      <div class={"ov-panel" + (props.wide ? " wide" : "")} style={props.accent ? { borderColor: props.accent } : undefined} role="dialog" aria-label={props.title}>
        <div class="ov-head">
          <h2>{props.title}</h2>
          <button class="x" aria-label="Close" onClick={() => (props.onClose || close)()}>
            ×
          </button>
        </div>
        <div class="ov-body">{props.children}</div>
      </div>
    </div>
  );
}

function SoundToggles() {
  const [st, set] = useState(audioState());
  return (
    <div class="toggles">
      <button
        class={"pill" + (st.music ? " on" : "")}
        onClick={() => {
          unlock();
          setMusic(!st.music);
          set(audioState());
        }}
      >
        Music {st.music ? "on" : "off"}
      </button>
      <button
        class={"pill" + (st.sfx ? " on" : "")}
        onClick={() => {
          unlock();
          setSfx(!st.sfx);
          set(audioState());
        }}
      >
        Sound {st.sfx ? "on" : "off"}
      </button>
    </div>
  );
}

/** The small mark a $KICKER holder gets next to their name. Cosmetic only. */
function HouseMark() {
  return (
    <span class="hmark" title="$KICKER holder: team kits (cosmetic only)" aria-label="team kits">
      K
    </span>
  );
}

/** Next to a name its owner signed in for. Not the house mark: anyone can have this one. */
function VerifiedMark() {
  return (
    <span class="vmark" title="Verified: posted by the address that claimed this name" aria-label="verified name">
      ✓
    </span>
  );
}

/** What signing in through Para keeps, and what KICKER keeps. Shown in the kits modal, Your table and How to play. */
function Privacy() {
  return (
    <p class="privacy">
      <b>Privacy.</b> Para runs the sign-in and holds your login, plus the wallet it creates for you. KICKER stores no emails or passwords. If you never
      sign in, your seasons and settings stay in this browser, and the one thing sent anywhere is a season you choose to post, under the name you give
      it. Signed in, KICKER also keeps the name you claimed, your address and the seasons you post, so Your table can follow you to another device. It
      all runs on Robinhood Chain testnet: test tokens with no real value. KICKER has no use for your seed phrase, a private key or funds, and will not ask.
    </p>
  );
}

/** "Sign in", then the short address with a sign-out. Para loads on hover, focus or touch, never before. */
function SignInPill(props: { big?: boolean }) {
  const u = useUi();
  const cls = props.big ? "btn" : "pill";
  if (!PARA.available)
    return (
      <button class={cls + " signin off"} onClick={() => toast(PARA.note)} title={PARA.note}>
        Sign-in unavailable
      </button>
    );
  const pre = () => void warm()?.catch(() => null);
  if (u.signedIn)
    return (
      <span class={"signin-on" + (props.big ? " big" : "")}>
        <span class="addr" title={u.signedIn}>
          {short(u.signedIn)}
        </span>
        <button
          class={cls + " signout"}
          onPointerEnter={pre}
          onFocus={pre}
          onTouchStart={pre}
          onClick={() => {
            endSession();
            A.lookChanged();
            void signOut().catch((e) => toast(String((e as Error)?.message || e)));
          }}
        >
          Sign out
        </button>
      </span>
    );
  return (
    <button
      class={cls + " signin" + (u.signinBusy ? " busy" : "")}
      onPointerEnter={pre}
      onFocus={pre}
      onTouchStart={pre}
      onClick={() => void openSignIn().catch((e) => toast(String((e as Error)?.message || e)))}
    >
      {u.signinBusy ? "Opening sign-in..." : "Sign in"}
    </button>
  );
}

const streakNow = () => liveStreak(local.get<Streak | null>("kk.streak", null), utcDay());
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

// ------------------------------------------------------------ title
/** vibe/vibe vibers, redrawn in the game palette, strolling above and below the logo. */
function Parade(props: { rows: number }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/vibers/index.json")
      .then((r) => r.json())
      .then((all: string[]) => setNames(all.slice().sort(() => Math.random() - 0.5).slice(0, 16)))
      .catch(() => setNames([]));
  }, []);
  const row = (list: string[], cls: string) => (
    <div class={"parade " + cls} aria-hidden="true">
      {list.length > 0 && (
        <div class="track">
          {[...list, ...list, ...list, ...list].map((n, i) => (
            <img src={`/vibers/${n}.png`} alt="" width={96} height={96} style={{ animationDelay: `${(i % list.length) * 0.17}s` }} />
          ))}
        </div>
      )}
    </div>
  );
  return props.rows === 0 ? row(names.slice(0, 8), "up") : row(names.slice(8), "down");
}

const ICON_NOTE = "M9 3v10.6A3.5 3.5 0 1 0 11 17V7h6V3z";
const ICON_SPEAKER = "M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z";

function SoundIcons() {
  const [st, set] = useState(audioState());
  const one = (on: boolean, label: string, d: string, flip: () => void) => (
    <button class={"icon-toggle" + (on ? " on" : "")} aria-pressed={on} aria-label={label} title={`${label} ${on ? "on" : "off"}`} onClick={flip}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="currentColor" d={d} />
        {!on && <path d="M4 4l16 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />}
      </svg>
    </button>
  );
  return (
    <div class="corner corner-l">
      {one(st.music, "Music", ICON_NOTE, () => {
        unlock();
        setMusic(!st.music);
        set(audioState());
      })}
      {one(st.sfx, "Sound", ICON_SPEAKER, () => {
        unlock();
        setSfx(!st.sfx);
        set(audioState());
      })}
    </div>
  );
}

/** Top right of the title: a plain gold Sign in, or who you are (opens Your table, where sign-out lives). */
function AccountPill() {
  const u = useUi();
  if (!PARA.available)
    return (
      <div class="corner corner-r">
        <button class="acct off" onClick={() => toast(PARA.note)} title={PARA.note}>
          Sign-in unavailable
        </button>
      </div>
    );
  const pre = () => void warm()?.catch(() => null);
  if (u.signedIn) {
    const s = me.get();
    return (
      <div class="corner corner-r">
        <button class="acct in" onClick={() => setUi({ overlay: "table" })} onPointerEnter={pre} onFocus={pre} aria-label={`Your table, signed in as ${short(u.signedIn)}`}>
          {house.get() ? <HouseMark /> : null}
          <span class="addr">{s?.name || short(u.signedIn)}</span>
          {s && <VerifiedMark />}
        </button>
      </div>
    );
  }
  return (
    <div class="corner corner-r">
      <button
        class={"acct" + (u.signinBusy ? " busy" : "")}
        onPointerEnter={pre}
        onFocus={pre}
        onTouchStart={pre}
        onClick={() => void openSignIn().catch((e) => toast(String((e as Error)?.message || e)))}
      >
        <span class="k" aria-hidden="true">
          K
        </span>
        {u.signinBusy ? "Opening..." : "Sign in"}
      </button>
    </div>
  );
}

/** One figure, drawn in HTML: a round head with the launch's picture, shoulders in the kit, the ticker under it. */
function Fig(props: { l: { s: string; c: string | null; u: number }; i?: number; small?: boolean }) {
  const lk = look();
  return (
    <span
      class={"lfig" + (props.small ? " sm" : "")}
      style={{ "--i": props.i ?? 0, "--kit": hex(lk.kit), "--kithi": hex(lk.kitHi), "--trim": hex(lk.trim) } as Record<string, string | number>}
    >
      <span class="lbody" aria-hidden="true" />
      <img src={facePath(props.l.c, props.l.s)} alt="" width={64} height={64} />
      <span class="lpair" style={{ color: PAIR_HEX[props.l.u] }} aria-hidden="true">
        {PAIR_SHAPE[props.l.u]}
      </span>
      <span class="ltick">${props.l.s.slice(0, 7)}</span>
    </span>
  );
}

/** Five real launches from today's cut on a brass rod: the liveliest of each pair kind, and one more. */
function HeroLineup(props: { ed: NonNullable<typeof ui.edition> }) {
  const picks: Launch[] = [];
  const sorted = props.ed.pool.map((p) => p.slice().sort((a, b) => b.k + b.h - (a.k + a.h)));
  for (let i = 0; i < 5; i++) {
    const l = sorted[i % 4][Math.floor(i / 4)] || sorted[i % 4][0];
    if (l) picks.push(l);
  }
  if (picks.length < 5) return null;
  return (
    <div class="lineup" aria-hidden="true">
      <span class="lrod" />
      {picks.map((l, i) => (
        <Fig l={l} i={i - 2} />
      ))}
    </div>
  );
}

function CountUp(props: { n: number }) {
  const [v, set] = useState(0);
  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || props.n <= 0) {
      set(props.n);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      set(Math.round(props.n * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [props.n]);
  return <>{fmt(v)}</>;
}

function useClock(ms = 30_000) {
  const [now, set] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(t);
  }, []);
  return now;
}

const span = (mins: number) => (mins <= 0 ? "any minute now" : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`);

interface DayEntry {
  id: string;
  name: string;
  total: number;
  style: string;
  round: number;
  cleared: number;
  won: boolean;
  seed: string;
  edition: number;
  figs: FigInfo[];
  house?: boolean;
  verified?: boolean;
}

interface Board {
  day: string;
  seed: string;
  edition: number | null;
  players: number;
  entries: DayEntry[];
}

/** Desktop only, left of the title: today's Daily board, from the same CDN-cached reads the Hall uses. */
function DailyPanel() {
  const u = useUi();
  const now = useClock();
  const [board, setBoard] = useState<Board | null>(null);
  const [prev, setPrev] = useState<Board | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/hall?board=daily")
      .then((r) => r.json())
      .then((b: Board) => {
        setBoard(b);
        if (!b.entries.length) {
          const y = new Date(Date.parse((b.day || utcDay()) + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
          fetch(`/api/hall?board=daily&day=${y}`)
            .then((r) => r.json())
            .then(setPrev)
            .catch(() => null);
        }
      })
      .catch(() => setErr(true));
  }, []);
  const day = board?.day || u.daily?.day || utcDay();
  const players = board?.players ?? u.daily?.players ?? 0;
  const seed = board?.seed || u.daily?.seed;
  const edition = board?.edition ?? u.daily?.edition;
  const sess = me.get();
  const myName = (sess?.name || local.get<string>("kk.name", "") || "").toLowerCase();
  const myIdx = board && myName ? board.entries.findIndex((e) => e.name.toLowerCase() === myName) : -1;
  const streak = sess && u.profile ? liveStreak(u.profile.streak, utcDay()) : streakNow();
  const nextDaily = Math.max(0, Math.round((Date.parse(utcDay(new Date(now)) + "T00:00:00Z") + 86_400_000 - now) / 60000));
  const leader = board?.entries[0];
  return (
    <aside class="side side-l" aria-label="Today's Daily board">
      <h3>
        <span>Today's Daily board</span>
      </h3>
      <div class="side-meta">
        <span>
          <i class="ic">◷</i>
          {dayLabel(day)} (UTC)
        </span>
        <span>
          <i class="ic">☺</i>
          <b>
            <CountUp n={players} />
          </b>{" "}
          {players === 1 ? "player" : "players"}
        </span>
      </div>
      <p class="side-seed">
        Seed <b>{seed || "..."}</b>
        {edition ? ` on cut #${edition}` : ""}
      </p>
      <hr class="pix" />
      {err ? (
        <p class="side-note">The board is not answering right now.</p>
      ) : !board ? (
        <p class="side-note">Reading the board...</p>
      ) : board.entries.length ? (
        <>
          <ol class="side-board">
            {board.entries.slice(0, 10).map((e, i) => (
              <li class={(i === myIdx ? "me " : "") + (i >= 5 ? "lo2" : "")}>
                <span class="pos">{i + 1}</span>
                <span class="nm">
                  {e.house && <HouseMark />}
                  <b class="who">{e.name}</b>
                  {e.verified && <VerifiedMark />}
                </span>
                <b class="sc">
                  <CountUp n={e.total} />
                </b>
              </li>
            ))}
          </ol>
          {leader && (
            <p class="side-hint lo">
              Leader's best goal: <b>{leader.style}</b>
            </p>
          )}
        </>
      ) : (
        <div class="side-empty">
          <div class="empty-felt" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p class="side-note">Nobody has posted today. The board is yours.</p>
          {prev && prev.entries[0] && (
            <p class="side-hint">
              Yesterday: <b class="who">{prev.entries[0].name}</b> with <b class="m">{fmt(prev.entries[0].total)}</b> ({prev.entries[0].style})
            </p>
          )}
        </div>
      )}
      <hr class="pix" />
      <div class="side-rows">
        {myIdx >= 0 && board && (
          <p class="row-fact">
            <i class="ic">★</i>Your best today: <b>{fmt(board.entries[myIdx].total)}</b> (#{myIdx + 1})
          </p>
        )}
        <p class="row-fact">
          <i class="ic">♨</i>
          {sess ? "Your streak" : "Streak on this device"}: <b>{plural(streak, "day")}</b>
        </p>
        <p class="row-fact">
          <i class="ic">⏱</i>Next Daily Match in <b>{span(nextDaily)}</b>
        </p>
      </div>
      <button class="btn gold side-btn" onClick={() => A.dailyRun()}>
        Play the Daily Match
      </button>
    </aside>
  );
}

/** Desktop only, right of the title: live facts from the cut the page already loaded, each with the coach who cares. */
function CutPanel(props: { ed: NonNullable<typeof ui.edition> }) {
  const ed = props.ed;
  const now = useClock();
  const cutAt = Date.parse(ed.at) / 1000;
  const all = ed.pool.flatMap((p, u) => p.map((l) => ({ l, u })));
  const total = all.length;
  const counts = ed.pool.map((p) => p.length);
  const max = Math.max(1, ...counts);
  const power = ed.pool.map((p) => p.filter((l) => l.p >= STAT.power.at).length);
  const hot = all.slice().sort((a, b) => b.l.k - a.l.k || b.l.h - a.l.h).slice(0, 3);
  const youngest = all.slice().sort((a, b) => b.l.a - a.l.a)[0];
  const young = all.filter((c) => (cutAt - c.l.a) / 3600 < 6).length;
  const down = all.filter((c) => c.l.x !== null && c.l.x < 0).length;
  const held = all.filter((c) => c.l.h >= STAT.grip.at).length;
  const flown = all.filter((c) => c.l.g).length;
  const next = Math.round(((ed.id + 3) * 3_600_000 - now) / 60000);
  return (
    <aside class="side side-r" aria-label="In today's squad cut">
      <h3>
        <span>Today's transfer list</span>
      </h3>
      <div class="side-meta">
        <span>
          <i class="ic">#</i>Cut {ed.id} · {ago(ed.at)}
        </span>
      </div>
      <hr class="pix" />
      <ul class="side-bars">
        {PAIRS.map((s, i) => (
          <li>
            <span class="sl" style={{ color: PAIR_HEX[i] }}>
              {PAIR_SHAPE[i]} {s.name}
            </span>
            <span class="bar">
              <span style={{ width: `${(counts[i] / max) * 100}%`, background: PAIR_HEX[i] }} />
            </span>
            <b>
              <CountUp n={counts[i]} />
            </b>
            <small>{power[i]} with Power</small>
          </li>
        ))}
      </ul>
      <p class="side-hint lo">Power is 10% of the curve. The maxis lend it to their whole pair.</p>
      <hr class="pix" />
      <div class="side-hots">
        {hot.map((c) => (
          <div class="mini">
            <img src={facePath(c.l.c, c.l.s)} alt="" width={44} height={44} />
            <div>
              <b style={{ color: PAIR_HEX[c.u] }}>${c.l.s}</b>
              <span>{c.l.k.toLocaleString("en-US")} trades</span>
              <span>{c.l.h.toLocaleString("en-US")} holders</span>
            </div>
          </div>
        ))}
      </div>
      <p class="side-hint">
        The busiest three: Pace, a free slide every possession.<span class="lo"> Volume Guy lowers the bar to 3 trades.</span>
      </p>
      <hr class="pix" />
      <div class="side-rows">
        {youngest && (
          <p class="row-fact">
            <i class="ic">✦</i>Youngest: <b>${youngest.l.s}</b>, {ageLabel((cutAt - youngest.l.a) / 3600)} before the cut
            <small>Early Bird likes {young} under 6 h</small>
          </p>
        )}
        <p class="row-fact">
          <i class="ic">↓</i>
          <b>
            <CountUp n={down} />
          </b>{" "}
          of {total} are down
          <small>Dip Buyer gives them Grip</small>
        </p>
        <p class="row-fact">
          <i class="ic gold">★</i>
          <b class="gold">
            <CountUp n={held} />
          </b>{" "}
          with {STAT.grip.at}+ holders
          <small>Grip: keep the ball once when a pass is blocked</small>
        </p>
        <p class="row-fact lo2">
          <i class="ic">▲</i>
          <b>{flown}</b> flew the whole curve
          <small>Valedictorian picks your furthest along</small>
        </p>
        <p class="row-fact">
          <i class="ic">⏱</i>Next cut in <b>{span(next)}</b>
        </p>
      </div>
    </aside>
  );
}

function Title() {
  const u = useUi();
  const ed = u.edition;
  const ch = u.challenge;
  const saved = A.hasSaved();
  const live = ed
    ? `${ed.pool.reduce((n, p) => n + p.length, 0)} live launches on today's transfer list · new cut every few hours`
    : u.editionError
      ? "The launch index is not answering. Try again in a minute."
      : "Reading the newest launches...";
  return (
    <div class="title-screen">
      <Parade rows={0} />
      <SoundIcons />
      <AccountPill />
      <DailyPanel />
      {ed && <CutPanel ed={ed} />}
      <div class="title-main">
        <div class="logo" aria-label="KICKER">
          {"KICKER".split("").map((c, i) => (
            <span style={{ animationDelay: `${i * 0.12}s` }}>{c}</span>
          ))}
        </div>
        <p class="tag">Turn-based table football. Every figure on your rods is a live vibe/vibe launch.</p>
        <p class="live">{live}</p>
        {ch ? (
          <div class="challenge">
            <p>
              <b class="who">{ch.name || "Someone"}</b> challenged you on this seed: {ch.won ? "won the whole season" : `out in round ${ch.round}`}, best goal{" "}
              <b class="m">{fmt(ch.best)}</b>
              {ch.style ? ` (${ch.style})` : ""}.
            </p>
            <button class="btn gold" onClick={() => A.acceptChallenge()}>
              Take the challenge
            </button>
          </div>
        ) : ed ? (
          <HeroLineup ed={ed} />
        ) : (
          <div class="lineup empty" aria-hidden="true" />
        )}
        <div class="title-buttons">
          <div class="row play">
            {saved ? (
              <button class="btn big teal" onClick={() => A.continueRun()}>
                Continue season
              </button>
            ) : (
              <button class="btn big teal" disabled={!ed} onClick={() => A.newRun()}>
                {ed ? "New season" : u.editionError ? "Squad unavailable" : "Picking the squad..."}
              </button>
            )}
            <button class="btn big gold daily-btn" disabled={!u.daily && !ed} onClick={() => A.dailyRun()} aria-label="Daily Match">
              <span>Daily Match</span>
              <small>
                {u.daily ? `${u.daily.label} · ${u.daily.players ? plural(u.daily.players, "player") + " today" : "same squad for all"}` : dayLabel(utcDay())}
                {streakNow() > 1 ? ` · streak ${streakNow()}` : ""}
              </small>
            </button>
          </div>
          <div class="row three">
            <button class="btn" onClick={() => setUi({ overlay: "how" })}>
              How to play
            </button>
            <button class="btn" onClick={() => setUi({ overlay: "hall" })}>
              Hall of goals
            </button>
            <button class="btn" onClick={() => setUi({ overlay: "table" })}>
              Your table
            </button>
          </div>
          <div class="row links">
            {saved && ed && (
              <button class="textlink" onClick={() => A.newRun()}>
                New season instead
              </button>
            )}
            <button class="textlink" onClick={() => setUi({ overlay: "more" })}>
              More
            </button>
          </div>
        </div>
        <footer class="title-foot">
          <nav class="foot-links" aria-label="Links">
            <a href={GAME_TOKEN.url} target="_blank" rel="noopener">
              ${GAME_TOKEN.symbol} ↗
            </a>
            <a href={SOURCE_URL} target="_blank" rel="noopener">
              Source ↗
            </a>
            <a href={X_URL} target="_blank" rel="noopener">
              @kyriektnrv on X ↗
            </a>
          </nav>
          <p class="foot-note">Runs on Robinhood Chain testnet. Test tokens, no real value. No seed phrase, no key, no funds: KICKER has no use for them.</p>
        </footer>
      </div>
      <Parade rows={1} />
    </div>
  );
}

function More() {
  const u = useUi();
  return (
    <Modal title="More">
      <div class="menu more">
        <button class="btn" disabled={!u.edition} onClick={() => setUi({ overlay: "pool" })}>
          Today's transfer list
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "seed" })}>
          Play a friend's seed
        </button>
        <button class={"btn" + (house.get() ? " gold" : "")} onClick={() => setUi({ overlay: "house" })}>
          Team kits
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "news" })}>
          What's new in 2.0
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ how to play
function How() {
  return (
    <Modal title="How to play" wide>
      <section>
        <h3>The season</h3>
        <p>
          A season is {ROUNDS} rounds. Each round is a <b>friendly</b>, a <b>league match</b> and a <b>boss club</b>. A match goes to the first side to score{" "}
          {GOALS_TO_WIN} (the final: 3), with {POSSESSIONS} possessions each. Level at the whistle, a friendly or a league match lets you through without the win
          fans; a boss club has to be beaten. Lose a match and the season is over.
        </p>
      </section>
      <section>
        <h3>The table</h3>
        <p>
          Seen from above: four rods a side, interleaved like a real table. Keeper (1 figure), defence (2), midfield (5) and attack (3). The table is {LANES} lanes
          wide and the goal mouth is the middle {MOUTH[1] - MOUTH[0] + 1}. A rod slides one lane at a time and its figures move together.
        </p>
      </section>
      <section>
        <h3>Your ball</h3>
        <p>
          You get {BASE_TOUCHES} <b>touches</b> a possession. One touch is either a <b>slide</b> of one of your rods by one lane (the arrows under each rod), or a{" "}
          <b>kick</b> with the figure on the ball: a pass to a figure on one of your rods further up, or a shot. The ball runs straight, or one lane sideways for
          every rod it crosses, and comes back off the side walls. Any of their figures standing in its lane blocks it and wins the ball. The gold lines show
          your kicks; red ones are blocked.
        </p>
        <p>
          After every touch they slide to cover the most dangerous lane. When you win the ball they set up first. Out of touches, the ball goes dead to their
          keeper.
        </p>
      </section>
      <section>
        <h3>Their ball</h3>
        <p>
          They show where the ball can go: red lines for shots, amber for passes. You get {BASE_BLOCKS} <b>block slides</b> a possession. Slide into those lanes,
          then press <b>Ready</b> and they take their touch. Early clubs call their kick before you move; later ones read your blocks and pick the lane you
          left open.
        </p>
      </section>
      <section>
        <h3>Your figures are live launches</h3>
        <p>Each of your 11 figures is a launch from today's cut. Its picture is the head, its ticker underneath. Three stats come from three numbers:</p>
        <table class="map">
          <tbody>
            <tr>
              <td style={{ color: "#ff3d7f" }}>Power</td>
              <td>
                {STAT.power.from} {STAT.power.at / 100}% or more: {STAT.power.text}. Power is an attacker's thing.
              </td>
            </tr>
            <tr>
              <td style={{ color: "#27c4e8" }}>Pace</td>
              <td>
                {STAT.pace.at}+ {STAT.pace.from}: {STAT.pace.text}.
              </td>
            </tr>
            <tr>
              <td style={{ color: "#ffc23d" }}>Grip</td>
              <td>
                {STAT.grip.at}+ {STAT.grip.from}: {STAT.grip.text}.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Hover a figure (or hold it on a phone) for its data tag: holders, 24h trades, age, price direction, curve progress, and where each stat comes from.
          Keep holding for its page on vibe/vibe. Your squad is placed by its numbers, and you can move anyone in the Line-up before a match.
        </p>
      </section>
      <section>
        <h3>Boss clubs</h3>
        <ul class="bosses">
          {[...BOSSES, FINAL_BOSS].map((b) => (
            <li>
              <b>{b.name}</b>: {b.text}
              {b.id === "bell" ? ` (round ${ROUNDS} only)` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>The dressing room</h3>
        <p>
          A win brings fans: {WIN_FANS.join(" / ")} for a friendly, a league match and a boss club, plus one for every goal. Fans are only good for the dressing
          room, and every price is printed. The shelf is set by your seed; nothing on it is a surprise once you see it.
        </p>
        <ul class="bosses">
          <li>
            <b>Coaches</b> ({COACHES.length}, 5 seats): passive tactics, many of them reading the launches on your rods. Hover one to light the figures it
            works on.
          </li>
          <li>
            <b>Training</b>: {DRILLS.map((d) => d.name).join(", ")}. Levels stay for the season.
          </li>
          <li>
            <b>Set pieces</b> ({PLAYS.length} kinds, 2 slots): one use each, from the bench.
          </li>
        </ul>
      </section>
      <section>
        <h3>Goals are rated</h3>
        <p>
          A goal is worth more for every pass in the move, for an angle, for a shot off a side wall, for each blocker beaten with Power, from distance, and with
          touches to spare. Later rounds and boss clubs count for more. Your best goal goes to the <b>Hall of goals</b>.
        </p>
      </section>
      <section>
        <h3>Seeds and challenges</h3>
        <p>
          A season is fixed by its <b>seed</b> and its <b>cut number</b>: the same pair always picks the same squad, the same clubs and the same shelf, and the
          rivals play the same way. Send a seed link and a friend plays your exact season. When yours ends, make a challenge link: the server plays every touch
          again to check it, then draws an image for X.
        </p>
      </section>
      <section>
        <h3>Daily Match</h3>
        <p>
          One seed a day on the first cut after 00:00 UTC, the same for everybody. Finish it and post it with a name to get on the Daily board: one line per
          name, your best of the day counts.
        </p>
      </section>
      <section>
        <h3>Token and source</h3>
        <p>
          KICKER has its own launch on vibe/vibe:{" "}
          <a href={GAME_TOKEN.url} target="_blank" rel="noopener">
            ${GAME_TOKEN.symbol} ↗
          </a>
          . It is cosmetic only: holders can pick a team kit and get a small mark by their name. It never changes a figure, a rival or a result. Source:{" "}
          <a href={SOURCE_URL} target="_blank" rel="noopener">
            github.com/sirkicker/kicker ↗
          </a>
          . News:{" "}
          <a href={X_URL} target="_blank" rel="noopener">
            @kyriektnrv on X ↗
          </a>
        </p>
      </section>
      <section>
        <h3>Sign in</h3>
        <p>
          Optional. Sign in with email, Google, X, Discord or a wallet, through Para. One signed message a day claims your name (a ✓ in the Hall), keeps Your
          table on any device, and checks ${GAME_TOKEN.symbol} for team kits. Everything plays the same without it.
        </p>
        <Privacy />
      </section>
      <section>
        <h3>Where the figures come from</h3>
        <p>
          Every few hours the game reads the newest launches from the vibe/vibe v6 index. Farm bots (templated descriptions, generated names, numeric tickers,
          never-traded tokens, more than two launches from one creator) are left out. Per pair kind, the 10 liveliest plus the newest make today's transfer list
          of up to 30; your seed picks 11 of them. Desktop keys: H shows a good touch, Enter is Ready.
        </p>
        {ui.edition && (
          <p class="note">
            Current cut #{ui.edition.id}: {ago(ui.edition.at)} at block {ui.edition.block}, {ui.edition.scanned.toLocaleString("en-US")} launches read,{" "}
            {ui.edition.dropped.toLocaleString("en-US")} left out as farm bots or dead tokens, {ui.edition.pool.reduce((n, p) => n + p.length, 0)} on the list.
          </p>
        )}
      </section>
    </Modal>
  );
}

// ------------------------------------------------------------ the data tag (transfer list and line-up)
interface Inspect {
  title: string;
  lines: [string, string][];
  x: number;
  y: number;
  color: string;
}
let inspectNow: Inspect | null = null;
function showInspect(v: Inspect | null) {
  if (!v && !inspectNow) return;
  inspectNow = v;
  setUi({});
}
if (typeof window !== "undefined") {
  const hide = () => showInspect(null);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("wheel", hide, { passive: true });
  window.addEventListener("pointerdown", hide, true);
}

function InspectTag() {
  useUi();
  const v = inspectNow;
  if (!v) return null;
  const w = Math.min(340, innerWidth - 16);
  const left = Math.max(8, Math.min(innerWidth - w - 8, v.x - w / 2));
  const above = v.y > innerHeight * 0.55;
  return (
    <div
      class="inspect"
      role="tooltip"
      style={{ left: `${left}px`, width: `${w}px`, borderColor: v.color, ...(above ? { bottom: `${innerHeight - v.y + 10}px` } : { top: `${v.y + 10}px` }) }}
    >
      <b class="it" style={{ color: v.color }}>
        {v.title}
      </b>
      <dl>
        {v.lines.map(([k, val]) => (
          <>
            <dt>{k}</dt>
            <dd>{val}</dd>
          </>
        ))}
      </dl>
    </div>
  );
}

const ageAt = (l: Launch) => {
  const at = ui.run ? ui.run.s.editionAt : ui.edition ? Date.parse(ui.edition.at) / 1000 : l.a;
  return (at - l.a) / 3600;
};

let inspectTimer = 0;
let pressed = false;
let lastTouch = 0;
const realMouse = (e: PointerEvent) => e.pointerType === "mouse" && Date.now() - lastTouch > 1500;

/** A launch on the transfer list: picture, ticker, its three numbers. Hover or hold for the tag, tap for the launch in full. */
function PoolFig(props: { l: Launch; slot?: number; dim?: boolean; sel?: boolean; onPick?: () => void }) {
  const { l } = props;
  const run = ui.run;
  const src = run ? run.statSources(l) : null;
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const f = figureFacts(l, ageAt(l), src || undefined);
    showInspect({ ...f, x: r.left + r.width / 2, y: r.top < innerHeight * 0.55 ? r.bottom : r.top, color: PAIR_HEX[l.u] });
  };
  const st = src
    ? { power: src.power.length > 0, pace: src.pace.length > 0, grip: src.grip.length > 0 }
    : { power: l.p >= STAT.power.at, pace: l.k >= STAT.pace.at, grip: l.h >= STAT.grip.at };
  return (
    <div
      class={"pfig" + (props.dim ? " dim" : "") + (props.sel ? " sel" : "")}
      role="button"
      tabIndex={0}
      aria-label={`$${l.s}`}
      onPointerEnter={(e) => {
        if (!realMouse(e)) return;
        const el = e.currentTarget as HTMLElement;
        clearTimeout(inspectTimer);
        inspectTimer = window.setTimeout(() => show(el), 300);
      }}
      onPointerLeave={(e) => {
        clearTimeout(inspectTimer);
        if (realMouse(e)) showInspect(null);
      }}
      onPointerDown={(e) => {
        showInspect(null);
        pressed = false;
        if (e.pointerType === "mouse") return;
        lastTouch = Date.now();
        const el = e.currentTarget as HTMLElement;
        clearTimeout(inspectTimer);
        inspectTimer = window.setTimeout(() => {
          pressed = true;
          show(el);
        }, 420);
      }}
      onPointerUp={() => clearTimeout(inspectTimer)}
      onPointerCancel={() => clearTimeout(inspectTimer)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        if (pressed) {
          pressed = false;
          return;
        }
        showInspect(null);
        if (props.onPick) props.onPick();
        else setUi({ detail: { l, slot: props.slot } });
      }}
    >
      <div class="ptop" style={{ color: PAIR_HEX[l.u] }}>
        <span>{PAIR_SHAPE[l.u]}</span>
        <span class="stats">
          {st.power && <i class="s-pw">P</i>}
          {st.pace && <i class="s-pc">S</i>}
          {st.grip && <i class="s-gr">G</i>}
        </span>
      </div>
      <img src={facePath(l.c, l.s)} alt="" loading="lazy" width={64} height={64} />
      <div class="psym">${l.s}</div>
      <div class="pname">{l.n}</div>
      <div class="pstats">
        curve {(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}% · {l.k} trades · {l.h} holders
      </div>
      {!props.onPick && (
        <a href={tokenUrl(l.t)} target="_blank" rel="noopener">
          See the launch ↗
        </a>
      )}
    </div>
  );
}

function Pool() {
  const u = useUi();
  const [tab, setTab] = useState(0);
  const ed = u.run ? u.run.ed : u.edition;
  if (!ed) return null;
  const list = ed.pool[tab] || [];
  return (
    <Modal title={`Today's transfer list · cut #${ed.id}`} wide>
      <div class="tabs">
        {PAIRS.map((x, i) => (
          <button class={"pill" + (tab === i ? " on" : "")} style={{ color: PAIR_HEX[i] }} onClick={() => setTab(i)}>
            {PAIR_SHAPE[i]} {x.name} ({ed.pool[i].length})
          </button>
        ))}
      </div>
      <p class="note">
        Every seed picks 11 of these. Cut {ago(ed.at)} at block {ed.block}. P is Power ({STAT.power.at / 100}%+ curve), S is Pace ({STAT.pace.at}+ trades), G
        is Grip ({STAT.grip.at}+ holders).
      </p>
      <div class="pgrid">
        {list.map((l) => (
          <PoolFig l={l} />
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ the line-up: swap any two figures before a match
function Squad() {
  const u = useUi();
  const run = u.run;
  const [pick, setPick] = useState<number | null>(null);
  if (!run) return null;
  const s = run.s;
  const offPitch = s.phase === "fixture" || s.phase === "room";
  const tap = (slot: number) => {
    if (!offPitch) {
      setUi({ detail: { l: s.squad[slot], slot } });
      return;
    }
    if (pick === null) setPick(slot);
    else if (pick === slot) setPick(null);
    else {
      if (A.swap(pick, slot)) toast(`$${s.squad[slot].s} and $${s.squad[pick].s} swapped places`);
      setPick(null);
    }
  };
  return (
    <Modal title="Line-up" wide>
      <p class="note">
        {offPitch
          ? pick === null
            ? "Tap a figure, then tap another to swap their places. Power only counts up front (Pile-in Party lends it to the midfield); Pace helps the rod it stands on."
            : `Now tap where $${s.squad[pick].s} should go.`
          : "Swaps happen before a match. Tap a figure for its launch."}
      </p>
      {[3, 2, 1, 0].map((r) => (
        <section class="rodrow">
          <h3>
            {RODS[r].name} <small>({RODS[r].n})</small>
          </h3>
          <div class="pgrid">
            {Array.from({ length: RODS[r].n }, (_, f) => RODS[r].slot + f).map((slot) => (
              <PoolFig l={s.squad[slot]} slot={slot} sel={pick === slot} onPick={() => tap(slot)} />
            ))}
          </div>
        </section>
      ))}
      <button class="btn teal wide" onClick={() => close()}>
        Done
      </button>
    </Modal>
  );
}

// ------------------------------------------------------------ boss intro
function BossIntro() {
  const u = useUi();
  const run = u.run;
  if (!run) return null;
  const id = run.bossOf();
  if (!id) return null;
  const b = BOSS[id];
  const m = (run as unknown as { s: { round: number } }).s;
  return (
    <div class="ov-backdrop boss-bg" onClick={(e) => e.target === e.currentTarget && setUi({ overlay: null })}>
      <div class="ov-panel boss" role="dialog" aria-label={b.name}>
        <p class="boss-kicker">Round {m.round} · boss club</p>
        <div class="crest" aria-hidden="true">
          <span>{b.name.replace(/^The /, "").slice(0, 1)}</span>
        </div>
        <h2>{b.name}</h2>
        <p class="boss-rule">{b.text}.</p>
        <p class="note">{id === "bell" ? "Win this and the season is yours." : "Lose this one and the season ends here. Against a boss club, a draw is not enough."}</p>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "squad" })}>
            Line-up
          </button>
          <button class="btn big gold" onClick={() => A.kickOff()}>
            Kick off
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ menu
function Options() {
  const u = useUi();
  const run = u.run;
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Menu">
      {run && (
        <p class="note">
          Seed <b>{run.s.seed}</b> · cut #{run.s.edition} · round {Math.min(run.s.round, ROUNDS)}
        </p>
      )}
      <div class="menu">
        <button class="btn teal" onClick={() => setUi({ overlay: null })}>
          Resume
        </button>
        {run && (
          <button
            class="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(A.seedLink());
                setCopied(true);
              } catch {
                toast(A.seedLink());
              }
            }}
          >
            {copied ? "Seed copied" : "Copy seed"}
          </button>
        )}
        <button class="btn" onClick={() => setUi({ overlay: "how" })}>
          How to play
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "hall" })}>
          Hall of goals
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "pool" })}>
          Today's transfer list
        </button>
        <div class="row signin-row">
          <SignInPill big />
          <button class="btn" onClick={() => setUi({ overlay: "table" })}>
            Your table
          </button>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "house" })}>
            Team kits
          </button>
          <button class="btn" onClick={() => setUi({ overlay: "news" })}>
            What's new
          </button>
        </div>
        {run && (
          <button class="btn" onClick={() => A.restartSeed()}>
            Restart this seed
          </button>
        )}
        <button class="btn pink" onClick={() => A.abandon()}>
          Back to title
        </button>
        <SoundToggles />
      </div>
    </Modal>
  );
}

function SeedEntry() {
  const [v, set] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal title="Play a friend's seed">
      <p>Got a seed from a friend? Paste their link or code here.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          const ok = await A.playSeed(v);
          if (!ok) setErr("That doesn't look like a seed, or its squad cut is gone.");
        }}
      >
        <input class="field" value={v} onInput={(e) => set((e.target as HTMLInputElement).value)} placeholder="Link or code" autoFocus aria-label="Seed" />
        <button class="btn teal" type="submit">
          Kick off
        </button>
      </form>
      {err && <p class="err">{err}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ Hall of goals
function GoalFigs(props: { figs: FigInfo[] }) {
  return (
    <div class="hfigs">
      {props.figs.map((c) => (
        <a href={tokenUrl(c.t)} target="_blank" rel="noopener" title={`$${c.s}`}>
          <img src={facePath(c.c, c.s)} alt={c.s} width={36} height={36} />
          <span style={{ color: PAIR_HEX[c.u] }}>{c.s.slice(0, 5)}</span>
        </a>
      ))}
    </div>
  );
}

function HallRows(props: { entries: DayEntry[] }) {
  return (
    <ol class="hall">
      {props.entries.map((h, i) => (
        <li class="hrow">
          <div class="hpos">{i + 1}</div>
          <div class="hscore">{fmt(h.total)}</div>
          <div class="hmain">
            {h.house && <HouseMark />}
            <b class="who">{h.name}</b>
            {h.verified && <VerifiedMark />} · {h.style} · {h.won ? "won the season" : `round ${h.round}`}
            <GoalFigs figs={h.figs || []} />
          </div>
          <button class="btn small teal" onClick={() => A.playEntry(h)}>
            Play this seed
          </button>
        </li>
      ))}
    </ol>
  );
}

function Hall() {
  const [tab, setTab] = useState<"day" | "daily" | "mine">(local.get<string>("kk.hallTab", "day") === "daily" ? "daily" : "day");
  const [day, setDay] = useState<{ day: string; entries: DayEntry[] } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState(false);
  const [boardErr, setBoardErr] = useState(false);
  useEffect(() => {
    fetch("/api/hall")
      .then((r) => r.json())
      .then(setDay)
      .catch(() => setErr(true));
    fetch("/api/hall?board=daily")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => setBoardErr(true));
  }, []);
  const pick = (t: "day" | "daily" | "mine") => {
    setTab(t);
    local.set("kk.hallTab", t);
  };
  const mine = local.get<LocalGoal[]>("kk.goals", []);
  return (
    <Modal title="Hall of goals" wide>
      <div class="tabs">
        <button class={"pill" + (tab === "day" ? " on" : "")} onClick={() => pick("day")}>
          Today, everyone
        </button>
        <button class={"pill" + (tab === "daily" ? " on" : "")} onClick={() => pick("daily")}>
          Daily Match
        </button>
        <button class={"pill" + (tab === "mine" ? " on" : "")} onClick={() => pick("mine")}>
          Mine
        </button>
      </div>
      {tab === "daily" ? (
        <>
          <p class="note">
            Daily Match · {dayLabel(board?.day || utcDay())} (UTC): seed {board?.seed || "..."}
            {board?.edition ? ` on cut #${board.edition}` : ""}, the same squad for everybody. One line per name, the best season of the day counts, every touch
            played again on the server.{board && board.players ? ` ${plural(board.players, "player")} so far.` : ""}
          </p>
          <button class="btn gold wide" onClick={() => A.dailyRun()}>
            Play the Daily Match
          </button>
          {boardErr && <p class="err">The Daily board is not answering right now.</p>}
          {board && !board.entries.length && <p>Nobody has posted today's match yet. The first line is yours.</p>}
          {board && <HallRows entries={board.entries} />}
        </>
      ) : tab === "day" ? (
        <>
          <p class="note">
            The best goals of {day?.day || "today"} (UTC), from seasons the server played back touch by touch. Finish a season and make a challenge link with a
            name to get in.
          </p>
          {err && <p class="err">The Hall is not answering right now.</p>}
          {day && !day.entries.length && <p>No goals posted yet today. Be the first.</p>}
          {day && <HallRows entries={day.entries} />}
        </>
      ) : (
        <>
          {!mine.length && <p>Nothing yet. The best goal of each of your seasons lands here (kept in this browser only).</p>}
          <div class="hall">
            {mine.map((h) => (
              <div class="hrow">
                <div class="hscore">{fmt(h.total)}</div>
                <div class="hmain">
                  <b>{h.style}</b> · round {h.round} · seed {h.seed}
                  <GoalFigs figs={h.figs} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ a launch, in full
function FigureDetail() {
  const u = useUi();
  const d = u.detail;
  if (!d) return null;
  const l = d.l;
  const col = PAIR_HEX[l.u];
  const ch = l.x === null ? null : l.x / 100;
  const run = u.run;
  const src = run ? run.statSources(l) : null;
  const role = d.slot === undefined ? null : RODS[d.slot === 0 ? 0 : d.slot <= 2 ? 1 : d.slot <= 7 ? 2 : 3].name;
  const badges: [string, string][] = [];
  if (src ? src.power.length : l.p >= STAT.power.at) badges.push(["POWER", "pw"]);
  if (src ? src.pace.length : l.k >= STAT.pace.at) badges.push(["PACE", "pc"]);
  if (src ? src.grip.length : l.h >= STAT.grip.at) badges.push(["GRIP", "gr"]);
  if (l.d) badges.push(["GIFT LIST", "gift"]);
  return (
    <div class="ov-backdrop top" onClick={(e) => e.target === e.currentTarget && setUi({ detail: null })}>
      <div class="ov-panel detail" style={{ borderColor: col }} role="dialog" aria-label={`$${l.s} details`}>
        <div class="ov-head">
          <h2 style={{ color: col }}>
            {PAIR_SHAPE[l.u]} ${l.s}
          </h2>
          <button class="x" aria-label="Close" onClick={() => setUi({ detail: null })}>
            ×
          </button>
        </div>
        <div class="ov-body">
          <div class="dhead">
            <img src={facePath(l.c, l.s) + "&z=big"} alt={l.n} width={140} height={140} />
            <div>
              <div class="dn">{l.n}</div>
              <div class="dq">
                {PAIRS[l.u].name} · paired with {l.q}
                {role ? ` · plays ${role.toLowerCase()}` : ""}
              </div>
              <div class="badges">
                {badges.map(([b, c]) => (
                  <span class={"badge " + c}>{b}</span>
                ))}
              </div>
            </div>
          </div>
          <div class="meter" aria-label="Curve progress">
            <div class="mfill" style={{ width: `${Math.min(100, l.p / 100)}%`, background: col }} />
            <span>
              Curve {(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}%{l.g ? " · the whole curve flown" : ""}
            </span>
          </div>
          <div class="dfacts">
            <div>
              <small>Price</small>
              <b class={ch === null ? "" : ch >= 0 ? "up" : "down"}>{ch === null ? "n/a" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}</b>
            </div>
            <div>
              <small>Trades 24h</small>
              <b>{l.k.toLocaleString("en-US")}</b>
            </div>
            <div>
              <small>Holders</small>
              <b>{l.h.toLocaleString("en-US")}</b>
            </div>
            <div>
              <small>Age at the cut</small>
              <b>{ageLabel(ageAt(l))}</b>
            </div>
          </div>
          <p class="note">Numbers as of the cut, every few hours. Power from {STAT.power.at / 100}% of the curve, Pace from {STAT.pace.at} trades, Grip from {STAT.grip.at} holders.</p>
          <a class="btn gold wide" href={tokenUrl(l.t)} target="_blank" rel="noopener">
            Open ${l.s} on vibe/vibe ↗
          </a>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the season is over
/** Save the share image: the system share sheet where there is one, otherwise the picture in a tab of its own. */
async function saveImage(id: string, seed: string) {
  const url = `/api/felt?id=${id}`;
  try {
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.canShare && nav.share) {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `kicker-${seed}.png`, { type: "image/png" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "KICKER" });
        return;
      }
    }
  } catch {
    /* fall through to the tab */
  }
  window.open(url, "_blank", "noopener");
  toast("The image opened in a new tab: right-click or long-press it to keep it.");
}

function Over() {
  const u = useUi();
  const run = u.run;
  const [name, setName] = useState(me.get()?.name || local.get<string>("kk.name", ""));
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<Shared | null>(null);
  const [copied, setCopied] = useState(false);
  const [nameErr, setNameErr] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);
  if (!run) return null;
  const s = run.s;
  const won = s.phase === "won";
  const ch = u.challenge;
  const beat = ch && (s.cleared > ch.cleared || (s.cleared === ch.cleared && (s.best?.total || 0) > ch.best));
  const full = link ? `${location.origin}${link.url}` : "";
  const daily = A.isDaily();
  const hs = house.get();
  const marked = !!hs && !!name.trim() && cleanName(name).toLowerCase() === hs.name.toLowerCase();
  const sess = me.get();
  const verified = !!sess && !!name.trim() && cleanName(name).toLowerCase() === sess.name.toLowerCase();
  const streak = streakNow();
  const m = s.match;
  const brag = daily
    ? `Daily Match · ${dayLabel(daily)} · best goal ${fmt(s.best?.total || 0)} on KICKER, turn-based table football with live vibe/vibe launches on the rods. Same squad for everybody today. Beat it:`
    : `${won ? "Won the whole season" : `Reached round ${s.round}`} on KICKER, turn-based table football with live vibe/vibe launches on the rods. Best goal: ${fmt(s.best?.total || 0)}${s.best ? ` (${s.best.style})` : ""}. Same seed, same season. Beat it:`;
  return (
    <Modal title={won ? "Champions" : "Season over"} accent={won ? "#ffc23d" : "#ff3d7f"} onClose={() => setUi({ overlay: "over" })}>
      <div class="over">
        <div class="ostats">
          <div>
            <small>Round</small>
            <b>{Math.min(s.round, ROUNDS)}</b>
          </div>
          <div>
            <small>Matches won</small>
            <b>{s.cleared}</b>
          </div>
          <div>
            <small>Best goal</small>
            <b class="m">{fmt(s.best?.total || 0)}</b>
          </div>
        </div>
        <p class="note">
          {won
            ? "You beat the Closing Bell."
            : `Out to ${m?.club || "a boss club"} in round ${s.round}${m ? `, ${m.score[0]}:${m.score[1]}` : ""}. ${FIXTURE_NAME[s.kind]}.`}{" "}
          {s.goalsFor} goals for, {s.goalsAgainst} against{s.best ? `. Best goal: ${s.best.style}.` : "."}
        </p>
        {daily && (
          <p class="daily-tag">
            Daily Match · {dayLabel(daily)}
            {streak > 0 ? ` · streak ${plural(streak, "day")}` : ""}
          </p>
        )}
        <div class="seedline">
          <span>
            Seed <b>{s.seed}</b> · cut #{s.edition}
          </span>
          <button
            class="pill"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(A.seedLink());
                setSeedCopied(true);
              } catch {
                toast(A.seedLink());
              }
            }}
          >
            {seedCopied ? "Seed copied" : "Copy seed"}
          </button>
        </div>
        {ch && <p class={"vs " + (beat ? "win" : "")}>{beat ? `You beat ${ch.name || "the challenger"}.` : `${ch.name || "The challenger"} still leads: round ${ch.round}, best goal ${fmt(ch.best)}.`}</p>}
        {!link ? (
          <form
            class="share"
            onSubmit={async (e) => {
              e.preventDefault();
              const problem = name.trim() ? nameProblem(name) : null;
              if (problem) {
                setNameErr(problem);
                return;
              }
              setNameErr("");
              setBusy(true);
              local.set("kk.name", cleanName(name));
              const r = await A.share(name);
              setBusy(false);
              if (r) setLink(r);
            }}
          >
            <input
              class="field"
              maxLength={12}
              value={name}
              placeholder="Your name, 3-12 letters"
              aria-label="Name"
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value);
                setNameErr("");
              }}
            />
            <small class="hint">
              {nameErr ? (
                <span class="err">{nameErr}</span>
              ) : daily ? (
                "With a name, this season enters the Daily board (your best of the day counts) and today's Hall of goals."
              ) : (
                "With a name, your best goal also enters today's Hall of goals."
              )}
              {!nameErr && verified ? " Signed in: your name is verified and the season goes to Your table." : ""}
              {!nameErr && marked ? " Your house mark rides along." : ""}
            </small>
            <button class="btn gold" disabled={busy} type="submit">
              {busy ? "Checking your season..." : "Make a challenge link"}
            </button>
          </form>
        ) : (
          <div class="shared">
            <img src={`/api/felt?id=${link.id}`} alt="Challenge image: the figures of the best goal" width={600} height={315} />
            {link.daily && <p class="note">Posted to the Daily board for {dayLabel(link.daily)}. The best 50 names of the day are shown.{link.house ? " House mark on." : ""}</p>}
            <input class="field" readOnly value={full} onFocus={(e) => (e.target as HTMLInputElement).select()} aria-label="Challenge link" />
            <div class="row">
              <button
                class="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(full);
                    setCopied(true);
                  } catch {
                    toast("Copy the link above");
                  }
                }}
              >
                {copied ? "Copied" : "Copy challenge link"}
              </button>
              <button class="btn" onClick={() => void saveImage(link.id, s.seed)}>
                Save image
              </button>
              <a class="btn gold" target="_blank" rel="noopener" href={`https://x.com/intent/post?text=${encodeURIComponent(brag)}&url=${encodeURIComponent(full)}`}>
                Post on X
              </a>
            </div>
          </div>
        )}
        <div class="row">
          <button class="btn teal" onClick={() => A.restartSeed()}>
            Same seed again
          </button>
          <button class="btn pink" onClick={() => A.newRun()}>
            New season
          </button>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "squad" })}>
            See the squad
          </button>
          <button class="btn" onClick={() => setUi({ overlay: "title" })}>
            Title
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ team kits ($KICKER holders, cosmetic only)
function Swatch(props: { lk: Look; on: boolean; locked: boolean; onPick: () => void }) {
  const { lk } = props;
  return (
    <button class={"swatch" + (props.on ? " on" : "")} disabled={props.locked} onClick={props.onPick} aria-pressed={props.on} style={{ borderColor: props.on ? hex(lk.trim) : undefined }}>
      <span class="sw-kit" style={{ background: `linear-gradient(90deg, ${hex(lk.kit)} 0 60%, ${hex(lk.kitHi)} 60% 100%)`, borderColor: hex(lk.trim) }}>
        <b style={{ color: hex(lk.trim) }}>K</b>
      </span>
      <span class="sw-felt" style={{ background: hex(lk.felt), borderColor: hex(lk.feltHi) }} />
      <span class="sw-name">{lk.name}</span>
      <small>{props.locked ? "holders" : lk.blurb}</small>
    </button>
  );
}

function House() {
  const u = useUi();
  const [name, setName] = useState(local.get<string>("kk.name", ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, bump] = useState(0);
  const hs = house.get();
  const cur = look();
  useEffect(() => {
    if (PARA.available) void warm()?.catch(() => null);
  }, []);
  const pickLook = (id: string) => {
    local.set("kk.look", id);
    A.lookChanged();
    bump((x) => x + 1);
  };
  const sign = async () => {
    setErr("");
    const problem = nameProblem(name);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    try {
      const n = cleanName(name);
      local.set("kk.name", n);
      const r = await startSession(n);
      if (r.house) {
        if (look().id === "house") local.set("kk.look", LOOKS[1].id);
        toast("Team kits on. Same figures, same rivals, a sharper shirt.");
      } else
        toast(
          r.holder === null
            ? `Signed in as ${r.name}. Robinhood Chain testnet is not answering, so no kits for now.`
            : `Signed in as ${r.name}. No $${GAME_TOKEN.symbol} on this address, so the house kit stays. Everything else plays the same.`,
        );
      A.lookChanged();
    } catch (e) {
      const m = String((e as { message?: string })?.message || e);
      setErr((e as { code?: number })?.code === 4001 || /reject|denied|cancel/i.test(m) ? "You closed the signature. Nothing left this page." : m);
    }
    setBusy(false);
  };
  const endsIn = hs ? Math.max(1, Math.round((hs.expires - Date.now()) / 3_600_000)) : 0;
  return (
    <Modal title="Team kits">
      <p>
        Hold any amount of <b>${GAME_TOKEN.symbol}</b> and your side changes shirts: three more kits and felts, and a small <HouseMark /> next to your name in the
        Hall of goals and on share images. Nothing else.
      </p>
      <p class="plain">Cosmetic only. A kit never changes a figure, a rival or a result. Without signing in you lose nothing: every match plays the same.</p>
      <div class="swatches">
        {LOOKS.map((lk) => (
          <Swatch lk={lk} on={cur.id === lk.id} locked={!hs && lk.id !== "house"} onPick={() => pickLook(lk.id)} />
        ))}
      </div>
      {hs ? (
        <div class="house-on">
          <p>
            <HouseMark /> On for <b class="who">{hs.name}</b> ({short(hs.address)}) for about {plural(endsIn, "hour")}, until the UTC day ends. Use that name on a
            challenge link and the mark rides along. Tomorrow, sign again.
          </p>
          <button
            class="btn small"
            onClick={() => {
              house.set(null);
              A.lookChanged();
              bump((x) => x + 1);
            }}
          >
            Switch it off
          </button>
        </div>
      ) : (
        <form
          class="share"
          onSubmit={(e) => {
            e.preventDefault();
            if (!PARA.available) toast(PARA.note);
            else if (u.signedIn) void sign();
            else void openSignIn().catch((er) => setErr(String((er as Error)?.message || er)));
          }}
        >
          <p class="via">
            Sign in with email, Google, X, Discord or a wallet, through Para. A Para wallet is made for you if you have none; it starts with no ${GAME_TOKEN.symbol}.
          </p>
          {u.signedIn && PARA.available && (
            <>
              <input
                class="field"
                maxLength={12}
                value={name}
                placeholder="Your name, 3-12 letters"
                aria-label="Name"
                onInput={(e) => {
                  setName((e.target as HTMLInputElement).value);
                  setErr("");
                }}
              />
              <small class="hint">
                Signed in as {short(u.signedIn)}. One signed message claims this name for your address and checks ${GAME_TOKEN.symbol} for today (UTC).
              </small>
            </>
          )}
          {!PARA.available ? (
            <p class="note off">{PARA.note}</p>
          ) : (
            <button class="btn gold" type="submit" disabled={busy || u.signinBusy}>
              {busy ? "Waiting for the signature..." : u.signedIn ? "Sign once for today" : u.signinBusy ? "Opening sign-in..." : "Sign in"}
            </button>
          )}
        </form>
      )}
      {err && <p class="err">{err}</p>}
      <div class="safety">
        <b>Plain terms.</b> It's all on {CHAIN_NAME}. You sign a plain text message: no gas, no transaction, no approval, nothing moves. The server reads your{" "}
        {"$" + GAME_TOKEN.symbol} balance and that's it.
      </div>
      <Privacy />
    </Modal>
  );
}

// ------------------------------------------------------------ your table (signed in: from the server; signed out: this device)
function Table() {
  const u = useUi();
  const sess = me.get();
  const [name, setName] = useState(sess?.name || local.get<string>("kk.name", ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (sess) void refreshProfile();
    else if (PARA.available && u.signedIn) void warm()?.catch(() => null);
  }, []);
  const p = sess ? u.profile : null;
  const mine = local.get<LocalGoal[]>("kk.goals", []);
  const streak = p ? liveStreak(p.streak, utcDay()) : streakNow();
  const bestStreak = p ? p.streak?.best || 0 : local.get<Streak | null>("kk.streak", null)?.best || 0;
  const claim = async () => {
    setErr("");
    const problem = nameProblem(name);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    try {
      const r = await startSession(name);
      A.lookChanged();
      toast(`${r.name} is yours. Seasons you post under it are verified and follow you to any device.`);
    } catch (e) {
      const m = String((e as Error)?.message || e);
      setErr(/reject|denied|cancel/i.test(m) ? "You closed the signature. Nothing left this page." : m);
    }
    setBusy(false);
  };
  return (
    <Modal title="Your table" wide>
      <div class="table-head">
        <div>
          <b class="who">{sess?.name || local.get<string>("kk.name", "") || "No name yet"}</b>
          {sess && <VerifiedMark />}
          {house.get() && <HouseMark />}
          <br />
          <small class="note">{u.signedIn ? short(u.signedIn) : "Signed out: this device's record only."}</small>
          {u.signedIn && PARA.available && (
            <div>
              <button
                class="btn small signout"
                onClick={() => {
                  endSession();
                  A.lookChanged();
                  void signOut().catch((e) => toast(String((e as Error)?.message || e)));
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
        <div class="tstat">
          <small>Daily streak</small>
          <b class="m">{streak}</b>
          <small>best {bestStreak}</small>
        </div>
      </div>
      {!PARA.available ? (
        <p class="note">{PARA.note}</p>
      ) : !u.signedIn ? (
        <div class="row">
          <SignInPill big />
          <p class="note">Sign in to claim your name and keep this record on any device: your Daily streak, your best goal of each day, your last 30 seasons.</p>
        </div>
      ) : !sess ? (
        <form
          class="share"
          onSubmit={(e) => {
            e.preventDefault();
            void claim();
          }}
        >
          <input
            class="field"
            maxLength={12}
            value={name}
            placeholder="Your name, 3-12 letters"
            aria-label="Name"
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value);
              setErr("");
            }}
          />
          <small class="hint">
            One signed message a day claims this name for {short(u.signedIn)}: after that, nobody else can post under it. Plain text, no gas, nothing moves.
          </small>
          <button class="btn gold" type="submit" disabled={busy || u.signinBusy}>
            {busy ? "Waiting for the signature..." : "Sign once for today"}
          </button>
        </form>
      ) : null}
      {err && <p class="err">{err}</p>}
      <section>
        <h3>Best goals</h3>
        {p ? (
          p.best.length ? (
            <ol class="mybest">
              {p.best.slice(0, 10).map((b) => (
                <li>
                  <span class="d">{dayLabel(b.day)}</span> <b class="m">{fmt(b.total)}</b> {b.style} <a href={`/c/${b.id}`}>replay ↗</a>
                </li>
              ))}
            </ol>
          ) : (
            <p class="note">No verified seasons yet. Post one with your name and it lands here.</p>
          )
        ) : mine.length ? (
          <ol class="mybest">
            {mine.slice(0, 10).map((h) => (
              <li>
                <b class="m">{fmt(h.total)}</b> {h.style} · round {h.round} <a href={`/?s=${h.seed}&e=${h.edition}`}>play this seed ↗</a>
              </li>
            ))}
          </ol>
        ) : (
          <p class="note">Nothing yet. The best goal of each season lands here.</p>
        )}
      </section>
      {p && (
        <section>
          <h3>Recent seasons</h3>
          {p.recent.length ? (
            <ol class="myruns">
              {p.recent.map((r) => (
                <li>
                  <span class="d">{dayLabel(r.at.slice(0, 10))}</span> {r.won ? "won the season" : `round ${r.round}`} · <b class="m">{fmt(r.total)}</b> {r.style}
                  {r.daily ? " · Daily Match" : ""} <a href={`/c/${r.id}`}>replay ↗</a> <a href={`/?s=${r.seed}&e=${r.edition}`}>same seed ↗</a>
                </li>
              ))}
            </ol>
          ) : (
            <p class="note">No seasons posted yet.</p>
          )}
        </section>
      )}
      <Privacy />
    </Modal>
  );
}

// ------------------------------------------------------------ what's new (once per device, then from the menu)
function News() {
  useEffect(() => {
    local.set("kk.news", VERSION);
  }, []);
  return (
    <Modal title={`What's new · ${VERSION.replace(/\.0$/, "")}`}>
      <section>
        <h3>Table football</h3>
        <p>
          Kicker is what the Germans call table football, and now the name means what it says. KICKER 2.0 is a turn-based table football season: four rods a
          side, touches instead of a clock, and a rival that reacts to every one of them.
        </p>
      </section>
      <section>
        <h3>Your rods are live launches</h3>
        <p>
          Your eleven figures come from today's cut of vibe/vibe launches. Curve progress gives Power, trades give Pace, holders give Grip. The numbers are the
          real ones, and the data tag shows exactly which one does what.
        </p>
      </section>
      <section>
        <h3>A season, not a table of luck</h3>
        <p>
          Eight rounds of friendlies, league matches and ten boss clubs. Fans from wins and goals buy coaches, training and set pieces at printed prices. Every
          season is fixed by its seed, and the server replays it touch by touch.
        </p>
      </section>
      <section>
        <h3>Same table, same look</h3>
        <p>The wine and teal, the felt, the vibers, the gold sign-in, the sound. Your $KICKER kit is still cosmetic only.</p>
      </section>
      <div class="row">
        <button class="btn gold" onClick={() => A.dailyRun()}>
          Play the Daily Match
        </button>
        <button class="btn" onClick={() => close()}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

function Coach() {
  const u = useUi();
  if (!u.coach || u.overlay) return null;
  const ph = u.run?.s.phase;
  return (
    <div class={"coach " + (ph === "attack" || ph === "defend" ? "in-round" : "in-menu")} role="status">
      <p>{u.coach.text}</p>
      <div class="row">
        <button class="btn small" onClick={() => setUi({ coach: null })}>
          Got it
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const u = useUi();
  return u.toast ? <div class="toast">{u.toast}</div> : null;
}

function App() {
  const u = useUi();
  return (
    <>
      {u.overlay === "title" && <Title />}
      {u.overlay === "how" && <How />}
      {u.overlay === "pool" && <Pool />}
      {u.overlay === "squad" && <Squad />}
      {u.overlay === "boss" && <BossIntro />}
      {u.overlay === "options" && <Options />}
      {u.overlay === "seed" && <SeedEntry />}
      {u.overlay === "hall" && <Hall />}
      {u.overlay === "over" && <Over />}
      {u.overlay === "house" && <House />}
      {u.overlay === "news" && <News />}
      {u.overlay === "table" && <Table />}
      {u.overlay === "more" && <More />}
      <FigureDetail />
      <InspectTag />
      <Coach />
      <Toast />
      {u.overlay === null && u.run && (u.run.s.phase === "over" || u.run.s.phase === "won") && (
        <button class="btn gold floating" onClick={() => setUi({ overlay: "over" })}>
          Results
        </button>
      )}
    </>
  );
}

export function mountUi(el: HTMLElement, actions: UiActions) {
  A = actions;
  render(<App />, el);
}
