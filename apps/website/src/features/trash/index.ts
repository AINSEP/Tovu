/**
 * @file Public surface of the local admin Trash feature (phase 1 — Posts, Comments, Media,
 * Redirects). Design of record: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`.
 *
 * Domains deliberately do NOT import from here. They receive a pre-bound `RemoveEntity` through
 * their own dependency object, so nothing in `post.ts`, `redirects.ts`, the comments write-service
 * or the media route knows a Trash exists.
 */
export { TRASH_RETENTION_DAYS } from "./ports.js";
export type {
  ForgetRemovedEntity,
  PurgeItemOutcome,
  PurgeReport,
  RemoveEntity,
  RestoreOutcome,
  TrashActor,
  TrashAdapter,
  TrashDisplay,
  TrashEntityType,
  TrashItem,
  TrashItemAuthorizer,
  TrashMarkerResult,
  TrashPage,
  TrashPort,
  TrashPurgeOutcome,
  TrashRepoPort,
  TrashSweepClaim,
  TransactionRunner,
} from "./ports.js";

export {
  bindForgetRemovedEntity,
  bindRemoveEntity,
  computePurgeAfter,
  createTrashService,
  TrashAdapterMissingError,
} from "./write-service.js";
export type { TrashChangeEvent, TrashServiceDeps } from "./write-service.js";

export { moveToTrash } from "./move-to-trash.js";
export type { MoveToTrashOutcome } from "./move-to-trash.js";

export { buildTrashRegistry } from "./registry.js";
export type {
  TrashBlockerSpec,
  TrashCascadeSpec,
  TrashDisplaySpec,
  TrashEntry,
  TrashHiddenWithParentSpec,
  TrashMarkerSpec,
  TrashRegistry,
  TrashRegistrySchema,
} from "./registry.js";

export { createSqliteTrashDb } from "./db-port.sqlite.js";
export type { TrashDb, TrashDbAssignment, TrashDbRow } from "./db-port.js";

export { createTableTrashAdapter } from "./table-adapter.js";
export type { TrashedItemsRef } from "./table-adapter.js";
export { withFollowUps } from "./follow-ups.js";
export type { AfterPurge, BeforePurge, HideFollowUp, TrashFollowUpHooks, UnhideFollowUp } from "./follow-ups.js";

export { isTrashedRecord, notTrashed } from "./not-trashed.js";

export {
  filterVisibleTrashItems,
  mayActOnEntityType,
  trashDaysRemaining,
  trashPermissionFor,
  TRASH_PERMISSION_BY_ENTITY_TYPE,
  TRASH_READ_PERMISSION,
} from "./permissions.js";
export type { TrashAuthorizeFn } from "./permissions.js";

export {
  createTrashSweep,
  DEFAULT_TRASH_SWEEP_BATCH_SIZE,
  DEFAULT_TRASH_SWEEP_INTERVAL_MS,
  DEFAULT_TRASH_SWEEP_LEASE_MS,
  startTrashSweeper,
} from "./sweeper.js";
export type { TrashSweepDeps, TrashSweeper, TrashSweepOnce, TrashSweepReport } from "./sweeper.js";

export { createContentDbTransactionRunner, SqliteTrashRepo } from "./repo.sqlite.js";
export { InMemoryTrashRepo } from "./repo.memory.js";
export { decodeTrashCursor, encodeTrashCursor } from "./cursor.js";

export {
  deriveTrashItemRegistrations,
  TRASH_ITEM_DELEGATES,
  TRASH_ITEM_TOOL_ID,
  trashItemDerivedRisk,
} from "./trash-item-tool.js";
export type { TrashItemDelegate, TrashItemToolDeps } from "./trash-item-tool.js";

export { createPostTrashAdapter, POST_ENTITY_TYPE } from "./adapters/post.js";
export { createCommentTrashAdapter, COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
export { createMediaTrashAdapter, MEDIA_ENTITY_TYPE } from "./adapters/media.js";
export type { MediaTrashAdapterDeps } from "./adapters/media.js";
export { createRedirectTrashAdapter, REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
export { createRecordStoreTrashAdapter } from "./adapters/record-store.js";
export type { RecordStoreTrashAdapterDeps, TrashRecordStore } from "./adapters/record-store.js";
