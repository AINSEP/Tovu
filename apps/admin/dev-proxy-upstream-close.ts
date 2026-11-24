import { installUpstreamCloseHandling, type ProxyEventsPort } from "@jini-ai/devops/local-dev/dev-proxy-upstream";
import type { ProxyOptions } from "vite";

type ConfigureProxy = NonNullable<ProxyOptions["configure"]>;

/** Mirrors `src/lib/server-reconnect.ts`'s constants — this leaf module must not import from `src/`
 *  (it is loaded by `vite.config.ts`'s own config loader, not the app bundle). */
export const UPSTREAM_REFUSED_HEADER = "x-tovu-upstream-status";
export const UPSTREAM_REFUSED_VALUE = "upstream-refused";

/**
 * @file Dev-proxy `configure` hook for `vite.config.ts`'s `/api` entry: when the upstream response
 * closes before it ended, tear down the browser's response too.
 *
 * Vite's bundled `http-proxy-3` pipes `proxyRes` into `res` and nothing else, so when tsx watch
 * restarts the API mid-stream the assistant's frontend-session SSE feed stays open forever and Jini's
 * bridge keeps handing the dead daemon's bind token to every new run ("no frontend is bound to run
 * ..."). The dropped-upstream lifecycle and the `EventSource` reconnect mechanics live in
 * `@jini-ai/devops/local-dev/dev-proxy-upstream`; this file is only Vite's registration point plus the
 * answer Tovu gives a refused upstream.
 *
 * 2026-10-05: a refused connection means the request never reached the API (it is restarting), so
 * even a write is safe to send again. The 503 carries a header the admin's `request()` reads
 * (`src/lib/server-reconnect.ts`); it then waits for `/readyz` and retries instead of failing.
 *
 * A leaf module, with a type-only `vite` import, for the reason `dev-tls-disable-flag.ts`'s header
 * gives: the test must not import `vite.config.ts` from inside vitest.
 */
export const destroyClientWhenUpstreamCloses: ConfigureProxy = (proxy) => {
  installUpstreamCloseHandling({
    proxy,
    refusal: {
      status: 503,
      headers: { "content-type": "text/plain", [UPSTREAM_REFUSED_HEADER]: UPSTREAM_REFUSED_VALUE },
      body: "The Tovu server is restarting.",
    },
  });
};
