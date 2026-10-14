// GET /api/hall[?day=YYYY-MM-DD]             -> best verified hands of a UTC day (CDN-cached for a minute)
// GET /api/hall?board=daily[&day=YYYY-MM-DD] -> the Daily Deal board of that day: one line per name, their best
import { DAY_RE } from "../shared/daily.js";
import { publicBoard } from "./_daily.js";
import { getHall, utcDay } from "./_runs.js";

export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("day") || "";
  const day = DAY_RE.test(q) ? q : utcDay();
  const body = sp.get("board") === "daily" ? await publicBoard(day) : await getHall(day);
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60" },
  });
}
