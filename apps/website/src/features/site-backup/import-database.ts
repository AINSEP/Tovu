import path from "node:path";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { createImportDatabase } from "@jini-ai/devops/backup/site/import-database";
import { siteTempRoot, SITE_TEMP_PREFIXES } from "#src/platform/temp/site-temp-roots";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { SHARE_LIMITS, SHARE_VERSION_MISMATCH_MESSAGE, IMPORT_SCHEMA_MISMATCH_EXIT_CODE, IMPORT_REFUSAL_EXIT_CODE, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";

export type { ImportWorkerChild, RebuildImportDatabaseOptions } from "@jini-ai/devops/backup/site/import-database";

/** The hostile-SQLite import helper bound to Tovu's redactor, limits, staging names and helper exit-code contract. */
const boundImportDatabase = createImportDatabase<ShareDatabaseProjection>({ host: {
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
export const { tidyImportDatabases, importWorkerLaunch } = boundImportDatabase;
/** P11: the helper stages in an owned, locked temp root (`tovu-import-db-`) that the temp-root tidy recognises; tests may inject their own. */
export const rebuildImportDatabase: typeof boundImportDatabase.rebuildImportDatabase = (required, optional = {}) =>
  boundImportDatabase.rebuildImportDatabase(required, { tempRoot: siteTempRoot({ prefix: SITE_TEMP_PREFIXES.importDatabase }), ...optional });
