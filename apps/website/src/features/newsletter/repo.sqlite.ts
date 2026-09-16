/**
 * @file SQLite/Drizzle adapter for all 6 Newsletter repo ports (ADR-PIPE-011 §7/§8, File Map).
 *
 * `SqliteNewsletterCampaignRepo` is Drizzle-backed against the bespoke `newsletter_campaigns`/
 * `newsletter_campaign_revisions` table pair (`src/platform/db/schema.ts`) — mirrors
 * `SqliteSettingsRepo`'s shape exactly, including its `transaction()` method (manual `BEGIN
 * IMMEDIATE`/`COMMIT`/`ROLLBACK` against the raw better-sqlite3 handle, since Drizzle's own
 * `db.transaction((tx) => ...)` wrapper requires a synchronous callback and this chokepoint's
 * callback does `await`ed repo calls).
 *
 * The other 5 repos (`SqliteNewsletterListRepo`/`SqliteNewsletterSubscriptionRepo`/
 * `SqliteNewsletterAudienceSnapshotRepo`/`SqliteNewsletterSendRepo`/
 * `SqliteNewsletterConfirmationTokenRepo`) are raw-SQL accessors scoped to the plugin namespace
 * (ADR-023 §8) against the 5 `p_newsletter__*` tables `declareDataModule()` creates
 * (`data-module-manifest.ts`) — those tables have NO Drizzle schema definition (by design, per
 * ADR-PIPE-011 Decision §2/§3), so these adapters go through `this.db.$client` directly, matching
 * `src/features/plugins/store/store-plugin.ts`'s raw-SQL precedent.
 */
import type Database from "better-sqlite3";
import { asc, eq, gt, and, sql } from "drizzle-orm";

import { newsletterCampaignRevisions, newsletterCampaigns } from "../../platform/db/schema.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import { NEWSLETTER_TABLE_NAMES } from "./data-module-manifest.js";
import type {
  CampaignOutcomeCounter,
  NewsletterAudienceSnapshotRepoPort,
  NewsletterCampaignRepoPort,
  NewsletterConfirmationTokenRepoPort,
  NewsletterListRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
} from "./ports.js";
import type {
  AudienceSnapshotRow,
  CampaignCounters,
  CampaignRecord,
  CampaignRevision,
  ConfirmationTokenRecord,
  NewsletterListRow,
  SendRow,
  SubscriptionRow,
} from "./types.js";

const DEFAULT_LIST_LIMIT = 100;

/** JSON path of each counter `incrementCounter` may bump — a fixed map, never built from input. */
const COUNTER_JSON_PATH: Record<CampaignOutcomeCounter, string> = { delivered: "$.delivered", failed: "$.failed" };

/** Narrow accessor for the raw better-sqlite3 handle underneath a Drizzle `ContentDb` (mirrors `SqliteSettingsRepo`). */
function rawClient(db: ContentDb): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

/* ------------------------------------------------------------------------------------------------
 * Campaign pair — Drizzle-backed (bespoke table pair, not dataModule)
 * ------------------------------------------------------------------------------------------------ */

type CampaignDbRow = typeof newsletterCampaigns.$inferSelect;
type RevisionDbRow = typeof newsletterCampaignRevisions.$inferSelect;

function toCampaignRecord(row: CampaignDbRow): CampaignRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status as CampaignRecord["status"],
    subject: row.subject,
    preheader: row.preheader,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyTo: row.replyTo,
    listId: row.listId,
    scheduledAt: row.scheduledAt,
    sendStartedAt: row.sendStartedAt,
    audienceSnapshotId: row.audienceSnapshotId,
    counters: JSON.parse(row.countersJson) as CampaignCounters,
    version: row.version,
    createdByPrincipal: row.createdByPrincipal,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromCampaignRecord(c: CampaignRecord): CampaignDbRow {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    status: c.status,
    subject: c.subject,
    preheader: c.preheader,
    fromName: c.fromName,
    fromEmail: c.fromEmail,
    replyTo: c.replyTo,
    listId: c.listId,
    scheduledAt: c.scheduledAt,
    sendStartedAt: c.sendStartedAt,
    audienceSnapshotId: c.audienceSnapshotId,
    countersJson: JSON.stringify(c.counters),
    version: c.version,
    createdByPrincipal: c.createdByPrincipal,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toCampaignRevision(row: RevisionDbRow): CampaignRevision {
  return {
    campaignId: row.campaignId,
    workspaceId: row.workspaceId,
    seq: row.seq,
    state: JSON.parse(row.stateJson) as CampaignRecord,
    actorId: row.actorId,
    recordedAt: row.recordedAt,
  };
}

export class SqliteNewsletterCampaignRepo implements NewsletterCampaignRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CampaignRecord | null> {
    return findOneBy(
      this.db,
      newsletterCampaigns,
      [eq(newsletterCampaigns.workspaceId, required.workspaceId), eq(newsletterCampaigns.id, required.id)],
      toCampaignRecord
    );
  }

  async list(required: { workspaceId: string; afterId?: string; limit?: number }): Promise<CampaignRecord[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    const conditions = required.afterId
      ? and(eq(newsletterCampaigns.workspaceId, required.workspaceId), gt(newsletterCampaigns.id, required.afterId))
      : eq(newsletterCampaigns.workspaceId, required.workspaceId);
    const rows = this.db
      .select()
      .from(newsletterCampaigns)
      .where(conditions)
      .orderBy(asc(newsletterCampaigns.id))
      .limit(limit)
      .all();
    return rows.map(toCampaignRecord);
  }

  async saveCampaignRow(campaign: CampaignRecord): Promise<void> {
    const values = fromCampaignRecord(campaign);
    // Counters are insert-only here; `incrementCounter` owns them afterwards (see `ports.ts`).
    const { countersJson: _insertOnlyCounters, ...updatable } = values;
    this.db
      .insert(newsletterCampaigns)
      .values(values)
      .onConflictDoUpdate({ target: newsletterCampaigns.id, set: updatable })
      .run();
  }

  async appendRevision(revision: CampaignRevision): Promise<void> {
    this.db
      .insert(newsletterCampaignRevisions)
      .values({
        campaignId: revision.campaignId,
        workspaceId: revision.workspaceId,
        stateJson: JSON.stringify(revision.state),
        actorId: revision.actorId,
        recordedAt: revision.recordedAt,
      })
      .run();
  }

  async listRevisions(required: { workspaceId: string; campaignId: string }): Promise<CampaignRevision[]> {
    const rows = this.db
      .select()
      .from(newsletterCampaignRevisions)
      .where(
        and(
          eq(newsletterCampaignRevisions.workspaceId, required.workspaceId),
          eq(newsletterCampaignRevisions.campaignId, required.campaignId)
        )
      )
      .orderBy(asc(newsletterCampaignRevisions.seq))
      .all();
    return rows.map(toCampaignRevision);
  }

  /** Manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` — mirrors `SqliteSettingsRepo.transaction` exactly. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = rawClient(this.db);
    client.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      client.exec("COMMIT");
      return result;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * One UPDATE statement, so reading the old count and writing the new one cannot be split by any other statement on any
   * connection (see `ports.ts`).
   *
   * @complexity O(1) (primary-key update).
   */
  async incrementCounter(required: { workspaceId: string; id: string; counter: CampaignOutcomeCounter; updatedAt: string }): Promise<void> {
    const path = COUNTER_JSON_PATH[required.counter];
    this.db
      .update(newsletterCampaigns)
      .set({
        countersJson: sql`json_set(${newsletterCampaigns.countersJson}, ${path}, coalesce(json_extract(${newsletterCampaigns.countersJson}, ${path}), 0) + 1)`,
        updatedAt: required.updatedAt,
      })
      .where(and(eq(newsletterCampaigns.workspaceId, required.workspaceId), eq(newsletterCampaigns.id, required.id)))
      .run();
  }
}

/* ------------------------------------------------------------------------------------------------
 * The 5 p_newsletter__* tables — raw SQL, declareDataModule()-created (ADR-023 §7/§8)
 * ------------------------------------------------------------------------------------------------ */

interface ListDbRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  is_default: number;
  status: string;
  created_at: string;
  updated_at: string;
}
const toListRow = (r: ListDbRow): NewsletterListRow => ({
  id: r.id,
  workspaceId: r.workspace_id,
  name: r.name,
  slug: r.slug,
  isDefault: r.is_default === 1,
  status: r.status as NewsletterListRow["status"],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteNewsletterListRepo implements NewsletterListRepoPort {
  private readonly table = NEWSLETTER_TABLE_NAMES.lists;
  constructor(private readonly db: ContentDb) {}
  private get client(): Database.Database {
    return rawClient(this.db);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<NewsletterListRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as ListDbRow | undefined;
    return row ? toListRow(row) : null;
  }

  async findDefault(required: { workspaceId: string }): Promise<NewsletterListRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND is_default = 1`)
      .get(required.workspaceId) as ListDbRow | undefined;
    return row ? toListRow(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<NewsletterListRow[]> {
    const rows = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ?`)
      .all(required.workspaceId) as ListDbRow[];
    return rows.map(toListRow);
  }

  async save(row: NewsletterListRow): Promise<void> {
    this.client
      .prepare(
        `INSERT INTO "${this.table}" (id, workspace_id, name, slug, is_default, status, created_at, updated_at)
         VALUES (@id, @workspaceId, @name, @slug, @isDefault, @status, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, slug = excluded.slug, is_default = excluded.is_default,
           status = excluded.status, updated_at = excluded.updated_at`
      )
      .run({
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        slug: row.slug,
        isDefault: row.isDefault ? 1 : 0,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
  }
}

interface SubscriptionDbRow {
  id: string;
  workspace_id: string;
  list_id: string;
  subscriber_id: string;
  status: string;
  source: string;
  consent_revision_id_at_subscribe: string | null;
  subscribed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}
const toSubscriptionRow = (r: SubscriptionDbRow): SubscriptionRow => ({
  id: r.id,
  workspaceId: r.workspace_id,
  listId: r.list_id,
  subscriberId: r.subscriber_id,
  status: r.status as SubscriptionRow["status"],
  source: r.source as SubscriptionRow["source"],
  consentRevisionIdAtSubscribe: r.consent_revision_id_at_subscribe,
  subscribedAt: r.subscribed_at,
  unsubscribedAt: r.unsubscribed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteNewsletterSubscriptionRepo implements NewsletterSubscriptionRepoPort {
  private readonly table = NEWSLETTER_TABLE_NAMES.subscriptions;
  constructor(private readonly db: ContentDb) {}
  private get client(): Database.Database {
    return rawClient(this.db);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<SubscriptionRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as SubscriptionDbRow | undefined;
    return row ? toSubscriptionRow(row) : null;
  }

  async findBySubscriberAndList(required: {
    workspaceId: string;
    listId: string;
    subscriberId: string;
  }): Promise<SubscriptionRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND list_id = ? AND subscriber_id = ?`)
      .get(required.workspaceId, required.listId, required.subscriberId) as SubscriptionDbRow | undefined;
    return row ? toSubscriptionRow(row) : null;
  }

  async list(required: {
    workspaceId: string;
    listId: string;
    afterId?: string;
    limit?: number;
  }): Promise<SubscriptionRow[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    const rows = required.afterId
      ? (this.client
          .prepare(
            `SELECT * FROM "${this.table}" WHERE workspace_id = ? AND list_id = ? AND id > ? ORDER BY id LIMIT ?`
          )
          .all(required.workspaceId, required.listId, required.afterId, limit) as SubscriptionDbRow[])
      : (this.client
          .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND list_id = ? ORDER BY id LIMIT ?`)
          .all(required.workspaceId, required.listId, limit) as SubscriptionDbRow[]);
    return rows.map(toSubscriptionRow);
  }

  async listSubscribed(required: { workspaceId: string; listId: string }): Promise<SubscriptionRow[]> {
    const rows = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND list_id = ? AND status = 'subscribed'`)
      .all(required.workspaceId, required.listId) as SubscriptionDbRow[];
    return rows.map(toSubscriptionRow);
  }

  async save(row: SubscriptionRow): Promise<void> {
    this.client
      .prepare(
        `INSERT INTO "${this.table}"
           (id, workspace_id, list_id, subscriber_id, status, source, consent_revision_id_at_subscribe,
            subscribed_at, unsubscribed_at, created_at, updated_at)
         VALUES (@id, @workspaceId, @listId, @subscriberId, @status, @source, @consentRevisionIdAtSubscribe,
                 @subscribedAt, @unsubscribedAt, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status, consent_revision_id_at_subscribe = excluded.consent_revision_id_at_subscribe,
           subscribed_at = excluded.subscribed_at, unsubscribed_at = excluded.unsubscribed_at,
           updated_at = excluded.updated_at`
      )
      .run({
        id: row.id,
        workspaceId: row.workspaceId,
        listId: row.listId,
        subscriberId: row.subscriberId,
        status: row.status,
        source: row.source,
        consentRevisionIdAtSubscribe: row.consentRevisionIdAtSubscribe,
        subscribedAt: row.subscribedAt,
        unsubscribedAt: row.unsubscribedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
  }

  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    this.client
      .prepare(`DELETE FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .run(required.workspaceId, required.id);
  }
}

interface AudienceSnapshotDbRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  list_id: string;
  recipient_count: number;
  created_at: string;
}
const toAudienceSnapshotRow = (r: AudienceSnapshotDbRow): AudienceSnapshotRow => ({
  id: r.id,
  workspaceId: r.workspace_id,
  campaignId: r.campaign_id,
  listId: r.list_id,
  recipientCount: r.recipient_count,
  createdAt: r.created_at,
});

export class SqliteNewsletterAudienceSnapshotRepo implements NewsletterAudienceSnapshotRepoPort {
  private readonly table = NEWSLETTER_TABLE_NAMES.audienceSnapshots;
  constructor(private readonly db: ContentDb) {}
  private get client(): Database.Database {
    return rawClient(this.db);
  }

  async findByCampaignId(required: { workspaceId: string; campaignId: string }): Promise<AudienceSnapshotRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND campaign_id = ?`)
      .get(required.workspaceId, required.campaignId) as AudienceSnapshotDbRow | undefined;
    return row ? toAudienceSnapshotRow(row) : null;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<AudienceSnapshotRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as AudienceSnapshotDbRow | undefined;
    return row ? toAudienceSnapshotRow(row) : null;
  }

  /** INV-06: immutable after creation — plain INSERT (no upsert), a PK collision surfaces as a thrown error. */
  async save(row: AudienceSnapshotRow): Promise<void> {
    this.client
      .prepare(
        `INSERT INTO "${this.table}" (id, workspace_id, campaign_id, list_id, recipient_count, created_at)
         VALUES (@id, @workspaceId, @campaignId, @listId, @recipientCount, @createdAt)`
      )
      .run({
        id: row.id,
        workspaceId: row.workspaceId,
        campaignId: row.campaignId,
        listId: row.listId,
        recipientCount: row.recipientCount,
        createdAt: row.createdAt,
      });
  }
}

interface SendDbRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  audience_snapshot_id: string;
  subscriber_id: string;
  recipient_email: string;
  status: string;
  attempts: number;
  idempotency_key: string;
  provider_message_id: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}
const toSendRow = (r: SendDbRow): SendRow => ({
  id: r.id,
  workspaceId: r.workspace_id,
  campaignId: r.campaign_id,
  audienceSnapshotId: r.audience_snapshot_id,
  subscriberId: r.subscriber_id,
  recipientEmail: r.recipient_email,
  status: r.status as SendRow["status"],
  attempts: r.attempts,
  idempotencyKey: r.idempotency_key,
  providerMessageId: r.provider_message_id,
  lastError: r.last_error,
  nextAttemptAt: r.next_attempt_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SqliteNewsletterSendRepo implements NewsletterSendRepoPort {
  private readonly table = NEWSLETTER_TABLE_NAMES.sends;
  constructor(private readonly db: ContentDb) {}
  private get client(): Database.Database {
    return rawClient(this.db);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<SendRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as SendDbRow | undefined;
    return row ? toSendRow(row) : null;
  }

  async findByIdempotencyKey(required: { workspaceId: string; idempotencyKey: string }): Promise<SendRow | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND idempotency_key = ?`)
      .get(required.workspaceId, required.idempotencyKey) as SendDbRow | undefined;
    return row ? toSendRow(row) : null;
  }

  async listByCampaign(required: {
    workspaceId: string;
    campaignId: string;
    afterId?: string;
    limit?: number;
  }): Promise<SendRow[]> {
    const limit = required.limit ?? DEFAULT_LIST_LIMIT;
    const rows = required.afterId
      ? (this.client
          .prepare(
            `SELECT * FROM "${this.table}" WHERE workspace_id = ? AND campaign_id = ? AND id > ? ORDER BY id LIMIT ?`
          )
          .all(required.workspaceId, required.campaignId, required.afterId, limit) as SendDbRow[])
      : (this.client
          .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND campaign_id = ? ORDER BY id LIMIT ?`)
          .all(required.workspaceId, required.campaignId, limit) as SendDbRow[]);
    return rows.map(toSendRow);
  }

  async listPendingByAudienceSnapshot(required: {
    workspaceId: string;
    audienceSnapshotId: string;
    limit: number;
  }): Promise<SendRow[]> {
    const rows = this.client
      .prepare(
        `SELECT * FROM "${this.table}" WHERE workspace_id = ? AND audience_snapshot_id = ? AND status = 'pending'
         ORDER BY id LIMIT ?`
      )
      .all(required.workspaceId, required.audienceSnapshotId, required.limit) as SendDbRow[];
    return rows.map(toSendRow);
  }

  async countPendingByCampaign(required: { workspaceId: string; campaignId: string }): Promise<number> {
    const row = this.client
      .prepare(
        `SELECT COUNT(*) AS n FROM "${this.table}" WHERE workspace_id = ? AND campaign_id = ? AND status = 'pending'`
      )
      .get(required.workspaceId, required.campaignId) as { n: number };
    return row.n;
  }

  async save(row: SendRow): Promise<void> {
    this.client
      .prepare(
        `INSERT INTO "${this.table}"
           (id, workspace_id, campaign_id, audience_snapshot_id, subscriber_id, recipient_email, status,
            attempts, idempotency_key, provider_message_id, last_error, next_attempt_at, created_at, updated_at)
         VALUES (@id, @workspaceId, @campaignId, @audienceSnapshotId, @subscriberId, @recipientEmail, @status,
                 @attempts, @idempotencyKey, @providerMessageId, @lastError, @nextAttemptAt, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status, attempts = excluded.attempts, provider_message_id = excluded.provider_message_id,
           last_error = excluded.last_error, next_attempt_at = excluded.next_attempt_at,
           recipient_email = excluded.recipient_email, updated_at = excluded.updated_at`
      )
      .run({
        id: row.id,
        workspaceId: row.workspaceId,
        campaignId: row.campaignId,
        audienceSnapshotId: row.audienceSnapshotId,
        subscriberId: row.subscriberId,
        recipientEmail: row.recipientEmail,
        status: row.status,
        attempts: row.attempts,
        idempotencyKey: row.idempotencyKey,
        providerMessageId: row.providerMessageId,
        lastError: row.lastError,
        nextAttemptAt: row.nextAttemptAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
  }

  async saveBatch(rows: readonly SendRow[]): Promise<void> {
    for (const row of rows) await this.save(row);
  }

  /**
   * Atomically takes the dispatch lease on one send row (2026-09-16, see `ports.ts` doc). One
   * conditional `UPDATE` makes the claim atomic across processes too; the row is then read back in
   * the same synchronous turn (better-sqlite3 is synchronous under the hood), so no other writer can
   * observe or change it between the two calls.
   *
   * @complexity O(1) (indexed lookup by primary key).
   */
  async claimForDispatch(required: { workspaceId: string; id: string; nowIso: string; leaseUntilIso: string }): Promise<SendRow | null> {
    const result = this.client
      .prepare(
        `UPDATE "${this.table}" SET next_attempt_at = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`
      )
      .run(required.leaseUntilIso, required.nowIso, required.workspaceId, required.id, required.nowIso);
    if (result.changes !== 1) return null;
    return this.findById({ workspaceId: required.workspaceId, id: required.id });
  }

  /**
   * Atomically records a dispatch outcome (2026-09-16, see `ports.ts` doc). One conditional `UPDATE`
   * (`WHERE ... status = 'pending'`) makes the check-and-write atomic across processes too: a
   * concurrent second call's `UPDATE` matches zero rows and returns `null` without touching the row.
   *
   * @complexity O(1) (indexed lookup by primary key).
   */
  async recordOutcome(required: {
    workspaceId: string;
    id: string;
    status: "delivered" | "failed";
    providerMessageId: string | null;
    lastError: string | null;
    updatedAt: string;
  }): Promise<SendRow | null> {
    const result = this.client
      .prepare(
        `UPDATE "${this.table}" SET status = ?, attempts = attempts + 1, provider_message_id = COALESCE(?, provider_message_id),
           last_error = ?, next_attempt_at = NULL, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND status = 'pending'`
      )
      .run(required.status, required.providerMessageId, required.lastError, required.updatedAt, required.workspaceId, required.id);
    if (result.changes !== 1) return null;
    return this.findById({ workspaceId: required.workspaceId, id: required.id });
  }
}

interface ConfirmationTokenDbRow {
  id: string;
  workspace_id: string;
  subscription_id: string;
  token_hash: string;
  purpose: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}
const toConfirmationTokenRecord = (r: ConfirmationTokenDbRow): ConfirmationTokenRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  subscriptionId: r.subscription_id,
  tokenHash: r.token_hash,
  purpose: r.purpose as ConfirmationTokenRecord["purpose"],
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  consumedAt: r.consumed_at,
});

export class SqliteNewsletterConfirmationTokenRepo implements NewsletterConfirmationTokenRepoPort {
  private readonly table = NEWSLETTER_TABLE_NAMES.confirmationTokens;
  constructor(private readonly db: ContentDb) {}
  private get client(): Database.Database {
    return rawClient(this.db);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<ConfirmationTokenRecord | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND id = ?`)
      .get(required.workspaceId, required.id) as ConfirmationTokenDbRow | undefined;
    return row ? toConfirmationTokenRecord(row) : null;
  }

  async findUnconsumedBySubscription(required: {
    workspaceId: string;
    subscriptionId: string;
  }): Promise<ConfirmationTokenRecord[]> {
    const rows = this.client
      .prepare(
        `SELECT * FROM "${this.table}" WHERE workspace_id = ? AND subscription_id = ? AND consumed_at IS NULL`
      )
      .all(required.workspaceId, required.subscriptionId) as ConfirmationTokenDbRow[];
    return rows.map(toConfirmationTokenRecord);
  }

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<ConfirmationTokenRecord | null> {
    const row = this.client
      .prepare(`SELECT * FROM "${this.table}" WHERE workspace_id = ? AND token_hash = ?`)
      .get(required.workspaceId, required.tokenHash) as ConfirmationTokenDbRow | undefined;
    return row ? toConfirmationTokenRecord(row) : null;
  }

  async save(row: ConfirmationTokenRecord): Promise<void> {
    this.client
      .prepare(
        `INSERT INTO "${this.table}" (id, workspace_id, subscription_id, token_hash, purpose, created_at, expires_at, consumed_at)
         VALUES (@id, @workspaceId, @subscriptionId, @tokenHash, @purpose, @createdAt, @expiresAt, @consumedAt)
         ON CONFLICT(id) DO UPDATE SET consumed_at = excluded.consumed_at`
      )
      .run({
        id: row.id,
        workspaceId: row.workspaceId,
        subscriptionId: row.subscriptionId,
        tokenHash: row.tokenHash,
        purpose: row.purpose,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        consumedAt: row.consumedAt,
      });
  }
}
