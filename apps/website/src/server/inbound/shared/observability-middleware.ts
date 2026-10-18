import type { Express, NextFunction, Request, Response } from "express";

import type { Logger } from "@jini-ai/core/primitives";
import { logCompletedRequest } from "@jini-ai/http-kit/observability";
import type { ObservabilityPort } from "@jini-ai/diagnostics/observability";

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
  observability: ObservabilityPort;
  logger?: Pick<Logger, "info">;
  env?: Pick<NodeJS.ProcessEnv, "TOVU_LOG_REQUESTS" | "TOVU_LOG_SLOW_REQUESTS">;
}): void {
  const env = deps.env ?? process.env;
  const logRequests = env.TOVU_LOG_REQUESTS === "1";
  const slowRequestMs = env.TOVU_LOG_SLOW_REQUESTS?.trim() ? Number(env.TOVU_LOG_SLOW_REQUESTS) : undefined;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = performance.now();
    const requestId = resolveRequestId({ header: req.headers[REQUEST_ID_HEADER] });
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.locals.requestId = requestId;
    const tracker = deps.observability.trackRequest({ method: req.method, path: req.path }, { requestId });

    res.on("finish", () => {
      const durationMs = performance.now() - startedAt;
      const routePattern = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched";
      tracker.end({ statusCode: res.statusCode, routePattern });
      logCompletedRequest({
        requestId, method: req.method, routePattern, statusCode: res.statusCode, durationMs,
      }, { logger: deps.logger, logRequests, slowRequestMs });
    });

    // Routing and the handler run inside the request's scope, so a DB query or outbound call they
    // make is recorded as this request's child. A tracker from an adapter without scoping lacks run().
    if (tracker.run) tracker.run(next);
    else next();
  });
}
