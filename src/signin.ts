// Sign-in, from the Preact side. Para lives in a lazily loaded React island (src/para/island.ts) that is fetched
// only when the player opens sign-in or warms the button; the first load never pulls it. This file never touches
// a wallet: no window.ethereum, no provider discovery. Everything goes through Para.
import { paraConfig } from "./para-config.js";
import { local, setUi, ui } from "./store.js";
import type { Island } from "./para/island.js";

export const PARA = paraConfig(import.meta.env as { VITE_PARA_API_KEY?: string; VITE_PARA_ENV?: string });

let loading: Promise<Island> | null = null;

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);

function setAddress(a: string | null) {
  if (a) local.set("kk.signin", a);
  else local.del("kk.signin");
  if (ui.signedIn !== a) setUi({ signedIn: a });
}

/**
 * Loads the island once, silently: a warm-up on hover, focus or touch never changes a label or a state.
 * A failure or a hang clears the slot so the next try starts fresh.
 */
export function warm(): Promise<Island> | null {
  if (!PARA.available) return null;
  if (!loading) {
    loading = withTimeout(
      import("./para/island.js").then((m) => m.mount({ apiKey: PARA.apiKey, env: PARA.env, onAddress: setAddress })),
      25_000,
      "Sign-in took too long to load. Try again.",
    );
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** A real click or tap: only this shows "Opening..." while the island finishes loading. */
export async function openSignIn(): Promise<void> {
  const p = warm();
  if (!p) return;
  setUi({ signinBusy: true });
  try {
    (await p).open();
  } finally {
    setUi({ signinBusy: false });
  }
}

export async function signOut(): Promise<void> {
  const p = warm();
  setAddress(null);
  if (p) await (await p).signOut();
}

/** Signs the house message with the signed-in wallet. Plain text: no gas, no transaction. */
export async function signText(make: (address: string) => string): Promise<{ address: string; signature: string }> {
  const p = warm();
  if (!p) throw new Error(PARA.note);
  const isl = await p;
  const address = await isl.settled();
  if (!address) throw new Error("Sign in first.");
  const r = await isl.sign(make(address));
  if (r.address !== address) throw new Error("The wallet changed while signing. Try again.");
  return r;
}

/** The last address this browser saw signed in. A hint for the pill until Para confirms it. */
export const rememberedAddress = (): string | null => {
  const a = local.get<string | null>("kk.signin", null);
  return typeof a === "string" && /^0x[0-9a-f]{40}$/.test(a) ? a : null;
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
