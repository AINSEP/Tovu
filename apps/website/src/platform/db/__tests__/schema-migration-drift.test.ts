/**
 * @file Does `schema.sqlite.ts` agree with THE MIGRATIONS ON DISK?
 *
 * Why this exists — the 2026-09-02 outage this guard is the regression test for: an agent added
 * `memberAccessJson: text("member_access_json")` to `schema.sqlite.ts` and did not generate the matching
 * migration. Drizzle builds an EXPLICIT column list for every query, never `SELECT *`, so from the
 * moment that line was saved every `posts` query named a column SQLite did not have. `/` and
 * `/:slug` both run through `listPublishedPosts`, so the entire public site 500'd in 3ms. Nothing in
 * the failure named the schema — the admin UI showed only a 60s timeout.
 *
 * The sharp edge this file exists to blunt: **editing `schema.sqlite.ts` is a breaking change the moment
 * you save it, not when the new field is first read.** A feature nobody had wired up took the site
 * down. So the failure messages below name the exact `table.column`, never a count — the outage's
 * real symptom named nothing at all, and that is what made it expensive.
 *
 * WHY THE EXISTING GREEN SUITE DID NOT CATCH IT (this guard is not a duplicate of any of these):
 * - `site-dir/schema-guard.ts` compares a SITE's persisted stamp against the runtime's bundled
 *   migrations. That is "is this site's file behind the code", a different question entirely.
 * - `migration/manifest.ts` + `schema-postgres-parity.test.ts` prove the two DIALECTS agree. Both
 *   are DERIVED FROM `schema.sqlite.ts`. So when `schema.sqlite.ts` declares a column no migration creates, both
 *   agree perfectly and both are wrong — which is precisely how the outage sailed through a green
 *   suite. Every one of those checks is downstream of `schema.sqlite.ts`; none of them ever looks at the
 *   SQL that actually runs against the database.
 *
 * This file is the missing third thing: it applies the real migrations to a throwaway SQLite file
 * with the SAME migrator the product uses (`sqlite/content-db.ts`'s `better-sqlite3` +
 * `migrate(db, { migrationsFolder })`) and compares the resulting physical shape against
 * `schema.sqlite.ts`'s declared shape IN BOTH DIRECTIONS.
 *
 * Why a test and not a `check:*` script: ten of this repo's nineteen `check:*` scripts are invoked
 * nowhere, and all eight wired into CI are `continue-on-error: true` — a `check:` script cannot fail
 * anything. Every `.test.ts` under `apps/website/src` is already inside `test:ci`'s glob, so this
 * file is wired in by existing, load-bearing configuration rather than by a new one.
 *
 * Nothing here touches a real database. `openContentDb` AUTO-APPLIES migrations, so opening a real
 * site db through app code would be a WRITE; the temp file below is created under `os.tmpdir()` and
 * removed afterward.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { collectCoreTables, DERIVED_OBJECTS } from "../migration/manifest.js";

/** Same folder `sqlite/content-db.ts` points its own `migrate()` at, resolved the same way. */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../drizzle");

/** `{ sql_table_name -> sorted sql column names }` — the shape both sides of the comparison take. */
type TableShape = ReadonlyMap<string, readonly string[]>;

// ---------------------------------------------------------------------------
// Side A — what schema.sqlite.ts DECLARES
// ---------------------------------------------------------------------------

/**
 * Derived from `manifest.ts`'s own `collectCoreTables()`, deliberately NOT a second copy of its
 * `Symbol.for("drizzle:IsDrizzleTable")` filter. This repo produced three separate hand-maintained
 * registry mirrors that drifted from their source inside a single day; a mirror of the table list
 * here would be a fourth, and it would drift in exactly the direction that hides drift. See that
 * function's own doc (and `SourceTable`'s) for why `table` is typed `never` and why
 * `getTableConfig()` accepts it without a per-call-site cast.
 */
function declaredShape(): TableShape {
  const shape = new Map<string, readonly string[]>();
  for (const { exportName, table } of collectCoreTables()) {
    const cfg = getTableConfig(table);
    if (shape.has(cfg.name)) {
      throw new Error(`schema.sqlite.ts exports two tables both named "${cfg.name}" (second one: "${exportName}")`);
    }
    shape.set(
      cfg.name,
      cfg.columns.map((c) => c.name).sort()
    );
  }
  return shape;
}

// ---------------------------------------------------------------------------
// Side B — what THE MIGRATIONS ON DISK actually build
// ---------------------------------------------------------------------------

/**
 * Objects that exist in the migrated database with no `sqliteTable` declaration behind them, and so
 * are NOT drift. Two of the three groups are derived rather than retyped:
 *
 * 1. `DERIVED_OBJECTS` (`post_search_document`, `post_search_fts`) — imported from `manifest.ts`,
 *    which already carries the reviewed rationale for each: both are raw-SQL objects from
 *    `0022_posts_fts_search_index.sql` with no Drizzle representation by construction. Naming them
 *    again here would be the mirror-drift failure mode this file's own `declaredShape()` doc rejects.
 * 2. `__drizzle_migrations` — created by drizzle's migrator itself, not by any migration in the
 *    folder. Derived in the only sense available: it is a fact about the migrator, so it is asserted
 *    against reality by `MIGRATOR_BOOKKEEPING_TABLE`'s own presence check below rather than trusted.
 * 3. FTS5's shadow tables. **This is the one part that genuinely cannot be derived**, and the reason
 *    is worth stating rather than waving at: SQLite's FTS5 extension creates them itself, at
 *    `CREATE VIRTUAL TABLE` time, from its own internal storage design. Their names appear in no
 *    migration file, in no Drizzle declaration, and in no manifest entry — there is nothing in this
 *    repository to derive them FROM. What can be derived is the stem: every one of them is
 *    `<virtual table name>_<suffix>`, and the virtual table's name comes from the `DERIVED_OBJECTS`
 *    entry whose `kind` is `"fts5-virtual-table"`. So the prefix is derived and only the suffix set
 *    is a literal — and `fts5ShadowSuffixesAreExhaustive` below fails loudly if SQLite ever grows a
 *    suffix this list does not know about, rather than letting an unknown one read as drift.
 */
const FTS5_SHADOW_SUFFIXES = ["data", "idx", "content", "docsize", "config"] as const;

const MIGRATOR_BOOKKEEPING_TABLE = "__drizzle_migrations";

/**
 * A FOURTH group, found by this guard's own first run against the untouched tree rather than known
 * in advance: tables a migration creates as raw SQL and the product reads through raw prepared
 * statements, deliberately never declared as a `sqliteTable`. Structurally identical to
 * `DERIVED_OBJECTS` (raw-SQL migration object, no Drizzle declaration) but NOT eligible to live
 * there — `DERIVED_OBJECTS` carries `copyPolicy: "never-copy-rows"`, which is a claim about
 * rebuildable search indexes and is flatly wrong about these three: they hold real authored data a
 * Postgres copier must carry across, not rebuild.
 *
 * Deliberately a hand-reviewed ALLOWLIST WITH RATIONALE rather than a bare name list or a heuristic,
 * following `manifest.ts`'s `REVIEWED_JSON_COLUMNS` precedent exactly — including its gates. The two
 * tests below assert every entry here still names a table the migrations really create AND that no
 * entry has since acquired a `sqliteTable` declaration, so this registry cannot rot into a blanket
 * excuse the way an unpoliced allowlist would. This is the one place in this file where nothing
 * upstream can be derived from: no existing registry in this repo names these tables at all.
 *
 * NOTE FOR THE POSTGRES MIGRATION (not this guard's job to fix): because these three are invisible
 * to `collectCoreTables()`, they are equally invisible to `computeCoreTableCopyOrder()` and to every
 * classification in `manifest.ts`. A bulk copier that walks that order would silently omit all three.
 */
const RAW_SQL_MANAGED_TABLES: Readonly<Record<string, string>> = {
  ai_chats: "0023_ai_chat_history.sql — Jini's chat-history DDL copied verbatim into a Tovu migration so @jini-ai/sqlite does not run a second migrator against content.db. Read/written through @jini-ai/sqlite's own store, never through Drizzle; drift against the package constant is guarded separately by assistant/persistence/__tests__/ddl-parity.test.ts.",
  ai_chat_messages: "0023_ai_chat_history.sql — the message table of the same Jini-mirrored chat-history DDL as ai_chats, with the same owner and the same separate ddl-parity.test.ts guard.",
  assistant_agent_sessions: "0051_assistant_agent_sessions.sql — the (conversation, agent) -> agent-CLI session id map, read and written exclusively through raw prepared statements in assistant/persistence/agent-session-store.ts. Kept out of schema.sqlite.ts on purpose; see that migration's own header for why it is separate from the Jini-mirrored tables above.",
};

function fts5ShadowPrefixes(): string[] {
  return DERIVED_OBJECTS.filter((o) => o.kind === "fts5-virtual-table").map((o) => `${o.name}_`);
}

function isNotDrift(tableName: string): boolean {
  if (tableName === MIGRATOR_BOOKKEEPING_TABLE) return true;
  if (tableName.startsWith("sqlite_")) return true; // SQLite's own internal catalog objects
  if (DERIVED_OBJECTS.some((o) => o.name === tableName)) return true;
  if (Object.hasOwn(RAW_SQL_MANAGED_TABLES, tableName)) return true;
  return fts5ShadowPrefixes().some(
    (prefix) => tableName.startsWith(prefix) && (FTS5_SHADOW_SUFFIXES as readonly string[]).includes(tableName.slice(prefix.length))
  );
}

interface MigratedDatabase {
  readonly shape: TableShape;
  /** Every table name present after migration, allowlisted ones included — for the gates below. */
  readonly allTableNames: readonly string[];
}

/**
 * Applies every migration in `../drizzle` to a fresh throwaway file and reads back the PHYSICAL
 * shape. Mirrors `sqlite/content-db.ts`'s own open sequence (same driver, same pragmas, same
 * migrator, same folder) so what is measured here is what the product actually gets — not a
 * reimplementation that could diverge from it.
 */
function migratedDatabase(): MigratedDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-schema-drift-"));
  const file = path.join(dir, "probe.db");
  try {
    const sqlite = new Database(file);
    try {
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });

      const rows = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>;
      const allTableNames = rows.map((r) => r.name).sort();
      const shape = new Map<string, readonly string[]>();
      for (const name of allTableNames) {
        if (isNotDrift(name)) continue;
        const info = sqlite.prepare(`pragma table_info("${name}")`).all() as Array<{ name: string }>;
        shape.set(
          name,
          info.map((c) => c.name).sort()
        );
      }
      return { shape, allTableNames };
    } finally {
      sqlite.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// The comparison — a pure function over two shapes, so both drift directions can be proven at this
// seam with synthetic input as well as end-to-end against the real schema.
// ---------------------------------------------------------------------------

interface DriftReport {
  /** Tables `schema.sqlite.ts` declares that no migration creates. */
  readonly missingTables: readonly string[];
  /** Tables the migrations create that `schema.sqlite.ts` no longer declares. */
  readonly extraTables: readonly string[];
  /** `"table.column"` — declared in `schema.sqlite.ts`, created by no migration. THE OUTAGE'S SHAPE. */
  readonly missingColumns: readonly string[];
  /** `"table.column"` — created by a migration, no longer declared in `schema.sqlite.ts`. */
  readonly extraColumns: readonly string[];
}

function diffShapes(declared: TableShape, migrated: TableShape): DriftReport {
  const missingTables: string[] = [];
  const extraTables: string[] = [];
  const missingColumns: string[] = [];
  const extraColumns: string[] = [];

  for (const [table, declaredColumns] of declared) {
    const migratedColumns = migrated.get(table);
    if (!migratedColumns) {
      missingTables.push(table);
      continue; // every column of a missing table would otherwise be reported twice
    }
    const present = new Set(migratedColumns);
    for (const column of declaredColumns) if (!present.has(column)) missingColumns.push(`${table}.${column}`);
  }
  for (const [table, migratedColumns] of migrated) {
    const declaredColumns = declared.get(table);
    if (!declaredColumns) {
      extraTables.push(table);
      continue;
    }
    const present = new Set(declaredColumns);
    for (const column of migratedColumns) if (!present.has(column)) extraColumns.push(`${table}.${column}`);
  }

  return {
    missingTables: missingTables.sort(),
    extraTables: extraTables.sort(),
    missingColumns: missingColumns.sort(),
    extraColumns: extraColumns.sort(),
  };
}

const OUTAGE_REMINDER =
  "Drizzle builds an EXPLICIT column list for every query (never SELECT *), so a column declared in schema.sqlite.ts " +
  "with no migration behind it breaks EVERY query against that table the moment schema.sqlite.ts is saved — not when " +
  "the new field is first read. On 2026-09-02 one such column (posts.member_access_json) 500'd the entire " +
  "public site in 3ms. Generate the migration: npm run db:generate (see drizzle.config.ts).";

// ---------------------------------------------------------------------------
// End-to-end gates against the real schema and the real migrations
// ---------------------------------------------------------------------------

test("schema.sqlite.ts declares no COLUMN that the migrations on disk do not create", () => {
  const report = diffShapes(declaredShape(), migratedDatabase().shape);
  assert.deepEqual(
    report.missingColumns,
    [],
    `schema.sqlite.ts declares ${report.missingColumns.length} column(s) no migration creates: ` +
      `${report.missingColumns.join(", ")}. ${OUTAGE_REMINDER}`
  );
});

test("the migrations on disk create no COLUMN that schema.sqlite.ts has dropped", () => {
  const report = diffShapes(declaredShape(), migratedDatabase().shape);
  assert.deepEqual(
    report.extraColumns,
    [],
    `the migrations create ${report.extraColumns.length} column(s) schema.sqlite.ts no longer declares: ` +
      `${report.extraColumns.join(", ")}. Either schema.sqlite.ts dropped a column without a migration to drop it ` +
      `(reads stay fine, but the column is now unmanaged and any NOT NULL default it carries will fight ` +
      `inserts), or this column is a derived object that belongs in manifest.ts's DERIVED_OBJECTS.`
  );
});

test("schema.sqlite.ts declares no TABLE that the migrations on disk do not create", () => {
  const report = diffShapes(declaredShape(), migratedDatabase().shape);
  assert.deepEqual(
    report.missingTables,
    [],
    `schema.sqlite.ts declares ${report.missingTables.length} table(s) no migration creates: ` +
      `${report.missingTables.join(", ")}. ${OUTAGE_REMINDER}`
  );
});

test("the migrations on disk create no TABLE that schema.sqlite.ts has dropped", () => {
  const report = diffShapes(declaredShape(), migratedDatabase().shape);
  assert.deepEqual(
    report.extraTables,
    [],
    `the migrations create ${report.extraTables.length} table(s) schema.sqlite.ts does not declare: ` +
      `${report.extraTables.join(", ")}. A table with no sqliteTable declaration is unreachable through ` +
      `Drizzle. If it is a rebuildable search index, it belongs in manifest.ts's DERIVED_OBJECTS with its ` +
      `rationale; if it holds real data and is read through raw prepared statements, add it to ` +
      `RAW_SQL_MANAGED_TABLES above WITH a rationale naming the migration and the owning module — never as a ` +
      `bare name.`
  );
});

// ---------------------------------------------------------------------------
// Gates on the allowlist itself — an allowlist that quietly stops matching anything is how a guard
// goes vacuous. Each of these fails if the thing it excuses is no longer really there.
// ---------------------------------------------------------------------------

test("every allowlisted non-drift object is actually present in the migrated database", () => {
  const { allTableNames } = migratedDatabase();
  const present = new Set(allTableNames);

  assert.ok(
    present.has(MIGRATOR_BOOKKEEPING_TABLE),
    `"${MIGRATOR_BOOKKEEPING_TABLE}" is allowlisted as the migrator's own bookkeeping table but does not exist ` +
      `after migration — the allowlist is excusing something that is not there. Tables found: ${allTableNames.join(", ")}`
  );
  for (const derived of DERIVED_OBJECTS) {
    assert.ok(
      present.has(derived.name),
      `manifest.ts's DERIVED_OBJECTS names "${derived.name}", allowlisted here as not-drift, but no such table ` +
        `exists after migration. Either the migration that creates it was removed, or the entry is stale.`
    );
  }
  for (const name of Object.keys(RAW_SQL_MANAGED_TABLES)) {
    assert.ok(
      present.has(name),
      `RAW_SQL_MANAGED_TABLES excuses "${name}" from the table gate, but no migration creates it — a stale entry ` +
        `in that registry is a standing excuse for a table that is not there, which is how an allowlist rots into ` +
        `a blanket exemption. Remove the entry.`
    );
  }
});

/**
 * The other half of the `RAW_SQL_MANAGED_TABLES` gate: an entry is only legitimate while the table
 * really has NO `sqliteTable` declaration. The moment someone declares one in `schema.sqlite.ts`, that
 * table must go back under the ordinary column-level comparison — otherwise this registry would be
 * silently exempting a fully Drizzle-managed table from the exact check that catches the outage.
 */
test("no RAW_SQL_MANAGED_TABLES entry has since acquired a schema.sqlite.ts declaration", () => {
  const declared = declaredShape();
  const nowDeclared = Object.keys(RAW_SQL_MANAGED_TABLES).filter((name) => declared.has(name)).sort();
  assert.deepEqual(
    nowDeclared,
    [],
    `${nowDeclared.join(", ")} now has a sqliteTable declaration in schema.sqlite.ts but is still listed in ` +
      `RAW_SQL_MANAGED_TABLES. Remove the entry so its columns are compared against the migrations like every ` +
      `other declared table — leaving it excuses exactly the drift this file exists to catch.`
  );
});

/**
 * The one hand-written part of the allowlist (see `FTS5_SHADOW_SUFFIXES`'s doc for why it cannot be
 * derived) held to the same standard as the derived parts: if SQLite's FTS5 creates a shadow table
 * whose suffix this list does not know, it must surface HERE, naming the suffix, instead of being
 * misreported by the table gate above as schema drift.
 */
test("FTS5 shadow-table suffixes are exhaustive — an unknown one is a stale allowlist, not drift", () => {
  const { allTableNames } = migratedDatabase();
  const prefixes = fts5ShadowPrefixes();
  assert.ok(prefixes.length > 0, "DERIVED_OBJECTS no longer names any fts5-virtual-table; the prefix rule derives from it");

  const unknown: string[] = [];
  for (const name of allTableNames) {
    for (const prefix of prefixes) {
      if (!name.startsWith(prefix)) continue;
      const suffix = name.slice(prefix.length);
      if (!(FTS5_SHADOW_SUFFIXES as readonly string[]).includes(suffix)) unknown.push(`${name} (suffix "${suffix}")`);
    }
  }
  assert.deepEqual(
    unknown,
    [],
    `unrecognized FTS5 shadow table(s): ${unknown.join(", ")}. Add the suffix to FTS5_SHADOW_SUFFIXES if SQLite ` +
      `really does create it, or investigate — an unexpected table sharing an FTS5 index's name prefix is not ` +
      `automatically benign.`
  );
});

test("the derived shape is non-trivial — a guard comparing two empty sets proves nothing", () => {
  const declared = declaredShape();
  const { shape: migrated } = migratedDatabase();
  assert.ok(declared.size > 50, `expected schema.sqlite.ts to declare dozens of tables, got ${declared.size}`);
  assert.ok(migrated.size > 50, `expected the migrations to create dozens of tables, got ${migrated.size}`);
  const postsColumns = migrated.get("posts");
  assert.ok(postsColumns && postsColumns.length > 5, `expected a migrated "posts" table with real columns, got ${String(postsColumns)}`);
});

// ---------------------------------------------------------------------------
// Seam proofs — `diffShapes` is exercised against synthetic shapes so both drift directions are
// proven to be DETECTED and to NAME THE COLUMN, without touching a migration file (regenerating one
// corrupts the hash chain; migrations auto-apply on every openContentDb, so writing one is not a
// reversible act in this repo).
// ---------------------------------------------------------------------------

test("seam: a column in schema.sqlite.ts with no migration is reported as missing, by name", () => {
  const declared = new Map([["posts", ["id", "slug", "member_access_json"]]]);
  const migrated = new Map([["posts", ["id", "slug"]]]);
  const report = diffShapes(declared, migrated);
  assert.deepEqual(report.missingColumns, ["posts.member_access_json"]);
  assert.deepEqual(report.extraColumns, []);
  assert.deepEqual(report.missingTables, []);
  assert.deepEqual(report.extraTables, []);
});

test("seam: a column the migrations create but schema.sqlite.ts dropped is reported as extra, by name", () => {
  const declared = new Map([["posts", ["id", "slug"]]]);
  const migrated = new Map([["posts", ["id", "slug", "legacy_body_html"]]]);
  const report = diffShapes(declared, migrated);
  assert.deepEqual(report.extraColumns, ["posts.legacy_body_html"]);
  assert.deepEqual(report.missingColumns, []);
});

test("seam: a table missing on either side is reported once, and not re-reported as N missing columns", () => {
  const declared = new Map([
    ["posts", ["id"]],
    ["members", ["id", "email"]],
  ]);
  const migrated = new Map([
    ["posts", ["id"]],
    ["orphaned_legacy_table", ["id"]],
  ]);
  const report = diffShapes(declared, migrated);
  assert.deepEqual(report.missingTables, ["members"]);
  assert.deepEqual(report.extraTables, ["orphaned_legacy_table"]);
  assert.deepEqual(report.missingColumns, [], "a missing table must not also emit one entry per column");
  assert.deepEqual(report.extraColumns, [], "an extra table must not also emit one entry per column");
});

test("seam: an in-agreement pair reports no drift at all", () => {
  const shape = new Map([
    ["posts", ["id", "slug"]],
    ["members", ["id", "email"]],
  ]);
  const report = diffShapes(shape, new Map(shape));
  assert.deepEqual(report, { missingTables: [], extraTables: [], missingColumns: [], extraColumns: [] });
});
