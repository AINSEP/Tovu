import { desc, eq } from "drizzle-orm";

import { analyticsEvents } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";
import type { AnalyticsSinkCapabilities, AnalyticsSinkPort } from "#src/features/analytics/ports";
import type { DeviceClass, HitKind, NormalizedHit } from "#src/features/analytics/types";

/**
 * @file ADR-046 Phase 1 (final capability slice) — real SQLite adapter for `AnalyticsSinkPort`
 * (ADR-006 rule-of-two "second adapter" half; `analytics/repo.memory.ts`'s `LocalBufferSink` is
 * the first). This durably persists the raw ingest buffer that `LocalBufferSink` only held in a
 * process-local array — the exact gap ADR-046's debate/capability-inventory flagged
 * (`LocalBufferSink.capabilities().durable` misreporting `true`).
 *
 * Scope: this is ONLY the `AnalyticsSinkPort` WRITE seam (raw hit buffer). `AnalyticsRepoPort`
 * (the aggregate/time-series/rollup/goals storage surface) has NO adapter at all yet — per
 * `analytics/INFO.md`'s own "Future direction" section, that Tier-3 surface is a separate,
 * later, deliberately deferred build, not a durability gap in what's shipped today.
 *
 * `id` is a surrogate autoincrement used purely to order `list()` newest-first — `NormalizedHit`
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

function toNormalizedHit(row: typeof analyticsEvents.$inferSelect): NormalizedHit {
  return {
    workspaceId: row.workspaceId,
    occurredAt: row.occurredAt,
    kind: row.kind as HitKind,
    path: row.path,
    referrerHost: row.referrerHost,
    utm: {
      source: row.utmSource,
      medium: row.utmMedium,
      campaign: row.utmCampaign,
      term: row.utmTerm,
      content: row.utmContent,
    },
    country: row.country,
    region: row.region,
    deviceClass: row.deviceClass as DeviceClass,
    browserFamily: row.browserFamily,
    osFamily: row.osFamily,
    visitorHash: row.visitorHash,
    sessionId: row.sessionId,
    eventName: row.eventName,
    eventProps: row.eventPropsJson ? (JSON.parse(row.eventPropsJson) as NormalizedHit["eventProps"]) : null,
  };
}

function toRow(hit: NormalizedHit) {
  return {
    workspaceId: hit.workspaceId,
    occurredAt: hit.occurredAt,
    kind: hit.kind,
    path: hit.path,
    referrerHost: hit.referrerHost,
    utmSource: hit.utm.source,
    utmMedium: hit.utm.medium,
    utmCampaign: hit.utm.campaign,
    utmTerm: hit.utm.term,
    utmContent: hit.utm.content,
    country: hit.country,
    region: hit.region,
    deviceClass: hit.deviceClass,
    browserFamily: hit.browserFamily,
    osFamily: hit.osFamily,
    visitorHash: hit.visitorHash,
    sessionId: hit.sessionId,
    eventName: hit.eventName,
    eventPropsJson: hit.eventProps ? JSON.stringify(hit.eventProps) : null,
  };
}

/**
 * Durable `AnalyticsSinkPort`. `list()` and `capabilities()` are synchronous (better-sqlite3 is
 * synchronous under the hood; the interface only requires `accept`/`acceptBatch` to be async).
 */
export class SqliteBufferSink implements AnalyticsSinkPort {
  constructor(private readonly deps: { db: ContentDb; workspaceId: string }) {}

  capabilities(): AnalyticsSinkCapabilities {
    return { durable: true, batch: true };
  }

  async accept(hit: NormalizedHit): Promise<void> {
    this.deps.db.insert(analyticsEvents).values(toRow(hit)).run();
  }

  async acceptBatch(hits: readonly NormalizedHit[]): Promise<void> {
    if (hits.length === 0) return;
    this.deps.db.insert(analyticsEvents).values(hits.map(toRow)).run();
  }

  list(input: { limit?: number } = {}): NormalizedHit[] {
    const limit = clampListLimit(input.limit);
    const rows = this.deps.db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.workspaceId, this.deps.workspaceId))
      .orderBy(desc(analyticsEvents.id))
      .limit(limit)
      .all();
    return rows.map(toNormalizedHit);
  }
}
