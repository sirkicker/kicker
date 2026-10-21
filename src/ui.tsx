// HTML overlays: title, how to play, deck, hand levels, run over + challenge sharing, menus, coach,
// the Daily Deal board, sign-in (through Para), house colours and the what's-new note.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { BOSSES, FINAL_BOSS, HANDS, INSIDERS, MOVES, BLIND_NAME, ANTE_BASE } from "../shared/content.js";
import { ENH, GAME_TOKEN, RANK_LABEL, SOURCE_URL, SUITS, enhOf, facePath, tokenUrl, type Card, type PoolCard, type Suit } from "../shared/data.js";
import { ageLabel, cardFacts } from "../shared/insight.js";
import { audioState, setMusic, setSfx, unlock } from "./audio.js";
import { local, setUi, subscribe, toast, ui } from "./store.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { dayLabel, liveStreak, utcDay, type Streak } from "../shared/daily.js";
import { CHAIN_NAME, LOOKS, house, look, type Look } from "./house.js";
import { endSession, me, refreshProfile, startSession } from "./me.js";
import { PARA, openSignIn, short, signOut, warm } from "./signin.js";

export const VERSION = "1.2.0";
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
  hint(): void;
  hasSaved(): boolean;
  playEntry(h: { id: string; name: string; ante: number; cleared: number; won: boolean; total: number; handName: string; seed: string; edition: number }): void;
}

let A: UiActions;

const SUIT_HEX = ["#5ad7ff", "#ff7a3d", "#ff4fb4", "#ffd43b"];
const SUIT_SHAPE = ["◆", "▲", "●", "■"];
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

function useUi() {
  const [, set] = useState(0);
  const seen = ui.version;
  useEffect(() => {
    const off = subscribe(() => set((x) => x + 1));
    // a change that landed between the render and this subscription would be missed otherwise
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
        class={"chip" + (st.music ? " on" : "")}
        onClick={() => {
          unlock();
          setMusic(!st.music);
          set(audioState());
        }}
      >
        Music {st.music ? "on" : "off"}
      </button>
      <button
        class={"chip" + (st.sfx ? " on" : "")}
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
    <span class="hmark" title="$KICKER holder: house colours (cosmetic only)" aria-label="house colours">
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

/** What sign-in through Para keeps, and what KICKER keeps. Shown in the House modal and in How to play. */
function Privacy() {
  return (
    <p class="privacy">
      <b>Privacy.</b> Sign-in runs through Para, which keeps your login and the wallet it makes for you. KICKER keeps no emails and no passwords. Signed
      out, your runs and settings stay in this browser, and only the name you post with a hand goes to the Hall of hands. Signed in, KICKER also keeps your
      claimed name, your wallet address and the runs you post (streak, best hands, last 30 runs), so they follow you. KICKER runs on Robinhood Chain
      testnet: test tokens, no real value. KICKER never asks for a seed phrase, a private key or funds.
    </p>
  );
}

/** "Sign in", then the short address with a sign-out. Para loads on hover, focus or touch, never before. */
function SignInChip(props: { big?: boolean }) {
  const u = useUi();
  const cls = props.big ? "btn" : "chip";
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

/** Music and Sound as two small icon toggles, top left of the title. */
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

/** Top right of the title: a plain Sign in, or who you are (opens Your table, where sign-out lives). */
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

/** Five real cards from the current deck, fanned: the Ace to the Ten of the liveliest launches, one per suit and then some. */
function HeroFan(props: { ed: NonNullable<typeof ui.edition> }) {
  const picks: { l: PoolCard; suit: number; rank: number }[] = [];
  const sorted = props.ed.pool.map((p) => p.slice().sort((a, b) => b.p - a.p));
  for (let i = 0; i < 5; i++) {
    const suit = i % 4;
    const l = sorted[suit][Math.floor(i / 4)] || sorted[suit][0];
    if (l) picks.push({ l, suit, rank: 14 - i });
  }
  if (picks.length < 5) return null;
  return (
    <div class="fan" aria-hidden="true">
      {picks.map((c, i) => (
        <div class="fcard" style={{ "--i": i - 2, color: SUIT_HEX[c.suit] } as Record<string, string | number>}>
          <div class="fface">
            <span class="fidx">
              <b>{RANK_LABEL(c.rank)}</b>
              <i>{SUIT_SHAPE[c.suit]}</i>
            </span>
            <img src={facePath(c.l.c, c.l.s)} alt="" width={64} height={64} />
            <span class="ftab" style={{ background: SUIT_HEX[c.suit] }}>
              {c.l.q === "VIBEVIBE" ? "VIBE" : c.l.q.slice(0, 5)}
            </span>
            <span class="ftick">${c.l.s.slice(0, 8)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A number that counts up the first time it shows. Instant under reduced motion. */
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

/** Re-renders every half minute, for the countdowns. */
function useClock(ms = 30_000) {
  const [now, set] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(t);
  }, []);
  return now;
}

const span = (mins: number) => (mins <= 0 ? "any minute now" : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`);

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
        // an empty board: one more CDN-cached read, yesterday's winner
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
        {edition ? ` on deck #${edition}` : ""}
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
              Leader's hand: <b>{leader.handName}</b>
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
              Yesterday: <b class="who">{prev.entries[0].name}</b> with <b class="m">{fmt(prev.entries[0].total)}</b> ({prev.entries[0].handName})
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
          <i class="ic">⏱</i>Next Daily in <b>{span(nextDaily)}</b>
        </p>
      </div>
      <button class="btn gold side-btn" onClick={() => A.dailyRun()}>
        Play the Daily Deal
      </button>
    </aside>
  );
}

/** Desktop only, right of the title: live facts from the pool the page already loaded, each with who cares. */
function DeckPanel(props: { ed: NonNullable<typeof ui.edition> }) {
  const ed = props.ed;
  const now = useClock();
  const cutAt = Date.parse(ed.at) / 1000;
  const all = ed.pool.flatMap((p, u) => p.map((l) => ({ l, u })));
  const total = all.length;
  const counts = ed.pool.map((p) => p.length);
  const max = Math.max(1, ...counts);
  const avg = ed.pool.map((p) => (p.length ? p.reduce((n, l) => n + l.p, 0) / p.length / 100 : 0));
  const hot = all.slice().sort((a, b) => b.l.k - a.l.k || b.l.h - a.l.h).slice(0, 3);
  const youngest = all.slice().sort((a, b) => b.l.a - a.l.a)[0];
  const oldest = all.slice().sort((a, b) => a.l.a - b.l.a)[0];
  const young = all.filter((c) => (cutAt - c.l.a) / 3600 < 6).length;
  const old = all.filter((c) => (cutAt - c.l.a) / 3600 >= 24).length;
  const down = all.filter((c) => c.l.x !== null && c.l.x < 0).length;
  const grads = all.filter((c) => c.l.g).length;
  const stocks = [...new Set(ed.pool[1].map((l) => l.q))];
  // a deck lasts three hours from its cut (see /api/shuffle); the next one is cut on the first visit after that
  const next = Math.round(((ed.id + 3) * 3_600_000 - now) / 60000);
  return (
    <aside class="side side-r" aria-label="In today's deck">
      <h3>
        <span>In today's deck</span>
      </h3>
      <div class="side-meta">
        <span>
          <i class="ic">#</i>Deck {ed.id} · cut {ago(ed.at)}
        </span>
      </div>
      <hr class="pix" />
      <ul class="side-bars">
        {SUITS.map((s, i) => (
          <li>
            <span class="sl" style={{ color: SUIT_HEX[i] }}>
              {SUIT_SHAPE[i]} {s.name}
            </span>
            <span class="bar">
              <span style={{ width: `${(counts[i] / max) * 100}%`, background: SUIT_HEX[i] }} />
            </span>
            <b>
              <CountUp n={counts[i]} />
            </b>
            <small>curve {avg[i].toFixed(0)}%</small>
          </li>
        ))}
      </ul>
      <p class="side-hint lo">Suit maxis pay +3 Mult per card of their suit. Moonboy reads the curve.</p>
      <hr class="pix" />
      <div class="side-hots">
        {hot.map((c, i) => (
          <div class="mini">
            <img src={facePath(c.l.c, c.l.s)} alt="" width={44} height={44} />
            <div>
              <b style={{ color: SUIT_HEX[c.u] }}>${c.l.s}</b>
              <span>{c.l.k.toLocaleString("en-US")} trades</span>
              <span>{c.l.h.toLocaleString("en-US")} holders</span>
            </div>
          </div>
        ))}
      </div>
      <p class="side-hint">
        Volume Guy food: the busiest three.<span class="lo"> 40+ trades makes a card Hot (it scores twice) unless it graduated.</span>
      </p>
      <hr class="pix" />
      <div class="side-rows">
        {youngest && (
          <p class="row-fact">
            <i class="ic">✦</i>Youngest: <b>${youngest.l.s}</b>, {ageLabel((cutAt - youngest.l.a) / 3600)} before the cut
            <small>Early Bird food: {young} under 6 h</small>
          </p>
        )}
        {oldest && (
          <p class="row-fact lo">
            <i class="ic">⌛</i>Oldest: <b>${oldest.l.s}</b>, {ageLabel((cutAt - oldest.l.a) / 3600)}
            <small>Old Money food: {old} over a day</small>
          </p>
        )}
        <p class="row-fact">
          <i class="ic">↓</i>
          <b>
            <CountUp n={down} />
          </b>{" "}
          of {total} are down
          <small>Dip Buyer food</small>
        </p>
        <p class="row-fact">
          <i class="ic gold">★</i>
          <b class="gold">
            <CountUp n={grads} />
          </b>{" "}
          graduated
          <small>x1.5 Mult each when scored</small>
        </p>
        <p class="row-fact lo2">
          <i class="ic">▲</i>
          <b>{counts[1]}</b> stock pairs: {stocks.join(", ") || "none"}
          <small>Ticker Flush: five cards on one ticker</small>
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
    ? `${ed.pool.reduce((n, p) => n + p.length, 0)} live launches in today's deck · new cut every few hours`
    : u.editionError
      ? "The launch index is not answering. Try again in a minute."
      : "Shuffling the newest launches...";
  return (
    <div class="title-screen">
      <Parade rows={0} />
      <SoundIcons />
      <AccountPill />
      <DailyPanel />
      {ed && <DeckPanel ed={ed} />}
      <div class="title-main">
        <div class="logo" aria-label="KICKER">
          {"KICKER".split("").map((c, i) => (
            <span style={{ animationDelay: `${i * 0.12}s` }}>{c}</span>
          ))}
        </div>
        <p class="tag">A poker roguelike where every card is a live vibe/vibe launch.</p>
        <p class="live">{live}</p>
        {ch ? (
          <div class="challenge">
            <p>
              <b class="who">{ch.name || "Someone"}</b> challenged you on this seed: {ch.won ? "cleared all 8 antes" : `reached ante ${ch.ante}`}, best hand{" "}
              <b class="m">{fmt(ch.best)}</b>
              {ch.handName ? ` (${ch.handName})` : ""}.
            </p>
            <button class="btn gold" onClick={() => A.acceptChallenge()}>
              Take the challenge
            </button>
          </div>
        ) : ed ? (
          <HeroFan ed={ed} />
        ) : (
          <div class="fan empty" aria-hidden="true" />
        )}
        <div class="title-buttons">
          <div class="row deal">
            {saved ? (
              <button class="btn big teal" onClick={() => A.continueRun()}>
                Continue run
              </button>
            ) : (
              <button class="btn big teal" disabled={!ed} onClick={() => A.newRun()}>
                {ed ? "New run" : u.editionError ? "Deck unavailable" : "Cutting the deck..."}
              </button>
            )}
            <button class="btn big gold daily-btn" disabled={!u.daily && !ed} onClick={() => A.dailyRun()} aria-label="Daily Deal">
              <span>Daily Deal</span>
              <small>
                {u.daily ? `${u.daily.label} · ${u.daily.players ? plural(u.daily.players, "player") + " today" : "same deal for all"}` : dayLabel(utcDay())}
                {streakNow() > 1 ? ` · streak ${streakNow()}` : ""}
              </small>
            </button>
          </div>
          <div class="row three">
            <button class="btn" onClick={() => setUi({ overlay: "how" })}>
              How to play
            </button>
            <button class="btn" onClick={() => setUi({ overlay: "hall" })}>
              Hall of hands
            </button>
            <button class="btn" onClick={() => setUi({ overlay: "table" })}>
              Your table
            </button>
          </div>
          <div class="row links">
            {saved && ed && (
              <button class="textlink" onClick={() => A.newRun()}>
                New run instead
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
        </footer>
      </div>
      <Parade rows={1} />
    </div>
  );
}

/** The things that left the title screen, in one small sheet. */
function More() {
  const u = useUi();
  return (
    <Modal title="More">
      <div class="menu more">
        <button class="btn" disabled={!u.edition} onClick={() => setUi({ overlay: "deck" })}>
          Today's pool
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "seed" })}>
          Play a friend's seed
        </button>
        <button class={"btn" + (house.get() ? " gold" : "")} onClick={() => setUi({ overlay: "house" })}>
          House colours
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "news" })}>
          What's new in 1.2
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
        <h3>The goal</h3>
        <p>
          Each round is a <b>blind</b> with a target score. You get 4 hands and 3 discards to reach it. Play 1 to 5 cards: they form a poker-style hand. Your hand
          scores <b class="c">Chips</b> x <b class="m">Mult</b>. Clear the Small, Big and Boss blind to move up an ante. Survive ante 8 to win. Lose all your hands
          short of the target and the run is over.
        </p>
      </section>
      <section>
        <h3>Your cards are real launches</h3>
        <p>When a run starts, 52 launches from vibe/vibe (Robinhood Chain testnet) become your deck. Numbers are frozen at the moment the deck was cut:</p>
        <table class="map">
          <tbody>
            <tr>
              <td>Suit</td>
              <td>
                What the launch is paired with.{" "}
                {SUITS.map((s, i) => (
                  <span class="suit" style={{ color: SUIT_HEX[i] }}>
                    {SUIT_SHAPE[i]} {s.name}
                  </span>
                ))}
                <br />
                <small>
                  {SUITS.map((s) => `${s.name}: ${s.pairs}`).join(". ")}.
                </small>
              </td>
            </tr>
            <tr>
              <td>Rank</td>
              <td>
                Inside each suit, the 13 launches are lined up by bonding-curve progress (reserve vs graduation target), then 24h trades, then holders. The furthest
                along is the <b>Ace</b>, the least is the <b>2</b>. Card chips: 2-10 face value, J/Q/K 10, A 11.
              </td>
            </tr>
            <tr>
              <td>Badges</td>
              <td>
                {(Object.keys(ENH) as (keyof typeof ENH)[]).map((k) => (
                  <div>
                    <b>{ENH[k].name}</b>: {ENH[k].text} <small>({ENH[k].why})</small>
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <td>Art</td>
              <td>The token's own picture and ticker. Open "Deck" during a run to see every card's numbers and jump to its launch page.</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section>
        <h3>The cards are live</h3>
        <p>
          Every number on a card comes from its launch at the moment the deck was cut: holders, trades in the last 24 hours, age, price direction, curve
          progress, whether it graduated and whether it runs a gift list. The Insiders read exactly those numbers. Hover a card (or hold it on a phone) for
          its data tag, and the small dots in a card's corner show which of your Insiders would pay for it. Hover an Insider to light its cards.
        </p>
      </section>
      <section>
        <h3>Hands</h3>
        <table class="hands">
          <thead>
            <tr>
              <th>Hand</th>
              <th>Chips x Mult</th>
              <th>What it takes</th>
            </tr>
          </thead>
          <tbody>
            {HANDS.map((h) => (
              <tr>
                <td>{h.name}</td>
                <td>
                  <span class="c">{h.chips}</span> x <span class="m">{h.mult}</span>
                </td>
                <td>{h.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Only the cards that make the hand score their chips (for Index: the best card of each suit). Hands can be levelled up with Alpha leaks from the shop.
        </p>
      </section>
      <section>
        <h3>Blinds</h3>
        <p>
          Ante 1 targets: {ANTE_BASE[0]} / {ANTE_BASE[0] * 1.5} / {ANTE_BASE[0] * 2}. Ante 8: {fmt(ANTE_BASE[7])} / {fmt(ANTE_BASE[7] * 1.5)} / {fmt(ANTE_BASE[7] * 4)}.
          Every Boss blind bends a rule:
        </p>
        <ul class="bosses">
          {[...BOSSES, FINAL_BOSS].map((b) => (
            <li>
              <b>{b.name}</b>: {b.text}
              {b.id === "bell" ? " (ante 8 only)" : ""}
            </li>
          ))}
        </ul>
        <p>Clearing a blind cashes out its stake ($3 / $4 / $5), plus $1 per unused hand and $1 interest per $5 you hold (max $5). Game money, spent in the shop.</p>
      </section>
      <section>
        <h3>The shop</h3>
        <p>
          <b>Insiders</b> ({INSIDERS.length} of them, 5 slots) are your jokers: they add Chips or Mult, many of them reading the launch numbers behind a card (holders,
          24h trades, curve progress, age, ticker length). They fire left to right. Tap one to sell it for half price. <b>Alpha leaks</b> level up a hand. <b>Moves</b> (
          {MOVES.length} kinds, 2 slots) are one-shot tricks: select cards in hand, then tap the move and Use.
        </p>
      </section>
      <section>
        <h3>Seeds and challenges</h3>
        <p>
          A run is fixed by its <b>seed</b> and its <b>deck number</b>: the same pair always deals the same cards in the same sequence and offers the same shop. Send a
          seed link to a friend and they play your exact run. When a run ends, make a challenge link: the server plays every move you made again to check the score,
          then draws a card for X. Whoever opens it plays the same seed against your result.
        </p>
      </section>
      <section>
        <h3>Daily Deal</h3>
        <p>
          One seed a day, dealt from the first deck cut after 00:00 UTC, the same for everybody. Finish it and make a challenge link with a name to get on the
          Daily board: one line per name, your best run of the day counts. The server checks it move by move, same as any challenge.
        </p>
      </section>
      <section>
        <h3>Token and source</h3>
        <p>
          KICKER has its own launch on vibe/vibe:{" "}
          <a href={GAME_TOKEN.url} target="_blank" rel="noopener">
            ${GAME_TOKEN.symbol} ↗
          </a>
          . It is cosmetic only: holders can switch on house colours (a card back, a felt, a small mark by their name). It never changes the cards, the score or
          the odds. Source code:{" "}
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
          Optional. Sign in with email, Google, X, Discord or a wallet, through Para. One signed message a day claims your name (a ✓ in the Hall, nobody
          else posts under it), keeps Your table on any device, and checks ${GAME_TOKEN.symbol} for house colours. Everything else plays the same without it.
        </p>
        <Privacy />
      </section>
      <section>
        <h3>Where the cards come from</h3>
        <p>
          Every few hours the game reads the newest ~1,300 launches from the vibe/vibe v6 index. Farm-bot launches (templated descriptions, generated names, numeric
          tickers, never-traded tokens, more than two launches from one creator) are left out. Per suit, the 10 liveliest launches plus the newest ones make the
          pool of 30; your seed draws 13 of them. Desktop keys: Enter plays, X discards, S sorts. Hold a card in hand (or tap it in Deck) for its full details.
        </p>
        {ui.edition && (
          <p class="note">
            Current deck #{ui.edition.id}: cut {ago(ui.edition.at)} at block {ui.edition.block}, {ui.edition.scanned.toLocaleString("en-US")} launches read,{" "}
            {ui.edition.dropped.toLocaleString("en-US")} left out as farm bots or dead tokens, {ui.edition.pool.reduce((n, p) => n + p.length, 0)} in the pool.
          </p>
        )}
      </section>
    </Modal>
  );
}

// ------------------------------------------------------------ the data tag (deck view and today's pool)
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
  // the tag leaves on scroll and on the next tap, wherever it lands
  const hide = () => showInspect(null);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("wheel", hide, { passive: true });
  window.addEventListener("pointerdown", hide, true);
}

/** What the Insiders read off a launch, next to the card it came from. Leaves on pointer-out, scroll or the next tap. */
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

/** The tag's facts for a deck-view card; a pool card has no rank yet (the seed sets it). */
function factsOf(l: PoolCard, rank: number | undefined, suit: number, enh: string | null | undefined, bridged?: boolean) {
  const run = ui.run;
  const card: Card = { id: -1, l, rank: rank || 2, suit: suit as Suit, q: l.q, enh: (enh === undefined ? enhOf(l) : enh) as Card["enh"], bridged };
  const at = run ? run.s.editionAt : ui.edition ? Date.parse(ui.edition.at) / 1000 : l.a;
  const f = cardFacts(card, (at - l.a) / 3600);
  if (!rank) {
    f.title = `$${l.s}`;
    f.lines = f.lines.map(([k, v]) => (k === "Rank" ? ["Curve", `${(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}% (your seed turns that into a rank)`] : [k, v]));
  }
  return f;
}

// ------------------------------------------------------------ deck view
let inspectTimer = 0;
let pressed = false;
// after a touch, the browser sends "mouse" enter/leave events of its own when the page changes under the finger
let lastTouch = 0;
const realMouse = (e: PointerEvent) => e.pointerType === "mouse" && Date.now() - lastTouch > 1500;
function DeckCard(props: { l: PoolCard; rank?: number; suit?: number; enh?: string | null; dim?: boolean; bridged?: boolean }) {
  const { l } = props;
  const suit = props.suit ?? l.u;
  const ch = l.x === null ? "n/a" : `${l.x >= 0 ? "+" : ""}${(l.x / 100).toFixed(1)}%`;
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const f = factsOf(l, props.rank, suit, props.enh, props.bridged);
    showInspect({ ...f, x: r.left + r.width / 2, y: r.top < innerHeight * 0.55 ? r.bottom : r.top, color: SUIT_HEX[suit] });
  };
  return (
    <div
      class={"dcard" + (props.dim ? " dim" : "")}
      role="button"
      tabIndex={0}
      onPointerEnter={(e) => {
        if (!realMouse(e)) return;
        const el = e.currentTarget as HTMLElement;
        clearTimeout(inspectTimer);
        inspectTimer = window.setTimeout(() => show(el), 300);
      }}
      onPointerLeave={(e) => {
        clearTimeout(inspectTimer);
        // a finger lifting also "leaves"; on touch the tag stays until the next tap
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
        }, 400);
      }}
      onPointerUp={() => clearTimeout(inspectTimer)}
      onPointerCancel={() => clearTimeout(inspectTimer)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        if (pressed) {
          // the long-press was for the tag; the card itself stays put
          pressed = false;
          return;
        }
        showInspect(null);
        setUi({ detail: { l, rank: props.rank, suit, enh: props.enh, q: l.q, bridged: props.bridged } });
      }}
    >
      <div class="dtop" style={{ color: SUIT_HEX[suit] }}>
        <span class="rk">{props.rank ? RANK_LABEL(props.rank) : ""}</span>
        <span>{SUIT_SHAPE[suit]}</span>
        {props.enh && <span class={"badge " + props.enh}>{props.enh.toUpperCase()}</span>}
      </div>
      <img src={facePath(l.c, l.s)} alt="" loading="lazy" width={64} height={64} />
      <div class="dsym">${l.s}</div>
      <div class="dname">{l.n}</div>
      <div class="dstats">
        {props.bridged ? "bridged" : l.q} · curve {(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}%
        <br />
        {ch} · {l.k} trades · {l.h} holders
      </div>
      <a href={tokenUrl(l.t)} target="_blank" rel="noopener">
        See the launch ↗
      </a>
    </div>
  );
}

function Deck() {
  const u = useUi();
  const run = u.run;
  const [tab, setTab] = useState(0);
  if (run) {
    const s = run.s;
    const inHand = new Set(s.hand);
    const left = new Set(s.draw);
    const cards = s.deck.slice().sort((a: Card, b: Card) => a.suit - b.suit || b.rank - a.rank);
    const shown = cards.filter((c) => c.suit === tab);
    return (
      <Modal title={`Your deck · ${s.deck.length} cards`} wide>
        <div class="tabs">
          {SUITS.map((x, i) => (
            <button class={"chip" + (tab === i ? " on" : "")} style={{ color: SUIT_HEX[i] }} onClick={() => setTab(i)}>
              {SUIT_SHAPE[i]} {x.name} ({cards.filter((c) => c.suit === i).length})
            </button>
          ))}
        </div>
        <p class="note">
          {s.phase === "round" ? `${s.draw.length} still in the draw pile. Faded cards are already played or in your hand.` : "Ranks are by curve progress inside each suit."} Seed{" "}
          {s.seed} · deck #{s.edition}.
        </p>
        <div class="dgrid">
          {shown.map((c) => (
            <DeckCard l={c.l} rank={c.rank} suit={c.suit} enh={c.enh} bridged={c.bridged} dim={s.phase === "round" && !left.has(c.id) && !inHand.has(c.id)} />
          ))}
        </div>
      </Modal>
    );
  }
  const ed = u.edition;
  if (!ed) return null;
  const pool = ed.pool[tab] || [];
  return (
    <Modal title={`Today's pool · deck #${ed.id}`} wide>
      <div class="tabs">
        {SUITS.map((x, i) => (
          <button class={"chip" + (tab === i ? " on" : "")} style={{ color: SUIT_HEX[i] }} onClick={() => setTab(i)}>
            {SUIT_SHAPE[i]} {x.name} ({ed.pool[i].length})
          </button>
        ))}
      </div>
      <p class="note">Every seed draws 13 of these per suit. Cut {ago(ed.at)} at block {ed.block}.</p>
      <div class="dgrid">
        {pool.map((l) => (
          <DeckCard l={l} />
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ hand levels
function Levels() {
  const u = useUi();
  const run = u.run;
  if (!run) return null;
  return (
    <Modal title="Hands">
      <table class="hands">
        <thead>
          <tr>
            <th>Hand</th>
            <th>Lvl</th>
            <th>Chips x Mult</th>
          </tr>
        </thead>
        <tbody>
          {HANDS.map((h) => {
            const v = run.handValue(h.id);
            return (
              <tr title={h.rule}>
                <td>
                  {h.name}
                  <br />
                  <small>{h.rule}</small>
                </td>
                <td>{run.s.levels[h.id]}</td>
                <td>
                  <span class="c">{v.chips}</span> x <span class="m">{v.mult}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
          Seed <b>{run.s.seed}</b> · deck #{run.s.edition} · ante {run.s.ante}
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
          Hall of hands
        </button>
        <button class="btn" onClick={() => setUi({ overlay: "seed" })}>
          Play a friend's seed
        </button>
        <div class="row signin-row">
          <SignInChip big />
          <button class="btn" onClick={() => setUi({ overlay: "table" })}>
            Your table
          </button>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "house" })}>
            House colours
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

// ------------------------------------------------------------ seed entry
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
          if (!ok) setErr("That doesn't look like a seed, or its deck is gone.");
        }}
      >
        <input class="field" value={v} onInput={(e) => set((e.target as HTMLInputElement).value)} placeholder="Link or code" autoFocus aria-label="Seed" />
        <button class="btn teal" type="submit">
          Deal
        </button>
      </form>
      {err && <p class="err">{err}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------ best hands (local)
export interface HallEntry {
  total: number;
  hand: string;
  seed: string;
  edition: number;
  ante: number;
  cleared: number;
  cards: { s: string; c: string | null; rank: number; suit: number; t: string }[];
  at: number;
}

interface DayEntry {
  id: string;
  name: string;
  total: number;
  handName: string;
  ante: number;
  cleared: number;
  won: boolean;
  seed: string;
  edition: number;
  cards: { s: string; c: string | null; rank: number; suit: number; t: string }[];
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
            {h.verified && <VerifiedMark />} · {h.handName} · {h.won ? "won the run" : `ante ${h.ante}`}
            <HandCards cards={h.cards} />
          </div>
          <button class="btn small teal" onClick={() => A.playEntry(h)}>
            Play this seed
          </button>
        </li>
      ))}
    </ol>
  );
}

function HandCards(props: { cards: HallEntry["cards"] }) {
  return (
    <div class="hcards">
      {props.cards.map((c) => (
        <a href={tokenUrl(c.t)} target="_blank" rel="noopener" title={`$${c.s}`}>
          <img src={facePath(c.c, c.s)} alt={c.s} width={36} height={36} />
          <span style={{ color: SUIT_HEX[c.suit] }}>
            {RANK_LABEL(c.rank)}
            {SUIT_SHAPE[c.suit]}
          </span>
        </a>
      ))}
    </div>
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
  const mine = local.get<HallEntry[]>("kk.hall", []);
  return (
    <Modal title="Hall of hands" wide>
      <div class="tabs">
        <button class={"chip" + (tab === "day" ? " on" : "")} onClick={() => pick("day")}>
          Today, everyone
        </button>
        <button class={"chip" + (tab === "daily" ? " on" : "")} onClick={() => pick("daily")}>
          Daily Deal
        </button>
        <button class={"chip" + (tab === "mine" ? " on" : "")} onClick={() => pick("mine")}>
          Mine
        </button>
      </div>
      {tab === "daily" ? (
        <>
          <p class="note">
            Daily Deal · {dayLabel(board?.day || utcDay())} (UTC): seed {board?.seed || "..."}
            {board?.edition ? ` on deck #${board.edition}` : ""}, the same deal for everybody. One line per name, the best run of the day counts, every one played
            back move by move on the server.{board && board.players ? ` ${plural(board.players, "player")} so far.` : ""}
          </p>
          <button class="btn gold wide" onClick={() => A.dailyRun()}>
            Play the Daily Deal
          </button>
          {boardErr && <p class="err">The Daily board is not answering right now.</p>}
          {board && !board.entries.length && <p>Nobody has posted today's deal yet. The first line is yours.</p>}
          {board && <HallRows entries={board.entries} />}
        </>
      ) : tab === "day" ? (
        <>
          <p class="note">
            Best single hands of {day?.day || "today"} (UTC), from runs the server played back move by move. Finish a run and make a challenge link with a name to get in.
          </p>
          {err && <p class="err">The hall is not answering right now.</p>}
          {day && !day.entries.length && <p>No hands yet today. Be the first.</p>}
          {day && <HallRows entries={day.entries} />}
        </>
      ) : (
        <>
          {!mine.length && <p>Nothing yet. Your best hand of each run lands here (kept in this browser only).</p>}
          <div class="hall">
            {mine.map((h) => (
              <div class="hrow">
                <div class="hscore">{fmt(h.total)}</div>
                <div class="hmain">
                  <b>{h.hand}</b> · ante {h.ante} · seed {h.seed}
                  <HandCards cards={h.cards} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------ card detail
function CardDetail() {
  const u = useUi();
  const d = u.detail;
  if (!d) return null;
  const l = d.l;
  const suit = d.suit ?? l.u;
  const col = SUIT_HEX[suit];
  const ch = l.x === null ? null : l.x / 100;
  const age = ui.edition ? Math.max(0, (Date.parse(ui.edition.at) / 1000 - l.a) / 3600) : null;
  const ageS = age === null ? "n/a" : age < 1 ? `${Math.max(1, Math.round(age * 60))} min` : age < 48 ? `${Math.round(age)} h` : `${Math.round(age / 24)} days`;
  const badges: string[] = [];
  if (d.enh) badges.push(d.enh);
  if (l.g && d.enh !== "grad") badges.push("grad");
  if (l.d) badges.push("gifts");
  const enh = d.enh ? ENH[d.enh as keyof typeof ENH] : null;
  return (
    <div class="ov-backdrop top" onClick={(e) => e.target === e.currentTarget && setUi({ detail: null })}>
      <div class="ov-panel detail" style={{ borderColor: col }} role="dialog" aria-label={`$${l.s} details`}>
        <div class="ov-head">
          <h2 style={{ color: col }}>
            {d.rank ? `${RANK_LABEL(d.rank)} ${SUIT_SHAPE[suit]} ` : ""}${l.s}
          </h2>
          <button class="x" aria-label="Close" onClick={() => setUi({ detail: null })}>
            ×
          </button>
        </div>
        <div class="ov-body">
          <div class="dhead">
            <img src={facePath(l.c, l.s) + "&z=card"} alt={l.n} width={140} height={140} />
            <div>
              <div class="dn">{l.n}</div>
              <div class="dq">
                {SUITS[suit].name} suit · {d.bridged ? "bridged by a move" : `paired with ${l.q}`}
              </div>
              <div class="badges">
                {badges.map((b) => (
                  <span class={"badge " + b}>{b === "gifts" ? "GIFT LIST" : b.toUpperCase()}</span>
                ))}
              </div>
            </div>
          </div>
          <div class="meter" aria-label="Bonding curve progress">
            <div class="mfill" style={{ width: `${Math.min(100, l.p / 100)}%`, background: col }} />
            <span>
              Curve {(l.p / 100).toFixed(l.p < 1000 ? 1 : 0)}%{l.g ? " · graduated" : ""}
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
              <small>Age at the deal</small>
              <b>{ageS}</b>
            </div>
          </div>
          {enh && (
            <p class="note">
              <b>{enh.name}</b>: {enh.text}, because {enh.why}.
            </p>
          )}
          <p class="note">Numbers as of the deck cut, every few hours. Rank comes from curve progress inside the suit.</p>
          <a class="btn gold wide" href={tokenUrl(l.t)} target="_blank" rel="noopener">
            Open ${l.s} on vibe/vibe ↗
          </a>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ run over
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
  const brag = daily
    ? `Daily Deal · ${dayLabel(daily)} · ${fmt(s.best?.total || 0)} on KICKER, the poker roguelike dealt from live vibe/vibe launches. Same deal for everybody today. Beat it:`
    : `${won ? "Cleared all 8 antes" : `Reached ante ${s.ante}`} on KICKER, the poker roguelike dealt from live vibe/vibe launches. Best hand: ${fmt(s.best?.total || 0)}${s.best ? ` (${HANDS.find((h) => h.id === s.best!.hand)?.name})` : ""}. Same seed, same deal. Beat it:`;
  return (
    <Modal title={won ? "Graduated" : "Rugged"} accent={won ? "#ffc23d" : "#ff3d7f"} onClose={() => setUi({ overlay: "over" })}>
      <div class="over">
        <div class="ostats">
          <div>
            <small>Ante</small>
            <b>{Math.min(s.ante, 8)}</b>
          </div>
          <div>
            <small>Blinds cleared</small>
            <b>{s.cleared}</b>
          </div>
          <div>
            <small>Best hand</small>
            <b class="m">{fmt(s.best?.total || 0)}</b>
          </div>
        </div>
        <p class="note">
          {won ? "You beat the Closing Bell." : `Out at the ${s.blind === 2 ? "Boss" : BLIND_NAME[s.blind]} of ante ${s.ante}.`}
        </p>
        {daily && (
          <p class="daily-tag">
            Daily Deal · {dayLabel(daily)}
            {streak > 0 ? ` · streak ${plural(streak, "day")}` : ""}
          </p>
        )}
        <div class="seedline">
          <span>
            Seed <b>{s.seed}</b> · deck #{s.edition}
          </span>
          <button
            class="chip"
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
        {ch && <p class={"vs " + (beat ? "win" : "")}>{beat ? `You beat ${ch.name || "the challenger"}.` : `${ch.name || "The challenger"} still leads: ante ${ch.ante}, best ${fmt(ch.best)}.`}</p>}
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
                "With a name, this run enters the Daily board (your best of the day counts) and today's Hall of hands."
              ) : (
                "With a name, your best hand also enters today's Hall of hands."
              )}
              {!nameErr && verified ? " Signed in: your name is verified and the run goes to Your table." : ""}
              {!nameErr && marked ? " Your house mark rides along." : ""}
            </small>
            <button class="btn gold" disabled={busy} type="submit">
              {busy ? "Checking your run..." : "Make a challenge link"}
            </button>
          </form>
        ) : (
          <div class="shared">
            <img src={`/api/felt?id=${link.id}`} alt="Challenge card" width={600} height={315} />
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
              <a class="btn" href={`/api/felt?id=${link.id}`} download={`kicker-${s.seed}.png`}>
                Download
              </a>
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
            New run
          </button>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "deck" })}>
            See the deck
          </button>
          <button class="btn" onClick={() => setUi({ overlay: "title" })}>
            Title
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ house colours ($KICKER holders, cosmetic only)
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

function Swatch(props: { lk: Look; on: boolean; locked: boolean; onPick: () => void }) {
  const { lk } = props;
  return (
    <button
      class={"swatch" + (props.on ? " on" : "")}
      disabled={props.locked}
      onClick={props.onPick}
      aria-pressed={props.on}
      style={{ borderColor: props.on ? hex(lk.frame) : undefined }}
    >
      <span
        class="sw-back"
        style={{
          background: `repeating-conic-gradient(${hex(lk.back)} 0 25%, color-mix(in srgb, ${hex(lk.dots)} ${Math.round(lk.dotsAlpha * 100)}%, ${hex(lk.back)}) 0 50%) 0 0 / 12px 12px`,
        }}
      >
        <b style={{ color: hex(lk.frame), borderColor: hex(lk.frame) }}>K</b>
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
    // the player came here for house colours: start loading sign-in now, it is the next thing they'll tap
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
        toast("House colours on. Same cards, same odds, better outfit.");
      } else
        toast(
          r.holder === null
            ? `Signed in as ${r.name}. Robinhood Chain testnet is not answering, so no house colours for now.`
            : `Signed in as ${r.name}. No $${GAME_TOKEN.symbol} on this address, so the house look stays. Everything else plays the same.`,
        );
      A.lookChanged();
    } catch (e) {
      const m = String((e as { message?: string })?.message || e);
      setErr((e as { code?: number })?.code === 4001 || /reject|denied|cancel/i.test(m) ? "Signature cancelled. Nothing was sent." : m);
    }
    setBusy(false);
  };
  const endsIn = hs ? Math.max(1, Math.round((hs.expires - Date.now()) / 3_600_000)) : 0;
  return (
    <Modal title="House colours">
      <p>
        Hold any amount of <b>${GAME_TOKEN.symbol}</b> and the table gets dressed for you: another card back, another felt, and a small <HouseMark /> next to your
        name in the Hall of hands and on share cards. Nothing else.
      </p>
      <p class="plain">Cosmetic only, never changes the cards, the score or the odds. Without signing in you lose nothing: every hand plays the same.</p>
      <div class="swatches">
        {LOOKS.map((lk) => (
          <Swatch lk={lk} on={cur.id === lk.id} locked={!hs && lk.id !== "house"} onPick={() => pickLook(lk.id)} />
        ))}
      </div>
      {hs ? (
        <div class="house-on">
          <p>
            <HouseMark /> On for <b class="who">{hs.name}</b> ({short(hs.address)}) for about {plural(endsIn, "hour")}, until the UTC day ends. Use that name on
            a challenge link and the mark rides along. Tomorrow, sign again.
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
  const mine = local.get<HallEntry[]>("kk.hall", []);
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
      toast(`${r.name} is yours. Runs you post under it are verified and follow you to any device.`);
    } catch (e) {
      const m = String((e as Error)?.message || e);
      setErr(/reject|denied|cancel/i.test(m) ? "Signature cancelled. Nothing was sent." : m);
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
          <SignInChip big />
          <p class="note">Sign in to claim your name and keep this record on any device: your Daily streak, your best hand of each day, your last 30 runs.</p>
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
        <h3>Best hands</h3>
        {p ? (
          p.best.length ? (
            <ol class="mybest">
              {p.best.slice(0, 10).map((b) => (
                <li>
                  <span class="d">{dayLabel(b.day)}</span> <b class="m">{fmt(b.total)}</b> {b.handName}{" "}
                  <a href={`/c/${b.id}`}>replay ↗</a>
                </li>
              ))}
            </ol>
          ) : (
            <p class="note">No verified runs yet. Post one with your name and it lands here.</p>
          )
        ) : mine.length ? (
          <ol class="mybest">
            {mine.slice(0, 10).map((h) => (
              <li>
                <b class="m">{fmt(h.total)}</b> {h.hand} · ante {h.ante} <a href={`/?s=${h.seed}&e=${h.edition}`}>play this seed ↗</a>
              </li>
            ))}
          </ol>
        ) : (
          <p class="note">Nothing yet. Your best hand of each run lands here.</p>
        )}
      </section>
      {p && (
        <section>
          <h3>Recent runs</h3>
          {p.recent.length ? (
            <ol class="myruns">
              {p.recent.map((r) => (
                <li>
                  <span class="d">{dayLabel(r.at.slice(0, 10))}</span> {r.won ? "won the run" : `ante ${r.ante}`} · <b class="m">{fmt(r.total)}</b> {r.handName}
                  {r.daily ? " · Daily Deal" : ""} <a href={`/c/${r.id}`}>replay ↗</a> <a href={`/?s=${r.seed}&e=${r.edition}`}>same seed ↗</a>
                </li>
              ))}
            </ol>
          ) : (
            <p class="note">No runs posted yet.</p>
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
        <h3>Sign in, sit down</h3>
        <p>
          Sign in with email, Google, X, Discord or a wallet, through Para. Nothing about the cards changes: ${GAME_TOKEN.symbol} holders still dress the
          table, and everybody plays exactly the same hand.
        </p>
      </section>
      <section>
        <h3>Your name, your record</h3>
        <p>
          Signed in, one plain message a day claims your Hall of hands name: nobody else can post under it, and your lines get a ✓. Your Daily streak, best
          hands and last 30 runs follow you to any device, in Your table.
        </p>
      </section>
      <section>
        <h3>A better table</h3>
        <p>Card corners you can read in a fanned hand, a felt with a centre, a live read of what your selection is worth, and bigger cards on big screens.</p>
      </section>
      <section>
        <h3>Honest labels</h3>
        <p>Decks are cut every few hours, so the title says so. Blinds show their cash-out: game money, spent in the shop.</p>
      </section>
      <div class="row">
        <button class="btn gold" onClick={() => A.dailyRun()}>
          Play the Daily Deal
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
  return (
    <div class={"coach " + (u.run?.s.phase === "round" ? "in-round" : "in-menu")} role="status">
      <p>{u.coach.text}</p>
      <div class="row">
        {u.coach.step === 1 && u.run?.s.phase === "round" && (
          <button class="btn teal small" onClick={() => A.hint()}>
            Show me a good hand
          </button>
        )}
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
      {u.overlay === "deck" && <Deck />}
      {u.overlay === "levels" && <Levels />}
      {u.overlay === "options" && <Options />}
      {u.overlay === "seed" && <SeedEntry />}
      {u.overlay === "hall" && <Hall />}
      {u.overlay === "over" && <Over />}
      {u.overlay === "house" && <House />}
      {u.overlay === "news" && <News />}
      {u.overlay === "table" && <Table />}
      {u.overlay === "more" && <More />}
      <CardDetail />
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
