import { psql, recreateDatabase } from "../migration/pg-fixture.js";
import { pgContentSchemaSql } from "./pg-content-schema.js";

// The one door to pg-fixture for tests outside this directory: pg-fixture-import-boundary.test.ts
// allows its import only here, so a product file can never reach the psql-spawning helpers.
export { dropDatabase, psql } from "../migration/pg-fixture.js";

/**
 * @file A fresh database on the local Postgres server for tests that need REAL connections (two
 * independent clients, pooled transactions) — what PGlite's single connection cannot show.
 *
 * Needs the server up (`pg_ctl -D /usr/local/var/postgresql@14 start`); when it is down the suite
 * fails, it never skips. Host/user follow libpq's env vars, as `pg-fixture.ts` does.
 */
export function freshPostgresDatabase(name: string): string {
  recreateDatabase(name);
  const host = process.env.PGHOST ?? "/tmp";
  const user = process.env.PGUSER ?? "la";
  const port = process.env.PGPORT ? `&port=${process.env.PGPORT}` : "";
  return `postgresql://${encodeURIComponent(user)}@/${name}?host=${encodeURIComponent(host)}${port}`;
}

/** {@link freshPostgresDatabase} with the whole content schema created (`pg-content-schema.ts`). */
export function freshPostgresContentDatabase(name: string): string {
  const url = freshPostgresDatabase(name);
  const created = psql(name, pgContentSchemaSql());
  if (!created.ok) throw new Error(`creating the content schema in "${name}" failed: ${created.stderr}`);
  return url;
}
