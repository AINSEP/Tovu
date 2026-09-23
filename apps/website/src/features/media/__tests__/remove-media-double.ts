/**
 * @file Test double for the media delete path's `removeMedia` seam.
 *
 * Deliberately NOT a second Trash implementation. It drives the SAME
 * `createRecordStoreTrashAdapter` the hermetic composition root uses, so the marker flip, the
 * version bump and the already-trashed idempotency are the real ones. Only the index half (which
 * needs `content.db`) is absent; `removed` records what the index would have been handed.
 *
 * Tests that care about the index half use the real service against real SQLite
 * (`server/__tests__/admin-media-routes.test.ts`, `features/trash/__tests__/`). Keeping the two
 * apart is what stops a drifting second Trash appearing in the media suites.
 */
import { createRecordStoreTrashAdapter, MEDIA_ENTITY_TYPE } from "#src/features/trash/index";

import type { MediaRecord } from "../index.js";
import type { RemoveMediaFn } from "../tool-registrations.js";

/** One recorded call, in the shape a `trashed_items` row is built from. */
export interface RecordedMediaRemoval {
  id: string;
  display: { title: string; subtitle?: string | null };
  expectedVersion: number | null;
}

interface MinimalMediaStore {
  findById(required: { workspaceId: string; id: string }): Promise<MediaRecord | null>;
  save(record: MediaRecord): Promise<void>;
}

/**
 * Binds `removeMedia` to the record-store adapter over `mediaRepo`.
 *
 * @param mediaRepo the same repo the test hands the media tools/routes.
 * @returns the bound function plus the list of calls it has recorded.
 * @complexity O(1) per call.
 */
export function makeRemoveMediaDouble(mediaRepo: MinimalMediaStore): {
  removeMedia: RemoveMediaFn;
  removed: RecordedMediaRemoval[];
} {
  const removed: RecordedMediaRemoval[] = [];
  const adapter = createRecordStoreTrashAdapter<MediaRecord>({
    entityType: MEDIA_ENTITY_TYPE,
    store: mediaRepo,
    isHidden: (record) => record.status === "trashed",
    hidden: (record, at) => ({ ...record, status: "trashed", updatedAt: at }),
    shown: (record, at) => ({ ...record, status: "active", updatedAt: at }),
  });

  return {
    removed,
    removeMedia: async (required) => {
      removed.push({ id: required.id, display: required.display, expectedVersion: required.expectedVersion });
      return adapter.hide({
        workspaceId: required.workspaceId,
        entityId: required.id,
        at: required.at,
        expectedVersion: required.expectedVersion,
      });
    },
  };
}
