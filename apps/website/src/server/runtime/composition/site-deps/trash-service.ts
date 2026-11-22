import { PLUGIN_ENTITY_TYPE } from "#src/features/trash/index";
import type { RemovePluginFn } from "@jini-ai/plugins/host";
import { TRASH_RETENTION_DAYS } from "#src/features/trash/index";
import { USER_ENTITY_TYPE } from "#src/features/trash/index";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { createContentDbTransactionRunner } from "#src/features/trash/index";
import { createTrashService } from "@jini-ai/cms/trash";
import { invalidateMediaAccessEvidence } from "#src/platform/media-access-evidence";
import { randomUUID } from "node:crypto";
import { unhideIfRemoveThrows, type createDirectoryTrashAdapter } from "@jini-ai/cms/trash/adapters/directory";
import { reportDirectoryRollbackFailure } from "#src/features/trash/index";
import type { SiteStore } from "../open-site-store.js";
import type { SqliteTrashRepo } from "#src/features/trash/index";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import type { SqlitePostRepo } from "#src/features/post/index";

interface ComposeTrashServiceRequired {
  kernel: SiteStore["content"];
  trashRepo: SqliteTrashRepo;
  trashAdapters: Map<string, TrashAdapter>;
  postRepo: () => SqlitePostRepo;
  pluginTrashAdapter: ReturnType<typeof createDirectoryTrashAdapter>;
  workspaceId: string;
}

export function composeTrashService(required: ComposeTrashServiceRequired, _optional = {}) {
  const { kernel, trashRepo, trashAdapters, postRepo, pluginTrashAdapter, workspaceId } = required;
  // Reentrant: `deletePost` and `tombstoneRedirect` already open their own transaction around
  // "marker + revision append", and `remove` is called from inside it (a nested one joins). Named (not inlined) because
  // the comments moderation service needs the SAME runner to wrap its own two writes.
  const trashTransaction = createContentDbTransactionRunner({ store: kernel });
  const trash = createTrashService({
    repo: trashRepo,
    adapters: trashAdapters,
    idGen: { newId: () => randomUUID() },
    // Trash flips post and widget markers through the kernel, past the repositories that clear media
    // access evidence on a save. Cleared after commit, so a read during the transaction cannot keep old
    // evidence. Cost: O(256) map clear per Trash action, then one rescan per asset on its next request.
    transaction: ({ work }) => trashTransaction(work).finally(() => invalidateMediaAccessEvidence({ owner: postRepo() })),
    entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
  }, {
    retentionDays: TRASH_RETENTION_DAYS,
    onError: ({ error }) => console.error("[trash] onChanged hook failed; the trash/restore/purge it followed already committed", error)
  });
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removePlugin: RemovePluginFn = unhideIfRemoveThrows({ onRollbackError: reportDirectoryRollbackFailure, adapter: pluginTrashAdapter, remove: bindRemoveEntity({
    trash: trash,
    entityType: PLUGIN_ENTITY_TYPE
  }) });
  // Delete-user plan v2 Slice 2 — `identity`'s `removeUser`/`isInTrash` overrides (see
  // `wiring.ts`'s `IdentityRouteDepsSlice.removeUser` doc for why identity itself cannot build
  // these: it wires before `trash`/`trashRepo` exist).
  const removeUser = bindRemoveEntity({
    trash: trash,
    entityType: USER_ENTITY_TYPE
  });
  const isInTrash = async ({ principalId }: { principalId: string }, _optional = {}): Promise<boolean> =>
    (await trashRepo.findByEntity({ workspaceId, entityType: USER_ENTITY_TYPE, entityId: principalId })) !== null;
  return { trashTransaction, trash, removePlugin, removeUser, isInTrash };
}
