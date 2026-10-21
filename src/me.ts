// The signed-in player, from the page's side: one signed plain message per device per day claims the name,
// opens "Your table" and, for $KICKER holders, switches on house colours. Signed out, the device record stays.
import { signinMessage } from "../shared/house.js";
import { cleanName } from "../shared/names.js";
import { utcDay } from "../shared/daily.js";
import type { Profile } from "../shared/profile.js";
import { house } from "./house.js";
import { signText } from "./signin.js";
import { local, setUi, ui } from "./store.js";

export interface MySession {
  session: string;
  expires: number;
  name: string;
  address: string;
}

export const me = {
  get(): MySession | null {
    const s = local.get<MySession | null>("kk.session", null);
    if (!s || typeof s.expires !== "number" || s.expires <= Date.now()) return null;
    // a session belongs to the address signed in right now, nobody else's
    if (!ui.signedIn || s.address !== ui.signedIn) return null;
    return s;
  },
  set(s: MySession | null) {
    if (s) local.set("kk.session", s);
    else local.del("kk.session");
  },
};

/** Receipts for names this device posted without signing in: they let it claim those names later. */
export const receipts = {
  get(name: string): string | undefined {
    return local.get<Keyed<string, string>>("kk.receipts", {})[cleanName(name).toLowerCase()];
  },
  add(name: string, r: string) {
    const all = local.get<Keyed<string, string>>("kk.receipts", {});
    all[cleanName(name).toLowerCase()] = r;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete all[k];
    local.set("kk.receipts", all);
  },
};

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

interface SignedIn extends MySession {
  house: { claim: string; expires: number; day: string } | null;
  holder: boolean | null;
  profile: Profile | null;
}

/** Signs today's sign-in message with the wallet from Para and trades it for a session. No transaction. */
export async function startSession(name: string): Promise<SignedIn> {
  const n = cleanName(name);
  const day = utcDay();
  const { address, signature } = await signText((a) => signinMessage(n, a, day));
  const r = await post<SignedIn>({ action: "signin", name: n, address, signature, receipt: receipts.get(n) });
  me.set({ session: r.session, expires: r.expires, name: r.name, address: r.address });
  local.set("kk.name", r.name);
  if (r.house) house.set({ claim: r.house.claim, name: r.name, day: r.house.day, expires: r.house.expires, address: r.address });
  else house.set(null);
  setUi({ profile: r.profile });
  return r;
}

/** The record from the server, when signed in. Quietly keeps the last one if the network is down. */
export async function refreshProfile(): Promise<void> {
  const s = me.get();
  if (!s) {
    if (ui.profile) setUi({ profile: null });
    return;
  }
  try {
    const r = await post<{ profile: Profile | null }>({ action: "profile", session: s.session });
    setUi({ profile: r.profile });
  } catch (e) {
    if (/expired/i.test(String((e as Error)?.message))) {
      me.set(null);
      setUi({ profile: null });
    }
  }
}

export function endSession() {
  me.set(null);
  house.set(null);
  setUi({ profile: null });
}
