import { sanitizeShareDatabase as sanitizeWithModules } from "#src/features/site-backup/share-database/repo.sqlite";
import { rebuildImportDatabase as rebuildWithWorker, type RebuildImportDatabaseOptions as WorkerOptions } from "#src/features/site-backup/import-database";
import { FIRST_PARTY_DATA_MODULES } from "./data-modules.js";

export { rewriteArchiveMedia } from "#src/features/site-backup/share-database/repo.sqlite";
export { importWorkerLaunch } from "#src/features/site-backup/import-database";
export type RebuildImportDatabaseOptions = WorkerOptions & {
  /** This module's own URL: a `.ts` source run starts the helper through tsx, a build runs its `.js`. */
  moduleUrl?: string;
};

/** Bind this build's trusted declarations, never an archive's catalogue. @complexity O(1) binding. */
export function sanitizeShareDatabase(required: { snapshot: Buffer }, optional: Parameters<typeof sanitizeWithModules>[1] = {}) {
  return sanitizeWithModules({ ...required, modules: FIRST_PARTY_DATA_MODULES }, optional);
}

/** Select the trusted isolated worker shipped beside this composition root. @complexity O(1) binding. */
export function rebuildImportDatabase(required: { snapshot: Buffer }, optional: RebuildImportDatabaseOptions = {}) {
  return rebuildWithWorker({ ...required, moduleUrl: optional.moduleUrl ?? import.meta.url }, optional);
}
