import fs from "node:fs";
import path from "node:path";

import type { ContentDb } from "../../db/sqlite/content-db";
import { getDriftStatus, type DriftStatus, type SchemaSnapshot } from "./drift";

/**
 * @file SPEC-017 C-102/C-110 / REQ-20–REQ-23 — the real backing adapter for
 * `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`, closing the
 * gap `agent-tools.ts`'s own file header disclosed: those three catalog entries existed with no
 * adapter composed into `RouteDeps` at all.
 *
 * Purpose:
 * Reads the two real sources `drift.ts`'s header names (ADR-041 §3) — a site's persisted
 * `.site-meta.json` stamp and the runtime's `__drizzle_migrations` table — plus the bundled
 * `db/drizzle/meta/_journal.json` this runtime ships, and turns them into the three read
 * summaries the Database agent-tool catalog promises. `__drizzle_migrations`'s shape
 * (`id`/`hash`/`created_at`) was confirmed empirically against `drizzle-orm`'s own
 * `SQLiteSyncDialect.migrate()` (`node_modules/drizzle-orm/sqlite-core/dialect.js`), not assumed:
 * `created_at` is stored as exactly the applied migration's journal-entry `when` epoch-millis
 * value, which is what makes matching an applied row back to its journal entry (for `version`/`tag`)
 * possible without a second identity column.
 *
 * How it relates to the project:
 * `server/deps.ts` composes the real `SqliteDatabaseIntrospectionAdapter` against the SAME already-
 * open `ContentDb` handle `restorePointsRepo`/`dbOps` reuse (no second connection is ever opened);
 * `server/app.ts`'s hermetic composition uses `repo.memory.ts`'s `InMemoryDatabaseIntrospectionAdapter`
 * instead. `drift.ts`'s `getDriftStatus` stays untouched — this module is exactly the "adapter that
 * reads two real `SchemaSnapshot`s and passes them in" its own doc comment says callers must supply.
 *
 * Architectural role:
 * Infrastructure adapter, co-located with its port under `features/database` (mirrors
 * `features/content-types/repo.sqlite.ts`'s identical co-location, not `db/sqlite/`'s older
 * per-port-file convention) because the port here is this adapter's own invention, not a
 * cross-domain-shared one.
 */

/** One `db/drizzle/meta/_journal.json` entry — `idx`/`tag` identify the migration (RT-005);
 * `when` is the epoch-millis value `drizzle-orm`'s migrator stamps into `__drizzle_migrations.created_at`
 * verbatim when that migration is applied. */
interface DrizzleJournalEntry {
  idx: number;
  when: number;
  tag: string;
}

interface DrizzleJournal {
  entries: DrizzleJournalEntry[];
}

/** Resolved from this file's own location: `src/db/drizzle/meta/_journal.json` — the SAME file
 * `site-dir/schema-guard.ts`'s `runtimeSchemaVersion()` reads, but this adapter needs every entry
 * (for pending-migration detection), not just the last one. */
const DEFAULT_JOURNAL_PATH = path.resolve(__dirname, "../../db/drizzle/meta/_journal.json");

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

/**
 * Real SQLite-backed `DatabaseIntrospectionPort`. Reuses the caller's already-open `ContentDb`
 * connection (the same one `openContentDb`/`bootSiteDir` already migrated) rather than opening a
 * second handle to the same file — mirrors `SqliteDbOpsAdapter`'s `{ db, filePath }` constructor
 * shape exactly.
 */
export class SqliteDatabaseIntrospectionAdapter implements DatabaseIntrospectionPort {
  private readonly db: ContentDb;
  private readonly dbPath: string;
  private readonly journalPath: string;

  constructor(deps: { db: ContentDb; dbPath: string; journalPath?: string }) {
    this.db = deps.db;
    this.dbPath = deps.dbPath;
    // Overridable only for this adapter's own tests (a fixture journal with genuinely pending
    // entries) — every real composition root uses the default bundled path.
    this.journalPath = deps.journalPath ?? DEFAULT_JOURNAL_PATH;
  }

  /**
   * @complexity O(1) — a handful of small, bounded queries/reads; not a function of migration count.
   * @overallScore 100
   */
  async getHealth(): Promise<DatabaseHealthSummary> {
    const canOpenDb = this.canOpenDb();
    const migrationsTableReadable = canOpenDb && this.canReadMigrationsTable();
    const schemaState = canOpenDb ? await this.getSchemaState() : { status: "unknown" as const };

    return { canOpenDb, migrationsTableReadable, driftStatus: schemaState.status };
  }

  /**
   * @complexity O(1) — one `.site-meta.json` read plus one bounded `__drizzle_migrations` query.
   * @overallScore 100
   */
  async getSchemaState(): Promise<SchemaStateSummary> {
    const siteMeta = this.readSiteMetaSnapshot();
    const runtime = this.readAppliedSnapshot();

    if (!siteMeta || !runtime) {
      // AC-03/drift.ts's own CIC U-002-B1: never guess a status from a partial pair.
      return { status: "unknown", siteMeta, runtime };
    }
    return { status: getDriftStatus({ siteMeta, runtime }), siteMeta, runtime };
  }

  /**
   * @complexity O(m) in the bundled journal's entry count (currently 21) plus one bounded
   * `__drizzle_migrations` query — not a function of any caller-controlled input.
   * @overallScore 100
   */
  async listPendingMigrations(): Promise<{ items: PendingMigration[] }> {
    const journal = this.readJournal();
    if (!journal) return { items: [] };

    const appliedTimestamps = this.readAppliedTimestamps();
    const pending = journal.entries
      .filter((entry) => !appliedTimestamps.has(entry.when))
      .map((entry) => ({ index: entry.idx, tag: entry.tag }));

    return { items: pending };
  }

  private canOpenDb(): boolean {
    if (!this.db.$client.open) return false;
    try {
      this.db.$client.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  private migrationsTableExists(): boolean {
    try {
      const row = this.db.$client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
        .get();
      return row !== undefined;
    } catch {
      return false;
    }
  }

  private canReadMigrationsTable(): boolean {
    if (!this.migrationsTableExists()) return false;
    try {
      this.db.$client.prepare("SELECT COUNT(*) FROM __drizzle_migrations").get();
      return true;
    } catch {
      return false;
    }
  }

  /** Reads `.site-meta.json`'s persisted `{schemaVersion, schemaTag}` — the sibling of `content.db`
   * at `dbPath`'s own directory (`bootSiteDir`'s own layout). Returns `null` (never fabricates) when
   * the file is missing (e.g. a dev boot with no install dir), unparseable, or shaped wrong. */
  private readSiteMetaSnapshot(): SchemaSnapshot | null {
    const siteMetaPath = path.join(path.dirname(this.dbPath), ".site-meta.json");
    try {
      const raw = fs.readFileSync(siteMetaPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<{ schemaVersion: number; schemaTag: string }>;
      if (typeof parsed.schemaVersion !== "number" || typeof parsed.schemaTag !== "string") return null;
      return { version: parsed.schemaVersion, tag: parsed.schemaTag };
    } catch {
      return null;
    }
  }

  /** Reads the runtime's actually-applied schema identity from `__drizzle_migrations` (ADR-041 §3)
   * — the latest row by `created_at`, matched back to its bundled journal entry for `{version, tag}`.
   * Returns `null` when the table is unreadable, empty, or its latest row's `created_at` matches no
   * entry in the bundled journal (a divergent-lineage case this adapter refuses to guess at, rather
   * than fabricating a snapshot). */
  private readAppliedSnapshot(): SchemaSnapshot | null {
    if (!this.migrationsTableExists()) return null;

    let latest: { hash: string; created_at: number } | undefined;
    try {
      latest = this.db.$client
        .prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
        .get() as { hash: string; created_at: number } | undefined;
    } catch {
      return null;
    }
    if (!latest) return null;

    const journal = this.readJournal();
    const matchingEntry = journal?.entries.find((entry) => entry.when === latest.created_at);
    return matchingEntry ? { version: matchingEntry.idx, tag: matchingEntry.tag } : null;
  }

  private readAppliedTimestamps(): Set<number> {
    if (!this.migrationsTableExists()) return new Set();
    try {
      const rows = this.db.$client.prepare("SELECT created_at FROM __drizzle_migrations").all() as Array<{
        created_at: number;
      }>;
      return new Set(rows.map((row) => row.created_at));
    } catch {
      return new Set();
    }
  }

  private readJournal(): DrizzleJournal | null {
    try {
      return JSON.parse(fs.readFileSync(this.journalPath, "utf8")) as DrizzleJournal;
    } catch {
      return null;
    }
  }
}
