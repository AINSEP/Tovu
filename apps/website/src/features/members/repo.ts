import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "./ports.js";
import {
  toConsentRevisionRow,
  toMagicLinkTokenRecord,
  toMagicLinkTokenRow,
  toMemberConsentRecord,
  toMemberConsentRevisionRecord,
  toMemberConsentRow,
  toMemberRecord,
  toMemberRow,
  toMemberSessionRecord,
  toMemberSessionRow,
  toMemberSubscriptionRecord,
  toMemberSubscriptionRow,
  toMemberTierRecord,
  toMemberTierRow,
} from "./repo.rows.js";
import type {
  ConsentPurpose,
  MagicLinkTokenRecord,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
  MemberSessionRecord,
  MemberSubscriptionRecord,
  MemberTierRecord,
} from "./types.js";

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

/**
 * Sessions. `revoke` / `revokeAllForMember` are single UPDATE statements — atomic on their own, so
 * they need no lock; a session revoked twice keeps the latest `revokedAt`, as before.
 */
export class SqlMemberSessionRepo implements MemberSessionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<MemberSessionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_sessions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("token_hash", "=", required.tokenHash)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberSessionRecord(row) : null;
  }

  async listByMember(required: { workspaceId: string; memberId: string }): Promise<MemberSessionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("member_sessions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId)
        .execute()
    );
    return rows.map(toMemberSessionRecord);
  }

  async save(record: MemberSessionRecord): Promise<void> {
    const row = toMemberSessionRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("member_sessions")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }

  async revoke(required: { workspaceId: string; id: string; revokedAt: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("member_sessions")
        .set({ revoked_at: required.revokedAt })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()
    );
  }

  async revokeAllForMember(required: { workspaceId: string; memberId: string; revokedAt: string }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("member_sessions")
        .set({ revoked_at: required.revokedAt })
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId)
        .execute()
    );
  }
}

export class SqlMagicLinkTokenRepo implements MagicLinkTokenRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<MagicLinkTokenRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_magic_tokens")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("token_hash", "=", required.tokenHash)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMagicLinkTokenRecord(row) : null;
  }

  async save(record: MagicLinkTokenRecord): Promise<void> {
    const row = toMagicLinkTokenRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("member_magic_tokens")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }

  /**
   * Single-use: the check and the stamp run in one transaction holding the workspace's token lock, so
   * of two concurrent consumes exactly one wins and the other throws "already consumed". The UPDATE
   * also carries `consumed_at IS NULL`, so it can never overwrite an earlier stamp even if the lock
   * were bypassed.
   */
  async consume(required: { workspaceId: string; id: string; consumedAt: string }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.lockKey(`members:magic-tokens:${required.workspaceId}`);
      const existing = await this.kernel.run((db) =>
        db
          .selectFrom("member_magic_tokens")
          .select("consumed_at")
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .limit(1)
          .executeTakeFirst()
      );
      if (!existing) {
        throw new Error(`magic link token '${required.id}' was not found`);
      }
      if (existing.consumed_at) {
        throw new Error(`magic link token '${required.id}' was already consumed`);
      }
      await this.kernel.run((db) =>
        db
          .updateTable("member_magic_tokens")
          .set({ consumed_at: required.consumedAt })
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .where("consumed_at", "is", null)
          .execute()
      );
    });
  }
}

/**
 * D1c consent adapter (ADR-PIPE-013 Decision §4-5). Backs both `member_consents` and the shared
 * `member_revisions` ledger (`entity_kind='consent'`). `save` is a single upsert by id, so it needs
 * no lock; the `(workspace, member, purpose)` unique index is the backstop for a second consent row.
 * `transaction` is the kernel's: `consent-service.ts` awaits repo calls inside it.
 */
export class SqlMemberConsentRepo implements MemberConsentRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByMemberAndPurpose(required: {
    workspaceId: string;
    memberId: string;
    purpose: ConsentPurpose;
  }): Promise<MemberConsentRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("member_consents")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId)
        .where("purpose", "=", required.purpose)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toMemberConsentRecord(row) : null;
  }

  async save(record: MemberConsentRecord): Promise<void> {
    const row = toMemberConsentRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("member_consents")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute()
    );
  }

  /** Appends one consent revision and returns its `seq`. */
  async appendRevision(record: Omit<MemberConsentRevisionRecord, "seq">): Promise<number> {
    const inserted = await this.kernel.run((db) =>
      db.insertInto("member_revisions").values(toConsentRevisionRow(record)).returning("seq").executeTakeFirstOrThrow()
    );
    return Number(inserted.seq);
  }

  /** A member's revisions, oldest `seq` first, optionally for one purpose. */
  async listRevisions(required: {
    workspaceId: string;
    memberId: string;
    purpose?: ConsentPurpose;
  }): Promise<MemberConsentRevisionRecord[]> {
    const rows = await this.kernel.run((db) => {
      let query = db
        .selectFrom("member_revisions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("member_id", "=", required.memberId);
      if (required.purpose !== undefined) query = query.where("purpose", "=", required.purpose);
      return query.orderBy("seq").execute();
    });
    return rows.map(toMemberConsentRevisionRecord);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(fn);
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

/** The member-session repo for `kernel`. */
export function memberSessionRepoFor(kernel: ContentKernel): SqlMemberSessionRepo {
  return new SqlMemberSessionRepo(kernel);
}

/** The magic-link token repo for `kernel`. */
export function magicLinkTokenRepoFor(kernel: ContentKernel): SqlMagicLinkTokenRepo {
  return new SqlMagicLinkTokenRepo(kernel);
}

/** The member-consent repo for `kernel`. */
export function memberConsentRepoFor(kernel: ContentKernel): SqlMemberConsentRepo {
  return new SqlMemberConsentRepo(kernel);
}
