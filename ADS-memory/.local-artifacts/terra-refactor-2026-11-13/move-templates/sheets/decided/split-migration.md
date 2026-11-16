# SP-migration-1: table copy ordering -> `@jini-ai/db/transfer` (template T-SPLIT)

Owner decision 2026-11-15 (#3, Codex decide-4.md §3): Tovu keeps its DB map (manifest, reviewed registries, `DERIVED_OBJECTS`, `computeCoreTableCopyOrder`); `topologicalTableCopyOrder` + `TableCopyDependency` + `TableCopyOrderCycleError` move to Jini's existing `@jini-ai/db/transfer` as a plain-metadata function. `reseedSequenceSql` is NOT moved (Jini already owns `reseedIdentitySql`; no second public reseeding owner) and NOT deleted (its live-Postgres tests are schema-safety proof).
Written 2026-11-15 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092. Every blob below is identical on `integ/wave-b` (checked), so this sheet runs on either branch.
untangle_overlap: none (no C*/C3t repoint row names manifest.ts, its test, database-transfer-adapters.ts, or `packages/db/src/transfer/**`). Can run before or after the wave-B merge.
Tier: Sonnet 5.5 high executor. est. executor tokens: ~45k.

```
id: SP-migration-1
feature: website/platform/db/migration
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
tovu_files:
  - apps/website/src/platform/db/migration/manifest.ts | blob c605a0cb09428f13925211f63d27965eb6d92c73
  - apps/website/src/platform/db/__tests__/migration-manifest.test.ts | blob f4a1eb3cfa88de41a04ccad75d19740d0936268a
jini_guards:
  - packages/db/src/transfer/index.ts | blob 0c94ced43ced2f0e711641ddf42f1a9019e5f9e4
  - packages/db/src/transfer/copy-order.ts must not exist
  - packages/db/src/transfer/__tests__/copy-order.test.ts must not exist
  - rg -n "topologicalTableCopyOrder|TableCopyOrderCycleError|TableCopyDependency" packages/db/src -> prints nothing
split (manifest.ts, every declaration; none omitted):
  - imports (lines 66-69) | STAY (one import added, see tovu_reduced 1)
  - DRIZZLE_IS_TABLE, SourceTable, collectCoreTables, tsPropertyNames, coreColumnsOf | STAY-PRODUCT
  - IdGrowthClass, PG_BIGINT53_SAFE_INTEGER_CEILING, AutoIncrementReview, REVIEWED_INTEGER_ID_COLUMNS | STAY-PRODUCT
  - TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z, isTimestampColumnName, isJsonColumnName, REVIEWED_JSON_COLUMNS | STAY-PRODUCT
  - SemanticColumnClass, classifyCoreIntegerColumn, classifyCoreTextColumn, classifyCoreColumn, ClassifiedColumn, classifyAllCoreColumns | STAY-PRODUCT
  - IdentityColumn, collectIdentityColumns, reseedSequenceSql, IDENTITY_COLUMN_INSERT_OVERRIDE | STAY-PRODUCT
  - ForeignKeyEdge (624) | STAY-PRODUCT, reduced to `extends TableCopyDependency` + its two SQL-name fields (tovu_reduced 2)
  - collectForeignKeyEdges (644) | STAY-PRODUCT (Drizzle introspection)
  - TableCopyOrderCycleError (675) | MOVE -> packages/db/src/transfer/copy-order.ts
  - CopyOrderGraph (686, non-exported) | MOVE -> same
  - buildCopyOrderGraph (699, non-exported) | MOVE -> same
  - insertIntoReadyQueue (730, non-exported) | MOVE -> same
  - topologicalTableCopyOrder (754) | MOVE -> same, shape change below
  - computeCoreTableCopyOrder (782) | STAY-WIRING (adapts the Drizzle schema into the shared algorithm; not a forwarder)
  - PluginSemanticColumnClass, classifyPluginColumn, DerivedObject, DERIVED_OBJECTS, WATERMARK_IS_NOT_A_MIGRATION_BOUNDARY, MAX_IDENTIFIER_BYTES, assertIdentifierFits | STAY-PRODUCT
ports: - (pure function over plain strings; no port)
shape_changes:
  - topologicalTableCopyOrder: (allExportNames: readonly string[], edges: readonly ForeignKeyEdge[]) -> ({ allExportNames, edges }: { readonly allExportNames: readonly string[]; readonly edges: readonly TableCopyDependency[] }, _optional: Record<string, never> = {})
      callers: [manifest.ts:784 (computeCoreTableCopyOrder), migration-manifest.test.ts:853,866,879,898,993 (all five move to the Jini test)]
  - Field names stay `allExportNames` / `fromExportName` / `toExportName` / `selfReferencing` / `stuckExportNames` (decision text proposed `{ tableNames, dependencies }`): sheet author's choice so every error message and every moved assertion stays byte-identical (the endpoint message names `allExportNames`). "Export name" is documented in Jini as "the caller's identifier for a table". Do not rename.
```

## Jini (commit 1)

### J1. NEW `packages/db/src/transfer/copy-order.ts` (exact content)
```ts
/**
 * @file Table copy ordering for a bulk database transfer: a deterministic topological order over
 * caller-supplied table names and foreign-key dependencies, so a copier does not have to invent one.
 * Plain metadata in, plain names out; the host derives the names and edges from its own schema.
 */

/** One foreign-key dependency between two tables. An "export name" is the caller's identifier for a
 * table (any unique string); extra fields on a caller's own edge type are ignored. */
export interface TableCopyDependency {
  /** The table that DECLARES the foreign key (must be copied AFTER `toExportName`). */
  readonly fromExportName: string;
  /** The table the foreign key POINTS AT (must be copied BEFORE `fromExportName`). */
  readonly toExportName: string;
  /** `true` when a table's own foreign key targets itself (a parent/child hierarchy stored in one
   * table). See `topologicalTableCopyOrder`'s doc for why this is excluded from the returned order
   * rather than resolved by it. */
  readonly selfReferencing: boolean;
}

/** Thrown by `topologicalTableCopyOrder` when the FK graph (excluding self-referencing edges) has a
 * cycle across two or more DIFFERENT tables — no single copy order can then satisfy every constraint,
 * and a copier must break the cycle explicitly (e.g. a deferred/dropped-and-revalidated constraint on
 * one edge of it) rather than have this function guess which edge to ignore. */
export class TableCopyOrderCycleError extends Error {
  constructor(readonly stuckExportNames: readonly string[]) {
    super(
      `foreign-key graph has a cycle across tables ${stuckExportNames.join(", ")} — no single copy order can ` +
        `satisfy every constraint. This is a schema fact a copier must resolve explicitly, not something this ` +
        `function can order its way out of.`
    );
    this.name = "TableCopyOrderCycleError";
  }
}

interface CopyOrderGraph {
  /** referenced table -> tables that depend on it */
  readonly dependents: Map<string, Set<string>>;
  readonly inDegree: Map<string, number>;
}

/**
 * Builds `topologicalTableCopyOrder`'s Kahn's-algorithm inputs from the FK edges: for each
 * non-self-referencing edge, records that `toExportName` has `fromExportName` as a dependent,
 * incrementing `fromExportName`'s in-degree once per distinct table it depends on (a table with
 * multiple FKs to the SAME target does not inflate its in-degree past 1 for that target — it only
 * needs that target copied before it once, not once per FK column pointing there).
 */
function buildCopyOrderGraph(allExportNames: readonly string[], edges: readonly TableCopyDependency[]): CopyOrderGraph {
@@COPY 700-721@@

/**
 * Inserts `name` into `ready` (kept sorted ascending) at the first position whose current entry
 * sorts after it — re-sorting on insert rather than sorting once at the end keeps the "process
 * alphabetically among currently-ready tables" tie-break correct at every step of
 * `topologicalTableCopyOrder`'s loop below, not just among the initial zero-in-degree set. Mutates
 * `ready` in place.
 */
@@COPY 730-734@@

/**
 * Kahn's-algorithm topological sort over an FK graph: table A is ordered before table B whenever B
 * declares a foreign key pointing at A ("referenced tables first"). Pure and synchronous over its
 * inputs — no import-time computation, no module-level constant — so a genuine cycle in a host schema
 * throws only for whichever caller actually asks for the order, never for every importer at import
 * time. Hosts keep their schema-derived wrapper next to their schema; this function stays testable
 * against synthetic edges so a cycle can be proven to throw without a real schema containing one.
 *
 * Self-referencing edges (`edge.selfReferencing`) are excluded from the ordering graph — a table
 * cannot be sequenced "before itself" — but that exclusion does NOT mean a self-referencing table
 * needs no special handling. It still appears exactly once in the returned order, and this function
 * says nothing about the ROW order WITHIN that one table's own copy: a copier must still insert that
 * table's rows in an order that satisfies its own FK (typically: parents before children, e.g. by
 * sorting on the referenced column), or defer/drop-and-revalidate just that one constraint for the
 * duration of that table's copy. That per-table obligation is real and is not discharged by this
 * function returning a table-level order at all.
 */
export function topologicalTableCopyOrder(
  { allExportNames, edges }: { readonly allExportNames: readonly string[]; readonly edges: readonly TableCopyDependency[] },
  _optional: Record<string, never> = {},
): string[] {
@@COPY 755-776@@
```
How to build it mechanically: write the literal text above, then replace each marker line `@@COPY a-b@@` with manifest.ts lines a..b exactly (`git -C $TOVU_CLONE show HEAD:apps/website/src/platform/db/migration/manifest.ts | sed -n 'a,bp'`). 700-721 = buildCopyOrderGraph's body and closing `}` (line 699, its old signature, is replaced by the new signature line above the marker); 730-734 = insertIntoReadyQueue whole; 755-776 = topologicalTableCopyOrder's body and closing `}`. Then `rg -n "@@COPY" packages/db/src/transfer/copy-order.ts` prints nothing. The only text that differs from manifest.ts: the @file block, the TableCopyDependency declaration (fields + docs copied from ForeignKeyEdge minus the two SQL-name fields), `ForeignKeyEdge` -> `TableCopyDependency` in the buildCopyOrderGraph signature, the topologicalTableCopyOrder signature, and the first paragraph of its doc (3 reworded sentences, no host names). Sizes: buildCopyOrderGraph 21 lines, topologicalTableCopyOrder 24 lines, cyclomatic <= 6 each.

### J2. `packages/db/src/transfer/index.ts`
After the exact line `export * from "./plan.js";` insert `export * from "./copy-order.js";`. (Subpath `./transfer` already exists in package.json exports + jini.entries: no package.json/README edit.)

### J3. NEW `packages/db/src/transfer/__tests__/copy-order.test.ts`
Header:
```ts
import assert from "node:assert/strict";
import { test } from "vitest";
import { TableCopyOrderCycleError, topologicalTableCopyOrder, type TableCopyDependency } from "../copy-order.js";

/** Host FK edges also carry SQL table names; the order function reads only the dependency fields. */
type ForeignKeyEdge = TableCopyDependency & { readonly fromSqlTableName: string; readonly toSqlTableName: string };

```
Then, verbatim from Tovu `apps/website/src/platform/db/__tests__/migration-manifest.test.ts`: lines 848-900 (4 tests + the characterization doc block at 884-893), one blank line, lines 990-995. Only edit in the copy, the call shape (5 occurrences, each exact):
- `topologicalTableCopyOrder(["c", "b", "a", "d"], edges)` -> `topologicalTableCopyOrder({ allExportNames: ["c", "b", "a", "d"], edges })`
- `topologicalTableCopyOrder(["a", "b", "c"], edges)` -> `topologicalTableCopyOrder({ allExportNames: ["a", "b", "c"], edges })`
- `topologicalTableCopyOrder(["tree", "other"], edges)` -> `topologicalTableCopyOrder({ allExportNames: ["tree", "other"], edges })`
- `topologicalTableCopyOrder(["a", "m", "z", "b"], edges)` -> `topologicalTableCopyOrder({ allExportNames: ["a", "m", "z", "b"], edges })`
- `topologicalTableCopyOrder(["named"], [edge])` -> `topologicalTableCopyOrder({ allExportNames: ["named"], edges: [edge] })`
Every assertion, message and literal stays byte-identical. Then append this NEW characterization test (pins the existing duplicate-edge rule the decision names; GREEN before and after, it is not a behaviour change):
```ts

test("topologicalTableCopyOrder counts two FKs to the same target once (duplicate edges do not fake a cycle)", () => {
  const edges: ForeignKeyEdge[] = [
    { fromExportName: "b", fromSqlTableName: "b", toExportName: "a", toSqlTableName: "a", selfReferencing: false },
    { fromExportName: "b", fromSqlTableName: "b", toExportName: "a", toSqlTableName: "a", selfReferencing: false },
  ];
  assert.deepEqual(topologicalTableCopyOrder({ allExportNames: ["b", "a"], edges }), ["a", "b"]);
});
```

### J4. NEW `.changeset/db-transfer-copy-order.md`
```
---
"@jini-ai/db": minor
---

Add `topologicalTableCopyOrder`, `TableCopyDependency` and `TableCopyOrderCycleError` to `@jini-ai/db/transfer`: a deterministic, referenced-tables-first copy order over plain table names and foreign-key dependencies.
```

### J5. Checks + commit
Rule checks (COMMON 2-9) on copy-order.ts, the test, index.ts: `rg -n -i "tovu|site-chat|apps/(admin|website|desktop)|schema\.sqlite|drizzle"` prints nothing; no import in copy-order.ts at all. eslint the 3 .ts files. Commit paths: packages/db/src/transfer/copy-order.ts, packages/db/src/transfer/index.ts, packages/db/src/transfer/__tests__/copy-order.test.ts, .changeset/db-transfer-copy-order.md.
jini_msg: `feat(db): table copy ordering in @jini-ai/db/transfer` | body: "Deterministic Kahn's-algorithm order over plain table names and FK dependencies: alphabetical tie-break re-sorted on every insert, duplicate edges counted once, self-references excluded, cycles raise TableCopyOrderCycleError. Hosts derive names and edges from their own schema."

## Tovu (commit 2)

Census (before edits): `rg -n --no-heading "topologicalTableCopyOrder|TableCopyOrderCycleError|ForeignKeyEdge" apps development content --glob '!**/node_modules/**'` -> allowed hits: only manifest.ts and migration-manifest.test.ts. Any other file: STOP.

### tovu_reduced (manifest.ts; each OLD occurs exactly once)
1. After the exact line `import type { ColumnDecl, ColumnType as PluginColumnType } from "@jini-ai/db/data-modules";` insert `import { topologicalTableCopyOrder, type TableCopyDependency } from "@jini-ai/db/transfer";`
2. Replace lines 624-635 (from `export interface ForeignKeyEdge {` through its closing `}`) with:
```ts
/** A core-schema foreign key: the shared dependency fields plus the SQL table names on both ends
 * (the dependency fields' docs live on `TableCopyDependency` in `@jini-ai/db/transfer`). */
export interface ForeignKeyEdge extends TableCopyDependency {
  readonly fromSqlTableName: string;
  readonly toSqlTableName: string;
}
```
3. Delete lines 671-777 (from `/** Thrown by \`topologicalTableCopyOrder\` when the FK graph` through the blank line after `topologicalTableCopyOrder`'s closing `}`), and put in their place:
```ts
// The table-level copy order (Kahn's algorithm, alphabetical tie-break, duplicate edges counted once,
// self-references excluded, `TableCopyOrderCycleError` on a cycle) lives in `@jini-ai/db/transfer`
// (`topologicalTableCopyOrder`); Tovu derives the names and edges from schema.sqlite.ts here.

```
4. In computeCoreTableCopyOrder: `  return topologicalTableCopyOrder(allExportNames, collectForeignKeyEdges());` -> `  return topologicalTableCopyOrder({ allExportNames, edges: collectForeignKeyEdges() });`
Why-comment check: the moved docs are in Jini (J1); the Tovu-specific why ("computeCoreTableCopyOrder is the schema-derived wrapper"; "a real cycle must fail only the caller that asks") already sits on computeCoreTableCopyOrder's own doc (lines 778-781), unchanged.

### tests_split (migration-manifest.test.ts; each OLD occurs exactly once)
- Delete lines 848-901 (from `test("topologicalTableCopyOrder orders every referenced table` through the blank line after the re-sort test's `});`). Keep line 846 header and 902-923 (`collectForeignKeyEdges` + `computeCoreTableCopyOrder` real-schema tests stay in Tovu).
- Delete lines 989-995 (the blank line before `test("topologicalTableCopyOrder rejects either unnamed edge endpoint"` through the file's last `});`). The file then ends with line 988 `});` + newline.
- Import block: delete the three lines `  type ForeignKeyEdge,`, `  TableCopyOrderCycleError,`, `  topologicalTableCopyOrder,` (now unused). Nothing else in the import changes.
- After the edits `rg -n "topologicalTableCopyOrder\(|TableCopyOrderCycleError|ForeignKeyEdge" apps/website/src/platform/db/__tests__/migration-manifest.test.ts` prints nothing (line 908's string "see topologicalTableCopyOrder's doc" has no `(` and stays).

### Commit
eslint manifest.ts + migration-manifest.test.ts (unresolved `@jini-ai/db/transfer` named export is expected until D1 link; record it). Commit paths: the 2 files.
tovu_msg: `refactor(db): copy order from @jini-ai/db/transfer` | body: "Tovu keeps the schema manifest, reviewed column registries, DERIVED_OBJECTS, reseedSequenceSql and computeCoreTableCopyOrder (Drizzle schema -> names + FK edges); the generic topological order moved to Jini with its tests."

extra_stops:
- manifest.ts lines 671-777 do not start with the TableCopyOrderCycleError doc and end right before `/** Convenience wrapper:` -> STOP.
- `@jini-ai/db` missing from apps/website/package.json dependencies -> STOP (it is there at b28d38c6 via `@jini-ai/db/data-modules`).

Cloud run owes: Jini vitest `packages/db/src/transfer/__tests__/copy-order.test.ts` (all GREEN, no RED: pure move); Jini db typecheck + subpath isolation; Tovu node:test migration-manifest.test.ts + typecheck after D1 link.
