import { after, describe } from "node:test";

import { sql } from "drizzle-orm";

import { openPgliteKernel, type PgKernel } from "../drivers/pglite.js";
import { type SqliteKernel, sqliteKernel } from "../drivers/sqlite.js";
import type { StorageDialect, StorageKernel } from "../port.js";
import { ensurePgContentSchema } from "../../pglite/content-schema.js";
import * as pgSchema from "../../schema.postgres.js";
import type * as sqliteSchema from "../../schema.sqlite.js";
import { openContentDb } from "../../sqlite/content-db.js";

/**
 * @file The contract-test matrix: run one suite against the content database on EVERY dialect,
 * so a converted repo is proven on SQLite and PGlite by the same assertions (idea from EmDash's
 * `describeEachDialect`). PGlite needs no server, so nothing is gated on an env var.
 *
 * Usage, in a `*.test.ts`:
 *
 * ```ts
 * describeEachDialect("PostRepoPort", {
 *   tables: ["posts", "post_revisions"],
 *   sqlite: (kernel) => new SqlitePostRepo(kernel),
 *   postgres: (kernel) => new PgPostRepo(kernel),
 * }, (makeRepo) => {
 *   test("saves", async () => { const repo = makeRepo(); … });
 * });
 * ```
 *
 * Or {@link eachDialect} for suites that already loop over an adapter list.
 *
 * - SQLite: every `make()` opens a fresh in-memory `content.db` (all migrations applied), as the
 *   existing suites do.
 * - PGlite: ONE in-memory instance per test file (instance + schema cost seconds), with `tables`
 *   emptied before the repo's first call. Suites must make their repo before using it and run
 *   their tests one after another (node:test's default inside a file). Closed after the file.
 */

export type SqliteContentKernel = SqliteKernel<typeof sqliteSchema>;
export type PgContentKernel = PgKernel<typeof pgSchema>;

export interface DialectOptions<R> {
  /** Content tables the suite writes; emptied (PGlite) before each `make()`. */
  tables: readonly string[];
  sqlite: (kernel: SqliteContentKernel) => R;
  postgres: (kernel: PgContentKernel) => R;
}

export interface DialectCase<R> {
  /** `sqlite` or `pglite`: the label a suite prints. */
  name: string;
  dialect: StorageDialect;
  make: () => R;
}

let sharedPg: PgContentKernel | undefined;

// Registered at import (file level): an `after` registered inside a test would run after THAT test.
after(async () => {
  await sharedPg?.close();
});

/** The file's shared in-memory PGlite content kernel (schema created on first use). */
export function sharedPgContentKernel(): PgContentKernel {
  sharedPg ??= openPgliteKernel({ schema: pgSchema }, { prepare: ensurePgContentSchema });
  return sharedPg;
}

/** A fresh in-memory SQLite `content.db` (migrated) behind its kernel. */
export function freshSqliteContentKernel(): SqliteContentKernel {
  return sqliteKernel(openContentDb(":memory:"));
}

/** `kernel` with every call held until `pending` settles (the per-test table reset). */
function heldUntil<TDb>(kernel: StorageKernel<TDb>, pending: Promise<void>): StorageKernel<TDb> {
  return {
    ...kernel,
    ready: pending,
    run: async (fn) => (await pending, kernel.run(fn)),
    transaction: async (fn) => (await pending, kernel.transaction(fn)),
    query: async (statement) => (await pending, kernel.query(statement)),
    execute: async (statement) => (await pending, kernel.execute(statement)),
  };
}

function emptiedPgKernel(tables: readonly string[]): PgContentKernel {
  const base = sharedPgContentKernel();
  if (tables.length === 0) return base;
  const list = sql.join(
    tables.map((table) => sql.identifier(table)),
    sql`, `
  );
  const pending = base.execute(sql`TRUNCATE ${list}`);
  pending.catch(() => {});
  return heldUntil(base, pending);
}

export function eachDialect<R>(options: DialectOptions<R>): DialectCase<R>[] {
  return [
    { name: "sqlite", dialect: "sqlite", make: () => options.sqlite(freshSqliteContentKernel()) },
    { name: "pglite", dialect: "postgres", make: () => options.postgres(emptiedPgKernel(options.tables)) },
  ];
}

export function describeEachDialect<R>(
  title: string,
  options: DialectOptions<R>,
  body: (make: () => R, dialect: StorageDialect) => void
): void {
  for (const each of eachDialect(options)) {
    describe(`${title} [${each.name}]`, () => body(each.make, each.dialect));
  }
}
