/**
 * @file The executable semantic SQLite→Postgres migration manifest.
 *
 * Why this exists: `generate-postgres-schema.ts` proves the two dialects' DDL agree structurally
 * (same tables, same constraints, same indexes). That is necessary but not sufficient — a schema
 * can compile on both dialects and still be wrong in ways structure alone cannot see: an
 * autoincrement column that silently rejects row 2,147,483,648 once real traffic accumulates, a
 * timestamp column that is byte-identical on both sides but ambiguous the moment anyone reads it,
 * an identity sequence left at 1 after a bulk copy that preserved the original row ids, a JSON
 * payload that survives as bytes but not as JSON. Those are semantic facts about specific columns
 * that Drizzle's type system does not encode and the structural generator/parity tests cannot see
 * (see `schema-postgres-parity.test.ts`'s own doc for why "does it look the same" and "does it mean
 * the same thing" are different questions — this file answers the second one).
 *
 * Why "manifest", and why executable rather than a document: per the 2026-08-12 postgres-foundation
 * handoff, this is meant to be the single thing both schema generation and migration verification
 * consume, so the two can never independently drift out of agreement the way two hand-written docs
 * would. A markdown table recording "these columns need bigint" would need someone to remember to
 * update it every time a table is added; this file's structural facts (table/column list, SQLite
 * column kind, primary-key/autoincrement-ness) are instead DERIVED from `schema.ts` via the exact
 * same `drizzle-orm/sqlite-core` `getTableConfig()` introspection `generate-postgres-schema.ts`
 * already uses — so those facts cannot drift from the source schema either. Manual review only
 * happens where structure genuinely cannot answer the question (Drizzle has no concept of "this
 * integer column is an unbounded append-only log" — that is a fact about how the product uses the
 * table, not about its declared type), and every such manual judgment lives in one reviewed
 * registry below with its rationale attached, not scattered as tribal knowledge.
 *
 * Scope this round (per the dispatch brief): build the manifest and its migration-verification
 * consumer (`./verify.ts`), proven against a real local Postgres fixture
 * (`__tests__/migration-manifest-postgres.test.ts`). `classifyPluginColumn` below is a generic
 * convention seam for a *future* Postgres DDL path for plugin-declared tables (`data-module.ts`
 * only targets SQLite today) — it is written and tested now so that path does not have to invent
 * its own semantic conventions later.
 *
 * IMPORTANT — a decision landed underneath this manifest while it was being built, and this doc is
 * being honest about it rather than pretending the two still agree: `REVIEWED_INTEGER_ID_COLUMNS`
 * below was designed as the input `generate-postgres-schema.ts`'s `columnBuilder()` should consume
 * for its `bigint` vs `integer` choice — a narrower allowlist scoped to the handoff's named risk
 * categories (append-only logs + the watermark). Commit `b393752` (concurrent with this task, same
 * session) instead shipped a BROADER, already-merged policy: every one of the schema's 65
 * `SQLiteInteger` columns is `bigint(..., {mode:"number"})` now, not a hand-picked subset — reasoned
 * explicitly against a narrower allowlist like this registry, on two grounds: (1) this generator's
 * own design already commits to kind-based mapping plus exhaustive structural gates specifically so
 * a manually-maintained allowlist can never be the failure mode, and an allowlist is exactly what
 * this registry is; (2) all 11 autoincrement PKs get protected, not only the ones an audit judged
 * "obviously" high-volume — a narrower allowlist would leave e.g. `entry_refs.id`/`entry_terms.id`
 * on `int4`. That reasoning is sound and already live — `REVIEWED_INTEGER_ID_COLUMNS` is NOT
 * something the generator still needs to consume; the schema-generation question it was meant to
 * answer is already settled, more conservatively than this registry alone would have required.
 * The registry is kept, with its role changed and its vocabulary corrected to match: it is no longer
 * framed as a bigint-vs-int4 CLASSIFICATION (misleading now — nothing in the generated schema is
 * `int4`), it is a GROWTH-CLASS annotation (`IdGrowthClass`: `"unbounded"` | `"bounded"`) — which
 * columns are genuinely expected to approach large values and need range-aware copy handling and
 * reseed prioritisation vs. which are bounded by content/reference volume, for monitoring and
 * prioritisation purposes. `collectIdentityColumns` below (identity-reseed reasoning) is structural
 * and draws on neither this registry nor the shipped bigint policy — every autoincrement PK needs
 * reseeding regardless of growth class or column width.
 *
 * What this manifest deliberately does NOT do:
 * - It is not a migration completeness signal. See `WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY` below —
 *   Trap #1 from the handoff, re-derived here as executable documentation.
 * - It does not change the timestamp representation. Timestamps stay `text` ISO-8601 this round —
 *   see `TIMESTAMP_REPRESENTATION` for why that is reversible only until a deadline, not indefinitely.
 * - It does not touch FTS5/search. See `DERIVED_OBJECTS` — search is rebuilt, never copied.
 */
import { getTableConfig, type SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { ColumnDecl, ColumnType as PluginColumnType } from "../../features/plugins/data-module";
import * as schema from "../schema";

const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

// ---------------------------------------------------------------------------
// Structural derivation — same technique generate-postgres-schema.ts uses, deliberately
// reimplemented rather than imported: that file is a `development/scripts/` dev-time tool, and this
// manifest is product code the migration-verification path may run against a live database. Product
// code depending on a dev script would be a layering violation in the wrong direction, and the two
// tools are meant to stay decoupled until the explicit integration step named above.
// ---------------------------------------------------------------------------

/**
 * `table` is typed `never`, matching `generate-postgres-schema.ts`'s own `collectTables()` — each
 * `SQLiteTable`'s generic type parameter is unique per table (its own column shape), so no common
 * non-`never` type could describe "any one of schema.ts's 63 tables" without erasing exactly the
 * column-shape information `getTableConfig()` needs back out. `never` is assignable to every
 * `getTableConfig()` call site below without an unsafe cast at each use.
 */
export interface SourceTable {
  readonly exportName: string;
  readonly table: never;
}

/** Every exported Drizzle table in `schema.ts`. */
export function collectCoreTables(): SourceTable[] {
  return Object.entries(schema)
    .filter(([, v]) => Boolean(v && typeof v === "object" && (v as unknown as Record<symbol, unknown>)[DRIZZLE_IS_TABLE]))
    .map(([exportName, table]) => ({ exportName, table: table as never }));
}

/** Maps each column to its TypeScript property name (`bodyJson`, not `body_json`) by identity, the
 * same recovery technique `generate-postgres-schema.ts`'s `tsPropertyNames` uses — see that file's
 * own doc for why identity lookup rather than a naming-convention guess is required. */
function tsPropertyNames(table: object, columns: readonly SQLiteColumn[]): Map<SQLiteColumn, string> {
  const byColumn = new Map<SQLiteColumn, string>();
  for (const [key, value] of Object.entries(table)) {
    const match = columns.find((c) => c === value);
    if (match) byColumn.set(match, key);
  }
  return byColumn;
}

/**
 * `getTableConfig(table)` on a `SourceTable`'s `never`-typed `table` (see that interface's doc)
 * returns `.columns` typed as a differently-parameterized `SQLiteColumn` instantiation than this
 * file's own bare `SQLiteColumn` import — structurally identical at runtime (the same drizzle-orm
 * class), incompatible only because `Column`'s `config` member is `protected`, which makes
 * TypeScript require nominal rather than structural agreement between two instantiations. `unknown`
 * first is this codebase's established escape hatch for exactly this class of Drizzle-generic
 * friction (see e.g. `data-module.ts`'s `col as unknown as {autoIncrement?: boolean}`). Centralised
 * here so every call site downstream sees one ordinary `SQLiteColumn[]`, not a repeated cast.
 */
function coreColumnsOf(cfg: ReturnType<typeof getTableConfig>): readonly SQLiteColumn[] {
  return cfg.columns as unknown as readonly SQLiteColumn[];
}

// ---------------------------------------------------------------------------
// 1. 64-bit IDs
//
// NOTE ON THIS SECTION'S ROLE (see this file's own module doc for the full account): this registry
// was designed as the input generate-postgres-schema.ts's columnBuilder() should consume for its
// bigint-vs-integer choice. Commit b393752 shipped a broader, already-merged policy instead — EVERY
// SQLiteInteger column is bigint(..., {mode:"number"}) now, deliberately not a hand-picked subset.
// That decision is sound and live and is asserted directly against the generated schema by the "GATE
// A" test in migration-manifest.test.ts, not re-derived here. This registry is no longer something
// schema generation needs; it is kept as a GROWTH-CLASS annotation (which columns are genuinely
// expected to approach large values, and why) for monitoring/prioritisation and as the source
// `collectIdentityColumns` below draws reseed reasoning from — that reasoning is structural and
// applies to every autoincrement PK regardless of growth class or generated column width.
// ---------------------------------------------------------------------------

/**
 * `"unbounded"`: reviewed and expected to genuinely grow without a natural ceiling tied to authored
 * content (event/attempt/revision logs, or a counter incremented on every gated write).
 * `"bounded"`: reviewed and judged bounded by content/reference volume rather than by traffic or
 * time. NOT a claim about the column's actual generated Postgres type — every SQLiteInteger column,
 * `"bounded"` or not, is `bigint` in the generated schema today (see the section note above and
 * "GATE A" in migration-manifest.test.ts). This is a risk/monitoring label, not a DDL decision.
 */
export type IdGrowthClass = "unbounded" | "bounded";

export interface AutoIncrementReview {
  readonly growthClass: IdGrowthClass;
  readonly rationale: string;
}

/**
 * Every autoincrement-identity integer column, PLUS the write watermark (a monotonically
 * incrementing counter, not a row id, but the identical overflow shape) — reviewed by hand against
 * `schema.ts` and the 2026-08-12 handoff's named risk categories: append-only revision/event/attempt
 * logs, and the watermark. Keyed by `"{sql_table_name}.{sql_column_name}"`.
 *
 * This map IS the review, not a cache of one performed elsewhere. `classifyCoreColumn`'s
 * completeness gate below throws for any autoincrement PK not present here — a newly added
 * autoincrement table can never silently fall through into "must be fine, nobody said otherwise."
 * `migration-manifest.test.ts` separately asserts every key here still names a real column ("GATE
 * B"), so a renamed or removed column cannot leave a stale, misleading entry behind either.
 */
export const REVIEWED_INTEGER_ID_COLUMNS: Readonly<Record<string, AutoIncrementReview>> = {
  "setting_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only settings-revision log — one row per gated setting write, unbounded over an install's life",
  },
  "redirect_revisions.id": {
    growthClass: "unbounded",
    rationale: "append-only redirect-revision log",
  },
  "member_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only member-revision log",
  },
  "newsletter_campaign_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only newsletter-campaign-revision log",
  },
  "content_type_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only content-type-revision log",
  },
  "entry_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only entry-revision log — the highest-volume revision table (every entry/post save)",
  },
  "taxonomy_revisions.seq": {
    growthClass: "unbounded",
    rationale: "append-only taxonomy-revision log",
  },
  "agent_tool_attempts.id": {
    growthClass: "unbounded",
    rationale: "append-only agent tool-call attempt log — one row per tool invocation, unbounded by design",
  },
  "analytics_events.id": {
    growthClass: "unbounded",
    rationale: "append-only analytics-event log — the single highest-volume table in this schema by construction",
  },
  "database_write_watermark.value": {
    growthClass: "unbounded",
    rationale:
      "monotonically incremented by exactly 1 inside every gated mutation for the life of the install — not a row " +
      "id, but the identical overflow shape, and named explicitly in the 2026-08-12 handoff's 'cheap now, expensive " +
      "later' list",
  },
  "entry_refs.id": {
    growthClass: "bounded",
    rationale:
      "bounded by (entries × outbound references per entry) — grows with authored content volume, not with " +
      "traffic or time, unlike the append-only logs above",
  },
  "entry_terms.id": {
    growthClass: "bounded",
    rationale:
      "bounded by (entries × terms assigned), deduplicated by entry_terms_unique — grows with authored content " +
      "volume, not with traffic or time",
  },
};

// ---------------------------------------------------------------------------
// 2. UTC timestamps
// ---------------------------------------------------------------------------

/**
 * The timestamp representation decision and its reversibility deadline, carried as data so it is
 * not only tribal knowledge in a handoff document. Timestamps stay `text` ISO-8601 this round —
 * this constant records the ONE condition that revisits that decision, so it is not forgotten by
 * the time it matters.
 *
 * Proven live in `migration-manifest-postgres.test.ts`: the identical naive-local string casts to a
 * DIFFERENT instant depending on the Postgres session's timezone, while a UTC-offset string does
 * not — the concrete mechanism behind "reversible only until noncanonical data accumulates."
 */
export const TIMESTAMP_REPRESENTATION = {
  representation: "text (ISO-8601, UTC)",
  status: "unchanged this round",
  reversibleUntil:
    "reversible to timestamptz ONLY until noncanonical (non-UTC / naive-local) data lands in a column this " +
    "manifest classifies utc-timestamp-text. A WordPress import introduces naive local timestamps immediately " +
    "(WordPress stores post dates in the site's configured local time, not UTC) — this is not a distant deadline.",
  whyItMatters:
    "Postgres has no way to distinguish a naive-local timestamp string from a UTC one once it is sitting in a " +
    "text column. The ambiguity is invisible until the column is cast to timestamptz, at which point Postgres " +
    "applies the CURRENT SESSION's timezone to any string with no explicit offset — silently reinterpreting the " +
    "identical stored string differently depending on who runs the cast and when.",
} as const;

/** Matches this schema's timestamp naming convention: `*_at`, or the bare column literally named
 * `at` (`agent_tool_attempts.at`) — deliberately NOT `/_at$/` alone, which would miss the bare case,
 * and deliberately NOT a substring match, which would wrongly catch `from_path_at_capture` /
 * `to_path_at_capture` (point-in-time path snapshots, not timestamps of the row itself). */
export function isTimestampColumnName(sqlColumnName: string): boolean {
  return sqlColumnName === "at" || sqlColumnName.endsWith("_at");
}

// ---------------------------------------------------------------------------
// 3. JSON vs text
// ---------------------------------------------------------------------------

export const JSON_TEXT_NOTE =
  "Stored as plain TEXT in both dialects this round — no jsonb (see generate-postgres-schema.ts's own module " +
  "doc: 'no JSON columns' in its measured surface, meaning no Drizzle {mode:\"json\"} column, not that no column " +
  "holds JSON). Neither dialect's TEXT/text column enforces JSON validity — a corrupted payload survives a " +
  "byte-for-byte copy completely silently on both sides. verify.ts's verifyJsonText is the only thing in this " +
  "whole pipeline that would catch it; proven live in migration-manifest-postgres.test.ts against a real " +
  "Postgres text column.";

/** Matches this schema's JSON-payload naming convention: SQL name ends `_json`. */
export function isJsonColumnName(sqlColumnName: string): boolean {
  return sqlColumnName.endsWith("_json");
}

// ---------------------------------------------------------------------------
// 5. Copy transforms — boolean is the one real case in the core schema today
// ---------------------------------------------------------------------------

export const BOOLEAN_COPY_TRANSFORM = {
  sqliteRepresentation: "0 | 1 (SQLite has no native boolean type)",
  postgresRepresentation: "native boolean",
  transform: "sqlite 1 -> postgres true; sqlite 0 -> postgres false; any other stored value is a data-integrity bug",
  note:
    "This applies ONLY to columns Drizzle declares SQLiteBoolean (integer(..., {mode:\"boolean\"})) — today " +
    "posts.overrides_theme_page, plugin_activations.enabled, external_mcp_servers.enabled. Several other " +
    "integer columns are conceptually 0/1 flags too (tombstoned, hierarchical, is_builtin, is_frozen, " +
    "visible_in_portal) but are declared plain `integer`, not `{mode:\"boolean\"}` — those get NO transform " +
    "(correct passthrough as a numeric 0/1 on both dialects, whatever integer width each side uses) precisely " +
    "because schema.ts itself did not choose the boolean representation for them. This manifest follows the " +
    "schema's own type choice; it does not redesign it.",
} as const;

// ---------------------------------------------------------------------------
// Core-schema column classification
// ---------------------------------------------------------------------------

export type SemanticColumnClass =
  | { readonly kind: "reviewed-id"; readonly growthClass: IdGrowthClass; readonly rationale: string }
  | { readonly kind: "plain-integer" }
  | { readonly kind: "boolean-flag" }
  | { readonly kind: "json-text" }
  | { readonly kind: "utc-timestamp-text" }
  | { readonly kind: "plain-text" };

/**
 * Classifies one column of one CORE (schema.ts) table. Throws if an autoincrement primary key has
 * no entry in `REVIEWED_INTEGER_ID_COLUMNS` — see that registry's own doc for why that is a feature,
 * not a bug: a schema change this manifest has not been updated for must fail loudly here, not
 * silently classify as "must be fine."
 */
export function classifyCoreColumn(sqlTableName: string, col: SQLiteColumn): SemanticColumnClass {
  const key = `${sqlTableName}.${col.name}`;
  switch (col.columnType) {
    case "SQLiteBoolean":
      return { kind: "boolean-flag" };
    case "SQLiteInteger": {
      const review = REVIEWED_INTEGER_ID_COLUMNS[key];
      if (review) return { kind: "reviewed-id", growthClass: review.growthClass, rationale: review.rationale };
      const isAutoIncrementPk = Boolean(col.primary) && Boolean((col as unknown as { autoIncrement?: boolean }).autoIncrement);
      if (isAutoIncrementPk) {
        throw new Error(
          `autoincrement primary key "${key}" has no entry in REVIEWED_INTEGER_ID_COLUMNS. A new autoincrement ` +
            `column must be explicitly reviewed and assigned a growth class ("unbounded" or "bounded") before this ` +
            `manifest can vouch for it — see that registry's doc for why this fails closed instead of guessing.`
        );
      }
      return { kind: "plain-integer" };
    }
    case "SQLiteText": {
      if (isJsonColumnName(col.name)) return { kind: "json-text" };
      if (isTimestampColumnName(col.name)) return { kind: "utc-timestamp-text" };
      return { kind: "plain-text" };
    }
    default:
      throw new Error(
        `unmapped column kind "${col.columnType}" on "${key}". This manifest was written against the same ` +
          `measured surface generate-postgres-schema.ts was (SQLiteText/SQLiteInteger/SQLiteBoolean only) — a new ` +
          `kind needs this classifier taught about it before the manifest can vouch for it.`
      );
  }
}

export interface ClassifiedColumn {
  readonly exportName: string;
  readonly tsName: string;
  readonly sqlTableName: string;
  readonly sqlColumnName: string;
  readonly columnClass: SemanticColumnClass;
}

/** Classifies every column of every core table. Throwing anywhere here means the schema has grown a
 * case this manifest has not been reviewed against yet — see `classifyCoreColumn`'s doc. */
export function classifyAllCoreColumns(): ClassifiedColumn[] {
  const out: ClassifiedColumn[] = [];
  for (const { exportName, table } of collectCoreTables()) {
    const cfg = getTableConfig(table);
    const columns = coreColumnsOf(cfg);
    const tsNames = tsPropertyNames(table, columns);
    for (const col of columns) {
      out.push({
        exportName,
        tsName: tsNames.get(col) ?? col.name,
        sqlTableName: cfg.name,
        sqlColumnName: col.name,
        columnClass: classifyCoreColumn(cfg.name, col),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Identity/sequence reseeding
// ---------------------------------------------------------------------------

export interface IdentityColumn {
  readonly exportName: string;
  readonly sqlTableName: string;
  readonly sqlColumnName: string;
}

/** Every autoincrement primary key in the core schema — purely structural, derived from `schema.ts`
 * (no manual review needed: EVERY autoincrement PK needs reseeding after a bulk copy that preserves
 * original row ids, regardless of its growth-class annotation above or its generated column width). */
export function collectIdentityColumns(): IdentityColumn[] {
  const out: IdentityColumn[] = [];
  for (const { exportName, table } of collectCoreTables()) {
    const cfg = getTableConfig(table);
    for (const col of coreColumnsOf(cfg)) {
      const isAutoIncrementPk = Boolean(col.primary) && Boolean((col as unknown as { autoIncrement?: boolean }).autoIncrement);
      if (isAutoIncrementPk) out.push({ exportName, sqlTableName: cfg.name, sqlColumnName: col.name });
    }
  }
  return out;
}

/**
 * Generates the `setval` statement that must run once, after a bulk copy that preserved the
 * source's original id values and before ANY ordinary insert happens against the target — otherwise
 * Postgres's identity sequence is still at its default starting position and the first ordinary
 * insert collides with (or silently duplicates ahead of) an id the copy already placed.
 *
 * The empty-table case is handled correctly by the 3-argument form of `setval`:
 * `is_called = false` when the table is empty makes the NEXT `nextval()` return `1`, not `2` —
 * proven live in migration-manifest-postgres.test.ts, including that exact edge case.
 */
export function reseedSequenceSql(sqlTableName: string, sqlColumnName: string): string {
  assertIdentifierFits(sqlTableName, `table name`);
  assertIdentifierFits(sqlColumnName, `column name`);
  const maxExpr = `(SELECT max(${sqlColumnName}) FROM ${sqlTableName})`;
  return (
    `SELECT setval(pg_get_serial_sequence('${sqlTableName}', '${sqlColumnName}'), ` +
    `COALESCE(${maxExpr}, 1), ${maxExpr} IS NOT NULL);`
  );
}

// ---------------------------------------------------------------------------
// 6. Plugin-declared tables — generic conventions for a future Postgres DDL path
// ---------------------------------------------------------------------------

export type PluginSemanticColumnClass =
  | { readonly kind: "identity-int"; readonly note: string }
  | { readonly kind: "plain-integer" }
  | { readonly kind: "json-text" }
  | { readonly kind: "utc-timestamp-text" }
  | { readonly kind: "plain-text" }
  | { readonly kind: "real" }
  | { readonly kind: "blob" };

/**
 * Classifies a plugin-declared column (`data-module.ts`'s `ColumnDecl`) using the same naming
 * conventions as the core schema, so a future Postgres `declareDataModule()` counterpart does not
 * have to invent its own semantic rules from scratch.
 *
 * `ColumnDecl` has no `autoIncrement` field at all (unlike core `schema.ts`'s Drizzle columns) —
 * `columnSql()` in data-module.ts never emits the `AUTOINCREMENT` keyword, only bare `PRIMARY KEY`
 * (data-module.ts:420-422). SQLite's `INTEGER PRIMARY KEY` is a rowid alias that behaves as an
 * implicit autoincrementing identity even without the keyword, so every `{type:"INTEGER",
 * primaryKey:true}` plugin column needs the identical reseed-after-copy treatment as a core
 * autoincrement column — it is flagged unconditionally, with no manual per-table review, since
 * `ColumnDecl` exposes no signal this function could review against.
 *
 * Deliberately NOT classified bigint-vs-int4: unlike `REVIEWED_INTEGER_ID_COLUMNS` above, no
 * per-plugin-table volume review has happened, and this manifest has no visibility into what a
 * third-party plugin's table is actually used for. A future Postgres plugin-table DDL path must
 * make that call explicitly (e.g. its own reviewed registry, keyed by `p_{pluginId}__{table}`)
 * before it can claim the coverage this manifest gives the core schema — silently defaulting either
 * way here would misrepresent that review as having happened.
 */
export function classifyPluginColumn(decl: ColumnDecl): PluginSemanticColumnClass {
  const type: PluginColumnType = decl.type;
  switch (type) {
    case "INTEGER":
      if (decl.primaryKey) {
        return {
          kind: "identity-int",
          note:
            "SQLite INTEGER PRIMARY KEY is an implicit rowid-alias identity even without AUTOINCREMENT — needs " +
            "sequence reseed after a copy that preserves original ids, same as a core autoincrement column. No " +
            "bigint-vs-int4 policy exists yet for plugin tables; a Postgres DDL path for them must decide this " +
            "explicitly per table before this manifest's coverage can be said to extend to plugin data.",
        };
      }
      return { kind: "plain-integer" };
    case "TEXT":
      if (isJsonColumnName(decl.name)) return { kind: "json-text" };
      if (isTimestampColumnName(decl.name)) return { kind: "utc-timestamp-text" };
      return { kind: "plain-text" };
    case "REAL":
      return { kind: "real" };
    case "BLOB":
      return { kind: "blob" };
    default: {
      const exhaustive: never = type;
      throw new Error(`unmapped plugin column type "${String(exhaustive)}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Derived objects needing rebuild (never copied as rows)
// ---------------------------------------------------------------------------

export interface DerivedObject {
  readonly name: string;
  readonly kind: "fts5-virtual-table";
  readonly sourceOfTruth: string;
  readonly copyPolicy: "never-copy-rows";
  readonly rebuildStrategy: string;
}

/**
 * Objects that a row-by-row copier must skip entirely and a migration runner must schedule a
 * rebuild step for afterward — copying their rows across dialects is either meaningless (a
 * different index structure entirely) or actively dangerous (silently perpetuating a stale index
 * that looks present but was never built the Postgres way).
 */
export const DERIVED_OBJECTS: readonly DerivedObject[] = [
  {
    name: "post_search_fts",
    kind: "fts5-virtual-table",
    sourceOfTruth: "posts (title + body_json/body_html)",
    copyPolicy: "never-copy-rows",
    rebuildStrategy:
      "Rebuild via Postgres tsvector + GIN from canonical post data after the row copy completes. It is a raw-SQL " +
      "SQLite virtual table (drizzle/0022_posts_fts_search_index.sql) with three sync triggers, not a `sqliteTable` " +
      "declaration — invisible to schema generation by construction (see generate-postgres-schema.ts's own doc) " +
      "and to this manifest's classifier for the same reason. Matches the handoff's endorsed roadmap item #5: " +
      "'Add Postgres search last, rebuilt from canonical post data, never copied.'",
  },
];

// ---------------------------------------------------------------------------
// Boundary guard — Trap #1, re-derived here as executable documentation
// ---------------------------------------------------------------------------

/**
 * NOT a migration completeness boundary. Exported and named specifically so a future migration
 * runner reaching for "how do I know the copy is caught up" trips over this doc comment instead of
 * silently wiring the watermark in as one.
 *
 * `database_write_watermark` (src/core/gated-mutations/watermark.ts) is OPT-IN: ordinary post
 * save/delete paths never advance it, and the in-process operation lock (operation-lock.ts) does not
 * stop ordinary repository writes either. A copier that treats "watermark unchanged since bulk copy
 * started" as "nothing written since" WILL silently lose a post edited between bulk copy and
 * cutover. This is Trap #1 from the 2026-08-12 postgres-foundation handoff. Building genuine write
 * quiescence is explicitly ranked step 2 of that handoff, not this manifest's job — this manifest
 * exposes no "am I caught up" signal of any kind, on purpose.
 */
export const WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY = true as const;

// ---------------------------------------------------------------------------
// Shared identifier-length guard
// ---------------------------------------------------------------------------

const MAX_IDENTIFIER_BYTES = 63;

/**
 * PostgreSQL's `NAMEDATALEN - 1` identifier ceiling. `src/features/plugins/data-module.ts` already
 * enforces this same measured rule for plugin DDL identifiers (its own `assertIdentifierFits`,
 * module-private, longest live identifier measured at 42 bytes) — that function is not exported, so
 * this manifest carries its own copy of the identical rule rather than reaching across a deliberately
 * private module boundary, so migration/copy tooling gets the same guard data-module.ts's DDL path
 * already relies on. Rejects rather than truncates: PostgreSQL truncates an over-long identifier
 * SILENTLY, which is a worse failure than a loud one at declare/copy time.
 */
export function assertIdentifierFits(identifier: string, what: string): void {
  const bytes = Buffer.byteLength(identifier, "utf8");
  if (bytes <= MAX_IDENTIFIER_BYTES) return;
  throw new Error(
    `${what} "${identifier}" is ${bytes} bytes, exceeding PostgreSQL's ${MAX_IDENTIFIER_BYTES}-byte NAMEDATALEN-1 ` +
      `limit. PostgreSQL truncates over-long identifiers silently rather than rejecting them.`
  );
}
