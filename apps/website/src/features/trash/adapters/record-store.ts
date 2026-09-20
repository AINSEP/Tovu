/**
 * @file A `TrashAdapter` over a plain record store, for compositions with no `content.db`.
 *
 * The four durable adapters flip their marker with column SQL, which is what lets them move a row
 * whose payload is corrupt. A composition backed by in-memory repos (`server/runtime/composition/
 * app.ts`'s hermetic root, and the static exporter that shares it) has no SQL to issue, so it gets
 * this instead: the same three methods, driven through the repo's own record API.
 *
 * This is NOT a second implementation of the Trash. It holds no `trashed_items` knowledge at all —
 * `TrashService` still owns the index write and the transaction. All this supplies is the domain
 * half of the flip for a store that speaks records rather than columns.
 */
import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";

/** The narrowest shape a marker flip needs. `InMemoryPostRepo` and its siblings all satisfy it. */
export interface TrashRecordStore<T extends { version: number }> {
  findById(required: { workspaceId: string; id: string }): Promise<T | null>;
  save(record: T): Promise<void>;
}

export interface RecordStoreTrashAdapterDeps<T extends { version: number }> {
  entityType: string;
  store: TrashRecordStore<T>;
  /** Returns the record with its marker set to hidden (and `updatedAt` stamped). Pure. */
  hidden(record: T, at: string): T;
  /** Returns the record with its marker cleared. Pure. */
  shown(record: T, at: string): T;
  /** True when the record is already hidden — makes a repeated flip a no-op rather than an error. */
  isHidden(record: T): boolean;
  /**
   * Physically removes the record. OPTIONAL: a store with no delete simply omits it, and `purge`
   * then reports `"version-changed"` — the sweeper stands down and retries, which is the safe
   * outcome. Nothing ever claims to have purged something it did not.
   */
  hardDelete?(required: { workspaceId: string; id: string }): Promise<void>;
}

/** @complexity O(1) to build; every method is one store read plus at most one store write. */
export function createRecordStoreTrashAdapter<T extends { version: number }>(
  deps: RecordStoreTrashAdapterDeps<T>
): TrashAdapter {
  async function flip(
    required: { workspaceId: string; entityId: string; at: string; expectedVersion: number | null },
    direction: "hide" | "unhide"
  ): Promise<TrashMarkerResult> {
    const existing = await deps.store.findById({ workspaceId: required.workspaceId, id: required.entityId });
    if (!existing) return { ok: false, reason: "not-found" };
    if (required.expectedVersion !== null && existing.version !== required.expectedVersion) {
      return { ok: false, reason: "version-changed" };
    }
    const alreadyThere = direction === "hide" ? deps.isHidden(existing) : !deps.isHidden(existing);
    if (alreadyThere) return { ok: true, version: existing.version };

    const moved = direction === "hide" ? deps.hidden(existing, required.at) : deps.shown(existing, required.at);
    const next = { ...moved, version: existing.version + 1 };
    await deps.store.save(next);
    return { ok: true, version: next.version };
  }

  return {
    entityType: deps.entityType,
    hide: (required) => flip(required, "hide"),
    unhide: (required) => flip(required, "unhide"),

    async purge(required): Promise<TrashPurgeOutcome> {
      const existing = await deps.store.findById({ workspaceId: required.workspaceId, id: required.entityId });
      if (!existing) return "already-gone";
      if (required.expectedVersion !== null && existing.version !== required.expectedVersion) return "version-changed";

      await deps.hardDelete?.({ workspaceId: required.workspaceId, id: required.entityId });
      const after = await deps.store.findById({ workspaceId: required.workspaceId, id: required.entityId });
      return after === null ? "purged" : "version-changed";
    },
  };
}
