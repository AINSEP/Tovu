import type { DriftStatus, SchemaSnapshot } from "../../platform/db/drift.js";

/**
 * @file `DatabaseIntrospectionPort` and its summary types — the port
 * `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`
 * (`tool-registrations.ts`) compose against, and `repo.memory.ts`'s
 * `InMemoryDatabaseIntrospectionAdapter` also implements.
 *
 * NAME KEPT DESPITE NO LONGER HOLDING AN ADAPTER (2026-08-17, architecture SCC cut): the concrete
 * `SqliteDatabaseIntrospectionAdapter` moved to `db/sqlite/database-introspection-adapter.sqlite.ts`
 * — it was the only thing in this file that needed a real `ContentDb`, and that import was the
 * entire `features/database → db` edge in the module graph. This file is left at its original path,
 * holding only the port + types, so `tool-registrations.ts` and `repo.memory.ts` (both outside this
 * dispatch's file ownership) keep resolving `from "./adapter.sqlite.js"` unchanged. A future rename to
 * `ports.ts` is safe but out of scope here — see the relocated adapter's own file header for the
 * split rationale.
 */

export interface DatabaseHealthSummary {
  /** Whether the underlying `content.db` connection can still run a query at all. */
  canOpenDb: boolean;
  /** Whether `__drizzle_migrations` exists and a `SELECT` against it succeeds. */
  migrationsTableReadable: boolean;
  /** `"unknown"` whenever either `SchemaSnapshot` side is unavailable — never fabricated
   * (`disclosure.ts`'s "never fabricate" discipline, `agent-tools.ts`'s own precedent). */
  driftStatus: DriftStatus | "unknown";
}

export interface SchemaStateSummary {
  status: DriftStatus | "unknown";
  siteMeta: SchemaSnapshot | null;
  runtime: SchemaSnapshot | null;
}

export interface PendingMigration {
  index: number;
  tag: string;
}

/** The port `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`
 * (`tool-registrations.ts`) compose against — mirrors `restore-points.ts`'s
 * `RestorePointListPort`/`RestorePointSavePort` and `timeline.ts`'s `LedgerReadPort`: a small,
 * domain-declared interface a real adapter and an in-memory double both satisfy.
 *
 * DELIBERATELY NOT IMPLEMENTED FOR AN EXTERNAL SUPABASE-HOSTED POSTGRES (2026-07-30), recorded here
 * rather than in a dispatch note because this interface is where a future engineer would start.
 * The idea was a second, typed adapter alongside `SqliteDatabaseIntrospectionAdapter` giving the
 * Database agent-tool domain read-only visibility into a site owner's external Supabase project,
 * as a cheaper alternative to going through live MCP transport for every read. It was investigated
 * against the Supabase Management API's real surface (`@supabase/mcp-server-supabase@0.9.0`'s
 * `DatabaseOperations`: `executeSql`, `listMigrations`, `applyMigration`; plus `getProject` and
 * `getAdvisors`) and declined, for two reasons that are about meaning rather than effort:
 *
 * 1. TWO OF THE THREE METHODS COULD ONLY BE FABRICATED. This port's vocabulary is Tovu-local, not
 *    generic. `getSchemaState()` is drift between a site's persisted `.site-meta.json` stamp and
 *    its `__drizzle_migrations` table (ADR-041 §3); a Supabase project has neither, and its
 *    migrations live in `supabase_migrations.schema_migrations` under a different lineage entirely.
 *    `listPendingMigrations()` is bundled-journal MINUS applied — and Supabase's `listMigrations`
 *    returns only `{version, name?}` for what IS applied, with no journal of what SHOULD be, so
 *    "pending" has no answer to compute. Satisfying the interface would mean inventing a
 *    `driftStatus` and an empty-and-therefore-reassuring pending list. That is exactly what the
 *    rest of this file refuses to do: every unavailable input here returns `null` or `"unknown"`
 *    rather than a guess, and an adapter whose honest output is `{status:"unknown", siteMeta:null,
 *    runtime:null}` for every call is not worth the credential it would need.
 *
 * 2. THE ANSWERS WOULD BE ABOUT THE WRONG DATABASE. `database_get_health` is gated on
 *    `database.read` and reached by an admin asking "is my database healthy?". Wiring an external
 *    project behind those same three tool ids would answer about a different database than the one
 *    Tovu is serving, under a permission that is a statement about this one — the confused-deputy
 *    error, arrived at by adapter substitution instead of by tool naming.
 *
 * The capability itself is not lost: `assistant/mcp-federation/` exposes Supabase's own
 * `list_tables`/`list_migrations`/`get_advisors` under distinct `mcp__supabase__*` ids, a distinct
 * permission, and an explicit external-provenance label — which is the same information without
 * either confusion. If a typed synchronous adapter is ever genuinely wanted, the correct shape is a
 * NEW port whose vocabulary is Supabase's own (applied-migration list, advisor findings, project
 * status), not this one bent to fit. Same disposition, and the same reason, as
 * `database_get_restore_guidance`'s standing declination in `tool-registrations.ts`. */
export interface DatabaseIntrospectionPort {
  getHealth(): Promise<DatabaseHealthSummary>;
  getSchemaState(): Promise<SchemaStateSummary>;
  listPendingMigrations(): Promise<{ items: PendingMigration[] }>;
}
