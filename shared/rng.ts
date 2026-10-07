// Deterministic randomness. Every random choice in a run comes from a stream named by
// (seed, purpose, index...), so the same seed deals the same cards on any machine.

export function hash32(s: string): number {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export type Rand = () => number;

export function mulberry32(a: number): Rand {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stream(seed: string, ...keys: (string | number)[]): Rand {
  return mulberry32(hash32(seed + "|" + keys.join("|")));
}

export function shuffle<T>(arr: T[], rnd: Rand): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickWeighted<T>(items: T[], weight: (t: T) => number, rnd: Rand): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return null;
  let r = rnd() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

// Seeds: 8 symbols of Crockford base32 shown as XXXX-XXXX.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += B32[b & 31];
  return s.slice(0, 4) + "-" + s.slice(4);
}
export function normSeed(raw: string): string | null {
  const s = (raw || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (s.length !== 8 || [...s].some((c) => !B32.includes(c))) return null;
  return s.slice(0, 4) + "-" + s.slice(4);
}
