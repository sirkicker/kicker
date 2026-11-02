// Local preview for QA: serves dist/ and answers /api/* with the real handlers on the in-memory store.
// Nothing here touches Blob: the store token is removed before anything loads. The squad cut comes from
// scripts/edition.json (re-dated to this hour), and a few bot seasons are posted so the Hall has lines.
// `npx tsx scripts/preview.ts [port]`
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.HOUSE_SECRET;

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] || 5193);
const root = join(process.cwd(), "dist");
const { save } = await import("../api/_store.js");
const { editionNow } = await import("../shared/data.js");
const { Run, encodeTrail } = await import("../shared/engine.js");
const { playSeason } = await import("../shared/bot.js");
const { verifyAndStore } = await import("../api/_runs.js");
const { dailyPin } = await import("../api/_daily.js");

const ed = JSON.parse(readFileSync("scripts/edition.json", "utf8"));
ed.id = editionNow();
ed.at = new Date(Date.now() - 40 * 60_000).toISOString();
// keep ages sensible against the new cut time
const shift = Math.floor(Date.parse(ed.at) / 1000) - Math.max(...ed.pool.flat().map((l: { a: number }) => l.a)) - 1800;
for (const p of ed.pool) for (const l of p) l.a += shift;
await save(`editions/${ed.id}.json`, ed);
const pin = await dailyPin();
const posted: string[] = [];
for (const [name, seed] of [
  ["Rodwell", pin.seed],
  ["Goalmouth", "QA00-0001"],
  ["Keeper", "QA00-0002"],
]) {
  const run = playSeason(new Run(ed, seed));
  try {
    const rec = await verifyAndStore({ seed, edition: ed.id, trail: encodeTrail(run.trail), name });
    posted.push(rec.id);
  } catch (e) {
    console.info("post failed", name, (e as Error).message);
  }
}

const TYPES: Keyed<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

const server = createServer(async (req, res) => {
  try {
    let url = req.url || "/";
    const c = url.match(/^\/c\/([0-9a-z]+)/);
    if (c) url = `/api/felt?id=${c[1]}&view=page`;
    if (url.startsWith("/api/")) {
      const name = url.slice(5).split("?")[0];
      if (!/^[a-z-]+$/.test(name)) {
        res.statusCode = 404;
        return res.end();
      }
      const mod = await import(`../api/${name}.ts`);
      const fn = mod[req.method || "GET"];
      if (!fn) {
        res.statusCode = 405;
        return res.end();
      }
      const chunks: Buffer[] = [];
      for await (const ch of req) chunks.push(ch as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r: Response = await fn(new Request(`http://preview${url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === "GET" ? undefined : body }));
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const path = normalize(join(root, decodeURIComponent(url.split("?")[0])));
    let file = path.startsWith(root) ? path : join(root, "index.html");
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(root, "index.html");
    }
    res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
    res.end(await readFile(file));
  } catch (e) {
    res.statusCode = 500;
    res.end(String((e as Error)?.stack || e));
  }
});
server.listen(port, "127.0.0.1", () => console.info(`preview on ${port} pid ${process.pid} cut ${ed.id} daily ${pin.seed} posted ${posted.join(",")}`));
