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
 * (3) — plus 11 autoincrement primary keys, 31 defaults, 7 CHECK constraints, 9 foreign keys, 4
 * composite primary keys, 65 indexes (27 unique), and 1 column-level `.unique()` constraint
 * (`workspaces.slug`). There are no JSON columns, no BLOB columns, no `mode: "timestamp"` columns
 * (every timestamp is `text` holding ISO-8601), and no table-level multi-column `unique().on(...)`
 * constraints. A generator covering that surface is a few hundred lines, not a second ORM.
 *
 * Every one of those 65 indexes is a plain ascending column list today — no partial-index `WHERE`,
 * no `.asc()`/`.desc()` ordering, no expression index. The generator translates all three anyway
 * (`renderIndexColumnExpr`/`renderSqlText`) rather than refusing them outright: SQLite's Drizzle
 * represents ordering and expressions as the exact same `SQL`-chunk shape CHECK bodies already use
 * (`asc(col)`/`desc(col)` literally expand to `` sql`${col} asc` ``), so the hardened renderer that
 * shape needs already exists. `src/db/__tests__/schema-postgres-generator-fixtures.test.ts` proves
 * the translation against hand-built fixture tables, since `schema.ts` has no live case to prove it
 * against — read that file's own doc before assuming this paragraph is aspirational.
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

import { Column, is, Param, SQL, StringChunk } from "drizzle-orm";
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

/**
 * Generic "no unrecognised, POPULATED own property" gate, shared by every completeness check in
 * this file.
 *
 * Why a shared helper rather than one bespoke check per structural element: the failure mode this
 * guards against is the same shape everywhere — a Drizzle object exposes a property this generator
 * was never taught about, so it is silently absent from the PostgreSQL output. Centralising the
 * walk-and-compare means every call site is "declare what's known, list what to reject", not a
 * hand-rolled loop that could itself go stale.
 *
 * `Object.keys(subject)` walks the object's actual own enumerable properties at generation time —
 * it does not depend on this file's own idea of what Drizzle exposes. That is what makes this catch
 * an *unknown* unknown: a future Drizzle upgrade that adds a wholly new property trips this the
 * first time the generator runs against it, before a single line of output is produced, rather than
 * requiring someone to have already anticipated that property's name.
 *
 * Unrecognised-but-EMPTY is deliberately not an error. Two ways this guard could have been written:
 * reject any key it doesn't recognise, or reject only a key it doesn't recognise AND that actually
 * holds data. The first is what shipped originally, and it is too strict in a way this generator has
 * not yet been bitten by but will be: a routine Drizzle patch that adds a new, still-`undefined`
 * internal metadata field (a common pattern — see `hasDefault`/`uniqueType` already living on
 * `Column` today, both unset in this schema) would fail the Tovu build on an upgrade that changed
 * nothing this generator emits. The second keeps the actual invariant — a Drizzle object must never
 * carry PostgreSQL-relevant data this generator doesn't know it is dropping — while not treating
 * "Drizzle's shape grew" and "Drizzle's shape grew AND now this table uses the new thing" as the same
 * event. `undefined`/`null`/an empty array are the only values treated as "carries no semantics to
 * drop"; `false`, `0`, and `""` are left alone because a newly-added boolean/numeric/string property
 * set to a falsy-looking value is still a value someone explicitly set, not an absence.
 */
function assertKnownShape(subject: object, known: ReadonlySet<string>, describe: () => string): void {
  for (const key of Object.keys(subject)) {
    if (known.has(key)) continue;
    const value = (subject as Record<string, unknown>)[key];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) continue;
    throw new Error(
      `${describe()} exposes an unrecognised property "${key}" set to a non-empty value (${JSON.stringify(value)}). ` +
        `Drizzle's structural surface has grown since this generator was measured against it — teach the relevant ` +
        `render function about "${key}" (or confirm it is dialect-irrelevant), then add it to the allowlist that ` +
        `rejected it.`
    );
  }
}

/** Keys `getTableConfig()` is measured to return. Kept in its own set so a newly-added category of
 * table-level extras (alongside indexes/foreignKeys/checks/primaryKeys/uniqueConstraints) fails the
 * generator run instead of being silently omitted from every generated table. */
const HANDLED_TABLE_CONFIG_KEYS = new Set([
  "columns",
  "indexes",
  "foreignKeys",
  "checks",
  "primaryKeys",
  "uniqueConstraints",
  "name",
]);

/**
 * Table-level completeness gate, run once per table before any of its columns or extras render.
 *
 * `uniqueConstraints` gets its own explicit rejection rather than being left to fall out of the
 * allowlist check: it is a real, currently-empty (0 across all 63 tables) array for the table-level
 * `unique(name).on(colA, colB)` builder — a *different* Drizzle feature from the column-level
 * `.unique()` modifier `renderColumn` now handles. Both silently drop a uniqueness guarantee if
 * ignored, so both get a guard, even though only the column-level one has a live case today.
 */
function assertKnownTableConfigShape(cfg: ReturnType<typeof getTableConfig>, exportName: string): void {
  assertKnownShape(cfg, HANDLED_TABLE_CONFIG_KEYS, () => `table "${exportName}"'s config`);
  if (cfg.uniqueConstraints.length > 0) {
    throw new Error(
      `table "${exportName}" declares ${cfg.uniqueConstraints.length} table-level unique(...).on(...) ` +
        `constraint(s). This generator only translates column-level ".unique()" — teach renderExtras() ` +
        `about multi-column uniqueness before regenerating.`
    );
  }
}

/**
 * Keys the nested per-element objects `renderExtras()` renders are measured to expose: an `Index`'s
 * `.config` (SQLite's `IndexConfig` plus the `table` back-reference the `Index` constructor bolts
 * on), a `ForeignKey` instance and the plain object its `.reference()` returns, a `PrimaryKey`
 * instance, and a `Check` instance. `HANDLED_TABLE_CONFIG_KEYS` above only guards the *arrays* these
 * live in (`cfg.indexes`, `cfg.foreignKeys`, ...) — it says nothing about what each element of those
 * arrays itself exposes. That gap is exactly how index configuration went silently unguarded: a
 * partial index's `where` and an ordered/expression column's `SQL` shape inside `columns` are both
 * real, now-handled cases (see `renderIndexColumnExpr`/`renderSqlText`), but nothing forced a new,
 * un-handled key on `Index.config` itself to fail loudly instead of being silently absent from the
 * generated file. These four sets close that one level down, mirroring the table-level guard.
 */
const HANDLED_INDEX_CONFIG_KEYS = new Set(["name", "columns", "unique", "where", "table"]);
const HANDLED_FOREIGN_KEY_KEYS = new Set(["table", "reference", "onUpdate", "onDelete"]);
const HANDLED_FOREIGN_KEY_REFERENCE_KEYS = new Set(["name", "columns", "foreignTable", "foreignColumns"]);
const HANDLED_PRIMARY_KEY_KEYS = new Set(["table", "columns", "name"]);
const HANDLED_CHECK_KEYS = new Set(["table", "name", "value"]);

/** Column properties this generator reads and actually encodes into the emitted PostgreSQL column. */
const TRANSLATED_COLUMN_PROPS = new Set([
  "columnType",
  "primary",
  "autoIncrement",
  "notNull",
  "default",
  "isUnique",
  "uniqueName",
]);

/**
 * Column properties that are pure identity/plumbing (or fully redundant with an already-checked
 * property) and so carry no PostgreSQL-relevant meaning of their own:
 *  - `name`/`table`/`keyAsName`/`config` are bookkeeping, not modifiers.
 *  - `dataType` and `mode` are redundant with `columnType`: SQLite's `text(..., {mode:"json"})` and
 *    `integer(..., {mode:"timestamp"})` each produce a *different* `columnType` ("SQLiteTextJson",
 *    "SQLiteTimestamp") rather than changing `mode` on the plain kind — so `columnBuilder()`'s
 *    already-exhaustive switch on `columnType` throwing on an unmapped kind is what actually guards
 *    those, not a separate check here (verified against `drizzle-orm`'s sqlite-core column sources).
 *  - `hasDefault` is derived from `default`/`defaultFn`, both already covered elsewhere.
 */
const INERT_COLUMN_PROPS = new Set(["name", "table", "keyAsName", "dataType", "config", "mode", "hasDefault"]);

/**
 * Column properties that ARE dialect-relevant modifiers this generator does not yet translate.
 * None has a live case in `schema.ts` today (each is confirmed `undefined` across all 580 columns),
 * so requiring them to stay unset costs nothing now and turns "someone adds one" into a loud failure
 * instead of a silently incomplete PostgreSQL column:
 *  - `length` — SQLite text length (e.g. `text("x", { length: 20 })`); does not change `columnType`.
 *  - `defaultFn`/`onUpdateFn` — function-valued defaults; only literal `default` is translated.
 *  - `uniqueType` — a dialect-specific unique sub-kind; SQLite's `.unique()` builder cannot set it
 *    today, but it is inherited from the shared `Column` base class, so a future Drizzle version
 *    could start populating it.
 *  - `enumValues` — SQLite's `text("x", { enum: [...] })` restricted-value columns.
 *  - `generated`/`generatedIdentity` — generated-always columns (`.generatedAlwaysAs()`).
 */
const UNTRANSLATED_COLUMN_PROPS = [
  "length",
  "defaultFn",
  "onUpdateFn",
  "uniqueType",
  "enumValues",
  "generated",
  "generatedIdentity",
] as const;

/**
 * Column-level completeness gate, run once per column before it is rendered.
 *
 * Two-part check: first, every own property on the column must be recognised at all (translated,
 * inert, or untranslated-but-tracked) — an entirely new property fails here. Second, every tracked
 * untranslated property must still be at its measured-unset default — a schema author turning one
 * of them on (e.g. adding `{ length: 20 }` to a `text()` column) fails here instead of generating a
 * PostgreSQL column that quietly drops what they asked for.
 */
function assertKnownColumnShape(col: SQLiteColumn): void {
  const known = new Set<string>([...TRANSLATED_COLUMN_PROPS, ...INERT_COLUMN_PROPS, ...UNTRANSLATED_COLUMN_PROPS]);
  assertKnownShape(col, known, () => `column "${col.name}"`);
  for (const prop of UNTRANSLATED_COLUMN_PROPS) {
    const value = (col as unknown as Record<string, unknown>)[prop];
    if (value !== undefined) {
      throw new Error(
        `column "${col.name}" sets "${prop}" (${JSON.stringify(value)}), which this generator does not yet ` +
          `translate to PostgreSQL. Teach columnBuilder()/renderColumn() about it, then move "${prop}" from ` +
          `UNTRANSLATED_COLUMN_PROPS to TRANSLATED_COLUMN_PROPS.`
      );
    }
  }
}

function renderColumn(tsName: string, col: SQLiteColumn, tableSqlName: string): string {
  assertKnownColumnShape(col);
  let out = columnBuilder(col);
  if (col.primary) {
    // A composite primary key is emitted at table level instead; `.primary` is only true for a
    // single-column PK, so this cannot double up with the composite branch below.
    out += (col as unknown as { autoIncrement?: boolean }).autoIncrement
      ? ".generatedAlwaysAsIdentity().primaryKey()"
      : ".primaryKey()";
  }
  if (col.notNull && !col.primary) out += ".notNull()";
  // `uniqueName` is NOT a reliable "was .unique() called?" signal on its own: SQLiteColumn's
  // constructor unconditionally backfills a default-computed uniqueName onto every column — unique
  // or not — the moment none was supplied (`drizzle-orm/sqlite-core/columns/common.js`). `isUnique`
  // is the only property that reflects whether `.unique()` was actually called; `uniqueName` is only
  // meaningful once `isUnique` is true.
  //
  // Once it is true, `uniqueName` holds the resolved name — but not necessarily an *authored* one:
  // SQLite and PostgreSQL derive the exact same default constraint name from the exact same inputs
  // (`` `${table}_${column}_unique` ``, confirmed identical in both `drizzle-orm/sqlite-core/unique-
  // constraint.js` and `drizzle-orm/pg-core/unique-constraint.js`), so a bare `.unique()` in the
  // source needs no name carried across at all — PostgreSQL's own default lands on the identical
  // string. Only a name that does NOT match that computed default can be a deliberately custom one,
  // and that is the only case worth spelling out explicitly.
  if (col.isUnique) {
    const defaultUniqueName = `${tableSqlName}_${col.name}_unique`;
    out += col.uniqueName === defaultUniqueName ? ".unique()" : `.unique(${JSON.stringify(col.uniqueName)})`;
  }
  out += renderDefault(col);
  return `  ${tsName}: ${out},`;
}

interface TableExtras {
  indexes: string[];
  composite: string[];
  checks: string[];
  foreignKeys: string[];
}

interface ForeignKeyRef {
  name?: string;
  columns: readonly unknown[];
  foreignTable: object;
  foreignColumns: readonly unknown[];
}

/**
 * Table object -> the export name it is bound to in `schema.ts`.
 *
 * A foreign key names its target by table *object*, but the generated file must reference it by
 * the export name the generated file itself declares. Resolving through identity keeps the two in
 * step even if a table's SQL name and its export name diverge.
 */
const EXPORT_NAME_BY_TABLE: Map<object, string> = new Map(
  collectTables().map(({ exportName, table }) => [table as object, exportName])
);

function exportNameOfTable(table: object): string {
  const name = EXPORT_NAME_BY_TABLE.get(table);
  if (!name) {
    throw new Error(
      `a foreign key targets a table that is not exported from schema.ts (SQL name "${getTableConfig(table as never).name}"). ` +
        `The generated file cannot reference it. Export the table or drop the constraint.`
    );
  }
  return name;
}

/** The TypeScript property name of one column on another table, for rendering an FK target. */
function foreignTsName(table: object, column: SQLiteColumn): string {
  const cfg = getTableConfig(table as never);
  const name = tsPropertyNames(table, cfg.columns).get(column);
  if (!name) throw new Error(`could not resolve the TypeScript name of foreign column "${column.name}"`);
  return name;
}

/** `t.<TS property name>` reference for a column already belonging to the table being rendered — the
 * shape pg-core's builders expect wherever an actual column value (not a bare SQL name) is required:
 * `.on(...)` index arguments, composite primary key members, and foreign key column lists. One shared
 * implementation means the "fall back to the SQL name if the TS lookup somehow misses" behavior, and
 * the choice of fallback, only has to be right once. */
function columnRef(col: SQLiteColumn, tsNames: Map<SQLiteColumn, string>): string {
  return `t.${tsNames.get(col) ?? col.name}`;
}

/** Identifies a rejected chunk by its constructor name for error messages, without assuming the chunk
 * is even an object — a bare interpolated primitive (see `renderSqlText`'s doc) has no `.constructor`
 * of its own until JS autoboxes it, which `typeof` handles as a fallback. */
function describeChunkKind(chunk: unknown): string {
  return (chunk as { constructor?: { name?: string } })?.constructor?.name ?? typeof chunk;
}

/**
 * Renders a Drizzle `SQL` value into portable, bare SQL text: literal fragments exactly as authored,
 * and column references as unquoted identifiers belonging to `owningTable`. Used for both CHECK
 * constraint bodies and partial-index `WHERE` predicates — both are SQL text scoped to exactly one
 * table, and PostgreSQL accepts the identical bare-identifier syntax SQLite does for both.
 *
 * These are NOT decorative. Seven of the eight CHECK constraints in this schema are `*_sealed_shape`
 * constraints on credential tables, asserting that the sealed columns are either all NULL or all
 * populated — i.e. that a half-sealed credential row cannot exist. Dropping them on PostgreSQL would
 * silently permit exactly the state SQLite forbids, on the tables where it matters most.
 *
 * Only two chunk kinds are accepted, and everything else is rejected rather than guessed at:
 *  - `StringChunk` — the tagged template's own static text, authored directly in `schema.ts` and
 *    therefore as trustworthy as any other line of source code.
 *  - `Column` belonging to `owningTable` — resolved to its bare SQL name (validated as an unquoted
 *    identifier, matching this schema's lowercase-snake_case convention; a name that needed quoting
 *    would be a new situation to teach this function about, not silently mangle).
 * A bound `Param` and a nested `SQL` value both get a dedicated rejection message. Everything else —
 * critically, a bare JS value interpolated straight into a `sql\` \`` template (`` sql`${col} = ${x}` ``
 * pushes `x` onto `queryChunks` completely unwrapped when `x` isn't itself a Drizzle value; confirmed
 * against this project's pinned `drizzle-orm@0.44.7`) — falls through the same generic rejection. That
 * unwrapped-primitive case is exactly the bug this function replaces: the previous version matched it
 * via `typeof chunk === "string"` and spliced it into the emitted SQL as if it were trusted, authored
 * text, which is indistinguishable from treating runtime data as SQL syntax.
 */
function renderSqlText(value: unknown, owningTable: object, describe: () => string): string {
  if (!is(value, SQL)) {
    throw new Error(`${describe()} did not produce a Drizzle SQL value — Drizzle internals changed; revisit renderSqlText()`);
  }
  return value.queryChunks
    .map((chunk) => {
      if (is(chunk, StringChunk)) return chunk.value.join("");
      if (is(chunk, Column)) return renderColumnIdentifier(chunk as unknown as SQLiteColumn, owningTable, describe);
      if (is(chunk, Param) || is(chunk, SQL)) {
        throw new Error(
          `${describe()} interpolates a ${is(chunk, Param) ? "bound Param" : "nested SQL"} value. Runtime data ` +
            `must never be spliced into emitted SQL as trusted text — express it as static template text or a ` +
            `column reference, or teach renderSqlText() an explicit, reviewed translation.`
        );
      }
      throw new Error(
        `${describe()} contains an unrecognised chunk (${describeChunkKind(chunk)}). A bare value interpolated ` +
          `directly into a sql\` \` template (a string, number, or other primitive) produces exactly this shape — ` +
          `it is rejected rather than inlined as literal SQL, because runtime data is not trusted SQL syntax.`
      );
    })
    .join("");
}

/** Resolves one CHECK/WHERE column reference to its bare, unquoted SQL identifier — the single place
 * both the cross-table rejection and the quoting check happen, so `renderSqlText` stays a plain walk. */
function renderColumnIdentifier(col: SQLiteColumn, owningTable: object, describe: () => string): string {
  if ((col as unknown as { table?: object }).table !== owningTable) {
    throw new Error(
      `${describe()} references column "${col.name}" from a different table. CHECK bodies and partial-index ` +
        `predicates are single-table constructs in both dialects, so a cross-table reference here means an ` +
        `assumption renderSqlText() relies on no longer holds.`
    );
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(col.name)) {
    throw new Error(`${describe()} references column "${col.name}", which needs quoting — teach renderSqlText() first`);
  }
  return col.name;
}

/**
 * Renders one `IndexColumn` entry: a plain column, or an `SQL` expression. SQLite's Drizzle has no
 * separate "ordered column" wrapper the way PostgreSQL's `ExtraConfigColumn` does — `asc()`/`desc()`
 * literally expand to `` sql`${col} asc` ``, confirmed against this project's pinned `drizzle-orm`, so
 * column ordering and true expression indexes (`sql\`lower(${col})\``) are the exact same shape here:
 * an `SQL` value where every chunk is either static text or a column belonging to this table.
 *
 * The rendering target differs from `renderSqlText`: a `.on(...)` argument is a real Drizzle value at
 * the GENERATED FILE's own runtime, not embedded query text, so a column reference has to reconstruct
 * an actual `t.<column>` builder reference — a JS expression — while literal fragments (`" asc"`,
 * `"lower("`, `")"`) are spliced as source text between the backticks of a new `sql` tagged template
 * this function emits into that generated file. `escapeTemplateText` exists because that splice target
 * is TypeScript source, not a string value: an unescaped backtick/`${`/backslash from authored index
 * text would corrupt the generated file's syntax, not just mis-render one value.
 */
function renderIndexColumnExpr(
  entry: unknown,
  owningTable: object,
  tsNames: Map<SQLiteColumn, string>,
  describe: () => string
): string {
  if (is(entry, Column)) return columnRef(entry as unknown as SQLiteColumn, tsNames);
  if (!is(entry, SQL)) {
    throw new Error(`${describe()} has a column entry that is neither a column nor a SQL expression (${describeChunkKind(entry)}).`);
  }
  const pieces = entry.queryChunks.map((chunk) => {
    if (is(chunk, StringChunk)) return escapeTemplateText(chunk.value.join(""));
    if (is(chunk, Column)) {
      const col = chunk as unknown as SQLiteColumn;
      if ((col as unknown as { table?: object }).table !== owningTable) {
        throw new Error(`${describe()} references a column from a different table inside an expression/ordered entry.`);
      }
      return "${" + columnRef(col, tsNames) + "}";
    }
    throw new Error(
      `${describe()} has an expression/ordered column containing an unrecognised chunk (${describeChunkKind(chunk)}). ` +
        `Bound parameters and nested SQL cannot be translated into a PostgreSQL index expression here — teach this ` +
        `function about the shape only after confirming it is safe.`
    );
  });
  return "sql`" + pieces.join("") + "`";
}

function escapeTemplateText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function renderExtras(
  cfg: ReturnType<typeof getTableConfig>,
  exportName: string,
  tsNames: Map<SQLiteColumn, string>,
  table: object
): TableExtras {
  // A partial index's WHERE predicate silently becoming an unfiltered index is the exact bug class
  // this generator has already shipped four times over: an index-level completeness gate (below) plus
  // rendering the predicate through the SAME hardened renderer CHECK bodies use, rather than dropping
  // it, is what closes it — see renderSqlText's doc for why that renderer refuses rather than guesses.
  const indexes = cfg.indexes.map((idx) => {
    const describe = () => `table "${exportName}"'s index "${idx.config.name}"`;
    assertKnownShape(idx.config, HANDLED_INDEX_CONFIG_KEYS, describe);
    const cols = idx.config.columns.map((c) => renderIndexColumnExpr(c, table, tsNames, describe)).join(", ");
    const builder = idx.config.unique ? "uniqueIndex" : "index";
    const where =
      idx.config.where === undefined
        ? ""
        : `.where(sql\`${renderSqlText(idx.config.where, table, () => `${describe()}'s WHERE predicate`)}\`)`;
    return `    ${builder}(${JSON.stringify(idx.config.name)}).on(${cols})${where},`;
  });

  const composite = cfg.primaryKeys.map((pk) => {
    assertKnownShape(pk, HANDLED_PRIMARY_KEY_KEYS, () => `table "${exportName}"'s primary key`);
    const cols = pk.columns.map((c) => columnRef(c, tsNames)).join(", ");
    return `    primaryKey({ columns: [${cols}] }),`;
  });

  // CHECK constraints are emitted as real constraints, not comments. renderSqlText throws rather than
  // guessing if it ever meets a chunk shape it does not recognise — see its own doc.
  const checks = cfg.checks.map((ch) => {
    const c = ch as unknown as { name: string; value: unknown };
    assertKnownShape(ch, HANDLED_CHECK_KEYS, () => `table "${exportName}"'s check "${c.name}"`);
    const sqlText = renderSqlText(c.value, table, () => `table "${exportName}"'s check "${c.name}"`);
    return `    check(${JSON.stringify(c.name)}, sql\`${sqlText}\`),`;
  });

  // Foreign keys carry ON DELETE semantics (cascade/restrict here) that are load-bearing for
  // referential integrity. Emitting the table without them would produce a PostgreSQL schema that
  // silently permits orphans the SQLite schema rejects.
  const foreignKeys = cfg.foreignKeys.map((fk) => {
    assertKnownShape(fk, HANDLED_FOREIGN_KEY_KEYS, () => `table "${exportName}"'s foreign key`);
    const target = (fk as unknown as { reference: () => ForeignKeyRef }).reference();
    assertKnownShape(target, HANDLED_FOREIGN_KEY_REFERENCE_KEYS, () => `table "${exportName}"'s foreign key reference`);
    const meta = fk as unknown as { onDelete?: string; onUpdate?: string };
    const localCols = target.columns.map((c) => columnRef(c as SQLiteColumn, tsNames)).join(", ");
    const foreignExport = exportNameOfTable(target.foreignTable);
    const foreignCols = target.foreignColumns
      .map((c) => `${foreignExport}.${foreignTsName(target.foreignTable, c as SQLiteColumn)}`)
      .join(", ");
    const actions =
      (meta.onDelete ? `.onDelete(${JSON.stringify(meta.onDelete)})` : "") +
      (meta.onUpdate ? `.onUpdate(${JSON.stringify(meta.onUpdate)})` : "");
    return `    foreignKey({ columns: [${localCols}], foreignColumns: [${foreignCols}] })${actions},`;
  });

  return { indexes, composite, checks, foreignKeys };
}

function renderTable(exportName: string, table: never): string {
  const cfg = getTableConfig(table);
  assertKnownTableConfigShape(cfg, exportName);
  const tsNames = tsPropertyNames(table, cfg.columns);
  const columns = cfg.columns.map((c) => renderColumn(tsNames.get(c)!, c, cfg.name)).join("\n");
  const { indexes, composite, checks, foreignKeys } = renderExtras(cfg, exportName, tsNames, table);
  const extras = [...composite, ...foreignKeys, ...checks, ...indexes];

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
import { sql } from "drizzle-orm";\nimport { boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

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

// Only run when invoked directly (`npx tsx generate-postgres-schema.ts[, --check]`), never as a side
// effect of import. The negative-fixture tests below import renderTable()/renderSqlText() etc. against
// hand-built tables that are NOT part of schema.ts, specifically so a fixture proving the generator
// rejects a bad shape can never itself write or drift-check the real src/db/schema.postgres.ts.
if (require.main === module) {
  main();
}

// Exported strictly for `src/db/__tests__/schema-postgres-*.test.ts`: this file's own module doc
// promises a generator, not a library, so nothing here is meant to be imported by production code.
export { assertKnownShape, columnRef, renderIndexColumnExpr, renderSqlText, renderTable, tsPropertyNames };