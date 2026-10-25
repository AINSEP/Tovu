# L2 — Jini data lane (db, core, plugins, registry) — REPORT (in progress; sections added per package)

Started 2026-10-25T15:57Z. Jini @ 3e2fbae8 (cloud/overnight-1024-jini). Stryker 9, vitest-runner 9, TS 5, concurrency 3, perTest, StringLiteral excluded, type checks off, `ignoreStatic` ON (static mutants reported as Ignored, not tested).

## 1. Headline — packages/db (partial: risk-ordered subset)
- 41 of 91 mutable files run (2753 mutants instrumented; 678 static ignored; **2075 tested**): killed 1867, timeout 16, survived 173, no-coverage 19 → **score 90.7 %** (killed+timeout / tested). Wall 41 min mutation + ~4 min dry run.
- First attempt on all 91 files (4987 mutants) projected ~7 h (PGlite-backed tests are slow) → aborted at 6 min; subset below chosen by risk.
- ENV/baseline exclusions (listed, not mutation-relevant): `*.postgres.test.ts` (already excluded by repo config; need Postgres), plus two **pre-existing failing baseline test files** that scan the source tree / package exports and therefore also cannot run in a sandbox: `src/__tests__/import-isolation.test.ts` (1 fail) and `src/__tests__/loads-without-driver.test.ts` (2 fails — `exports exactly the subpaths under test` fails because `./owner-store` is exported but absent from the test's expected list; see §2).

## 2. Suspected source/test bugs
- **Stale test, not source**: `loads-without-driver.test.ts:246` expected subpath list lacks `owner-store`, which package.json now exports (baseline red on branch HEAD, independent of Stryker). `import-isolation.test.ts:63` also red at baseline (not diagnosed).
- No production-source bug found. **Security-relevant gap**: `owner-store/service.ts:38` — the vault `authorize` guard (`workspaceId !== OWNER_WORKSPACE_ID || principalId !== null || !isCopyable…`) survives `→ false`, every `||→&&`, and block removal: NO test exercises the denial path (see §5).

## 3. Per-file table — db subset (worst first; score = (killed+timeout)/(killed+timeout+survived+nocov))
| file | mutants | killed | survived | no-cov | timeout | score % |
|---|---|---|---|---|---|---|
| src/owner-store/backup.ts | 234 | 149 | 44 | 12 | 0 | 72.7 |
| src/owner-store/service.ts | 121 | 77 | 11 | 3 | 0 | 84.6 |
| src/transfer/sqlite-source.ts | 72 | 57 | 10 | 0 | 0 | 85.1 |
| src/transfer/postgres-target.ts | 194 | 108 | 19 | 0 | 10 | 86.1 |
| src/owner-store/open.ts | 75 | 51 | 4 | 4 | 0 | 86.4 |
| src/kernel/schema-shape.ts | 135 | 76 | 9 | 0 | 0 | 89.4 |
| src/transfer/table-catalog.ts | 177 | 145 | 15 | 0 | 0 | 90.6 |
| src/migrate/runner.ts | 142 | 110 | 10 | 0 | 0 | 91.7 |
| src/transfer/copy-engine.ts | 382 | 267 | 22 | 0 | 1 | 92.4 |
| src/kernel/kernel-core.ts | 101 | 78 | 6 | 0 | 3 | 93.1 |
| src/kernel/dialect.ts | 194 | 129 | 6 | 0 | 0 | 95.6 |
| src/kernel/ops.ts | 22 | 14 | 0 | 0 | 0 | 100.0 |
| src/kernel/port.ts | 2 | 0 | 0 | 0 | 0 | - |
| src/recovery/migrate-forward-hooks.ts | 20 | 12 | 1 | 0 | 0 | 92.3 |
| src/secrets-vault/repo.sql.ts | 327 | 198 | 9 | 0 | 0 | 95.7 |
| src/transfer/internal-ddl.ts | 159 | 96 | 4 | 0 | 2 | 96.1 |
| src/recovery/restore-hooks.ts | 70 | 53 | 1 | 0 | 0 | 98.1 |
| src/recovery/recovery-orchestrator.ts | 67 | 55 | 1 | 0 | 0 | 98.2 |
| src/migrate/checksum.ts | 4 | 1 | 0 | 0 | 0 | 100.0 |
| src/migrate/step.ts | 13 | 1 | 0 | 0 | 0 | 100.0 |
| src/owner-store/migrations/0000_owner_store.ts | 10 | 5 | 0 | 0 | 0 | 100.0 |
| src/owner-store/migrations/index.ts | 1 | 0 | 0 | 0 | 0 | - |
| src/recovery/migrate-forward-execute.ts | 28 | 19 | 1 | 0 | 0 | 95.0 |
| src/recovery/degraded-banners.ts | 39 | 23 | 0 | 0 | 0 | 100.0 |
| src/recovery/disclosure.ts | 20 | 19 | 0 | 0 | 0 | 100.0 |
| src/recovery/evaluate-boot-migration-policy.ts | 13 | 9 | 0 | 0 | 0 | 100.0 |
| src/recovery/operation-lock.ts | 20 | 18 | 0 | 0 | 0 | 100.0 |
| src/recovery/reconcile-interrupted-migration.ts | 11 | 10 | 0 | 0 | 0 | 100.0 |
| src/recovery/restore-point-create.ts | 29 | 25 | 0 | 0 | 0 | 100.0 |
| src/transfer/plan.ts | 29 | 24 | 0 | 0 | 0 | 100.0 |
| src/transfer/postgres-ddl.ts | 19 | 17 | 0 | 0 | 0 | 100.0 |
| src/transfer/signals.ts | 2 | 0 | 0 | 0 | 0 | - |
| src/recovery/deep-link.ts | 11 | 11 | 0 | 0 | 0 | 100.0 |
| src/recovery/lookup-adapters.ts | 10 | 10 | 0 | 0 | 0 | 100.0 |

## 4. Triaged survivors (files <80 % or ≥10 survivors; ≤10 each)
**owner-store/backup.ts (72.7 %, 44 surv incl. 12 NC)** — (a) gap: every `OwnerStoreBackupError({code: INVALID_BACKUP})` branch (lines 33,68-69,80,86-87,112-117) is unexecuted/unasserted: no test feeds a malformed backup (non-JSON payload, non-object doc, bad meta/payload shape, non-string id/ownerKey/label, bad binding/provider, unknown vault kind). Missing: table-driven "restore rejects malformed backup with INVALID_BACKUP" test.
**owner-store/service.ts (84.6 %, 11 surv)** — (a) gap, high risk: authorize guard line 38 (see §2); line 62 `!input.consumerId → VaultError context` untested; line 105 `summary.id === entryId` find predicate →true survives (copy picks wrong entry if >1 secret).
**transfer/sqlite-source.ts (85.1 %, 10)** — (a) gap: line 89 WAL→rollback-journal header patch (`bytes[18]/[19] !== 2`) — all 6 mutants survive: need a WAL-mode db fixture and a non-WAL one; line 134 CREATE VIRTUAL TABLE regex anchors/whitespace untested (4): test leading-space and `CREATE  VIRTUAL  TABLE` + a non-virtual table containing the words.
**transfer/postgres-target.ts (86.1 %, 19)** — (a) gap: connection-string handling: `raw.trim()` (47), leading-slash strip (65), env passthrough filter `!key.startsWith("PG")` (82; PG* env must be dropped, others kept), psql stderr parsing (90-92: blank-line filter, `ERROR:|FATAL:|could not|timeout` picker, `psql:..:` prefix strip). (c) message formatting partly.
**transfer/table-catalog.ts (90.6 %, 15)** — (a) gap: sqlite→pg type mapping `CHAR|CLOB|TEXT`→text (8); default-literal regexes (numeric / quoted string anchors, 18); `bytea` default skip (16); single-PK rowid choice (37); partial/pk index filter (39); FK `foreignColumns.some(null)` (53).
**transfer/copy-engine.ts (92.4 %, 22)** — (a) gap: schema-slug builder (62,71,77): regexes for non-alnum collapse and leading/trailing underscore trim unasserted; `<= MAX_IDENTIFIER_BYTES` boundary (64) needs an exactly-at-limit site name. (b) `[]`→`["Stryker was here"]` at 133/140 likely equivalent/defensive.
**migrate/runner.ts (91.7 %, 10)** — (a) gap: `lockKey` schema-qualified vs bare (74); checksum regex anchors (93: accept 65-char / non-hex-prefixed); `backupPath` context passthrough (151); `tableExists` with schema (189-191).
Others (<10 survivors): schema-shape.ts — `.sort()` removals (65,69) mean ordering normalisation isn't asserted; kernel-core.ts — `ownTransactions` counter ±= (109,113) and `finally` block (112) survive: transaction-depth bookkeeping not asserted, `close()` delegation (148) untested; owner-store/open.ts — `allowFileFallback:true→false` (43), win32/darwin path-case folding (68), and the `SiteKeyFileAlreadyExistsError` race branch (77-78, no-coverage).

## 5. No-coverage ranges (db subset)
owner-store/backup.ts L33,68,69,80,86,87,112,113,115,116,117 · owner-store/open.ts L77-78 · owner-store/service.ts L38,39,62.

## 6. NOT RUN (db)
50 mutable files not run (time): `src/pglite/owner.ts`, `src/pglite/socket-server.ts`, `src/tools/*` (transfer-tools, database-catalog, restore-points, read-tools, timeline, plan-store, transfer-catalog), `src/sqlite/*` (inspect, db-ops, open), `src/kernel/{store-copy,typegen,pglite/*,sqlite/*,postgres/*}`, `src/core/pg-types.ts`, `src/pg-fixture.ts`, and any other file outside §3. Also not run: all `*.postgres.test.ts` (ENV: no Postgres) — so Postgres-driver code is mutation-untested here.

(core / plugins / registry sections follow.)
