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
import { checkNamespaceAdoption } from "./plugin-identity";
import type { PluginProvenance } from "./plugin-identity";
import { snapshotDb } from "./snapshot";

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
function validate(decl: DataModuleDecl): void {
  if (!IDENT.test(decl.pluginId)) throw new DeclError("BAD_PLUGIN_ID", `invalid pluginId: ${decl.pluginId}`);
  if (decl.pluginTier === "tier-1") {
    throw new DeclError("TIER1_NOT_ALLOWED", "dataModule requires executable code (Tier-2 or Tier-3); Tier-1 plugins cannot request it");
  }
  if (decl.tables.length === 0) throw new DeclError("EMPTY", "declaration lists no tables");
  for (const table of decl.tables) {
    if (!IDENT.test(table.name)) throw new DeclError("BAD_TABLE_NAME", `invalid table name: ${table.name}`);
    if (table.columns.length === 0) throw new DeclError("NO_COLUMNS", `table ${table.name} declares no columns`);
    const declaredColumns = new Set<string>();
    for (const col of table.columns) {
      if (!IDENT.test(col.name)) throw new DeclError("BAD_COLUMN", `invalid column name: ${col.name}`);
      if (!TYPES.has(col.type)) throw new DeclError("BAD_TYPE", `unsupported column type for ${col.name}: ${col.type}`);
      declaredColumns.add(col.name);
    }
    for (const idx of table.indexes ?? []) {
      if (!IDENT.test(idx.name)) throw new DeclError("BAD_INDEX_NAME", `invalid index name: ${idx.name}`);
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

/** Declare (reconcile) a plugin's tables. Core snapshots first, then runs the DDL transactionally. */
export async function declareDataModule(
  db: Database.Database,
  dbPath: string,
  decl: DataModuleDecl
): Promise<DeclareResult> {
  try {
    validate(decl);
  } catch (err) {
    const e = err as DeclError;
    return { ok: false, created: [], snapshotPath: null, error: { code: e.code, message: e.message } };
  }

  const fq = decl.tables.map((t) => fqName(decl.pluginId, t.name));
  const existing = existingTables(db, fq);
  const toCreate = decl.tables.filter((t) => !existing.has(fqName(decl.pluginId, t.name)));
  if (toCreate.length === 0) {
    return { ok: true, created: [], snapshotPath: null }; // idempotent no-op — nothing to snapshot
  }

  // §5/§6/T5 — namespace-adoption guard, before any snapshot/lock/DDL.
  const adoption = checkNamespaceAdoption(db, decl.pluginId, decl.provenance);
  if (!adoption.allowed) {
    return { ok: false, created: [], snapshotPath: null, error: { code: "IDENTITY_ADOPTION_REQUIRES_CONSENT", message: adoption.reason } };
  }

  // §3/T4 — disk-headroom preflight, fail closed before any file is touched.
  const headroom = checkDiskHeadroom(dbPath);
  if (!headroom.ok) {
    return {
      ok: false,
      created: [],
      snapshotPath: null,
      error: {
        code: "INSUFFICIENT_DISK_HEADROOM",
        message: `dataModule declare refused: needs ~${headroom.requiredBytes} bytes free, only ${headroom.freeBytes ?? "unknown"} available`,
      },
    };
  }

  // §4 — snapshot the WHOLE db BEFORE any DDL. This is the never-brick anchor.
  const snapshotPath = await snapshotDb(db, dbPath, decl.pluginId);

  ensureMigrationJournal(db);
  const journalId = beginJournalEntry(db, decl.pluginId, snapshotPath);

  const created: string[] = [];
  try {
    advanceJournalPhase(db, journalId, "DDL_IN_PROGRESS");
    // One transaction for all DDL: any failure rolls the live db back to a working state (§9).
    db.transaction(() => {
      ensureJournal(db);
      const at = Date.now();
      for (const table of toCreate) {
        const name = fqName(decl.pluginId, table.name);
        // No IF NOT EXISTS: a within-call duplicate is a malformed manifest → fail → roll back.
        const ddl = `CREATE TABLE "${name}" (${table.columns.map(columnSql).join(", ")})`;
        db.prepare(ddl).run();
        db.prepare(
          `INSERT INTO _plugin_migrations (plugin_id, table_name, ddl, snapshot_path, at) VALUES (?, ?, ?, ?, ?)`
        ).run(decl.pluginId, name, ddl, snapshotPath, at);
        created.push(name);

        for (const idx of table.indexes ?? []) {
          const { indexName, sql: indexDdl } = indexSql(name, idx);
          db.prepare(indexDdl).run();
          db.prepare(
            `INSERT INTO _plugin_migrations (plugin_id, table_name, ddl, snapshot_path, at) VALUES (?, ?, ?, ?, ?)`
          ).run(decl.pluginId, indexName, indexDdl, snapshotPath, at);
        }
      }
    })();
    advanceJournalPhase(db, journalId, "VERIFYING");
    const stillMissing = toCreate.filter((t) => !existingTables(db, [fqName(decl.pluginId, t.name)]).has(fqName(decl.pluginId, t.name)));
    if (stillMissing.length > 0) {
      throw new Error(`post-DDL verification failed: ${stillMissing.map((t) => t.name).join(", ")} not found after CREATE TABLE`);
    }
    advanceJournalPhase(db, journalId, "COMMITTED");
  } catch (err) {
    // better-sqlite3 already rolled the transaction back → live db is unchanged and working
    // (this is the same-process, catchable-failure case — no restore needed; restore only ever
    // runs at next-boot recovery for a CRASH, see migration-recovery.ts). The snapshot remains as
    // the named recovery point (§9) for operator forensics; the plugin is left "uninstalled".
    advanceJournalPhase(db, journalId, "ROLLED_BACK");
    const e = err as Error;
    return {
      ok: false,
      created: [],
      snapshotPath,
      recoveryPoint: snapshotPath,
      error: { code: "DDL_FAILED", message: e.message },
    };
  }

  return { ok: true, created, snapshotPath };
}
