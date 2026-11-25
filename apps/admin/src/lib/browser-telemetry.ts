import { authenticatedAdminRequest } from "./admin-http/request";
import { ADMIN_BASE } from "@jini-ai/admin/shell/lib/router";

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

/** Bind the host's initial route; Jini owns collection, dedupe, caps and debounce. */
export function createBrowserTelemetry(deps: BrowserTelemetryDeps, options: { maxErrorsPerMinute?: number; pageviewDelayMs?: number } = {}): BrowserTelemetry {
  return createCollector(deps, { ...options, initialRoute: ADMIN_BASE });
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

