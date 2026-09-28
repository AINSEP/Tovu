import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { RedirectDbHandle } from "./ports.internal.js";
import type { RedirectRepoPort } from "./ports.js";
import { toRecord, toRevision, toRevisionRow, toRow, updatableColumns } from "./repo.rows.js";
import { RedirectNotFoundError } from "./types.js";
import type { ListRedirectsFilter, RedirectRecord, RedirectRevision } from "./types.js";

/**
 * @file THE redirect repository: one Kysely query body for every database the storage kernel drives
 * (SQLite, PGlite, Postgres). Satisfies `RedirectRepoPort` and `RedirectDbHandle`. Every statement
 * goes through `kernel.run` and is awaited.
 *
 * `(workspace_id, from_pattern)` uniqueness is NOT re-enforced in `save()`: `redirects.ts`'s write
 * chokepoint is the sole enforcer (errors.spec.md names it as `REDIRECT_CONFLICT`'s producer) and
 * runs its `findByFromPattern` check inside `transaction()`, which takes the redirect write lock so
 * a concurrent chokepoint cannot interleave between that check and the write. `insertRedirect` /
 * `insertRevision` open no transaction of their own (ADR-PIPE-009 Decision A): atomicity is the
 * caller's, and nested calls join it.
 */

function compareTieBreak(a: RedirectRecord, b: RedirectRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aRecency = a.updatedAt || a.createdAt;
  const bRecency = b.updatedAt || b.createdAt;
  if (aRecency !== bRecency) return aRecency > bRecency ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Longest pattern first, then the shared tie-break. */
function compareLongestFirst(a: RedirectRecord, b: RedirectRecord): number {
  return b.fromPattern.length - a.fromPattern.length || compareTieBreak(a, b);
}

export class SqlRedirectRepo implements RedirectRepoPort, RedirectDbHandle {
  constructor(protected readonly kernel: ContentKernel) {}

  /** Every row of a workspace, optionally narrowed to active rows of one match type (and override-only). */
  private async rowsOf(
    workspaceId: string,
    narrow: { matchType?: string; activeOnly?: boolean; overrideOnly?: boolean } = {}
  ): Promise<RedirectRecord[]> {
    const rows = await this.kernel.run((db) => {
      let query = db.selectFrom("redirects").selectAll().where("workspace_id", "=", workspaceId);
      if (narrow.activeOnly) query = query.where("status", "=", "active");
      if (narrow.matchType !== undefined) query = query.where("match_type", "=", narrow.matchType);
      if (narrow.overrideOnly) query = query.where("override", "=", 1);
      return query.execute();
    });
    return rows.map(toRecord);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<RedirectRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("redirects")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async lookupExact(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = (
      await this.rowsOf(required.workspaceId, {
        activeOnly: true,
        matchType: "exact",
        overrideOnly: required.includeOverrideOnly,
      })
    ).filter((r) => r.fromPattern === required.path);
    candidates.sort(compareTieBreak);
    return candidates[0] ?? null;
  }

  async lookupLongestPrefix(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = (
      await this.rowsOf(required.workspaceId, {
        activeOnly: true,
        matchType: "prefix",
        overrideOnly: required.includeOverrideOnly,
      })
    ).filter((r) => {
      const pattern = r.fromPattern;
      if (required.path === pattern) return true;
      return required.path.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`);
    });
    candidates.sort(compareLongestFirst);
    return candidates[0] ?? null;
  }

  async listDynamic(required: {
    workspaceId: string;
    includeOverrideOnly: boolean;
    limit: number;
  }): Promise<RedirectRecord[]> {
    const candidates = await this.rowsOf(required.workspaceId, {
      activeOnly: true,
      matchType: "wildcard",
      overrideOnly: required.includeOverrideOnly,
    });
    candidates.sort(compareLongestFirst);
    return candidates.slice(0, required.limit);
  }

  async list(filter: ListRedirectsFilter): Promise<RedirectRecord[]> {
    return (await this.rowsOf(filter.workspaceId))
      .filter((r) => filter.status === undefined || r.status === filter.status)
      .filter((r) => filter.source === undefined || r.source === filter.source)
      .filter((r) => filter.matchType === undefined || r.matchType === filter.matchType);
  }

  async findByFromPattern(required: {
    workspaceId: string;
    fromPattern: string;
  }): Promise<RedirectRecord | null> {
    const candidates = (await this.rowsOf(required.workspaceId, { activeOnly: true })).filter(
      (r) => r.fromPattern === required.fromPattern
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) => (a.matchType === "exact" ? 0 : 1) - (b.matchType === "exact" ? 0 : 1) || (a.id < b.id ? -1 : 1)
    );
    return candidates[0];
  }

  async save(required: { record: RedirectRecord; revision: RedirectRevision }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.lockKey(`redirects:${required.record.workspaceId}`);
      await this.insertRedirect(required.record);
      await this.insertRevision(required.revision);
    });
  }

  async tombstone(required: {
    workspaceId: string;
    id: string;
    revision: RedirectRevision;
  }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.lockKey(`redirects:${required.workspaceId}`);
      const existing = await this.findById({ workspaceId: required.workspaceId, id: required.id });
      if (!existing) throw new RedirectNotFoundError(`redirect '${required.id}' was not found`);
      await this.insertRedirect(required.revision.state);
      await this.insertRevision(required.revision);
    });
  }

  // -------------------------------------------------------------------
  // RedirectDbHandle (used by redirects.ts/capture.ts via ports.internal.ts)
  // -------------------------------------------------------------------

  /** Upsert-by-id; no transaction control of its own. */
  async insertRedirect(record: RedirectRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("redirects")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(updatableColumns(row)))
        .execute()
    );
  }

  /** Append-only insert; no transaction control of its own. */
  async insertRevision(revision: RedirectRevision): Promise<void> {
    await this.kernel.run((db) => db.insertInto("redirect_revisions").values(toRevisionRow(revision)).execute());
  }

  /** Test-only helper: the append-only revision ledger for one redirect, in seq order. */
  async listRevisionsForTests(redirectId: string): Promise<RedirectRevision[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("redirect_revisions")
        .selectAll()
        .where("redirect_id", "=", redirectId)
        .orderBy("seq", "asc")
        .execute()
    );
    return rows.map(toRevision);
  }

  /**
   * The chokepoint's transaction (C-001..004). Takes the redirect write lock first so its
   * uniqueness / chain-loop reads and the write that follows are one serialized unit; nested calls
   * (including `save`/`tombstone`) join it. `capture.ts` never calls this (Decision A).
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey("redirects:write");
      return fn();
    });
  }
}

/** The redirect repo for `kernel`. */
export function redirectRepoFor(kernel: ContentKernel): SqlRedirectRepo {
  return new SqlRedirectRepo(kernel);
}
