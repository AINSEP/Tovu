import type { ProxyOptions } from "vite";

type ConfigureProxy = NonNullable<ProxyOptions["configure"]>;

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
};
