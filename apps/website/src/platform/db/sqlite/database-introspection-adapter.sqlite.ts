import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "kysely";

import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { getDriftStatus } from "../drift.js";
import { tableExists } from "../kernel/dialect.js";
import { LEGACY_BASELINE_ID } from "../migrations/0000_legacy_baseline.js";
import { CONTENT_MIGRATIONS } from "../migrations/index.js";
import { LEDGER_TABLE } from "../migrations/runner.js";
import type {
  DatabaseHealthSummary,
  DatabaseIntrospectionPort,
  PendingMigration,
  SchemaStateSummary,
} from "#src/features/database/adapter.sqlite";
import type { ContentDb } from "./content-db.js";
import type { SchemaSnapshot } from "../drift.js";

const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * @file SPEC-017 C-102/C-110 / REQ-20–REQ-23 — the real backing adapter for
 * `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`, closing the
 * gap `agent-tools.ts`'s own file header disclosed: those three catalog entries existed with no
 * adapter composed into `RouteDeps` at all.
 *
 * Purpose:
 * Compares the applied migration identity against a site's persisted `.site-meta.json` stamp
 * (ADR-041 §3), or this runtime's bundled identity when that stamp is absent. Non-CLI production
 * boots can have a migrated database without a meta file; the bundled journal is a real comparison
 * source, so checking status does not need to create a file that also affects site-key resolution.
 * Reads the migration ledgers plus the bundled `db/drizzle/meta/_journal.json`, producing the three
 * read summaries the Database agent-tool catalog promises. `__drizzle_migrations`'s shape
 * (`id`/`hash`/`created_at`) was confirmed empirically against `drizzle-orm`'s own
 * `SQLiteSyncDialect.migrate()` (`node_modules/drizzle-orm/sqlite-core/dialect.js`), not assumed:
 * `created_at` is initially stored as the applied migration's journal-entry `when` epoch-millis
 * value, allowing an applied row to be matched back to its journal entry (for `version`/`tag`).
 * Historical stamps were rewritten, so this comparison is unsound for pending detection after
 * ADR-066 adoption: the runner reconciles the frozen chain by content hash.
 *
 * How it relates to the project:
 * Postgres/PGlite has no `__drizzle_migrations`: its ledger is `tovu_migrations` (ADR-066). Pending
 * migrations are `CONTENT_MIGRATIONS` steps missing from that ledger, also on SQLite once the ledger
 * records `0000_legacy_baseline` (the whole frozen drizzle chain). SQLite files without that baseline
 * retain the journal timestamp comparison. Applied schema identity on Postgres/PGlite is the bundled
 * journal's head once the baseline is recorded — the same identity `.site-meta.json` is stamped with
 * on every dialect; SQLite schema-state reads still match legacy timestamps to the journal.
 *
 * `server/deps.ts` composes the real `SqliteDatabaseIntrospectionAdapter` against the SAME already-
 * open `ContentDb` handle `restorePointsRepo`/`dbOps` reuse (no second connection is ever opened);
 * `server/app.ts`'s hermetic composition uses `repo.memory.ts`'s `InMemoryDatabaseIntrospectionAdapter`
 * instead. `drift.ts` — now colocated in this same `db/` directory (see below) — is exactly the
 * "adapter that reads two real `SchemaSnapshot`s and passes them in" its own doc comment says
 * callers must supply.
 *
 * Architectural role:
 * This concrete class relocated from `features/database/adapter.sqlite.ts` earlier the same day
 * (architecture SCC cut: `features/database → db` concentrated in this concrete class's `ContentDb`
 * import). The PORT (`DatabaseIntrospectionPort` + its summary types) stays domain-owned at
 * `features/database/adapter.sqlite.ts` — `tool-registrations.ts` and `repo.memory.ts` keep
 * importing it from that same path unchanged — mirroring `db/sqlite/vendor-credential-repo.sqlite.ts`'s
 * split (port in the feature, concrete adapter in the outer persistence layer).
 *
 * `drift.ts` itself relocated here (`db/drift.ts`) in a second, later SCC cut the same day: this
 * file's own `getDriftStatus` value-import was the last edge reaching from `db` back into
 * `features/database`, which became a real problem once `features/database` got its own
 * `registerToolContributor` edge into `assistant` (`contributeDatabaseTools()`) — a
 * `db -> features/database -> assistant` path plus `assistant`'s pre-existing static reach into `db`
 * (via `settings`/`post`) would have closed a cycle. `drift.ts` is pure, dependency-free
 * classification logic with exactly two real callers, both already `db`-side or type-only, so moving
 * it here (rather than narrowing the import further) removes the edge outright. See
 * `db/drift.ts`'s own header for the full trace.
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

/** Resolved from this file's own location: `src/platform/db/drizzle/meta/_journal.json` — the SAME file
 * `site-dir/schema-guard.ts`'s `runtimeSchemaVersion()` reads, but this adapter needs every entry
 * (for pending-migration detection), not just the last one. */
const DEFAULT_JOURNAL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle/meta/_journal.json");

/**
 * Real `DatabaseIntrospectionPort` over the site's content store. Reuses the caller's already-open
 * connection (the same one `openContentDb`/`bootSiteDir` already migrated) through its kernel rather
 * than opening a second handle to the same file — mirrors `SqliteDbOpsAdapter`'s `{ db, filePath }`
 * constructor shape. A store with no migrations ledger (`__drizzle_migrations` on SQLite,
 * `tovu_migrations` on Postgres/PGlite) reports it unreadable and its schema state `unknown`, never a
 * guess.
 */
export class SqliteDatabaseIntrospectionAdapter implements DatabaseIntrospectionPort {
  private readonly kernel: ContentKernel;
  private readonly dbPath: string;
  private readonly journalPath: string;

  constructor(deps: { db: ContentKernel | ContentDb; dbPath: string; journalPath?: string }) {
    this.kernel = contentKernel(deps.db);
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
    const canOpenDb = await this.canOpenDb();
    const migrationsTableReadable = canOpenDb && (await this.canReadMigrationsTable());
    const schemaState = canOpenDb ? await this.getSchemaState() : { status: "unknown" as const };

    return { canOpenDb, migrationsTableReadable, driftStatus: schemaState.status };
  }

  /**
   * Compares the applied identity to the persisted stamp, falling back to the bundled runtime
   * identity without changing `siteMeta` or writing a meta file. An unreadable applied identity
   * remains `unknown`.
   * @complexity O(m) in bundled journal entries — bounded migration query and small JSON reads.
   * @overallScore 100
   */
  async getSchemaState(): Promise<SchemaStateSummary> {
    const siteMeta = this.readSiteMetaSnapshot();
    // One journal read serves both sides, so the applied identity and the fallback head agree.
    const journal = this.readJournal();
    const runtime = await this.readAppliedSnapshot(journal);

    if (!runtime) {
      // No real applied identity to compare; the bundled identity cannot stand in for it.
      return { status: "unknown", siteMeta, runtime };
    }
    // No stamp: compare against this runtime's bundled journal head (the injected journal). A
    // runtime identity is only ever matched within this same journal, so that journal has a head.
    const head = journal!.entries.at(-1)!;
    const expected = siteMeta ?? { version: head.idx, tag: head.tag };
    return { status: getDriftStatus({ siteMeta: expected, runtime }), siteMeta, runtime };
  }

  /**
   * Lists content steps absent from the ADR-066 ledger on Postgres/PGlite and on SQLite with a
   * recorded legacy baseline. Pre-ADR-066 SQLite files retain the journal timestamp comparison.
   * @complexity O(m + l) in content steps or journal entries and applied ledger/history rows;
   * bounded metadata queries, with no caller-controlled input.
   * @overallScore 100
   */
  async listPendingMigrations(): Promise<{ items: PendingMigration[] }> {
    const applied = await this.readLedgerIds();
    if (this.kernel.dialect === "postgres" || applied.has(LEGACY_BASELINE_ID)) {
      const pending = CONTENT_MIGRATIONS.map((step, index) => ({ index, tag: step.id })).filter((item) => !applied.has(item.tag));
      return { items: pending };
    }
    const journal = this.readJournal();
    if (!journal) return { items: [] };

    const appliedTimestamps = await this.readAppliedTimestamps();
    const pending = journal.entries
      .filter((entry) => !appliedTimestamps.has(entry.when))
      .map((entry) => ({ index: entry.idx, tag: entry.tag }));

    return { items: pending };
  }

  /** A closed or unreachable connection throws on the first statement. */
  private async canOpenDb(): Promise<boolean> {
    try {
      await this.kernel.query(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /** The dialect's migration ledger: `tovu_migrations` on Postgres/PGlite, `__drizzle_migrations` on SQLite. */
  private migrationsTable(): string {
    return this.kernel.dialect === "postgres" ? LEDGER_TABLE : DRIZZLE_MIGRATIONS_TABLE;
  }

  private async migrationsTableExists(): Promise<boolean> {
    try {
      return await tableExists(this.kernel, this.migrationsTable());
    } catch {
      return false;
    }
  }

  private async canReadMigrationsTable(): Promise<boolean> {
    if (!(await this.migrationsTableExists())) return false;
    try {
      await this.kernel.query(sql`SELECT COUNT(*) AS n FROM ${sql.table(this.migrationsTable())}`);
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
  private async readAppliedSnapshot(journal: DrizzleJournal | null): Promise<SchemaSnapshot | null> {
    if (this.kernel.dialect === "postgres") return this.readAppliedPostgresSnapshot(journal);
    if (!(await this.migrationsTableExists())) return null;

    let latest: { hash: string; created_at: number | string } | undefined;
    try {
      [latest] = await this.kernel.query<{ hash: string; created_at: number | string }>(
        sql`SELECT hash, created_at FROM ${sql.table(DRIZZLE_MIGRATIONS_TABLE)} ORDER BY created_at DESC LIMIT 1`
      );
    } catch {
      return null;
    }
    if (!latest) return null;

    // Postgres returns a bigint column as a string.
    const createdAt = Number(latest.created_at);
    const matchingEntry = journal?.entries.find((entry) => entry.when === createdAt);
    return matchingEntry ? { version: matchingEntry.idx, tag: matchingEntry.tag } : null;
  }

  /** Postgres/PGlite: the bundled journal's head once `0000_legacy_baseline` is in `tovu_migrations`
   * (the baseline is the whole frozen drizzle chain), else `null` (no ledger, or no baseline yet). */
  private async readAppliedPostgresSnapshot(journal: DrizzleJournal | null): Promise<SchemaSnapshot | null> {
    if (!(await this.readLedgerIds()).has(LEGACY_BASELINE_ID)) return null;
    const head = journal?.entries.at(-1);
    return head ? { version: head.idx, tag: head.tag } : null;
  }

  /** All dialects: the step ids recorded in `tovu_migrations`; empty when it is missing or unreadable. */
  private async readLedgerIds(): Promise<Set<string>> {
    try {
      if (!(await tableExists(this.kernel, LEDGER_TABLE))) return new Set();
      const rows = await this.kernel.query<{ id: string }>(sql`SELECT id FROM ${sql.table(LEDGER_TABLE)}`);
      return new Set(rows.map((row) => row.id));
    } catch {
      return new Set();
    }
  }

  private async readAppliedTimestamps(): Promise<Set<number>> {
    if (!(await this.migrationsTableExists())) return new Set();
    try {
      const rows = await this.kernel.query<{ created_at: number | string }>(
        sql`SELECT created_at FROM ${sql.table(DRIZZLE_MIGRATIONS_TABLE)}`
      );
      return new Set(rows.map((row) => Number(row.created_at)));
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
