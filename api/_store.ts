// Small JSON store on Vercel Blob; in local dev (no token) it lives in memory.
import { del, head, put } from "@vercel/blob";

const mem = new Map<string, string>();
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;

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
}

export async function load<T>(path: string): Promise<T | null> {
  if (!blobOn()) {
    const v = mem.get(path);
    return v ? (JSON.parse(v) as T) : null;
  }
  try {
    const meta = await head(path);
    const res = await fetch(meta.url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Overwritable JSON with a short CDN life (the daily hall). */
export async function saveOver(path: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);
  if (!blobOn()) {
    mem.set(path, body);
    return;
  }
  await put(path, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 });
}

/** Reads the newest version, skipping the blob CDN copy. */
export async function loadFresh<T>(path: string): Promise<T | null> {
  if (!blobOn()) {
    const v = mem.get(path);
    return v ? (JSON.parse(v) as T) : null;
  }
  try {
    const meta = await head(path);
    const res = await fetch(`${meta.url}?v=${new Date(meta.uploadedAt).getTime()}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function remove(paths: string[]): Promise<void> {
  if (!blobOn()) {
    for (const p of paths) mem.delete(p);
    return;
  }
  const urls: string[] = [];
  for (const p of paths) {
    try {
      urls.push((await head(p)).url);
    } catch {
      /* gone already */
    }
  }
  if (urls.length) await del(urls);
}
