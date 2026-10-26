import { redactSecrets } from "@jini-ai/core";
import type { Express, Request, Response } from "express";

import { ADMIN_BROWSER_TELEMETRY_PER_PRINCIPAL, createRateLimiter, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { getAuthedCredentialKind, getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `POST /api/admin/v1/telemetry` — the admin browser's errors and page views, relayed to the
 * same neutral ports server code uses, so no vendor SDK or third-party script ever loads in the
 * admin. Errors go to `observability.reportError` (whichever observability provider plugins are
 * installed + enabled + configured, else the no-op); page views go to `productAnalytics.capture`
 * as `admin_pageview`, which `withProductAnalyticsGuards` drops unless the operator's telemetry
 * consent is on. Site attribution is added by the provider host, not here.
 *
 * Privacy: the body is a closed shape (unknown keys are refused, every string is capped), the
 * route is reduced to a template (query/fragment cut, id-like segments become `:id`), and message,
 * stack and component stack lose URL queries and pass core's secret/PII redaction before leaving.
 * Browser sessions only: a machine credential has no browser to report from.
 */

export type AdminBrowserTelemetryDeps = Pick<RouteDeps, "clock" | "observability"> & Partial<Pick<RouteDeps, "productAnalytics">>;

export type BrowserTelemetryEvent =
  | { type: "error"; message: string; stack: string; componentStack?: string; route: string }
  | { type: "pageview"; route: string };

type Parsed = { ok: true; event: BrowserTelemetryEvent } | { ok: false; status: 400 | 413; error: string };

/** The whole request; the session body parser allows far more, so this route sets its own ceiling. */
export const MAX_TELEMETRY_BODY_BYTES = 16 * 1024;
const CAPS = { message: 1_000, stack: 8_000, componentStack: 4_000, route: 200 } as const;
const KEYS = { error: ["type", "message", "stack", "componentStack", "route"], pageview: ["type", "route"] } as const;
const REQUIRED = { error: ["message", "stack", "route"], pageview: ["route"] } as const;

const ROUTE_SHAPE = /^\/admin(?:\/[A-Za-z0-9:_.~-]*)*$/;
// Segments that name a record rather than a screen: numbers, UUIDs, hex ids, long mixed tokens.
const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{12,}|(?=[^/]*\d)[A-Za-z0-9_.~-]{16,})$/i;
// A URL's query or fragment inside free text (a stack frame, a fetch error); the URL itself and a
// stack frame's trailing `:line:col` stay. Both runs are bounded, so a long run costs linear time.
const URL_QUERY = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#()'"]{0,2048})[?#][^\s()'"]{0,8192}?((?::\d+){0,2})(?=[\s()'"]|$)/gi;

/**
 * Reduces a browser route to its template: query and fragment cut, id-like segments `:id`.
 * @returns The template, or `null` when it is not an admin path.
 * @complexity O(n) in the route length (capped by the caller).
 */
export function toRouteTemplate(raw: string): string | null {
  const path = raw.split(/[?#]/, 1)[0] ?? "";
  if (!ROUTE_SHAPE.test(path)) return null;
  return path.split("/").map((segment) => (ID_SEGMENT.test(segment) ? ":id" : segment)).join("/");
}

/** Cuts URL queries/fragments, then core redaction (keys, tokens, e-mails, phones). @complexity O(n). */
export function scrubTelemetryText(text: string): string {
  return redactSecrets({ input: text.replace(URL_QUERY, "$1$2") });
}

function checkFields(body: Record<string, unknown>, type: "error" | "pageview"): Parsed | null {
  const allowed: readonly string[] = KEYS[type];
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) return { ok: false, status: 400, error: `unknown field '${unknown}'` };
  const missing = REQUIRED[type].find((key) => body[key] === undefined);
  if (missing) return { ok: false, status: 400, error: `missing field '${missing}'` };
  for (const key of allowed.slice(1)) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, status: 400, error: `'${key}' must be a string` };
    if (value.length > CAPS[key as keyof typeof CAPS]) return { ok: false, status: 413, error: `'${key}' is too long` };
  }
  return null;
}

/**
 * Validates and sanitizes one request body into the event that may be forwarded.
 * @complexity O(n) in the (capped) body size.
 */
export function parseBrowserTelemetry(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, status: 400, error: "body must be an object" };
  const record = body as Record<string, unknown>;
  if (record.type !== "error" && record.type !== "pageview") return { ok: false, status: 400, error: "type must be 'error' or 'pageview'" };
  const invalid = checkFields(record, record.type);
  if (invalid) return invalid;
  const route = toRouteTemplate(record.route as string);
  if (route === null) return { ok: false, status: 400, error: "route must be an admin path" };
  return { ok: true, event: record.type === "pageview" ? { type: "pageview", route } : toErrorEvent(record, route) };
}

/** The error event with every free-text field scrubbed; fields were already checked to be strings. */
function toErrorEvent(record: Record<string, unknown>, route: string): BrowserTelemetryEvent {
  const componentStack = record.componentStack ? scrubTelemetryText(record.componentStack as string) : "";
  return { type: "error", route, message: scrubTelemetryText(record.message as string), stack: scrubTelemetryText(record.stack as string), ...(componentStack ? { componentStack } : {}) };
}

/** An `Error` carrying the browser's (already scrubbed) message and stack, not this route's. */
function toReportedError(event: Extract<BrowserTelemetryEvent, { type: "error" }>): Error {
  const error = new Error(event.message);
  error.name = "AdminBrowserError";
  error.stack = event.stack || `${error.name}: ${event.message}`;
  return error;
}

/** Hands one sanitized event to its port. Ports never throw by contract; this never awaits them. */
export function forwardBrowserTelemetry(deps: AdminBrowserTelemetryDeps, { event, principalId }: { event: BrowserTelemetryEvent; principalId: string }): void {
  if (event.type === "pageview") {
    deps.productAnalytics?.capture({ name: "admin_pageview", userId: principalId, properties: { route: event.route } });
    return;
  }
  const attributes = { source: "admin-browser", route: event.route, ...(event.componentStack ? { componentStack: event.componentStack } : {}) };
  deps.observability.reportError({ error: toReportedError(event), context: { operation: "admin.browser.error", attributes } });
}

/** This route's own per-principal budget (a browser with a render loop must not flood a vendor). */
export function createBrowserTelemetryLimiter(deps: Pick<RouteDeps, "clock">): RateLimiter {
  return createRateLimiter({ profile: ADMIN_BROWSER_TELEMETRY_PER_PRINCIPAL, clock: deps.clock });
}

async function admit(limiter: RateLimiter, req: Request, res: Response): Promise<string | null> {
  if (getAuthedCredentialKind(res) !== "session") {
    res.status(403).json({ error: "browser telemetry requires a signed-in session", code: "FORBIDDEN" });
    return null;
  }
  if (Number(req.headers["content-length"] ?? 0) > MAX_TELEMETRY_BODY_BYTES) {
    res.status(413).json({ error: "telemetry body is too large", code: "PAYLOAD_TOO_LARGE" });
    return null;
  }
  const principalId = getAuthedPrincipal(res).id;
  const result = await limiter.check({ key: principalId });
  if (result.allowed) return principalId;
  res.setHeader("Retry-After", String(result.retryAfterSeconds));
  res.status(429).json({ error: "too many telemetry events", code: "RATE_LIMIT_EXCEEDED" });
  return null;
}

/**
 * Registers `POST /api/admin/v1/telemetry` (behind `requireAdminSession`, like all of `/api/admin`).
 * @complexity O(n) in the capped body; one limiter check.
 */
export function registerAdminBrowserTelemetryRoute(app: Express, deps: AdminBrowserTelemetryDeps, limiter: RateLimiter = createBrowserTelemetryLimiter(deps)): void {
  app.post("/api/admin/v1/telemetry", async (req, res) => {
    try {
      const principalId = await admit(limiter, req, res);
      if (principalId === null) return;
      const parsed = parseBrowserTelemetry(req.body);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, code: parsed.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT" });
        return;
      }
      forwardBrowserTelemetry(deps, { event: parsed.event, principalId });
      res.status(204).end();
    } catch {
      console.error("[telemetry] browser telemetry route failed");
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
