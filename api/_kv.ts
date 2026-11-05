// Key-value store for KICKER Club: Upstash Redis over its REST API. With no credentials (local dev, the preview
// server) it runs in memory, with the same semantics for the handful of commands the club uses.
type Val = string | number | null;

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const tok = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const kvOn = () => !!(url() && tok());

// ---------------------------------------------------------------- memory fallback
const mem = new Map<string, string>();
const hmem = new Map<string, Map<string, string>>();
const ttl = new Map<string, number>();
const lmem = new Map<string, string[]>();
const alive = (k: string) => {
  const t = ttl.get(k);
  if (t && t < Date.now()) {
    mem.delete(k);
    hmem.delete(k);
    ttl.delete(k);
  }
};
function memRun(cmd: Val[]): unknown {
  const [op, ...a] = cmd.map((x) => (x === null ? null : String(x)));
  const k = a[0] as string;
  alive(k);
  switch (String(op).toUpperCase()) {
    case "GET":
      return mem.get(k) ?? null;
    case "SET": {
      const nx = a.includes("NX");
      if (nx && mem.has(k)) return null;
      mem.set(k, a[1] as string);
      const ex = a.indexOf("EX");
      if (ex > 0) ttl.set(k, Date.now() + Number(a[ex + 1]) * 1000);
      else ttl.delete(k);
      return "OK";
    }
    case "DEL":
      return a.reduce((n, key) => n + (mem.delete(key as string) || hmem.delete(key as string) || lmem.delete(key as string) ? 1 : 0), 0);
    case "INCR": {
      const v = Number(mem.get(k) || 0) + 1;
      mem.set(k, String(v));
      return v;
    }
    case "EXPIRE":
      ttl.set(k, Date.now() + Number(a[1]) * 1000);
      return 1;
    case "MGET":
      return a.map((key) => {
        alive(key as string);
        return mem.get(key as string) ?? null;
      });
    case "HGET":
      return hmem.get(k)?.get(a[1] as string) ?? null;
    case "HSETNX": {
      const h = hmem.get(k) || new Map();
      hmem.set(k, h);
      if (h.has(a[1] as string)) return 0;
      h.set(a[1] as string, a[2] as string);
      return 1;
    }
    case "HSET": {
      const h = hmem.get(k) || new Map();
      hmem.set(k, h);
      h.set(a[1] as string, a[2] as string);
      return 1;
    }
    case "HDEL":
      return hmem.get(k)?.delete(a[1] as string) ? 1 : 0;
    case "HGETALL": {
      const h = hmem.get(k);
      const out: string[] = [];
      if (h) for (const [f, v] of h) out.push(f, v);
      return out;
    }
    case "ZADD": {
      const h = hmem.get(k) || new Map();
      hmem.set(k, h);
      h.set(a[2] as string, a[1] as string);
      return 1;
    }
    case "ZREVRANGE": {
      const h = hmem.get(k);
      if (!h) return [];
      const sorted = [...h.entries()].sort((x, y) => Number(y[1]) - Number(x[1])).map((e) => e[0]);
      return sorted.slice(Number(a[1]), Number(a[2]) + 1);
    }
    case "ZREMRANGEBYRANK": {
      const h = hmem.get(k);
      if (!h) return 0;
      const asc = [...h.entries()].sort((x, y) => Number(x[1]) - Number(y[1]));
      let lo = Number(a[1]);
      let hi = Number(a[2]);
      if (lo < 0) lo += asc.length;
      if (hi < 0) hi += asc.length;
      let n = 0;
      asc.forEach(([f], i) => {
        if (i >= lo && i <= hi) {
          h.delete(f);
          n++;
        }
      });
      return n;
    }
    // lists (KICKER 5: one list of man ids per day)
    case "RPUSH": {
      const l = lmem.get(k) || [];
      lmem.set(k, l);
      l.push(...(a.slice(1) as string[]));
      return l.length;
    }
    case "LLEN":
      return lmem.get(k)?.length || 0;
    case "LRANGE": {
      const l = lmem.get(k) || [];
      let lo = Number(a[1]);
      let hi = Number(a[2]);
      if (lo < 0) lo = Math.max(0, l.length + lo);
      if (hi < 0) hi += l.length;
      return l.slice(lo, hi + 1);
    }
    default:
      throw new Error("kv: unsupported " + op);
  }
}

// ---------------------------------------------------------------- REST
async function rest(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(url().replace(/\/$/, "") + path, {
    method: "POST",
    headers: { authorization: `Bearer ${tok()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`kv HTTP ${res.status}`);
  return res.json();
}

/** One command. */
export async function kv<T = unknown>(...cmd: Val[]): Promise<T> {
  if (!kvOn()) return memRun(cmd) as T;
  const j = (await rest("", cmd)) as { result?: unknown; error?: string };
  if (j.error) throw new Error("kv: " + j.error);
  return j.result as T;
}

/** Several commands in one round trip (not a transaction). */
export async function kvMany(cmds: Val[][]): Promise<unknown[]> {
  if (!cmds.length) return [];
  if (!kvOn()) return cmds.map(memRun);
  const j = (await rest("/pipeline", cmds)) as { result?: unknown; error?: string }[];
  return j.map((x) => {
    if (x.error) throw new Error("kv: " + x.error);
    return x.result;
  });
}

export async function getJson<T>(key: string): Promise<T | null> {
  const v = await kv<string | null>("GET", key);
  return v ? (JSON.parse(v) as T) : null;
}
export async function setJson(key: string, value: unknown, opts: { nx?: boolean; ex?: number } = {}): Promise<boolean> {
  const cmd: Val[] = ["SET", key, JSON.stringify(value)];
  if (opts.nx) cmd.push("NX");
  if (opts.ex) cmd.push("EX", opts.ex);
  return (await kv("SET", ...cmd.slice(1))) === "OK";
}
export function hashPairs(arr: string[] | null): Map<string, string> {
  const m = new Map<string, string>();
  if (arr) for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
  return m;
}
