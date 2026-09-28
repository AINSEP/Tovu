import { recreateDatabase } from "../../migration/pg-fixture.js";

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
