import type { ErrorRequestHandler, Express, NextFunction, Request, Response } from "express";

import type { Logger } from "@jini-ai/core/primitives";
import { logCompletedRequest } from "@jini-ai/http-kit/observability";
import type { Tracker } from "@jini-ai/diagnostics/observability";

import { runWithErrorReportScope, type ErrorReportScope } from "../../../platform/observability/report-error.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.js";

/**
 * @file Records inbound HTTP requests through the injected diagnostics observability port
 * (Constitution Article VIII). Express owns routing and response completion; Jini owns tracking.
 * Deliberately the only caller of ObservabilityPort.trackRequest in this codebase today.
 * DB/outbound/agent signals were each shaped after their own real instrumentation call site, as
 * Jini's observability/ports.ts requires, and are recorded there: the storage kernel and guarded
 * HTTP clients (decorated in `deps.ts`) and the agent-run finalizer. This middleware only opens the
 * request scope they nest under.
 *
 * Registered first in `createApp()`, ahead of `applySiteServingGate` and every route module (see
 * that call site's own comment), so a request the serving gate rejects or a 404 that matches no
 * route at all is still measured — registering after routing would silently blind this to exactly
 * the failure-shaped requests observability exists to see.
 */

/**
 * Mounts the request-tracking middleware onto `app`. Mirrors `applyDevCors(app: Express)`'s and
 * `applySiteServingGate(app, { ... })`'s existing shape — a small `apply*` function taking `app`
 * plus a narrow deps slice, calling `app.use()` internally — rather than inlining the middleware
 * body into `createApp()` itself.
 *
 * The route pattern is read at `res.on("finish")` time, not at middleware-entry time: Express only
 * populates `req.route` once routing has actually resolved a handler, so reading it when this
 * middleware first runs (before any route has matched) would always see `undefined`.
 * `req.baseUrl + req.route.path` reconstructs the FULL mount-aware pattern (e.g.
 * `"/api/admin/posts/:id"`) — `req.route.path` alone is only the route's pattern local to whichever
 * `express.Router()` it was registered on, which is incomplete for any route mounted under a
 * sub-router. An unmatched request (no route resolved at all) reports the fixed literal
 * `"unmatched"` rather than the raw path — see diagnostics' `RequestTrackingOutcome.routePattern`
 * doc for why unbounded, attacker-controlled path cardinality must never reach this signal.
 *
 * Also owns the request id: a safe inbound `x-request-id` is reused, otherwise one is minted (see
 * `request-id.ts`); either way it is set on the response BEFORE `next()` — so a gate rejection or a
 * 404 carries it too — exposed on `res.locals.requestId` for handlers, and handed to
 * `trackRequest` so the id a user reports matches the tracked request.
 *
 * Also the request's error report (provider wave 2, 2026-10-25): a response that finishes 5xx is
 * reported ONCE to `ObservabilityPort.reportError` — the thrown error when `captureRouteError` saw
 * one, else a stackless "HTTP <status>" marker — unless something inside the request (a tracked
 * operation, the site assistant) already reported. Its attributes are the route TEMPLATE, method,
 * status, request id and the signed-in principal's id: never the raw path, query, headers, cookies
 * or body.
 *
 * Completed requests are silent unless TOVU_LOG_REQUESTS=1 or their duration exceeds an explicit
 * TOVU_LOG_SLOW_REQUESTS threshold in milliseconds. Error logging remains with existing handlers.
 * Jini keeps console output compact and structured sinks receive the
 * same id, method, bounded route pattern, status and duration. Raw paths, query strings, headers and bodies
 * are deliberately excluded from logs because they can contain credentials or personal data.
 * The optional logger is a host/test binding; no second logging implementation or context store
 * is introduced. Existing `res.locals.requestId` remains the handler's correlation context.
 *
 * @param app Express app receiving the middleware.
 * @param deps Request tracker, optional structured logger and host environment binding.
 * @returns Nothing; registers request middleware and response-completion listeners.
 * @example applyRequestTracking(app, { observability, logger });
 * @complexity O(1) time and auxiliary space per request beyond routing and injected adapters.
 */
export function applyRequestTracking(app: Express, deps: {
  tracker: Tracker;
  logger?: Pick<Logger, "info">;
  env?: Pick<NodeJS.ProcessEnv, "TOVU_LOG_REQUESTS" | "TOVU_LOG_SLOW_REQUESTS">;
}): void {
  const env = deps.env ?? process.env;
  const logRequests = env.TOVU_LOG_REQUESTS === "1";
  const slowRequestMs = env.TOVU_LOG_SLOW_REQUESTS?.trim() ? Number(env.TOVU_LOG_SLOW_REQUESTS) : undefined;
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Management transfers carry the same bearer token as the public download. Keep their
    // paths out of tracing and request logs too; the permission gate still runs normally.
    if (/\/site-shares\/artifacts\//i.test(req.path)) { next(); return; }
    const startedAt = performance.now();
    const requestId = resolveRequestId({ header: req.headers[REQUEST_ID_HEADER] });
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.locals.requestId = requestId;
    const scope: ErrorReportScope = { reported: false };
    void deps.tracker.span("http.request", (span) => new Promise<void>((resolve) => {
      res.once("finish", () => {
        const durationMs = performance.now() - startedAt;
        // After an error reaches the app's final handler Express has already reset `req.baseUrl`
        // (undefined at the top level), so it is read defensively.
        const routePattern = req.route ? `${req.baseUrl ?? ""}${req.route.path}` : "unmatched";
        reportServerError({ tracker: deps.tracker, req, res, scope, routePattern });
        span.setOutcome({ statusCode: res.statusCode, routePattern });
        logCompletedRequest({
          requestId, method: req.method, routePattern, statusCode: res.statusCode, durationMs,
        }, { logger: deps.logger, logRequests, slowRequestMs });
        resolve();
      });
      // A disconnected response may never finish; settle its span without retaining the request.
      res.once("close", () => {
        if (res.writableFinished) return;
        span.setOutcome({ statusCode: 499, routePattern: req.route ? `${req.baseUrl ?? ""}${req.route.path}` : "unmatched" });
        resolve();
      });
      // Routing and the handler run inside the request's scope, so a DB query or outbound call they
      // make is recorded as this request's child. The facade contains adapters without scoping.
      runWithErrorReportScope({ scope, work: next });
    }), { request: { method: req.method, path: req.path, requestId } }).catch(next);
  });
}

/** Reports a finished 5xx response once, unless the request's own work already reported. */
function reportServerError({ tracker, req, res, scope, routePattern }: {
  tracker: Tracker; req: Request; res: Response; scope: ErrorReportScope; routePattern: string;
}): void {
  if (res.statusCode < 500 || scope.reported) return;
  const marker = new Error(`HTTP ${res.statusCode} from ${req.method} ${routePattern}`);
  marker.name = "ServerErrorResponse";
  marker.stack = `${marker.name}: ${marker.message}`;
  const principalId = (res.locals.principal as { id?: unknown } | undefined)?.id;
  tracker.error(res.locals.routeError ?? marker, { operation: "http.request", attributes: {
    route: routePattern, method: req.method, status: res.statusCode, requestId: String(res.locals.requestId),
    ...(typeof principalId === "string" ? { principalId } : {}),
  } });
}

/**
 * Last error middleware in `createApp()`: remembers the error Express is about to answer with its
 * default handler so the 5xx report above carries the real error, then passes it on unchanged.
 * @complexity O(1).
 */
export const captureRouteError: ErrorRequestHandler = (error, _req, res, next) => {
  res.locals.routeError = error;
  next(error);
};
