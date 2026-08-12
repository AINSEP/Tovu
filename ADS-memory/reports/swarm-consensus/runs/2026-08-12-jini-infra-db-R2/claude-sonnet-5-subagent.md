# Round 2 — Claude Sonnet 5 subagent (read the actual code)

> Coordinator note: strongest response of the round. It counted against the real schema rather than
> assuming, and **contradicted the other peers on facts**. All four counts independently verified by
> the Coordinator. It also raised **Option C**, which no other participant considered, and caught its
> own D1 recommendation reproducing the PART C failure *worse* (D7#4).

## Summary

Keep the three-way split (Jini `infra`=mechanics, Jini `cms`=reusable domain shape, Tovu=meaning). For dual-dialect schema, define each table once through a dialect-neutral `TableSpec` (types only, safe in Jini) and derive both `sqliteTable`/`pgTable` via emitter functions **in Tovu, not Jini** (see D7#4). For SQLite→Postgres migration, build it as a first-party Tovu plugin reusing Tovu's **already-existing** `core/gated-mutations` plan→confirm→execute gateway for human approval rather than inventing a second mechanism. ADR-023's plugin dataModule engine (whole-file snapshot + phase journal) is SQLite-file-shaped by construction and must not run on Postgres; Postgres plugin DDL leans on Postgres's own transactional-DDL crash safety. WordPress importer = Tovu plugin. MySQL introspection = Jini infra. The agent plugin is a thin wrapper over the same deterministic core the UI uses — it cannot reach `commit()`.

## D1 — Dual-dialect

Type-only neutral spec in Jini; dialect emitters constructing real Drizzle objects live in **Tovu**.

```ts
// @jini-ai/infra/db/core/schema-dsl.ts — erases at compile time, like ports.ts already does
export type ColKind = "text" | "int" | "bool" | "float" | "blob" | "isoTimestamp";
export interface ColSpec { kind: ColKind; notNull?: boolean; primaryKey?: boolean; autoIncrement?: boolean; default?: string|number|boolean }
export interface TableSpec { name: string; columns: Record<string, ColSpec>; indexes?: { name: string; columns: string[]; unique?: boolean }[] }

// src/db/schema-emit/{sqlite,postgres}.ts  (Tovu)
export function toSqliteTable(spec: TableSpec): SQLiteTableWithColumns<any>
export function toPgTable(spec: TableSpec): PgTableWithColumns<any>

// src/db/table-defs/media.ts (Tovu, hand-written ONCE)
export const mediaSpec: TableSpec = defineTable("media", { id: { kind:"text", primaryKey:true }, workspaceId: { kind:"text", notNull:true } }, …);
// src/db/schema.ts           export const media = toSqliteTable(mediaSpec);
// src/db/schema.postgres.ts  export const media = toPgTable(mediaSpec);
```

Drift becomes structurally impossible except inside the two emitters, or if someone bypasses the DSL with a raw `sqliteTable(...)`.

**Type mappings — verified against the real schema, not assumed:**
- **autoincrement int PKs — 14 occurrences.** SQLite `AUTOINCREMENT` never reuses a value; Postgres IDENTITY/serial sequences need explicit `setval()` resync after a data-only load or the next insert collides with a copied row's id.
- **boolean — 3 occurrences**, stored `integer(mode:"boolean")` as 0/1. Emitter must switch representation per dialect, not just carry the name.
- **JSON — 0 native occurrences.** JSON-shaped data (`transformDefinitions.paramsJson`) is hand-serialized into plain `text`. Keep it `text` in both dialects for v1; upgrading to `jsonb` is unrequested scope creep — named as a temptation and refused.
- **Timestamps — 0 `mode:"timestamp"` columns.** Every timestamp is `text("created_at")` holding ISO-8601. Keep `text` in Postgres for v1 (zero transform risk) or convert to `timestamptz` (real value transform, can throw on malformed legacy rows, breaks every call site's "createdAt is a string" assumption). Recommend `text`, as an explicit named flag.
- **FTS5 has no DSL representation at all.** `post_search_fts` is FTS5 external-content with 3 sync triggers, tokenizer `porter unicode61`. Postgres `tsvector`/GIN is a different tokenization/ranking model, not a value translation. Hand-authored dialect-branching search adapter, never DSL-emitted; re-indexing is a distinct migration step from row-copying.

**Migrations:** two independent chains. SQLite keeps `drizzle/*.sql` + `__drizzle_migrations`; Postgres gets `drizzle/postgres/*.sql` + its own. Do not author one file that "works on both."

**CI drift check:** (1) a driver-isolation-style guard asserting set-equality of exported table names between `schema.ts` and `schema.postgres.ts`; (2) migrate a scratch DB of each dialect to head, introspect both (`pragma table_info` / `information_schema.columns`), assert column-name/nullability sets match 1:1 — type differences are expected, an extra/missing COLUMN is drift.

## D2 — SQLite → Postgres live migration

Built as a Tovu plugin reusing the existing `core/gated-mutations` gateway rather than a new approval path.

```ts
interface PgMigrationPlanDetails {
  sourceDialect: "sqlite"; targetDialect: "postgres"; targetConnRef: string;
  tableCounts: Record<string, number>;   // includes plgn_* tables, introspected LIVE, not from schema.ts
  estimatedBytes: number;
}
const migratePgHooks: GatedMutationHooks<PgMigrationPlanDetails, PgMigrationResult> = {
  domain: "database.migrate-to-postgres",
  readPermission: "database.migrate-to-postgres.read",
  mutatePermission: "database.migrate-to-postgres.execute",
  scopeId: /* SEE D7#1 — this field is wrong as designed */,
  computePlan: async () => …, executeMutation: async () => …,
};
```

Flow: (1) capture a SQLite restore point first via existing `DbOpsPort.captureRestorePoint()` — the source stays authoritative until cutover. (2) `plan()` introspects `sqlite_master` **live**, not `schema.ts`, because plugin tables are a runtime fact. (3) `confirm()` — the one human gate; if an agent drives, `gateway.ts`'s actor-class rule (REQ-13) forces the confirming identity to resolve to the agent's **human delegator**, not the agent. (4) `execute()`, phased and checkpointed in a NEW Postgres-side journal (not ADR-023's `_plugin_migration_journal`, which is scoped to plugin DDL): apply Postgres migrations to empty target → freeze SQLite writes → bulk-copy batched ~5k rows/txn, FKs relaxed during load and validated after → rebuild search by **re-deriving tsvectors from content**, never byte-copying the FTS5 index → **re-run each plugin's own dataModule declaration against Postgres**, never replaying `_plugin_migrations.ddl` (SQLite syntax, invalid on Postgres) → verify row-count parity + content hashes → cutover via boot-time `dbDialect` flag, `restartRequired: true`, matching `SqliteDbOpsAdapter.restoreFromArtifact` precedent. (5) Keep the SQLite file untouched for N days as the real rollback path — asymmetric by design, cheaper than a reverse migration.

`__drizzle_migrations` rows are never copied — Postgres reaches head via its own chain. **Blob bytes are never touched**: `assetBlobs.storageKey` (`media-repo.sqlite.ts:103`) means media lives outside `content.db`, so this is a pure row-copy problem, not a storage migration. `workspaceId` copies verbatim — this is a full-instance cutover, not per-workspace. *If the owner's "Supabase hosts many instances" picture means something more granular, that assumption must be checked before this ships.*

## D3 — Plugin tables on Postgres

ADR-023's engine is SQLite-file-shaped: whole-file `db.backup()`, `-wal`/`-shm` cleanup, a `better-sqlite3` `Database` baked into `data-module.ts:62`. None exists for remote Postgres.

Extend the spirit of the existing `isInMemoryDbPath` bypass (`snapshot.ts:38`), which already proves "skip snapshot/journal, rely on the transaction's own rollback" is sound when there is no local file. On Postgres this is not merely forced — Postgres has real transactional DDL, so step 7's single transaction gets full crash-atomicity from Postgres's WAL, making the external snapshot apparatus **redundant, not just inapplicable** — a materially better answer than SQLite gets. The real gap is the "human decided this plugin's data was wrong" case: defer to platform PITR (Supabase provides it; already modeled as `externalPitrConfigured` in `postgres/db-ops.ts:29`) rather than `pg_dump`-per-declare, with an explicit capability warning at declare time for self-hosted Postgres without PITR.

Dialect DDL generation lives in Tovu (`features/plugins/`): `emitDdl(decl, dialect): string[]`, sibling to today's inline `columnSql`/`indexSql` (`data-module.ts:164-176`). `ColumnType`'s `"TEXT"|"INTEGER"|"REAL"|"BLOB"` needs the boolean-as-mode convention or plugin authors silently get wrong Postgres booleans.

## D4 — Migration plugins

```ts
interface WpMigrationTools {
  introspectSource(r: { mysqlConnRef: string }): Promise<WpSchemaSummary>;      // read-only BY CONSTRUCTION: no write method exists on the class
  proposeMapping(r: { schemaSummary: WpSchemaSummary }): Promise<MappingProposal>;  // deterministic heuristics, NOT an LLM call
  dryRun(r: { mapping: MappingProposal }): Promise<DryRunReport>;               // writes nothing
  commit(r: { mapping: MappingProposal; confirmationToken: string }): Promise<ImportResult>;  // requires a redeemed gated-mutations token
}
```

Agent tools: `wp_migration.inspect_source`, `propose_mapping` (agent may adjust only via a **closed enum of legal adjustments** the tool schema defines — never free-text transforms), `dry_run`, `request_commit`. **`commit()` is never exposed to the agent** — only `request_commit`, which calls `plan()` and hands a human the confirmation prompt. The agent receives structured JSON, never a raw handle or plaintext connection string — only an opaque `mysqlConnRef`, matching the sealed-secret pattern in `execution-credential-repo.sqlite.ts`. It returns a schema-validated `MappingProposal` and narration — never SQL text.

## D5 — MySQL scope

**In scope:** MySQL as a read-only WordPress source — `@jini-ai/infra/db/introspect/mysql.ts`, `SELECT`-only grant, no write method existing on the class at all (absent, not merely unused). **Explicitly out of scope:** MySQL as a Tovu target — no owner ask, and it stacks a third dialect on D1's already-costed pair. Naming the rejection matters because "scope MySQL" is easy to misread as "add a third target."

## D6 — Placement

`TableSpec`/`ColSpec` (types only) → `@jini-ai/infra/db/core`. `toSqliteTable`/`toPgTable` → **Tovu, provisionally, pending D7#4**. `defineTable` calls + both schemas → Tovu. `DbOpsPort` + SQLite adapter → infra (exists). Postgres adapter → `infra/db/postgres` once it stops being a stub. MySQL introspection → `infra/db/introspect` (new, generic). WordPress mapping heuristics → Tovu plugin. Gated-mutations approval → stays Tovu (product policy). `emitDdl` + Postgres migration journal → Tovu.

## D7 — Bugs in my own design

1. **`scopeId: workspaceId` is wrong for an instance-wide migration.** `GatedMutationHooks.scopeId` (`gateway.ts:47`) is documented as the workspace the mutation is scoped to, but this migration touches every workspace at once. Trigger: a workspace-scoped admin calls `plan()`/`confirm()`. Symptom: authorization bypass (one workspace's admin approves an all-tenant cutover) **or** a crash where `authorize()` gets a scopeId matching no permission row. Needs verification whether an instance-level permission shape exists at all — if not, that is a **prerequisite feature, not a fix inside this design**.
2. **Chicken-and-egg checkpoint ordering.** Step 4 applies Postgres migrations *before* the journal table exists to record them. Trigger: crash between schema creation and first checkpoint insert. Symptom: naive resume either re-runs migrations against a non-empty target (duplicate-table errors) or restarts from row 1 and double-inserts. I copied "run migrations first" from boot ordering instead of "journal first" from the exact precedent (`data-module.ts`'s snapshot-then-DDL) this design was supposed to learn from.
3. **Postgres's 63-byte identifier limit collides with the double-prefixed naming scheme.** `idx_${fqTableName}__${idx.name}` (`data-module.ts:172`) is already `idx_` + `p_{pluginId}__` + table + `__` + index. SQLite has no cap so nothing has ever hit it. Trigger: a ~20-char pluginId plus a normal index name crosses 63 bytes **only on Postgres**. Symptom: Postgres silently truncates (documented behavior, no error), producing different names per dialect and breaking `existingTables()` idempotency — a truncated and full name read as two different tables.
4. **My own D1 placement may reproduce PART C's failure, worse.** PART C found 604 errors moving drizzle-*generic helpers* into infra. `toSqliteTable`/`toPgTable` **construct and return actual `SQLiteTable`/`PgTable` instances** — a strictly harder case. Had I placed them in Jini as first drafted, Tovu passing the result into `.select().from(table)` hits the identical wall at all 63 call sites, not the 34 files documented. This is why D6 places emitters in Tovu provisionally: my design depends on the untested `pnpm pack` experiment, and I should have designed for the pessimistic case rather than revising after naming the risk.
5. **Dry-run "writes nothing, therefore safe" ignores source availability.** `introspectSource` samples a live serving WordPress DB. `wp_postmeta` is often 10–100× `wp_posts` from revisions/autosaves. Trigger: unbounded `SELECT` under real traffic. Symptom: **the source blog slows or times out** during "safe" introspection. I scoped safe to "cannot corrupt" and never to "cannot degrade the source." Needs a row-sampling cap and statement timeout on every introspection query.

## Ranked slate

- **A — Derive-both-dialects DSL** (this design, D7#4-revised: types in Jini, emitters in Tovu).
- **B — Hand-maintained twin schemas**, kept honest only by the CI parity check.
- **C — Defer Postgres-as-Tovu's-own-schema entirely.** Tovu stays SQLite-only forever, and "Supabase hosts many Tovu instances, migrate as you grow" is satisfied by **Supabase hosting persistent SQLite files (Litestream-style replication)** rather than Tovu speaking two dialects. Worth naming because it attacks PART A's framing rather than accepting it.

Criteria: (1) exposure to PART C's typing wall, (2) per-schema-change maintenance cost, (3) reintroduction of Round 1's "elegant interface, one implementation" failure, (4) fit to the owner's literal "migrates to PostgreSQL as you grow."

- **A:** low on (1) after revision; lowest on (2); medium on (3) — genuinely new abstraction, unproven; good fit (4).
- **B:** zero on (1); highest on (2) — every schema change is two hand-edits trusting a CI diff, i.e. "drift caught," materially weaker than A's "drift impossible"; low (3); good fit (4).
- **C:** zero on (1); lowest on (2) — nothing to sync ever; zero (3); poor fit on (4) as literally stated, but **cheapest and safest by a wide margin**.

**Recommendation:** A, gated on the `pnpm pack` experiment running first, with B funded as fallback if it fails — and **C raised to the owner explicitly before either A or B gets implementation time, because if C satisfies the stated goal, everything past D1 is unnecessary.**

**Cheapest de-risking test:** pack `@jini-ai/infra` into a tarball, install into a throwaway non-symlinked consumer fixture, have it call a minimal `toSqliteTable`-equivalent and feed the result into a real `.select().from()`. Under an hour, and it settles every future cross-package drizzle-touching idea, not just this design.

## What would change my mind

If the pack experiment shows the nominal wall survives publish-mode resolution, A is dead regardless of topology and B is the only viable multi-dialect answer. If `authorize()` has no instance-level permission shape, D7#1 is a prerequisite that changes sequencing for the whole effort. **If the owner confirms Option C satisfies their journey, D1–D3 become unnecessary and only D4/D5 remain** — the single highest-leverage question to ask before Round 3. If a real second Jini product wants Postgres independently, D6's placement moves from provisional to settled.

<<SWARM_END>>

---

## Coordinator verification

| Claim | Verified |
|---|---|
| autoincrement PKs = 14 | ✅ `grep -ci autoincrement` = 14 |
| boolean columns = 3 | ✅ |
| JSON columns = **0** | ✅ contradicts Codex + Gemini Pro, who both listed JSON→JSONB as a major mapping |
| `mode:"timestamp"` = **0** | ✅ all timestamps are `text("created_at")` ISO strings; contradicts both peers' timestamptz concern |
| D7#1 — no instance-level scope | ✅ `gateway.ts` passes `hooks.scopeId` straight through as `workspaceId` (lines 113, 155, 201); `actor-identity.ts` has no instance/global concept |
| D7#3 — identifier length | ✅ and quantified: worst-case index name is **62 bytes under `p_`, 65 under `plgn_`** — over Postgres's 63-byte limit. Longest in the live DB today is 42. |
