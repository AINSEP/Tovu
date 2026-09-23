/**
 * @file Test double for `RedirectsWriteDeps.remove`.
 *
 * The real binding (`features/trash`) flips `redirects.status` with column SQL AND writes the Trash
 * index row in one transaction. A test running against `InMemoryRedirectRepo` has no `content.db`,
 * so it binds `remove` to the same record-store adapter the hermetic composition root uses — same
 * marker, same version bump, same idempotency, just without the index half.
 *
 * Tests that care about the index half use the real service (`features/trash/__tests__/`) against
 * real SQLite. Keeping the two apart stops a second, drifting Trash implementation appearing here.
 */
import { createRecordStoreTrashAdapter, REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";

import type { RemoveRedirectFn } from "../redirects.js";
import type { RedirectRecord } from "../types.js";

interface MinimalRedirectStore {
  findById(required: { workspaceId: string; id: string }): Promise<RedirectRecord | null>;
  insertRedirect(record: RedirectRecord): void | Promise<void>;
}

/**
 * Binds `remove` to the record-store adapter over `repo`.
 *
 * @param repo the same repo the test hands `tombstoneRedirect`.
 * @complexity O(1) per call.
 */
export function removeVia(repo: MinimalRedirectStore): RemoveRedirectFn {
  const adapter = createRecordStoreTrashAdapter<RedirectRecord>({
    entityType: REDIRECT_ENTITY_TYPE,
    store: {
      findById: (required) => repo.findById(required),
      save: async (record) => {
        await repo.insertRedirect(record);
      },
    },
    isHidden: (record) => record.status === "disabled",
    hidden: (record, at) => ({ ...record, status: "disabled", updatedAt: at }),
    shown: (record, at) => ({ ...record, status: "active", updatedAt: at }),
  });
  return (required) =>
    adapter.hide({
      workspaceId: required.workspaceId,
      entityId: required.id,
      at: required.at,
      expectedVersion: required.expectedVersion,
    });
}
