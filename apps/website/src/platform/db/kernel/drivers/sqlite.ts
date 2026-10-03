/** @file Tovu compatibility facade over the shared Jini database package. */
// Driver rationale: Jini packages/db/src/kernel/sqlite/driver.ts (Tovu SPEC-033 transient-lock handling).
import Database from "better-sqlite3";
import {
  openMemorySqliteKernel as jiniOpenMemorySqliteKernel,
  openSqliteFileKernel as jiniOpenSqliteFileKernel,
  sqliteClientOf as jiniSqliteClientOf,
  sqliteConnectionOf as jiniSqliteConnectionOf,
  sqliteKernel as jiniSqliteKernel,
  closeSqliteConnection as jiniCloseSqliteConnection,
  type SqliteKernel,
} from "@jini-ai/db/kernel/sqlite";
import type { StorageKernel } from "@jini-ai/db/kernel";

export type { SqliteKernel } from "@jini-ai/db/kernel/sqlite";

/** Preserve Tovu's native-driver type for existing callers of the legacy path. */
export type SqliteConnectionSource = Database.Database | { readonly $client: Database.Database };

/** Same shared functions, retaining Tovu's native connection input contract. */
export const sqliteKernel: <DB>(source: SqliteConnectionSource) => SqliteKernel<DB> = jiniSqliteKernel;
export const closeSqliteConnection: (source: SqliteConnectionSource) => void = jiniCloseSqliteConnection;

/** Open with Tovu's driver; Jini owns the kernel, cache and file turn locks. */
export function openSqliteFileKernel<DB>(filePath: string, optional: { readOnly?: boolean } = {}): SqliteKernel<DB> {
  return jiniOpenSqliteFileKernel<DB>({ filePath, open: (p, o) => new Database(p, o) }, optional);
}

/** A disposable, owning in-memory kernel using Tovu's driver. */
export function openMemorySqliteKernel<DB>(): SqliteKernel<DB> {
  return jiniOpenMemorySqliteKernel<DB>({ open: (p, o) => new Database(p, o) });
}

/** Jini returns the original handle; this boundary retains its native Tovu type. */
export function sqliteClientOf(source: SqliteConnectionSource): Database.Database {
  return jiniSqliteClientOf(source) as Database.Database;
}

/** Kernels opened here carry Tovu's native handle in Jini's shared reverse cache. */
export function sqliteConnectionOf<DB>(kernel: StorageKernel<DB>): Database.Database | undefined {
  return jiniSqliteConnectionOf(kernel) as Database.Database | undefined;
}
