import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

/** Dev only: serve /api/<name> from api/<name>.ts the way Vercel would. */
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/") && !req.url.startsWith("/c/")) return next();
        let url = req.url;
        const c = url.match(/^\/c\/([0-9a-z]+)/);
        if (c) url = `/api/felt?id=${c[1]}&view=page`;
        const name = url.slice(5).split("?")[0];
        if (!/^[a-z-]+$/.test(name)) return next();
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
  plugins: [preact(), devApi()],
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  ssr: { external: ["@resvg/resvg-js"] },
});
