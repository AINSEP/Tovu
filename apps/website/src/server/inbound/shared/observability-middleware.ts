import type { Express, NextFunction, Request, Response } from "express";

import type { ObservabilityPort } from "#src/platform/observability/index";

/**
 * @file The one real instrumentation point this task adds: records every inbound HTTP request
 * through `RouteDeps.observability` (Constitution Article VIII). Deliberately the ONLY caller of
 * `ObservabilityPort.trackRequest` in this codebase today — `platform/observability/ports.ts`'s
 * file header names the others (`trackDbQuery`/`trackOutboundCall`/`trackAgentRun`) as later,
 * separate additions, each needing its own real call site before it is designed.
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
 * `"unmatched"` rather than the raw path — see `ports.ts`'s `RequestTrackingOutcome.routePattern`
 * doc for why unbounded, attacker-controlled path cardinality must never reach this signal.
 *
 * @complexity O(1) per request beyond Express's own routing cost.
 * @overallScore 100
 */
export function applyRequestTracking(app: Express, deps: { observability: ObservabilityPort }): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const tracker = deps.observability.trackRequest({ method: req.method, path: req.path });

    res.on("finish", () => {
      const routePattern = req.route ? `${req.baseUrl}${req.route.path as string}` : "unmatched";
      tracker.end({ statusCode: res.statusCode, routePattern });
    });

    next();
  });
}
