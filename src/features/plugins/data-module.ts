/**
 * @file The core-mediated plugin dataModule engine (ADR-023 §2/§3/§4/§5/§6/§9).
 *
 * A plugin DECLARES its desired tables as data; CORE alone executes the DDL. A plugin never
 * authors a migration and never holds a raw DB handle. The flow, in order:
 *   1. validate the declaration (namespace `p_{pluginId}__*` §5, column shape, tier §3/T6) —
 *      before any I/O;
 *   2. skip tables that already exist (idempotent, state-based reconciliation §2);
 *   3. disk-headroom preflight (§3/T4) — fails closed before any file is touched;
 *   4. namespace-adoption guard (§5/§6/T5) — fails closed on an unresolved provenance mismatch;
 *   5. **snapshot the whole db FIRST** (§4) — the never-brick anchor;
 *   6. open a durable phase-journal entry (§2/T3);
 *   7. run all DDL inside ONE transaction so a failure rolls the live db back to a working state
 *      (§9: recoverable, not zero-loss) — SQLite's own transaction rollback handles this
 *      same-process, non-crash case; the snapshot/journal exist for the CRASH case, recovered at
 *      next boot by `migration-recovery.ts` (see that file and `restore.ts` for why restore only
 *      ever runs there, never live).
 *
 * IN-MEMORY `dbPath` (BUG FIX, 2026-07-28): steps 3, 5, and 6 above are conditionally skipped for an
 * in-memory (or SQLite's other non-file) `dbPath` — see `snapshot.ts`'s `isInMemoryDbPath`. Disk
 * headroom (step 3, via `disk-headroom.ts`) and the whole snapshot/journal apparatus (steps 5-6)
 * exist specifically to make "recovery at next boot" possible; for `:memory:` there IS no next
 * boot — the database is discarded in full the instant the process ends, so "recoverable" and
 * "not recoverable" are the same outcome regardless of whether a snapshot/journal entry exists.
 * Skipping them for this case isn't a weakened guarantee, it's recognizing the guarantee doesn't
 * apply. Step 7's same-process transaction rollback is UNAFFECTED and remains the full safety net
 * for an in-memory db, because it is the only failure mode that can ever occur for one (there is no
 * separate process to crash-and-restart into that could observe a different, corrupted state).
 *
 * COLUMN-LEVEL RECONCILIATION (BUG FIX, 2026-08-12): §2's own text is "Core diffs declared-state
 * against live-state and executes the DDL itself" — but the first implementation of step 2 only
 * diffed *table names*, not table *contents*. A plugin whose v2 manifest added a column to an
 * already-existing table got `{ ok: true, created: [] }` back — the table-name presence check saw
 * the table, concluded there was nothing to do, and took the early no-op path — and the new column
 * silently never existed. The failure then surfaced far from its cause: at query time, against
 * whatever repository call first touched the missing column, with no link back to the manifest
 * that declared it. Step 2 now diffs declared columns against `PRAGMA table_info` for every table
 * that already exists, not just the table's name. A declared-but-missing column on an existing
 * table has three possible outcomes: (a) a plain nullable, non-PRIMARY-KEY column is safely
 * addable via `ALTER TABLE ADD COLUMN` and gets queued as an alteration; (b) a `NOT NULL` column
 * cannot — SQLite refuses `ADD COLUMN` with a `NOT NULL` constraint unless a non-NULL default is
 * also supplied, and this declaration grammar (`ColumnDecl`) has no default field to supply one,
 * so this fails closed with `COLUMN_ADD_NOT_NULL_WITHOUT_DEFAULT`; (c) a `PRIMARY KEY` column can
 * never be added to an existing table via `ALTER TABLE` at all — SQLite has no such statement,
 * only a full create-copy-drop-rename table rebuild, which is a materially larger and riskier
 * change than this fix and stays explicitly out of scope — so this fails closed with
 * `COLUMN_ADD_PRIMARY_KEY`. A live column whose type no longer matches its declaration also fails
 * closed (`COLUMN_TYPE_MISMATCH`) for the same reason: a type change is a rebuild, not an `ALTER`.
 * A live column the CURRENT declaration no longer mentions is deliberately left alone rather than
 * dropped — this engine never authors a `DROP COLUMN` on a plugin's behalf; an operator who rolled
 * a plugin back to an older manifest, or a manifest that stopped mentioning a column on purpose,
 * should not lose that column's data to a silent, unrequested `DROP`. When an existing table needs
 * one or more columns added, the full snapshot/journal/single-transaction apparatus below still
 * runs for it exactly as it does for a brand-new table — only the fully-reconciled no-op case
 * (every declared table exists with every declared column already present and matching) skips it.
 *
 * T2 (§4's exclusive cross-process lock) is DELIBERATELY NOT acquired here — SPEC-033 correction
 * (2026-07-16), superseding SPEC-032's original implementation. The ADR's own §4 text scopes T2's
 * purpose narrowly: "The SQLite online backup API is safe under concurrent writers during
 * snapshot creation — that step needs no change here. Restore is a different, less-safe
 * operation" — the lock exists to guard RESTORE, not the live snapshot+DDL window. `restore.ts`'s
 * own header already establishes that restore never runs live in this codebase's actual topology
 * (single-process, single long-lived connection; restore only runs at boot-time recovery, before
 * any other connection exists) — so T2's stated danger literally cannot occur here. Holding a
 * real `PRAGMA locking_mode=EXCLUSIVE` during the live window instead caused a genuine,
 * deterministic production bug: a live multi-boot smoke test against the real server found the
 * store plugin's own separate `content.db` connection (`store-plugin.ts#bootstrapStore`) failing
 * boot with "database is locked" every time, confirmed via A/B testing (disabling the lock calls
 * made the failure disappear immediately) — the exact interleaving mechanism was not fully
 * root-caused (multiple fire-and-forget dataModule declares and other writers share one
 * long-lived connection in the real composition, unlike any isolated repro), but the causal link
 * to `locking_mode=EXCLUSIVE` was empirically conclusive. Removing an unneeded lock whose own
 * ADR-stated justification doesn't apply here, rather than debugging a specific interleaving
 * further, is the correct call.
 *
 * ADR-023 is ACCEPTED (2026-07-11) after a 3-round external audit whose T1-T8 findings are now
 * ALL reflected in code across this file, `migration-journal.ts`, `disk-headroom.ts`,
 * `plugin-identity.ts`, `migration-recovery.ts`, and `restore.ts` — see SPEC-032/SPEC-033 for the
 * full record of which finding lives where. This engine exists ahead of §12's "v1 ships seams
 * only" schedule: §12's own last line permits shipping it early "against a concrete demand
 * plugin," and Newsletter (`src/newsletter/data-module-manifest.ts`) is exactly that — a real
 * production consumer already calling this engine before this file's safety mechanics existed.
 *
 * NOTE (§0 access-control caveat): a Tier-3 in-process plugin could bypass this by opening the db
 * file directly. The RECOVERABILITY guarantee here (who snapshots + who runs DDL = core) holds
 * unconditionally for core-mediated DDL; the access-control framing is advisory until ADR-024 §4
 * Rung 2 (capability sandbox) ships — see ADR-023 §0 for the full, precise wording.
 */
import type Database from "better-sqlite3";

import { checkDiskHeadroom } from "./disk-headroom";
import { advanceJournalPhase, beginJournalEntry, ensureMigrationJournal } from "./migration-journal";
import type { JournalPhase } from "./migration-journal";
import { checkNamespaceAdoption } from "./plugin-identity";
import type { PluginProvenance } from "./plugin-identity";
import { discardCommittedSnapshot, snapshotDb } from "./snapshot";

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BLOB";
export type PluginTier = "tier-1" | "tier-2" | "tier-3";

export interface ColumnDecl {
  readonly name: string;
  readonly type: ColumnType;
  readonly notNull?: boolean;
  readonly primaryKey?: boolean;
}

/**
 * ADR-023 §2 ("declared FKs") / ADR-031 OQ-1 (SDK stress-test finding) — the dataModule seam's
 * declared-index grammar. Comments' moderation-queue query pattern
 * (`workspace_id, entry_id, status`) is the concrete demand this grows the seam against, per
 * OQ-1's own instruction not to silently work around the gap. Deliberately NOT a foreign-key
 * declaration seam too — ADR-031 §2 itself says referential integrity to `entries`/parent
 * comments is "chokepoint-validated, not FK-enforced (v1)", so only indexes are the real,
 * load-bearing need; adding FK-declaration grammar with no consumer would be speculative.
 */
export interface IndexDecl {
  /** SHORT name; core prefixes it the same way tables are (`idx_p_{pluginId}__{name}`). */
  readonly name: string;
  readonly columns: readonly string[];
  readonly unique?: boolean;
}

export interface TableDecl {
  /** SHORT name; core prefixes it with the reserved `p_{pluginId}__` namespace. */
  readonly name: string;
  readonly columns: readonly ColumnDecl[];
  readonly indexes?: readonly IndexDecl[];
}

export interface DataModuleDecl {
  readonly pluginId: string;
  /** §3/T6: `dataModule` is scoped to Tier-2/Tier-3 only — a Tier-1 declaration is rejected. */
  readonly pluginTier: PluginTier;
  readonly tables: readonly TableDecl[];
  /** §5/§6/T5 — used by the namespace-adoption guard. */
  readonly provenance: PluginProvenance;
}

export interface DeclareResult {
  readonly ok: boolean;
  /** Fully-qualified names of tables created this call. */
  readonly created: string[];
  /**
   * Fully-qualified names of already-existing tables that had one or more declared columns added
   * this call (the column-level reconciliation described in this file's header comment). A table
   * name never appears in both `created` and `altered` — it is either newly made or already
   * existed.
   */
  readonly altered: string[];
  /** Path to the pre-DDL snapshot, or null when nothing needed doing / the input was invalid. */
  readonly snapshotPath: string | null;
  /** On failure: the snapshot that remains as the named recovery point (§9). */
  readonly recoveryPoint?: string;
  readonly error?: { code: string; message: string };
}

const IDENT = /^[a-z][a-z0-9_]*$/;
const TYPES = new Set<ColumnType>(["TEXT", "INTEGER", "REAL", "BLOB"]);

class DeclError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const fqName = (pluginId: string, name: string): string => `p_${pluginId}__${name}`;

/** Validate the declaration entirely before any I/O (§5 namespace + column shape + §3/T6 tier). */
/**
 * PostgreSQL's hard identifier ceiling (`NAMEDATALEN - 1`). SQLite has no limit at all, which is
 * exactly why this needs checking here rather than being discovered later: nothing in a
 * SQLite-only world ever fails, so a too-long name ships silently and only becomes a defect on a
 * Postgres-backed site.
 */
const MAX_IDENTIFIER_BYTES = 63;

/**
 * Fails a declaration whose generated identifier would exceed what PostgreSQL accepts.
 *
 * Why reject rather than truncate: PostgreSQL truncates over-long identifiers *silently* — no
 * error, no warning. The name in the catalog then differs from the name this module computed, so
 * `existingTables`-style idempotency checks look for a name that is not there, conclude the object
 * is missing, and try to create it again on every activation. Failing closed at declare time (like
 * every other check in this function, all of which run before any I/O) turns a silent divergence on
 * one backend into an install-time error the plugin author sees immediately.
 *
 * Measured headroom at the time this was added: the longest live identifier is 42 bytes
 * (`idx_p_comments__comments__moderation_queue`), so no existing plugin is affected. The budget a
 * plugin author actually has is `pluginId + tableName + indexName <= 53` for an index, since the
 * `idx_`, `p_`, and two `__` separators consume the other 10.
 */
function assertIdentifierFits(identifier: string, what: string): void {
  if (Buffer.byteLength(identifier, "utf8") <= MAX_IDENTIFIER_BYTES) return;
  throw new DeclError(
    "IDENTIFIER_TOO_LONG",
    `${what} generates the identifier "${identifier}" (${Buffer.byteLength(identifier, "utf8")} bytes), ` +
      `which exceeds PostgreSQL's ${MAX_IDENTIFIER_BYTES}-byte limit and would be silently truncated. ` +
      `Shorten the plugin id, table name, or index name.`
  );
}

function validate(decl: DataModuleDecl): void {
  if (!IDENT.test(decl.pluginId)) throw new DeclError("BAD_PLUGIN_ID", `invalid pluginId: ${decl.pluginId}`);
  if (decl.pluginTier === "tier-1") {
    throw new DeclError("TIER1_NOT_ALLOWED", "dataModule requires executable code (Tier-2 or Tier-3); Tier-1 plugins cannot request it");
  }
  if (decl.tables.length === 0) throw new DeclError("EMPTY", "declaration lists no tables");
  for (const table of decl.tables) {
    if (!IDENT.test(table.name)) throw new DeclError("BAD_TABLE_NAME", `invalid table name: ${table.name}`);
    assertIdentifierFits(fqName(decl.pluginId, table.name), `table ${table.name}`);
    if (table.columns.length === 0) throw new DeclError("NO_COLUMNS", `table ${table.name} declares no columns`);
    const declaredColumns = new Set<string>();
    for (const col of table.columns) {
      if (!IDENT.test(col.name)) throw new DeclError("BAD_COLUMN", `invalid column name: ${col.name}`);
      if (!TYPES.has(col.type)) throw new DeclError("BAD_TYPE", `unsupported column type for ${col.name}: ${col.type}`);
      declaredColumns.add(col.name);
    }
    for (const idx of table.indexes ?? []) {
      if (!IDENT.test(idx.name)) throw new DeclError("BAD_INDEX_NAME", `invalid index name: ${idx.name}`);
      assertIdentifierFits(`idx_${fqName(decl.pluginId, table.name)}__${idx.name}`, `index ${idx.name} on table ${table.name}`);
      if (idx.columns.length === 0) throw new DeclError("EMPTY_INDEX", `index ${idx.name} on table ${table.name} declares no columns`);
      for (const col of idx.columns) {
        if (!declaredColumns.has(col)) {
          throw new DeclError("INDEX_UNKNOWN_COLUMN", `index ${idx.name} on table ${table.name} references undeclared column: ${col}`);
        }
      }
    }
  }
}

function columnSql(col: ColumnDecl): string {
  let sql = `"${col.name}" ${col.type}`;
  if (col.primaryKey) sql += " PRIMARY KEY";
  if (col.notNull) sql += " NOT NULL";
  return sql;
}

function indexSql(fqTableName: string, idx: IndexDecl): { indexName: string; sql: string } {
  const indexName = `idx_${fqTableName}__${idx.name}`;
  const unique = idx.unique ? "UNIQUE " : "";
  const columns = idx.columns.map((c) => `"${c}"`).join(", ");
  return { indexName, sql: `CREATE ${unique}INDEX "${indexName}" ON "${fqTableName}" (${columns})` };
}

/** Core's own migration timeline, extended to admit plugin entries later (ADR-023 §12). */
function ensureJournal(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS _plugin_migrations (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       plugin_id TEXT NOT NULL,
       table_name TEXT NOT NULL,
       ddl TEXT NOT NULL,
       snapshot_path TEXT,
       at INTEGER NOT NULL
     )`
  ).run();
}

function existingTables(db: Database.Database, names: string[]): Set<string> {
  if (names.length === 0) return new Set();
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${names.map(() => "?").join(", ")})`)
    .all(...names) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

interface ExistingColumnInfo {
  readonly type: string;
  readonly notNull: boolean;
  readonly primaryKey: boolean;
}

/** A plan to ALTER an already-existing table by adding the declared-but-missing columns. */
interface TableAlterationPlan {
  readonly fqTableName: string;
  readonly columnsToAdd: readonly ColumnDecl[];
}

interface ReconciliationPlan {
  readonly toCreate: readonly TableDecl[];
  readonly toAlter: readonly TableAlterationPlan[];
}

/**
 * Reads `fqTableName`'s live column shape via `PRAGMA table_info`. `fqTableName` is always a
 * value this module itself computed via `fqName`/validated identifiers (never plugin-supplied
 * raw SQL), so interpolating it into the pragma string carries the same trust level as the
 * `CREATE TABLE "${name}"` calls elsewhere in this file — `PRAGMA` does not accept bound
 * parameters for its target, so this is the only way to scope it.
 */
function getExistingColumns(db: Database.Database, fqTableName: string): Map<string, ExistingColumnInfo> {
  const rows = db.prepare(`PRAGMA table_info("${fqTableName}")`).all() as Array<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }>;
  return new Map(rows.map((r) => [r.name, { type: r.type, notNull: r.notnull !== 0, primaryKey: r.pk !== 0 }]));
}

/**
 * Decides whether a declared-but-missing column on an already-existing table is safely addable
 * via `ALTER TABLE ADD COLUMN`, throwing a fail-closed `DeclError` for the two cases SQLite
 * cannot express as an `ADD COLUMN` at all (see this file's header comment for the full
 * reasoning). Returns `col` unchanged when it is safe to add.
 */
function planMissingColumn(tableName: string, col: ColumnDecl): ColumnDecl {
  if (col.primaryKey) {
    throw new DeclError(
      "COLUMN_ADD_PRIMARY_KEY",
      `table ${tableName} is missing declared column "${col.name}", which is a PRIMARY KEY. ` +
        `SQLite's ALTER TABLE has no way to add a primary key to an existing table — only a full ` +
        `table rebuild can, and this engine does not perform rebuilds. Ship "${col.name}" under a ` +
        `new table name instead, or coordinate an explicit, out-of-band migration.`
    );
  }
  if (col.notNull) {
    throw new DeclError(
      "COLUMN_ADD_NOT_NULL_WITHOUT_DEFAULT",
      `table ${tableName} is missing declared column "${col.name}", declared NOT NULL. SQLite's ` +
        `ALTER TABLE ADD COLUMN refuses a NOT NULL column unless a non-NULL default is also given, ` +
        `and this declaration grammar (ColumnDecl) has no default field to supply one. Declare ` +
        `"${col.name}" as nullable (omit notNull) so it can be added, and enforce NOT NULL at the ` +
        `application layer, or backfill it before requiring the constraint here.`
    );
  }
  return col;
}

/**
 * Fails closed when a column that already exists on the live table no longer matches its
 * declared type. A type change (e.g. TEXT → INTEGER) needs a table rebuild, the same as the
 * missing-column PRIMARY KEY case above — this module never attempts one.
 */
function assertColumnTypeMatches(tableName: string, col: ColumnDecl, existingCol: ExistingColumnInfo): void {
  if (existingCol.type === col.type) return;
  throw new DeclError(
    "COLUMN_TYPE_MISMATCH",
    `table ${tableName} column "${col.name}" is declared ${col.type} but the live column is ` +
      `${existingCol.type}. Changing a column's type needs a table rebuild, which this engine ` +
      `does not perform.`
  );
}

/**
 * Diffs one already-existing table's declared columns against its live shape (§2's own text:
 * "diffs declared-state against live-state"). A live column absent from `table.columns` is
 * deliberately not inspected here at all — see this file's header comment for why that drift is
 * left alone rather than dropped.
 */
function planColumnReconciliation(db: Database.Database, table: TableDecl, fqTableName: string): ColumnDecl[] {
  const existingColumns = getExistingColumns(db, fqTableName);
  const columnsToAdd: ColumnDecl[] = [];
  for (const col of table.columns) {
    const existingCol = existingColumns.get(col.name);
    if (existingCol === undefined) {
      columnsToAdd.push(planMissingColumn(table.name, col));
      continue;
    }
    assertColumnTypeMatches(table.name, col, existingCol);
  }
  return columnsToAdd;
}

/**
 * Builds the full reconciliation plan for a validated declaration: which declared tables don't
 * exist yet at all (`toCreate`, the pre-existing behavior) and which already-existing tables need
 * one or more columns added (`toAlter`, this fix). Throws a fail-closed `DeclError` if any
 * existing table's live shape can't be reconciled by a plain `ALTER TABLE ADD COLUMN`.
 */
function planReconciliation(
  db: Database.Database,
  decl: DataModuleDecl,
  existingTableNames: ReadonlySet<string>
): ReconciliationPlan {
  const toCreate: TableDecl[] = [];
  const toAlter: TableAlterationPlan[] = [];
  for (const table of decl.tables) {
    const fqTableName = fqName(decl.pluginId, table.name);
    if (!existingTableNames.has(fqTableName)) {
      toCreate.push(table);
      continue;
    }
    const columnsToAdd = planColumnReconciliation(db, table, fqTableName);
    if (columnsToAdd.length > 0) toAlter.push({ fqTableName, columnsToAdd });
  }
  return { toCreate, toAlter };
}

/** Records one applied DDL statement in the site-wide migration timeline (dedupes what was 3 inline call sites). */
function recordMigration(
  db: Database.Database,
  pluginId: string,
  objectName: string,
  ddl: string,
  snapshotPath: string | null,
  at: number
): void {
  db.prepare(
    `INSERT INTO _plugin_migrations (plugin_id, table_name, ddl, snapshot_path, at) VALUES (?, ?, ?, ?, ?)`
  ).run(pluginId, objectName, ddl, snapshotPath, at);
}

/**
 * Post-DDL sanity check (§2's VERIFYING phase): re-reads live state and returns a description of
 * anything the transaction claims to have applied but that isn't actually there. Empty means the
 * DDL is confirmed applied; a non-empty result makes the caller treat the whole attempt as failed
 * (see `declareDataModule`'s catch block) even though SQLite itself reported no error.
 */
function verifyPostDdl(db: Database.Database, decl: DataModuleDecl, plan: ReconciliationPlan): string[] {
  const missingTables = plan.toCreate
    .map((t) => fqName(decl.pluginId, t.name))
    .filter((name) => !existingTables(db, [name]).has(name));
  const missingColumns = plan.toAlter.flatMap((alteration) => {
    const nowExisting = getExistingColumns(db, alteration.fqTableName);
    return alteration.columnsToAdd
      .filter((c) => !nowExisting.has(c.name))
      .map((c) => `${alteration.fqTableName}.${c.name}`);
  });
  return [...missingTables, ...missingColumns];
}

/** Namespace-adoption (§5/§6/T5) and disk-headroom (§3/T4) preflight, both fail-closed, before any snapshot/lock/DDL. */
function runPreflightChecks(
  db: Database.Database,
  dbPath: string,
  decl: DataModuleDecl
): { ok: true } | { ok: false; error: { code: string; message: string } } {
  const adoption = checkNamespaceAdoption({ db, pluginId: decl.pluginId, provenance: decl.provenance });
  if (!adoption.allowed) {
    return { ok: false, error: { code: "IDENTITY_ADOPTION_REQUIRES_CONSENT", message: adoption.reason } };
  }
  // `checkDiskHeadroom` itself no-ops to `ok: true` for an in-memory `dbPath` (BUG FIX 2026-07-28)
  // — no snapshot file will ever be written for one, so there is no headroom to require.
  const headroom = checkDiskHeadroom(dbPath);
  if (!headroom.ok) {
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_DISK_HEADROOM",
        message: `dataModule declare refused: needs ~${headroom.requiredBytes} bytes free, only ${headroom.freeBytes ?? "unknown"} available`,
      },
    };
  }
  return { ok: true };
}

/**
 * Opens the phase journal only when there's a real file behind `snapshotPath` to recover to — an
 * in-memory db has no next boot to recover at (see this file's header comment), so `journalId`
 * stays null and every phase transition below becomes a no-op for that case.
 */
function openJournalIfFileBacked(db: Database.Database, pluginId: string, snapshotPath: string | null): number | null {
  if (snapshotPath === null) return null;
  ensureMigrationJournal(db);
  return beginJournalEntry({ db, pluginId, snapshotPath });
}

/** No-ops when there is no journal entry to advance (in-memory `dbPath` case). */
function advancePhaseIfJournaled(db: Database.Database, journalId: number | null, phase: JournalPhase): void {
  if (journalId === null) return;
  advanceJournalPhase({ db, id: journalId, phase });
}

/** No-ops when no snapshot file was ever written (in-memory `dbPath` case) — nothing to discard. */
async function discardSnapshotIfFileBacked(snapshotPath: string | null): Promise<void> {
  if (snapshotPath === null) return;
  await discardCommittedSnapshot(snapshotPath);
}

/** Declare (reconcile) a plugin's tables. Core snapshots first, then runs the DDL transactionally. */
export async function declareDataModule(
  required: { db: Database.Database; dbPath: string; decl: DataModuleDecl },
  _optional: Record<string, never> = {}
): Promise<DeclareResult> {
  const { db, dbPath, decl } = required;
  let plan: ReconciliationPlan;
  try {
    // Validate entirely before any I/O (§5 namespace + column shape + §3/T6 tier), then diff
    // declared-state against live-state (§2) — both table presence AND, for a table that already
    // exists, its declared columns against `PRAGMA table_info` (this file's header comment).
    validate(decl);
    const fq = decl.tables.map((t) => fqName(decl.pluginId, t.name));
    const existing = existingTables(db, fq);
    plan = planReconciliation(db, decl, existing);
  } catch (err) {
    const e = err as DeclError;
    return { ok: false, created: [], altered: [], snapshotPath: null, error: { code: e.code, message: e.message } };
  }

  if (plan.toCreate.length + plan.toAlter.length === 0) {
    return { ok: true, created: [], altered: [], snapshotPath: null }; // idempotent no-op — nothing to snapshot
  }

  const preflight = runPreflightChecks(db, dbPath, decl);
  if (!preflight.ok) {
    return { ok: false, created: [], altered: [], snapshotPath: null, error: preflight.error };
  }

  // §4 — snapshot the WHOLE db BEFORE any DDL. This is the never-brick anchor.
  // `snapshotDb` returns `null` for an in-memory `dbPath` (BUG FIX 2026-07-28, see `snapshot.ts`) —
  // no file was ever written, so there is nothing to journal a recovery pointer to.
  const snapshotPath = await snapshotDb({ db, dbPath, label: decl.pluginId });

  // The phase-journal (§2/T3) exists solely to let `migration-recovery.ts` restore a crash-
  // interrupted attempt at NEXT BOOT. An in-memory db has no next boot — the whole database
  // vanishes with the process — so there is nothing for the journal to ever recover, and
  // `_plugin_migration_journal.snapshot_path` is `NOT NULL` (see `migration-journal.ts`) and could
  // not hold a null `snapshotPath` even if we tried. `journalId` stays `null` and every phase
  // transition below is then a no-op for this case; the transaction's own same-process rollback
  // (§9, the only failure mode a same-process in-memory db can ever hit) is unaffected and remains
  // the complete safety net.
  const journalId = openJournalIfFileBacked(db, decl.pluginId, snapshotPath);

  const created: string[] = [];
  const altered: string[] = [];
  try {
    advancePhaseIfJournaled(db, journalId, "DDL_IN_PROGRESS");
    // One transaction for ALL DDL — both new tables and column additions to existing ones — so any
    // failure rolls the live db back to a working state (§9).
    db.transaction(() => {
      ensureJournal(db);
      const at = Date.now();
      for (const table of plan.toCreate) {
        const name = fqName(decl.pluginId, table.name);
        // No IF NOT EXISTS: a within-call duplicate is a malformed manifest → fail → roll back.
        const ddl = `CREATE TABLE "${name}" (${table.columns.map(columnSql).join(", ")})`;
        db.prepare(ddl).run();
        recordMigration(db, decl.pluginId, name, ddl, snapshotPath, at);
        created.push(name);

        for (const idx of table.indexes ?? []) {
          const { indexName, sql: indexDdl } = indexSql(name, idx);
          db.prepare(indexDdl).run();
          recordMigration(db, decl.pluginId, indexName, indexDdl, snapshotPath, at);
        }
      }
      for (const alteration of plan.toAlter) {
        for (const col of alteration.columnsToAdd) {
          const ddl = `ALTER TABLE "${alteration.fqTableName}" ADD COLUMN ${columnSql(col)}`;
          db.prepare(ddl).run();
          recordMigration(db, decl.pluginId, alteration.fqTableName, ddl, snapshotPath, at);
        }
        altered.push(alteration.fqTableName);
      }
    })();
    advancePhaseIfJournaled(db, journalId, "VERIFYING");
    const problems = verifyPostDdl(db, decl, plan);
    if (problems.length > 0) {
      throw new Error(`post-DDL verification failed: ${problems.join(", ")} not found after DDL`);
    }
    advancePhaseIfJournaled(db, journalId, "COMMITTED");
    // The snapshot's recovery window closed on the line above. `migration-recovery.ts` only ever
    // restores from NON-terminal journal entries, so a COMMITTED entry's snapshot is unreachable
    // by every code path that exists — keeping it means a permanent whole-database copy per
    // plugin, which is what filled the working directory with `.snapshot-store-*`,
    // `.snapshot-newsletter-*` and `.snapshot-comments-*` files. See `discardCommittedSnapshot`
    // for why this removes no recovery capability. Failure keeps its snapshot (catch branch).
    await discardSnapshotIfFileBacked(snapshotPath);
  } catch (err) {
    // better-sqlite3 already rolled the transaction back → live db is unchanged and working
    // (this is the same-process, catchable-failure case — no restore needed; restore only ever
    // runs at next-boot recovery for a CRASH, see migration-recovery.ts). The snapshot remains as
    // the named recovery point (§9) for operator forensics; the plugin is left in its prior state
    // (unaltered if it already existed, "uninstalled" if it was new). For an in-memory db,
    // `snapshotPath`/`journalId` are both null (see above) — there is no recovery point to report
    // because the same-process rollback just performed IS the full recovery; no crash-recovery boot
    // path can ever exist for `:memory:` to need one.
    advancePhaseIfJournaled(db, journalId, "ROLLED_BACK");
    const e = err as Error;
    return {
      ok: false,
      created: [],
      altered: [],
      snapshotPath,
      recoveryPoint: snapshotPath ?? undefined,
      error: { code: "DDL_FAILED", message: e.message },
    };
  }

  return { ok: true, created, altered, snapshotPath };
}
