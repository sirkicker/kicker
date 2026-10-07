// GET /api/hall[?day=YYYY-MM-DD] -> best verified hands of a UTC day (CDN-cached for a minute)
import { getHall, utcDay } from "./_runs.js";

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get("day") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : utcDay();
  const hall = await getHall(day);
  return new Response(JSON.stringify(hall), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" },
  });
}
