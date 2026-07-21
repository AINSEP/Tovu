import type { UUID } from "../ports";
import type { EntryRefsRepoPort } from "./ports";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

/**
 * @file In-memory `EntryRefsRepoPort` adapter (ADR-006 rule-of-two "one being built now" half —
 * `repo.sqlite.ts` is the other). Backs hermetic tests/dev composition, mirroring
 * `navigation/repo.memory.ts`'s `InMemoryNavLocationBindingRepo` shape: a dumb, uniqueness-
 * enforcing (per source-entry replace) collection with no validation of its own — that's
 * `extractEntryRefs`'s job.
 *
 * Architectural role:
 * Infrastructure adapter (in-memory). No feature logic.
 */
export class InMemoryEntryRefsRepo implements EntryRefsRepoPort {
  private rows: EntryRefRow[] = [];

  async findByTarget(required: { workspaceId: UUID; targetKind: EntryRefTargetKind; targetId: UUID }): Promise<EntryRefRow[]> {
    return this.rows.filter(
      (row) =>
        row.workspaceId === required.workspaceId &&
        row.targetKind === required.targetKind &&
        row.targetId === required.targetId
    );
  }

  async findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]> {
    return this.rows.filter(
      (row) => row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId
    );
  }

  async replaceForSource(required: { workspaceId: UUID; sourceEntryId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    const others = this.rows.filter(
      (row) => !(row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId)
    );
    this.rows = [...others, ...required.refs];
  }

  async removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void> {
    this.rows = this.rows.filter(
      (row) => !(row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId)
    );
  }

  async rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    const others = this.rows.filter((row) => row.workspaceId !== required.workspaceId);
    this.rows = [...others, ...required.refs];
  }
}
