import { authenticatedAdminRequest } from "./api";
import { ADMIN_BASE } from "./router";

/**
 * @file The admin's own errors and page views, sent to `POST /api/admin/v1/telemetry` through the
 * admin's API client. The server relays them to whichever observability / product-analytics
 * provider plugins are configured (or drops them), so no vendor SDK or third-party script loads
 * here and nothing changes when no provider is set up.
 *
 * What leaves the browser: an error's message, stack and React component stack, and the route
 * TEMPLATE (`/admin/posts/:postId`) — never a raw URL, query, form field value or DOM text. Errors
 * are deduped by message + top frame, capped per minute, and only sent while signed in. Nothing
 * here ever throws into the caller: telemetry must not become the next error.
 */

import { createBrowserTelemetry as createCollector, type BrowserTelemetryDeps } from "@jini-ai/admin/browser";
import type { BrowserTelemetry } from "@jini-ai/admin/browser";
export { installBrowserErrorListeners } from "@jini-ai/admin/browser";
export type { BrowserTelemetry, BrowserTelemetryDeps, BrowserTelemetryPayload } from "@jini-ai/admin/browser";

/** Bind the host's initial route; Jini owns collection, dedupe, caps and debounce. */
export function createBrowserTelemetry(deps: BrowserTelemetryDeps, options: { maxErrorsPerMinute?: number; pageviewDelayMs?: number } = {}): BrowserTelemetry {
  return createCollector(deps, { ...options, initialRoute: ADMIN_BASE });
}

/**
 * Route path (base already stripped) + the matched params → `/admin/posts/:postId`. Segments that
 * equal a captured param become its name; the query is dropped. The server also turns any leftover
 * id-like segment into `:id`, so an unmatched path still never leaks a record id.
 * @complexity O(s·p) for s segments and p params.
 */
export function toAdminRouteTemplate({ routePath, params }: { routePath: string; params: Readonly<Record<string, string>> }): string {
  const queryOrFragment = routePath.search(/[?#]/);
  const path = queryOrFragment === -1 ? routePath : routePath.slice(0, queryOrFragment);
  const names = new Map(Object.entries(params).map(([name, value]) => [value, name]));
  const segments = path.split("/").filter(Boolean).map((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
    const name = names.get(decoded);
    return name ? `:${name}` : segment;
  });
  return [ADMIN_BASE, ...segments].join("/");
}

/** The admin's one telemetry instance, posting through the shared API client. Under Vitest it
 * sends nothing: every screen test renders `App`, and an extra POST would land in their fetch fakes. */
export const adminTelemetry = createBrowserTelemetry({
  send: import.meta.env.MODE === "test"
    ? async () => undefined
    : (payload) => authenticatedAdminRequest({ path: "/telemetry", method: "POST", body: payload }, { keepalive: true }),
  nowMs: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

/** `createRoot` options: every error a React boundary caught, and every one none did, with its component stack.
 * Overriding React's defaults drops their console logging, so this keeps it. */
export function reactRootErrorOptions({ telemetry }: { telemetry: Pick<BrowserTelemetry, "reportError"> }) {
  const handle = (error: unknown, info: { componentStack?: string }): void => {
    console.error(error);
    telemetry.reportError({ error, componentStack: info.componentStack });
  };
  return { onCaughtError: handle, onUncaughtError: handle };
}
