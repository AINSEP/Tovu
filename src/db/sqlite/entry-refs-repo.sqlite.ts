import { and, eq } from "drizzle-orm";

import { entryRefs } from "../schema.js";
import type { ContentDb } from "./content-db.js";
import type { UUID } from "@jini-ai/cms/core";
import type { EntryRefsRepoPort } from "../../core/entry-refs/ports.js";
import type { EntryRefRow, EntryRefSourceKind, EntryRefTargetKind } from "../../core/entry-refs/types.js";

/**
 * @file Real SQLite `EntryRefsRepoPort` adapter (ADR-006 rule-of-two "second adapter" half —
 * `core/entry-refs/repo.memory.ts`'s `InMemoryEntryRefsRepo` is the first), mirroring
 * `navigation/repo.sqlite.ts`'s `SqliteNavLocationBindingRepo` shape: `replaceForSource`/
 * `rebuildForWorkspace` are delete-then-insert (no per-row upsert race window, matching
 * `SqliteNavLocationBindingRepo.rebuildForWorkspace`'s own documented approach) since `entry_refs`
 * is a derived, rebuildable index (INV-06), never hand-patched row by row.
 *
 * Lives in `db/sqlite` rather than colocated with the port in `core/entry-refs` — same placement
 * `core/gated-mutations/ports.ts`'s `DbOpsPort` already uses (port in core, concrete SQLite
 * adapter in `db/sqlite/db-ops.ts`) — so `core` never has to import concrete `db` types to host
 * its own adapter.
 *
 * Architectural role:
 * Infrastructure adapter. `core/entry-refs` domain logic never imports this file directly — only
 * the composition root wires it in behind `EntryRefsRepoPort`.
 */

type Row = typeof entryRefs.$inferSelect;

function toRecord(row: Row): EntryRefRow {
  return {
    workspaceId: row.workspaceId,
    sourceEntryId: row.sourceEntryId,
    sourceKind: row.sourceKind as EntryRefSourceKind,
    fieldPath: row.fieldPath,
    targetKind: row.targetKind as EntryRefTargetKind,
    targetId: row.targetId,
  };
}

function toValues(row: EntryRefRow) {
  return {
    workspaceId: row.workspaceId,
    sourceEntryId: row.sourceEntryId,
    sourceKind: row.sourceKind,
    fieldPath: row.fieldPath,
    targetKind: row.targetKind,
    targetId: row.targetId,
  };
}

export class SqliteEntryRefsRepo implements EntryRefsRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByTarget(required: { workspaceId: UUID; targetKind: EntryRefTargetKind; targetId: UUID }): Promise<EntryRefRow[]> {
    const rows = this.db
      .select()
      .from(entryRefs)
      .where(
        and(
          eq(entryRefs.workspaceId, required.workspaceId),
          eq(entryRefs.targetKind, required.targetKind),
          eq(entryRefs.targetId, required.targetId)
        )
      )
      .all();
    return rows.map(toRecord);
  }

  async findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]> {
    const rows = this.db
      .select()
      .from(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .all();
    return rows.map(toRecord);
  }

  /**
   * Delete-then-insert for one source entry — the entry_refs slice for that source is always
   * fully replaced, never incrementally patched (matches `EntryRefsRepoPort.replaceForSource`'s
   * own doc: "idempotent re-extraction on every write — never an incremental patch").
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   * @overallScore 100
   */
  async replaceForSource(required: { workspaceId: UUID; sourceEntryId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    this.db
      .delete(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .run();
    if (required.refs.length === 0) return;
    this.db.insert(entryRefs).values(required.refs.map(toValues)).run();
  }

  async removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void> {
    this.db
      .delete(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .run();
  }

  /**
   * Full workspace rebuild — the index is derived + rebuildable by definition (matches
   * `SqliteNavLocationBindingRepo.rebuildForWorkspace`'s identical delete-then-bulk-insert shape).
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   * @overallScore 100
   */
  async rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    this.db.delete(entryRefs).where(eq(entryRefs.workspaceId, required.workspaceId)).run();
    if (required.refs.length === 0) return;
    this.db.insert(entryRefs).values(required.refs.map(toValues)).run();
  }
}
