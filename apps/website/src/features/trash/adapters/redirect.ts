/**
 * @file `TrashAdapter` for redirects. Marker: `redirects.status = 'disabled'`.
 *
 * NOTE for anyone reading the design doc alongside this: §6 of
 * `2026-09-20-trash-delete-architecture.md` guesses the literal `'tombstoned'`. It is wrong, and
 * the doc says the implementer must check. `RedirectStatus` is `"active" | "disabled"` and
 * `tombstoneRedirect` writes `"disabled"` (`features/redirects/redirects.ts`). The tombstone is
 * additionally recorded as a `redirect_revisions.tombstoned = 1` row, which is what the backfill
 * uses to tell a deleted redirect from one an operator merely switched off.
 */
import type Database from "better-sqlite3";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";
import { compareAndDelete, flipMarker } from "./marker-sql.js";

export const REDIRECT_ENTITY_TYPE = "redirect";

const REDIRECTS_TABLE = "redirects";
const REDIRECT_REVISIONS_TABLE = "redirect_revisions";
const REDIRECT_HITS_TABLE = "redirect_hits";

const REDIRECT_HIDDEN_STATUS = "disabled";
const REDIRECT_LIVE_STATUS = "active";

/** @complexity O(1) to build. */
export function createRedirectTrashAdapter(client: Database.Database): TrashAdapter {
  return {
    entityType: REDIRECT_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: REDIRECTS_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [REDIRECT_HIDDEN_STATUS, required.at],
        fromPredicate: "status <> ?",
        fromParams: [REDIRECT_HIDDEN_STATUS],
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: REDIRECTS_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [REDIRECT_LIVE_STATUS, required.at],
        fromPredicate: "status <> ?",
        fromParams: [REDIRECT_LIVE_STATUS],
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    /** @complexity O(r) for r revisions of the one redirect. */
    async purge(required): Promise<TrashPurgeOutcome> {
      return compareAndDelete({
        client,
        table: REDIRECTS_TABLE,
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
        cascade: ({ workspaceId, entityId }) => {
          client
            .prepare(`DELETE FROM "${REDIRECT_REVISIONS_TABLE}" WHERE workspace_id = ? AND redirect_id = ?`)
            .run(workspaceId, entityId);
          client
            .prepare(`DELETE FROM "${REDIRECT_HITS_TABLE}" WHERE workspace_id = ? AND redirect_id = ?`)
            .run(workspaceId, entityId);
        },
      });
    },
  };
}
