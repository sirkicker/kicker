// KICKER Club drills between matches: the Wall (a lane puzzle on the felt), the Press room (one question from the
// wire) and the Shootout (friendlies that end level). HTML over the table, in the table's own look.
import { useMemo, useState } from "preact/hooks";
import type { Launch } from "../../shared/data.js";
import {
  KICKS,
  ROD_SLOTS,
  SPOT_NAME,
  favSpot,
  ratings,
  shootout,
  shootoutPlan,
  shootoutTakers,
  type Side,
  type Spot,
} from "../../shared/club.js";
import { moodLabel, pressFor, type PressAnswer } from "../../shared/press.js";
import { shuffle, stream } from "../../shared/rng.js";
import { Fig, Head, hex, type Kit } from "../kit.js";
import "./drills.css";

const kitOfSide = (s: Side): Kit => ({
  main: hex(s.kit[0]),
  hi: hex(s.kit[1]),
  trim: "#1a0816",
});

function Close(p: { onClose: () => void }) {
  return (
    <button class="drill-x" onClick={p.onClose} aria-label="Close">
      ×
    </button>
  );
}

// ================================================================ the wall
/** Board columns: your goal line at 0, keeper rod 1, defence rod 2, their attack rod 7. */
const COL_K = 1;
const COL_D = 2;
const COL_A = 7;
const DEF_GAP = 4;
const LANES = 10;
const laneAt = (a: number, g: number, col: number) =>
  Math.round(a + ((g - a) * (COL_A - col)) / COL_A);

export interface WallPuzzle {
  att: number[]; // attacker lanes
  goal: number[]; // where each shot meets your goal line
  k0: number; // keeper start lane
  d0: number; // defence start offset (figures at d, d + 4)
}
/** The day's wall: from the seed, always solvable for 3. Exported for the tests. */
export function wallPuzzle(seed: string): WallPuzzle {
  const r = stream(seed, "wall");
  for (let tries = 0; tries < 400; tries++) {
    const k = 2 + Math.floor(r() * 6);
    const d = Math.floor(r() * (LANES - DEF_GAP));
    const ao = Math.floor(r() * 4);
    const att = [ao, ao + 3, ao + 6];
    // each shot is stopped by one of the three figures in the solved position
    const who = shuffle([0, 1, 2], r);
    const goal: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [col, lane] =
        who[i] === 0
          ? [COL_K, k]
          : who[i] === 1
            ? [COL_D, d]
            : [COL_D, d + DEF_GAP];
      const ok: number[] = [];
      for (let g = 2; g <= 7; g++)
        if (laneAt(att[i], g, col) === lane) ok.push(g);
      if (!ok.length) break;
      goal.push(ok[Math.floor(r() * ok.length)]);
    }
    if (goal.length < 3) continue;
    // start somewhere that covers at most one line
    for (let s = 0; s < 40; s++) {
      const k0 = Math.floor(r() * LANES);
      const d0 = Math.floor(r() * (LANES - DEF_GAP));
      if (
        covered({ att, goal, k0, d0 }, k0, d0).filter(Boolean).length <= 1 &&
        (k0 !== k || d0 !== d)
      )
        return { att, goal, k0, d0 };
    }
  }
  // never reached with real seeds: a plain fallback that is still solvable
  return { att: [1, 4, 7], goal: [4, 4, 4], k0: 0, d0: 0 };
}
export function covered(p: WallPuzzle, k: number, d: number): boolean[] {
  return p.att.map((a, i) => {
    const g = p.goal[i];
    return (
      laneAt(a, g, COL_K) === k ||
      [d, d + DEF_GAP].includes(laneAt(a, g, COL_D))
    );
  });
}
const X = (col: number) => 5 + col * 10; // % across
const Y = (lane: number) => (lane + 0.5) * 10; // % down

export function WallDrill(p: {
  seed: string;
  home: Side;
  onDone: (wall: 0 | 1 | 2 | 3) => void;
  onClose: () => void;
}) {
  const pz = useMemo(() => wallPuzzle(p.seed), [p.seed]);
  const [k, setK] = useState(pz.k0);
  const [d, setD] = useState(pz.d0);
  const [set, setSet] = useState(false);
  const cov = covered(pz, k, d);
  const n = cov.filter(Boolean).length as 0 | 1 | 2 | 3;
  const kit = kitOfSide(p.home);
  const keeper = p.home.squad[p.home.xi[ROD_SLOTS[0][0]]];
  const defs = ROD_SLOTS[1].map((slot) => p.home.squad[p.home.xi[slot]]);
  const lock = (fn: () => void) => () => !set && fn();
  return (
    <div
      class="drill wall"
      style={{ "--kit": kit.main, "--kithi": kit.hi } as Record<string, string>}
    >
      <Close onClose={p.onClose} />
      <h2>The wall</h2>
      <p class="drill-lead">
        Cover their three shots. Each covered line makes them miss more next
        match.
      </p>
      <div class="wall-board" aria-label="The felt, your goal on the left">
        <div class="wall-goal" />
        <svg
          class="wall-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {pz.att.map((a, i) => {
            // a covered shot ends on the figure that stops it: the defence first, then the keeper
            const g = pz.goal[i];
            const stopCol =
              !set || !cov[i]
                ? 0
                : [d, d + DEF_GAP].includes(laneAt(a, g, COL_D))
                  ? COL_D
                  : COL_K;
            return (
              <line
                key={i}
                x1={X(COL_A) - 3}
                y1={Y(a)}
                x2={stopCol ? X(stopCol) : X(0) - 5}
                y2={
                  stopCol ? Y(a + ((g - a) * (COL_A - stopCol)) / COL_A) : Y(g)
                }
                class={"shot" + (set ? (cov[i] ? " stopped" : " through") : "")}
                vector-effect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <Rod
          col={COL_K}
          lanes={[k]}
          who={[keeper]}
          kit={kit}
          hit={
            set
              ? [
                  cov.some(
                    (c, i) => c && laneAt(pz.att[i], pz.goal[i], COL_K) === k,
                  ),
                ]
              : []
          }
        />
        <Rod
          col={COL_D}
          lanes={[d, d + DEF_GAP]}
          who={defs}
          kit={kit}
          hit={
            set
              ? [d, d + DEF_GAP].map((L) =>
                  pz.att.some((a, i) => laneAt(a, pz.goal[i], COL_D) === L),
                )
              : []
          }
        />
        <div class="wall-rod them" style={{ left: `${X(COL_A)}%` }}>
          {pz.att.map((a, i) => (
            <span key={i} class="wall-att" style={{ top: `${Y(a)}%` }} />
          ))}
        </div>
      </div>
      {!set ? (
        <div class="wall-ctrl">
          <RodCtrl
            name="Keeper"
            up={lock(() => setK(Math.max(0, k - 1)))}
            down={lock(() => setK(Math.min(LANES - 1, k + 1)))}
            canUp={k > 0}
            canDown={k < LANES - 1}
          />
          <RodCtrl
            name="Defence"
            up={lock(() => setD(Math.max(0, d - 1)))}
            down={lock(() => setD(Math.min(LANES - 1 - DEF_GAP, d + 1)))}
            canUp={d > 0}
            canDown={d < LANES - 1 - DEF_GAP}
          />
          <button class="btn gold big wall-set" onClick={() => setSet(true)}>
            Set the wall
          </button>
        </div>
      ) : (
        <div class="drill-result">
          <p class="big-n">{n} of 3 covered</p>
          <p>
            {n === 3
              ? "A clean wall. Their shots will struggle next match."
              : n === 0
                ? "Nothing covered. The lanes stay open next match."
                : `Wall +${n} for the next match.`}
          </p>
          <button class="btn gold big" onClick={() => p.onDone(n)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function Rod(p: {
  col: number;
  lanes: number[];
  who: (Launch | undefined)[];
  kit: Kit;
  hit: boolean[];
}) {
  return (
    <div class="wall-rod" style={{ left: `${X(p.col)}%` }}>
      {p.lanes.map((lane, i) => {
        const l = p.who[i];
        return (
          <span
            key={i}
            class={"wall-fig" + (p.hit[i] ? " hit" : "")}
            style={{ top: `${Y(lane)}%` }}
          >
            {l ? (
              <Head l={l} size={34} ring={p.kit.hi} />
            ) : (
              <span class="head blank" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function RodCtrl(p: {
  name: string;
  up: () => void;
  down: () => void;
  canUp: boolean;
  canDown: boolean;
}) {
  return (
    <div class="rod-ctrl">
      <span>{p.name}</span>
      <button
        class="btn teal"
        onClick={p.up}
        disabled={!p.canUp}
        aria-label={`${p.name} up one lane`}
      >
        ▲
      </button>
      <button
        class="btn teal"
        onClick={p.down}
        disabled={!p.canDown}
        aria-label={`${p.name} down one lane`}
      >
        ▼
      </button>
    </div>
  );
}

// ================================================================ the press room
const VIBERS = [
  "agent-103",
  "agent-107",
  "agent-111",
  "agent-116",
  "agent-120",
  "agent-123",
  "agent-124",
  "agent-141",
  "agent-142",
  "agent-34",
];

export function PressRoom(p: {
  seed: string;
  club: string;
  onDone: (mood: 0 | 1 | 2 | 3, answer: string) => void;
  onClose: () => void;
}) {
  const q = useMemo(() => pressFor(p.seed), [p.seed]);
  const crowd = useMemo(
    () => shuffle(VIBERS, stream(p.seed, "press-crowd")).slice(0, 7),
    [p.seed],
  );
  const [pick, setPick] = useState<PressAnswer | null>(null);
  return (
    <div class="drill press">
      <Close onClose={p.onClose} />
      <h2>The press room</h2>
      <p class="drill-lead">
        One question from the wire. Your answer sets the mood in the stands for
        the next home match.
      </p>
      <div class="wire-box">
        <span class="wire-tag">WIRE</span>
        <span class="wire-q">
          {p.club}: {q.q}
        </span>
      </div>
      {!pick ? (
        <div class="press-answers">
          {q.answers.map((a, i) => (
            <button key={i} class="btn press-a" onClick={() => setPick(a)}>
              <span class="pa-text">“{a.text}”</span>
              <span class="pa-eff">{moodLabel(a.mood)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div class="drill-result">
          <div class={"press-stands m" + pick.mood} aria-hidden="true">
            {crowd.map((v, i) => (
              <img
                key={v}
                src={`/vibers/${v}.png`}
                alt=""
                style={{ "--i": i } as Record<string, number>}
              />
            ))}
          </div>
          <p class="press-said">“{pick.text}”</p>
          <p class="press-react">{pick.react}</p>
          <p class="big-n">{moodLabel(pick.mood)}</p>
          <button
            class="btn gold big"
            onClick={() => p.onDone(pick.mood, pick.text)}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ================================================================ the shootout
type Phase = "shoot" | "shot" | "keep" | "kept" | "end";

export function Shootout(p: {
  home: Side;
  away: Side;
  seed: string;
  onDone: (picks: [Spot, Spot][], won: boolean) => void;
}) {
  const plan = useMemo(() => shootoutPlan(p.away, p.seed), [p.away, p.seed]);
  const mine = useMemo(() => shootoutTakers(p.home), [p.home]);
  const [picks, setPicks] = useState<[Spot, Spot][]>([]);
  const [shot, setShot] = useState<Spot | null>(null);
  const [phase, setPhase] = useState<Phase>("shoot");
  const k = picks.length; // the round being played
  const res = shootout(
    p.home,
    p.away,
    p.seed,
    shot !== null && phase !== "end" ? [...picks, [shot, 0]] : picks,
  );
  const done = shootout(p.home, p.away, p.seed, picks);
  const homeKit = kitOfSide(p.home);
  const awayKit = kitOfSide(p.away);
  const theirGrip = ratings(p.away.squad[p.away.xi[0]]).grp;
  const ourGrip = ratings(p.home.squad[p.home.xi[0]]).grp;
  const myTaker = p.home.squad[mine[Math.min(k, KICKS - 1)]];
  const theirTaker = p.away.squad[plan.takers[Math.min(k, KICKS - 1)]];
  const myKeeper = p.home.squad[p.home.xi[0]];
  const theirKeeper = p.away.squad[p.away.xi[0]];

  const shoot = (s: Spot) => {
    setShot(s);
    setPhase("shot");
  };
  const keep = (dv: Spot) => {
    const next = [...picks, [shot as Spot, dv] as [Spot, Spot]];
    setPicks(next);
    setShot(null);
    setPhase("kept");
  };
  const nextRound = () => {
    if (done.won !== null) setPhase("end");
    else setPhase("shoot");
  };

  // what the goal shows right now
  let ball: Spot | null = null;
  let dive: Spot | null = null;
  let scored: boolean | null = null;
  let keeperLook: { l: Launch; kit: Kit } = { l: theirKeeper, kit: awayKit };
  let taker: { l: Launch; kit: Kit } = { l: myTaker, kit: homeKit };
  if (phase === "shot") {
    ball = shot;
    dive = plan.dives[k];
    scored = res.you[k];
  } else if (phase === "keep" || phase === "kept") {
    const r = phase === "kept" ? k - 1 : k;
    keeperLook = { l: myKeeper, kit: homeKit };
    taker = { l: p.away.squad[plan.takers[r]], kit: awayKit };
    if (phase === "kept") {
      ball = plan.shots[r];
      dive = picks[r][1];
      scored = done.them[r];
    }
  }
  const lastRound = phase === "kept" ? k - 1 : k;

  return (
    <div class="drill shootout">
      <h2>Penalties</h2>
      <div class="pen-tally">
        <Tally
          name={p.home.name}
          kit={homeKit}
          hits={shot !== null ? res.you : done.you}
        />
        <Tally name={p.away.name} kit={awayKit} hits={done.them} />
      </div>
      <div class="pen-stage">
        <div class="pen-goal">
          <div class="pen-net" />
          {[0, 1, 2].map((z) => (
            <button
              key={z}
              class={"pen-zone z" + z}
              disabled={phase !== "shoot" && phase !== "keep"}
              onClick={() =>
                phase === "shoot" ? shoot(z as Spot) : keep(z as Spot)
              }
              aria-label={
                (phase === "keep" ? "Dive " : "Shoot ") + SPOT_NAME[z]
              }
            >
              {(phase === "shoot" || phase === "keep") && (
                <span>{SPOT_NAME[z]}</span>
              )}
            </button>
          ))}
          <span
            class={"pen-keeper" + (dive !== null ? " dive d" + dive : "")}
            style={
              {
                "--kit": keeperLook.kit.main,
                "--kithi": keeperLook.kit.hi,
              } as Record<string, string>
            }
          >
            <Head l={keeperLook.l} size={44} ring={keeperLook.kit.hi} />
            <i class="arms" />
          </span>
          <span
            class={
              "pen-ball" +
              (ball !== null ? " go b" + ball : "") +
              (scored === false ? " stopped" : "")
            }
          />
        </div>
        <div
          class="pen-taker"
          style={{ "--cw": "72px" } as Record<string, string>}
        >
          <Fig l={taker.l} kit={taker.kit} />
        </div>
      </div>
      <div class="pen-call">
        {phase === "shoot" && (
          <>
            <p class="pen-h">Round {k + 1}. You shoot</p>
            <p>
              ${myTaker.s} steps up. Pick a spot.
              {theirGrip >= 70
                ? ` Their keeper has Grip ${theirGrip}: the middle is covered from either side.`
                : ""}
            </p>
          </>
        )}
        {phase === "shot" && (
          <>
            <p class={"pen-h " + (scored ? "good" : "bad")}>
              {scored
                ? `$${myTaker.s} scores`
                : `Saved. $${theirKeeper.s} read it`}
            </p>
            <button class="btn gold big" onClick={() => setPhase("keep")}>
              Now you keep
            </button>
          </>
        )}
        {phase === "keep" && (
          <>
            <p class="pen-h">Round {k + 1}. You keep</p>
            <p>
              ${theirTaker.s} steps up.{" "}
              <b class="likes">Likes {SPOT_NAME[favSpot(theirTaker)]}</b>. Pick
              a dive.
              {ourGrip >= 70
                ? ` Your keeper's Grip ${ourGrip} covers the middle too.`
                : ""}
            </p>
          </>
        )}
        {phase === "kept" && (
          <>
            <p class={"pen-h " + (scored ? "bad" : "good")}>
              {scored
                ? `$${p.away.squad[plan.takers[lastRound]].s} scores`
                : `Saved. $${myKeeper.s} guessed right`}
            </p>
            <button class="btn gold big" onClick={nextRound}>
              {done.won !== null ? "Final whistle" : "Next round"}
            </button>
          </>
        )}
        {phase === "end" && (
          <>
            <p class={"pen-h " + (done.won ? "good" : "bad")}>
              {done.won ? "You win on penalties" : "You lose on penalties"}{" "}
              {done.you.filter(Boolean).length}–
              {done.them.filter(Boolean).length}
            </p>
            {done.you.length === KICKS &&
              done.you.filter(Boolean).length ===
                done.them.filter(Boolean).length && (
                <p>Level after five. The referee's coin settles it.</p>
              )}
            <button
              class="btn gold big"
              onClick={() => p.onDone(picks, !!done.won)}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Tally(p: { name: string; kit: Kit; hits: boolean[] }) {
  return (
    <div class="tally">
      <span class="t-name" style={{ borderColor: p.kit.main }}>
        {p.name}
      </span>
      <span class="t-dots">
        {Array.from({ length: KICKS }, (_, i) => (
          <i
            key={i}
            class={i < p.hits.length ? (p.hits[i] ? "in" : "out") : ""}
          />
        ))}
      </span>
    </div>
  );
}
