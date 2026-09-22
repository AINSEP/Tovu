/**
 * @file `withRestoreFollowUp` — lets one Trash type finish a restore its marker column alone cannot
 * express, without teaching the generic table adapter anything about that type.
 *
 * The one user today is `widget`: a legacy widget adopted into the Trash keeps its old
 * `trash`/`purged` payload status while it is there (an older site build that knows nothing about
 * `entries.deleted_at` still reads that payload), and records `"active"` as the Trash row's
 * `priorMarker`. Clearing `deleted_at` brings the row back; the follow-up — the widgets domain's own
 * function, bound at the composition root — applies the recorded status to the payload.
 *
 * The follow-up runs inside the restore's transaction (`TrashPort.restore` wraps `unhide` in it), so
 * a failed follow-up rolls the whole restore back: the entity stays in the Trash, never half-restored.
 */
import type { TrashAdapter } from "./ports.js";

/** Finishes one restore. Receives the Trash row's stored `priorMarker`; never called without one. */
export type RestoreFollowUp = (required: {
  workspaceId: string;
  entityId: string;
  priorMarker: string;
  at: string;
}) => Promise<void>;

/**
 * Wraps `adapter` so a successful `unhide` that carries a `priorMarker` also runs `followUp`.
 * `hide` and `purge` pass through untouched, and an `unhide` with no `priorMarker` (every entity
 * trashed the normal way) never calls it.
 *
 * @complexity O(1) beyond the adapter's own `unhide` and the follow-up.
 */
export function withRestoreFollowUp(required: { adapter: TrashAdapter; followUp: RestoreFollowUp }): TrashAdapter {
  const { adapter, followUp } = required;
  return {
    entityType: adapter.entityType,
    hide: (hideRequired) => adapter.hide(hideRequired),
    purge: (purgeRequired) => adapter.purge(purgeRequired),
    async unhide(unhideRequired) {
      const result = await adapter.unhide(unhideRequired);
      const { priorMarker } = unhideRequired;
      if (result.ok && typeof priorMarker === "string") {
        await followUp({
          workspaceId: unhideRequired.workspaceId,
          entityId: unhideRequired.entityId,
          priorMarker,
          at: unhideRequired.at,
        });
      }
      return result;
    },
  };
}
