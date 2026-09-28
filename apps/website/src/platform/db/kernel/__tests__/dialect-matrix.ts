import { after, describe } from "node:test";

import { sql } from "kysely";

import type { ContentDatabase } from "../../content-database.generated.js";
import { openPgliteKernel, type PgKernel } from "../drivers/pglite.js";
import { type SqliteKernel, sqliteKernel } from "../drivers/sqlite.js";
import type { StorageDialect, StorageKernel } from "../port.js";
import { ensurePgContentSchema } from "../../pglite/content-schema.js";
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
 *   make: (kernel) => postRepoFor(kernel),
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

export type ContentKernel = StorageKernel<ContentDatabase>;
export type SqliteContentKernel = SqliteKernel<ContentDatabase>;
export type PgContentKernel = PgKernel<ContentDatabase>;

export interface DialectOptions<R> {
  /** Content tables the suite writes; emptied (PGlite) before each `make()`. */
  tables: readonly string[];
  /** One factory for every dialect — the point of a single query body. */
  make: (kernel: ContentKernel) => R;
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
  sharedPg ??= openPgliteKernel<ContentDatabase>({ prepare: ensurePgContentSchema });
  return sharedPg;
}

/** A fresh in-memory SQLite `content.db` (migrated) behind its kernel. */
export function freshSqliteContentKernel(): SqliteContentKernel {
  return sqliteKernel<ContentDatabase>(openContentDb(":memory:"));
}

/** `kernel` with every call held until `pending` settles (the per-test table reset). */
export function heldUntil<DB>(kernel: StorageKernel<DB>, pending: Promise<void>): StorageKernel<DB> {
  return {
    ...kernel,
    ready: pending,
    run: async (fn) => (await pending, kernel.run(fn)),
    transaction: async (fn) => (await pending, kernel.transaction(fn)),
    query: async (statement) => (await pending, kernel.query(statement)),
    execute: async (statement) => (await pending, kernel.execute(statement)),
  };
}

/** The shared PGlite content kernel with `tables` emptied before its first call. */
export function emptiedPgContentKernel(tables: readonly string[]): PgContentKernel {
  const base = sharedPgContentKernel();
  if (tables.length === 0) return base;
  // CASCADE: a suite that writes a parent table (`workspaces`) also empties the rows that reference it.
  const pending = base.execute(sql`TRUNCATE ${sql.join(tables.map((table) => sql.table(table)))} CASCADE`);
  pending.catch(() => {});
  return heldUntil(base, pending);
}

export function eachDialect<R>(options: DialectOptions<R>): DialectCase<R>[] {
  return [
    { name: "sqlite", dialect: "sqlite", make: () => options.make(freshSqliteContentKernel()) },
    { name: "pglite", dialect: "postgres", make: () => options.make(emptiedPgContentKernel(options.tables)) },
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
