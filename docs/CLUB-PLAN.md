# KICKER Club (4.0): build plan and contracts

The game becomes a manager game. You run a club of 14 live vibe/vibe launches and play asynchronously against other people's clubs in a weekly league of eight. Matches play themselves on the same felt table, and the manager takes three decisions during each one. Small drills between matches give the club an edge.

The aesthetic stays exactly as it is:
- wine/teal felt, brass rods with grips, voxel vibers in the stands, CRT and swirl filters;
- the Jersey 10 font;
- the WIRE desk line in a dry market-joke voice, with no exclamation marks;
- ticker tape and crests.

Spotlight rules:
- no card, pack, loot or betting words or mechanics;
- no "graduation";
- no promo or partner words;
- "Save", not "Download";
- no window.ethereum.

## Rules (done): `shared/club.ts`
Read it first. It holds everything below.

**Ratings.** `ratings(l)` gives Power, Pace and Grip on a 25–95 scale. They come from curve progress, trades in 24h and holders. `roleRating(r, rod)` gives what a launch is worth on a given rod.

**`Side`:** a club as it takes the field:
- a squad of 14;
- `xi`: 11 squad indices in slot order. Slot to rod is `ROD_OF`: 0 keeper, 1–2 defence, 3–7 midfield, 8–10 attack;
- tactic and captain;
- `form` per rod (0..3), `wall` (0..3), `mood` (0..3).

**`simulate(home, away, seed, choices)`** returns a `MatchState` with:
- `moments` (14 chances, see `Moment`);
- `score`;
- `pending`: a `Decision` with 3 `Option`s at 30', 60' and 75'. The match waits there until `choices[n]` is given;
- `done`.

Only home decides; away uses the auto manager.

**`Moment`:**
- `{ i, min, side, chain, shooter, blocker, out, score, who }`;
- `side` is 0 for home, 1 for away;
- `chain` lists the attacking line-up slots in order, shooter last;
- `blocker` is a defending slot: 0 is the keeper, and on "block" it is 1 or 2;
- `out` is one of goal | save | block | wide;
- `who` is the shooter's squad index.

**Shootout:** friendlies that end level go to a shootout. Use `shootout(home, away, seed, picks)`, `shootoutPlan`, `shootoutTakers` and `favSpot` (the taker's favourite spot, which the UI hints).

**League:**
- `weekOf()`, `GROUP = 8`, `table(names, fixtures)`;
- `FIXTURES_PER_DAY = 3`, `DRILLS_PER_DAY = 2`.

**Squads:**
- `houseSide(pool, week, group, slot)` builds a house club;
- `firstSquad`, `scoutOffers`, `autoXi`, `autoCaptain`, `KITS`.

## Pieces and owners
| File | What | Owner |
|---|---|---|
| `src/club/table.ts` | Pixi table: draws two clubs on the rods and plays a `Moment`. Also the Training drill. | stream A |
| `shared/club-voice.ts` | WIRE lines for moments, decisions and full time | stream A |
| `src/club/drills.tsx` + `src/club/drills.css` | The Wall drill, the Press room, the Shootout UI | stream B |
| `shared/press.ts` | Press-room questions and answers with effects | stream B |
| `api/_kv.ts`, `api/club.ts`, `api/league.ts` | Storage and server | main |
| `src/club/main.ts`, `src/club/app.tsx`, `src/club/state.ts`, `src/club/club.css` | Boot, HQ, squad, scout, league, match screen, full time | main |

## Contract: `src/club/table.ts` (stream A)
```ts
import type { Application } from "pixi.js";
import type { Side, Moment } from "../../shared/club.js";
export class ClubTable {
  constructor(app: Application);
  /** CSS-pixel rectangle the table must fit in (the HTML screens sit around it). Re-fit on every call. */
  fit(rect: { x: number; y: number; w: number; h: number }): void;
  /** Dress the table: home on the near rods (left / bottom), away on the far ones. away null = far rods empty (HQ idle). */
  setSides(home: Side, away: Side | null, xiHome?: number[], xiAway?: number[]): void;
  /** Animate one chance: passes along `chain`, the shot, the outcome; goal = net ripple, tape, crowd, shake. Resolves when done. */
  play(m: Moment, home: Side, away: Side): Promise<void>;
  /** Cut the current animation short (tap to skip). */
  skip(): void;
  /** One WIRE line on the rail (club-voice picks it). */
  say(line: string, tone?: "up" | "down" | "flat"): void;
  /** Crowd size from 0..1, and a mood. */
  crowd(level: number, mood?: "idle" | "cheer" | "quiet"): void;
  /** The Training drill on this table: the ball rolls across a rod, the player taps to stop it on a figure. 5 balls. Resolves with hits 0..5. */
  training(rod: number, side: Side): Promise<number>;
  /** Hide the table drawing (title screen). */
  cover(on: boolean): void;
  /** Phone layout (table upright) when the fit rect is taller than wide. */
  readonly port: boolean;
}
```

**Reuse, don't import game.ts.** Lift drawing code from `src/game.ts`:
- `buildTable`, `buildRods`, `drawBall`, `drawNets`, `drawMark`;
- `tickerTape` and `frameTape`;
- the goal moment.

Reuse these as they are:
- `FigureView` (`src/figures.ts`): its `club` kit param takes `{ main, hi, trim }`;
- `Crowd` and `loadCrowd` (`src/crowd.ts`), `Desk` (`src/desk.ts`);
- the `crtFilter` and `swirlFilter` filters (`src/fx.ts`);
- `src/tween.ts`, `src/audio.ts` sfx, and the table-space constants in `src/table.ts`.

**Figures:** home figures wear the home kit, away figures the away kit. `FigureView` with look "you" uses `look()` house colours, so pass look "them" with `club` set for both sides. Alternatively add a minimal option to FigureView: an additive param, with no behaviour change for old callers.

**`shared/club-voice.ts`:**
- `lineFor(m: Moment, home: Side, away: Side, n: number): string`;
- `decisionLine(...)` and `fullTimeLine(...)`;
- the tone of `shared/voice.ts`: max 72 characters, no "!".

## Contract: `src/club/drills.tsx` (stream B)
Preact components, using `src/kit.tsx` helpers (`Head`, `Fig`, `Crest`) and the `.btn` styles in `src/style.css`. Each drill gets its props and calls `onDone` once.

```tsx
export function WallDrill(p: { seed: string; home: Side; onDone: (wall: 0|1|2|3) => void; onClose: () => void }): JSX.Element;
export function PressRoom(p: { seed: string; club: string; onDone: (mood: 0|1|2|3, answer: string) => void; onClose: () => void }): JSX.Element;
export function Shootout(p: { home: Side; away: Side; seed: string; onDone: (picks: [Spot, Spot][], won: boolean) => void }): JSX.Element;
```

**WallDrill:**
- three red shot lines from their attackers across a felt grid of 10 lanes;
- you slide your keeper and defence rods (tap arrows) to cover them;
- "Set the wall" scores lines covered, 0..3;
- the puzzle comes from the seed and is always solvable for 3.

**PressRoom:**
- WIRE asks one question; pick one of three dry answers;
- each answer shows its effect up front, with mood 1..3;
- content goes in `shared/press.ts`: about 30 questions in the market-joke voice.

**Shootout:** 5 rounds of the following:
- you pick a spot to shoot (Left/Middle/Right), then a spot to dive;
- the taker's `favSpot` is hinted ("likes Left");
- use the result from `shootout()`.

## Storage (main)
Upstash Redis over REST, read from env `KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. With no env it uses memory, the same as the local preview. Blob is used only for the squad cut, as today.
