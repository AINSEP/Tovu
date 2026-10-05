import type { Express, NextFunction, Request, Response } from "express";

import type { ObservabilityPort } from "@jini-ai/diagnostics/observability";

import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.js";

/**
 * @file Records inbound HTTP requests through the injected diagnostics observability port
 * (Constitution Article VIII). Express owns routing and response completion; Jini owns tracking.
 * Deliberately the only caller of ObservabilityPort.trackRequest in this codebase today.
 * DB/outbound/agent signals remain separate additions: each needs its own real instrumentation
 * call site before a port shape is designed, as explained in Jini's observability/ports.ts.
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
 * @complexity O(1) per request beyond Express's own routing cost.
 */
export function applyRequestTracking(app: Express, deps: { observability: ObservabilityPort }): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId({ header: req.headers[REQUEST_ID_HEADER] });
    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.locals.requestId = requestId;
    const tracker = deps.observability.trackRequest({ method: req.method, path: req.path }, { requestId });

    res.on("finish", () => {
      const routePattern = req.route ? `${req.baseUrl}${req.route.path}` : "unmatched";
      tracker.end({ statusCode: res.statusCode, routePattern });
    });

    next();
  });
}
