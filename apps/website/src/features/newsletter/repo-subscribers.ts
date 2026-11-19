import { decodeListCursor, pageFromOverfetch, type ListPage } from "@jini-ai/core/list-page";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { NewsletterConfirmationTokenRepoPort, NewsletterListRepoPort, NewsletterSubscriptionRepoPort } from "./ports.js";
import { type NewsletterTables, toConfirmationTokenRecord, toConfirmationTokenRow, toListRecord, toListRow, toSubscriptionRecord, toSubscriptionRow, updatableListColumns, updatableSubscriptionColumns } from "./repo.rows.js";
import type { ConfirmationTokenRecord, NewsletterListRow, SubscriptionRow } from "./types.js";




export const DEFAULT_LIST_LIMIT = 100;

export class SqlNewsletterListRepo implements NewsletterListRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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

export class SqlNewsletterSubscriptionRepo implements NewsletterSubscriptionRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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

  /** Lists one workspace/list's subscriptions by ID using a position-based cursor.
   * @throws {ToolInputError} If the cursor is malformed; storage failures propagate.
   * @complexity O(limit) returned rows in one indexed query.
   */
  async list(required: {
    workspaceId: string;
    listId: string;
  }, optional: { limit?: number; cursor?: string | null } = {}): Promise<ListPage<SubscriptionRow>> {
    const limit = Math.min(optional.limit ?? DEFAULT_LIST_LIMIT, DEFAULT_LIST_LIMIT);
    const after = optional.cursor != null ? decodeListCursor({ cursor: optional.cursor, shape: ['string'] }) : null;
    const rows = await this.kernel.run((db) => {
      let query = db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("list_id", "=", required.listId);
      if (after) query = query.where("id", ">", String(after[0]));
      return query
        .orderBy("id", "asc")
        .limit(limit + 1)
        .execute();
    });
    return pageFromOverfetch({ rows: rows.map(toSubscriptionRecord), limit, positionOf: row => [row.id] });
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

export class SqlNewsletterConfirmationTokenRepo implements NewsletterConfirmationTokenRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<ConfirmationTokenRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__confirmation_tokens")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .executeTakeFirst()
    );
    return row ? toConfirmationTokenRecord(row) : null;
  }

  async findUnconsumedBySubscription(required: {
    workspaceId: string;
    subscriptionId: string;
  }): Promise<ConfirmationTokenRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__confirmation_tokens")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("subscription_id", "=", required.subscriptionId)
        .where("consumed_at", "is", null)
        .orderBy("id", "asc")
        .execute()
    );
    return rows.map(toConfirmationTokenRecord);
  }

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<ConfirmationTokenRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .selectFrom("p_newsletter__confirmation_tokens")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("token_hash", "=", required.tokenHash)
        .orderBy("id", "asc")
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toConfirmationTokenRecord(row) : null;
  }

  /** Upsert by id; a re-save only ever moves `consumed_at` (the rest of a token is immutable). */
  async save(row: ConfirmationTokenRecord): Promise<void> {
    const values = toConfirmationTokenRow(row);
    await this.kernel.run((db) =>
      db
        .withTables<NewsletterTables>()
        .insertInto("p_newsletter__confirmation_tokens")
        .values(values)
        .onConflict((oc) => oc.column("id").doUpdateSet({ consumed_at: values.consumed_at }))
        .execute()
    );
  }
}
