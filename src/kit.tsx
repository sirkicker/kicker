// Small pieces the HTML screens share: the store hook, club crests and kits drawn in SVG, figure heads, a goal's
// path on a mini felt, and the rivals' chants. Pure presentation: nothing in here is read by the engine.
import { useEffect, useState } from "preact/hooks";
import { BOSS, HAUNT, MOUTH, RODS } from "../shared/content.js";
import { facePath, type Launch } from "../shared/data.js";
import type { LeagueRow, Run, Step } from "../shared/engine.js";
import { hash32 } from "../shared/rng.js";
import { look } from "./house.js";
import { reducedMotion, subscribe, ui } from "./store.js";
import * as theme from "./theme.js";

export const PAIR_HEX = ["#5ad7ff", "#ff7a3d", "#ff4fb4", "#ffd43b"];
export const PAIR_SHAPE = ["◆", "▲", "●", "■"];
export const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
export const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

export function useUi() {
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

// ------------------------------------------------------------ club colours
function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

export interface Kit {
  main: string;
  hi: string;
  trim: string;
}
type KitTable = Keyed<string, { main: number; hi: number; trim: number }>;
/** The table's club kits (theme.ts) when it has them; until then the crest's own two colours. */
const CLUB_KIT = (theme as unknown as { CLUB_KIT?: KitTable }).CLUB_KIT;

/** A club's kit: the table's when it has one for the club, otherwise the two colours its crest is made of. */
export function kitOf(name: string, kind: "club" | "boss" | "ghost" = "club"): Kit {
  const k = CLUB_KIT?.[name];
  if (k) return { main: hex(k.main), hi: hex(k.hi), trim: hex(k.trim) };
  if (kind === "ghost") {
    if (name === HAUNT.boss.name) return { main: "#2a1408", hi: "#f07a12", trim: "#1a0816" };
    const v = hash32(name) % 3;
    return [
      { main: "#56697a", hi: "#cfe3ee", trim: "#1a0816" },
      { main: "#3c4f43", hi: "#b9d6b0", trim: "#1a0816" },
      { main: "#47405a", hi: "#d4c8f0", trim: "#1a0816" },
    ][v];
  }
  if (kind === "boss") return { main: "#2a0618", hi: "#ff3d7f", trim: "#1a0816" };
  const h = hash32(name);
  return { main: hex(hsl(h % 360, 0.62, 0.42)), hi: hex(hsl((h >> 9) % 360, 0.7, 0.62)), trim: "#1a0816" };
}
/** Your side's kit: the look you wear on the table (house colours, or a holder's pick). */
export function yourKit(): Kit {
  const l = look();
  return { main: hex(l.kit), hi: hex(l.kitHi), trim: hex(l.trim) };
}

export function crestKind(run: Run, kind: number, round = run.s.round): "club" | "boss" | "ghost" {
  return run.mode === "haunt" ? "ghost" : run.bossOf(kind, round) ? "boss" : "club";
}

// ------------------------------------------------------------ crests
/** A club crest from its name, in SVG: the same shield, field pattern and emblem the table draws. */
export function Crest(props: { name: string; kind: "club" | "boss" | "ghost" | "you"; size: number; class?: string }) {
  const { name, kind, size } = props;
  const R = 50;
  const h = hash32(name);
  const ink = "#1a0816";
  const cream = "#fff1dc";
  const shield = [-R, -R * 0.9, R, -R * 0.9, R, R * 0.25, 0, R * 1.15, -R, R * 0.25];
  const pts = (a: number[]) => a.map((v) => v.toFixed(1)).join(" ");
  const body: preact.JSX.Element[] = [];
  if (kind === "ghost") {
    // a headstone per ghost club: its stone, its shape, and the last club's lit eyes and crown
    const last = name === HAUNT.boss.name;
    const v = last ? 0 : h % 3;
    const stone = last ? ["#3a2a1c", "#5a4130"] : [["#3b4a55", "#56697a"], ["#3c4f43", "#57705d"], ["#47405a", "#665c80"]][v];
    if (v === 1)
      body.push(
        <polygon points={pts([-R * 0.25, -R * 1.25, R * 0.25, -R * 1.25, R * 0.25, -R * 0.95, R * 0.9, -R * 0.95, R * 0.9, R * 1.1, -R * 0.9, R * 1.1, -R * 0.9, -R * 0.95, -R * 0.25, -R * 0.95])} fill={stone[0]} stroke={ink} stroke-width={5} />,
        <rect x={-R * 0.7} y={-R * 0.75} width={R * 1.4} height={R * 1.7} rx={R * 0.12} fill={stone[1]} />,
      );
    else if (v === 2)
      body.push(
        <polygon points={pts([0, -R * 1.25, R * 0.9, -R * 0.45, R * 0.9, R * 1.1, -R * 0.9, R * 1.1, -R * 0.9, -R * 0.45])} fill={stone[0]} stroke={ink} stroke-width={5} />,
        <polygon points={pts([0, -R * 1.0, R * 0.7, -R * 0.38, R * 0.7, R * 0.92, -R * 0.7, R * 0.92, -R * 0.7, -R * 0.38])} fill={stone[1]} />,
      );
    else
      body.push(
        <rect x={-R * 0.9} y={-R * 1.05} width={R * 1.8} height={R * 2.15} rx={R * 0.9} fill={stone[0]} stroke={ink} stroke-width={5} />,
        <rect x={-R * 0.7} y={-R * 0.85} width={R * 1.4} height={R * 1.8} rx={R * 0.7} fill={stone[1]} />,
      );
    if (last) body.push(<polygon points={pts([-R * 0.5, -R * 0.95, -R * 0.5, -R * 1.35, -R * 0.25, -R * 1.12, 0, -R * 1.42, R * 0.25, -R * 1.12, R * 0.5, -R * 1.35, R * 0.5, -R * 0.95])} fill="#ffb35c" stroke={ink} stroke-width={4} />);
    body.push(
      <polygon
        points={pts([-R * 0.38, R * 0.55, -R * 0.38, -R * 0.15, 0, -R * 0.5, R * 0.38, -R * 0.15, R * 0.38, R * 0.55, R * 0.22, R * 0.38, R * 0.07, R * 0.55, -R * 0.07, R * 0.38, -R * 0.22, R * 0.55])}
        fill="#eaf6ff"
      />,
      <ellipse cx={-R * 0.14} cy={-R * 0.12} rx={R * 0.07} ry={R * 0.1} fill={last ? "#f07a12" : ink} />,
      <ellipse cx={R * 0.14} cy={-R * 0.12} rx={R * 0.07} ry={R * 0.1} fill={last ? "#f07a12" : ink} />,
    );
  } else {
    const yours = kind === "you";
    const k = yours ? yourKit() : kitOf(name, kind === "boss" ? "boss" : "club");
    const c1 = yours ? k.main : hex(hsl(h % 360, 0.62, 0.42));
    const c2 = yours ? k.hi : hex(hsl((h >> 9) % 360, 0.7, 0.62));
    if (kind === "boss") {
      body.push(
        <polygon points={pts([-R * 1.12, -R * 1.2, -R * 0.55, -R * 0.92, 0, -R * 1.3, R * 0.55, -R * 0.92, R * 1.12, -R * 1.2, R, R * 0.25, 0, R * 1.2, -R, R * 0.25])} fill={ink} />,
        <polygon points={pts(shield)} fill="#2a0618" stroke="#ff3d7f" stroke-width={5} />,
        <rect x={-R} y={-R * 0.2} width={R * 2} height={R * 0.3} fill="#ff3d7f" opacity={0.85} />,
      );
    } else {
      body.push(<polygon points={pts(shield)} fill={c1} />);
      const p = yours ? 0 : (h >> 4) % 4;
      if (p === 0) for (let i = -2; i <= 2; i += 2) body.push(<rect x={i * R * 0.22 - R * 0.11} y={-R * 0.9} width={R * 0.22} height={R * 1.9} fill={c2} opacity={0.9} />);
      else if (p === 1) body.push(<polygon points={pts([0, -R * 0.9, R, -R * 0.9, R, R * 0.25, 0, R * 1.15])} fill={c2} opacity={0.9} />);
      else if (p === 2) body.push(<polygon points={pts([-R, -R * 0.1, 0, R * 0.55, R, -R * 0.1, R, R * 0.25, 0, R * 1.0, -R, R * 0.25])} fill={c2} opacity={0.9} />);
      else for (let y = -0.6; y < 0.4; y += 0.5) body.push(<rect x={-R} y={y * R} width={R * 2} height={R * 0.22} fill={c2} opacity={0.9} />);
      body.push(<polygon points={pts(shield)} fill="none" stroke={yours ? k.trim : ink} stroke-width={5} />);
    }
    const cy = -R * 0.05;
    body.push(<circle cx={0} cy={cy} r={R * 0.44} fill={cream} stroke={ink} stroke-width={3} />);
    const s = R * 0.26;
    const ec = kind === "boss" ? "#ff3d7f" : c1;
    if (yours)
      body.push(
        <text x={0} y={cy + R * 0.2} text-anchor="middle" font-family="Jersey 10, monospace" font-size={R * 0.62} fill={ink}>
          K
        </text>,
      );
    else {
      const e = (h >> 12) % 5;
      if (e === 0) body.push(<circle cx={0} cy={cy} r={s * 0.8} fill={ink} />);
      else if (e === 1) {
        const st: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? s * 0.45 : s;
          st.push(Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        body.push(<polygon points={pts(st)} fill={ec} />);
      } else if (e === 2) body.push(<polygon points={pts([0, cy - s, s, cy, 0, cy + s, -s, cy])} fill={ec} />);
      else if (e === 3) body.push(<polygon points={pts([-s * 0.2, cy - s, s * 0.6, cy - s * 0.1, 0, cy, s * 0.3, cy + s, -s * 0.6, cy + s * 0.05, 0, cy])} fill={ec} />);
      else body.push(<polygon points={pts([-s, cy + s * 0.5, -s, cy - s * 0.4, -s * 0.5, cy, 0, cy - s * 0.7, s * 0.5, cy, s, cy - s * 0.4, s, cy + s * 0.5])} fill={ec} />);
    }
  }
  return (
    <svg class={"crest-svg " + (props.class || "")} viewBox="-60 -68 120 132" width={size} height={size * 1.1} aria-hidden="true">
      {body}
    </svg>
  );
}

/** A strip of a club's kit: diagonal bands in its two colours. */
export const kitBand = (k: Kit) => `repeating-linear-gradient(115deg, ${k.main} 0 18px, ${k.hi} 18px 30px)`;

// ------------------------------------------------------------ figures
/** One figure, drawn in HTML: a round head with the launch's picture, shoulders in the kit, the ticker under it. */
export function Fig(props: { l: { s: string; c: string | null; u: number }; i?: number; small?: boolean; kit?: Kit; noTick?: boolean }) {
  const lk = look();
  const k = props.kit || { main: hex(lk.kit), hi: hex(lk.kitHi), trim: hex(lk.trim) };
  return (
    <span class={"lfig" + (props.small ? " sm" : "")} style={{ "--i": props.i ?? 0, "--kit": k.main, "--kithi": k.hi, "--trim": k.trim } as Record<string, string | number>}>
      <span class="lbody" aria-hidden="true" />
      <img src={facePath(props.l.c, props.l.s)} alt="" width={64} height={64} />
      <span class="lpair" style={{ color: PAIR_HEX[props.l.u] }} aria-hidden="true">
        {PAIR_SHAPE[props.l.u]}
      </span>
      {!props.noTick && <span class="ltick">${props.l.s.slice(0, 7)}</span>}
    </span>
  );
}

/** A launch's picture in a ring, for lists. */
export function Head(props: { l: { s: string; c: string | null; u: number }; size: number; ring?: string; class?: string }) {
  return (
    <img
      class={"head " + (props.class || "")}
      src={facePath(props.l.c, props.l.s)}
      alt=""
      width={props.size}
      height={props.size}
      style={{ width: `${props.size}px`, height: `${props.size}px`, borderColor: props.ring || PAIR_HEX[props.l.u] }}
    />
  );
}

// ------------------------------------------------------------ a goal's path on a mini felt
/** Where the ball changed direction off a side wall, inside one segment of a path. */
function bounceAt(seg: Step[]): Step[] {
  const out: Step[] = [];
  for (let i = 1; i < seg.length - 1; i++) {
    const a = seg[i - 1];
    const b = seg[i];
    const c = seg[i + 1];
    if ((b.lane - a.lane) * (c.lane - b.lane) < 0 || ((b.lane === 0 || b.lane === 9) && b.lane !== a.lane)) out.push(b);
  }
  return out;
}

/**
 * The best goal's move, seen from above: your goal on the left, theirs on the right, the passes in cream and the
 * shot in gold, a ring where the ball came off a wall, and the scorer's head waiting in the net. Table space: x is
 * the column 0..9 from your goal, lane 0..9 across.
 */
export function PathFelt(props: { path: Step[][]; scorer?: { s: string; c: string | null; u: number } | null; haunt?: boolean; w?: number; thumb?: boolean; animate?: boolean }) {
  const { path, haunt, thumb } = props;
  const W = 300;
  const H = 200;
  const pad = thumb ? 10 : 18;
  const cx = (x: number) => pad + ((x + 0.5) * (W - 2 * pad)) / 10;
  const cy = (l: number) => pad + ((l + 0.5) * (H - 2 * pad)) / 10;
  const felt = haunt ? "#0a1d22" : "#0c3438";
  const line = haunt ? "#cfe3ee" : "#fff1dc";
  const gold = haunt ? "#ffb35c" : "#ffc23d";
  const anim = props.animate !== false && !thumb && !reducedMotion();
  const segs = path.filter((s) => s.length > 1);
  const last = segs[segs.length - 1];
  const end = last ? last[last.length - 1] : null;
  const rods: number[] = [];
  for (const r of RODS) rods.push(r.x, 9 - r.x);
  let len = 0;
  return (
    <svg class={"pathfelt" + (thumb ? " thumb" : "") + (anim ? " anim" : "")} viewBox={`0 0 ${W} ${H}`} width={props.w || W} height={((props.w || W) * H) / W} role="img" aria-label="The move, drawn on the felt">
      <rect x={0} y={0} width={W} height={H} rx={thumb ? 10 : 16} fill={haunt ? "#1c0b18" : "#4a1a3a"} />
      <rect x={pad / 2} y={pad / 2} width={W - pad} height={H - pad} rx={thumb ? 6 : 10} fill={felt} />
      {!thumb &&
        Array.from({ length: 5 }, (_, i) => <rect x={pad / 2 + ((W - pad) / 5) * i} y={pad / 2} width={(W - pad) / 10} height={H - pad} fill="#ffffff" opacity={0.025} />)}
      <line x1={W / 2} y1={pad / 2} x2={W / 2} y2={H - pad / 2} stroke={line} stroke-opacity={0.18} stroke-width={2} />
      <circle cx={W / 2} cy={H / 2} r={thumb ? 14 : 24} fill="none" stroke={line} stroke-opacity={0.18} stroke-width={2} />
      {!thumb && rods.map((x) => <line x1={cx(x)} y1={pad / 2} x2={cx(x)} y2={H - pad / 2} stroke="#c9a24a" stroke-opacity={0.22} stroke-width={3} />)}
      {/* the two goal mouths */}
      <rect x={pad / 2 - 6} y={cy(MOUTH[0]) - (H - 2 * pad) / 20} width={8} height={((H - 2 * pad) / 10) * (MOUTH[1] - MOUTH[0] + 1)} fill={line} opacity={0.5} />
      <rect x={W - pad / 2 - 2} y={cy(MOUTH[0]) - (H - 2 * pad) / 20} width={8} height={((H - 2 * pad) / 10) * (MOUTH[1] - MOUTH[0] + 1)} fill={gold} />
      {segs.map((seg, i) => {
        const shot = i === segs.length - 1;
        const d = seg.map((p, j) => `${j ? "L" : "M"}${cx(p.x).toFixed(1)} ${cy(p.lane).toFixed(1)}`).join(" ");
        let L = 0;
        for (let j = 1; j < seg.length; j++) L += Math.hypot(cx(seg[j].x) - cx(seg[j - 1].x), cy(seg[j].lane) - cy(seg[j - 1].lane));
        const delay = len;
        len += L;
        const style = anim ? ({ "--len": L.toFixed(0), "--delay": `${(delay / 260).toFixed(2)}s`, "--dur": `${Math.max(0.25, L / 260).toFixed(2)}s` } as Record<string, string>) : undefined;
        return (
          <g>
            <path d={d} fill="none" stroke="#1a0816" stroke-width={thumb ? 6 : 9} stroke-linecap="round" stroke-linejoin="round" opacity={0.7} />
            <path class="pf-line" style={style} d={d} fill="none" stroke={shot ? gold : line} stroke-width={thumb ? 3.5 : 5} stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={shot ? undefined : thumb ? "5 4" : "8 6"} />
            <circle cx={cx(seg[0].x)} cy={cy(seg[0].lane)} r={thumb ? 4 : 6} fill={line} stroke="#1a0816" stroke-width={2} />
            {bounceAt(seg).map((b) => (
              <circle cx={cx(b.x)} cy={cy(b.lane)} r={thumb ? 5 : 8} fill="none" stroke={gold} stroke-width={thumb ? 2 : 3} />
            ))}
          </g>
        );
      })}
      {end && !props.scorer && <circle cx={cx(end.x)} cy={cy(end.lane)} r={thumb ? 5 : 8} fill="#fff" stroke="#1a0816" stroke-width={2} />}
      {end && props.scorer && (
        <g class="pf-scorer" style={anim ? ({ "--delay": `${(len / 260).toFixed(2)}s` } as Record<string, string>) : undefined}>
          <circle cx={cx(end.x)} cy={cy(end.lane)} r={thumb ? 13 : 22} fill="#1a0816" stroke={gold} stroke-width={thumb ? 3 : 4} />
          <clipPath id={`pfc${hash32(props.scorer.s + (thumb ? "t" : "b"))}`}>
            <circle cx={cx(end.x)} cy={cy(end.lane)} r={thumb ? 10 : 18} />
          </clipPath>
          <image
            href={facePath(props.scorer.c, props.scorer.s)}
            x={cx(end.x) - (thumb ? 10 : 18)}
            y={cy(end.lane) - (thumb ? 10 : 18)}
            width={thumb ? 20 : 36}
            height={thumb ? 20 : 36}
            clip-path={`url(#pfc${hash32(props.scorer.s + (thumb ? "t" : "b"))})`}
            style={{ imageRendering: "pixelated" }}
          />
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------ the rivals' voices
/** One line each club sings about itself. Dry, never loud. */
export const CHANT: Keyed<string, string> = {
  "Floor Price FC": "Holding the line since the mint.",
  "Liquidity Town": "Deep pockets, thin defence.",
  "Real Mempool": "Pending since 2024.",
  "Sporting Slippage": "We get there. Not quite where we said.",
  "Dynamo Dip": "Down bad, never out.",
  "Athletic Bagholders": "Still holding. Still singing.",
  "Inter Testnet": "Nothing here is real, except the defending.",
  "AC Airdrop": "Free to watch, hard to beat.",
  "Olympique Oracle": "We saw it coming. Twice.",
  "Borussia Bridge": "Always crossing over.",
  "Rapid Rebase": "Same squad, new supply.",
  "Union Unlock": "Vesting into form.",
  "Racing Rollup": "Batch the chances, settle later.",
  "Atletico Allowlist": "You are not on the list.",
  "Deportivo Degen": "Full send, every touch.",
  "United Validators": "Every block, signed.",
  "The Rug": "Gone before kickoff.",
  "Trading Halt": "Nothing moves until we say.",
  "Vibe Check": "Show us your numbers.",
  "The Depeg": "Close enough to one.",
  "Gas Spike": "Every move costs double.",
  "Mempool Jam": "Your pass is in the queue.",
  "Max Slippage": "Expect less than you asked for.",
  Lockup: "Your keeper stays put.",
  "Wash Trade": "Whatever you do, we do.",
  "Closing Bell": "Last trade of the day.",
  "Crypt Rovers": "Delisted, not departed.",
  "Graveyard United": "The quietest book in town.",
  [HAUNT.boss.name]: "Zero volume, full strength.",
};
export const chantOf = (club: string) => CHANT[club] || "Here for the full ninety touches.";

/** The rival's captain: the launch that best fits how the club plays (Power up front for a long-range side...). */
export function captainOf(run: Run, kind: number, round = run.s.round): Launch | null {
  let side: Launch[] = [];
  try {
    side = run.rivals(kind, round);
  } catch {
    return null;
  }
  if (!side.length) return null;
  if (run.mode === "haunt") return side.slice().sort((a, b) => a.k - b.k || b.h - a.h)[0];
  const st = run.styleOf(kind, round);
  const front = side.slice(RODS[3].slot, RODS[3].slot + RODS[3].n);
  const key = (l: Launch) => (st === "long" ? l.p : st === "bus" ? l.h : l.k);
  const pool = st === "bus" ? side : front.length ? front : side;
  return pool.slice().sort((a, b) => key(b) - key(a) || a.s.localeCompare(b.s))[0];
}

/** How sharp a club is at its level, in one plain phrase. */
export function threatOf(level: number): string {
  return level >= 10 ? "Full strength" : level >= 8 ? "Shoots through a blocker" : level >= 6 ? "More touches" : level >= 4 ? "Reads your blocks" : level >= 3 ? "Two slides a touch" : level >= 2 ? "Shuts passing lanes" : "Covers the shots";
}

// ------------------------------------------------------------ the league table
export const isYou = (r: LeagueRow) => !!r.you || /^(you|your club)$/i.test(r.club);

/** The league table of a rules-3 season, in the engine's order (points, goal difference, goals for). Null without a league. */
export function leagueOf(run: Run): LeagueRow[] | null {
  return run.s.league && run.s.league.length ? run.s.league : null;
}
export const pts = (r: LeagueRow) => r.pts;

export { drawFansOf, fixtureLabel, matchdayLabel, ordinal, targetOf, winFansOf } from "./season.js";

/** A boss club's rule, as one sentence. */
export const ruleText = (id: string) => (BOSS[id]?.text || "") + ".";
