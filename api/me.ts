// POST /api/me {action: "signin", name, address, signature, receipt?}
//   -> one signed plain message (no gas, no transaction) per device per day: ties the name to the address,
//      returns a session claim, house colours if the address holds $KICKER, and the player's record.
// POST /api/me {action: "profile", session} -> the signed-in player's record ("Your table").
// The address comes from the wallet the player signed in with through Para.
import { HouseError } from "./_house.js";
import { getProfile, sessionOf, signIn } from "./_me.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  let body: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 10000) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    if (body.action === "profile") {
      const s = sessionOf(body.session);
      if (!s) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
      return json({ profile: await getProfile(s.a) });
    }
    if (body.action === "signin") return json(await signIn(body));
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof HouseError) return json({ error: e.message }, e.status);
    return json({ error: "could not sign in" }, 500);
  }
}
