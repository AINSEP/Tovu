import { and, eq } from "drizzle-orm";

import type { JsonObject } from "@jini-ai/cms/core";
import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlMemberRepo, SqlMemberTierRepo } from "./repo.js";
import {
  memberConsents,
  memberMagicTokens,
  memberRevisions,
  memberSessions,
  memberSubscriptions,
} from "../../platform/db/schema.sqlite.js";
import { sqliteKernel } from "../../platform/db/kernel/index.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import type {
  MagicLinkTokenRepoPort,
  MemberConsentRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
} from "./ports.js";
import type {
  ConsentEvidence,
  ConsentPurpose,
  ConsentStatus,
  MagicLinkTokenRecord,
  MemberConsentRecord,
  MemberConsentRevisionRecord,
  MemberSessionRecord,
  MemberSubscriptionRecord,
  MemberSubscriptionSource,
  MemberSubscriptionStatus,
} from "./types.js";

/**
 * @file Drizzle/SQLite adapter for all 6 `members` repo ports (ADR-PIPE-013
 * Decision §5, REQ-18, Article IV rule-of-two).
 *
 * Purpose:
 * Satisfies the same 6 ports as `repo.memory.ts`, mirroring `SqlitePostRepo`'s/
 * `src/features/settings/repo.sqlite.ts`'s exact shape: typed row -> domain-
 * record mapping, `.onConflictDoUpdate` upserts, `and(eq(...))` composite-key
 * queries. `MemberConsentRepoPort.transaction` uses the same manual
 * `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` pattern `SqliteSettingsRepo.transaction`
 * documents (better-sqlite3 has no real async I/O, so no other statement can
 * interleave on this single connection between awaits).
 *
 * NOT wired into `server/app.ts`'s boot path this pass (ADR-PIPE-013 Decision
 * §5) — the in-memory adapters remain the only ones actually receiving
 * traffic, exactly like `SqlitePostRepo` today.
 */

/** The member repo on a site's SQLite `content.db` (the one Kysely body, `repo.ts`). */
export class SqliteMemberRepo extends SqlMemberRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

/** The member-tier repo on a site's SQLite `content.db` (the one Kysely body, `repo.ts`). */
export class SqliteMemberTierRepo extends SqlMemberTierRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

function toMemberSubscriptionRecord(row: typeof memberSubscriptions.$inferSelect): MemberSubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    tierId: row.tierId,
    status: row.status as MemberSubscriptionStatus,
    source: row.source as MemberSubscriptionSource,
    externalRef: row.externalRef ?? undefined,
    startedAt: row.startedAt,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    canceledAt: row.canceledAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export class SqliteMemberSubscriptionRepo implements MemberSubscriptionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<MemberSubscriptionRecord | null> {
    return findOneBy(
      this.db,
      memberSubscriptions,
      [eq(memberSubscriptions.workspaceId, required.workspaceId), eq(memberSubscriptions.id, required.id)],
      toMemberSubscriptionRecord
    );
  }

  async listByMember(required: { workspaceId: string; memberId: string }): Promise<MemberSubscriptionRecord[]> {
    const rows = this.db
      .select()
      .from(memberSubscriptions)
      .where(
        and(
          eq(memberSubscriptions.workspaceId, required.workspaceId),
          eq(memberSubscriptions.memberId, required.memberId)
        )
      )
      .all()
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
    return rows.map(toMemberSubscriptionRecord);
  }

  async listActiveByMember(required: {
    workspaceId: string;
    memberId: string;
    nowIso: string;
  }): Promise<MemberSubscriptionRecord[]> {
    const rows = this.db
      .select()
      .from(memberSubscriptions)
      .where(
        and(
          eq(memberSubscriptions.workspaceId, required.workspaceId),
          eq(memberSubscriptions.memberId, required.memberId)
        )
      )
      .all()
      .filter(
        (row) =>
          (row.status === "active" || row.status === "comped") &&
          (!row.currentPeriodEnd || row.currentPeriodEnd > required.nowIso)
      );
    return rows.map(toMemberSubscriptionRecord);
  }

  async save(record: MemberSubscriptionRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      memberId: record.memberId,
      tierId: record.tierId,
      status: record.status,
      source: record.source,
      externalRef: record.externalRef ?? null,
      startedAt: record.startedAt,
      currentPeriodEnd: record.currentPeriodEnd ?? null,
      canceledAt: record.canceledAt ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
    };
    this.db
      .insert(memberSubscriptions)
      .values(row)
      .onConflictDoUpdate({ target: memberSubscriptions.id, set: row })
      .run();
  }
}

function toMemberSessionRecord(row: typeof memberSessions.$inferSelect): MemberSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined,
    lastSeenAt: row.lastSeenAt ?? undefined,
    userAgent: row.userAgent ?? undefined,
    ip: row.ip ?? undefined,
  };
}

export class SqliteMemberSessionRepo implements MemberSessionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<MemberSessionRecord | null> {
    return findOneBy(
      this.db,
      memberSessions,
      [eq(memberSessions.workspaceId, required.workspaceId), eq(memberSessions.tokenHash, required.tokenHash)],
      toMemberSessionRecord
    );
  }

  async listByMember(required: { workspaceId: string; memberId: string }): Promise<MemberSessionRecord[]> {
    const rows = this.db
      .select()
      .from(memberSessions)
      .where(and(eq(memberSessions.workspaceId, required.workspaceId), eq(memberSessions.memberId, required.memberId)))
      .all();
    return rows.map(toMemberSessionRecord);
  }

  async save(record: MemberSessionRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      memberId: record.memberId,
      tokenHash: record.tokenHash,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt ?? null,
      lastSeenAt: record.lastSeenAt ?? null,
      userAgent: record.userAgent ?? null,
      ip: record.ip ?? null,
    };
    this.db
      .insert(memberSessions)
      .values(row)
      .onConflictDoUpdate({ target: memberSessions.id, set: row })
      .run();
  }

  async revoke(required: { workspaceId: string; id: string; revokedAt: string }): Promise<void> {
    this.db
      .update(memberSessions)
      .set({ revokedAt: required.revokedAt })
      .where(and(eq(memberSessions.workspaceId, required.workspaceId), eq(memberSessions.id, required.id)))
      .run();
  }

  async revokeAllForMember(required: { workspaceId: string; memberId: string; revokedAt: string }): Promise<void> {
    this.db
      .update(memberSessions)
      .set({ revokedAt: required.revokedAt })
      .where(
        and(eq(memberSessions.workspaceId, required.workspaceId), eq(memberSessions.memberId, required.memberId))
      )
      .run();
  }
}

function toMagicLinkTokenRecord(row: typeof memberMagicTokens.$inferSelect): MagicLinkTokenRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    tokenHash: row.tokenHash,
    purpose: row.purpose as MagicLinkTokenRecord["purpose"],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined,
  };
}

export class SqliteMagicLinkTokenRepo implements MagicLinkTokenRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByTokenHash(required: { workspaceId: string; tokenHash: string }): Promise<MagicLinkTokenRecord | null> {
    return findOneBy(
      this.db,
      memberMagicTokens,
      [eq(memberMagicTokens.workspaceId, required.workspaceId), eq(memberMagicTokens.tokenHash, required.tokenHash)],
      toMagicLinkTokenRecord
    );
  }

  async save(record: MagicLinkTokenRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      memberId: record.memberId,
      tokenHash: record.tokenHash,
      purpose: record.purpose,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      consumedAt: record.consumedAt ?? null,
    };
    this.db
      .insert(memberMagicTokens)
      .values(row)
      .onConflictDoUpdate({ target: memberMagicTokens.id, set: row })
      .run();
  }

  async consume(required: { workspaceId: string; id: string; consumedAt: string }): Promise<void> {
    const rows = this.db
      .select()
      .from(memberMagicTokens)
      .where(and(eq(memberMagicTokens.workspaceId, required.workspaceId), eq(memberMagicTokens.id, required.id)))
      .all();
    const existing = rows[0];
    if (!existing) {
      throw new Error(`magic link token '${required.id}' was not found`);
    }
    if (existing.consumedAt) {
      throw new Error(`magic link token '${required.id}' was already consumed`);
    }

    this.db
      .update(memberMagicTokens)
      .set({ consumedAt: required.consumedAt })
      .where(and(eq(memberMagicTokens.workspaceId, required.workspaceId), eq(memberMagicTokens.id, required.id)))
      .run();
  }
}

function toMemberConsentRecord(row: typeof memberConsents.$inferSelect): MemberConsentRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    purpose: row.purpose as ConsentPurpose,
    status: row.status as ConsentStatus,
    evidence: JSON.parse(row.evidenceJson) as ConsentEvidence,
    grantedAt: row.grantedAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toMemberConsentRevisionRecord(row: typeof memberRevisions.$inferSelect): MemberConsentRevisionRecord {
  return {
    seq: row.seq,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    consentId: row.entityId,
    purpose: (row.purpose ?? "") as ConsentPurpose,
    op: row.op as MemberConsentRevisionRecord["op"],
    beforeJson: row.beforeJson == null ? null : (JSON.parse(row.beforeJson) as JsonObject),
    afterJson: row.afterJson == null ? null : (JSON.parse(row.afterJson) as JsonObject),
    originModule: row.originModule ?? "",
    createdAt: row.createdAt,
  };
}

/**
 * D1c consent adapter #2 (ADR-PIPE-013 Decision §4-5). Backs both
 * `member_consents` and the shared `member_revisions` ledger
 * (`entity_kind='consent'`), matching `SqliteSettingsRepo`'s combined
 * value+revision-ledger shape.
 */
export class SqliteMemberConsentRepo implements MemberConsentRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByMemberAndPurpose(required: {
    workspaceId: string;
    memberId: string;
    purpose: ConsentPurpose;
  }): Promise<MemberConsentRecord | null> {
    return findOneBy(
      this.db,
      memberConsents,
      [
        eq(memberConsents.workspaceId, required.workspaceId),
        eq(memberConsents.memberId, required.memberId),
        eq(memberConsents.purpose, required.purpose),
      ],
      toMemberConsentRecord
    );
  }

  async save(record: MemberConsentRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      memberId: record.memberId,
      purpose: record.purpose,
      status: record.status,
      evidenceJson: JSON.stringify(record.evidence),
      grantedAt: record.grantedAt ?? null,
      revokedAt: record.revokedAt ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
    };
    this.db
      .insert(memberConsents)
      .values(row)
      .onConflictDoUpdate({ target: memberConsents.id, set: row })
      .run();
  }

  async appendRevision(record: Omit<MemberConsentRevisionRecord, "seq">): Promise<number> {
    const result = this.db
      .insert(memberRevisions)
      .values({
        entityKind: "consent",
        entityId: record.consentId,
        workspaceId: record.workspaceId,
        memberId: record.memberId,
        purpose: record.purpose,
        op: record.op,
        beforeJson: record.beforeJson == null ? null : JSON.stringify(record.beforeJson),
        afterJson: record.afterJson == null ? null : JSON.stringify(record.afterJson),
        originModule: record.originModule,
        createdAt: record.createdAt,
      })
      .run();
    return Number(result.lastInsertRowid);
  }

  async listRevisions(required: {
    workspaceId: string;
    memberId: string;
    purpose?: ConsentPurpose;
  }): Promise<MemberConsentRevisionRecord[]> {
    const rows = this.db
      .select()
      .from(memberRevisions)
      .where(
        and(eq(memberRevisions.workspaceId, required.workspaceId), eq(memberRevisions.memberId, required.memberId))
      )
      .all()
      .filter((row) => required.purpose === undefined || row.purpose === required.purpose)
      .sort((a, b) => a.seq - b.seq);
    return rows.map(toMemberConsentRevisionRecord);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // The connection's storage kernel: nested calls join, other requests wait their turn instead of
    // landing inside this transaction (plan: ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md).
    return sqliteKernel(this.db).transaction(fn);
  }
}
