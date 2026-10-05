/** @file Storage kernel public surface: the port, its drivers, and the dialect helpers. See `port.ts`. */
export {
  type StorageCapabilities,
  type StorageCapability,
  type StorageDialect,
  type StorageKernel,
  type StorageTransport,
  UnsupportedCapabilityError,
} from "./port.js";
export {
  closeSqliteConnection,
  openSqliteFileKernel,
  type SqliteConnectionSource,
  sqliteKernel,
  type SqliteKernel,
} from "./drivers/sqlite.js";
export { StorageOpError, StorageOpNotSupportedError, type StorageOps, storageOps } from "./ops.js";
export { openPgliteKernel, type PgKernel } from "./drivers/pglite.js";
export { openPostgresKernel } from "./drivers/postgres.js";
export {
  autoIdColumnSql,
  checkpointWal,
  type ColumnAffinity,
  type ColumnInfo,
  columnTypeSql,
  type IndexInfo,
  isUniqueViolation,
  jsonScalarEquals,
  jsonSet,
  jsonSortKey,
  jsonText,
  listColumns,
  listIndexes,
  listTables,
  nowIso,
  tableExists,
  toBool,
  toBytes,
} from "./dialect.js";
export {
  type SqliteForeignKeyViolation,
  sqliteForeignKeyCheckedTransaction,
  type SqliteTableColumn,
  sqliteTableInfo,
} from "./sqlite-only.js";
