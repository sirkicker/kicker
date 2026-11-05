import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

/** The pages vercel.json rewrites, for the dev and preview servers. */
function pageRewrite(url: string): string {
  if (/^\/club\/?(\?|$)/.test(url)) return url.replace(/^\/club\/?/, "/club.html");
  if (/^\/privacy\/?(\?|$)/.test(url)) return url.replace(/^\/privacy\/?/, "/privacy.html");
  return url;
}

/** Dev only: serve /api/<name> from api/<name>.ts the way Vercel would. */
function devApi(): Plugin {
  let seeded: Promise<unknown> | null = null;
  return {
    name: "dev-api",
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url) req.url = pageRewrite(req.url);
        next();
      });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url) req.url = pageRewrite(req.url);
        // DEV ONLY: SIDE_SEED=1 puts forty demo men on an in-memory table (scripts/side-seed.ts refuses a real KV)
        if (process.env.SIDE_SEED && !seeded) seeded = server.ssrLoadModule("/scripts/side-seed.ts").then((m) => m.seed());
        if (seeded) await seeded.catch(() => null);
        if (!req.url || !req.url.startsWith("/api/") && !req.url.startsWith("/c/") && !req.url.startsWith("/m/") && !req.url.startsWith("/k/") && !req.url.startsWith("/l/")) return next();
        let url = req.url;
        const c = url.match(/^\/c\/([0-9a-z]+)/);
        if (c) url = `/api/felt?id=${c[1]}&view=page`;
        const m = url.match(/^\/m\/([0-9a-z]+)/);
        if (m) url = `/api/k6?view=m&id=${m[1]}`;
        const k = url.match(/^\/k\/([0-9]+)/);
        if (k) url = `/api/k6?view=k&no=${k[1]}`;
        const l = url.match(/^\/l\/(0x[0-9a-fA-F]{40})/);
        if (l) url = `/api/k6?view=l&t=${l[1]}`;
        const name = url.slice(5).split("?")[0];
        if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const fn = mod[req.method || "GET"];
          if (!fn) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const ch of req) chunks.push(ch as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const r: Response = await fn(new Request("http://localhost" + url, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === "GET" ? undefined : body }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(String((e as Error)?.stack || e));
        }
      });
    },
  };
}

export default defineConfig({
  // real React only for the lazily loaded sign-in island (src/para/): no react -> preact/compat alias,
  // and the island is left out of Preact's dev transforms. Everything else imports preact directly.
  plugins: [preact({ reactAliasesEnabled: false, exclude: [/src[\/]para[\/]/, /node_modules/] }), devApi()],
  build: { target: "es2022", chunkSizeWarningLimit: 1200, sourcemap: process.env.QA_MAP ? true : false, rollupOptions: {
      input: { main: "index.html", club: "club.html", classic: "classic.html", privacy: "privacy.html", "k6-gold": "src/k6/gold.ts" },
      // the server-made /l/ page loads the holder sign-in by a fixed name (api/k6.ts GOLD_JS)
      output: { entryFileNames: (c: { name: string }) => (c.name === "k6-gold" ? "k6-gold.js" : "assets/[name]-[hash].js") },
    } },
  ssr: { external: ["@resvg/resvg-js"] },
});
