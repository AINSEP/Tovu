import type { Insertable, Selectable } from "kysely";

import type { ContentKernel } from "../content-kernel.js";
import type { WebhookDeliveriesTable, WebhookSubscriptionsTable } from "../content-database.generated.js";

import type { DeliveryEnvelopeStore } from "#src/features/webhooks/repo.memory";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "#src/features/webhooks/ports";
import type {
  IntegrationId,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEventEnvelope,
  WebhookSubscriptionRecord,
  WebhookSubscriptionStatus,
  WebhookTopic,
} from "#src/features/webhooks/types";

/**
 * @file THE adapters for the `integrations` webhook repo ports (ADR-036 §2, ADR-PIPE-015 Phase 2,
 * GAP-05 + GAP-12): one Kysely query body each for every dialect (storage plan §4, ADR-066).
 * `sqlite/webhook-repo.sqlite.ts` holds the thin subclasses built from the content db handle.
 *
 * Purpose:
 * The other half of each ADR-006 rule-of-two, mirroring `repo.memory.ts`'s in-memory shape
 * exactly (same claim/mark lifecycle, same `topicMatches` semantics). `SqlWebhookDeliveryRepo`
 * additionally implements `DeliveryEnvelopeStore` against the SAME `webhook_deliveries` row (its
 * `payload_json` column) rather than a separate table — GAP-05 (no durable storage) and GAP-12
 * (no envelope re-hydration path) are the same underlying gap, per the ADR's own Rationale.
 *
 * How it relates to the project:
 * - `enqueueDelivery` (`../../webhooks/delivery.ts`) calls `deliveryRepo.enqueue()` then
 *   `envelopeStore.save()` as two sequential calls (see that file) — both land on the same row
 *   here, `save()` updating the `payload_json` column `enqueue()` left `NULL`.
 * - The unique index on `(workspace_id, subscription_id, event_id)` (`schema.sqlite.ts`) makes `enqueue`
 *   idempotent at the storage layer: a duplicate insert is `ON CONFLICT DO NOTHING` (any unique
 *   index, the primary key included — not a caught error, which would abort an enclosing
 *   Postgres transaction), closing the race `delivery.ts`'s scan-based pre-check alone can't (two
 *   concurrent enqueues could both pass the scan before either commits).
 *
 * `claimPending` selects and marks rows `delivering` in one kernel transaction under
 * `lockKey("webhook_deliveries:claim")`, so two claimers never take the same row on any dialect.
 */

function topicsToJson(topics: readonly WebhookTopic[]): string {
  return JSON.stringify(topics);
}

function topicsFromJson(json: string): WebhookTopic[] {
  return JSON.parse(json) as WebhookTopic[];
}

function toSubscriptionRecord(row: Selectable<WebhookSubscriptionsTable>): WebhookSubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerPrincipalId: row.owner_principal_id,
    label: row.label,
    targetUrl: row.target_url,
    topics: topicsFromJson(row.topics_json),
    secretVersion: row.secret_version,
    previousSecretVersion: row.previous_secret_version,
    status: row.status as WebhookSubscriptionStatus,
    createdByPrincipalId: row.created_by_principal_id,
    createdByPluginId: row.created_by_plugin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
  };
}

function toSubscriptionRow(record: WebhookSubscriptionRecord): Insertable<WebhookSubscriptionsTable> {
  return {
    id: record.id,
    workspace_id: record.workspaceId,
    owner_principal_id: record.ownerPrincipalId,
    label: record.label,
    target_url: record.targetUrl,
    topics_json: topicsToJson(record.topics),
    secret_version: record.secretVersion,
    previous_secret_version: record.previousSecretVersion,
    status: record.status,
    created_by_principal_id: record.createdByPrincipalId,
    created_by_plugin_id: record.createdByPluginId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    disabled_at: record.disabledAt,
  };
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

export class SqlWebhookSubscriptionRepo implements WebhookSubscriptionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async insert(record: WebhookSubscriptionRecord): Promise<void> {
    await this.kernel.run((db) => db.insertInto("webhook_subscriptions").values(toSubscriptionRow(record)).execute());
  }

  async save(record: WebhookSubscriptionRecord): Promise<void> {
    const row = toSubscriptionRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("webhook_subscriptions")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(row))
        .execute()
    );
  }

  async findById(required: {
    workspaceId: string;
    id: IntegrationId;
  }): Promise<WebhookSubscriptionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("webhook_subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toSubscriptionRecord(row) : null;
  }

  async listByWorkspace(required: { workspaceId: string }): Promise<WebhookSubscriptionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("webhook_subscriptions").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toSubscriptionRecord);
  }

  async findMatching(required: {
    workspaceId: string;
    topic: WebhookTopic;
  }): Promise<WebhookSubscriptionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("webhook_subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("status", "=", "active")
        .execute()
    );
    return rows.map(toSubscriptionRecord).filter((row) => topicMatches(row.topics, required.topic));
  }
}

function toDeliveryRecord(row: Selectable<WebhookDeliveriesTable>): WebhookDeliveryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    subscriptionId: row.subscription_id,
    eventId: row.event_id,
    topic: row.topic as WebhookTopic,
    status: row.status as WebhookDeliveryStatus,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastResponseStatus: row.last_response_status,
    lastError: row.last_error,
    signedWithVersion: row.signed_with_version,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    deadAt: row.dead_at,
  };
}

export class SqlWebhookDeliveryRepo implements WebhookDeliveryRepoPort, DeliveryEnvelopeStore {
  constructor(protected readonly kernel: ContentKernel) {}

  /** ADR-046 fold-in item 5 (GAP-05/GAP-12): when `envelope` is supplied, it's written in this
   * SAME `INSERT` — never left `NULL` for a later `.update()` to fill in — so a durable claimable
   * delivery row can never exist with a missing envelope. A row that collides with any unique
   * index (`(workspace_id, subscription_id, event_id)` or the id) is already enqueued: idempotent
   * by design (INV-P4), a silent no-op. */
  async enqueue(record: WebhookDeliveryRecord, envelope?: WebhookEventEnvelope): Promise<void> {
    await this.kernel.run((db) =>
      db
        .insertInto("webhook_deliveries")
        .values({
          id: record.id,
          workspace_id: record.workspaceId,
          subscription_id: record.subscriptionId,
          event_id: record.eventId,
          topic: record.topic,
          payload_json: envelope ? JSON.stringify(envelope) : null,
          status: record.status,
          attempts: record.attempts,
          next_attempt_at: record.nextAttemptAt,
          last_response_status: record.lastResponseStatus,
          last_error: record.lastError,
          signed_with_version: record.signedWithVersion,
          created_at: record.createdAt,
          delivered_at: record.deliveredAt,
          dead_at: record.deadAt,
        })
        .onConflict((oc) => oc.doNothing())
        .execute()
    );
  }

  async claimPending(required: {
    batchSize: number;
    nowIso: string;
  }): Promise<WebhookDeliveryRecord[]> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey("webhook_deliveries:claim");
      const due = await this.kernel.run((db) =>
        db
          .selectFrom("webhook_deliveries")
          .selectAll()
          .where("status", "=", "pending")
          .where("next_attempt_at", "<=", required.nowIso)
          .orderBy("next_attempt_at", "asc")
          .limit(required.batchSize)
          .execute()
      );
      for (const row of due) {
        await this.kernel.run((db) =>
          db
            .updateTable("webhook_deliveries")
            .set({ status: "delivering", attempts: row.attempts + 1 })
            .where("id", "=", row.id)
            .execute()
        );
      }
      return due.map((row) => toDeliveryRecord({ ...row, status: "delivering", attempts: row.attempts + 1 }));
    });
  }

  async markDelivered(required: {
    workspaceId: string;
    id: IntegrationId;
    responseStatus: number;
    deliveredAtIso: string;
  }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("webhook_deliveries")
        .set({
          status: "delivered",
          last_response_status: required.responseStatus,
          delivered_at: required.deliveredAtIso,
          last_error: null,
        })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }

  /** One UPDATE: `dead_at` is only written when the row goes dead with a stamp; otherwise it keeps
   *  its stored value. A missing row is a no-op. */
  async markFailed(required: {
    workspaceId: string;
    id: IntegrationId;
    error: string;
    responseStatus: number | null;
    nextStatus: Extract<WebhookDeliveryStatus, "failed" | "dead">;
    nextAttemptAt: string;
    deadAtIso?: string;
  }): Promise<void> {
    const dead = required.nextStatus === "dead";
    await this.kernel.run((db) =>
      db
        .updateTable("webhook_deliveries")
        .set({
          // "failed" re-enters "pending" immediately (WebhookDeliveryStatus doc); "dead" terminal.
          status: dead ? "dead" : "pending",
          last_error: required.error,
          last_response_status: required.responseStatus,
          next_attempt_at: required.nextAttemptAt,
          ...(dead && required.deadAtIso !== undefined ? { dead_at: required.deadAtIso } : {}),
        })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }

  async findById(required: {
    workspaceId: string;
    id: IntegrationId;
  }): Promise<WebhookDeliveryRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("webhook_deliveries")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toDeliveryRecord(row) : null;
  }

  async listBySubscription(required: {
    workspaceId: string;
    subscriptionId: IntegrationId;
    limit: number;
  }): Promise<WebhookDeliveryRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("webhook_deliveries")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("subscription_id", "=", required.subscriptionId)
        .limit(required.limit)
        .execute()
    );
    return rows.map(toDeliveryRecord);
  }

  // --- DeliveryEnvelopeStore (GAP-12: same row, `payload_json` column) ---

  async save(input: { deliveryId: IntegrationId; envelope: WebhookEventEnvelope }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("webhook_deliveries")
        .set({ payload_json: JSON.stringify(input.envelope) })
        .where("id", "=", input.deliveryId)
        .execute()
    );
  }

  async find(input: { deliveryId: IntegrationId }): Promise<WebhookEventEnvelope | null> {
    const row = await this.kernel.run((db) =>
      db.selectFrom("webhook_deliveries").select("payload_json").where("id", "=", input.deliveryId).limit(1).executeTakeFirst()
    );
    if (!row || !row.payload_json) return null;
    return JSON.parse(row.payload_json) as WebhookEventEnvelope;
  }
}

/** The webhook subscription repo on `kernel`'s database, whichever dialect. */
export function webhookSubscriptionRepoFor(kernel: ContentKernel): WebhookSubscriptionRepoPort {
  return new SqlWebhookSubscriptionRepo(kernel);
}

/** The webhook delivery repo (and envelope store) on `kernel`'s database, whichever dialect. */
export function webhookDeliveryRepoFor(kernel: ContentKernel): SqlWebhookDeliveryRepo {
  return new SqlWebhookDeliveryRepo(kernel);
}
