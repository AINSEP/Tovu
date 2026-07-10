/**
 * @file SPIKE — core-mediated plugin dataModule seam (ADR-023 §2/§4/§5/§9).
 *
 * A plugin DECLARES its desired tables as data; CORE alone executes the DDL. A plugin never
 * authors a migration and never holds a raw DB handle. The flow, in order:
 *   1. validate the declaration (namespace `p_{pluginId}__*` §5, column shape) — before any I/O;
 *   2. skip tables that already exist (idempotent, state-based reconciliation §2);
 *   3. **snapshot the whole db FIRST** (§4) — the never-brick anchor;
 *   4. run all DDL inside ONE transaction so a failure rolls the live db back to a working state
 *      (§9: recoverable, not zero-loss), leaving the snapshot as the named recovery point.
 *
 * Exploratory spike: goes beyond ADR-023 §12's "recognize-and-reject the dataModule key in v1"
 * disposition on purpose, to surface real problems. ADR-023 is PROPOSED, not accepted.
 *
 * NOTE (§0 access-control caveat): a Tier-3 in-process plugin could bypass this by opening the db
 * file directly. The RECOVERABILITY guarantee here (who snapshots + who runs DDL = core) holds
 * unconditionally; the access-control framing is advisory until ADR-024 §4 isolation ships.
 */
import type Database from "better-sqlite3";

import { snapshotDb } from "./snapshot";

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BLOB";

export interface ColumnDecl {
  readonly name: string;
  readonly type: ColumnType;
  readonly notNull?: boolean;
  readonly primaryKey?: boolean;
}

export interface TableDecl {
  /** SHORT name; core prefixes it with the reserved `p_{pluginId}__` namespace. */
  readonly name: string;
  readonly columns: readonly ColumnDecl[];
}

export interface DataModuleDecl {
  readonly pluginId: string;
  readonly tables: readonly TableDecl[];
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

/** Validate the declaration entirely before any snapshot or DDL (§5 namespace + column shape). */
function validate(decl: DataModuleDecl): void {
  if (!IDENT.test(decl.pluginId)) throw new DeclError("BAD_PLUGIN_ID", `invalid pluginId: ${decl.pluginId}`);
  if (decl.tables.length === 0) throw new DeclError("EMPTY", "declaration lists no tables");
  for (const table of decl.tables) {
    if (!IDENT.test(table.name)) throw new DeclError("BAD_TABLE_NAME", `invalid table name: ${table.name}`);
    if (table.columns.length === 0) throw new DeclError("NO_COLUMNS", `table ${table.name} declares no columns`);
    for (const col of table.columns) {
      if (!IDENT.test(col.name)) throw new DeclError("BAD_COLUMN", `invalid column name: ${col.name}`);
      if (!TYPES.has(col.type)) throw new DeclError("BAD_TYPE", `unsupported column type for ${col.name}: ${col.type}`);
    }
  }
}

function columnSql(col: ColumnDecl): string {
  let sql = `"${col.name}" ${col.type}`;
  if (col.primaryKey) sql += " PRIMARY KEY";
  if (col.notNull) sql += " NOT NULL";
  return sql;
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

  // §4 — snapshot the WHOLE db BEFORE any DDL. This is the never-brick anchor.
  const snapshotPath = await snapshotDb(db, dbPath, decl.pluginId);

  const created: string[] = [];
  try {
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
      }
    })();
  } catch (err) {
    // better-sqlite3 already rolled the transaction back → live db is unchanged and working.
    // The snapshot remains as the named recovery point (§9); the plugin is left "uninstalled".
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
