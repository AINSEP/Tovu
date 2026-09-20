/**
 * @file `TrashAdapter` for media assets. Marker: `media.status` (`"active" | "trashed"`).
 *
 * `hide`/`unhide` are plain column SQL against `content.db` — the `media` table is part of this
 * repo's Drizzle schema even though the media WRITE SERVICE lives in `@jini-ai/cms`, so no Jini
 * change is needed to move the marker.
 *
 * `purge` is the exception and is injected. Removing a media row is not just a row delete: blob and
 * rendition rows hang off it and the blob store holds bytes on disk. `@jini-ai/cms`'s `purgeMedia`
 * already owns that ladder (rendition rows, then the media row, then the blob-GC tombstone pass),
 * so the composition root binds it in rather than this file reimplementing it in SQL and silently
 * orphaning bytes.
 */
import type Database from "better-sqlite3";

import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "../ports.js";
import { flipMarker } from "./marker-sql.js";

export const MEDIA_ENTITY_TYPE = "media";

const MEDIA_TABLE = "media";
const MEDIA_HIDDEN_STATUS = "trashed";
const MEDIA_LIVE_STATUS = "active";

export interface MediaTrashAdapterDeps {
  client: Database.Database;
  /**
   * Bound at the composition root to `@jini-ai/cms`'s `purgeMedia`. Resolves `"already-gone"` for
   * an asset that is no longer there rather than throwing, so a sweeper retry is free.
   */
  purgeAsset(required: { workspaceId: string; entityId: string }): Promise<void>;
}

/** @complexity O(1) to build. */
export function createMediaTrashAdapter(deps: MediaTrashAdapterDeps): TrashAdapter {
  const { client } = deps;

  /** Reads just the version column — never the asset. @complexity O(1). */
  function currentVersion(workspaceId: string, entityId: string): number | null {
    const row = client
      .prepare(`SELECT version FROM "${MEDIA_TABLE}" WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, entityId) as { version: number } | undefined;
    return row ? row.version : null;
  }

  return {
    entityType: MEDIA_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: MEDIA_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [MEDIA_HIDDEN_STATUS, required.at],
        fromPredicate: "status <> ?",
        fromParams: [MEDIA_HIDDEN_STATUS],
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipMarker({
        client,
        table: MEDIA_TABLE,
        setSql: "status = ?, updated_at = ?",
        setParams: [MEDIA_LIVE_STATUS, required.at],
        fromPredicate: "status <> ?",
        fromParams: [MEDIA_LIVE_STATUS],
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      });
    },

    /**
     * Version check first, THEN the injected blob-aware purge.
     *
     * Checked rather than folded into a `DELETE … AND version = ?` because the row deletion itself
     * belongs to `purgeMedia`; doing the compare here keeps "a restore always beats a purge" true
     * without this adapter having to own the blob ladder.
     *
     * @complexity O(1) plus `purgeAsset`.
     */
    async purge(required): Promise<TrashPurgeOutcome> {
      const version = currentVersion(required.workspaceId, required.entityId);
      if (version === null) return "already-gone";
      if (required.expectedVersion !== null && version !== required.expectedVersion) return "version-changed";
      await deps.purgeAsset({ workspaceId: required.workspaceId, entityId: required.entityId });
      return currentVersion(required.workspaceId, required.entityId) === null ? "purged" : "version-changed";
    },
  };
}
