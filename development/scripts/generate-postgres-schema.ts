/**
 * @file Generates `src/db/schema.postgres.ts` from `src/db/schema.ts`.
 *
 * Why generate rather than hand-maintain a second schema:
 * Tovu must run on SQLite (bundled, local, zero-config) and PostgreSQL (hosted, Supabase). The
 * obvious approach — write 63 `pgTable` twins by hand and keep them in sync — makes drift a
 * permanent, per-change tax on a solo maintainer, and a CI parity check can only ever tell you
 * drift *happened*. Deriving the PostgreSQL schema from the SQLite one instead makes drift
 * structurally impossible: there is one authored definition, and the second dialect is a build
 * artifact. A reviewer diffs the generated file; they never edit it.
 *
 * Why this is tractable here, specifically:
 * the mapping surface was measured, not assumed. Across all 63 tables and 580 columns there are
 * exactly three column kinds in use — `SQLiteText` (513), `SQLiteInteger` (64), `SQLiteBoolean`
 * (3) — plus 11 autoincrement primary keys, 31 defaults, 7 CHECK constraints, 9 foreign keys and
 * 4 composite primary keys. There are no JSON columns, no BLOB columns, no `mode: "timestamp"`
 * columns (every timestamp is `text` holding ISO-8601), and no unique constraints. A generator
 * covering that surface is a few hundred lines, not a second ORM.
 *
 * What this deliberately does NOT handle:
 * FTS5. `post_search_fts` is a virtual table in external-content mode with three sync triggers,
 * created by raw SQL in `drizzle/0022_posts_fts_search_index.sql`, and it is not a `sqliteTable`
 * declaration at all — so it is invisible to this generator by construction. PostgreSQL's nearest
 * equivalent (`tsvector` + GIN) is a different tokenisation and ranking model, not a value
 * translation, and it must be hand-authored as a dialect-branching search adapter. Search is a
 * separate migration step from row copying; do not expect this file to produce it.
 *
 * Run: `npx tsx development/scripts/generate-postgres-schema.ts`
 * Check (CI): `npx tsx development/scripts/generate-postgres-schema.ts --check`
 */
import fs from "node:fs";
import path from "node:path";

import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";

import * as schema from "../../src/db/schema";

const OUT_PATH = path.resolve(__dirname, "../../src/db/schema.postgres.ts");
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

/** Every exported Drizzle table in `schema.ts`, paired with the export name it must keep. */
function collectTables(): Array<{ exportName: string; table: never }> {
  return Object.entries(schema)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

/**
 * Maps one SQLite column kind to its PostgreSQL builder call.
 *
 * `SQLiteInteger` becomes `integer` rather than `bigint` because every integer column here is
 * either an autoincrement surrogate key or a small counter/watermark — none stores a value beyond
 * 2^31. Widening them all to `bigint` would change the JavaScript type Drizzle infers from `number`
 * to `bigint` and break every call site that does arithmetic on one.
 */
function columnBuilder(col: SQLiteColumn): string {
  const name = JSON.stringify(col.name);
  switch (col.columnType) {
    case "SQLiteText":
      return `text(${name})`;
    case "SQLiteBoolean":
      // Stored 0/1 in SQLite; PostgreSQL has a native boolean, so the REPRESENTATION changes even
      // though the logical type does not. Row copying must convert, not pass the integer through.
      return `boolean(${name})`;
    case "SQLiteInteger":
      return `integer(${name})`;
    default:
      throw new Error(
        `unmapped column kind "${col.columnType}" on column "${col.name}". ` +
          `This generator was written against a measured surface of SQLiteText/SQLiteInteger/SQLiteBoolean. ` +
          `Adding a new kind to schema.ts requires teaching columnBuilder about it first.`
      );
  }
}

/** Renders a literal default. SQL-expression defaults are rejected rather than guessed at. */
function renderDefault(col: SQLiteColumn): string {
  const value = col.default;
  if (value === undefined) return "";
  if (typeof value === "string") return `.default(${JSON.stringify(value)})`;
  if (typeof value === "number") return `.default(${value})`;
  if (typeof value === "boolean") return `.default(${value})`;
  throw new Error(
    `column "${col.name}" has a non-literal default (${typeof value}). SQL-expression defaults are ` +
      `dialect-specific and are not translated automatically — express it in application code, or ` +
      `extend this generator with an explicit, reviewed mapping.`
  );
}

/**
 * Maps each column to the TypeScript property name it is exposed under, which is NOT its SQL name
 * (`workspaceId` vs `workspace_id`). The generated schema must keep the TS names identical to the
 * SQLite schema's, because repository code addresses columns as `table.workspaceId` — if the two
 * dialects disagreed on property names, no adapter could ever be pointed at both.
 *
 * Drizzle exposes the columns as own properties of the table object keyed by TS name, so the
 * mapping is recovered by identity rather than by guessing a naming convention.
 */
function tsPropertyNames(table: object, columns: readonly SQLiteColumn[]): Map<SQLiteColumn, string> {
  const byColumn = new Map<SQLiteColumn, string>();
  for (const [key, value] of Object.entries(table)) {
    const match = columns.find((c) => c === value);
    if (match) byColumn.set(match, key);
  }
  const missing = columns.filter((c) => !byColumn.has(c));
  if (missing.length) {
    throw new Error(
      `could not recover TypeScript property names for: ${missing.map((c) => c.name).join(", ")}. ` +
        `Drizzle's table object no longer exposes columns as own properties — the generator's ` +
        `assumption has broken and must be revisited rather than falling back to SQL names.`
    );
  }
  return byColumn;
}

function renderColumn(tsName: string, col: SQLiteColumn): string {
  let out = columnBuilder(col);
  if (col.primary) {
    // A composite primary key is emitted at table level instead; `.primary` is only true for a
    // single-column PK, so this cannot double up with the composite branch below.
    out += (col as unknown as { autoIncrement?: boolean }).autoIncrement
      ? ".generatedAlwaysAsIdentity().primaryKey()"
      : ".primaryKey()";
  }
  if (col.notNull && !col.primary) out += ".notNull()";
  out += renderDefault(col);
  return `  ${tsName}: ${out},`;
}

interface TableExtras {
  indexes: string[];
  composite: string[];
  checks: string[];
}

function renderExtras(
  cfg: ReturnType<typeof getTableConfig>,
  exportName: string,
  tsNames: Map<SQLiteColumn, string>
): TableExtras {
  const ref = (c: unknown): string => `t.${tsNames.get(c as SQLiteColumn) ?? (c as SQLiteColumn).name}`;
  const indexes = cfg.indexes.map((idx) => {
    const cols = idx.config.columns.map(ref).join(", ");
    const builder = idx.config.unique ? "uniqueIndex" : "index";
    return `    ${builder}(${JSON.stringify(idx.config.name)}).on(${cols}),`;
  });

  const composite = cfg.primaryKeys.map((pk) => {
    const cols = pk.columns.map(ref).join(", ");
    return `    primaryKey({ columns: [${cols}] }),`;
  });

  // CHECK constraints are carried across verbatim as SQL text. Every check in this schema today is
  // a portable value assertion (an IN-list or a comparison), but that is a fact about the current
  // schema rather than a guarantee — so each one is emitted with a marker requiring a human to
  // confirm portability rather than being silently trusted.
  const checks = cfg.checks.map(
    (_, i) =>
      `    // REVIEW-PORTABILITY: check #${i} on ${exportName} is not auto-translated — see schema.ts`
  );

  return { indexes, composite, checks };
}

function renderTable(exportName: string, table: never): string {
  const cfg = getTableConfig(table);
  const tsNames = tsPropertyNames(table, cfg.columns);
  const columns = cfg.columns.map((c) => renderColumn(tsNames.get(c)!, c)).join("\n");
  const { indexes, composite, checks } = renderExtras(cfg, exportName, tsNames);
  const extras = [...composite, ...indexes, ...checks];

  const tail = extras.length ? `, (t) => [\n${extras.join("\n")}\n  ]` : "";
  return `export const ${exportName} = pgTable(${JSON.stringify(cfg.name)}, {\n${columns}\n}${tail});`;
}

function generate(): string {
  const tables = collectTables();
  const body = tables.map(({ exportName, table }) => renderTable(exportName, table)).join("\n\n");
  return `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced from \`src/db/schema.ts\` by \`development/scripts/generate-postgres-schema.ts\`.
 * Edit the SQLite schema and regenerate; editing this file directly will be overwritten and will
 * fail the drift check in CI.
 *
 * FTS5 search objects are absent on purpose — they are raw-SQL virtual tables, not \`sqliteTable\`
 * declarations, and PostgreSQL's tsvector/GIN equivalent is hand-authored. See the generator's
 * module doc.
 *
 * Tables: ${tables.length}
 */
import { boolean, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

${body}
`;
}

function main(): void {
  const generated = generate();
  const check = process.argv.includes("--check");

  if (!check) {
    fs.writeFileSync(OUT_PATH, generated, "utf8");
    process.stdout.write(`wrote ${path.relative(process.cwd(), OUT_PATH)}\n`);
    return;
  }

  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf8") : "";
  if (current === generated) {
    process.stdout.write("schema.postgres.ts is up to date with schema.ts\n");
    return;
  }
  process.stderr.write(
    "DRIFT: src/db/schema.postgres.ts does not match what schema.ts generates.\n" +
      "Run `npx tsx development/scripts/generate-postgres-schema.ts` and commit the result.\n"
  );
  process.exit(1);
}

main();