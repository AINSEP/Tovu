import type { Insertable, Selectable } from "kysely";

import type { ContentDatabase } from "../content-database.generated.js";
import type { ContentKernel } from "../content-kernel.js";
import type { UUID } from "@jini-ai/cms/core";
import type { EntryRefsRepoPort } from "#src/contracts/core/entry-refs/ports";
import type { EntryRefRow, EntryRefSourceKind, EntryRefTargetKind } from "#src/contracts/core/entry-refs/types";

/**
 * @file THE durable `EntryRefsRepoPort` adapter (ADR-006 rule-of-two "second adapter" half —
 * `core/entry-refs/repo.memory.ts`'s `InMemoryEntryRefsRepo` is the first): one Kysely query body
 * for every dialect the storage kernel drives. `sqlite/entry-refs-repo.sqlite.ts` keeps the
 * `SqliteEntryRefsRepo` name as a thin subclass the composition root builds from the content db.
 *
 * `replaceForSource`/`rebuildForWorkspace` are delete-then-insert inside one `kernel.transaction`
 * (no per-row upsert race window) since `entry_refs` is a derived, rebuildable index (INV-06),
 * never hand-patched row by row. Reads order by the surrogate `id`, i.e. insertion order, on every
 * dialect.
 *
 * Lives in `db` rather than colocated with the port in `core/entry-refs` so `core` never has to
 * import concrete `db` types; only the composition root wires it in behind `EntryRefsRepoPort`.
 */

type EntryRefsDbRow = Selectable<ContentDatabase["entry_refs"]>;

function toRecord(row: EntryRefsDbRow): EntryRefRow {
  return {
    workspaceId: row.workspace_id,
    sourceEntryId: row.source_entry_id,
    sourceKind: row.source_kind as EntryRefSourceKind,
    fieldPath: row.field_path,
    targetKind: row.target_kind as EntryRefTargetKind,
    targetId: row.target_id,
  };
}

function toRow(ref: EntryRefRow): Insertable<ContentDatabase["entry_refs"]> {
  return {
    workspace_id: ref.workspaceId,
    source_entry_id: ref.sourceEntryId,
    source_kind: ref.sourceKind,
    field_path: ref.fieldPath,
    target_kind: ref.targetKind,
    target_id: ref.targetId,
  };
}

export class SqlEntryRefsRepo implements EntryRefsRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByTarget(required: { workspaceId: UUID; targetKind: EntryRefTargetKind; targetId: UUID }): Promise<EntryRefRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("entry_refs")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("target_kind", "=", required.targetKind)
        .where("target_id", "=", required.targetId)
        .orderBy("id")
        .execute()
    );
    return rows.map(toRecord);
  }

  async findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("entry_refs")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("source_entry_id", "=", required.sourceEntryId)
        .orderBy("id")
        .execute()
    );
    return rows.map(toRecord);
  }

  /**
   * Delete-then-insert for one source entry — the entry_refs slice for that source is always
   * fully replaced, never incrementally patched (matches `EntryRefsRepoPort.replaceForSource`'s
   * own doc: "idempotent re-extraction on every write — never an incremental patch").
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   */
  async replaceForSource(required: { workspaceId: UUID; sourceEntryId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.removeBySource(required);
      await this.insertAll(required.refs);
    });
  }

  async removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("entry_refs")
        .where("workspace_id", "=", required.workspaceId)
        .where("source_entry_id", "=", required.sourceEntryId)
        .execute()
    );
  }

  /**
   * Full workspace rebuild — the index is derived + rebuildable by definition.
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   */
  async rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) => db.deleteFrom("entry_refs").where("workspace_id", "=", required.workspaceId).execute());
      await this.insertAll(required.refs);
    });
  }

  private async insertAll(refs: readonly EntryRefRow[]): Promise<void> {
    if (refs.length === 0) return;
    await this.kernel.run((db) => db.insertInto("entry_refs").values(refs.map(toRow)).execute());
  }
}

/** The entry-refs repo for `kernel`. */
export function entryRefsRepoFor(kernel: ContentKernel): SqlEntryRefsRepo {
  return new SqlEntryRefsRepo(kernel);
}
