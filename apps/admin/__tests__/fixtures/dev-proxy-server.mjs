// Child-process fixture for `dev-proxy-upstream-close.unit.test.ts`: a real Vite dev server whose only
// job is the `/api` proxy, configured with the same `configure` hook `vite.config.ts` uses. Run as a
// separate `node` process because starting Vite inside vitest collides with vitest's own esbuild
// service (see `dev-tls-disable-flag.ts`'s header). Prints the bound port as one JSON line.
import { tmpdir } from "node:os";
import { createServer } from "vite";

import { destroyClientWhenUpstreamCloses } from "../../dev-proxy-upstream-close.ts";

const [upstreamPort] = process.argv.slice(2);

const server = await createServer({
  configFile: false,
  root: tmpdir(),
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    host: "127.0.0.1",
    port: 0,
    hmr: false,
    watch: null,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${upstreamPort}`,
        changeOrigin: false,
        configure: destroyClientWhenUpstreamCloses,
      },
    },
  },
});
await server.listen();
process.stdout.write(`${JSON.stringify({ port: server.httpServer.address().port })}\n`);
