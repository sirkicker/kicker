// POST /api/house {name, address, signature} -> {claim, expires, day} for a $KICKER holder.
// The signature is over a plain text message (no gas, no transaction); the balance is a read call.
// What the claim buys: a card back, a felt and a small mark next to the name. Cosmetic only.
import { checkHouse, HouseError } from "./_house.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  let body: Keyed<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return json({ error: "too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    return json(await checkHouse(body));
  } catch (e) {
    // not holding is an ordinary answer, not a failure: say so with a 200 and no claim
    if (e instanceof HouseError) return json({ error: e.message, holder: e.status === 403 ? false : undefined }, e.status === 403 ? 200 : e.status);
    return json({ error: "could not check the house claim" }, 500);
  }
}
