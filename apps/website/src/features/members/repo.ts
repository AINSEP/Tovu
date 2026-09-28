import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { MemberRepoPort, MemberSubscriptionRepoPort, MemberTierRepoPort } from "./ports.js";
import {
  toMemberRecord,
  toMemberRow,
  toMemberSubscriptionRecord,
  toMemberSubscriptionRow,
  toMemberTierRecord,
  toMemberTierRow,
} from "./repo.rows.js";
import type { MemberRecord, MemberSubscriptionRecord, MemberTierRecord } from "./types.js";

/**
 * @file THE members repositories: one Kysely query body for every database the storage kernel drives
 * (SQLite, PGlite, Postgres). Every statement goes through `kernel.run` and is awaited.
 *
 * Saves are single-statement upserts by primary key (atomic on their own); the unique indexes
 * (`members_workspace_email_unique`, ...) are the backstop for a conflicting writer. Read-then-write
 * paths (magic-token consume) take `kernel.lockKey` inside a transaction — a violation is never
 * caught and followed by a query, because on Postgres a failed statement aborts the transaction.
 */

/** A page of members never exceeds this many rows. */
const MAX_PAGE = 100;

/** The `updated` half of an upsert: every column except the primary key. */
function withoutId<T extends { id: unknown }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}

export class SqlMemberRepo implements MemberRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<MemberRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("members")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberRecord(row) : null;
  }

  async findByEmail(required: { workspaceId: string; email: string }): Promise<MemberRecord | null> {
    const normalized = required.email.trim().toLowerCase();
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("members")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("email", "=", normalized)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberRecord(row) : null;
  }

  /**
   * Members ordered by id. `afterId` resumes strictly after that member; an id that is not a member
   * of the workspace is ignored (first page), as before. Page size is capped at {@link MAX_PAGE}.
   *
   * @complexity O(limit) rows read via the workspace index; two statements when `afterId` is given.
   */
  async list(required: { workspaceId: string; afterId?: string; limit?: number }): Promise<MemberRecord[]> {
    const limit = Math.min(required.limit ?? MAX_PAGE, MAX_PAGE);
    const afterId = required.afterId;
    const anchor = afterId
      ? await this.kernel.run((db) =>
          db
            .selectFrom("members")
            .select("id")
            .where("workspace_id", "=", required.workspaceId)
            .where("id", "=", afterId)
            .limit(1)
            .executeTakeFirst()
        )
      : undefined;
    const rows = await this.kernel.run((db) => {
      let query = db.selectFrom("members").selectAll().where("workspace_id", "=", required.workspaceId);
      if (anchor) query = query.where("id", ">", anchor.id);
      return query.orderBy("id").limit(limit).execute();
    });
    return rows.map(toMemberRecord);
  }

  async save(record: MemberRecord): Promise<void> {
    const row = toMemberRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("members")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }
}

export class SqlMemberTierRepo implements MemberTierRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<MemberTierRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_tiers")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberTierRecord(row) : null;
  }

  async findBySlug(required: { workspaceId: string; slug: string }): Promise<MemberTierRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_tiers")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("slug", "=", required.slug)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberTierRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<MemberTierRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("member_tiers").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toMemberTierRecord);
  }

  async save(record: MemberTierRecord): Promise<void> {
    const row = toMemberTierRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("member_tiers")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }
}

export class SqlMemberSubscriptionRepo implements MemberSubscriptionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<MemberSubscriptionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberSubscriptionRecord(row) : null;
  }

  /** Newest `started_at` first (`id` breaks ties so the order is stable). */
  async listByMember(required: { workspaceId: string; memberId: string }): Promise<MemberSubscriptionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("member_subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId)
        .orderBy("started_at", "desc")
        .orderBy("id")
        .execute()
    );
    return rows.map(toMemberSubscriptionRecord);
  }

  /** `active`/`comped` subscriptions whose period has not ended (or has no end) at `nowIso`. */
  async listActiveByMember(required: {
    workspaceId: string;
    memberId: string;
    nowIso: string;
  }): Promise<MemberSubscriptionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("member_subscriptions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId)
        .where("status", "in", ["active", "comped"])
        .where((eb) => eb.or([eb("current_period_end", "is", null), eb("current_period_end", ">", required.nowIso)]))
        .execute()
    );
    return rows.map(toMemberSubscriptionRecord);
  }

  async save(record: MemberSubscriptionRecord): Promise<void> {
    const row = toMemberSubscriptionRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("member_subscriptions")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }
}

/** The member repo for `kernel`. */
export function memberRepoFor(kernel: ContentKernel): SqlMemberRepo {
  return new SqlMemberRepo(kernel);
}

/** The member-tier repo for `kernel`. */
export function memberTierRepoFor(kernel: ContentKernel): SqlMemberTierRepo {
  return new SqlMemberTierRepo(kernel);
}

/** The member-subscription repo for `kernel`. */
export function memberSubscriptionRepoFor(kernel: ContentKernel): SqlMemberSubscriptionRepo {
  return new SqlMemberSubscriptionRepo(kernel);
}
