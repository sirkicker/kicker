// POST /api/showdown {seed, edition, trail, name?} -> re-runs the run on the server and stores it.
// GET  /api/showdown?id=<id>                    -> the stored, verified result.
import { getShowdown, verifyAndStore } from "./_runs.js";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

export async function POST(req: Request): Promise<Response> {
  let body: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 40000) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    const rec = await verifyAndStore(body);
    return json({ id: rec.id, url: `/c/${rec.id}`, showdown: rec });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 422);
  }
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id") || "";
  const rec = await getShowdown(id);
  if (!rec) return json({ error: "not found" }, 404, "public, max-age=30");
  return json(rec, 200, "public, max-age=3600, s-maxage=31536000, immutable");
}
