import { createServerReconnect, probeReadyz } from "@jini-ai/admin/browser/server-reconnect";
import type { ServerReconnect, ServerReconnectDeps } from "@jini-ai/admin/browser/server-reconnect";

/**
 * @file Riding out a server restart (2026-10-05, big-chat-capabilities plan S3). When the API is
 * briefly gone — `tsx watch` reloading on a save, or `npm run dev` restarting it onto a newly
 * switched site — `request()` (`api.ts`) waits here for `/readyz` to answer again and retries,
 * instead of failing the screen (the owner's login failed with ECONNREFUSED through the Vite proxy
 * exactly this way). The status drives the "Server restarting…" banner
 * (`@jini-ai/admin`'s `ServerRestartingBanner`, bound in `lib/shell-notices-wiring.tsx`).
 *
 * Which failures may be retried is {@link shouldRetryAfterReconnect}'s call: reads always; a write
 * only when it provably never reached the server (the dev proxy marks a refused upstream with
 * {@link UPSTREAM_REFUSED_HEADER}), or when the caller says repeating it is harmless (login). A
 * write that may have half-run on the dying server is never repeated.
 *
 * No React here: a tiny store plus `useSyncExternalStore` in the banner's hook.
 */

/** Set by the admin dev proxy (`apps/admin/dev-proxy-upstream-close.ts`) on the 503 it answers
 *  when the API refused the connection — proof the request never reached the server. */
export const UPSTREAM_REFUSED_HEADER = "x-tovu-upstream-status";
export const UPSTREAM_REFUSED_VALUE = "upstream-refused";

/** The browser's real reconnect dependencies: the `/readyz` probe, a `setTimeout` sleep and the wall clock. */
export function browserServerReconnectDeps(_required = {}, _optional = {}): ServerReconnectDeps {
  return {
    probe: () => probeReadyz({ request: fetch, url: "/readyz", timeoutSignal: () => AbortSignal.timeout(2_000) }),
    sleep: ({ ms }, _optional = {}) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

/** Gives up at once without probing — what the suite gets, see {@link serverReconnect}. */
const neverReconnects: ServerReconnect = {
  getStatus: () => "online",
  subscribe: () => () => {},
  waitUntilReachable: async () => false,
  markReachable: () => {},
};

/**
 * The reconnect for a build `mode`. Under vitest (`MODE === "test"`) it never waits or probes: an extra
 * `/readyz` fetch would eat a test's queued fetch stub, and every unreachable-path test would stall a
 * minute. Tests of this behaviour build their own with {@link createServerReconnect} and pass it to
 * `api.ts`'s `requestRidingOutRestart`.
 */
export function serverReconnectForMode({ mode }: { mode: string }, _optional = {}): ServerReconnect {
  return mode === "test" ? neverReconnects : createServerReconnect(browserServerReconnectDeps());
}

/** The one instance the app uses (see {@link serverReconnectForMode} for the test-mode stand-in). */
export const serverReconnect: ServerReconnect = serverReconnectForMode({ mode: import.meta.env.MODE });
