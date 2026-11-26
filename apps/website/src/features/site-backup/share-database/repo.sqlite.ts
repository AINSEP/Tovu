import { sql } from "kysely";
import { listTables, listColumns } from "@jini-ai/db/kernel";
import { declareDataModule } from "@jini-ai/db/data-modules";
import { sqliteKernel, sqliteClientOf, sqliteConnectionOf, closeSqliteConnection } from "@jini-ai/db/kernel/sqlite";
import { sanitizeShareDatabase as sanitize, rewriteArchiveMedia as rewrite, prepareSharePluginTables as prepare, refuseUnknownShareTables as refuse } from "@jini-ai/devops/backup/site/share-database/projection";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { siteTempRoot, SITE_TEMP_PREFIXES } from "#src/platform/temp/site-temp-roots";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { PUBLISHABLE_SETTINGS } from "#src/contracts/core/settings-vocabulary";
import { backfillPostSearchIndex } from "@jini-ai/cms/posts/sql";
import { SHARE_TABLES, SHARE_LEGACY_PRIVATE_TABLES, SHARE_LIMITS } from "#src/features/site-backup/share-policy";
import { computeBlobStorageKey, documentContentType } from "#src/features/media/index";
import { openSqliteFileKernel } from "../../../platform/db/kernel/drivers/sqlite.js";
import { CHAT_TABLE_NAMES } from "../../../platform/db/sqlite/chat-orphan-check.js";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";

const host: Parameters<typeof sanitize>[0]["host"] = {
  deps: {
    listTables: required => listTables(required as unknown as Parameters<typeof listTables>[0]),
    listColumns: required => listColumns(required as unknown as Parameters<typeof listColumns>[0]),
    declareDataModule: required => declareDataModule(required as unknown as Parameters<typeof declareDataModule>[0]),
    sqliteKernel: required => sqliteKernel(required) as unknown as ReturnType<Parameters<typeof sanitize>[0]["host"]["deps"]["sqliteKernel"]>,
    sqliteClientOf: required => sqliteClientOf(required) as unknown as ReturnType<Parameters<typeof sanitize>[0]["host"]["deps"]["sqliteClientOf"]>,
    sqliteConnectionOf: required => sqliteConnectionOf(required as unknown as Parameters<typeof sqliteConnectionOf>[0]) as ReturnType<Parameters<typeof sanitize>[0]["host"]["deps"]["sqliteConnectionOf"]>,
    closeSqliteConnection,
  },
  SHARE_TABLES: [...SHARE_TABLES], SHARE_LEGACY_PRIVATE_TABLES, SHARE_LIMITS, CHAT_TABLE_NAMES: [...CHAT_TABLE_NAMES], PUBLISHABLE_SETTINGS,
  databaseCapMessage: "Database exceeds the 300 MiB cap.", insufficientStorageMessage: "Insufficient private staging space for this database share.",
  computeBlobStorageKey, documentContentType, redactSecretShapes,
  tempRoot: required => siteTempRoot({ prefix: SITE_TEMP_PREFIXES.shareProjection })(required),
  openSqliteFileKernel, openContentDb, backfillPostSearchIndex, sql,
  schemaErasedKernel: ({ store }) => schemaErasedKernel({ store: store as Parameters<typeof schemaErasedKernel>[0]["store"] }),
};

export function sanitizeShareDatabase(required: Omit<Parameters<typeof sanitize>[0], "host">, optional: Parameters<typeof sanitize>[1] = {}) {
  return sanitize({ ...required, host }, optional);
}

export function rewriteArchiveMedia(required: Omit<Parameters<typeof rewrite>[0], "host">, optional: Parameters<typeof rewrite>[1] = {}) {
  return rewrite({ ...required, host: { ...host, tempRoot: required => siteTempRoot({ prefix: SITE_TEMP_PREFIXES.archiveMedia })(required) } }, optional);
}

export function prepareSharePluginTables(required: Omit<Parameters<typeof prepare>[0], "host">, optional: Parameters<typeof prepare>[1] = {}) {
  return prepare({ ...required, host }, optional);
}

export function refuseUnknownShareTables(required: Omit<Parameters<typeof refuse>[0], "host">, _options = {}) {
  return refuse({ ...required, host });
}
