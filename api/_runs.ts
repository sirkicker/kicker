// Posted seasons: re-run on the server from the action trail, then frozen.
import { CURRENT_RULES, parseTrail, rerun, type FigInfo } from "../shared/engine.js";
import { HAUNT } from "../shared/content.js";
import { normSeed } from "../shared/rng.js";
import { hash32 } from "../shared/rng.js";
import { getEdition } from "./_cut.js";
import { load, loadFresh, save, saveOver, Taken } from "./_store.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { utcDay } from "../shared/daily.js";
import { addToBoard, dailyDayOf } from "./_daily.js";
import { claimOk } from "./_house.js";
import { addToProfile, nameOwner, sessionOf } from "./_me.js";

export { utcDay };

/** A verified season. `v: 2` marks the table-football game; records without it are from before 2.0. */
export interface Result {
  v: 2;
  id: string;
  seed: string;
  edition: number;
  trail: string;
  name: string | null;
  round: number;
  fixture: number;
  cleared: number;
  draws: number;
  won: boolean;
  over: boolean;
  best: { total: number; style: string; figs: FigInfo[] } | null;
  goals: number;
  against: number;
  at: string;
  daily?: string; // the UTC day whose Daily Match this was
  mode?: "haunt" | "daily"; // a Haunted table run (2.1), a Daily match day (3.0); absent for a season
  kit?: boolean; // a Haunted match won while the event ran: the Haunted kit (cosmetic only)
  house?: boolean; // a $KICKER holder's house mark (cosmetic only)
  verified?: boolean; // posted by the address that owns the name
}

export class PostError extends Error {}

const B32 = "0123456789abcdefghjkmnpqrstvwxyz";
function shortId(s: string): string {
  let a = hash32(s);
  let b = hash32("k" + s);
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += B32[a & 31] + B32[b & 31];
    a >>>= 5;
    b >>>= 5;
  }
  return out;
}

export const ID_RE = /^[0-9a-z]{10}$/;
/** Posted seasons live where the old game's posts did, so old challenge links still resolve. */
export const resultPath = (id: string) => `showdowns/${id}.json`;

export async function verifyAndStore(
  input: { seed?: unknown; edition?: unknown; trail?: unknown; mode?: unknown; name?: unknown; house?: unknown; session?: unknown },
  now = Date.now(),
): Promise<Result> {
  const seed = normSeed(String(input.seed || ""));
  const edition = Number(input.edition);
  const trail = String(input.trail || "");
  if (!seed) throw new Error("bad seed");
  if (!Number.isInteger(edition)) throw new Error("bad cut");
  if (trail.length > 60000) throw new Error("trail too long");
  const ed = await getEdition(edition);
  if (!ed) throw new Error("squad cut not found");
  // the rules and the mode ride in the trail itself: an unknown rules token is refused by parseTrail, rules newer
  // than this server plays are refused here, and a mode flag that says otherwise is refused. A trail with no rules
  // token is a legacy (2.1) trail and replays under the legacy rules, byte for byte.
  const parsed = parseTrail(trail);
  if (parsed.rules > CURRENT_RULES) throw new Error("those rules are not live yet");
  if (input.mode !== undefined && input.mode !== null && input.mode !== parsed.mode) throw new Error("mode does not match the trail");
  const mode = parsed.mode;
  const run = rerun(ed, seed, parsed.actions, mode, parsed.rules); // throws on any illegal touch
  const sum = run.summary();
  if (!sum.over) throw new PostError("That season is not finished yet.");
  const rawName = typeof input.name === "string" ? cleanName(input.name) : "";
  if (rawName && nameProblem(rawName)) throw new Error(nameProblem(rawName)!);
  const name = rawName || null;
  // a session that comes along must be good: a forged or expired one is refused, never quietly dropped
  const sess = input.session ? sessionOf(input.session, now) : null;
  if (input.session && !sess) throw new PostError("Your sign-in has expired. Sign in again, or post without it.");
  // a claimed name posts only with its owner's session; unclaimed names post exactly as before
  const owner = name ? await nameOwner(name) : null;
  if (owner && (!sess || sess.a !== owner.a)) throw new PostError(`${owner.name} is a claimed name. Sign in as its owner, or pick another.`);
  const verified = !!owner && !!sess;
  // the house mark rides along only with a valid claim for this very name; it never touches the replay above
  const house = !!name && claimOk(input.house, name, now);
  const daily = mode === "haunt" ? null : await dailyDayOf(seed, edition, now);
  // a Daily match day is only ever the day's pinned seed and cut
  if (mode === "daily" && !daily) throw new PostError("That is not today's Daily Match.");
  const kit = mode === "haunt" && sum.cleared > 0 && now <= HAUNT.end;
  const id = shortId(`v2|${edition}|${seed}|${trail}|${name || ""}${house ? "|house" : ""}${verified ? "|verified" : ""}`);
  const rec: Result = {
    v: 2,
    id,
    seed,
    edition,
    trail,
    name,
    round: sum.round,
    fixture: sum.fixture,
    cleared: sum.cleared,
    draws: sum.draws,
    won: sum.won,
    over: sum.over,
    best: sum.best ? { total: sum.best.total, style: sum.best.style, figs: sum.best.figs } : null,
    goals: sum.goals,
    against: sum.against,
    at: new Date(now).toISOString(),
    ...(daily ? { daily } : {}),
    ...(mode === "haunt" || mode === "daily" ? { mode } : {}),
    ...(kit ? { kit } : {}),
    ...(house ? { house } : {}),
    ...(verified ? { verified } : {}),
  };
  try {
    await save(resultPath(id), rec);
  } catch (e) {
    if (!(e instanceof Taken)) throw e;
  }
  if (rec.name && rec.best && rec.best.total > 0) {
    // a Daily match day goes on the Daily board only: one put, as a daily season did
    if (rec.mode !== "daily") await addToHall(rec);
    if (rec.daily) await addToBoard(rec.daily, rec.edition, hallEntry(rec));
  }
  // the signed-in player's record follows them: one put, only for a verified season
  if (verified && sess && rec.best) {
    await addToProfile(sess.a, rec.name!, {
      id: rec.id,
      seed: rec.seed,
      edition: rec.edition,
      total: rec.best.total,
      style: rec.best.style,
      round: rec.round,
      won: rec.won,
      at: rec.at,
      ...(rec.daily ? { daily: rec.daily } : {}),
      ...(rec.mode ? { mode: rec.mode } : {}),
      ...(rec.kit ? { kit: true } : {}),
    });
  }
  return rec;
}

// ------------------------------------------------------------ Hall of goals: the best goals of the UTC day
export interface HallEntry {
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
  at: string;
  house?: boolean;
  verified?: boolean;
  mode?: "haunt" | "daily";
}
export interface Hall {
  day: string;
  entries: HallEntry[];
}
export const HALL_SIZE = 50;
/** New in 2.0: the old game's day files stay where they were and are not read for the Hall. */
export const hallPath = (day: string) => `goals/${day}.json`;
/** New in 2.1: the Haunted table's own day board. Same single put per named post as the Hall, just another file. */
export const hauntPath = (day: string) => `haunt/${day}.json`;

export function hallEntry(rec: Result): HallEntry {
  return {
    id: rec.id,
    name: rec.name!,
    total: rec.best!.total,
    style: rec.best!.style,
    round: rec.round,
    cleared: rec.cleared,
    won: rec.won,
    seed: rec.seed,
    edition: rec.edition,
    figs: rec.best!.figs.slice(0, 5),
    at: rec.at,
    ...(rec.house ? { house: true } : {}),
    ...(rec.verified ? { verified: true } : {}),
    ...(rec.mode ? { mode: rec.mode } : {}),
  };
}

async function addToHall(rec: Result): Promise<void> {
  const day = utcDay(new Date(rec.at));
  const path = rec.mode === "haunt" ? hauntPath(day) : hallPath(day);
  const hall = (await loadFresh<Hall>(path, 0)) || { day, entries: [] };
  if (hall.entries.some((e) => e.id === rec.id)) return;
  const entry = hallEntry(rec);
  // one line per player per seed: keep their best
  const others = hall.entries.filter((e) => !(e.name.toLowerCase() === entry.name.toLowerCase() && e.seed === entry.seed && e.total >= entry.total));
  if (others.length !== hall.entries.length) return;
  const next = [...hall.entries.filter((e) => !(e.name.toLowerCase() === entry.name.toLowerCase() && e.seed === entry.seed)), entry]
    .sort((a, b) => b.total - a.total || a.at.localeCompare(b.at))
    .slice(0, HALL_SIZE);
  if (!next.some((e) => e.id === entry.id)) return;
  await saveOver(path, { day, entries: next } satisfies Hall);
}

export async function getHall(day: string, board: "goals" | "haunt" = "goals"): Promise<Hall> {
  return (await loadFresh<Hall>(board === "haunt" ? hauntPath(day) : hallPath(day))) || { day, entries: [] };
}

export async function getResult(id: string): Promise<Result | null> {
  if (!ID_RE.test(id)) return null;
  return load<Result>(resultPath(id));
}
