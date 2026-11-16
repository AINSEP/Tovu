/** Tovu's binding of the stopped-database admission in `@jini-ai/db/sqlite` to its better-sqlite3 opener. */
import { assertSqliteStopped, inspectStoppedSqlite, verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { openNativeSqlite } from "./drivers/sqlite.js";

/** Refuses unless no process holds the database; see `assertSqliteStopped`. */
export function assertDatabaseStopped({ path }: { path: string }, _options = {}): void {
  assertSqliteStopped({ path, open: openNativeSqlite });
}

/** Strict row counts of a stopped database as JSON; see `inspectStoppedSqlite`. */
export function inspectStoppedDatabase({ path }: { path: string }, optional: { verifyIntegrity?: typeof verifySqliteIntegrity } = {}): string {
  return inspectStoppedSqlite({ path, open: openNativeSqlite }, optional);
}
