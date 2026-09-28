import type { SQL } from "drizzle-orm";

/**
 * @file The storage kernel port: the ONE async way a repo reaches its database, on every driver.
 * Plan: `ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md`.
 *
 * A repo never holds a raw handle, never runs `BEGIN`, never calls a sync terminal on a client it
 * owns. It asks the kernel:
 *
 * - {@link StorageKernel.run} — run statements on the right executor: the open transaction when the
 *   caller is inside {@link StorageKernel.transaction}, else the base handle.
 * - {@link StorageKernel.transaction} — one unit of work. A NESTED call joins the outer one (no
 *   savepoint), so a service composing two repos that each wrap themselves still commits or rolls
 *   back as one. Calling it from inside a `run()` body throws: that body holds the handle a
 *   transaction would wait for.
 * - {@link StorageKernel.query} — a portable `sql` statement returning rows. For dialect helpers,
 *   migrations and introspection (`dialect.ts`), not for repos: repos use the Drizzle query builder
 *   through `run()`.
 *
 * Drivers live in `drivers/` and are the only files allowed to touch a driver's own API (the
 * raw-SQLite guard enforces that).
 */

/** SQL family: decides which dialect helper fragment and which adapter set applies. */
export type StorageDialect = "sqlite" | "postgres";

/** The concrete client under the dialect. `node-postgres` (Supabase / any Postgres) comes later. */
export type StorageDriver = "better-sqlite3" | "pglite";

export interface StorageKernel<TDb> {
  readonly dialect: StorageDialect;
  readonly driver: StorageDriver;
  /** Resolves once the driver is open and its schema is in place. Every call below awaits it. */
  readonly ready: Promise<void>;
  run<T>(fn: (db: TDb) => T | Promise<T>): Promise<T>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  query<Row extends Record<string, unknown>>(statement: SQL): Promise<Row[]>;
  /** {@link query} for a statement that returns no rows (DDL, a write without `RETURNING`). */
  execute(statement: SQL): Promise<void>;
  /** True inside this kernel's own transaction (the caller's async context). */
  inTransaction(): boolean;
  close(): Promise<void>;
}
