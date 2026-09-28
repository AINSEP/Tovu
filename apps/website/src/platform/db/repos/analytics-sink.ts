import type { Insertable, Selectable } from "kysely";

import type { AnalyticsSinkCapabilities, AnalyticsSinkPort } from "#src/features/analytics/ports";
import type { DeviceClass, HitKind, NormalizedHit } from "#src/features/analytics/types";
import type { ContentKernel } from "../content-kernel.js";
import type { AnalyticsEventsTable } from "../content-database.generated.js";

/**
 * @file ADR-046 Phase 1 (final capability slice) — THE durable adapter for `AnalyticsSinkPort`: one
 * Kysely query body for every dialect (storage plan §4, ADR-066); ADR-006 rule-of-two "second
 * adapter" half, `analytics/repo.memory.ts`'s `LocalBufferSink` is the first.
 * `sqlite/analytics-sink.sqlite.ts` is the thin subclass the composition root builds from the
 * content db handle. This durably persists the raw ingest buffer that `LocalBufferSink` only held
 * in a process-local array — the exact gap ADR-046's debate/capability-inventory flagged
 * (`LocalBufferSink.capabilities().durable` misreporting `true`).
 *
 * Scope: this is ONLY the `AnalyticsSinkPort` WRITE seam (raw hit buffer). `AnalyticsRepoPort`
 * (the aggregate/time-series/rollup/goals storage surface) has NO adapter at all yet — per
 * `analytics/INFO.md`'s own "Future direction" section, that Tier-3 surface is a separate,
 * later, deliberately deferred build, not a durability gap in what's shipped today.
 *
 * `id` is a surrogate identity used purely to order `list()` newest-first — `NormalizedHit`
 * itself has no id field and none is added to it here.
 *
 * Architectural role:
 * Infrastructure adapter. `analytics` never imports this file — it depends only on
 * `AnalyticsSinkPort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

/** Same clamp discipline as `LocalBufferSink`'s (see that file for the resource-bounds rationale). */
function clampListLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_LIST_LIMIT);
}

function toNormalizedHit(row: Selectable<AnalyticsEventsTable>): NormalizedHit {
  return {
    workspaceId: row.workspace_id,
    occurredAt: row.occurred_at,
    kind: row.kind as HitKind,
    path: row.path,
    referrerHost: row.referrer_host,
    utm: {
      source: row.utm_source,
      medium: row.utm_medium,
      campaign: row.utm_campaign,
      term: row.utm_term,
      content: row.utm_content,
    },
    country: row.country,
    region: row.region,
    deviceClass: row.device_class as DeviceClass,
    browserFamily: row.browser_family,
    osFamily: row.os_family,
    visitorHash: row.visitor_hash,
    sessionId: row.session_id,
    eventName: row.event_name,
    eventProps: row.event_props_json ? (JSON.parse(row.event_props_json) as NormalizedHit["eventProps"]) : null,
  };
}

function toRow(hit: NormalizedHit): Insertable<AnalyticsEventsTable> {
  return {
    workspace_id: hit.workspaceId,
    occurred_at: hit.occurredAt,
    kind: hit.kind,
    path: hit.path,
    referrer_host: hit.referrerHost,
    utm_source: hit.utm.source,
    utm_medium: hit.utm.medium,
    utm_campaign: hit.utm.campaign,
    utm_term: hit.utm.term,
    utm_content: hit.utm.content,
    country: hit.country,
    region: hit.region,
    device_class: hit.deviceClass,
    browser_family: hit.browserFamily,
    os_family: hit.osFamily,
    visitor_hash: hit.visitorHash,
    session_id: hit.sessionId,
    event_name: hit.eventName,
    event_props_json: hit.eventProps ? JSON.stringify(hit.eventProps) : null,
  };
}

/** Durable `AnalyticsSinkPort`, reading back one workspace's hits. */
export class SqlBufferSink implements AnalyticsSinkPort {
  constructor(protected readonly deps: { kernel: ContentKernel; workspaceId: string }) {}

  capabilities(): AnalyticsSinkCapabilities {
    return { durable: true, batch: true };
  }

  async accept(hit: NormalizedHit): Promise<void> {
    await this.deps.kernel.run((db) => db.insertInto("analytics_events").values(toRow(hit)).execute());
  }

  async acceptBatch(hits: readonly NormalizedHit[]): Promise<void> {
    if (hits.length === 0) return;
    await this.deps.kernel.run((db) => db.insertInto("analytics_events").values(hits.map(toRow)).execute());
  }

  async list(input: { limit?: number } = {}): Promise<NormalizedHit[]> {
    const limit = clampListLimit(input.limit);
    const rows = await this.deps.kernel.run((db) =>
      db
        .selectFrom("analytics_events")
        .selectAll()
        .where("workspace_id", "=", this.deps.workspaceId)
        .orderBy("id", "desc")
        .limit(limit)
        .execute()
    );
    return rows.map(toNormalizedHit);
  }
}
