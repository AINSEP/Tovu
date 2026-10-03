/** @file Tovu compatibility facade over the shared Jini database package. */
export {
  autoIdColumnSql, checkpointWal, type ColumnAffinity, type ColumnInfo, columnTypeSql,
  type IndexInfo, isUniqueViolation, jsonScalarEquals, jsonSet, jsonSortKey, jsonText,
  listColumns, listIndexes, listTables, nowIso, tableExists, toBool, toBytes,
} from "@jini-ai/db/kernel";
// Portable JSON/DDL/WAL rationale: Jini/packages/db/src/kernel/dialect.ts.
