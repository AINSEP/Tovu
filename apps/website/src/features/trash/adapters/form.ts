/**
 * @file `TrashAdapter` for form definitions. Marker: `form_definitions.deleted_at` (the posts model,
 * not a `status` value — see `schema.ts`'s doc comment on `formDefinitions.deletedAt` for why).
 *
 * `purge` is the one method here that is more than a `flipMarker`/`compareAndDelete` pair, and the
 * reason is a real FK: `form_submissions.form_definition_id` references this table `ON DELETE
 * restrict` (`content-db.ts` runs with `foreign_keys = ON`), so deleting the definition first would
 * throw. Submissions are removed first, then the definition, both inside whatever transaction the
 * caller (`purgeSelected`/the sweeper) already opened — a throw between the two rolls both back.
 *
 * `purge` also re-checks `deleted_at IS NULL` itself, ahead of `compareAndDelete`'s own version
 * check: `compareAndDelete` only compares `version`, so without this extra guard a live form whose
 * version happened to match a stale `expectedVersion` could have its submissions deleted before the
 * definition delete failed on a live row it should never have reached. This is the guarantee decision
 * 6 names: a purge can never destroy a live form or its visitor data.
 */
import type Database from "better-sqlite3";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";
import { compareAndDelete, flipMarker } from "./marker-sql.js";

export const FORM_ENTITY_TYPE = "form";

const FORM_DEFINITIONS_TABLE = "form_definitions";
const FORM_SUBMISSIONS_TABLE = "form_submissions";

/** @complexity O(1) to build. */
export function createFormTrashAdapter(client: Database.Database): TrashAdapter {
  return {
    entityType: FORM_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: FORM_DEFINITIONS_TABLE,
        setSql: "deleted_at = ?, updated_at = ?",
        setParams: [required.at, required.at],
        fromPredicate: "deleted_at IS NULL",
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: FORM_DEFINITIONS_TABLE,
        setSql: "deleted_at = NULL, updated_at = ?",
        setParams: [required.at],
        fromPredicate: "deleted_at IS NOT NULL",
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    /**
     * Submissions first, then the definition — see the file header for why the order cannot be
     * reversed and why `deleted_at` is re-checked here rather than left to `compareAndDelete` alone.
     *
     * @complexity O(s) for s submissions of the one form.
     */
    async purge(required): Promise<TrashPurgeOutcome> {
      const row = client
        .prepare(`SELECT version, deleted_at FROM "${FORM_DEFINITIONS_TABLE}" WHERE workspace_id = ? AND id = ?`)
        .get(required.workspaceId, required.entityId) as { version: number; deleted_at: string | null } | undefined;

      if (!row) return "already-gone";
      if (row.deleted_at === null) return "version-changed"; // never purge a live form
      if (required.expectedVersion !== null && row.version !== required.expectedVersion) return "version-changed";

      client
        .prepare(`DELETE FROM "${FORM_SUBMISSIONS_TABLE}" WHERE workspace_id = ? AND form_definition_id = ?`)
        .run(required.workspaceId, required.entityId);

      return compareAndDelete({
        client,
        table: FORM_DEFINITIONS_TABLE,
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },
  };
}
