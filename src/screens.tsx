// The screens between matches, in HTML over the table's panel area: match day, full time and the dressing room.
// Also the boss club's intro, the league table and the season's match-day programme. Every button goes back
// through the StageHost (src/stage.ts) or the UiActions, so the engine sees exactly the actions it saw before.
import { useEffect, useMemo, useState } from "preact/hooks";
import { BOSS, COACH, COACH_VIBER, DRILL, DRILLS, FINAL_SPOTS, FORM_NAME, MATCHDAYS, MAX_COACHES, MAX_PLAYS, PLAY, RODS, STYLES, TIER_NAME, drillCost, type DrillId } from "../shared/content.js";
import { PAIRS, TRAIT, facePath, traitsOf, tokenUrl, type Launch } from "../shared/data.js";
import { Run, colOf, laneOf, type Ev, type LeagueRow, type Step, type StoryLine } from "../shared/engine.js";
import { roomHint, ageLabel } from "../shared/insight.js";
import { lineFor, recapOf } from "../shared/voice.js";
import { dayLabel, liveStreak, utcDay, type Streak } from "../shared/daily.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { sfx } from "./audio.js";
import { house } from "./house.js";
import { me } from "./me.js";
import { h2hLine, h2hOf, local, reducedMotion, setUi, toast, type StageView } from "./store.js";
import { CHANT, Crest, Fig, Head, PAIR_HEX, PathFelt, captainOf, chantOf, crestKind, fmt, isYou, kitBand, kitOf, leagueOf, pts, ruleText, threatOf, useUi, yourKit } from "./kit.js";
import { drawFansOf, fixtureLabel, matchdayLabel, ordinal, targetOf, winFansOf } from "./season.js";
import type { Shared, UiActions } from "./ui.js";

let A: UiActions;
export function bindScreens(a: UiActions) {
  A = a;
}

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const rodName = (slot: number) => RODS[slot === 0 ? 0 : slot <= 2 ? 1 : slot <= 7 ? 2 : 3].name;

/** The fixture after this one: the next kind in the round, or the first of the next round. Null after the last. */
function nextFixture(run: Run, kind: number, round: number): { kind: number; round: number } | null {
  if (kind < 2) return { kind: kind + 1, round };
  if (round >= run.rounds) return null;
  return { kind: 0, round: round + 1 };
}

/** This run is today's Daily Match: one match day of three fixtures. */
const dailyNow = () => !!A?.isDaily();

// ------------------------------------------------------------ the stage, positioned over the table's panel area
export function Stage() {
  const u = useUi();
  const v = u.stage;
  if (!v || !u.run || v.host.run !== u.run || u.overlay === "title" || u.overlay === "over" || u.overlay === "boss") return null;
  if (u.run.s.phase !== v.phase) return null;
  const r = v.rect;
  return (
    <section
      class={"stage3 st-" + v.phase + (v.port ? " port" : " land") + (u.run.mode === "haunt" ? " haunt" : "")}
      style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}
      aria-label={v.phase === "fixture" ? "Match day" : v.phase === "fulltime" ? "Full time" : "Dressing room"}
    >
      {v.phase === "fixture" ? <MatchDay v={v} /> : v.phase === "fulltime" ? <FullTime v={v} /> : <Room v={v} />}
    </section>
  );
}

// ------------------------------------------------------------ match day
function resultOf(run: Run, kind: number, round = run.s.round): StoryLine | null {
  for (let i = run.s.story.length - 1; i >= 0; i--) {
    const x = run.s.story[i];
    if (x.round === round && x.kind === kind) return x;
  }
  return null;
}

function TraitTag(props: { l: Launch; run: Run }) {
  const all = traitsOf(props.l, props.run.s.editionAt);
  const t = props.run.mode === "haunt" && all.includes("ghost") ? "ghost" : all.filter((x) => x !== "ghost")[0];
  if (!t) return null;
  return (
    <span class="trait" title={`${TRAIT[t].name}: ${TRAIT[t].text}`}>
      {TRAIT[t].name}
    </span>
  );
}

function FixtureTile(props: { run: Run; k: number; port: boolean; onGo: () => void }) {
  const { run, k } = props;
  const s = run.s;
  const cur = k === s.kind;
  const done = k < s.kind;
  const haunt = run.mode === "haunt";
  const club = run.clubName(k);
  const boss = run.bossOf(k);
  const kind = crestKind(run, k);
  const kit = kitOf(club, kind);
  const sty = STYLES[run.styleOf(k)];
  const cap = useMemo(() => captainOf(run, k), [run, k, s.round]);
  const res = done ? resultOf(run, k) : null;
  const rec = h2hOf(club);
  const target = targetOf(run, k);
  const md = matchdayLabel(run, k);
  const home = !haunt && k === 2 && run.league ? run.homeTouches(2, s.round) : 0;
  const form = run.league && k < 2 ? FORM_NAME[run.formOf(club)] : null;
  const draw = drawFansOf(run, k);
  return (
    <article class={"fx" + (cur ? " cur" : "") + (done ? " done" : "") + (boss ? " boss" : "") + (haunt ? " ghost" : "")} style={{ "--kit": kit.main, "--kithi": kit.hi } as Record<string, string>}>
      <div class="fx-band" style={{ background: kitBand(kit) }} aria-hidden="true" />
      <div class="fx-crest">
        <Crest name={club} kind={kind} size={props.port ? 58 : 84} />
      </div>
      <div class="fx-body">
        <p class="fx-kind">
          {fixtureLabel(run, k)}
          {md ? ` · ${md.replace(/^Matchday/, "matchday")}` : boss === "bell" ? " · Closing Bell rule" : boss && boss !== "haunt" && !haunt ? " · rule" : ""}
        </p>
        <h3 class="fx-name">{club}</h3>
        <p class="fx-chant">“{chantOf(club)}”</p>
        {boss && <p class="fx-rule">{ruleText(boss)}</p>}
        <ul class="fx-facts">
          <li title={sty.text}>
            <b>{sty.name}</b>
            <span class="lo"> · {form ? form.toLowerCase() : threatOf(run.levelOf(k))}</span>
          </li>
          <li>
            First to {target} · win <b class="m">+{winFansOf(run, k)}</b>
            {draw ? (
              <>
                , draw <b class="m">+{draw}</b>
              </>
            ) : null}{" "}
            fans
          </li>
          {home > 0 && <li class="fx-home">{run.isFinal(2, s.round) ? "Top of the league" : "Home tie"}: +{home} touch on your first ball</li>}
          <li class="fx-h2h">{h2hLine(rec)}</li>
        </ul>
        {cap && (
          <button class="fx-cap" onClick={() => setUi({ detail: { l: cap } })} aria-label={`Their captain, $${cap.s}`}>
            <Head l={cap} size={props.port ? 30 : 38} ring={kit.hi} />
            <span>
              <b>${cap.s}</b>
              <small>captain</small>
            </span>
            <TraitTag l={cap} run={run} />
          </button>
        )}
      </div>
      <div class="fx-foot">
        {cur ? (
          <button class={"btn big " + (boss ? "pink" : "teal") + " fx-go"} onClick={props.onGo}>
            Kick off
          </button>
        ) : done && res ? (
          <span class={"fx-stamp " + res.key}>
            {res.key === "won" ? "Won" : res.key === "draw" ? "Drew" : "Lost"} {res.args.for}:{res.args.against}
          </span>
        ) : (
          <span class="fx-stamp next">Up next</span>
        )}
      </div>
    </article>
  );
}

function YourEleven(props: { run: Run; port: boolean }) {
  const s = props.run.s;
  return (
    <div class="eleven" aria-label="Your eleven">
      <p class="eleven-h">
        Your eleven <span class="lo">· tap a figure for its launch</span>
      </p>
      {[3, 2, 1, 0].map((r) => (
        <div class="erod">
          <span class="erod-n">{RODS[r].name}</span>
          <span class="erod-bar" aria-hidden="true" />
          <span class="erod-figs">
            {Array.from({ length: RODS[r].n }, (_, f) => RODS[r].slot + f).map((slot) => (
              <button class="efig" onClick={() => setUi({ detail: { l: s.squad[slot], slot } })} aria-label={`$${s.squad[slot].s}, ${RODS[r].name.toLowerCase()}`}>
                <Fig l={s.squad[slot]} small i={slot} />
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatchDay(props: { v: StageView }) {
  const { v } = props;
  const run = v.host.run;
  const s = run.s;
  const haunt = run.mode === "haunt";
  const daily = dailyNow();
  const league = leagueOf(run);
  const title = haunt ? "Haunted table" : daily ? "Daily match day" : `Round ${s.round} of ${run.rounds} · Match day`;
  const myRow = league ? league.find(isYou) : null;
  const sub = haunt
    ? `Three ghost clubs made of the cut's quietest launches. ${plural(s.fans, "fan")}.`
    : daily
      ? `Three fixtures, the same for everybody today. ${plural(s.fans, "fan")}.`
      : league && myRow && myRow.p === 0
        ? `The league starts today · ${league.length} clubs · ${plural(s.fans, "fan")}`
        : league && myRow
        ? `${ordinal(run.standing())} in the league · ${plural(pts(myRow), "point")} from ${myRow.p} · ${plural(s.fans, "fan")}`
        : `${plural(s.fans, "fan")} · ${s.cleared} won · round ${s.round} of ${run.rounds}`;
  return (
    <div class="st-scroll">
      <header class="st-head">
        <div>
          <h2>{title}</h2>
          <p class="st-sub">{sub}</p>
        </div>
        <div class="md-tools">
          {league && (
            <button class="btn small md-league-btn" onClick={() => setUi({ overlay: "league" })}>
              League table
            </button>
          )}
          <button class="btn small" onClick={() => v.host.lineup()}>
            Line-up
          </button>
          {s.visit > 0 && (
            <button class="btn small gold" onClick={() => v.host.back()}>
              Dressing room · {plural(s.fans, "fan")}
            </button>
          )}
        </div>
      </header>
      <div class="fx-row">
        {[0, 1, 2].map((k) => (
          <FixtureTile run={run} k={k} port={v.port} onGo={() => v.host.go()} />
        ))}
      </div>
      <YourEleven run={run} port={v.port} />
    </div>
  );
}

// ------------------------------------------------------------ full time: the match report
interface MatchGoal {
  side: 0 | 1;
  slot: number;
  style: string;
  rating: number;
  /** Your goals: the move, one segment per kick (passes, then the shot), each from the kicker's cell. */
  path: Step[][];
}
const goalsMemo = new Map<string, MatchGoal[]>();
/** The goals of the match just played, in order. The run keeps only the last touch's events, so this plays the trail once more. */
export function matchGoals(run: Run): MatchGoal[] {
  const key = `${run.s.seed}|${run.s.edition}|${run.mode}|${run.trail.length}`;
  const have = goalsMemo.get(key);
  if (have) return have;
  let out: MatchGoal[] = [];
  try {
    const r = new Run(run.ed, run.s.seed, run.mode, run.rules);
    let chain: Step[][] = [];
    let shot: { slot: number; path: Step[][] } | null = null;
    for (const a of run.trail) {
      const pre = r.s.match ? r.s.match.off.map((o) => o.slice()) : null;
      r.apply(a);
      if (a.t === "go") {
        out = [];
        chain = [];
      }
      for (const e of r.events as Ev[]) {
        if (e.e === "kick" && e.side === 0) {
          const seg: Step[] = [{ x: colOf(0, e.rod), lane: laneOf(e.rod, pre ? pre[0][e.rod] : 0, e.fig) }, ...e.steps];
          if (e.result === "pass") chain.push(seg);
          else if (e.result === "goal") shot = { slot: e.slot, path: [...chain, seg] };
          else if (e.result === "blocked") chain = [];
        }
        if (e.e === "turnover" || e.e === "kickoff") chain = [];
        if (e.e === "goal") {
          const mine = e.side === 0 ? shot : null;
          out.push({ side: e.side, slot: mine ? mine.slot : -1, style: e.style, rating: e.rating, path: mine ? mine.path : [] });
          shot = null;
          chain = [];
        }
      }
    }
  } catch {
    out = [];
  }
  goalsMemo.clear();
  goalsMemo.set(key, out);
  return out;
}

function LeagueMini(props: { rows: LeagueRow[]; max?: number }) {
  const max = props.max || 6;
  const at = props.rows.findIndex(isYou);
  // the top of the table, and your row with the one above it when you are further down
  const idx = at < max ? props.rows.map((_, i) => i).slice(0, max) : [...props.rows.map((_, i) => i).slice(0, max - 2), at - 1, at];
  const rows = idx.map((i) => props.rows[i]);
  return (
    <table class="lg mini">
      <thead>
        <tr>
          <th class="pos">#</th>
          <th class="club">Club</th>
          <th>P</th>
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, j) => (
          <tr class={(isYou(r) ? "you " : "") + (idx[j] === FINAL_SPOTS - 1 ? "cut " : "") + (j > 0 && idx[j] !== idx[j - 1] + 1 ? "gap" : "")}>
            <td class="pos">{idx[j] + 1}</td>
            <td class="club">
              <div class="lg-c">
                {isYou(r) ? <Crest name="you" kind="you" size={18} /> : <Crest name={r.club} kind="club" size={18} />}
                <span>{isYou(r) ? "You" : r.club}</span>
              </div>
            </td>
            <td>{r.p}</td>
            <td>{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
            <td class="pts">{pts(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FullTime(props: { v: StageView }) {
  const { v } = props;
  const run = v.host.run;
  const s = run.s;
  const ft = s.fulltime;
  const m = s.match;
  if (!ft || !m) return null;
  const haunt = run.mode === "haunt";
  const story = s.story[s.story.length - 1];
  const key = story?.key || "won";
  const goals = matchGoals(run);
  const mine = goals.filter((g) => g.side === 0);
  const desk = lineFor({ e: "whistle", reason: key === "won" ? "won" : key === "draw" ? "draw" : "lost" }, { run, n: s.story.length }) || "Full time.";
  const kind = crestKind(run, m.kind);
  const nx = dailyNow() && m.kind === 2 ? null : nextFixture(run, m.kind, s.round);
  const league = leagueOf(run);
  const [counted, setCounted] = useState(reducedMotion());
  useEffect(() => {
    if (counted) return;
    const t = ft.rows.map((_, i) => window.setTimeout(() => sfx.coin(), 260 + i * 220));
    const d = window.setTimeout(() => setCounted(true), 260 + ft.rows.length * 220);
    return () => {
      t.forEach(clearTimeout);
      clearTimeout(d);
    };
  }, []);
  const top = mine.slice().sort((a, b) => b.rating - a.rating)[0];
  const topL = top ? s.squad[top.slot] : null;
  return (
    <div class="st-scroll">
      <div class="ft-sheet">
        <div class="ft-block ft-scoreb">
          <p class="ft-kicker">
            Full time · {haunt ? "Haunted table" : dailyNow() ? `${fixtureLabel(run, m.kind)} · Daily match day` : `${fixtureLabel(run, m.kind)} · round ${s.round}`}
          </p>
          <div class="ft-score">
            <div class="ft-side you">
              <Crest name="you" kind="you" size={v.port ? 56 : 84} />
              <span>You</span>
            </div>
            <div class={"ft-digits " + key}>
              <b>{m.score[0]}</b>
              <i>:</i>
              <b>{m.score[1]}</b>
            </div>
            <div class="ft-side them">
              <Crest name={m.club} kind={kind} size={v.port ? 56 : 84} />
              <span>{m.club}</span>
            </div>
          </div>
          <p class="ft-desk">{desk}</p>
        </div>
        <div class="ft-block ft-fansb">
          <ul class="ft-fans">
            {ft.rows.map(([k2, n], i) => (
              <li style={{ "--d": `${0.26 + i * 0.22}s` } as Record<string, string>}>
                <span>{k2}</span>
                <b>+{n}</b>
              </li>
            ))}
          </ul>
          <button class="btn big gold ft-collect" onClick={() => v.host.collect()}>
            Collect {plural(ft.total, "fan")}
          </button>
          {nx ? (
            <div class="ft-next">
              <small>Next up</small>
              <Crest name={run.clubName(nx.kind, nx.round)} kind={crestKind(run, nx.kind, nx.round)} size={34} />
              <span>
                <b>{run.clubName(nx.kind, nx.round)}</b>
                <small>
                  {fixtureLabel(run, nx.kind, nx.round)}
                  {nx.round !== s.round ? ` · round ${nx.round}` : ""}
                </small>
              </span>
            </div>
          ) : (
            <div class="ft-next">
              <small>{dailyNow() ? "That was today's match day" : "That was the last match"}</small>
            </div>
          )}
        </div>
        <div class="ft-block ft-goalsb">
          <p class="lg-h">{mine.length ? (mine.length === 1 ? "The goal" : "The goals") : "No goals for you"}</p>
          <ul class="ft-scorers">
            {mine.map((g, i) => {
              const l = s.squad[g.slot];
              return (
                <li style={{ "--d": `${0.15 + i * 0.12}s` } as Record<string, string>}>
                  {l ? <Head l={l} size={v.port ? 30 : 38} /> : <span class="head blank" />}
                  <span class="sc-n">
                    <b>{l ? `$${l.s}` : "A goal"}</b>
                    <small>{g.style}</small>
                  </span>
                  <span class="sc-r">{fmt(g.rating)}</span>
                </li>
              );
            })}
            {mine.length < m.score[0] && (
              <li class="lo">
                <span class="sc-n">{plural(m.score[0] - mine.length, "earlier goal")}</span>
              </li>
            )}
            {m.score[1] > 0 && (
              <li class="conceded">
                <span class="sc-n">
                  {m.club} scored {m.score[1]}
                </span>
              </li>
            )}
          </ul>
          {top && top.path.length > 0 && (
            <div class="ft-move">
              <PathFelt path={top.path} scorer={topL} haunt={haunt} />
              <small>
                Goal of the match: {top.style}
                {topL ? `, $${topL.s}` : ""}
              </small>
            </div>
          )}
        </div>
        {league && (
          <div class="ft-block ft-league">
            <p class="lg-h">
              League table{" "}
              <button class="textlink" onClick={() => setUi({ overlay: "league" })}>
                full table
              </button>
            </p>
            <LeagueMini rows={league} max={v.port ? 4 : 5} />
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the dressing room: a locker wall
function DrillArt(props: { id: string }) {
  return (
    <svg viewBox="-50 -50 100 100" class="item-art" aria-hidden="true">
      <ellipse cx="0" cy="38" rx="40" ry="7" fill="#1a0816" opacity="0.4" />
      {props.id === "shoot" ? (
        <>
          <rect x="-38" y="-30" width="60" height="44" fill="none" stroke="#fff1dc" stroke-width="5" />
          <path d="M-34 -26h52M-34 -14h52M-34 -2h52M-24 -30v44M-10 -30v44M4 -30v44" stroke="#fff1dc" stroke-opacity="0.35" stroke-width="2" />
          <circle cx="26" cy="26" r="11" fill="#fff1dc" stroke="#1a0816" stroke-width="4" />
        </>
      ) : props.id === "pass" ? (
        <>
          <path d="M-32 22 Q0 -40 32 22" fill="none" stroke="#ffc23d" stroke-width="5" stroke-dasharray="8 6" />
          <polygon points="-40,30 -24,30 -32,8" fill="#ffc23d" stroke="#1a0816" stroke-width="3" />
          <polygon points="24,30 40,30 32,8" fill="#ffc23d" stroke="#1a0816" stroke-width="3" />
        </>
      ) : props.id === "feet" ? (
        <>
          <path d="M-30 10 h22 l10 10 v10 h-34 z" fill="#27c4e8" stroke="#1a0816" stroke-width="4" />
          <path d="M6 -6 h22 l10 10 v10 h-34 z" fill="#27c4e8" stroke="#1a0816" stroke-width="4" />
          <path d="M-26 34h28M10 18h28" stroke="#fff1dc" stroke-width="4" stroke-dasharray="3 5" />
        </>
      ) : (
        <>
          <rect x="-34" y="-26" width="68" height="14" rx="5" fill="#c9a24a" stroke="#1a0816" stroke-width="4" />
          <rect x="-24" y="-12" width="10" height="44" fill="#ff3d7f" stroke="#1a0816" stroke-width="3" />
          <rect x="14" y="-12" width="10" height="44" fill="#ff3d7f" stroke="#1a0816" stroke-width="3" />
        </>
      )}
    </svg>
  );
}
function PlayArt() {
  return (
    <svg viewBox="-50 -50 100 100" class="item-art" aria-hidden="true">
      <rect x="-38" y="-34" width="76" height="62" rx="8" fill="#1a0816" stroke="#ffc23d" stroke-width="4" />
      <circle cx="-18" cy="-12" r="6" fill="#ffc23d" />
      <circle cx="16" cy="10" r="6" fill="#ffc23d" />
      <path d="M-18 -12 L16 10" stroke="#fff1dc" stroke-width="3" />
      <path d="M-22 12 l8 8 m0 -8 l-8 8" stroke="#ff3d7f" stroke-width="4" />
      <ellipse cx="0" cy="40" rx="34" ry="6" fill="#1a0816" opacity="0.4" />
    </svg>
  );
}

function Room(props: { v: StageView }) {
  const { v } = props;
  const run = v.host.run;
  const s = run.s;
  const hint = roomHint(
    s.squad,
    (l) => run.ageHours(l),
    s.offers.filter((o) => o.kind === "coach" && !o.sold).map((o) => o.id),
  );
  const lv = DRILLS.filter((d) => s.drills[d.id] > 0).map((d) => `${d.name} ${s.drills[d.id]}`);
  return (
    <div class="st-scroll">
      <header class="st-head">
        <div>
          <h2>Dressing room</h2>
          <p class="st-sub">
            <b class="m">{plural(s.fans, "fan")}</b> in the stands · coaches {s.coaches.length}/{MAX_COACHES} · set pieces {s.plays.length}/{MAX_PLAYS}
          </p>
        </div>
      </header>
      {hint && <p class="room-hint">{hint.text}</p>}
      <div class="lockers">
        {s.offers.map((o, i) => {
          const full = (o.kind === "coach" && s.coaches.length >= MAX_COACHES) || (o.kind === "play" && s.plays.length >= MAX_PLAYS);
          const can = !o.sold && s.fans >= o.cost && !full;
          let label = "";
          let name = "";
          let text = "";
          let tone = "";
          let art: preact.JSX.Element;
          if (o.kind === "coach") {
            const d = COACH[o.id];
            label = `${TIER_NAME[d.tier]} coach${d.reads ? " · reads launches" : ""}`;
            name = d.name;
            text = d.text + ".";
            tone = "t" + d.tier;
            const vb = COACH_VIBER[d.id];
            art = vb ? <img class="item-art viber" src={`/vibers/${vb}.png`} alt="" width={96} height={96} /> : <span class="item-art" />;
          } else if (o.kind === "drill") {
            const d = DRILL[o.id as DrillId];
            const l2 = s.drills[d.id];
            label = `Training · level ${l2} to ${l2 + 1}`;
            name = d.name;
            text = d.text(l2 + 1) + ".";
            tone = "drill";
            art = <DrillArt id={d.id} />;
          } else {
            label = "Set piece · one use";
            name = PLAY[o.id].name;
            text = PLAY[o.id].text + ".";
            tone = "play";
            art = <PlayArt />;
          }
          return (
            <article class={"locker " + tone + (o.sold ? " sold" : "")} style={{ "--i": i } as Record<string, number>}>
              <div class="lk-vents" aria-hidden="true" />
              <p class="lk-label">{label}</p>
              <div class="lk-bay">
                <span class="lk-hook" aria-hidden="true" />
                {art}
              </div>
              <p class="lk-plate">{name}</p>
              <p class="lk-text">{text}</p>
              <button class="btn gold lk-buy" disabled={!can} onClick={() => v.host.buy(i)}>
                {o.sold ? "Signed" : full ? "Seats full" : `${o.cost} fans`}
              </button>
              {o.sold && <span class="lk-stamp">Signed</span>}
            </article>
          );
        })}
      </div>
      <p class="room-note">
        Coaches work every match, training stays for the season, a set piece is used once. Prices are fixed.
        {lv.length ? ` Training: ${lv.join(" · ")}.` : ""} Next levels: {DRILLS.map((d) => `${d.name} ${s.drills[d.id] >= d.max ? "max" : drillCost(s.drills[d.id])}`).join(", ")}.
      </p>
      <div class="st-actions">
        <button class="btn" onClick={() => v.host.lineup()}>
          Line-up
        </button>
        <button class="btn teal" onClick={() => v.host.next()}>
          Match day
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the league table, full
export function LeagueTable(props: { onClose: () => void }) {
  const u = useUi();
  const run = u.run;
  const rows = run ? leagueOf(run) : null;
  return (
    <div class="ov-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="ov-panel league-panel" role="dialog" aria-label="League table">
        <div class="ov-head">
          <h2>League table</h2>
          <button class="x" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div class="ov-body">
          {!rows ? (
            <p class="note">No league on this table.</p>
          ) : (
            <>
              <table class="lg">
                <thead>
                  <tr>
                    <th class="pos">#</th>
                    <th class="club">Club</th>
                    <th>P</th>
                    <th class="wdl">W</th>
                    <th class="wdl">D</th>
                    <th class="wdl">L</th>
                    <th>GD</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr class={(isYou(r) ? "you " : "") + (i === FINAL_SPOTS - 1 ? "cut" : "")}>
                      <td class="pos">{i + 1}</td>
                      <td class="club">
                        <div class="lg-c">
                          {isYou(r) ? <Crest name="you" kind="you" size={26} /> : <Crest name={r.club} kind="club" size={26} />}
                          <span>
                            {isYou(r) ? "You" : r.club}
                            {!isYou(r) && r.form !== undefined && <small class="lg-form">{FORM_NAME[r.form]}</small>}
                          </span>
                        </div>
                      </td>
                      <td>{r.p}</td>
                      <td class="wdl">{r.w}</td>
                      <td class="wdl">{r.d}</td>
                      <td class="wdl">{r.l}</td>
                      <td>{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                      <td class="pts">{pts(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p class="note">
                {run && run.leagueLeft() === MATCHDAYS
                  ? `${MATCHDAYS} matchdays to play. `
                  : run && run.leagueLeft() > 0
                  ? `After ${plural(MATCHDAYS - run.leagueLeft(), "matchday")} of ${MATCHDAYS}. `
                  : `All ${MATCHDAYS} matchdays played. `}
                Three points a win, one a draw. The top two meet in the final under the Closing Bell's rule, and a cup tie in the top two is a home tie: +1 touch
                on your first ball. A league loss does not end the season; the table does, once the top two are out of reach.
              </p>
            </>
          )}
          <button class="btn teal wide" onClick={props.onClose}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the boss club walks out
export function BossIntro() {
  const u = useUi();
  const run = u.run;
  if (!run) return null;
  const id = run.bossOf();
  if (!id) return null;
  const b = BOSS[id];
  const haunt = run.mode === "haunt";
  const cap = captainOf(run, 2);
  const sty = STYLES[run.styleOf()];
  const kind = crestKind(run, 2);
  // the final is played against the other club of the top two, under the Closing Bell's rule
  const club = run.clubName(2);
  const home = run.league ? run.homeTouches(2) : 0;
  const homeLine = home > 0 ? (id === "bell" ? ` Top of the league: +${home} touch on your first ball.` : ` A home tie for the top two: +${home} touch on your first ball.`) : "";
  const stakes =
    (id === "bell"
      ? "Win this and the season is yours."
      : id === "haunt"
        ? "Beat it to lay the Haunted table to rest. A draw is not enough."
        : dailyNow()
          ? "The last fixture of today's match day. A draw is not enough."
          : "A cup tie: lose or draw and the season ends here.") + homeLine;
  return (
    <div class={"boss3" + (haunt ? " haunt" : "") + (id === "bell" ? " bell" : "")} role="dialog" aria-label={b.name}>
      <div class="b3-rays" aria-hidden="true" />
      <div class="b3-in">
        <p class="b3-kicker">
          {haunt ? "Haunted table · the last ghost club" : dailyNow() ? "Daily match day · boss club" : id === "bell" ? `Round ${run.s.round} · the final` : `Round ${run.s.round} · cup tie`}
        </p>
        <div class="b3-crest">
          <Crest name={club} kind={kind} size={150} />
        </div>
        <h2 class="b3-name">{club}</h2>
        <p class="b3-chant">“{CHANT[club] || chantOf(club)}”</p>
        <div class="b3-rule">
          <span>{id === "bell" && club !== b.name ? `${b.name} rule` : "The rule"}</span>
          <p>{ruleText(id)}</p>
        </div>
        <div class="b3-meta">
          {cap && (
            <button class="b3-cap" onClick={() => setUi({ detail: { l: cap } })}>
              <Head l={cap} size={56} ring={haunt ? "#cfe3ee" : "#ff3d7f"} />
              <span>
                <small>Their captain</small>
                <b>${cap.s}</b>
                <TraitTag l={cap} run={run} />
              </span>
            </button>
          )}
          <p class="b3-style">
            <b>{sty.name}</b>
            <br />
            {sty.text}.
          </p>
        </div>
        <p class="b3-stakes">{stakes}</p>
        <div class="row">
          <button class="btn" onClick={() => setUi({ overlay: "squad" })}>
            Line-up
          </button>
          <button class="btn big gold boss-go" onClick={() => A.kickOff()}>
            Kick off
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the season's programme
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

/** The club that mattered most this season: the one that knocked you out, else the one you beat most often. */
function rivalOf(run: Run): { club: string; line: string; kind: "club" | "boss" | "ghost" } | null {
  const st = run.s.story;
  if (!st.length) return null;
  const last = st[st.length - 1];
  const kindOf = (x: StoryLine) => (run.mode === "haunt" ? "ghost" : x.args.boss ? "boss" : "club") as "club" | "boss" | "ghost";
  const record = (club: string) => {
    const r = h2hOf(club);
    return r.w + r.d + r.l > 1 ? ` All time on this device: ${h2hLine(r).replace(/^You/, "you").replace(/^They/, "they").replace(/^Level/, "level")}.` : "";
  };
  if (last.key === "lost" && run.s.phase === "over")
    return { club: String(last.args.club), line: `${last.args.final ? "Beat you in the final" : last.args.out ? "The defeat that settled the table" : "Knocked you out"}, ${last.args.for}:${last.args.against}.${record(String(last.args.club))}`, kind: kindOf(last) };
  const by = new Map<string, StoryLine[]>();
  for (const x of st) by.set(String(x.args.club), [...(by.get(String(x.args.club)) || []), x]);
  let best: StoryLine[] = [];
  for (const v of by.values()) {
    const margin = (l: StoryLine[]) => l.reduce((n, x) => n + Number(x.args.for) - Number(x.args.against), 0);
    if (v.length > best.length || (v.length === best.length && margin(v) < margin(best))) best = v;
  }
  if (!best.length) best = [st.reduce((a, x) => (Number(x.args.for) - Number(x.args.against) < Number(a.args.for) - Number(a.args.against) ? x : a))];
  const x = best[0];
  const scores = best.map((y) => `${y.args.for}:${y.args.against}`).join(", ");
  const closest = best.length === 1 ? `The closest call: ${scores}.` : `Met ${best.length} times: ${scores}.`;
  return { club: String(x.args.club), line: closest + record(String(x.args.club)), kind: kindOf(x) };
}

/** Three dry lines from the desk about the season: the best goal, the run, the way it ended. */
function deskLines(run: Run, topSlot: number | null): string[] {
  const s = run.s;
  const out: string[] = [];
  const best = s.best;
  if (best) {
    const sc = s.squad[best.scorer];
    const fake = { e: "kick", side: 0, rod: 3, fig: 0, kick: { r: 4, d: 0 }, steps: [], result: "goal", at: null, beaten: 0, to: -1, drift: 0, slot: best.scorer, toSlot: -1, bounces: 0 } as Ev;
    const l = lineFor(fake, { run, n: 900 });
    out.push(l || `${sc ? "$" + sc.s : "The scorer"} finds the corner.`);
    const passes = best.path.length - 1;
    if (passes >= 2) out.push(lineFor({ e: "chain", n: passes, lanes: [] }, { run, n: 901 }) || `${passes} passes. Volume on the move.`);
  }
  const won = s.phase === "won" || (dailyNow() && dailyDone(run) && s.phase !== "over");
  const last = s.story[s.story.length - 1];
  if (won) out.push(lineFor({ e: "whistle", reason: won && run.mode === "season" && !dailyNow() ? "final" : "won" }, { run, n: 902 }) || "Closed green.");
  else if (last) out.push(lineFor({ e: "whistle", reason: last.key === "draw" ? "draw" : "lost" }, { run, n: 903 }) || "Closed red.");
  if (out.length < 3 && topSlot !== null) {
    const l = s.squad[topSlot];
    out.push(`$${l.s}: ${plural(s.scorers[topSlot] || 0, "goal")}, ${plural(l.k, "trade")} on the day.`);
  }
  if (out.length < 3) out.push(`${s.goalsFor} for, ${s.goalsAgainst} against. The book balances.`);
  return out.slice(0, 3);
}

/** The Daily Match is one match day: done once its third fixture is won (or any is lost). */
export function dailyDone(run: Run): boolean {
  const s = run.s;
  return s.phase === "over" || s.phase === "won" || s.round > 1 || (s.round === 1 && s.kind === 2 && s.phase === "fulltime");
}

const streakOf = () => liveStreak(local.get<Streak | null>("kk.streak", null), utcDay());

export function Programme() {
  const u = useUi();
  const run = u.run;
  const [name, setName] = useState(me.get()?.name || local.get<string>("kk.name", ""));
  const [busy, setBusy] = useState<"" | "image" | "link">("");
  const [link, setLink] = useState<Shared | null>(null);
  const [copied, setCopied] = useState(false);
  const [nameErr, setNameErr] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);
  if (!run) return null;
  const s = run.s;
  const haunt = run.mode === "haunt";
  const daily = A.isDaily();
  const won = s.phase === "won" || (!!daily && dailyDone(run) && s.phase !== "over");
  const ch = u.challenge;
  const beat = ch && (s.cleared > ch.cleared || (s.cleared === ch.cleared && (s.best?.total || 0) > ch.best));
  const full = link ? `${location.origin}${link.url}` : "";
  const sc = Object.entries(s.scorers).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
  const topSlot = sc ? Number(sc[0]) : null;
  const top = topSlot !== null ? s.squad[topSlot] : null;
  const best = s.best;
  const scorer = best ? s.squad[best.scorer] : null;
  const rival = rivalOf(run);
  const recap = recapOf(run);
  const lines = run.mode === "season" && run.league ? recap.lines : deskLines(run, topSlot);
  const last = s.story[s.story.length - 1];
  const tableRow = recap.table;
  const period = haunt ? "night" : daily ? "day" : "season";
  const played = Math.min(s.story.length, 3);
  const headline = haunt
    ? won
      ? "Laid to rest"
      : "Haunted table over"
    : daily
      ? won
        ? "Match day won"
        : "Match day over"
      : won
        ? "Champions"
        : recap.end === "final"
          ? "Runners-up"
          : "Season over";
  const reached = haunt
    ? won
      ? "Beat all three ghost clubs"
      : `Won ${s.cleared} of 3`
    : daily
      ? won
        ? s.draws
          ? `Through all three: ${plural(s.cleared, "win")}, ${plural(s.draws, "draw")}`
          : "Won all three fixtures"
        : `Out in fixture ${Math.min(s.kind + 1, 3)} of 3`
      : won
        ? run.league
          ? `Won the final${last ? ` against ${last.args.club}, ${last.args.for}:${last.args.against}` : ""}`
          : `Won all ${run.rounds} rounds`
        : recap.end === "table"
          ? `Out on the league table in round ${s.round}`
          : recap.end === "final"
            ? `Lost the final${last ? ` to ${last.args.club}, ${last.args.for}:${last.args.against}` : ""}`
            : `Out in round ${s.round}${last ? ` to ${last.args.club}, ${last.args.for}:${last.args.against}` : ""}`;
  const brag = haunt
    ? `${won ? "Beat all three ghost clubs" : `Won ${s.cleared} of 3`} on the Haunted table at KICKER, turn-based table football with live vibe/vibe launches on my rods and the quietest ones on theirs. Best goal: ${fmt(best?.total || 0)}. Same seed, same ghosts:`
    : daily
      ? `Daily match day · ${dayLabel(daily)} · best goal ${fmt(best?.total || 0)} on KICKER, turn-based table football with live vibe/vibe launches on the rods. Same squad for everybody today. Beat it:`
      : `${won ? "Won the whole season" : recap.end === "final" ? "Reached the final" : `Reached round ${s.round}`} on KICKER, turn-based table football with live vibe/vibe launches on the rods. Best goal: ${fmt(best?.total || 0)}${best ? ` (${best.style})` : ""}. Same seed, same season. Beat it:`;
  const hs = house.get();
  const sess = me.get();
  const nm = name.trim();
  const verified = !!sess && !!nm && cleanName(name).toLowerCase() === sess.name.toLowerCase();
  const marked = !!hs && !!nm && cleanName(name).toLowerCase() === hs.name.toLowerCase();
  const post = async (why: "image" | "link"): Promise<Shared | null> => {
    if (link) return link;
    const problem = nm ? nameProblem(name) : null;
    if (problem) {
      setNameErr(problem);
      return null;
    }
    setNameErr("");
    setBusy(why);
    if (nm) local.set("kk.name", cleanName(name));
    const r = await A.share(name);
    setBusy("");
    if (r) setLink(r);
    return r;
  };
  const kitY = yourKit();
  return (
    <div class="ov-backdrop prog-bg" onClick={(e) => e.target === e.currentTarget && setUi({ overlay: null })}>
      <div class={"prog" + (haunt ? " haunt" : "") + (won ? " won" : "")} role="dialog" aria-label={headline}>
        <button class="x prog-x" aria-label="Close" onClick={() => setUi({ overlay: null })}>
          ×
        </button>
        <div class="prog-scroll">
          <section class="prog-cover" style={{ "--kit": kitY.main, "--kithi": kitY.hi, "--trim": kitY.trim } as Record<string, string>}>
            <div class="pc-stripes" aria-hidden="true" />
            <p class="pc-top">KICKER · match day programme</p>
            <div class="pc-crest">
              <Crest name="you" kind="you" size={112} />
            </div>
            <h2 class="pc-head">{headline}</h2>
            <p class="pc-reached">{reached}</p>
            <div class="pc-stats">
              <div>
                <small>{haunt ? "Matches" : daily ? "Fixtures" : "Round"}</small>
                <b>{haunt || daily ? `${played}/3` : Math.min(s.round, run.rounds)}</b>
              </div>
              {tableRow ? (
                <div>
                  <small>League · {tableRow.pts} pts</small>
                  <b>{ordinal(tableRow.pos)}</b>
                </div>
              ) : (
                <div>
                  <small>Won</small>
                  <b>{s.cleared}</b>
                </div>
              )}
              <div>
                <small>Goals</small>
                <b>
                  {s.goalsFor}:{s.goalsAgainst}
                </b>
              </div>
            </div>
            {best && best.figs.length > 0 && (
              <div class="pc-five" aria-label="The figures of the goal of the season">
                <span class="lrod" />
                {best.figs.slice(0, 5).map((f, i) => (
                  <Fig l={f} i={i} small />
                ))}
              </div>
            )}
            <p class="pc-seed">
              {daily ? `Daily Match · ${dayLabel(daily)} · ` : ""}seed <b>{s.seed}</b> · cut #{s.edition}{" "}
              <button
                class="textlink"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(A.seedLink());
                    setSeedCopied(true);
                  } catch {
                    toast(A.seedLink());
                  }
                }}
              >
                {seedCopied ? "copied" : "copy seed"}
              </button>
            </p>
            {daily && streakOf() > 0 && <p class="pc-tag">Streak: {plural(streakOf(), "day")}</p>}
          </section>
          <div class="prog-pages">
            <section class="pg pg-launch">
              <h3>Launch of the {period}</h3>
              {top && topSlot !== null ? (
                <div class="pl-row">
                  <button class="pl-head" onClick={() => setUi({ detail: { l: top, slot: topSlot } })} aria-label={`$${top.s}`}>
                    <Fig l={top} noTick />
                  </button>
                  <div class="pl-text">
                    <b class="pl-tick" style={{ color: PAIR_HEX[top.u] }}>
                      ${top.s}
                    </b>
                    <span class="pl-goals">
                      <b>{s.scorers[topSlot]}</b> {s.scorers[topSlot] === 1 ? "goal" : "goals"}
                    </span>
                    <small>
                      {rodName(topSlot)} · {PAIRS[top.u].name} · curve {(top.p / 100).toFixed(top.p < 1000 ? 1 : 0)}% · {plural(top.k, "trade")} · {plural(top.h, "holder")} · {ageLabel(run.ageHours(top))} old
                    </small>
                    <a href={tokenUrl(top.t)} target="_blank" rel="noopener">
                      See the launch ↗
                    </a>
                  </div>
                </div>
              ) : (
                <p class="note">No goals this time. The launches are still live.</p>
              )}
            </section>
            <section class="pg pg-goal">
              <h3>
                Goal of the {period}{best ? <span class="pg-r"> · {fmt(best.total)}</span> : null}
              </h3>
              {best && best.path.length ? (
                <>
                  <PathFelt path={best.path} scorer={scorer} haunt={haunt} />
                  <p class="pg-cap">
                    <b>{best.style}</b>
                    {scorer ? ` by $${scorer.s}` : ""}
                    {best.path.length > 1 ? `, after ${plural(best.path.length - 1, "pass", "passes")}` : ""}.
                  </p>
                  {A.canReplay() && (
                    <button
                      class="btn small teal"
                      onClick={() => {
                        setUi({ overlay: null });
                        void A.replay()?.finally(() => setUi({ overlay: "over" }));
                      }}
                    >
                      Watch it again
                    </button>
                  )}
                </>
              ) : (
                <p class="note">No goal to show.</p>
              )}
            </section>
            {rival && (
              <section class="pg pg-rival">
                <h3>Rival of the {period}</h3>
                <div class="pr-row">
                  <Crest name={rival.club} kind={rival.kind} size={64} />
                  <div>
                    <b>{rival.club}</b>
                    <p>{rival.line}</p>
                    <small>“{chantOf(rival.club)}”</small>
                  </div>
                </div>
              </section>
            )}
            <section class="pg pg-desk">
              <h3>From the desk</h3>
              <ul>
                {lines.map((l) => (
                  <li>{l}</li>
                ))}
              </ul>
            </section>
            {ch && <p class={"vs " + (beat ? "win" : "")}>{beat ? `You beat ${ch.name || "the challenger"}.` : `${ch.name || "The challenger"} still leads: round ${ch.round}, best goal ${fmt(ch.best)}.`}</p>}
          </div>
        </div>
        <footer class="prog-foot">
          {!link ? (
            <div class="pf-name">
              <input
                class="field"
                maxLength={12}
                value={name}
                placeholder="Your name (optional)"
                aria-label="Name"
                onInput={(e) => {
                  setName((e.target as HTMLInputElement).value);
                  setNameErr("");
                }}
              />
              <small class="hint">
                {nameErr ? (
                  <span class="err">{nameErr}</span>
                ) : haunt ? (
                  "With a name, your best goal enters today's Haunted board."
                ) : daily ? (
                  "With a name, you go on today's Daily board."
                ) : (
                  "With a name, your best goal enters today's Hall of goals."
                )}
                {!nameErr && verified ? " Verified: it goes to Your table." : ""}
                {!nameErr && marked ? " House mark on." : ""}
              </small>
            </div>
          ) : (
            <div class="pf-link">
              <input class="field" readOnly value={full} onFocus={(e) => (e.target as HTMLInputElement).select()} aria-label="Challenge link" />
              <button
                class="btn small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(full);
                    setCopied(true);
                  } catch {
                    toast("Copy the link above");
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <a class="btn small" target="_blank" rel="noopener" href={`https://x.com/intent/post?text=${encodeURIComponent(brag)}&url=${encodeURIComponent(full)}`}>
                Post on X
              </a>
              {link.daily && <small class="hint">On the Daily board for {dayLabel(link.daily)}.</small>}
              {link.kit && <small class="hint">Haunted kit saved to Your table.</small>}
            </div>
          )}
          <div class="pf-buttons">
            <button
              class="btn gold pf-save"
              disabled={!!busy}
              onClick={async () => {
                const r = await post("image");
                if (r) void saveImage(r.id, s.seed);
              }}
            >
              {busy === "image" ? "Checking every touch..." : "Save image"}
            </button>
            <button
              class="btn teal"
              disabled={!!busy || !!link}
              onClick={() => void post("link")}
            >
              {busy === "link" ? "Checking every touch..." : link ? "Link ready" : "Challenge link"}
            </button>
            <button class="btn pink" onClick={() => A.newRun(haunt ? "haunt" : "season")}>
              {haunt ? "New Haunted table" : "New season"}
            </button>
            <button class="btn" onClick={() => setUi({ overlay: "title" })}>
              Title
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Face URL for a launch, re-exported for the Hall's thumbnails. */
export const faceOf = (l: { c: string | null; s: string }) => facePath(l.c, l.s);
