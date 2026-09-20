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
export type { TrashServiceDeps } from "./write-service.js";

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

export { createPostTrashAdapter, POST_ENTITY_TYPE } from "./adapters/post.js";
export { createCommentTrashAdapter, COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
export { createMediaTrashAdapter, MEDIA_ENTITY_TYPE } from "./adapters/media.js";
export type { MediaTrashAdapterDeps } from "./adapters/media.js";
export { createRedirectTrashAdapter, REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
export { createRecordStoreTrashAdapter } from "./adapters/record-store.js";
export type { RecordStoreTrashAdapterDeps, TrashRecordStore } from "./adapters/record-store.js";
