import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  CampaignOutcomeCounter,
  NewsletterAudienceSnapshotRepoPort,
  NewsletterListRepoPort,
  NewsletterSubscriptionRepoPort,
} from "./ports.js";
import {
  type NewsletterTables,
  toCampaignRecord,
  toCampaignRevision,
  toCampaignRow,
  toAudienceSnapshotRecord,
  toAudienceSnapshotRow,
  toListRecord,
  toListRow,
  toSubscriptionRecord,
  toSubscriptionRow,
  updatableCampaignColumns,
  updatableListColumns,
  updatableSubscriptionColumns,
} from "./repo.rows.js";
import type {
  AudienceSnapshotRow,
  CampaignCounters,
  CampaignRecord,
  CampaignRevision,
  NewsletterListRow,
  SubscriptionRow,
} from "./types.js";

/**
 * @file THE newsletter repositories: one Kysely query body for every database the storage kernel
 * drives (SQLite, PGlite, Postgres), six classes over the campaign pair (migrated core schema) and
 * the five `p_newsletter__*` dataModule tables (typed locally in `repo.rows.ts`).
 *
 * Every statement goes through `kernel.run` and is awaited. A read-then-write takes `lockKey`
 * inside `kernel.transaction` first, so two writers cannot interleave on Postgres.
 */

const DEFAULT_LIST_LIMIT = 100;

export class SqlNewsletterCampaignRepo implements NewsletterCampaignRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<CampaignRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("newsletter_campaigns")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toCampaignRecord(row) : null;
  }

  async list(required: { workspaceId: string; afterId?: string; limit?: number }): Promise<CampaignRecord[]> {
    const rows = await this.kernel.run((db) => {
      let query = db.selectFrom("newsletter_campaigns").selectAll().where("workspace_id", "=", required.workspaceId);
      if (required.afterId) query = query.where("id", ">", required.afterId);
      return query
        .orderBy("id", "asc")
        .limit(required.limit ?? DEFAULT_LIST_LIMIT)
        .execute();
    });
    return rows.map(toCampaignRecord);
  }

  async saveCampaignRow(campaign: CampaignRecord): Promise<void> {
    const row = toCampaignRow(campaign);
    await this.kernel.run((db) =>
      db
        .insertInto("newsletter_campaigns")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(updatableCampaignColumns(row)))
        .execute()
    );
  }

  async appendRevision(revision: CampaignRevision): Promise<void> {
    await this.kernel.run((db) =>
      db
        .insertInto("newsletter_campaign_revisions")
        .values({
          campaign_id: revision.campaignId,
          workspace_id: revision.workspaceId,
          state_json: JSON.stringify(revision.state),
          actor_id: revision.actorId,
          recorded_at: revision.recordedAt,
        })
        .execute()
    );
  }

  async listRevisions(required: { workspaceId: string; campaignId: string }): Promise<CampaignRevision[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("newsletter_campaign_revisions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("campaign_id", "=", required.campaignId)
        .orderBy("seq", "asc")
        .execute()
    );
    return rows.map(toCampaignRevision);
  }

  /** The kernel's transaction: nested calls join, other requests wait their turn. Takes the campaign write lock first. */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey("newsletter:campaigns");
      return fn();
    });
  }

  /**
   * Reads the counters and writes them back one higher inside a transaction that holds the
   * campaign's lock, so two increments (on any connection) cannot both read the same old count
   * (see `ports.ts`). No JSON operator is needed: the counters are compact text parsed here.
   *
   * @complexity O(1) (primary-key read and update).
   */
  async incrementCounter(required: {
    workspaceId: string;
    id: string;
    counter: CampaignOutcomeCounter;
    updatedAt: string;
  }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.lockKey(`newsletter:campaign:${required.workspaceId}:${required.id}`);
      const current = await this.kernel.run((db) =>
        db
          .selectFrom("newsletter_campaigns")
          .select("counters_json")
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .executeTakeFirst()
      );
      if (!current) return;
      const counters = JSON.parse(current.counters_json) as CampaignCounters;
      const bumped = { ...counters, [required.counter]: (counters[required.counter] ?? 0) + 1 };
      await this.kernel.run((db) =>
        db
          .updateTable("newsletter_campaigns")
          .set({ counters_json: JSON.stringify(bumped), updated_at: required.updatedAt })
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .execute()
      );
    });
  }
}

/** The newsletter campaign repo for `kernel`. */
export function newsletterCampaignRepoFor(kernel: ContentKernel): SqlNewsletterCampaignRepo {
  return new SqlNewsletterCampaignRepo(kernel);
}

export class SqlNewsletterListRepo implements NewsletterListRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<NewsletterListRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__lists")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    return row ? toListRecord(row) : null;
  }

  async findDefault(required: { workspaceId: string }): Promise<NewsletterListRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__lists")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("is_default", "=", 1)
        .orderBy("id", "asc")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toListRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<NewsletterListRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__lists")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .orderBy("id", "asc")
        .execute()
    );
    return rows.map(toListRecord);
  }

  async save(row: NewsletterListRow): Promise<void> {
    const values = toListRow(row);
    await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .insertInto("p_newsletter__lists")
        .values(values)
        .onConflict((oc) => oc.column("id").doUpdateSet(updatableListColumns(values)))
        .execute()
    );
  }
}

/** The newsletter list repo for `kernel`. */
export function newsletterListRepoFor(kernel: ContentKernel): SqlNewsletterListRepo {
  return new SqlNewsletterListRepo(kernel);
}

export class SqlNewsletterSubscriptionRepo implements NewsletterSubscriptionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<SubscriptionRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    return row ? toSubscriptionRecord(row) : null;
  }

  async findBySubscriberAndList(required: {
    workspaceId: string;
    listId: string;
    subscriberId: string;
  }): Promise<SubscriptionRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("list_id", "=", required.listId)
        .where("subscriber_id", "=", required.subscriberId)
        .orderBy("id", "asc")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toSubscriptionRecord(row) : null;
  }

  async list(required: {
    workspaceId: string;
    listId: string;
    afterId?: string;
    limit?: number;
  }): Promise<SubscriptionRow[]> {
    const rows = await this.kernel.run((db) => {
      let query = db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("list_id", "=", required.listId);
      if (required.afterId) query = query.where("id", ">", required.afterId);
      return query
        .orderBy("id", "asc")
        .limit(required.limit ?? DEFAULT_LIST_LIMIT)
        .execute();
    });
    return rows.map(toSubscriptionRecord);
  }

  async listSubscribed(required: { workspaceId: string; listId: string }): Promise<SubscriptionRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("list_id", "=", required.listId)
        .where("status", "=", "subscribed")
        .orderBy("id", "asc")
        .execute()
    );
    return rows.map(toSubscriptionRecord);
  }

  async save(row: SubscriptionRow): Promise<void> {
    const values = toSubscriptionRow(row);
    await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .insertInto("p_newsletter__subscriptions")
        .values(values)
        .onConflict((oc) => oc.column("id").doUpdateSet(updatableSubscriptionColumns(values)))
        .execute()
    );
  }

  async remove(required: { workspaceId: string; id: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .deleteFrom("p_newsletter__subscriptions")
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }
}

/** The newsletter subscription repo for `kernel`. */
export function newsletterSubscriptionRepoFor(kernel: ContentKernel): SqlNewsletterSubscriptionRepo {
  return new SqlNewsletterSubscriptionRepo(kernel);
}

export class SqlNewsletterAudienceSnapshotRepo implements NewsletterAudienceSnapshotRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByCampaignId(required: { workspaceId: string; campaignId: string }): Promise<AudienceSnapshotRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__audience_snapshots")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("campaign_id", "=", required.campaignId)
        .orderBy("id", "asc")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toAudienceSnapshotRecord(row) : null;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<AudienceSnapshotRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__audience_snapshots")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    return row ? toAudienceSnapshotRecord(row) : null;
  }

  /** INV-06: immutable after creation. A plain INSERT (no upsert), so a primary-key collision surfaces as a thrown error. */
  async save(row: AudienceSnapshotRow): Promise<void> {
    await this.kernel.run((db) =>
      db.withTables<NewsletterTables>().insertInto("p_newsletter__audience_snapshots").values(toAudienceSnapshotRow(row)).execute()
    );
  }
}

/** The newsletter audience-snapshot repo for `kernel`. */
export function newsletterAudienceSnapshotRepoFor(kernel: ContentKernel): SqlNewsletterAudienceSnapshotRepo {
  return new SqlNewsletterAudienceSnapshotRepo(kernel);
}
