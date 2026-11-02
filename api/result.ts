// POST /api/result {seed, edition, trail, name?, house?, session?} -> plays the finished season again on the server
//   and stores it. A claimed name needs its owner's session; a named post without one gets a receipt for later
//   claiming the name.
// GET  /api/result?id=<id> -> the stored, verified season (records from before 2.0 come back as they were stored).
import { getResult, verifyAndStore } from "./_runs.js";
import { receiptFor } from "./_me.js";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

export async function POST(req: Request): Promise<Response> {
  let body: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 80000) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    const rec = await verifyAndStore(body);
    const receipt = rec.name && !rec.verified ? receiptFor(rec.name) : undefined;
    return json({ id: rec.id, url: `/c/${rec.id}`, result: rec, ...(receipt ? { receipt } : {}) });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 422);
  }
}

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id") || "";
  const rec = await getResult(id);
  if (!rec) return json({ error: "not found" }, 404, "public, max-age=30");
  return json(rec, 200, "public, max-age=3600, s-maxage=31536000, immutable");
}
