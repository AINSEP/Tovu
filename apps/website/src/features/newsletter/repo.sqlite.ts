/**
 * @file SQLite/Drizzle adapter for all 6 Newsletter repo ports (ADR-PIPE-011 §7/§8, File Map).
 *
 * `SqliteNewsletterCampaignRepo` is Drizzle-backed against the bespoke `newsletter_campaigns`/
 * `newsletter_campaign_revisions` table pair (`src/platform/db/schema.sqlite.ts`) — mirrors
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

import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlNewsletterCampaignRepo, SqlNewsletterListRepo, SqlNewsletterSubscriptionRepo } from "./repo.js";
import { NEWSLETTER_TABLE_NAMES } from "./data-module-manifest.js";
import type {
  NewsletterAudienceSnapshotRepoPort,
  NewsletterConfirmationTokenRepoPort,
  NewsletterListRepoPort,
  NewsletterSendRepoPort,
  NewsletterSubscriptionRepoPort,
} from "./ports.js";
import type {
  AudienceSnapshotRow,
  ConfirmationTokenRecord,
  NewsletterListRow,
  SendRow,
  SubscriptionRow,
} from "./types.js";

const DEFAULT_LIST_LIMIT = 100;

/** Narrow accessor for the raw better-sqlite3 handle underneath a Drizzle `ContentDb` (mirrors `SqliteSettingsRepo`). */
function rawClient(db: ContentDb): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

export class SqliteNewsletterCampaignRepo extends SqlNewsletterCampaignRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

/* ------------------------------------------------------------------------------------------------
 * The 5 p_newsletter__* tables — raw SQL, declareDataModule()-created (ADR-023 §7/§8)
 * ------------------------------------------------------------------------------------------------ */

export class SqliteNewsletterListRepo extends SqlNewsletterListRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterSubscriptionRepo extends SqlNewsletterSubscriptionRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
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
