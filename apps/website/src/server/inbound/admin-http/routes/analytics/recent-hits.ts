import { adminFailureResponse } from "#src/server/inbound/shared/admin-failure";
import { respondToApiError } from "#src/server/error-mapping/respond";
import type { Express, Response } from "express";

import { analyticsRecentHitsRoute } from "@jini-ai/analytics/admin-http/routes/recent-hits";
import type { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import type { AnalyticsSinkPort } from "@jini-ai/analytics/site/ports";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Host binding for the admin "recent hits" read route (ADR-035, ADR-PIPE-014).
 *
 * Purpose:
 * Mounts Jini's `analyticsRecentHitsRoute` spec (`GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits`,
 * `analytics.read`-gated, a raw recent-hits list over the ingest `AnalyticsSinkPort`, NOT a dashboard — see the
 * spec's header) behind the admin ports, and owns the one thing the spec must not: the canonical analytics wire
 * envelope `{ error: { code, message, details?, requestId? } }` for the workspace 404, the authorize 403 and the
 * redacted 500, which Tovu's `respondToApiError` / `adminFailureResponse` write.
 *
 * How it relates to the project:
 * - Mirrors `apps/website/src/server/inbound/admin-http/routes/posts/list.ts`'s registrar shape; the admin session gate
 *   (`inbound/admin-http/dev-auth.ts`) and the workspace-id 404 run before the spec asks for `analytics.read`
 *   ("direct": this route never consulted a publishing grant — ADR-PIPE-014 Decision §1/Enforcement).
 */

/** Deps this route needs: the workspace scope + authorize seam from `RouteDeps`, plus the ingest sink to read. */
export type AdminAnalyticsRecentHitsDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  analyticsSink: AnalyticsSinkPort;
};

/** The two refusals the spec and the ports raise, in the canonical analytics envelope (`respondToApiError`).
 * @complexity O(1). */
function writeAnalyticsRefusal({ res, error }: { res: Response; error: RouteRefusalError }, _optional = {}): void {
  const { status, body } = error.response;
  const { error: message, details } = body as { error: string; details?: Record<string, string> };
  respondToApiError({ res, code: status === 404 ? "NOT_FOUND" : "FORBIDDEN", message }, details === undefined ? {} : { details });
}

/** An unexpected failure: shared redacted diagnostics without replacing the canonical analytics wire contract.
 * @complexity O(1) plus the shared failure report. */
function writeAnalyticsFailure({ res, error }: { res: Response; error: unknown }, _optional = {}): void {
  const { req } = res;
  const failure = adminFailureResponse({ error, tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter }, {
    operation: "analytics/recent-hits", method: req.method, route: req.route.path,
    discloseDetails: !!res.locals.principal,
  });
  res.status(failure.status).json({ error: {
    code: failure.body.code, message: failure.body.error,
    ...(res.locals.principal ? { details: { errorId: failure.body.errorId, ...failure.body.details } } : {}),
    ...(typeof res.locals.requestId === "string" ? { requestId: res.locals.requestId } : {}),
  } });
}

export function registerAdminAnalyticsRecentHitsRoute({ app, deps }: { app: Express; deps: AdminAnalyticsRecentHitsDeps }, _optional: Record<string, never> = {}): void {
  mountAdminJsonRoute(
    // `authorize` is read per request so a later reassignment of `deps.authorize` is honoured.
    { app, spec: analyticsRecentHitsRoute, deps: { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params), analyticsSink: deps.analyticsSink } },
    { authorization: "direct", refusalWriter: writeAnalyticsRefusal, failureWriter: writeAnalyticsFailure },
  );
}
