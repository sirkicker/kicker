// KICKER Club screens: found a club, the club office (HQ), the squad, the scout, the league, the match and the drills.
// The table (Pixi, src/club/table.ts) sits behind them in the slot each screen leaves for it.
import { render } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Launch } from "../../shared/data.js";
import {
  DRILLS_PER_DAY,
  FIXTURES_PER_DAY,
  KITS,
  RATING,
  ROD_NAME,
  ROD_OF,
  ROD_SLOTS,
  SQUAD,
  TACTIC,
  TACTICS,
  XI,
  bestRod,
  pairKey,
  ratings,
  roleRating,
  scorersOf,
  shootout,
  simulate,
  weekEnd,
  weekStart,
  type Fixture,
  type MatchState,
  type Side,
  type Spot,
  type Tactic,
} from "../../shared/club.js";
import { hash32, newSeed } from "../../shared/rng.js";
import { Head } from "../kit.js";
import { ApiError, api, cred, keyLine, parseKey, type Club, type GroupView, type Me, type MatchView } from "./state.js";
import { awayKit, type ClubTable } from "./table.js";
import { decisionLine, fullTimeLine, lineFor } from "../../shared/club-voice.js";
import { PressRoom, Shootout, WallDrill } from "./drills.js";
import { sfx, unlock } from "../audio.js";
import "./club.css";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const fmtSym = (l: Launch) => "$" + l.s.slice(0, 8);

// ---------------------------------------------------------------- app state
type Screen =
  | { k: "found" }
  | { k: "hq" }
  | { k: "squad" }
  | { k: "scout" }
  | { k: "league" }
  | { k: "match"; slot: number | null; friendly?: { side: Side; seed: string } }
  | { k: "train" }
  | { k: "wall" }
  | { k: "press" }
  | { k: "key" };

interface AppState {
  me: Me | null;
  screen: Screen;
  busy: boolean;
  toast: string | null;
  error: string | null;
}
let S: AppState = { me: null, screen: { k: "found" }, busy: false, toast: null, error: null };
const subs = new Set<() => void>();
function set(p: Partial<AppState>) {
  S = { ...S, ...p };
  subs.forEach((f) => f());
}
function useApp() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return S;
}
let toastT = 0;
export function toast(msg: string) {
  set({ toast: msg });
  clearTimeout(toastT);
  toastT = window.setTimeout(() => set({ toast: null }), 2800);
}
const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

let table: ClubTable;
const go = (screen: Screen) => set({ screen });

async function refreshMe(): Promise<Me | null> {
  try {
    const me = await api.me();
    set({ me, error: null });
    return me;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      cred.del();
      set({ me: null, screen: { k: "found" } });
    } else set({ error: errMsg(e) });
    return null;
  }
}
const patchClub = (club: Club) => S.me && set({ me: { ...S.me, club } });

export function sideOfClub(c: Club): Side {
  return { name: c.name, kit: KITS[c.kit] || KITS[0], squad: c.squad, xi: c.xi, tactic: c.tactic, captain: c.captain, form: c.form, wall: c.wall, mood: c.mood };
}

// ---------------------------------------------------------------- the table slot
/** An empty box the table fills: its rectangle on screen is handed to the Pixi table whenever it moves. */
function TableSlot(props: { class?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      table.fit({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    table.cover(false);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  return <div ref={ref} class={"table-slot " + (props.class || "")} aria-hidden="true" />;
}

// ---------------------------------------------------------------- small parts
export function ClubCrest(props: { name: string; kit: [number, number]; size: number }) {
  const h = hash32(props.name);
  const [a, b] = props.kit.map(hex);
  const pat = (h >> 4) % 4;
  const em = (h >> 12) % 4;
  return (
    <svg class="ccrest" width={props.size} height={props.size * 1.1} viewBox="-55 -60 110 121" aria-hidden="true">
      <defs>
        <clipPath id={"cc" + h}>
          <path d="M-50,-45 L50,-45 L50,12 L0,57 L-50,12 Z" />
        </clipPath>
      </defs>
      <path d="M-50,-45 L50,-45 L50,12 L0,57 L-50,12 Z" fill={a} />
      <g clip-path={`url(#cc${h})`} fill={b} opacity="0.9">
        {pat === 0 && [-30, -6, 18].map((x) => <rect x={x} y={-50} width={12} height={110} />)}
        {pat === 1 && <path d="M0,-50 L60,-50 L60,60 L0,60 Z" />}
        {pat === 2 && <path d="M-60,-5 L0,30 L60,-5 L60,12 L0,60 L-60,12 Z" />}
        {pat === 3 && [-30, -5, 20].map((y) => <rect x={-60} y={y} width={120} height={11} />)}
      </g>
      <path d="M-50,-45 L50,-45 L50,12 L0,57 L-50,12 Z" fill="none" stroke="#1a0816" stroke-width="6" />
      <circle cx="0" cy="-3" r="20" fill="#fff1dc" stroke="#1a0816" stroke-width="4" />
      {em === 0 && <circle cx="0" cy="-3" r="9" fill="#1a0816" />}
      {em === 1 && <path d="M0,-15 L4,-6 L13,-5 L6,1 L8,10 L0,5 L-8,10 L-6,1 L-13,-5 L-4,-6 Z" fill={a} />}
      {em === 2 && <path d="M0,-15 L12,-3 L0,9 L-12,-3 Z" fill={a} />}
      {em === 3 && <path d="M-11,6 L-11,-9 L-5,-2 L0,-13 L5,-2 L11,-9 L11,6 Z" fill={a} />}
    </svg>
  );
}

function Bar(props: { v: number; k: "pow" | "pac" | "grp" }) {
  return (
    <span class={"bar " + props.k} title={`${RATING[props.k].name} ${props.v} (${RATING[props.k].from})`}>
      <i style={{ width: `${((props.v - 20) / 75) * 100}%` }} />
    </span>
  );
}
function Ratings(props: { l: Launch }) {
  const r = ratings(props.l);
  return (
    <span class="ratings">
      <span class="rk pow">P</span>
      <Bar v={r.pow} k="pow" />
      <span class="rk pac">S</span>
      <Bar v={r.pac} k="pac" />
      <span class="rk grp">G</span>
      <Bar v={r.grp} k="grp" />
    </span>
  );
}

function Busy(props: { text?: string }) {
  return (
    <div class="busy">
      <span class="dots">
        <i />
        <i />
        <i />
      </span>
      {props.text || "One moment"}
    </div>
  );
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Week of Nov 2": the Monday the league week starts. */
const weekName = (w: number) => {
  const d = new Date(weekStart(w));
  return `Week of ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const weekLeft = (w: number) => {
  const ms = weekEnd(w) - Date.now();
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
};

// ---------------------------------------------------------------- found a club
function Found() {
  const [name, setName] = useState("");
  const [kit, setKit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bring, setBring] = useState(false);
  const [key, setKey] = useState("");
  const submit = async (e: Event) => {
    e.preventDefault();
    unlock();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.create(name, kit);
      cred.set({ id: r.club.id, secret: r.secret });
      await refreshMe();
      sfx.coin();
      go({ k: "hq" });
      toast("Club founded. Your eleven are on the rods.");
    } catch (x) {
      setErr(errMsg(x));
    }
    setBusy(false);
  };
  const bringIn = async () => {
    const c = parseKey(key);
    if (!c) return setErr("That is not a club key");
    cred.set(c);
    setBusy(true);
    const me = await refreshMe();
    setBusy(false);
    if (me) go({ k: "hq" });
    else setErr("No club for that key");
  };
  const preview = name.trim() || "Your Club";
  return (
    <div class="found">
      <div class="found-box">
        <div class="logo">
          KICKER <b>Club</b>
        </div>
        <p class="lede">Run a club of live vibe/vibe launches. Eight clubs a week, real managers, one table.</p>
        <ol class="how3">
          <li>
            <b>Pick your eleven.</b> Curve progress is Power, trades are Pace, holders are Grip.
          </li>
          <li>
            <b>Play your group.</b> Matches play themselves. You make three calls in each.
          </li>
          <li>
            <b>Drill between matches.</b> Training, the wall, the press room. Two a day.
          </li>
        </ol>
        {!bring ? (
          <form onSubmit={submit} class="found-form">
            <div class="crest-preview">
              <ClubCrest name={preview} kit={KITS[kit]} size={64} />
              <span>{preview}</span>
            </div>
            <label class="cf-field">
              <span>Club name</span>
              <input value={name} maxLength={12} placeholder="3-12 letters" onInput={(e) => setName((e.target as HTMLInputElement).value)} autoComplete="off" />
            </label>
            <div class="kits" role="radiogroup" aria-label="Kit">
              {KITS.map((k, i) => (
                <button type="button" role="radio" aria-checked={kit === i} class={"kit" + (kit === i ? " on" : "")} style={{ "--a": hex(k[0]), "--b": hex(k[1]) } as Record<string, string>} onClick={() => setKit(i)} aria-label={`Kit ${i + 1}`} />
              ))}
            </div>
            {err && <p class="cf-err">{err}</p>}
            <button class="btn gold big" disabled={busy || name.trim().length < 3}>
              {busy ? "Founding" : "Found the club"}
            </button>
            <button type="button" class="link" onClick={() => setBring(true)}>
              I have a club key
            </button>
          </form>
        ) : (
          <div class="found-form">
            <label class="cf-field">
              <span>Club key</span>
              <input value={key} placeholder="kicker-club:..." onInput={(e) => setKey((e.target as HTMLInputElement).value)} autoComplete="off" />
            </label>
            {err && <p class="cf-err">{err}</p>}
            <button class="btn gold big" disabled={busy} onClick={bringIn}>
              Bring the club here
            </button>
            <button type="button" class="link" onClick={() => setBring(false)}>
              Found a new club instead
            </button>
          </div>
        )}
        <p class="cf-privacy">No wallet, no sign-up. Your club lives in this browser as a key you can save. Nothing else about you is kept.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the club office
function fixtureFor(g: GroupView, a: number, b: number): Fixture | undefined {
  const key = pairKey(a, b);
  return g.fixtures.find((f) => pairKey(f.a, f.b) === key);
}
function scoreFor(f: Fixture, you: number): { us: number; them: number } {
  return f.a === you ? { us: f.sa, them: f.sb } : { us: f.sb, them: f.sa };
}

function Hq() {
  const { me } = useApp();
  if (!me) return <Busy />;
  const { club, group } = me;
  const you = club.slot;
  const row = group.table.findIndex((r) => r.slot === you);
  const drillsLeft = DRILLS_PER_DAY - club.drills;
  const matchesLeft = FIXTURES_PER_DAY - club.played;
  const opponents = group.members.filter((m) => m.slot !== you);
  const boosts = [club.form.some((f) => f > 0) && `Form ${club.form.map((f, i) => (f ? `${ROD_NAME[i]} +${f}` : "")).filter(Boolean).join(", ")}`, club.wall > 0 && `Wall ${club.wall}`, club.mood > 0 && `Stands ${club.mood}`].filter(Boolean);
  return (
    <div class="hq">
      <header class="hq-top">
        <ClubCrest name={club.name} kit={KITS[club.kit]} size={44} />
        <div class="who">
          <b>{club.name}</b>
          <small>
            {weekName(club.week)} · Group {club.group + 1} · {weekLeft(club.week)}
          </small>
        </div>
        <div class="place" title="Your place in the group">
          <b>{row + 1}</b>
          <small>of 8</small>
        </div>
        <button class="btn small" onClick={() => go({ k: "key" })} aria-label="Club key and settings">
          Key
        </button>
      </header>
      <TableSlot class="hq-table" />
      <section class="hq-panel">
        <div class="hq-acts">
          <button class="btn teal" onClick={() => go({ k: "squad" })}>
            Squad
          </button>
          <button class="btn" onClick={() => go({ k: "scout" })}>
            Scout{me.offers.length ? <span class="dot" /> : null}
          </button>
          <button class="btn" onClick={() => go({ k: "league" })}>
            Table
          </button>
          <button class="btn" onClick={() => go({ k: "match", slot: null })}>
            Friendly
          </button>
        </div>
        <h3>
          Drills <small>{drillsLeft > 0 ? `${drillsLeft} left today` : "done for today"}</small>
        </h3>
        <div class="drills">
          {(
            [
              ["train", "Training", "A rod gets sharper for the next match"],
              ["wall", "The wall", "Cover their shots, they miss more"],
              ["press", "Press room", "One answer, louder stands"],
            ] as const
          ).map(([k, name, text]) => {
            const done = club.drillsDone.includes(k);
            return (
              <button class={"hq-drill" + (done ? " done" : "")} disabled={done || drillsLeft <= 0} onClick={() => go({ k } as Screen)}>
                <b>{name}</b>
                <small>{done ? "Done today" : text}</small>
              </button>
            );
          })}
        </div>
        {boosts.length > 0 && <p class="boosts">Next league match: {boosts.join(" · ")}</p>}
        <h3>
          This week <small>{matchesLeft > 0 ? `${matchesLeft} league match${matchesLeft === 1 ? "" : "es"} left today` : "no more league matches today"}</small>
        </h3>
        <ul class="fixtures">
          {opponents.map((m) => {
            const f = fixtureFor(group, you, m.slot);
            const sc = f && scoreFor(f, you);
            const res = sc ? (sc.us > sc.them ? "w" : sc.us < sc.them ? "l" : "d") : "";
            return (
              <li class={res}>
                <ClubCrest name={m.name} kit={m.kit} size={28} />
                <span class="nm">
                  {m.name}
                  {!m.id && <small class="house">house</small>}
                </span>
                {sc ? (
                  <span class="sc">
                    {sc.us}–{sc.them}
                    {f.a !== you && <small> they came to you</small>}
                  </span>
                ) : (
                  <button class="btn gold small" disabled={matchesLeft <= 0} onClick={() => go({ k: "match", slot: m.slot })}>
                    Play
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- squad
function SquadScreen() {
  const { me } = useApp();
  const c = me!.club;
  const [xi, setXi] = useState(c.xi.slice());
  const [tactic, setTactic] = useState<Tactic>(c.tactic);
  const [captain, setCaptain] = useState(c.captain);
  const [sel, setSel] = useState<number | null>(null); // squad index
  const [busy, setBusy] = useState(false);
  const bench = [...Array(SQUAD).keys()].filter((q) => !xi.includes(q));
  const dirty = tactic !== c.tactic || captain !== c.captain || xi.some((q, i) => q !== c.xi[i]);
  useEffect(() => {
    table.setSides({ ...sideOfClub(c), xi, captain, tactic }, null);
  }, [xi.join(","), captain]);
  const tap = (q: number) => {
    if (sel === null) return setSel(q);
    if (sel === q) return setSel(null);
    const nx = xi.slice();
    const a = nx.indexOf(sel);
    const b = nx.indexOf(q);
    if (a >= 0 && b >= 0) [nx[a], nx[b]] = [nx[b], nx[a]];
    else if (a >= 0) nx[a] = q;
    else if (b >= 0) nx[b] = sel;
    let cap = captain;
    if (!nx.includes(cap)) cap = nx[ROD_SLOTS[3][0]];
    setXi(nx);
    setCaptain(cap);
    setSel(null);
    sfx.click();
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.lineup(xi, tactic, captain);
      patchClub(r.club);
      toast("Line-up saved");
      go({ k: "hq" });
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  };
  const Player = (p: { q: number; slot?: number }) => {
    const l = c.squad[p.q];
    const rod = p.slot !== undefined ? ROD_OF[p.slot] : bestRod(l);
    const val = Math.round(roleRating(ratings(l), rod));
    return (
      <button class={"pl" + (sel === p.q ? " sel" : "") + (sel !== null && sel !== p.q ? " target" : "")} onClick={() => tap(p.q)}>
        <Head l={l} size={38} />
        <span class="pn">
          <b>{fmtSym(l)}</b>
          <Ratings l={l} />
        </span>
        <span class="pv" title={p.slot !== undefined ? `Worth ${val} on this rod` : `Best on ${ROD_NAME[rod]}`}>
          {val}
          {p.slot === undefined && <small>{ROD_NAME[rod].slice(0, 3)}</small>}
        </span>
        {p.slot !== undefined && (
          <span
            class={"cap" + (captain === p.q ? " on" : "")}
            role="button"
            aria-label="Make captain"
            onClick={(e) => {
              e.stopPropagation();
              setCaptain(p.q);
            }}
          >
            C
          </span>
        )}
      </button>
    );
  };
  return (
    <div class="sheet squad">
      <header class="sheet-top">
        <button class="btn small" onClick={() => go({ k: "hq" })}>
          Back
        </button>
        <h2>Squad</h2>
        <button class="btn gold small" disabled={!dirty || busy} onClick={save}>
          Save
        </button>
      </header>
      <p class="cf-hint">{sel === null ? "Tap a player, then another to swap them. Tap C for the captain." : `Now tap who ${fmtSym(c.squad[sel])} swaps with.`}</p>
      <div class="tactics">
        {TACTICS.map((t) => (
          <button class={"tac" + (tactic === t ? " on" : "")} onClick={() => setTactic(t)}>
            <b>{TACTIC[t].name}</b>
            <small>{TACTIC[t].text}</small>
            <em>beats {TACTIC[TACTIC[t].beats].name}</em>
          </button>
        ))}
      </div>
      {[3, 2, 1, 0].map((rod) => (
        <div class="rodgroup">
          <h4>{ROD_NAME[rod]}</h4>
          {ROD_SLOTS[rod].map((slot) => (
            <Player q={xi[slot]} slot={slot} />
          ))}
        </div>
      ))}
      <div class="rodgroup bench">
        <h4>Bench</h4>
        {bench.map((q) => (
          <Player q={q} />
        ))}
      </div>
      <p class="legend">
        P Power from curve progress · S Pace from trades in 24h · G Grip from holders. The number is what a launch is worth on that rod.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- scout
function Scout() {
  const { me } = useApp();
  const c = me!.club;
  const [take, setTake] = useState<string | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const signed = c.signed === c.week || me!.offers.length === 0;
  const sign = async () => {
    if (!take || drop === null) return;
    setBusy(true);
    try {
      const r = await api.sign(take, drop);
      patchClub(r.club);
      set({ me: { ...S.me!, club: r.club, offers: [] } });
      sfx.coin();
      toast("Signed. They join the bench, or the rods if you put them there.");
      go({ k: "squad" });
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <div class="sheet scout">
      <header class="sheet-top">
        <button class="btn small" onClick={() => go({ k: "hq" })}>
          Back
        </button>
        <h2>Scout</h2>
        <span />
      </header>
      {signed ? (
        <p class="cf-empty">The scout comes back on Monday with three new names. One signing a week.</p>
      ) : (
        <>
          <p class="cf-hint">Three launches from this week's list. Sign one, and one of yours leaves.</p>
          <div class="offers">
            {me!.offers.map((l) => {
              const rod = bestRod(l);
              return (
                <button class={"offer" + (take === l.t ? " on" : "")} onClick={() => setTake(l.t)}>
                  <Head l={l} size={56} />
                  <b>{fmtSym(l)}</b>
                  <small>{l.n}</small>
                  <Ratings l={l} />
                  <em>
                    Best on {ROD_NAME[rod]}: {Math.round(roleRating(ratings(l), rod))}
                  </em>
                </button>
              );
            })}
          </div>
          {take && (
            <>
              <h4>Who leaves</h4>
              <div class="leavers">
                {c.squad.map((l, q) => (
                  <button class={"leaver" + (drop === q ? " on" : "")} onClick={() => setDrop(q)}>
                    <Head l={l} size={30} />
                    <span>{fmtSym(l)}</span>
                    <small>{c.xi.includes(q) ? ROD_NAME[ROD_OF[c.xi.indexOf(q)]].slice(0, 3) : "Bench"}</small>
                  </button>
                ))}
              </div>
              <button class="btn gold big" disabled={drop === null || busy} onClick={sign}>
                Sign {fmtSym(me!.offers.find((o) => o.t === take)!)}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- league table
function League() {
  const { me } = useApp();
  const g = me!.group;
  const name = (slot: number) => g.members[slot]?.name || "?";
  return (
    <div class="sheet league">
      <header class="sheet-top">
        <button class="btn small" onClick={() => go({ k: "hq" })}>
          Back
        </button>
        <h2>
          Group {g.group + 1} · {weekName(g.week).replace("Week of ", "")}
        </h2>
        <span />
      </header>
      <table class="ltable">
        <thead>
          <tr>
            <th />
            <th class="l">Club</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {g.table.map((r, i) => (
            <tr class={(r.slot === me!.club.slot ? "you" : "") + (i < 2 ? " top" : "")}>
              <td>{i + 1}</td>
              <td class="l">
                <ClubCrest name={r.name} kit={g.members[r.slot].kit} size={20} /> {r.name}
                {!g.members[r.slot].id && <small class="house">house</small>}
              </td>
              <td>{r.p}</td>
              <td>{r.w}</td>
              <td>{r.d}</td>
              <td>{r.l}</td>
              <td>{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td>
              <td>
                <b>{r.pts}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="cf-hint">The top two at the week's end take the honours. Every club plays every other once: whoever plays first hosts.</p>
      <h4>Results</h4>
      <ul class="results">
        {g.fixtures.length === 0 && <li class="cf-empty">No results yet this week.</li>}
        {g.fixtures
          .slice()
          .reverse()
          .map((f) => (
            <li>
              <span class="l">{name(f.a)}</span>
              <b>
                {f.sa}–{f.sb}
              </b>
              <span class="r">{name(f.b)}</span>
              {f.scorers.length > 0 && <small>{f.scorers.map((s) => `$${s.s} ${s.min}'`).join(" · ")}</small>}
            </li>
          ))}
      </ul>
      {me!.club.honours.length > 0 && (
        <>
          <h4>Honours</h4>
          <ul class="honours">
            {me!.club.honours.map((h) => (
              <li>
                {weekName(h.week)}: {h.place === 1 ? "Group winners" : h.place === 2 ? "Runners-up" : `${h.place}th`} · {h.pts} pts
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the match
type Phase = "loading" | "playing" | "decide" | "sending" | "shootout" | "full" | "error";
function Match(props: { slot: number | null }) {
  const { me } = useApp();
  const club = me!.club;
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<MatchView | null>(null);
  const [shown, setShown] = useState(0);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [min, setMin] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pens, setPens] = useState<{ won: boolean; a: number; b: number } | null>(null);
  const friendly = props.slot === null;
  const fr = useRef<{ side: Side; seed: string; choices: number[] } | null>(null);
  const stop = useRef(false);

  // friendlies run on the client: same rules, nothing stored
  const friendlyView = (choices: number[]): MatchView => {
    const f = fr.current!;
    const home = sideOfClub(club);
    const st = simulate(home, f.side, f.seed, choices);
    return { home, away: f.side, state: st, slot: -1 };
  };

  const playFrom = async (v: MatchView, from: number) => {
    setPhase("playing");
    const ms = v.state.moments;
    for (let i = from; i < ms.length; i++) {
      if (stop.current) return;
      const m = ms[i];
      setMin(m.min);
      table.say(lineFor(m, v.home, v.away, i), m.out === "goal" ? (m.side === 0 ? "up" : "down") : "flat");
      await table.play(m, { ...v.home, xi: v.state.live.xi[0] }, { ...v.away, xi: v.state.live.xi[1] });
      await new Promise((r) => setTimeout(r, 60));
      if (m.out === "goal") table.crowd(0.6 + club.mood * 0.1, m.side === 0 ? "cheer" : "quiet");
      setScore([m.score[0], m.score[1]]);
      setShown(i + 1);
    }
    if (stop.current) return;
    if (v.state.pending) {
      table.say(decisionLine(v.state.pending.n, v.state.score), "flat");
      setMin(v.state.pending.min);
      setPhase("decide");
    } else {
      setMin(90);
      if (friendly && v.state.score[0] === v.state.score[1]) setPhase("shootout");
      else finish(v);
    }
  };
  const finish = (v: MatchView) => {
    table.say(fullTimeLine(v.state.score, v.home.name, v.away.name, hash32(v.home.name + v.away.name)), v.state.score[0] > v.state.score[1] ? "up" : v.state.score[0] < v.state.score[1] ? "down" : "flat");
    table.crowd(0.5, v.state.score[0] >= v.state.score[1] ? "cheer" : "quiet");
    setPhase("full");
    sfx.fullTime();
    table.setScore(v.state.score, null);
    if (!friendly) void refreshMe();
  };

  useEffect(() => {
    stop.current = false;
    (async () => {
      try {
        let v: MatchView;
        if (friendly) {
          const r = await api.friendly(club.id);
          fr.current = { side: r.side, seed: newSeed(), choices: [] };
          v = friendlyView([]);
        } else v = await api.kickoff(props.slot!);
        setView(v);
        table.setSides(v.home, v.away);
        table.setScore([0, 0], 0);
        sfx.whistle();
        table.crowd(0.45 + v.home.mood * 0.1, "idle");
        // a match picked up again shows its score so far at once
        const last = v.state.moments[v.state.moments.length - 1];
        if (last && v.state.pending && v.state.pending.n > 0) {
          setScore(last.score);
          table.setScore(last.score, v.state.pending.min);
          setShown(v.state.moments.length);
          setMin(v.state.pending.min);
          setPhase("decide");
          return;
        }
        await playFrom(v, 0);
      } catch (e) {
        setErr(errMsg(e));
        setPhase("error");
      }
    })();
    return () => {
      stop.current = true;
      table.skip();
    };
  }, []);

  const choose = async (i: number) => {
    if (!view) return;
    setPhase("sending");
    sfx.click();
    try {
      let v: MatchView;
      if (friendly) {
        fr.current!.choices.push(i);
        v = friendlyView(fr.current!.choices);
      } else v = await api.decide(props.slot!, i);
      setView(v);
      table.setXi(0, v.state.live.xi[0]);
      table.setXi(1, v.state.live.xi[1]);
      await playFrom(v, shown);
    } catch (e) {
      setErr(errMsg(e));
      setPhase("error");
    }
  };

  const away = view?.away;
  const st: MatchState | null = view?.state || null;
  const scorers = view && st ? scorersOf({ ...st, moments: st.moments.slice(0, shown) }, view.home, view.away) : [];
  return (
    <div class="match">
      <header class="scorebar">
        <span class="team home">
          <ClubCrest name={club.name} kit={KITS[club.kit]} size={30} />
          <b>{club.name}</b>
        </span>
        <span class="score">
          {score[0]}–{score[1]}
          <small>{phase === "full" ? "FT" : `${min}'`}</small>
        </span>
        <span class="team away">
          <b>{away?.name || "…"}</b>
          {away && view && <ClubCrest name={away.name} kit={awayKit(view.home, away)} size={30} />}
        </span>
      </header>
      <TableSlot class="match-table" />
      {phase === "playing" && (
        <button class="btn small skip" onClick={() => table.skip()}>
          Skip
        </button>
      )}
      {phase === "loading" && <Busy text={friendly ? "Finding a club for a friendly" : "Walking out"} />}
      {phase === "decide" && st?.pending && (
        <div class="decide">
          <h3>
            {st.pending.min}' · {st.pending.title}
          </h3>
          <div class="opts">
            {st.pending.options.map((o, i) => (
              <button class={"opt" + (i === 0 ? "" : " alt")} onClick={() => choose(i)}>
                <b>{o.label}</b>
                <small>{o.text}</small>
              </button>
            ))}
          </div>
          <p class="their">
            They play {TACTIC[st.live.tactic[1]].name}. You play {TACTIC[st.live.tactic[0]].name}.
          </p>
        </div>
      )}
      {phase === "sending" && <Busy text="Word to the bench" />}
      {phase === "shootout" && view && (
        <div class="shoot-wrap">
          <Shootout
            home={view.home}
            away={view.away}
            seed={fr.current!.seed}
            onDone={(picks: [Spot, Spot][], won: boolean) => {
              const r = shootout(view.home, view.away, fr.current!.seed, picks);
              setPens({ won, a: r.you.filter(Boolean).length, b: r.them.filter(Boolean).length });
              finish(view);
            }}
          />
        </div>
      )}
      {phase === "full" && view && st && (
        <div class="fulltime">
          <h3>{st.score[0] > st.score[1] ? "Win" : st.score[0] < st.score[1] ? "Loss" : "Draw"}{friendly ? " · friendly" : ""}</h3>
          <p class="big">
            {view.home.name} {st.score[0]}–{st.score[1]} {view.away.name}
          </p>
          {pens && (
            <p>
              Penalties {pens.a}–{pens.b}: {pens.won ? "you take the shootout" : "they take the shootout"}
            </p>
          )}
          {scorers.length > 0 && (
            <p class="scorers">
              {scorers.map((s) => (
                <span class={s.side === 0 ? "us" : "them"}>
                  ${s.s} {s.min}'
                </span>
              ))}
            </p>
          )}
          {st.notes.length > 0 && <p class="notes">Your calls: {st.notes.join(" · ")}</p>}
          {!friendly && <p class="notes">The result is in the group table. {view.away.house ? "" : `${view.away.name} will see it too.`}</p>}
          <div class="row">
            <button class="btn gold big" onClick={() => go({ k: "hq" })}>
              Back to the club
            </button>
          </div>
        </div>
      )}
      {phase === "error" && (
        <div class="fulltime">
          <h3>Off</h3>
          <p>{err}</p>
          <button class="btn gold" onClick={() => go({ k: "hq" })}>
            Back to the club
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- drills
function Training() {
  const { me } = useApp();
  const club = me!.club;
  const [rod, setRod] = useState<number | null>(null);
  const [hits, setHits] = useState<number | null>(null);
  const form = (h: number) => (h >= 5 ? 3 : h >= 3 ? 2 : h >= 1 ? 1 : 0);
  useEffect(() => {
    table.setSides(sideOfClub(club), null);
  }, []);
  const start = async (r: number) => {
    setRod(r);
    const h = await table.training(r, sideOfClub(club));
    setHits(h);
    try {
      const res = await api.drill("train", form(h), r);
      patchClub(res.club);
    } catch (e) {
      toast(errMsg(e));
    }
  };
  return (
    <div class="drillscreen train">
      <header class="sheet-top">
        <button class="btn small" disabled={rod !== null && hits === null} onClick={() => go({ k: "hq" })}>
          Back
        </button>
        <h2>Training</h2>
        <span />
      </header>
      {rod === null && (
        <div class="pickrod">
          <p class="cf-hint">Pick a rod. A ball runs across it, faster each time: tap to stop it on a figure. Five balls.</p>
          <div class="rods4">
            {[3, 2, 1, 0].map((r) => (
              <button class="btn teal" onClick={() => start(r)}>
                {ROD_NAME[r]}
                {club.form[r] > 0 && <small> form {club.form[r]}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      <TableSlot class="train-table" />
      {hits !== null && rod !== null && (
        <div class="fulltime">
          <h3>
            {hits} of 5 stopped
          </h3>
          <p>
            {form(hits) > 0 ? `${ROD_NAME[rod]} form +${form(hits)} for the next league match.` : "Nothing stuck today. The next session is tomorrow."}
          </p>
          <button class="btn gold big" onClick={() => go({ k: "hq" })}>
            Back to the club
          </button>
        </div>
      )}
    </div>
  );
}

function DrillWrap(props: { kind: "wall" | "press" }) {
  const { me } = useApp();
  const club = me!.club;
  const seed = `${club.id}|${club.day}|${props.kind}`;
  const done = async (v: number) => {
    try {
      const r = await api.drill(props.kind, v);
      patchClub(r.club);
    } catch (e) {
      toast(errMsg(e));
    }
    go({ k: "hq" });
  };
  return (
    <div class="drillscreen panelled">
      {props.kind === "wall" ? (
        <WallDrill seed={seed} home={sideOfClub(club)} onDone={(w: number) => void done(w)} onClose={() => go({ k: "hq" })} />
      ) : (
        <PressRoom seed={seed} club={club.name} onDone={(m: number) => void done(m)} onClose={() => go({ k: "hq" })} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the club key
function KeyScreen() {
  const c = cred.get();
  const [shown, setShown] = useState(false);
  const line = c ? keyLine(c) : "";
  const save = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([line + "\n"], { type: "text/plain" }));
    a.download = `kicker-club-${S.me?.club.name.replace(/\W+/g, "-").toLowerCase() || "key"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div class="sheet keyscreen">
      <header class="sheet-top">
        <button class="btn small" onClick={() => go({ k: "hq" })}>
          Back
        </button>
        <h2>Club key</h2>
        <span />
      </header>
      <p>Your club lives in this browser. The key is the only way to run it from another device or after clearing the browser. Keep it to yourself.</p>
      <div class="keybox">{shown ? line : "kicker-club:••••••••••"}</div>
      <div class="row">
        <button class="btn" onClick={() => setShown(!shown)}>
          {shown ? "Hide" : "Show"}
        </button>
        <button
          class="btn teal"
          onClick={() => {
            void navigator.clipboard?.writeText(line).then(() => toast("Key copied"));
          }}
        >
          Copy
        </button>
        <button class="btn gold" onClick={save}>
          Save key
        </button>
      </div>
      <p class="cf-privacy">No wallet and no account. The server keeps your club and a hash of this key, nothing else.</p>
      <p class="quiet">
        <a href="/classic.html">The old table (3.0)</a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- root
function App() {
  const s = useApp();
  const scr = s.screen;
  // the table shows your eleven whenever no match or drill owns it
  useEffect(() => {
    if (s.me && (scr.k === "hq" || scr.k === "scout" || scr.k === "league" || scr.k === "key")) table.setSides(sideOfClub(s.me.club), null);
    table.cover(scr.k === "found");
  }, [scr.k, s.me?.club]);
  let body;
  if (scr.k === "found" || !s.me) body = cred.get() && !s.error ? <Busy text="Opening the club office" /> : <Found />;
  else if (scr.k === "hq") body = <Hq />;
  else if (scr.k === "squad") body = <SquadScreen />;
  else if (scr.k === "scout") body = <Scout />;
  else if (scr.k === "league") body = <League />;
  else if (scr.k === "match") body = <Match key={String(scr.slot)} slot={scr.slot} />;
  else if (scr.k === "train") body = <Training />;
  else if (scr.k === "wall" || scr.k === "press") body = <DrillWrap kind={scr.k} />;
  else if (scr.k === "key") body = <KeyScreen />;
  return (
    <div class={"club-app scr-" + scr.k}>
      {body}
      {s.error && s.me === null && cred.get() && (
        <div class="fulltime">
          <h3>Off</h3>
          <p>{s.error}</p>
          <button class="btn gold" onClick={() => void refreshMe().then((m) => m && go({ k: "hq" }))}>
            Try again
          </button>
        </div>
      )}
      {s.toast && <div class="ctoast">{s.toast}</div>}
    </div>
  );
}

export async function mountClub(el: HTMLElement, t: ClubTable) {
  table = t;
  render(<App />, el);
  if (cred.get()) {
    const me = await refreshMe();
    if (me) go({ k: "hq" });
  }
  (window as unknown as { club: unknown }).club = { get: () => S, go, table: t, XI };
}
