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
import {
  SqlNewsletterAudienceSnapshotRepo,
  SqlNewsletterCampaignRepo,
  SqlNewsletterListRepo,
  SqlNewsletterSendRepo,
  SqlNewsletterSubscriptionRepo,
} from "./repo.js";
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

export class SqliteNewsletterAudienceSnapshotRepo extends SqlNewsletterAudienceSnapshotRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNewsletterSendRepo extends SqlNewsletterSendRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
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
