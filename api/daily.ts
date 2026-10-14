// GET /api/daily -> today's Daily Deal: the seed, the pinned deck and how many players have posted a run
import { dayLabel, utcDay } from "../shared/daily.js";
import { dailyPin, getBoard } from "./_daily.js";

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

export async function GET(): Promise<Response> {
  const day = utcDay();
  try {
    const [pin, board] = await Promise.all([dailyPin(day), getBoard(day)]);
    return json({ ...pin, label: dayLabel(day), players: board.players }, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
  } catch (e) {
    return json({ error: String((e as Error)?.message || e), day }, 503, "public, max-age=20, s-maxage=20");
  }
}
