import { and, eq } from "drizzle-orm";

import { webhookDeliveries, webhookSubscriptions } from "../schema.js";
import type { ContentDb } from "./content-db.js";
import { findOneBy } from "./repo-helpers.js";

import type { DeliveryEnvelopeStore } from "../../features/webhooks/repo.memory.js";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../features/webhooks/ports.js";
import type {
  IntegrationId,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEventEnvelope,
  WebhookSubscriptionRecord,
  WebhookSubscriptionStatus,
  WebhookTopic,
} from "../../features/webhooks/types.js";

/**
 * @file Drizzle/SQLite adapters for the `integrations` repo ports (ADR-036 §2,
 * ADR-PIPE-015 Phase 2, GAP-05 + GAP-12).
 *
 * Purpose:
 * The other half of each ADR-006 rule-of-two, mirroring `repo.memory.ts`'s in-memory shape
 * exactly (same claim/mark lifecycle, same `topicMatches` semantics). `SqliteWebhookDeliveryRepo`
 * additionally implements `DeliveryEnvelopeStore` against the SAME `webhook_deliveries` row (its
 * `payload_json` column) rather than a separate table — GAP-05 (no durable storage) and GAP-12
 * (no envelope re-hydration path) are the same underlying gap, per the ADR's own Rationale.
 *
 * How it relates to the project:
 * - `enqueueDelivery` (`../../webhooks/delivery.ts`) calls `deliveryRepo.enqueue()` then
 *   `envelopeStore.save()` as two sequential calls (see that file) — both land on the same row
 *   here, `save()` updating the `payload_json` column `enqueue()` left `NULL`.
 * - The unique index on `(workspace_id, subscription_id, event_id)` (`schema.ts`) makes `enqueue`
 *   idempotent at the storage layer: a duplicate insert is caught and silently ignored rather
 *   than throwing, closing the race `delivery.ts`'s scan-based pre-check alone can't (two
 *   concurrent enqueues could both pass the scan before either commits).
 *
 * Relocated from `webhooks/repo.sqlite.ts` (2026-08-17, architecture SCC cut): this is the
 * concrete SQLite half of the ADR-006 rule-of-two, so it belongs in the outer persistence layer
 * alongside `vendor-credential-repo.sqlite.ts` and friends — the port stays domain-owned in
 * `webhooks/ports.ts`; only the adapter moved. All remaining imports from `webhooks/` below
 * are type-only, so this file cannot introduce a runtime edge back into `webhooks/`.
 */

function topicsToJson(topics: readonly WebhookTopic[]): string {
  return JSON.stringify(topics);
}

function topicsFromJson(json: string): WebhookTopic[] {
  return JSON.parse(json) as WebhookTopic[];
}

function toSubscriptionRecord(row: typeof webhookSubscriptions.$inferSelect): WebhookSubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerPrincipalId: row.ownerPrincipalId,
    label: row.label,
    targetUrl: row.targetUrl,
    topics: topicsFromJson(row.topicsJson),
    secretVersion: row.secretVersion,
    previousSecretVersion: row.previousSecretVersion,
    status: row.status as WebhookSubscriptionStatus,
    createdByPrincipalId: row.createdByPrincipalId,
    createdByPluginId: row.createdByPluginId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    disabledAt: row.disabledAt,
  };
}

function toSubscriptionRow(record: WebhookSubscriptionRecord): typeof webhookSubscriptions.$inferInsert {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    ownerPrincipalId: record.ownerPrincipalId,
    label: record.label,
    targetUrl: record.targetUrl,
    topicsJson: topicsToJson(record.topics),
    secretVersion: record.secretVersion,
    previousSecretVersion: record.previousSecretVersion,
    status: record.status,
    createdByPrincipalId: record.createdByPrincipalId,
    createdByPluginId: record.createdByPluginId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    disabledAt: record.disabledAt,
  };
}

/** True for a better-sqlite3 unique-constraint violation (any dialect-specific message shape). */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || err.message.includes("UNIQUE constraint failed");
}

/**
 * Does a subscription's topic set match a delivered event's topic? Mirrors
 * `repo.memory.ts`'s `topicMatches` exactly — kept as a private duplicate rather than a shared
 * import so each adapter stays independently readable (same rationale the settings adapters use).
 */
function topicMatches(subscribedTopics: readonly WebhookTopic[], topic: WebhookTopic): boolean {
  return subscribedTopics.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern === topic) return true;
    if (pattern.endsWith(".*")) {
      const entityPrefix = pattern.slice(0, -1);
      return topic.startsWith(entityPrefix);
    }
    return false;
  });
}

/** @overallScore 100 */
export class SqliteWebhookSubscriptionRepo implements WebhookSubscriptionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: WebhookSubscriptionRecord): Promise<void> {
    this.db.insert(webhookSubscriptions).values(toSubscriptionRow(record)).run();
  }

  async save(record: WebhookSubscriptionRecord): Promise<void> {
    const row = toSubscriptionRow(record);
    this.db
      .insert(webhookSubscriptions)
      .values(row)
      .onConflictDoUpdate({ target: webhookSubscriptions.id, set: row })
      .run();
  }

  async findById(required: {
    workspaceId: string;
    id: IntegrationId;
  }): Promise<WebhookSubscriptionRecord | null> {
    return findOneBy(
      this.db,
      webhookSubscriptions,
      [eq(webhookSubscriptions.workspaceId, required.workspaceId), eq(webhookSubscriptions.id, required.id)],
      toSubscriptionRecord
    );
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<WebhookSubscriptionRecord[]> {
    return this.db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.workspaceId, required.workspaceId))
      .all()
      .map(toSubscriptionRecord);
  }

  async findMatching(required: {
    workspaceId: string;
    topic: WebhookTopic;
  }): Promise<WebhookSubscriptionRecord[]> {
    return this.db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.workspaceId, required.workspaceId),
          eq(webhookSubscriptions.status, "active")
        )
      )
      .all()
      .map(toSubscriptionRecord)
      .filter((row) => topicMatches(row.topics, required.topic));
  }
}

function toDeliveryRecord(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    subscriptionId: row.subscriptionId,
    eventId: row.eventId,
    topic: row.topic as WebhookTopic,
    status: row.status as WebhookDeliveryStatus,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastResponseStatus: row.lastResponseStatus,
    lastError: row.lastError,
    signedWithVersion: row.signedWithVersion,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    deadAt: row.deadAt,
  };
}

/** @overallScore 100 */
export class SqliteWebhookDeliveryRepo implements WebhookDeliveryRepoPort, DeliveryEnvelopeStore {
  constructor(private readonly db: ContentDb) {}

  /** ADR-046 fold-in item 5 (GAP-05/GAP-12): when `envelope` is supplied, it's written in this
   * SAME `INSERT` — never left `NULL` for a later `.update()` to fill in — so a durable claimable
   * delivery row can never exist with a missing envelope. */
  async enqueue(record: WebhookDeliveryRecord, envelope?: WebhookEventEnvelope): Promise<void> {
    try {
      this.db
        .insert(webhookDeliveries)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          subscriptionId: record.subscriptionId,
          eventId: record.eventId,
          topic: record.topic,
          payloadJson: envelope ? JSON.stringify(envelope) : null,
          status: record.status,
          attempts: record.attempts,
          nextAttemptAt: record.nextAttemptAt,
          lastResponseStatus: record.lastResponseStatus,
          lastError: record.lastError,
          signedWithVersion: record.signedWithVersion,
          createdAt: record.createdAt,
          deliveredAt: record.deliveredAt,
          deadAt: record.deadAt,
        })
        .run();
    } catch (err) {
      // Unique (workspace_id, subscription_id, event_id) violation = already enqueued.
      // Idempotent by design (INV-P4) — silently no-op rather than throwing.
      if (isUniqueConstraintViolation(err)) return;
      throw err;
    }
  }

  async claimPending(required: {
    batchSize: number;
    nowIso: string;
  }): Promise<WebhookDeliveryRecord[]> {
    const due = this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.status, "pending"))
      .all()
      .filter((row) => row.nextAttemptAt <= required.nowIso)
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, required.batchSize);

    for (const row of due) {
      this.db
        .update(webhookDeliveries)
        .set({ status: "delivering", attempts: row.attempts + 1 })
        .where(eq(webhookDeliveries.id, row.id))
        .run();
    }

    return due.map((row) => toDeliveryRecord({ ...row, status: "delivering", attempts: row.attempts + 1 }));
  }

  async markDelivered(required: {
    workspaceId: string;
    id: IntegrationId;
    responseStatus: number;
    deliveredAtIso: string;
  }): Promise<void> {
    this.db
      .update(webhookDeliveries)
      .set({
        status: "delivered",
        lastResponseStatus: required.responseStatus,
        deliveredAt: required.deliveredAtIso,
        lastError: null,
      })
      .where(
        and(eq(webhookDeliveries.workspaceId, required.workspaceId), eq(webhookDeliveries.id, required.id))
      )
      .run();
  }

  async markFailed(required: {
    workspaceId: string;
    id: IntegrationId;
    error: string;
    responseStatus: number | null;
    nextStatus: Extract<WebhookDeliveryStatus, "failed" | "dead">;
    nextAttemptAt: string;
    deadAtIso?: string;
  }): Promise<void> {
    const existing = this.db
      .select()
      .from(webhookDeliveries)
      .where(
        and(eq(webhookDeliveries.workspaceId, required.workspaceId), eq(webhookDeliveries.id, required.id))
      )
      .all()[0];
    if (!existing) return;

    this.db
      .update(webhookDeliveries)
      .set({
        // "failed" re-enters "pending" immediately (WebhookDeliveryStatus doc); "dead" terminal.
        status: required.nextStatus === "dead" ? "dead" : "pending",
        lastError: required.error,
        lastResponseStatus: required.responseStatus,
        nextAttemptAt: required.nextAttemptAt,
        deadAt: required.nextStatus === "dead" ? required.deadAtIso ?? existing.deadAt : existing.deadAt,
      })
      .where(
        and(eq(webhookDeliveries.workspaceId, required.workspaceId), eq(webhookDeliveries.id, required.id))
      )
      .run();
  }

  async findById(required: {
    workspaceId: string;
    id: IntegrationId;
  }): Promise<WebhookDeliveryRecord | null> {
    return findOneBy(
      this.db,
      webhookDeliveries,
      [eq(webhookDeliveries.workspaceId, required.workspaceId), eq(webhookDeliveries.id, required.id)],
      toDeliveryRecord
    );
  }

  async listBySubscription(required: {
    workspaceId: string;
    subscriptionId: IntegrationId;
    limit: number;
  }): Promise<WebhookDeliveryRecord[]> {
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.workspaceId, required.workspaceId),
          eq(webhookDeliveries.subscriptionId, required.subscriptionId)
        )
      )
      .all()
      .slice(0, required.limit)
      .map(toDeliveryRecord);
  }

  // --- DeliveryEnvelopeStore (GAP-12: same row, `payload_json` column) ---

  async save(input: { deliveryId: IntegrationId; envelope: WebhookEventEnvelope }): Promise<void> {
    this.db
      .update(webhookDeliveries)
      .set({ payloadJson: JSON.stringify(input.envelope) })
      .where(eq(webhookDeliveries.id, input.deliveryId))
      .run();
  }

  async find(input: { deliveryId: IntegrationId }): Promise<WebhookEventEnvelope | null> {
    const rows = this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, input.deliveryId))
      .all();
    const row = rows[0];
    if (!row || !row.payloadJson) return null;
    return JSON.parse(row.payloadJson) as WebhookEventEnvelope;
  }
}
