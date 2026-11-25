import path from "node:path";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { createImportDatabase } from "@jini-ai/devops/backup/site/import-database";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { SHARE_LIMITS, SHARE_VERSION_MISMATCH_MESSAGE, IMPORT_SCHEMA_MISMATCH_EXIT_CODE, IMPORT_REFUSAL_EXIT_CODE, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";

export type { ImportWorkerChild, RebuildImportDatabaseOptions } from "@jini-ai/devops/backup/site/import-database";

/** The hostile-SQLite import helper bound to Tovu's redactor, limits, staging names and helper exit-code contract. */
export const { rebuildImportDatabase, tidyImportDatabases, importWorkerLaunch } = createImportDatabase<ShareDatabaseProjection>({ host: {
  redact: redactSecretShapes,
  withFileLock,
  limits: SHARE_LIMITS,
  stagingPrefix: "tovu-import-db-",
  helperStem: "./import-database/repo.sqlite",
  versionMismatchMessage: SHARE_VERSION_MISMATCH_MESSAGE,
  schemaMismatchExitCode: IMPORT_SCHEMA_MISMATCH_EXIT_CODE,
  refusalExitCode: IMPORT_REFUSAL_EXIT_CODE,
  workerEnv: ({ root }) => ({ TOVU_DESKTOP_USER_DATA_DIR: path.join(root, "profile") }),
  inheritedEnv: () => ({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }),
} });
