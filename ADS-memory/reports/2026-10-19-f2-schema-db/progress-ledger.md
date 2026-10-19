# f2-schema-db — Programmer handoff, 2026-10-19

Jini exports Tovu imports: none

Changes applied for every listed failure group. Runtime results remain unverified: the dispatch
explicitly prohibits tests, typechecks, builds, installs and git writes. None were run. Existing
Jini APIs were reused; no Jini source, exports or built output changed. Graph MCP tools were not
available, so discovery used current source and read-only git history.

## Failure dispositions and introducing history

Paths below are relative to `apps/website/src/` unless otherwise stated. Locations name the
current source or repaired assertion; commits were checked with `git log -p` / `git show`.

| Failing test file | Disposition | Root cause / location | Introducing commit |
| --- | --- | --- | --- |
| `features/post/__tests__/search-index.postgres.test.ts` | updated-stale-test | `features/post/repo.rows.ts:76` now returns `author`/`showAuthor`; expected full record at test line 37 omitted them, preventing all four search cases from reaching their search assertions. Keep full equality and every query assertion. | `21e385e7e` |
| `platform/db/__tests__/migration-manifest.test.ts` | updated-stale-test | Explicit boolean set at line 208 omitted the intentional `asset_blobs.document_owned` SQLiteBoolean addition. Keep exact set equality and plain-integer exclusions. | `14f5085fd` |
| `platform/db/__tests__/schema-postgres-drift.test.ts` | fixed-code | Hand edits in `platform/db/schema.postgres.ts:339` introduced non-generated indentation/comment/order; `:780` used `text` for a manifest-classified JSON column. Synchronize emitted source without changing generator or assertions. | `f6de81431`, `c29687fd7` |
| `platform/db/__tests__/schema-postgres-parity.test.ts` | fixed-code | `platform/db/schema.sqlite.ts:1449` lacked the media-kind CHECK already enforced by migration 0014 and the PG schema. Add it to the source schema; preserve it in PG. Fix PG indentation (the column-count check requires generated formatting) and `config_fields_json` mapping. | `f6de81431`, `c29687fd7` |
| `platform/db/kernel/__tests__/database-types.test.ts` | fixed-code | `platform/db/content-database.generated.ts:348` had new media fields manually prepended instead of in reference-schema ordinal order. Move only those declarations. | `f6de81431` |
| `platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts` | fixed-code | New native queries in `features/site-backup/import-restore.ts:70` and `platform/db/sqlite/import-database-worker.ts:59`, plus new SQLite JSON spellings in `server/runtime/composition/local-credential-copy.ts:76`, bypassed the kernel boundary. Replace with existing kernel/connection/integrity/transaction owners and standard JSON inspection. Remove the now-zero existing JSON baseline entry; add no allowances. | `9412f4e8e` (Share/Import), `1d96267e3` (extra credential JSON checks); later worker additions `b36351588` |
| `platform/db/sqlite/__tests__/database-introspection-adapter.dialects.test.ts` | updated-stale-test | `platform/db/sqlite/database-introspection-adapter.sqlite.ts:159` intentionally prefers the adopted SQLite ledger. Legacy fixture setup at test line 42 removed only Drizzle history, leaving the fully migrated content ledger. Drop both ledgers in these legacy fixtures; preserve pending-count/schema-state assertions. | `ba5a8508a` |
| `platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts` | updated-stale-test | `features/vendor-credentials/vault-adapter.ts:42` intentionally returns `credentialType` and `worksFor`; the rollback test's full expected record omitted them. Keep complete equality after the competing rollback. | `1d96267e3` |
| `platform/site-dir/__tests__/read-applied-schema-identity.sqlite.test.ts` | fixed-code | `platform/site-dir/read-applied-schema-identity.ts:86` previously selected the content ledger only for PG. Prefer it for adopted SQLite too, including empty/diverged outcomes without legacy fallback. The file wrapper at line 117 explicitly retains the legacy-stamp view required by existing boot/repair/key-only-meta comparisons. Remove the TODO while preserving its exact expected head, and add empty/diverged coverage. | `4e6b47ccf`; known B1 TODO recorded in `487e30e96` |
| `server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts` | updated-stale-test | Test line 1 lacked the canonical home isolation bootstrap required by `platform/site-dir/sites-home.ts:52`, causing first boot and wrong-key checks to fail before their actual assertions. Also replace the retired destination-table count at line 197 with the same exact count in the canonical vault. | `fec2a6a9f` (home guard), `9b20083b6` (vault ownership) |
| `server/runtime/composition/__tests__/open-site-content-db.legacy-fixtures.integration.test.ts` | updated-stale-test | Shared assertion `server/runtime/composition/__tests__/fixtures/legacy-content-history.ts:65` expected persisted `kind=custom` after migration 0013 now intentionally converts it to `kind=vendor`. Preserve lineage, ciphertext, scope, default, metadata, row-conservation and backup assertions; additionally assert custom subtype and empty works-for for these non-host fixture labels. | `1d96267e3` defines conversion; `08704be17` activates it |
| `server/runtime/composition/__tests__/process-root-parity.test.ts` | updated-stale-test | Production `server/inbound/assistant/agent-daemon-server.ts:1273` intentionally uses the bound site for cwd. AST-evaluation fixture at test line 371 lacked that dependency and still expected process cwd. Supply a distinct site directory and keep the complete executor argument/options assertions. | `d51b602e4` |

## Ownership, boundaries and validation

- Reuse: SQLite connection policy and integrity inspection; inspected Jini `db/src/sqlite/open.ts`,
  `inspect.ts`, driver exports and Tovu `kernel/drivers/sqlite.ts`; called existing
  `openSqliteConnection`, `verifySqliteIntegrity`, `openNativeSqlite`, `openSqliteFileKernel`.
- Reuse: portable queries and transactions; inspected Share sanitizer, Jini kernel and
  `kernel/sqlite-only.ts`; use `run/query/execute`, `listColumns`, and the existing
  `sqliteForeignKeyCheckedTransaction`. Workspace/blob remapping still commits atomically;
  foreign keys are now deferred and checked before commit. The archive's SQL is never executed.
- Reuse: exact schema inspection; Jini `readSchemaShape` normalizes DDL and omits internal
  objects, which violates this importer's exact-schema contract. Extend Tovu's existing
  SQLite-only boundary with `sqliteSchemaObjects`, and add direct exact-DDL/internal-index/
  view/trigger/non-SQLite coverage. Jini extraction is recorded in
  `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`: package entries resolve built
  output and rebuilding is prohibited in this dispatch.
- Reuse: legacy credential preflight; inspect all source metadata before key inspection or
  selection, using Kysely's existing SQLite stream and standard `JSON.parse`, `Object.hasOwn`
  and `Array.isArray`. This preserves refusal for mixed valid/legacy rows, explicit JSON-null
  `legacyAad`, missing credential subtype, and non-array works-for. It reads no envelopes and
  buffers no entire vault. Streaming is already covered in Jini's kernel contract tests;
  installed Kysely's SQLite driver streams via the existing binding shim's iterator.
- Reuse: schema identity; extend the named reader rather than adding another implementation.
  The optional view distinguishes current content identity from the explicitly legacy stamp
  contract. Existing required kernel/file arguments retain their compatibility signatures.
- Architecture audit: WARNING only for deferred extraction of the generic exact-catalog helper,
  recorded under the repository's Jini First fallback. No provider-specific query remains in the
  failing feature/worker/composition sites. GOV-ADR-003 SQL identifiers use trusted allowlists
  and Kysely identifier quoting; no operator text is interpolated into DDL. Shipped checksummed
  migrations, registries and ownership records were not edited.
- Verification: fresh `git diff --check` succeeded. Source/diff/history review only; no tests,
  typechecks, generators, builds, installers or git mutations. Pass/fail counts and coverage
  cannot be reported under the dispatch restriction. Self-validation is not run for that reason.
- Test integrity: no assertions were removed or weakened. The sole removed TODO makes its
  unchanged head assertion mandatory. The raw-SQLite baseline only shrinks. New tests cover
  exact schema preservation and current-ledger empty/diverged outcomes.
- Scope: two supporting test files (`kernel/__tests__/sqlite-only.test.ts` and
  `site-dir/__tests__/unit/read-applied-schema-identity.dialects.test.ts`) were extended to cover
  changed contracts. The named legacy integration test is corrected through its shared fixture.
  Other jobs' edits, excluded admin/Stryker files and inbound route tests were untouched.
- Static contract correction during review: the import worker was edited three times across the
  boundary conversion, documentation and native-opener option-shape check. This was not a failed
  runtime retry loop; inspection of Jini's narrow opener type showed that timeout must travel in
  its structural options object, retaining the native driver's original 1-second timeout.

| Assessed unit | Disposition | Findings / local action |
| --- | --- | --- |
| `sqliteSchemaObjects` | RECOMMENDED extraction | Generic helper remains temporarily at existing Tovu boundary; backlog entry added. O(schema objects log schema objects), exact bytes preserved. |
| `run` / `validatePortableReferences` | NO_RECORDED_FINDINGS | Existing capped helper/deadline and fixed joins retained; kernel transaction and integrity owners reused; no archive DDL execution. |
| `restoreStagedImport` | NO_RECORDED_FINDINGS | Existing fixed-table writes moved to owning kernel; owning connection closes in finally. |
| `createLocalCredentialCopy.readSource` | NO_RECORDED_FINDINGS | Metadata scan uses bounded stream memory, preserves whole-source refusal and readonly lifecycle. |
| `readAppliedSchemaIdentity` / file wrapper | NO_RECORDED_FINDINGS | Explicit current vs legacy-stamp contract, same three-way outcomes; default current and legacy file compatibility have direct assertions. |
| `assertVaultPreserved` | NO_RECORDED_FINDINGS | Storage-kind transition distinguished from custom subtype; complete preservation assertions retained and subtype assertions added. |

Variable-name skepticism: `sourceKind` is historical provenance and `kind` is the persisted
post-0013 kind; `identity` names the requested view, not a guessed migration lineage;
`sourceKernel`/`fresh` distinguish readonly source from rebuilt output. No inverted or stale
computed-name issue remains from this review. Runtime confirmation remains the next step for
the Coordinator/TestRunner when tests are allowed.

## Files changed by this dispatch

```
apps/website/src/features/post/__tests__/search-index.postgres.test.ts
apps/website/src/features/site-backup/import-restore.ts
apps/website/src/platform/db/__tests__/migration-manifest.test.ts
apps/website/src/platform/db/content-database.generated.ts
apps/website/src/platform/db/kernel/__tests__/raw-sqlite-baseline.json
apps/website/src/platform/db/kernel/__tests__/sqlite-only.test.ts
apps/website/src/platform/db/kernel/sqlite-only.ts
apps/website/src/platform/db/schema.postgres.ts
apps/website/src/platform/db/schema.sqlite.ts
apps/website/src/platform/db/sqlite/__tests__/database-introspection-adapter.dialects.test.ts
apps/website/src/platform/db/sqlite/__tests__/repo-transactions.sqlite.test.ts
apps/website/src/platform/db/sqlite/import-database-worker.ts
apps/website/src/platform/site-dir/__tests__/read-applied-schema-identity.sqlite.test.ts
apps/website/src/platform/site-dir/__tests__/unit/read-applied-schema-identity.dialects.test.ts
apps/website/src/platform/site-dir/read-applied-schema-identity.ts
apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts
apps/website/src/server/runtime/composition/__tests__/fixtures/legacy-content-history.ts
apps/website/src/server/runtime/composition/__tests__/process-root-parity.test.ts
apps/website/src/server/runtime/composition/local-credential-copy.ts
ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md
ADS-memory/reports/2026-10-19-f2-schema-db/progress-ledger.md
```
