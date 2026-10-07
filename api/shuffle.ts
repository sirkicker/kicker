// GET /api/shuffle          -> the newest deck snapshot (cut from the live index once an hour)
// GET /api/shuffle?e=<id>   -> a frozen snapshot, for replaying a shared seed
import { waitUntil } from "@vercel/functions";
import { editionNow } from "../shared/data.js";
import { currentEdition, getEdition, recentEdition } from "./_deck.js";

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });

export async function GET(req: Request): Promise<Response> {
  const e = new URL(req.url).searchParams.get("e");
  try {
    if (e) {
      const id = Number(e);
      if (!Number.isInteger(id) || id < 400000 || id > editionNow() + 1) return json({ error: "bad deck id" }, 400, "public, max-age=60");
      const ed = await getEdition(id);
      if (!ed) return json({ error: "deck not found" }, 404, "public, max-age=30, s-maxage=30");
      return json(ed, 200, "public, max-age=31536000, s-maxage=31536000, immutable");
    }
    const recent = await recentEdition();
    if (recent && recent.id === editionNow()) return json(recent, 200, "public, max-age=60, s-maxage=120, stale-while-revalidate=900");
    if (recent) {
      waitUntil(currentEdition().catch(() => null));
      return json(recent, 200, "public, max-age=30, s-maxage=30");
    }
    const ed = await currentEdition();
    return json(ed, 200, "public, max-age=60, s-maxage=120, stale-while-revalidate=900");
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 503, "no-store");
  }
}
