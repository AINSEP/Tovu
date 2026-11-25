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
import type { TrashAdapter, TrashMarkerResult, TrashPurgeOutcome } from "@jini-ai/cms/trash";
import { MediaStillReferencedError } from "@jini-ai/cms/media";
import { flipMarker, lazyKernel } from "@jini-ai/cms/trash/site/adapters/marker-sql";
import type { TrashDb as MarkerStore } from "../db-port.js";

export const MEDIA_ENTITY_TYPE = "media";

const MEDIA_TABLE = "media";
const MEDIA_HIDDEN_STATUS = "trashed";
const MEDIA_LIVE_STATUS = "active";

export interface MediaTrashAdapterDeps {
  /** The content kernel, or (while call sites still hold one) the `content.db` handle. */
  db: MarkerStore;
  /**
   * Bound at the composition root to `@jini-ai/cms`'s `purgeMedia`. Resolves `"already-gone"` for
   * an asset that is no longer there rather than throwing, so a sweeper retry is free.
   */
  purgeAsset(required: { workspaceId: string; entityId: string }): Promise<void>;
  /**
   * Told of each committed trash or restore INSIDE the marker flip's transaction (P10-M5.T2), so what
   * it writes (an outbox row) commits or rolls back with the flip. Purge reports through the media
   * repo's own sink, since `purgeAsset` deletes the row there.
   */
  changes?: { changed(required: { workspaceId: string; mediaId: string; kind: string; marker: string }): Promise<void> };
}

/** @complexity O(1) to build. */
export function createMediaTrashAdapter(deps: MediaTrashAdapterDeps): TrashAdapter {
  const kernel = lazyKernel({ store: deps.db });

  /** Reads just the version column — never the asset. @complexity O(1). */
  async function currentVersion({ workspaceId, entityId }: { workspaceId: string; entityId: string }, _optional = {}): Promise<number | null> {
    const row = await kernel().run((db) =>
      db.selectFrom("media").select("version").where("workspace_id", "=", workspaceId).where("id", "=", entityId).executeTakeFirst()
    );
    return row ? Number(row.version) : null;
  }

  /**
   * The marker flip and its change report as ONE transaction (nested `transaction()` joins). Only a
   * flip that moved the row reports; the marker names the version and time it wrote.
   * @complexity O(1) plus the sink.
   */
  async function flipAndReport(required: { at: string; flip: () => Promise<TrashMarkerResult>; workspaceId: string; entityId: string }, _optional = {}): Promise<TrashMarkerResult> {
    const k = kernel();
    return k.transaction(async () => {
      const result = await required.flip();
      if (!result.ok || !deps.changes) return result;
      const row = await k.run((db) => db.selectFrom("media").select(["kind", "version", "updated_at"])
        .where("workspace_id", "=", required.workspaceId).where("id", "=", required.entityId).executeTakeFirst());
      if (row && row.updated_at === required.at) {
        await deps.changes.changed({ workspaceId: required.workspaceId, mediaId: required.entityId, kind: row.kind, marker: `v${Number(row.version)}:${row.updated_at}` });
      }
      return result;
    });
  }

  return {
    entityType: MEDIA_ENTITY_TYPE,

    async hide(required): Promise<TrashMarkerResult> {
      return flipAndReport({ at: required.at, workspaceId: required.workspaceId, entityId: required.entityId, flip: () => flipMarker({
        kernel: kernel(),
        table: MEDIA_TABLE,
        set: { status: MEDIA_HIDDEN_STATUS, updated_at: required.at },
        from: { column: "status", op: "<>", value: MEDIA_HIDDEN_STATUS },
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      }) });
    },

    async unhide(required): Promise<TrashMarkerResult> {
      return flipAndReport({ at: required.at, workspaceId: required.workspaceId, entityId: required.entityId, flip: () => flipMarker({
        kernel: kernel(),
        table: MEDIA_TABLE,
        set: { status: MEDIA_LIVE_STATUS, updated_at: required.at },
        from: { column: "status", op: "<>", value: MEDIA_LIVE_STATUS },
        workspaceId: required.workspaceId,
        entityId: required.entityId,
        expectedVersion: required.expectedVersion,
      }) });
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
      const version = await currentVersion({ workspaceId: required.workspaceId, entityId: required.entityId });
      if (version === null) return "already-gone";
      if (required.expectedVersion !== null && version !== required.expectedVersion) return "version-changed";
      try {
        await deps.purgeAsset({ workspaceId: required.workspaceId, entityId: required.entityId });
      } catch (error) {
        if (error instanceof MediaStillReferencedError) return "still-referenced";
        throw error;
      }
      return (await currentVersion({ workspaceId: required.workspaceId, entityId: required.entityId })) === null ? "purged" : "version-changed";
    },
  };
}
