// Signed-in players: one signed message per device per day ties a Hall of goals name to an address,
// gives back a short-lived session claim (an HMAC, like the house claim), and opens the player's record.
// Blob budget: a sign-in costs no put, except the first time a name is claimed (one write-once put).
// A verified season post adds at most one put (the player's record). Reads go through the public URL, never list() or head().
import { utcDay, prevDay } from "../shared/daily.js";
import { signinMessage, ADDRESS_RE } from "../shared/house.js";
import { cleanName, nameProblem } from "../shared/names.js";
import { mergeProfile, type Profile, type ProfileRun } from "../shared/profile.js";
import { b64, expiry, HouseError, issueClaim, kickerBalance, macIn, macOk, verifySigned, type SignOpts } from "./_house.js";
import { load, loadFresh, save, saveOver, Taken } from "./_store.js";

export const nameKey = (name: string) => cleanName(name).toLowerCase();
export const namePath = (key: string) => `names/${key}.json`;
export const profilePath = (address: string) => `profiles/${address.toLowerCase()}.json`;

/** Who owns a name: written once, by the first address to claim it. */
export interface NameClaim {
  name: string; // as claimed
  a: string; // address, lowercase
  at: string;
}

export interface Session {
  a: string; // address, lowercase
  n: string; // the name signed for, lowercase
  d: string; // UTC day
  x: number; // expires, unix ms
}

// ------------------------------------------------------------ session claims
export function issueSession(address: string, name: string, now = Date.now()): { session: string; expires: number } {
  const s: Session = { a: address.toLowerCase(), n: nameKey(name), d: utcDay(new Date(now)), x: expiry(now) };
  const body = b64(JSON.stringify(s));
  return { session: `${body}.${b64(macIn("session", body))}`, expires: s.x };
}

/** The session inside a claim, or null when it is forged, bent or expired. */
export function sessionOf(claim: unknown, now = Date.now()): Session | null {
  if (typeof claim !== "string" || claim.length > 600) return null;
  const [body, sig] = claim.split(".");
  if (!body || !sig || !macOk("session", body, sig)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return typeof s.x === "number" && s.x > now && ADDRESS_RE.test(s.a) ? s : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ post receipts
/** Given to a device that posts under a name without signing in; lets that device claim the name later. */
export const receiptFor = (name: string) => b64(macIn("receipt", nameKey(name)));
export const receiptOk = (name: string, r: unknown) => typeof r === "string" && r.length < 100 && macOk("receipt", nameKey(name), r);

// ------------------------------------------------------------ names
export async function nameOwner(name: string): Promise<NameClaim | null> {
  const key = nameKey(name);
  return key ? load<NameClaim>(namePath(key)) : null;
}

/** True when someone posted this name in the last 7 UTC days (Hall of goals or a Daily board, old or new). Reads only. */
export async function recentlyPosted(name: string, now = Date.now()): Promise<boolean> {
  const key = nameKey(name);
  let day = utcDay(new Date(now));
  for (let i = 0; i < 7; i++, day = prevDay(day)) {
    // the 2.0 files, and the old game's files of the same days: a name someone used last week stays theirs
    const files = await Promise.all([
      loadFresh<{ entries: { name: string }[] }>(`goals/${day}.json`),
      loadFresh<{ names?: string[]; entries: { name: string }[] }>(`daily/${day}/goals.json`),
      loadFresh<{ entries: { name: string }[] }>(`hall/${day}.json`),
      loadFresh<{ names?: string[]; entries: { name: string }[] }>(`daily/${day}/board.json`),
    ]);
    for (const f of files) {
      if (!f) continue;
      if ((f as { names?: string[] }).names?.includes(key) || f.entries?.some((e) => e.name.toLowerCase() === key)) return true;
    }
  }
  return false;
}

/**
 * Ties a name to an address. First claim wins (the store refuses a second write). A name someone else posted
 * in the last 7 days can't be grabbed, unless this device holds a receipt for posting under it.
 */
export async function claimName(name: string, address: string, receipt?: unknown, now = Date.now()): Promise<NameClaim> {
  const a = address.toLowerCase();
  const key = nameKey(name);
  const have = await nameOwner(key);
  if (have) {
    if (have.a === a) return have;
    throw new HouseError("That name belongs to another address. Pick another one.", 409);
  }
  if (!receiptOk(key, receipt) && (await recentlyPosted(key, now)))
    throw new HouseError("Someone else posted under that name this week. Pick another one, or claim it from the device that posted it.", 409);
  const claim: NameClaim = { name: cleanName(name), a, at: new Date(now).toISOString() };
  try {
    await save(namePath(key), claim);
  } catch (e) {
    if (!(e instanceof Taken)) throw e;
    const won = await nameOwner(key);
    if (!won || won.a !== a) throw new HouseError("That name belongs to another address. Pick another one.", 409);
    return won;
  }
  return claim;
}

// ------------------------------------------------------------ the record
export async function getProfile(address: string): Promise<Profile | null> {
  return loadFresh<Profile>(profilePath(address));
}

/** One put: folds a verified season into the player's record. */
export async function addToProfile(address: string, name: string, run: ProfileRun): Promise<Profile> {
  const before = await loadFresh<Profile>(profilePath(address), 0);
  const next = mergeProfile(before, address, name, run);
  if (next !== before) await saveOver(profilePath(address), next);
  return next;
}

// ------------------------------------------------------------ sign-in
export interface SignedIn {
  session: string;
  expires: number;
  name: string;
  address: string;
  house: { claim: string; expires: number; day: string } | null;
  /** true, false, or null when the chain did not answer */
  holder: boolean | null;
  profile: Profile | null;
}

export async function signIn(input: { name?: unknown; address?: unknown; signature?: unknown; receipt?: unknown }, opts: SignOpts = {}): Promise<SignedIn> {
  const now = opts.now ?? Date.now();
  const name = cleanName(typeof input.name === "string" ? input.name : "");
  const problem = nameProblem(name);
  if (problem) throw new HouseError(problem, 400);
  const address = typeof input.address === "string" ? input.address : "";
  if (!ADDRESS_RE.test(address)) throw new HouseError("bad address", 400);
  const signature = typeof input.signature === "string" ? input.signature : "";
  const good = await verifySigned(address, signinMessage(name, address, utcDay(new Date(now))), signature, opts);
  if (!good) throw new HouseError("The signature does not match that address (or it was signed for another day)", 401);
  const owned = await claimName(name, address, input.receipt, now);
  let holder: boolean | null = null;
  try {
    holder = (await (opts.balanceOf || kickerBalance)(address)) > 0n;
  } catch {
    holder = null;
  }
  const house = holder ? issueClaim(owned.name, now) : null;
  return { ...issueSession(address, owned.name, now), name: owned.name, address: address.toLowerCase(), house, holder, profile: await getProfile(address) };
}
