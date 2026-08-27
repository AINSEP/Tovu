import type Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";

import { redirectRevisions, redirects as redirectsTable } from "../../db/schema.js";
import type { ContentDb } from "../../db/sqlite/content-db.js";
import { findOneBy } from "../../db/sqlite/repo-helpers.js";

import type { RedirectDbHandle } from "./ports.internal.js";
import type { RedirectRepoPort } from "./ports.js";
import { RedirectNotFoundError } from "./types.js";
import type {
  ListRedirectsFilter,
  RedirectMatchType,
  RedirectRecord,
  RedirectRevision,
  RedirectSource,
  RedirectStatus,
  RedirectStatusCode,
} from "./types.js";

/**
 * @file Drizzle/SQLite `RedirectRepoPort` adapter (rule-of-two adapter #2,
 * ADR-006/ADR-PIPE-009). Mirrors `settings/repo.sqlite.ts`'s manual
 * `BEGIN IMMEDIATE`/`COMMIT` transaction style (a synchronous drizzle
 * callback can't `await` the chokepoint's own repo calls).
 *
 * `(workspace_id, from_pattern)` exact-match uniqueness (behavior.spec.md
 * §5.1) is NOT re-enforced inside this adapter's `save()` — SQLite/Drizzle
 * can't express the needed partial-unique index through the builder here
 * (same disclosed limitation `settingDefinitions`' `ux_def_active` comment
 * carries), and `redirects.ts`'s write chokepoint is already the sole
 * enforcer of this invariant via `findByFromPattern` before ever calling
 * `save()` (errors.spec.md's Ownership table names the write chokepoint, not
 * the repo, as `REDIRECT_CONFLICT`'s producer). Re-checking here would be a
 * second, potentially-diverging source of truth for the same rule.
 *
 * Also satisfies `RedirectDbHandle` — `insertRedirect`/`insertRevision` issue
 * their raw `INSERT`s directly against the shared `ContentDb` handle with NO
 * transaction control of their own, exactly as `redirects.ts`'s chokepoint
 * (its own `BEGIN IMMEDIATE`/`COMMIT`) and `capture.ts` (an assumed ambient
 * transaction) both require (ADR-PIPE-009 Decision A).
 */

function toRecord(row: typeof redirectsTable.$inferSelect): RedirectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    matchType: row.matchType as RedirectMatchType,
    fromPattern: row.fromPattern,
    toTarget: row.toTarget,
    statusCode: row.statusCode as RedirectStatusCode,
    status: row.status as RedirectStatus,
    override: row.override === 1,
    priority: row.priority,
    source: row.source as RedirectSource,
    sourceEntryId: row.sourceEntryId ?? undefined,
    fromPathAtCapture: row.fromPathAtCapture ?? undefined,
    toPathAtCapture: row.toPathAtCapture ?? undefined,
    createdByPrincipal: row.createdByPrincipal,
    createdByPluginId: row.createdByPluginId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function toRow(record: RedirectRecord): typeof redirectsTable.$inferInsert {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    matchType: record.matchType,
    fromPattern: record.fromPattern,
    toTarget: record.toTarget,
    statusCode: record.statusCode,
    status: record.status,
    override: record.override ? 1 : 0,
    priority: record.priority,
    source: record.source,
    sourceEntryId: record.sourceEntryId ?? null,
    fromPathAtCapture: record.fromPathAtCapture ?? null,
    toPathAtCapture: record.toPathAtCapture ?? null,
    createdByPrincipal: record.createdByPrincipal,
    createdByPluginId: record.createdByPluginId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function toRevisionRow(revision: RedirectRevision): typeof redirectRevisions.$inferInsert {
  return {
    redirectId: revision.redirectId,
    workspaceId: revision.workspaceId,
    seq: revision.seq,
    stateJson: JSON.stringify(revision.state),
    tombstoned: revision.tombstoned ? 1 : 0,
    actorId: revision.actorId,
    pluginId: revision.pluginId ?? null,
    recordedAt: revision.recordedAt,
  };
}

function compareTieBreak(a: RedirectRecord, b: RedirectRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aRecency = a.updatedAt || a.createdAt;
  const bRecency = b.updatedAt || b.createdAt;
  if (aRecency !== bRecency) return aRecency > bRecency ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class SqliteRedirectRepo implements RedirectRepoPort, RedirectDbHandle {
  constructor(private readonly db: ContentDb) {}

  private allActive(workspaceId: string): RedirectRecord[] {
    return this.db
      .select()
      .from(redirectsTable)
      .where(eq(redirectsTable.workspaceId, workspaceId))
      .all()
      .map(toRecord);
  }

  async findById(required: { workspaceId: string; id: string }): Promise<RedirectRecord | null> {
    return findOneBy(
      this.db,
      redirectsTable,
      [eq(redirectsTable.workspaceId, required.workspaceId), eq(redirectsTable.id, required.id)],
      toRecord
    );
  }

  async lookupExact(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = this.allActive(required.workspaceId).filter(
      (r) =>
        r.status === "active" &&
        r.matchType === "exact" &&
        r.fromPattern === required.path &&
        (!required.includeOverrideOnly || r.override)
    );
    candidates.sort(compareTieBreak);
    return candidates[0] ?? null;
  }

  async lookupLongestPrefix(required: {
    workspaceId: string;
    path: string;
    includeOverrideOnly: boolean;
  }): Promise<RedirectRecord | null> {
    const candidates = this.allActive(required.workspaceId).filter((r) => {
      if (r.status !== "active" || r.matchType !== "prefix") return false;
      if (required.includeOverrideOnly && !r.override) return false;
      const pattern = r.fromPattern;
      if (required.path === pattern) return true;
      return required.path.startsWith(pattern.endsWith("/") ? pattern : `${pattern}/`);
    });
    candidates.sort((a, b) => b.fromPattern.length - a.fromPattern.length || compareTieBreak(a, b));
    return candidates[0] ?? null;
  }

  async listDynamic(required: {
    workspaceId: string;
    includeOverrideOnly: boolean;
    limit: number;
  }): Promise<RedirectRecord[]> {
    const candidates = this.allActive(required.workspaceId).filter(
      (r) => r.status === "active" && r.matchType === "wildcard" && (!required.includeOverrideOnly || r.override)
    );
    candidates.sort((a, b) => b.fromPattern.length - a.fromPattern.length || compareTieBreak(a, b));
    return candidates.slice(0, required.limit);
  }

  async list(filter: ListRedirectsFilter): Promise<RedirectRecord[]> {
    return this.allActive(filter.workspaceId)
      .filter((r) => filter.status === undefined || r.status === filter.status)
      .filter((r) => filter.source === undefined || r.source === filter.source)
      .filter((r) => filter.matchType === undefined || r.matchType === filter.matchType);
  }

  async findByFromPattern(required: {
    workspaceId: string;
    fromPattern: string;
  }): Promise<RedirectRecord | null> {
    const candidates = this.allActive(required.workspaceId).filter(
      (r) => r.status === "active" && r.fromPattern === required.fromPattern
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) => (a.matchType === "exact" ? 0 : 1) - (b.matchType === "exact" ? 0 : 1) || (a.id < b.id ? -1 : 1)
    );
    return candidates[0];
  }

  async save(required: { record: RedirectRecord; revision: RedirectRevision }): Promise<void> {
    await this.insertRedirect(required.record);
    await this.insertRevision(required.revision);
  }

  async tombstone(required: {
    workspaceId: string;
    id: string;
    revision: RedirectRevision;
  }): Promise<void> {
    const existing = await this.findById({ workspaceId: required.workspaceId, id: required.id });
    if (!existing) throw new RedirectNotFoundError(`redirect '${required.id}' was not found`);
    await this.insertRedirect(required.revision.state);
    await this.insertRevision(required.revision);
  }

  // -------------------------------------------------------------------
  // RedirectDbHandle (used by redirects.ts/capture.ts via ports.internal.ts)
  // -------------------------------------------------------------------

  /** Upsert-by-id — issues a raw `INSERT ... ON CONFLICT`, no transaction control of its own. */
  async insertRedirect(record: RedirectRecord): Promise<void> {
    const row = toRow(record);
    this.db
      .insert(redirectsTable)
      .values(row)
      .onConflictDoUpdate({ target: redirectsTable.id, set: row })
      .run();
  }

  /** Append-only insert — issues a raw `INSERT`, no transaction control of its own. */
  async insertRevision(revision: RedirectRevision): Promise<void> {
    this.db.insert(redirectRevisions).values(toRevisionRow(revision)).run();
  }

  /** Test-only helper: the append-only revision ledger for one redirect, in seq order. */
  listRevisionsForTests(redirectId: string): RedirectRevision[] {
    return this.db
      .select()
      .from(redirectRevisions)
      .where(eq(redirectRevisions.redirectId, redirectId))
      .orderBy(desc(redirectRevisions.seq))
      .all()
      .reverse()
      .map((r) => ({
        redirectId: r.redirectId,
        workspaceId: r.workspaceId,
        seq: r.seq,
        state: JSON.parse(r.stateJson) as RedirectRecord,
        tombstoned: r.tombstoned === 1,
        actorId: r.actorId,
        pluginId: r.pluginId ?? undefined,
        recordedAt: r.recordedAt,
      }));
  }

  /**
   * Manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` against the raw
   * better-sqlite3 handle (`db.$client`) — same rationale as
   * `settings/repo.sqlite.ts`'s `transaction()`: Drizzle's `db.transaction`
   * wrapper requires a *synchronous* callback, but `redirects.ts`'s chokepoint
   * callback does `await`ed repo calls. Used ONLY by `redirects.ts`'s
   * chokepoint (C-001..004) — `capture.ts` never calls this (Decision A: it
   * assumes an ambient transaction it did not open).
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = (this.db as unknown as { $client: Database.Database }).$client;
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
}
