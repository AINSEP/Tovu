import { MemberAuthError, MemberConflictError } from "./types.js";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberExternalIdentityRepoPort,
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
  toMemberExternalIdentityRecord,
  toMemberExternalIdentityRow,
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
  MemberExternalIdentityRecord,
  MemberRecord,
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

/** External identity persistence on the existing kernel; joins any caller transaction.
 * Reads intentionally retain unlink markers and do not decide member authentication policy.
 * Database errors propagate; a rejected conditional upsert raises MemberConflictError.
 * @complexity Indexed lookups/writes O(log n); list O(log n + p), p = this member's providers.
 * @example new SqlMemberExternalIdentityRepo({ kernel })
 */
export class SqlMemberExternalIdentityRepo implements MemberExternalIdentityRepoPort {
  private readonly kernel: ContentKernel;

  constructor(required: { kernel: ContentKernel }, _options: Record<string, never> = {}) {
    this.kernel = required.kernel;
  }

  /** Resolve the stable subject, including unlink markers and without using an email claim. */
  async findBySubject(required: { workspaceId: string; issuer: string; subject: string }, _options: Record<string, never> = {}): Promise<MemberExternalIdentityRecord | null> {
    const row = await this.kernel.run(db => db.selectFrom("member_external_identities").selectAll()
      .where("workspace_id", "=", required.workspaceId).where("issuer", "=", required.issuer)
      .where("subject", "=", required.subject).executeTakeFirst());
    return row ? toMemberExternalIdentityRecord({ row }) : null;
  }

  /** Read the member/provider reservation, even after unlink. Missing/foreign returns null. */
  async findByMemberAndProvider(required: { workspaceId: string; memberId: string; providerId: string }, _options: Record<string, never> = {}): Promise<MemberExternalIdentityRecord | null> {
    const row = await this.kernel.run(db => db.selectFrom("member_external_identities").selectAll()
      .where("workspace_id", "=", required.workspaceId).where("member_id", "=", required.memberId)
      .where("provider_id", "=", required.providerId).executeTakeFirst());
    return row ? toMemberExternalIdentityRecord({ row }) : null;
  }

  /** Return all reservations in deterministic order; public views filter unlinked rows. */
  async listByMember(required: { workspaceId: string; memberId: string }, _options: Record<string, never> = {}): Promise<MemberExternalIdentityRecord[]> {
    const rows = await this.kernel.run(db => db.selectFrom("member_external_identities").selectAll()
      .where("workspace_id", "=", required.workspaceId).where("member_id", "=", required.memberId)
      .orderBy("provider_id").orderBy("id").execute());
    return rows.map(row => toMemberExternalIdentityRecord({ row }));
  }

  /** Single-statement upsert. The predicates fence stale callbacks without a read/write race. */
  async save(record: MemberExternalIdentityRecord, { allowRelink = false }: { allowRelink?: boolean } = {}): Promise<void> {
    const row = toMemberExternalIdentityRow({ record });
    const saved = await this.kernel.run(db => db.insertInto("member_external_identities").values(row)
      .onConflict(oc => {
        let update = oc.column("id").doUpdateSet(withoutId(row))
          .where("member_external_identities.workspace_id", "=", record.workspaceId)
          .where("member_external_identities.member_id", "=", record.memberId)
          .where("member_external_identities.provider_id", "=", record.providerId);
        // Only the signed-in connect service may replace a subject or clear the unlink marker.
        if (!allowRelink) update = update.where("member_external_identities.unlinked_at", "is", null)
          .where("member_external_identities.issuer", "=", record.issuer)
          .where("member_external_identities.subject", "=", record.subject);
        return update;
      })
      .returning("id").executeTakeFirst());
    if (!saved) throw new MemberConflictError("member identity changed; re-read it before updating");
  }

  /** Keep the first unlink marker; repeated unlink and foreign workspaces cannot alter it. */
  async unlink(required: { workspaceId: string; memberId: string; providerId: string; unlinkedAt: string }, _options: Record<string, never> = {}): Promise<void> {
    await this.kernel.run(db => db.updateTable("member_external_identities").set({ unlinked_at: required.unlinkedAt })
      .where("workspace_id", "=", required.workspaceId).where("member_id", "=", required.memberId)
      .where("provider_id", "=", required.providerId).where("unlinked_at", "is", null).execute());
  }
}

/** The `updated` half of an upsert: every column except the primary key. */
function withoutId<T extends { id: unknown }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}

export class SqlMemberRepo implements MemberRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

  async findById(required: { workspaceId: string; id: string }): Promise<MemberRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("members")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .where("status", "<>", "trash")
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

  /** Credential-only lookup; the hash never enters a MemberRecord. Missing/passwordless/Trash returns null. */
  async findPasswordHash(required: { workspaceId: string; memberId: string }, _options: Record<string, never> = {}): Promise<string | null> {
    const row = await this.kernel.run(db => db.selectFrom("members").select("password_hash")
      .where("workspace_id", "=", required.workspaceId).where("id", "=", required.memberId)
      .where("status", "<>", "trash").executeTakeFirst());
    return row?.password_hash ?? null;
  }

  /** Change only the credential column, without racing a profile upsert into erasing the hash. */
  async setPasswordHash(required: { workspaceId: string; memberId: string; passwordHash: string }, _options: Record<string, never> = {}): Promise<void> {
    const row = await this.kernel.run(db => db.updateTable("members").set({ password_hash: required.passwordHash })
      .where("workspace_id", "=", required.workspaceId).where("id", "=", required.memberId)
      .where("status", "<>", "trash").returning("id").executeTakeFirst());
    if (!row) throw new MemberAuthError("member was not found or is in Trash");
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
      let query = db.selectFrom("members").selectAll().where("workspace_id", "=", required.workspaceId)
        .where("status", "<>", "trash");
      if (anchor) query = query.where("id", ">", anchor.id);
      return query.orderBy("id").limit(limit).execute();
    });
    return rows.map(toMemberRecord);
  }

  async save(record: MemberRecord): Promise<void> {
    const row = toMemberRow(record);
    const result = await this.kernel.run((db) =>
      db
        .insertInto("members")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row))
          // A stale profile/sign-in write cannot undo Trash or its credential revocation.
          .where("members.status", "<>", "trash")
          .where("members.version", "<=", record.version)
          // Even a same-version stale save must not erase a newer credential cutoff.
          .where(eb => record.credentialsRevokedAt
            ? eb.or([eb("members.credentials_revoked_at", "is", null),
                eb("members.credentials_revoked_at", "<=", record.credentialsRevokedAt)])
            : eb("members.credentials_revoked_at", "is", null)))
        .executeTakeFirst()
    );
    if (Number(result.numInsertedOrUpdatedRows) === 0) {
      throw new MemberConflictError("member changed or is in Trash; re-read it before updating");
    }
  }
}

export class SqlMemberTierRepo implements MemberTierRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
 * Sessions. Single-session revoke is atomic on its own. Bulk credential revocation takes the
 * member lock and updates the cutoff and sessions together; a repeated revoke never lowers it.
 * @complexity O(s) for bulk revocation, s = sessions of the member; two bulk updates, no per-row I/O.
 */
export class SqlMemberSessionRepo implements MemberSessionRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
    await this.kernel.transaction(async () => {
      // Share the marker lock: a sign-in started before Trash must not mint a late credential,
      // even if restoration completes before its session write. Only credential revocation fences
      // that stale mint; ordinary edits and sign-ins leave other pending credentials usable.
      await this.kernel.lockKey(`trash:member:${record.workspaceId}:${record.memberId}`);
      const member = await this.kernel.run(db => db.selectFrom("members")
        .select(["status", "credentials_revoked_at"]).where("workspace_id", "=", record.workspaceId)
        .where("id", "=", record.memberId).executeTakeFirst());
      if (member && (member.status === "trash" || member.status === "disabled"
        || (member.credentials_revoked_at !== null && member.credentials_revoked_at > record.createdAt))) {
        throw new MemberAuthError("member changed before the session was saved; request a new sign-in link");
      }
      await this.kernel.run((db) => db.insertInto("member_sessions").values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row)))
        .execute());
    });
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

  /** Atomically advance the cutoff and revoke live sessions, optionally excluding one id.
   * @complexity O(s) affected sessions in one bulk update; database failures propagate.
   */
  async revokeAllForMember(required: { workspaceId: string; memberId: string; revokedAt: string },
    options: { exceptSessionId?: string } = {}): Promise<void> {
    await this.kernel.transaction(async () => {
      // Same lock as Trash and session minting: all sessions and the pending-link cutoff commit
      // together. A late request may persist a token after this update, but the cutoff rejects it.
      await this.kernel.lockKey(`trash:member:${required.workspaceId}:${required.memberId}`);
      await this.kernel.run(db => db.updateTable("members")
        .set({ credentials_revoked_at: required.revokedAt })
        .where("workspace_id", "=", required.workspaceId).where("id", "=", required.memberId)
        .where(eb => eb.or([eb("credentials_revoked_at", "is", null),
          eb("credentials_revoked_at", "<", required.revokedAt)]))
        .execute());
      await this.kernel.run(db => db.updateTable("member_sessions")
        .set({ revoked_at: required.revokedAt })
        .where("workspace_id", "=", required.workspaceId).where("member_id", "=", required.memberId)
        // Exclude in SQL: revoking then restoring the current row could resurrect a concurrent sign-out.
        .$if(options.exceptSessionId !== undefined, query => query.where("id", "!=", options.exceptSessionId!))
        .where("revoked_at", "is", null).execute());
    });
  }
}

export class SqlMagicLinkTokenRepo implements MagicLinkTokenRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

  /** Resolve a code-entry handle inside the member realm; missing/foreign handles return null. */
  async findById(required: { workspaceId: string; id: string }, _options: Record<string, never> = {}): Promise<MagicLinkTokenRecord | null> {
    const row = await this.kernel.run(db => db.selectFrom("member_magic_tokens").selectAll()
      .where("workspace_id", "=", required.workspaceId).where("id", "=", required.id).executeTakeFirst());
    return row ? toMagicLinkTokenRecord(row) : null;
  }

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

  /** The conditional UPDATE is atomic on both dialects, so no lock or read-then-write is needed.
   * `expires_at` is written as `toISOString()` UTC text, so the string comparison is time order. */
  async reserveCodeAttempt(required: { workspaceId: string; id: string; nowIso: string }, { maxAttempts = 5 }: { maxAttempts?: number } = {}): Promise<boolean> {
    const row = await this.kernel.run(db => db.updateTable("member_magic_tokens")
      .set(eb => ({ failed_attempts: eb("failed_attempts", "+", 1) }))
      .where("workspace_id", "=", required.workspaceId).where("id", "=", required.id)
      .where("consumed_at", "is", null).where("expires_at", ">", required.nowIso)
      .where("failed_attempts", "<", maxAttempts).returning("id").executeTakeFirst());
    return row !== undefined;
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
          .select(["consumed_at", "expires_at"])
          .where("workspace_id", "=", required.workspaceId)
          .where("id", "=", required.id)
          .limit(1)
          .executeTakeFirst()
      );
      if (!existing) {
        throw new Error(`magic link token '${required.id}' was not found`);
      }
      if (existing.expires_at <= required.consumedAt) {
        throw new Error(`magic link token '${required.id}' has expired`);
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
          .where("expires_at", ">", required.consumedAt)
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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
