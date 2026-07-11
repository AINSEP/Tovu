import type { Express } from "express";

import type { LocalBufferSink } from "../../../../analytics/repo.memory";
import type { DeviceClass, HitKind, NormalizedHit } from "../../../../analytics/types";
import type { RouteDeps } from "../../../routes/types";

/**
 * @file Admin "recent hits" read route for the `analytics` library (ADR-035).
 *
 * Purpose:
 * Registers `GET /api/admin/v1/workspaces/:workspaceId/analytics/recent-hits` — an authenticated
 * read straight over the ingest-side `LocalBufferSink`'s in-memory buffer.
 *
 * IMPORTANT — this is deliberately NOT a dashboard. Only the ingest half of ADR-035 is built
 * (beacon → normalize → `LocalBufferSink`); there is no rollup/aggregation/time-series query layer
 * yet (that is Tier-3, explicitly deferred). So this route can only ever return a raw recent-hits
 * list — no totals, no breakdowns, no charts. Do not read more into the response shape than that.
 *
 * How it relates to the project:
 * - Mirrors `routes/admin/posts/list.ts`'s registrar shape and workspace-guard convention.
 * - Auth is NOT checked in this file — `server/app.ts` gates all of `/api/admin` behind
 *   `requireAdminSession` before any admin registrar runs (see `middleware/dev-auth.ts`), exactly
 *   like every other admin route in this codebase.
 * - `analyticsSink` is not yet a `RouteDeps` field (adding it is out of this task's scope to edit
 *   directly); this file's deps type only requires the subset of `RouteDeps` it actually uses
 *   (`Pick<RouteDeps, "workspaceId">`) plus the sink, so it composes cleanly once `RouteDeps` grows
 *   that field (see handoff notes for the exact `RouteDeps`/`app.ts` wiring text).
 */

/** Deps this route needs: the workspace scope from `RouteDeps`, plus the ingest sink to read. */
export type AdminAnalyticsRecentHitsDeps = Pick<RouteDeps, "workspaceId"> & {
  analyticsSink: LocalBufferSink;
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
 * `LocalBufferSink.list()` owns the actual clamping/default, this just guards against handing it a
 * non-numeric string.
 */
function parseLimitParam(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function registerAdminAnalyticsRecentHitsRoute(app: Express, deps: AdminAnalyticsRecentHitsDeps): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/analytics/recent-hits", (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const limit = parseLimitParam(req.query.limit);
    const hits = deps.analyticsSink.list({ limit }).map(toAdminAnalyticsHitResponse);
    res.json({ hits });
  });
}
