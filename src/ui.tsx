// HTML overlays: title, how to play, deck, hand levels, run over + challenge sharing, menus, coach,
// the Daily Deal board, house colours and the what's-new note.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { BOSSES, FINAL_BOSS, HANDS, INSIDERS, MOVES, BLIND_NAME, ANTE_BASE } from "../shared/content.js";
import { ENH, GAME_TOKEN, RANK_LABEL, SOURCE_URL, SUITS, facePath, tokenUrl, type Card, type PoolCard } from "../shared/data.js";
import { audioState, setMusic, setSfx, unlock } from "./audio.js";
import { local, setUi, subscribe, toast, ui } from "./store.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { dayLabel, liveStreak, utcDay, type Streak } from "../shared/daily.js";
import { CHAIN_NAME, LOOKS, claimHouse, findWallets, house, look, short, type Look, type Wallet } from "./house.js";

export const VERSION = "1.1.0";

export interface Shared {
  id: string;
  url: string;
  daily: string | null;
  house: boolean;
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

const streakNow = () => liveStreak(local.get<Streak | null>("kk.streak", null), utcDay());
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

// ------------------------------------------------------------ title
/** vibe/vibe vibers, redrawn in the game palette, strolling above and below the logo. */
function Parade() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    fetch("/vibers/index.json")
      .then((r) => r.json())
      .then((all: string[]) => setNames(all.slice().sort(() => Math.random() - 0.5).slice(0, 16)))
      .catch(() => setNames([]));
  }, []);
  if (!names.length) return null;
  const row = (list: string[], cls: string) => (
    <div class={"parade " + cls} aria-hidden="true">
      <div class="track">
        {[...list, ...list, ...list, ...list].map((n, i) => (
          <img src={`/vibers/${n}.png`} alt="" width={96} height={96} style={{ animationDelay: `${(i % list.length) * 0.17}s` }} />
        ))}
      </div>
    </div>
  );
  return (
    <>
      {row(names.slice(0, 8), "up")}
      {row(names.slice(8), "down")}
    </>
  );
}
function Title() {
  const u = useUi();
  const ed = u.edition;
  const ch = u.challenge;
  const saved = A.hasSaved();
  return (
    <div class="title-screen">
      <Parade />
      <div class="logo" aria-label="KICKER">
        {"KICKER".split("").map((ch, i) => (
          <span style={{ animationDelay: `${i * 0.12}s` }}>{ch}</span>
        ))}
      </div>
      <p class="tag">A poker roguelike where every card is a live vibe/vibe launch.</p>
      {ch && (
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
      )}
      <div class="menu">
        {saved && (
          <button class="btn teal big" onClick={() => A.continueRun()}>
            Continue run
          </button>
        )}
        <div class="row deal">
          <button class={"btn big " + (saved ? "pink" : "teal")} disabled={!ed} onClick={() => A.newRun()}>
            {ed ? "New run" : u.editionError ? "Deck unavailable" : "Cutting the deck..."}
          </button>
          <button class="btn big gold daily-btn" disabled={!u.daily && !ed} onClick={() => A.dailyRun()} aria-label="Daily Deal">
            <span>Daily Deal</span>
            <small>
              {u.daily ? `${u.daily.label} · ${u.daily.players ? plural(u.daily.players, "player") + " today" : "same deal for all"}` : dayLabel(utcDay())}
              {streakNow() > 1 ? ` · streak ${streakNow()}` : ""}
            </small>
          </button>
        </div>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "how" })}>
            How to play
          </button>
          <button class="btn" onClick={() => setUi({ overlay: "hall" })}>
            Hall of hands
          </button>
        </div>
        <div class="row">
          <button class="btn" disabled={!ed} onClick={() => setUi({ overlay: "deck" })}>
            This hour's cards
          </button>
        </div>
        <div class="row minor">
          <button class="chip" onClick={() => setUi({ overlay: "seed" })}>
            Play a friend's seed
          </button>
          <SoundToggles />
        </div>
        <div class="row minor">
          <button class={"chip" + (house.get() ? " on gold" : "")} onClick={() => setUi({ overlay: "house" })}>
            House colours
          </button>
          <button class="chip" onClick={() => setUi({ overlay: "news" })}>
            What's new in 1.1
          </button>
        </div>
      </div>
      <div class="fresh">
        {ed ? (
          <>
            Fresh deck: <b>{ed.pool.reduce((n, p) => n + p.length, 0)}</b> live launches from vibe/vibe, reshuffled every hour.
          </>
        ) : u.editionError ? (
          "The launch index is not answering. Try again in a minute."
        ) : (
          "Shuffling the newest launches..."
        )}
      </div>
      <div class="chips-row">
        <a class="token-chip" href={GAME_TOKEN.url} target="_blank" rel="noopener" aria-label={`$${GAME_TOKEN.symbol} on vibe/vibe`}>
          <span class="tc-dot" aria-hidden="true">K</span>${GAME_TOKEN.symbol} ↗
        </a>
        <a class="token-chip src" href={SOURCE_URL} target="_blank" rel="noopener" aria-label="Source code on GitHub">
          <svg class="gh" viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          Source ↗
        </a>
      </div>
    </div>
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
        <p>Clearing a blind pays its reward ($3 / $4 / $5), $1 per unused hand and $1 interest per $5 you hold (max $5).</p>
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
        </p>
      </section>
      <section>
        <h3>Where the cards come from</h3>
        <p>
          Once an hour the game reads the newest ~1,300 launches from the vibe/vibe v6 index. Farm-bot launches (templated descriptions, generated names, numeric
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

// ------------------------------------------------------------ deck view
function DeckCard(props: { l: PoolCard; rank?: number; suit?: number; enh?: string | null; dim?: boolean; bridged?: boolean }) {
  const { l } = props;
  const suit = props.suit ?? l.u;
  const ch = l.x === null ? "n/a" : `${l.x >= 0 ? "+" : ""}${(l.x / 100).toFixed(1)}%`;
  return (
    <div
      class={"dcard" + (props.dim ? " dim" : "")}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
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
    <Modal title={`This hour's pool · deck #${ed.id}`} wide>
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
            <b class="who">{h.name}</b> · {h.handName} · {h.won ? "won the run" : `ante ${h.ante}`}
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
          <p class="note">Numbers as of the hourly deck cut. Rank comes from curve progress inside the suit.</p>
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
  const [name, setName] = useState(local.get<string>("kk.name", ""));
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
  const streak = streakNow();
  const brag = daily
    ? `Daily Deal · ${dayLabel(daily)} · ${fmt(s.best?.total || 0)} on KICKER, the poker roguelike dealt from live vibe/vibe launches. Same deal for everybody today. Beat it:`
    : `${won ? "Cleared all 8 antes" : `Reached ante ${s.ante}`} on KICKER, the poker roguelike dealt from live vibe/vibe launches. Best hand: ${fmt(s.best?.total || 0)}${s.best ? ` (${HANDS.find((h) => h.id === s.best!.hand)?.name})` : ""}. Same seed, same deal. Beat it:`;
  return (
    <Modal title={won ? "Graduated!" : "Rugged"} accent={won ? "#ffc23d" : "#ff3d7f"} onClose={() => setUi({ overlay: "over" })}>
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
        {ch && <p class={"vs " + (beat ? "win" : "")}>{beat ? `You beat ${ch.name || "the challenger"}!` : `${ch.name || "The challenger"} still leads: ante ${ch.ante}, best ${fmt(ch.best)}.`}</p>}
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
  useUi();
  const [name, setName] = useState(local.get<string>("kk.name", ""));
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, bump] = useState(0);
  const hs = house.get();
  const cur = look();
  const pickLook = (id: string) => {
    local.set("kk.look", id);
    A.lookChanged();
    bump((x) => x + 1);
  };
  const find = async () => {
    setErr("");
    const problem = nameProblem(name);
    if (problem) {
      setErr(problem);
      return;
    }
    setWallets(await findWallets());
  };
  const sign = async (w: Wallet) => {
    setErr("");
    setBusy(true);
    try {
      const n = cleanName(name);
      local.set("kk.name", n);
      await claimHouse(w, n);
      if (look().id === "house") local.set("kk.look", LOOKS[1].id);
      A.lookChanged();
      toast("House colours on. Same cards, same odds, better outfit.");
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
      <p class="plain">Cosmetic only, never changes the cards, the score or the odds. Without a wallet you lose nothing: every hand plays the same.</p>
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
            void find();
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
          <small class="hint">The mark is tied to this name for today (UTC).</small>
          {!wallets ? (
            <button class="btn gold" type="submit">
              Find my wallet
            </button>
          ) : wallets.length ? (
            <div class="wallets">
              {wallets.map((w) => (
                <button class="btn" type="button" disabled={busy} onClick={() => void sign(w)}>
                  {w.icon && <img src={w.icon} alt="" width={24} height={24} />}
                  {busy ? "Waiting for the signature..." : `Sign with ${w.name}`}
                </button>
              ))}
            </div>
          ) : (
            <p class="note">No browser wallet found on this page. That's fine: everything else plays exactly the same.</p>
          )}
        </form>
      )}
      {err && <p class="err">{err}</p>}
      <div class="safety">
        <b>Plain terms.</b> It's all on {CHAIN_NAME}. You sign a plain text message: no gas, no transaction, no approval, nothing moves. The server reads your{" "}
        {"$" + GAME_TOKEN.symbol} balance and that's it. KICKER never asks for a seed phrase or a private key. If anything ever does, it isn't us.
      </div>
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
        <h3>Daily Deal</h3>
        <p>
          One deal a day, the same for everybody: a seed fixed by the date, dealt from the first deck cut after 00:00 UTC. Post it with a name and it lands on the
          Daily board in the Hall of hands, one line per name, your best run of the day counts. Finish it on consecutive days for a streak.
        </p>
      </section>
      <section>
        <h3>House colours</h3>
        <p>
          ${GAME_TOKEN.symbol} holders can sign a plain message (no gas, nothing moves) to dress the table: three card backs and felts, and a small mark next to
          their name. Cosmetic only, never changes the cards, the score or the odds.
        </p>
      </section>
      <section>
        <h3>The token</h3>
        <p>The token can't touch whether you win. The cards come from the deck, the deck comes from the index, and the score comes from the cards.</p>
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
      <CardDetail />
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
