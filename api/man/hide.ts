// POST /api/man/hide {id} with header x-admin = KICKER_ADMIN_KEY: takes a man off the table everywhere.
import { SideError, hideMan } from "../_side.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  let id = new URL(req.url).searchParams.get("id") || "";
  try {
    const text = await req.text();
    if (text) id = String((JSON.parse(text) as { id?: unknown }).id || id);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  try {
    return json({ hidden: await hideMan(id, req.headers.get("x-admin")) });
  } catch (e) {
    if (e instanceof SideError) return json({ error: e.message }, e.status);
    return json({ error: "could not hide" }, 500);
  }
}
