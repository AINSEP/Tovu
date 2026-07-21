/**
 * @file `EntryRefsRepoPort` — persistence seam for `entry_refs` (ADR-022 §5, SPEC-043 REQ-29..32).
 *
 * Purpose:
 * Rule-of-two port (two adapters: in-memory + SQLite). Written to ONLY by
 * `core/entry-refs/extractor.ts`'s `extractEntryRefs`, called from the single entries write
 * chokepoint, same transaction as the source entry's write — never a second write path.
 *
 * INTERFACES ONLY. No feature logic lives here.
 */
import type { UUID } from "../ports";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

export interface EntryRefsRepoPort {
  /** Where-used: every reference pointing AT a given target (REQ-34's disclosure, REQ-42's safe-delete check). */
  findByTarget(required: {
    workspaceId: UUID;
    targetKind: EntryRefTargetKind;
    targetId: UUID;
  }): Promise<EntryRefRow[]>;

  /** Every reference originating FROM a given source entry (re-extraction on update). */
  findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]>;

  /**
   * Replace every row for a given source entry with the freshly-extracted set
   * (idempotent re-extraction on every write — never an incremental patch).
   */
  replaceForSource(required: {
    workspaceId: UUID;
    sourceEntryId: UUID;
    refs: readonly EntryRefRow[];
  }): Promise<void>;

  /** Drop every row for a source entry (the source itself was force-purged). */
  removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void>;

  /** Full rebuild for a workspace from live entries — the index is derived + rebuildable by definition. */
  rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void>;
}
