// HTML overlays: title, how to play, today's transfer list, the line-up, boss intros, the season over + challenge
// links, menus, coach tips, the Daily board, sign-in (through Para), team kits and the what's-new note.
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { BOSSES, COACHES, DRAW_FANS_R3, DRILLS, FINAL_BOSS, GHOST_RULES, HAUNT, LANES, LEAGUE_CLUBS, MOUTH, PLAYS, RODS, ROUNDS_R3, STYLES, TABLE_EVENTS, TABLE_EVENT_IDS, WIN_FANS, WIN_FANS_R3 } from "../shared/content.js";
import { GAME_TOKEN, PAIRS, SOURCE_URL, STAT, facePath, tokenUrl, type Launch } from "../shared/data.js";
import type { FigInfo, Step } from "../shared/engine.js";
import { BASE_BLOCKS, BASE_TOUCHES, GOALS_TO_WIN, POSSESSIONS, parseTrail, rerun } from "../shared/engine.js";
import { ageLabel, figureFacts } from "../shared/insight.js";
import { audioState, setMusic, setSfx, unlock } from "./audio.js";
import { local, screenNow, setUi, toast, ui } from "./store.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { dayLabel, liveStreak, utcDay, type Streak } from "../shared/daily.js";
import { CHAIN_NAME, LOOKS, house, look, type Look } from "./house.js";
import { endSession, me, refreshProfile, startSession } from "./me.js";
import { PARA, openSignIn, short, signOut, warm } from "./signin.js";
import { HAUNT_UNTIL, hauntKit, hauntOn } from "./haunt.js";
import type { RunMode } from "../shared/engine.js";
import type { Edition } from "../shared/data.js";
import { Fig, PAIR_HEX, PAIR_SHAPE, PathFelt, fmt, hex, useUi } from "./kit.js";
import { BossIntro, LeagueTable, Programme, Stage, bindScreens } from "./screens.js";

export const VERSION = "3.0.0";
export const X_URL = "https://x.com/kicker_art";

export interface Shared {
  id: string;
  url: string;
  daily: string | null;
  house: boolean;
  verified: boolean;
  kit: boolean;
}

export interface UiActions {
  newRun(mode?: RunMode): void;
  savedMode(): RunMode | null;
  playPending(): void;
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
  playEntry(h: { id: string; name: string; round: number; cleared: number; won: boolean; total: number; style: string; seed: string; edition: number; mode?: string }): void;
  /** The table can play the season's best goal again (Game.playReplay). */
  canReplay(): boolean;
  replay(): Promise<void> | null;
  /** A squad cut, from the page's cache or the server (the Hall's path thumbnails replay posted trails on it). */
  edition(id: number): Promise<Edition>;
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
  /** The goal's move (3.0), kept in this browser for the Hall's thumbnail. */
  path?: Step[][];
  scorer?: FigInfo;
}

let A: UiActions;

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

/** The Haunted kit: won a Haunted table match during the event. Cosmetic only. */
function HauntMark() {
  return (
    <span class="gmark" title="Haunted kit: won a match on the Haunted table during the event (cosmetic only)" aria-label="Haunted kit">
      ☾
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

/** Five real launches from today's cut on a brass rod, passing a ball along the line and into the net. */
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
      <span class="lnet" />
      {picks.map((l, i) => (
        <Fig l={l} i={i} />
      ))}
      <span class="lball" />
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
  mode?: string;
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
          <EmptyGoal />
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
    </aside>
  );
}

/** An empty goal on the felt, the ball waiting to the side: nobody has scored on today's board yet. */
function EmptyGoal() {
  const net: preact.JSX.Element[] = [];
  for (let x = 62; x < 142; x += 8) net.push(<line x1={x} y1={22} x2={x} y2={78} />);
  for (let y = 26; y < 78; y += 8) net.push(<line x1={56} y1={y} x2={144} y2={y} />);
  return (
    <svg class="empty-goal" viewBox="0 0 200 92" aria-hidden="true" shape-rendering="crispEdges">
      <rect x="0" y="78" width="200" height="14" fill="#0c3438" />
      <rect x="0" y="78" width="200" height="2" fill="#14494e" />
      <rect x="56" y="20" width="88" height="58" fill="rgba(0,0,0,0.22)" />
      <g stroke="rgba(255,241,220,0.3)" stroke-width="1">
        {net}
      </g>
      <rect x="50" y="14" width="6" height="66" fill="#fff1dc" />
      <rect x="144" y="14" width="6" height="66" fill="#fff1dc" />
      <rect x="50" y="14" width="100" height="6" fill="#fff1dc" />
      <rect x="50" y="80" width="100" height="3" fill="rgba(0,0,0,0.35)" />
      <circle cx="174" cy="73" r="6" fill="#fff1dc" stroke="#1a0816" stroke-width="2" />
      <rect x="171" y="70" width="4" height="4" fill="#1a0816" />
    </svg>
  );
}

/** Desktop only, right of the title: three launches from today's cut, one for each stat, big. */
function CutPanel(props: { ed: NonNullable<typeof ui.edition> }) {
  const ed = props.ed;
  const now = useClock();
  const all = ed.pool.flat();
  const total = all.length;
  const by = (f: (l: Launch) => number) => all.slice().sort((a, b) => f(b) - f(a) || a.s.localeCompare(b.s))[0];
  const power = by((l) => l.p);
  const pace = by((l) => l.k);
  const grip = by((l) => l.h);
  const next = Math.round(((ed.id + 3) * 3_600_000 - now) / 60000);
  const hero = (l: Launch | undefined, stat: string, cls: string, big: string, what: string) =>
    l && (
      <button class={"hero " + cls} onClick={() => setUi({ detail: { l } })} aria-label={`$${l.s}: ${what}`}>
        <span class="hero-fig">
          <Fig l={l} noTick />
        </span>
        <span class="hero-text">
          <span class={"hero-stat " + cls}>{stat}</span>
          <b class="hero-tick" style={{ color: PAIR_HEX[l.u] }}>
            ${l.s.slice(0, 9)}
          </b>
          <span class="hero-big">{big}</span>
          <small>{what}</small>
        </span>
      </button>
    );
  return (
    <aside class="side side-r" aria-label="Today's transfer list">
      <h3>
        <span>Today's transfer list</span>
      </h3>
      <div class="side-meta">
        <span>
          <i class="ic">#</i>Cut {ed.id} · {ago(ed.at)} · {total} launches
        </span>
      </div>
      <div class="heroes">
        {power && hero(power, "Power", "pw", `${(power.p / 100).toFixed(power.p < 1000 ? 1 : 0)}%`, "furthest up the curve")}
        {pace && hero(pace, "Pace", "pc", fmt(pace.k), "trades in 24h, the busiest")}
        {grip && hero(grip, "Grip", "gr", fmt(grip.h), "holders, the most held")}
      </div>
      <div class="side-rows">
        <p class="row-fact">
          <i class="ic">⏱</i>Next cut in <b>{span(next)}</b>
        </p>
      </div>
      <button class="btn side-btn" onClick={() => setUi({ overlay: "pool" })}>
        All {total} on the list
      </button>
    </aside>
  );
}

/** A shared seed link lands here: the seed, and a button. It never starts by itself. */
function PendingSeed() {
  const u = useUi();
  const p = u.pendingSeed;
  if (!p) return null;
  return (
    <div class="challenge pending">
      <p>
        A seed was shared with you: <b class="m">{p.seed}</b>
        {p.edition ? ` on cut #${p.edition}` : ""}
        {p.mode === "haunt" ? " (Haunted table)" : ""}. Same squad, same clubs, same shelf.
      </p>
      <div class="row">
        <button class="btn gold" onClick={() => A.playPending()}>
          Play seed {p.seed}
        </button>
        <button class="btn" onClick={() => setUi({ pendingSeed: null })}>
          Not now
        </button>
      </div>
    </div>
  );
}

function Title() {
  const u = useUi();
  const ed = u.edition;
  const ch = u.challenge;
  const saved = A.hasSaved();
  const savedMode = A.savedMode();
  const live = ed
    ? `${ed.pool.reduce((n, p) => n + p.length, 0)} live launches on today's transfer list`
    : u.editionError
      ? "The launch index is not answering. Try again in a minute."
      : "Reading the newest launches...";
  const streak = streakNow();
  const haunt = hauntOn();
  return (
    <div class="title-screen t3">
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
        {u.pendingSeed ? (
          <PendingSeed />
        ) : ch ? (
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
        <div class="t3-play">
          {saved ? (
            <button class="t3-act season" onClick={() => A.continueRun()}>
              <b>{savedMode === "haunt" ? "Continue Haunted" : savedMode === "daily" ? "Continue match day" : "Continue season"}</b>
              <small>Right where you left it</small>
            </button>
          ) : (
            <button class="t3-act season" disabled={!ed} onClick={() => A.newRun()}>
              <b>{ed ? "New season" : u.editionError ? "Squad unavailable" : "Picking the squad..."}</b>
              <small>{ROUNDS_R3} rounds · an {LEAGUE_CLUBS + 1}-club league · a final</small>
            </button>
          )}
          <button class="t3-act daily" disabled={!u.daily && !ed} onClick={() => A.dailyRun()} aria-label="Daily match day">
            <b>Daily match day</b>
            <small>
              3 fixtures · {u.daily && u.daily.players ? plural(u.daily.players, "player") + " today" : "same for everybody"}
              {streak > 1 ? ` · streak ${streak}` : ""}
            </small>
          </button>
          <button class={"t3-act haunt" + (haunt ? "" : " past")} onClick={() => A.newRun("haunt")} aria-label="Haunted table">
            <span class="t3-pumpkin" aria-hidden="true" />
            <b>Haunted</b>
            <small>{haunt ? `Ghost clubs, ${HAUNT_UNTIL}` : "The past event, still open"}</small>
          </button>
        </div>
        {saved && ed && (
          <button class="textlink t3-instead" onClick={() => A.newRun()}>
            Start a new season instead
          </button>
        )}
        <nav class="t3-row" aria-label="More">
          <button onClick={() => setUi({ overlay: "how" })}>How to play</button>
          <button onClick={() => setUi({ overlay: "hall" })}>Hall of goals</button>
          <button onClick={() => setUi({ overlay: "table" })}>Your table</button>
          <button class="wide-only" disabled={!ed} onClick={() => setUi({ overlay: "pool" })}>
            Transfer list
          </button>
          <button onClick={() => setUi({ overlay: "more" })}>More</button>
        </nav>
        <footer class="title-foot">
          <nav class="foot-links" aria-label="Links">
            <a href={GAME_TOKEN.url} target="_blank" rel="noopener">
              ${GAME_TOKEN.symbol} ↗
            </a>
            <a href={SOURCE_URL} target="_blank" rel="noopener">
              Source ↗
            </a>
            <a href={X_URL} target="_blank" rel="noopener">
              @kicker_art ↗
            </a>
          </nav>
          <p class="foot-note">Robinhood Chain testnet. Test tokens, no real value. KICKER never asks for a seed phrase, a key or funds.</p>
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
          What's new in 3.0
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ how to play
function How() {
  return (
    <Modal title="How to play" wide>
      <div class="how3">
        <section class="how-lead how-short">
          <h3>In short</h3>
          <ol>
            <li>
              Press <b>Kick off</b>. First to {GOALS_TO_WIN} goals wins the match.
            </li>
            <li>
              Your ball: tap the <b>gold disc</b> in their goal to shoot, or a <b>ringed figure</b> to pass. No lane yet? Slide a rod with the arrows at
              its handle.
            </li>
            <li>
              Their ball: slide a rod onto a <b>red line</b> to block it, then press <b>Ready</b>.
            </li>
            <li>
              Stuck? Press <b>What now?</b> and a gold tag marks a good touch.
            </li>
          </ol>
        </section>
        <section class="how-lead">
          <p>
            Turn-based table football. You slide your rods and kick, one touch at a time, and the other side reacts to every touch. Every figure on your rods is
            a live vibe/vibe launch, and its numbers decide how it plays.
          </p>
        </section>
        <section>
          <h3>The season and the league</h3>
          <p>
            A season is {ROUNDS_R3} rounds. Each round is two <b>league matches</b> and a <b>cup tie</b> against a boss club. The league has{" "}
            {LEAGUE_CLUBS + 1} clubs, you and {LEAGUE_CLUBS} others, and you meet each of them twice: three points a win, one a draw.
          </p>
          <p>
            A league loss does not end the season; the table does, once the top two are out of reach. A cup tie has to be won: a draw or a loss ends it there.
            In the top two when a cup tie comes round, it is a <b>home tie</b>: +1 touch on your first ball. After round {ROUNDS_R3}'s league matches, the top
            two meet in the <b>final</b> under the Closing Bell's rule, and the leader gets the extra touch.
          </p>
          <p>
            A match goes to the first side to score {GOALS_TO_WIN} (the final: 3), with {POSSESSIONS} possessions each, a few more in a cup tie. Every league
            match has one <b>table event</b>, shown at kickoff, and every match opens from one of its club's own kickoff shapes.
          </p>
        </section>
        <section>
          <h3>The table</h3>
          <p>
            Seen from above, four rods a side, interleaved like a real table: keeper (1), defence (2), midfield (5), attack (3). {LANES} lanes across, and the
            goal mouth is the middle {MOUTH[1] - MOUTH[0] + 1}. A rod slides one lane at a time and its figures move together.
          </p>
        </section>
        <section>
          <h3>Your ball</h3>
          <p>
            {BASE_TOUCHES} <b>touches</b> a possession. A touch is a <b>slide</b> (drag a rod, or press a button at its handle) or a <b>kick</b> with the figure
            on the ball: a pass to a figure further up, or a shot. The ball runs straight, or one lane sideways per rod it crosses, and comes back off the side
            walls. A figure of theirs in its lane blocks it and wins the ball. Out of touches, the ball goes to their keeper.
          </p>
          <ul class="how-keys">
            <li>
              <i class="k-gold" /> A gold disc: a clear shot.
            </li>
            <li>
              <i class="k-amber" /> An amber disc: a <b>tight lane</b> beside their keeper. The keeper reaches it as one more blocker, so it costs a point of
              Power. A shot straight off a pass (one touch), or off a side wall, beats the reach for free.
            </li>
            <li>
              <i class="k-red" /> A red line ending in a cross: blocked.
            </li>
            <li>
              <i class="k-ghost" /> Hover a slide button (hold it on a phone) to <b>read the tape</b>: ghost rods show where they will be after they react.
            </li>
          </ul>
        </section>
        <section>
          <h3>Build-up</h3>
          <p>
            Passes in one possession light their lanes on the felt. After two passes, the next shot gets <b>+1 Power</b>: the move opened them up, and a
            goal off two passes or more is a <b>Team move</b>. Passing beats slide, slide, shoot, and it rates higher.
          </p>
        </section>
        <section>
          <h3>Their ball</h3>
          <p>
            Red lines are their shots, amber their passes. You get {BASE_BLOCKS} <b>block slides</b> a possession: slide into those lanes, then press{" "}
            <b>Ready</b> and they take their touch. You are only asked when something threatens: until then they pass it around and play on by themselves.
            Their own Power launches shoot through one more blocker, and clubs get sharper by the round: from mid-season they look a slide ahead and half-read
            your blocks, later they read them fully.
          </p>
        </section>
        <section class="how-stats">
          <h3>Your figures are live launches</h3>
          <p>Each of your 11 figures is a launch from today's cut, its picture the head. Three numbers make three stats:</p>
          <table class="map">
            <tbody>
              <tr>
                <td style={{ color: "#ff3d7f" }}>Power</td>
                <td>
                  {STAT.power.from} {STAT.power.at / 100}%+: {STAT.power.text}. It also beats a tight lane.
                </td>
              </tr>
              <tr>
                <td style={{ color: "#27c4e8" }}>Pace</td>
                <td>
                  {STAT.pace.at}+ {STAT.pace.from}: {STAT.pace.text}. A pass to a Pace figure gets no reaction: it shoots <b>first time</b>, before they move. Under
                  Mempool Jam, a pass to it skips the queue.
                </td>
              </tr>
              <tr>
                <td style={{ color: "#ffc23d" }}>Grip</td>
                <td>
                  {STAT.grip.at}+ {STAT.grip.from}: {STAT.grip.text}. On their ball, a Grip figure in your defence or midfield is a <b>wide body</b>: it
                  covers its own lane and one more toward the middle. A Grip keeper reaches the lanes on both sides. A Grip figure that wins the ball back with a
                  block starts your possession with +1 touch.
                </td>
              </tr>
            </tbody>
          </table>
          <p class="note">
            Hover a figure (hold it on a phone) for its data tag: holders, trades, age, price, curve, and where each stat comes from. Move anyone in the
            Line-up before a match.
          </p>
        </section>
        <section>
          <h3>Cup ties and the final</h3>
          <p>Each boss club changes one rule for the match, and the rule shows on the table.</p>
          <ul class="bosses">
            {[...BOSSES, FINAL_BOSS].map((b) => (
              <li>
                <b>{b.name}</b>: {b.text}
                {b.id === "bell" ? " (the final)" : ""}.
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Table events</h3>
          <p>One a league match, named at kickoff and marked on the felt:</p>
          <ul class="bosses">
            {TABLE_EVENT_IDS.map((id) => (
              <li>
                <b>{TABLE_EVENTS[id].name}</b>: {TABLE_EVENTS[id].text}.
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>How clubs play</h3>
          <ul class="bosses">
            {(Object.keys(STYLES) as (keyof typeof STYLES)[]).map((k) => (
              <li>
                <b>{STYLES[k].name}</b>: {STYLES[k].text}.
              </li>
            ))}
          </ul>
          <p>Every club keeps its way of playing all season and gets sharper by the round. Your record against each club stays on this device.</p>
        </section>
        <section>
          <h3>The dressing room</h3>
          <p>
            A win brings fans: {WIN_FANS_R3[0]} for a league match and {WIN_FANS_R3[2]} for a cup tie, a league draw {DRAW_FANS_R3}, plus one a goal. Fans are
            only good for the dressing room, and every price is printed. The shelf is set by your seed.
          </p>
          <ul class="bosses">
            <li>
              <b>Coaches</b> ({COACHES.length}, 5 seats): Academy, First team or Club legend. Many read the launches on your rods.
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
          <h3>Daily match day</h3>
          <p>
            One seed a day, the same for everybody: one match day of three fixtures, a friendly, a league match and a boss club, under the same rules as a
            season, about five minutes. A draw goes through in the first two; the boss club has to be beaten. Win {WIN_FANS.join(" / ")} fans. Post it with a
            name for the Daily board (it does not go in the Hall of goals). One line per name, your best of the day counts.
          </p>
        </section>
        <section>
          <h3>Haunted table</h3>
          <p>
            {hauntOn() ? `Live ${HAUNT_UNTIL}` : "A past event, still open"}: three matches against ghost clubs made of the cut's quietest launches, easiest
            first. A Haunted win while it runs keeps a <b>Haunted kit</b> mark on your device, for the look only.
          </p>
          <ul class="bosses">
            {Object.values(GHOST_RULES).map((g) => (
              <li>
                <b>{g.name}</b>: {g.text}
              </li>
            ))}
          </ul>
          <p class="note">An event mode for the spooky week on Robinhood Chain testnet, through {HAUNT.endLabel}. Its goals have their own board in the Hall.</p>
        </section>
        <section>
          <h3>Goals, seeds and challenges</h3>
          <p>
            A goal rates higher for passes, an angle, a wall, blockers beaten with Power, distance and touches to spare. A season is fixed by its <b>seed</b> and
            its <b>cut</b>: send a seed link, and whoever opens it plays your exact season. At the end, the server plays every touch again before your challenge link
            and image are made.
          </p>
        </section>
        <section>
          <h3>Token, source and sign-in</h3>
          <p>
            KICKER has its own launch on vibe/vibe:{" "}
            <a href={GAME_TOKEN.url} target="_blank" rel="noopener">
              ${GAME_TOKEN.symbol} ↗
            </a>
            . It is cosmetic only: holders pick a team kit and get a small mark by their name. Sign-in is optional, through Para: it claims your name and keeps
            Your table on any device. Source:{" "}
            <a href={SOURCE_URL} target="_blank" rel="noopener">
              github.com/sirkicker/kicker ↗
            </a>
            . News:{" "}
            <a href={X_URL} target="_blank" rel="noopener">
              @kicker_art on X ↗
            </a>
          </p>
          <Privacy />
        </section>
        <section>
          <h3>Where the figures come from</h3>
          <p>
            Every few hours the game reads the newest launches from the vibe/vibe v6 index. Farm bots (templated descriptions, generated names, numeric tickers,
            never-traded tokens, more than two launches from one creator) are left out. Per pair kind, the 10 liveliest plus the newest make today's transfer list
            of up to 30; your seed picks 11. Desktop keys: H shows a good touch, Enter is Ready.
          </p>
          {ui.edition && (
            <p class="note">
              Current cut #{ui.edition.id}: {ago(ui.edition.at)} at block {ui.edition.block}, {ui.edition.scanned.toLocaleString("en-US")} launches read,{" "}
              {ui.edition.dropped.toLocaleString("en-US")} left out, {ui.edition.pool.reduce((n, p) => n + p.length, 0)} on the list.
            </p>
          )}
        </section>
      </div>
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

// ------------------------------------------------------------ menu
function Options() {
  const u = useUi();
  const run = u.run;
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Menu">
      {run && (
        <p class="note">
          Seed <b>{run.s.seed}</b> · cut #{run.s.edition} · {run.mode === "season" ? `round ${Math.min(run.s.round, run.rounds)} of ${run.rounds}` : run.mode === "daily" ? "Daily match day" : "Haunted table"}
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

/** A posted goal's move: read once from the posted season (a public, CDN-cached read) and played again here. */
interface Move {
  path: Step[][];
  scorer: FigInfo | null;
  haunt: boolean;
}
const moves = new Map<string, Promise<Move | null>>();
function moveOf(id: string): Promise<Move | null> {
  let p = moves.get(id);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/result?id=${id}`);
        if (!r.ok) return null;
        const rec = (await r.json()) as { v?: number; seed: string; edition: number; trail: string };
        if (rec.v !== 2) return null;
        const t = parseTrail(rec.trail);
        const ed = await A.edition(rec.edition);
        const run = rerun(ed, rec.seed, t.actions, t.mode, t.rules);
        const b = run.s.best;
        if (!b || !b.path?.length) return null;
        const l = run.s.squad[b.scorer];
        return { path: b.path, scorer: l ? { t: l.t, s: l.s, c: l.c, u: l.u } : null, haunt: t.mode === "haunt" };
      } catch {
        return null;
      }
    })();
    moves.set(id, p);
  }
  return p;
}

/** The mini felt for a Hall row. It reads the posted season only once the row scrolls into view. */
function PathThumb(props: { id?: string; path?: Step[][]; scorer?: FigInfo | null; haunt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mv, setMv] = useState<Move | null | undefined>(props.path ? { path: props.path, scorer: props.scorer || null, haunt: !!props.haunt } : undefined);
  useEffect(() => {
    if (mv !== undefined || !props.id || !ref.current) return;
    const id = props.id;
    let live = true;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void moveOf(id).then((m) => live && setMv(m));
    });
    io.observe(ref.current);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [props.id]);
  return (
    <div class={"hthumb" + (mv === undefined ? " wait" : "")} ref={ref} aria-hidden="true">
      {mv ? <PathFelt path={mv.path} scorer={mv.scorer} haunt={mv.haunt} thumb w={120} /> : <span class="hthumb-empty" />}
    </div>
  );
}

function HallRows(props: { entries: DayEntry[] }) {
  return (
    <ol class="hall">
      {props.entries.map((h, i) => (
        <li class="hrow">
          <div class="hpos">{i + 1}</div>
          <PathThumb id={h.id} />
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
  const saved = local.get<string>("kk.hallTab", "day");
  const [tab, setTab] = useState<"day" | "daily" | "haunt" | "mine">(saved === "daily" || saved === "haunt" ? saved : "day");
  const [ghosts, setGhosts] = useState<{ day: string; entries: DayEntry[] } | null>(null);
  const [ghostErr, setGhostErr] = useState(false);
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
    fetch("/api/hall?board=haunt")
      .then((r) => r.json())
      .then(setGhosts)
      .catch(() => setGhostErr(true));
  }, []);
  const pick = (t: "day" | "daily" | "haunt" | "mine") => {
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
        <button class={"pill haunt" + (tab === "haunt" ? " on" : "")} onClick={() => pick("haunt")}>
          Haunted
        </button>
        <button class={"pill" + (tab === "mine" ? " on" : "")} onClick={() => pick("mine")}>
          Mine
        </button>
      </div>
      {tab === "haunt" ? (
        <>
          <p class="note">
            Haunted table · {ghosts?.day || utcDay()} (UTC): the best goals scored against the ghost clubs, every touch played again on the server.
            {hauntOn() ? ` Live ${HAUNT_UNTIL}.` : " The event is closed; the table stays open."}
          </p>
          <button class="btn wide haunt-btn" onClick={() => A.newRun("haunt")}>
            Play the Haunted table
          </button>
          {ghostErr && <p class="err">The Haunted board is not answering right now.</p>}
          {ghosts && !ghosts.entries.length && <p>No Haunted goals posted today. Quiet in here.</p>}
          {ghosts && <HallRows entries={ghosts.entries} />}
        </>
      ) : tab === "daily" ? (
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
                <PathThumb path={h.path} scorer={h.scorer} haunt={false} />
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
          {(hauntKit() || (p && p.kit?.haunt)) && <HauntMark />}
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
                <b class="m">{fmt(h.total)}</b> {h.style} · round {h.round} <a href={`/classic.html?s=${h.seed}&e=${h.edition}`}>play this seed ↗</a>
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
                  {r.daily ? " · Daily Match" : ""} <a href={`/c/${r.id}`}>replay ↗</a> <a href={`/classic.html?s=${r.seed}&e=${r.edition}`}>same seed ↗</a>
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
      <div class="news3">
        <p class="news-lead">KICKER 3.0, Matchday. Same table, same vibers, more at stake in every match.</p>
        <section>
          <h3>A league, and a final to play for</h3>
          <p>
            A season is now {ROUNDS_R3} rounds of two league matches and a cup tie. The league has {LEAGUE_CLUBS + 1} clubs, you and {LEAGUE_CLUBS}, and you meet
            each twice: three points a win, one a draw. A league loss no longer ends the season; the table does. The top two have their cup ties at home, +1
            touch, and meet in the final under the Closing Bell's rule. Fans: {WIN_FANS_R3[0]} a league win, {WIN_FANS_R3[2]} a cup tie, {DRAW_FANS_R3} a
            league draw.
          </p>
        </section>
        <section>
          <h3>Shots with a decision in them</h3>
          <p>
            A lane beside their keeper is tight: an amber disc, and the keeper reaches it as one more blocker. A one-touch shot straight off a pass, or a shot
            off a side wall, beats it for free. Passes build up: two put +1 Power on the shot, and a goal off two or more is a Team move.
          </p>
        </section>
        <section>
          <h3>Every stat plays</h3>
          <p>
            Pace figures shoot first time off a pass, before they react. Grip figures are wide bodies on their ball, a Grip keeper reaches both sides, and a
            Grip block wins you a touch. Their own Power launches shoot through one more blocker. Hold a slide button to read how they will react.
          </p>
        </section>
        <section>
          <h3>Every match its own</h3>
          <p>
            Clubs open from their own kickoff shapes, and each league match has a table event: Volatile walls, a Thin book lane, a Green candle touch, or a Halt
            on the half. You are only asked to defend when something threatens.
          </p>
        </section>
        <section>
          <h3>Match day looks like one</h3>
          <p>
            Club kits, captains and chants on every fixture, your record against each club, a match report at full time, a locker wall for the dressing room, and a
            match-day programme when the season ends, with your goal of the season drawn on the felt.
          </p>
        </section>
        <section>
          <h3>Daily match day</h3>
          <p>The Daily Match is now one match day under the new rules: a friendly, a league match and a boss club, about five minutes, the same for everybody. It goes on the Daily board.</p>
        </section>
        <div class="row">
          <button class="btn gold" onClick={() => A.dailyRun()}>
            Daily match day
          </button>
          <button class="btn teal" onClick={() => close()}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The first-match walkthrough: four prompts on the real table, each moves on when you do the thing. */
export const TUT = [
  "1 of 4 · Tap what the gold tag marks: it is always a good touch. First to 2 goals wins.",
  "2 of 4 · Pass: tap a ringed figure. Shoot: tap the gold disc in their goal. The gold tag shows which.",
  "3 of 4 · Keep following the gold tag. A gold disc in their goal is a shot: tap it to score.",
  "4 of 4 · Their ball. Red lines are their shots: slide a rod onto one, then press Ready.",
];
function Tutorial() {
  const u = useUi();
  if (u.tut === null || u.overlay) return null;
  return (
    <div class="coach tut in-round" role="status">
      <p>{TUT[u.tut]}</p>
      <div class="row">
        <button
          class="btn small"
          onClick={() => {
            local.set("kk.tut", "done");
            setUi({ tut: null });
          }}
        >
          Skip the walkthrough
        </button>
      </div>
    </div>
  );
}

/** The coach's tip: only on the screen it belongs to, one at a time, and never while the walkthrough talks. */
function Coach() {
  const u = useUi();
  if (!u.coach || u.tut !== null) return null;
  const at = screenNow(u);
  if (at !== u.coach.screen || at === "title") return null;
  return (
    <div class={"coach " + (at === "table" ? "in-round" : "in-menu")} role="status">
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
      <Stage />
      {u.overlay === "boss" && <BossIntro />}
      {u.overlay === "league" && <LeagueTable onClose={() => setUi({ overlay: null })} />}
      {u.overlay === "options" && <Options />}
      {u.overlay === "seed" && <SeedEntry />}
      {u.overlay === "hall" && <Hall />}
      {u.overlay === "over" && <Programme />}
      {u.overlay === "house" && <House />}
      {u.overlay === "news" && <News />}
      {u.overlay === "table" && <Table />}
      {u.overlay === "more" && <More />}
      <FigureDetail />
      <InspectTag />
      <Coach />
      <Tutorial />
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
  bindScreens(actions);
  render(<App />, el);
}
