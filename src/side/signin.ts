// Optional sign-in for the gold rod. Para's island (src/para/island.ts) is fetched only when someone presses
// "sign in"; this file never touches a wallet itself: no window.ethereum, no provider discovery.
import { paraConfig } from "../para-config.js";
import type { Island } from "../para/island.js";

export const PARA = paraConfig(import.meta.env as { VITE_PARA_API_KEY?: string; VITE_PARA_ENV?: string });
const KEY = "side.addr";
let loading: Promise<Island> | null = null;
const subs = new Set<(a: string | null) => void>();

export const remembered = (): string | null => {
  try {
    const a = localStorage.getItem(KEY);
    return a && /^0x[0-9a-f]{40}$/.test(a) ? a : null;
  } catch {
    return null;
  }
};
function setAddr(a: string | null) {
  try {
    if (a) localStorage.setItem(KEY, a);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f(a));
}
export const onAddr = (f: (a: string | null) => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

function island(): Promise<Island> | null {
  if (!PARA.available) return null;
  if (!loading) {
    loading = Promise.race([
      import("../para/island.js").then((m) => m.mount({ apiKey: PARA.apiKey, env: PARA.env, onAddress: setAddr })),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sign-in took too long. try again")), 25_000)),
    ]);
    loading.catch(() => (loading = null));
  }
  return loading;
}
export async function signIn(): Promise<void> {
  const p = island();
  if (!p) throw new Error("sign-in is resting today. your man is welcome on the brass");
  (await p).open();
}
export async function signOut(): Promise<void> {
  setAddr(null);
  const p = island();
  if (p) await (await p).signOut();
}
