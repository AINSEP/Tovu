import type { ProxyOptions } from "vite";

type ConfigureProxy = NonNullable<ProxyOptions["configure"]>;

/** Mirrors `src/lib/server-reconnect.ts`'s constants — this leaf module must not import from `src/`
 *  (it is loaded by `vite.config.ts`'s own config loader, not the app bundle). */
export const UPSTREAM_REFUSED_HEADER = "x-tovu-dev-proxy";
export const UPSTREAM_REFUSED_VALUE = "upstream-refused";

/**
 * @file Dev-proxy `configure` hook for `vite.config.ts`'s `/api` entry: when the upstream response
 * closes before it ended, tear down the browser's response too.
 *
 * Vite's bundled `http-proxy-3` pipes `proxyRes` into `res` and nothing else. `pipe` ends `res` on
 * `end`, but NOT on `close`/`error`, and Vite's own `error` handler only answers when headers have
 * not been sent yet. So when tsx watch restarts the API mid-stream, a streaming response that
 * already had its headers — the assistant's frontend-session SSE feed — stays open forever: the
 * browser's `EventSource` never sees an error, never reconnects, and Jini's bridge keeps handing the
 * dead daemon's bind token to every new run ("no frontend is bound to run …"). Destroying `res`
 * surfaces the loss the same way the real server dying would when the browser talks to it directly.
 *
 * `destroy`, not `end`: `end` would finish a truncated body as if it were complete. Both
 * `http.ServerResponse` and `http2.Http2ServerResponse` (HTTPS dev serves HTTP/2) have `destroy`,
 * and on HTTP/2 it resets just this stream, not the tab's whole multiplexed connection.
 *
 * A leaf module, with a type-only `vite` import, for the reason `dev-tls-disable-flag.ts`'s header
 * gives: the test must not import `vite.config.ts` from inside vitest.
 */
export const destroyClientWhenUpstreamCloses: ConfigureProxy = (proxy) => {
  proxy.on("proxyRes", (proxyRes, _req, res) => {
    // `close` also follows a normal `end`, by which point `pipe` has already ended `res`.
    proxyRes.on("close", () => {
      if (!res.writableEnded) res.destroy();
    });
  });
  // The browser's reconnect then lands while the API is still down, and Vite answers it with a
  // 500 — which `EventSource` treats as final: it closes for good and never reconnects once the
  // API is back. Dropping the connection instead is what an unreachable server looks like, and
  // `EventSource` keeps retrying that. Registered before Vite's own `error` listener, which then
  // finds the response destroyed and writes nothing. Other requests keep Vite's 500.
  proxy.on("error", (err, req, res) => {
    // A `Socket` here is a WebSocket upgrade, which has no headers to check.
    if (!("headersSent" in res) || res.headersSent) return;
    if (String(req.headers.accept ?? "").includes("text/event-stream")) {
      res.destroy();
      return;
    }
    // 2026-10-05: a refused connection means the request never reached the API (it is restarting),
    // so even a write is safe to send again. Say so with a header the admin's `request()` reads
    // (`src/lib/server-reconnect.ts`); it then waits for `/readyz` and retries instead of failing.
    // Any other proxy error (a reset mid-request) keeps Vite's plain 500: that request may have run.
    if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") {
      res.writeHead(503, { "content-type": "text/plain", [UPSTREAM_REFUSED_HEADER]: UPSTREAM_REFUSED_VALUE });
      res.end("The Tovu server is restarting.");
    }
  });
};
