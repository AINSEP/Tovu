import type { Express } from "express";

import type { AnalyticsSinkPort } from "../../../../analytics/ports";
import type { DeviceClass, HitKind, NormalizedHit } from "../../../../analytics/types";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../../routes/types";

/**
 * @file Admin "recent hits" read route for the `analytics` library (ADR-035, ADR-PIPE-014).
 *
 * Purpose:
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` — an authenticated,
 * `analytics.read`-gated read straight over the ingest-side `AnalyticsSinkPort`'s raw hit buffer
 * (`SqliteBufferSink` in real composition, `LocalBufferSink` in hermetic composition).
 *
 * IMPORTANT — this is deliberately NOT a dashboard. Only the ingest half of ADR-035 is built
 * (beacon → normalize → `LocalBufferSink`); there is no rollup/aggregation/time-series query layer
 * yet (that is Tier-3, explicitly deferred). So this route can only ever return a raw recent-hits
 * list — no totals, no breakdowns, no charts. Do not read more into the response shape than that.
 *
 * How it relates to the project:
 * - Mirrors `routes/admin/posts/list.ts`'s registrar shape and workspace-guard convention.
 * - `server/app.ts` gates all of `/api/admin` behind `requireAdminSession` before any admin
 *   registrar runs (see `middleware/dev-auth.ts`), same as every other admin route — but that only
 *   proves *authentication*. FEAT-014/ADR-PIPE-014 closes the remaining *authorization* gap: this
 *   route previously had zero per-action `authorize()` call, unlike every sibling admin route.
 *   The principal-resolution → `authorize()` → 403-on-denial → proceed block below is byte-for-byte
 *   the same shape used by `settings/get-effective.ts` and `integrations/list.ts` (workspace-id
 *   404 check first, then authorize) — see ADR-PIPE-014 Decision §1/Enforcement.
 */

/** Deps this route needs: the workspace scope + authorize seam from `RouteDeps`, plus the ingest sink to read. */
export type AdminAnalyticsRecentHitsDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & {
  analyticsSink: AnalyticsSinkPort;
};

/** The bounded, honest subset of a `NormalizedHit` this screen shows — raw ingest fields only. */
export interface AdminAnalyticsHitResponse {
  occurredAt: string;
  kind: HitKind;
  path: string;
  referrerHost: string | null;
  deviceClass: DeviceClass;
  browserFamily: string | null;
  eventName: string | null;
}

function toAdminAnalyticsHitResponse(hit: NormalizedHit): AdminAnalyticsHitResponse {
  return {
    occurredAt: hit.occurredAt,
    kind: hit.kind,
    path: hit.path,
    referrerHost: hit.referrerHost,
    deviceClass: hit.deviceClass,
    browserFamily: hit.browserFamily,
    eventName: hit.eventName,
  };
}

/**
 * Parses the `?limit=` query param into a finite number, or `undefined` when absent/unparsable —
 * the sink's `list()` owns the actual clamping/default, this just guards against handing it a
 * non-numeric string.
 */
function parseLimitParam(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function registerAdminAnalyticsRecentHitsRoute(app: Express, deps: AdminAnalyticsRecentHitsDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/analytics/recent-hits", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const principal = getAuthedPrincipal(res);
    const authResult = await deps.authorize({
      principalId: principal.id,
      permission: "analytics.read",
      workspaceId: deps.workspaceId,
      entityType: "analytics-hit",
    });
    if (!authResult.allowed) {
      res.status(403).json({
        error: `principal '${principal.id}' is not authorized for 'analytics.read' (${authResult.reason})`,
        code: "FORBIDDEN",
        details: { permission: "analytics.read", reason: authResult.reason },
      });
      return;
    }

    const limit = parseLimitParam(req.query.limit);
    const hits = deps.analyticsSink.list({ limit }).map(toAdminAnalyticsHitResponse);
    res.json({ hits });
  });
}
