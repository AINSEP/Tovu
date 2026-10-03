/** Compatibility adapter; all DDL/constraint rationale now lives in @jini-ai/db/transfer. */
import * as ddl from "@jini-ai/db/transfer";
import type { TransferTable } from "./table-catalog.js";
export const UNVALIDATED_TABLE = "pg_temp._tovu_unvalidated";
export const quoteIdent = (name: string) => ddl.quoteIdent({ name });
export const quoteLiteral = (value: string) => ddl.quoteLiteral({ value });
export const qualified = (schema: string, table: string) => ddl.qualified({ schema, table });
export const fitIdentifier = (name: string) => ddl.fitIdentifier({ name });
export const createTableSql = (schema: string, table: TransferTable) => ddl.createTableSql({ schema, table });
export const indexSql = (schema: string, table: TransferTable) => ddl.indexSql({ schema, table });
export const reseedIdentitySql = (schema: string, table: TransferTable) => ddl.reseedIdentitySql({ schema, table }, { sqlTag: "tovu" });
export const constraintSql = (schema: string, tables: readonly TransferTable[]) => ddl.constraintSql({ schema, tables, unvalidatedTable: UNVALIDATED_TABLE }, { sqlTag: "tovu" }).replace('CREATE TEMP TABLE "_tovu_unvalidated"', 'CREATE TEMP TABLE _tovu_unvalidated').replaceAll('"pg_temp"."_tovu_unvalidated"', 'pg_temp._tovu_unvalidated');
