// KICKER Club API. One endpoint, one op per call:
// POST {op:"create", name, kit}                    -> {club, secret}
// POST {op:"me", id, secret}                       -> {club, offers, group}
// POST {op:"lineup", id, secret, xi, tactic, captain}
// POST {op:"sign", id, secret, take, drop}         -> one scout signing a week
// POST {op:"drill", id, secret, kind, rod?, value} -> two drills a day
// POST {op:"kickoff", id, secret, slot}            -> a league match against a slot of your group
// POST {op:"decide", id, secret, slot, choice}     -> the next decision; at full time the fixture is stored
// GET  ?group=<week>.<group>                       -> a group's members, fixtures and table
// GET  ?friendly=<your id>                         -> a club to play a friendly against
// GET  ?id=<id>                                    -> a club's public page data
import { kv, kvOn } from "./_kv.js";
import { ClubError, createClub, decide, drill, friendlyRival, groupView, kickoff, loadClub, myClub, ownClub, publicClub, saveLineup, sign, trimRecent } from "./_club.js";

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

const fail = (e: unknown) => {
  if (e instanceof ClubError) return json({ error: e.message }, e.status);
  console.error("club", e);
  return json({ error: "The club office is closed for a moment. Try again." }, 503);
};

export async function POST(req: Request): Promise<Response> {
  let b: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 20000) return json({ error: "too large" }, 413);
    b = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    switch (b.op) {
      case "create": {
        // a few new clubs per address a day
        const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
        const k = `club:new:${ip}`;
        const n = await kv<number>("INCR", k);
        if (n === 1) await kv("EXPIRE", k, 86400);
        if (n > 6 && kvOn()) return json({ error: "Enough new clubs from here today" }, 429);
        if (Math.random() < 0.05) void trimRecent().catch(() => null);
        return json(await createClub(b));
      }
      case "me":
        return json(await myClub(b.id, b.secret));
      case "lineup":
        return json({ club: await saveLineup(await ownClub(b.id, b.secret), b) });
      case "sign":
        return json({ club: await sign(await ownClub(b.id, b.secret), b) });
      case "drill":
        return json({ club: await drill(await ownClub(b.id, b.secret), b) });
      case "kickoff":
        return json(await kickoff(await ownClub(b.id, b.secret), b));
      case "decide":
        return json(await decide(await ownClub(b.id, b.secret), b));
      default:
        return json({ error: "unknown op" }, 400);
    }
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  try {
    const grp = q.get("group");
    if (grp) {
      const m = grp.match(/^(\d{1,6})\.(\d{1,6})$/);
      if (!m) return json({ error: "bad group" }, 400);
      return json(await groupView(Number(m[1]), Number(m[2])), 200, "public, max-age=15, s-maxage=15");
    }
    const fr = q.get("friendly");
    if (fr !== null) return json(await friendlyRival(fr));
    const id = q.get("id") || "";
    const c = await loadClub(id);
    if (!c) return json({ error: "not found" }, 404, "public, max-age=30");
    return json({ club: publicClub(c) }, 200, "public, max-age=30, s-maxage=30");
  } catch (e) {
    return fail(e);
  }
}
