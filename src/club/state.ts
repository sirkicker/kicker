// KICKER Club on the client: who you are (a key kept in this browser), the club as the server has it, and the calls.
import type { Launch } from "../../shared/data.js";
import type { Fixture, MatchState, Row, Side, Tactic } from "../../shared/club.js";
import { local } from "../store.js";

export interface Member {
  slot: number;
  id: string | null;
  name: string;
  kit: [number, number];
}
export interface GroupView {
  week: number;
  group: number;
  members: Member[];
  fixtures: Fixture[];
  table: Row[];
  you?: number;
}
export interface Club {
  id: string;
  name: string;
  kit: number;
  squad: Launch[];
  xi: number[];
  tactic: Tactic;
  captain: number;
  form: [number, number, number, number];
  wall: number;
  mood: number;
  week: number;
  group: number;
  slot: number;
  day: string;
  drills: number;
  played: number;
  drillsDone: string[];
  signed: number;
  honours: { week: number; place: number; pts: number }[];
}
export interface MatchView {
  home: Side;
  away: Side;
  state: MatchState;
  slot: number;
  fixture?: Fixture;
  seed?: string;
}
export interface Me {
  club: Club;
  offers: Launch[];
  group: GroupView;
}

const KEY = "kc.club";
export interface Cred {
  id: string;
  secret: string;
}
export const cred = {
  get: () => local.get<Cred | null>(KEY, null),
  set: (c: Cred) => local.set(KEY, c),
  del: () => local.del(KEY),
};
/** The club key as one line: what "Save key" writes and "Bring a club" reads. */
export const keyLine = (c: Cred) => `kicker-club:${c.id}.${c.secret}`;
export function parseKey(raw: string): Cred | null {
  const m = raw.trim().match(/(?:kicker-club:)?([0-9a-z]{10})\.([A-Za-z0-9_-]{20,40})/);
  return m ? { id: m[1], secret: m[2] } : null;
}

export class ApiError extends Error {
  constructor(
    msg: string,
    public status: number,
  ) {
    super(msg);
  }
}
async function call<T>(body: object): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/club", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("No connection. Try again.", 0);
  }
  let j: { error?: string } & Keyed<string, unknown> = {};
  try {
    j = await r.json();
  } catch {
    /* not json */
  }
  if (!r.ok) throw new ApiError(j.error || `HTTP ${r.status}`, r.status);
  return j as T;
}
const withCred = <T>(op: string, extra: object = {}) => {
  const c = cred.get();
  if (!c) return Promise.reject(new ApiError("No club on this device", 401));
  return call<T>({ op, ...c, ...extra });
};

export const api = {
  create: (name: string, kit: number) => call<{ club: Club; secret: string }>({ op: "create", name, kit }),
  me: () => withCred<Me>("me"),
  lineup: (xi: number[], tactic: Tactic, captain: number) => withCred<{ club: Club }>("lineup", { xi, tactic, captain }),
  sign: (take: string, drop: number) => withCred<{ club: Club }>("sign", { take, drop }),
  drill: (kind: "train" | "wall" | "press", value: number, rod?: number) => withCred<{ club: Club }>("drill", { kind, value, rod }),
  kickoff: (slot: number) => withCred<MatchView>("kickoff", { slot }),
  decide: (slot: number, choice: number) => withCred<MatchView>("decide", { slot, choice }),
  async group(week: number, group: number): Promise<GroupView> {
    const r = await fetch(`/api/club?group=${week}.${group}`);
    if (!r.ok) throw new ApiError("Could not load the group", r.status);
    return r.json();
  },
  async friendly(notId: string): Promise<{ side: Side; id: string | null }> {
    const r = await fetch(`/api/club?friendly=${encodeURIComponent(notId)}`);
    if (!r.ok) throw new ApiError("No club free for a friendly right now", r.status);
    return r.json();
  },
};
