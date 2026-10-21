// Small JSON store on Vercel Blob; in local dev (no token) it lives in memory.
// Reads go straight to the public blob URL (built from the store id inside the token), so a read is a
// CDN fetch, not a metered API call. Frozen files are also kept in memory for the life of the instance,
// and a miss is remembered for a short while, so a burst of visitors costs one fetch, not one each.
import { del, put } from "@vercel/blob";

const mem = new Map<string, string>();
const token = () => process.env.BLOB_READ_WRITE_TOKEN || "";
const blobOn = () => !!token();

/** https://<store>.public.blob.vercel-storage.com, from vercel_blob_rw_<store>_<secret> */
function base(): string {
  const id = token().split("_")[3] || "";
  if (!id) throw new Error("blob token has no store id");
  return `https://${id.toLowerCase()}.public.blob.vercel-storage.com`;
}
const urlOf = (path: string) => `${base()}/${path.split("/").map(encodeURIComponent).join("/")}`;

const frozen = new Map<string, unknown>(); // write-once files, safe to keep
const misses = new Map<string, number>(); // path -> remembered until
const MISS_MS = 45_000;

export class Taken extends Error {}

export async function save(path: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  if (!blobOn()) {
    if (mem.has(path)) throw new Taken(path);
    mem.set(path, body);
    return;
  }
  try {
    await put(path, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 31536000,
    });
  } catch (e) {
    if (/already exists/i.test(String((e as Error)?.message))) throw new Taken(path);
    throw e;
  }
  frozen.set(path, value);
  misses.delete(path);
}

/** A write-once file. Kept in memory once seen; a miss is not asked again for a little while. */
export async function load<T>(path: string): Promise<T | null> {
  if (!blobOn()) {
    const v = mem.get(path);
    return v ? (JSON.parse(v) as T) : null;
  }
  if (frozen.has(path)) return frozen.get(path) as T;
  const until = misses.get(path);
  if (until && until > Date.now()) return null;
  try {
    const res = await fetch(urlOf(path), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      if (res.status === 404) misses.set(path, Date.now() + MISS_MS);
      return null;
    }
    const v = (await res.json()) as T;
    frozen.set(path, v);
    if (frozen.size > 400) frozen.delete(frozen.keys().next().value as string);
    return v;
  } catch {
    return null;
  }
}

const fresh = new Map<string, { at: number; v: unknown }>();
const FRESH_MS = 20_000;

/** Overwritable JSON with a short CDN life (the daily hall). */
export async function saveOver(path: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  if (!blobOn()) {
    mem.set(path, body);
    return;
  }
  await put(path, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
  fresh.set(path, { at: Date.now(), v: value });
}

/** Reads an overwritable file past the CDN copy. A read this instance made or wrote in the last seconds is reused. */
export async function loadFresh<T>(path: string, maxAgeMs = FRESH_MS): Promise<T | null> {
  if (!blobOn()) {
    const v = mem.get(path);
    return v ? (JSON.parse(v) as T) : null;
  }
  const hit = fresh.get(path);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.v as T | null;
  try {
    const res = await fetch(`${urlOf(path)}?v=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const v = res.ok ? ((await res.json()) as T) : null;
    if (res.ok || res.status === 404) fresh.set(path, { at: Date.now(), v });
    return v;
  } catch {
    return null;
  }
}

export async function remove(paths: string[]): Promise<void> {
  if (!blobOn()) {
    for (const p of paths) mem.delete(p);
    return;
  }
  for (const p of paths) {
    frozen.delete(p);
    fresh.delete(p);
  }
  if (paths.length) await del(paths.map(urlOf));
}
