# L2 — Jini data lane (db, core, plugins, registry) — REPORT (in progress; sections added per package)

Started 2026-10-25T15:57Z. Jini @ 3e2fbae8 (cloud/overnight-1024-jini). Stryker 9, vitest-runner 9, TS 5, concurrency 3, perTest, StringLiteral excluded, type checks off, `ignoreStatic` ON (static mutants reported as Ignored, not tested).

## 0. Headline — whole lane
L2 packages all measured: **db 89.6 %** (3507 tested; all but `pglite/socket-server.ts`, in two passes), **core 93.4 %** (5020), **plugins 87.1 %** (3326), **registry 93.8 %** (1106). Total 12 959 mutants tested; static mutants ignored (see §7). Wall ≈ 3 h 10 m; rough tokens ≈ 0.25M. Biggest risks: untested vault authorize guard (db), 0 % covered SQL activation repo (plugins), weak package-safety/approval-mismatch assertions (plugins), cert-chain walk (registry), scope guards in settings write-service (core).

## 1. Headline — packages/db, pass 1 (risk-ordered subset)
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
Pass 2 (below) covered the previously-unrun files. Only `src/pglite/socket-server.ts` (443 lines, skipped for time/CPU) and `src/testing/**` were never run. (Pass-1 note retained:) `src/pglite/owner.ts`, `src/pglite/socket-server.ts`, `src/tools/*` (transfer-tools, database-catalog, restore-points, read-tools, timeline, plan-store, transfer-catalog), `src/sqlite/*` (inspect, db-ops, open), `src/kernel/{store-copy,typegen,pglite/*,sqlite/*,postgres/*}`, `src/core/pg-types.ts`, `src/pg-fixture.ts`, and any other file outside §3. Also not run: all `*.postgres.test.ts` (ENV: no Postgres) — so Postgres-driver code is mutation-untested here.


---
# packages/db — pass 2 (remaining files; added 19:04Z)
49 files, 1908 mutants, 476 static ignored, 1432 tested: killed 1254, timeout 6, survived 159, no-cov 13 → **88.8 %**. Mutation 1 h. Combined db (pass 1+2): 3507 tested, 3143 detected, 332 survived, 32 no-cov → **89.6 %**.

| file | mutants | killed | survived | no-cov | timeout | score % |
|---|---|---|---|---|---|---|
| src/kernel/postgres/driver.ts | 20 | 6 | 10 | 0 | 0 | 37.5 |
| src/tools/database-catalog.ts | 50 | 12 | 9 | 0 | 0 | 57.1 |
| src/kernel/postgres/pglite-socket.ts | 26 | 11 | 5 | 0 | 3 | 73.7 |
| src/kernel/postgres/ops.ts | 33 | 15 | 5 | 0 | 0 | 75.0 |
| src/kernel/pglite/driver.ts | 28 | 19 | 6 | 0 | 0 | 76.0 |
| src/kernel/pglite/ops.ts | 62 | 38 | 12 | 0 | 0 | 76.0 |
| src/pglite/owner.ts | 270 | 183 | 37 | 0 | 0 | 83.2 |
| src/kernel/sqlite/driver.ts | 67 | 47 | 9 | 0 | 0 | 83.9 |
| src/sqlite/db-ops.ts | 32 | 21 | 4 | 0 | 0 | 84.0 |
| src/tools/transfer-tools.ts | 351 | 247 | 31 | 12 | 0 | 85.2 |
| src/kernel/sqlite/ops.ts | 30 | 18 | 3 | 0 | 0 | 85.7 |
| src/kernel/turn-lock.ts | 43 | 35 | 4 | 0 | 1 | 90.0 |
| src/core/pg-types.ts | 16 | 12 | 1 | 0 | 1 | 92.9 |
| src/tools/timeline.ts | 20 | 16 | 1 | 0 | 0 | 94.1 |
| src/core/row-values.ts | 20 | 17 | 1 | 0 | 0 | 94.4 |
| src/sqlite/inspect.ts | 176 | 135 | 6 | 1 | 0 | 95.1 |
| src/core/artifact-naming.ts | 7 | 4 | 0 | 0 | 0 | 100.0 |
| src/kernel/store-copy.ts | 250 | 175 | 13 | 0 | 1 | 93.1 |
| src/tools/plan-store.ts | 40 | 35 | 1 | 0 | 0 | 97.2 |
| src/kernel/typegen.ts | 85 | 37 | 1 | 0 | 0 | 97.4 |
| src/kernel/pglite/dialect.ts | 25 | 21 | 0 | 0 | 0 | 100.0 |
| src/kernel/postgres-lock.ts | 2 | 1 | 0 | 0 | 0 | 100.0 |
| src/kernel/schema-scope.ts | 9 | 7 | 0 | 0 | 0 | 100.0 |
| src/pg-fixture.ts | 54 | 31 | 0 | 0 | 0 | 100.0 |
| src/sqlite/open.ts | 10 | 6 | 0 | 0 | 0 | 100.0 |
| src/tools/read-tools.ts | 73 | 49 | 0 | 0 | 0 | 100.0 |
| src/tools/registration.ts | 23 | 20 | 0 | 0 | 0 | 100.0 |
| src/tools/restore-points.ts | 24 | 19 | 0 | 0 | 0 | 100.0 |

**Triage (db pass 2)**:
- `tools/database-catalog.ts` (57.1 %, 9): (a) HIGH — every tool's `authorization: {permission:"database.read"}` → `{}` survives: no test asserts the permission a tool *requires*. Add a registry-level test enumerating tools and their permissions (also for transfer-tools/restore-points).
- `kernel/postgres/driver.ts` (37.5 %, 10) + `postgres/ops.ts`, `pglite-socket.ts`: (a) pool `max ?? 10` default, `capabilities` flags (interactiveTransactions/atomicBatch/transactionalDdl→false) unasserted; largely ENV (no Postgres server; `*.postgres.test.ts` excluded).
- `kernel/pglite/ops.ts` (76 %, 12): (a) `ownedSocket` logic `transport==="pglite-socket" && owner!==undefined` (51), tarball temp-file cleanup in `finally` (65-66).
- `pglite/owner.ts` (83.2 %, 37): (a) "already open by pid" message branch (86), socket-path length fallback `<=` boundary (201), catch block (266).
- `tools/transfer-tools.ts` (85.2 %, 31+12NC): (a) `leftOut` filter for bookkeeping reasons (148, 170) — no test executes it (NC); `sqlite/inspect.ts` L170 NC.
- `kernel/sqlite/driver.ts` (83.9 %, 9), `kernel/store-copy.ts` (93.1 %, 13), `turn-lock.ts` (4): not individually triaged.
No-coverage (pass 2): `sqlite/inspect.ts` L170; `tools/transfer-tools.ts` L148,170.

---
# packages/core — FULL (all non-test/non-typecheck src)
103 files, 6950 mutants instrumented, 1930 static ignored, 5020 tested: killed 4666, timeout 22, survived 330, no-cov 2 → **93.4 %**. Dry run 30 s (1443 tests); mutation 16 min. Note: baseline suite is 1488 tests but Stryker's dry run saw 1443 (test files colocated under `src/` such as `records.test.ts` are excluded from the sandbox copy of `mutate`-only? — not investigated). 22 `settings/dictionaries/settings-dialog.*.ts` files + `settings/agent-tools.ts`, `surface-exchanges.ts`, `tool-tokens.ts` show 0 tested mutants (all StringLiteral-only/static/type files) and are omitted from the table.

| file | mutants | killed | survived | no-cov | timeout | score % |
|---|---|---|---|---|---|---|
| src/fetch/loader-read.ts | 7 | 5 | 1 | 0 | 0 | 83.3 |
| src/settings/repo.memory.ts | 280 | 233 | 38 | 1 | 0 | 85.7 |
| src/fetch/cache.ts | 233 | 191 | 27 | 0 | 4 | 87.8 |
| src/settings/write-service.ts | 452 | 326 | 40 | 1 | 0 | 88.8 |
| src/gated-mutations/actor-identity.ts | 21 | 17 | 2 | 0 | 0 | 89.5 |
| src/gated-mutations/token.ts | 93 | 72 | 8 | 0 | 0 | 90.0 |
| src/approval.ts | 232 | 194 | 19 | 0 | 0 | 91.1 |
| src/primitives/sse.ts | 140 | 109 | 11 | 0 | 4 | 91.1 |
| src/primitives/paths.ts | 61 | 43 | 4 | 0 | 0 | 91.5 |
| src/settings/agent-write-denylist.ts | 22 | 12 | 1 | 0 | 0 | 92.3 |
| src/settings/agent-value-write-tools.ts | 265 | 198 | 13 | 0 | 0 | 93.8 |
| src/object-store.ts | 39 | 31 | 2 | 0 | 0 | 93.9 |
| src/redact.ts | 491 | 115 | 7 | 0 | 1 | 94.3 |
| src/model-facing-tool-errors.ts | 54 | 40 | 2 | 0 | 0 | 95.2 |
| src/settings/change-feed.ts | 47 | 41 | 2 | 0 | 0 | 95.3 |
| src/settings/definitions-dispatch.ts | 27 | 21 | 1 | 0 | 0 | 95.5 |
| src/origin-validation.ts | 335 | 283 | 10 | 0 | 0 | 96.6 |
| src/registration-kit.ts | 290 | 236 | 8 | 0 | 0 | 96.7 |
| src/batch-tool-inputs.ts | 304 | 246 | 8 | 0 | 0 | 96.9 |
| src/feature-flags.ts | 40 | 33 | 1 | 0 | 0 | 97.1 |
| src/provider-registry.ts | 150 | 115 | 3 | 0 | 0 | 97.5 |
| src/naming.ts | 48 | 40 | 1 | 0 | 0 | 97.6 |
| src/gated-mutations/gateway.ts | 96 | 79 | 1 | 0 | 0 | 98.8 |
| src/api-token-auth.ts | 42 | 36 | 0 | 0 | 0 | 100.0 |
| src/bindings.ts | 22 | 19 | 0 | 0 | 0 | 100.0 |
| src/daemon.ts | 23 | 21 | 0 | 0 | 0 | 100.0 |
| src/primitives/logger.ts | 17 | 13 | 0 | 0 | 0 | 100.0 |
| src/records.ts | 32 | 31 | 0 | 0 | 0 | 100.0 |
| src/settings/agent-writable-preferences.ts | 33 | 1 | 0 | 0 | 0 | 100.0 |
| src/settings/dictionaries/index.ts | 4 | 3 | 0 | 0 | 0 | 100.0 |
| src/tool-exposure.ts | 136 | 99 | 16 | 0 | 3 | 86.4 |
| src/settings/purge-service.ts | 45 | 29 | 4 | 0 | 0 | 87.9 |
| src/tool-registry.ts | 97 | 78 | 8 | 0 | 0 | 90.7 |
| src/settings/express/cms-adapter.ts | 149 | 118 | 12 | 0 | 0 | 90.8 |
| src/settings/settings.ts | 230 | 176 | 15 | 0 | 0 | 92.1 |
| src/tool-input-normalization.ts | 422 | 318 | 27 | 0 | 2 | 92.2 |
| src/text/sanitize-untrusted-text.ts | 164 | 125 | 9 | 0 | 7 | 93.6 |
| src/settings/tool-registrations.ts | 279 | 202 | 12 | 0 | 1 | 94.4 |
| src/settings/ensure-definitions.ts | 65 | 55 | 3 | 0 | 0 | 94.8 |
| src/pack-lifecycle.ts | 23 | 22 | 1 | 0 | 0 | 95.7 |
| src/settings/express/http.ts | 253 | 167 | 7 | 0 | 0 | 96.0 |
| src/settings/express/http-request.ts | 44 | 29 | 1 | 0 | 0 | 96.7 |
| src/target-scope.ts | 110 | 95 | 3 | 0 | 0 | 96.9 |
| src/settings/express/stream.ts | 174 | 148 | 2 | 0 | 0 | 98.7 |
| src/settings/errors.ts | 5 | 3 | 0 | 0 | 0 | 100.0 |
| src/settings/express/shared.ts | 71 | 63 | 0 | 0 | 0 | 100.0 |
| src/settings/ui-tab-definitions.ts | 82 | 9 | 0 | 0 | 0 | 100.0 |
| src/text/escape.ts | 13 | 4 | 0 | 0 | 0 | 100.0 |
| src/token.ts | 14 | 12 | 0 | 0 | 0 | 100.0 |
| src/tool-input-errors.ts | 2 | 1 | 0 | 0 | 0 | 100.0 |
| src/tool-metadata.ts | 83 | 80 | 0 | 0 | 0 | 100.0 |
| src/tool-permissions.ts | 11 | 10 | 0 | 0 | 0 | 100.0 |
| src/contribution-registry.ts | 7 | 7 | 0 | 0 | 0 | 100.0 |
| src/pack.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/primitives/ids.ts | 3 | 3 | 0 | 0 | 0 | 100.0 |
| src/primitives/tasks.ts | 1 | 1 | 0 | 0 | 0 | 100.0 |
| src/primitives/time.ts | 6 | 6 | 0 | 0 | 0 | 100.0 |

**Triage (core)** — (a) = real gap:
- `origin-validation.ts` (96.6 %, 10): (a) `!raw.trim()`/`trim()` handling of blank & whitespace-padded origin lists (58-59,157-158); RFC1918 range predicate lines 182 (`a===10`, `172.16–31`, `192.168` each replaceable by `true` → no test pins a *non-private* address in each range's neighbourhood: e.g. 172.15.x, 172.32.x, 11.x must be public); `!host → false` (196). Security-adjacent: add boundary IPs.
- `approval.ts` (91.1 %, 19): (a) abort path is under-asserted: `{once:true}` listener opts (22), `finally` listener cleanup (26), `signal.aborted` pre-checks at 72/96 (`→false` survives), `aborted || !plan` (91), `abandoned()` confirmed flag (61). Missing: tests with an already-aborted signal and abort *during* the prompt, asserting `confirmed:false` and no leaked listener. Human-confirmation gate → HIGH risk.
- `settings/write-service.ts` (88.8 %, 40): (a) HIGH: scope guards survive — `scope==="global" → return` (254), `scope!=="user" → return` (274), `!principalId || principalId===callerPrincipalId → return` (275, i.e. cross-principal write check), workspaceId/principalId derivation by scope (209, 366, 367 → `true/false/!==`); `ownerId ?? null` (129). Missing: user-scope write targeting another principal must be refused; global scope must store workspaceId null even when a workspaceId is passed; user scope without principalId falls back to caller. Also L850 loop `version++→--` is no-coverage (history replay with version ≥ 2 untested).
- `settings/repo.memory.ts` (85.7 %, 38+1NC): (a) seed arrays `?? []` (42-46: seed ignored), `active` definition preference + latest-version sort (82-83; NC at 83: sort comparator never exercised → multi-version definitions untested), namespace filter (65).
- `fetch/cache.ts` (87.8 %, 27): (a) unsubscribe/eviction (116,121), stale-pending guard `entry.pending !== pending` (177), `replacement` counter (199), prefix invalidation `every→some` (208), focus-refetch selection (223). 
- `tool-exposure.ts` (86.4 %, 16): (a) deterministic naming: `.sort()` removal (49), FNV hash loop bound (22), collision `SAFE_NAME` path (51), `reservedNames` default (63), deep-freeze guards (119).
- `primitives/sse.ts` (91.1 %, 11): (a) comment-line skip (51), `maxBufferChars` boundary `>` vs `>=` (94), empty-line dispatch (102), final flush (125/127), char accounting (107).
- `tool-input-normalization.ts` (92.2 %, 27): (a) edit-distance helper: loop bound (19), transposition detection `&&` conditions (26), `id` suffix special-case (36). Likely (b)/(a) mix — fuzzy-name matcher; boundary cases (transposed adjacent chars, `id`/`userid`) untested.
- `settings/settings.ts` (92.1 %, 15): (a) namespace-prefix scope classifiers (38-40: `core.`/`theme.`/`site.` + workspaceId null/non-null each → `true` survives), `scopes<1||>7` bitmask bounds (76).
- Remaining (`agent-value-write-tools` 13, `cms-adapter` 12, `tool-registrations` 12, `loader-read` 1): not individually triaged (token budget); dominated by conditional/logical mutators.

# packages/plugins — FULL
46 files, 3981 mutants instrumented, 655 static ignored, 3326 tested: killed 2887, timeout 9, survived 390, no-cov 40 → **87.1 %**. Dry run 21 s (681 tests); mutation 16 min. (No vitest config in package; defaults used.)

| file | mutants | killed | survived | no-cov | timeout | score % |
|---|---|---|---|---|---|---|
| src/host/sql/repo.rows.ts | 23 | 0 | 0 | 23 | 0 | 0.0 |
| src/host/sql/repo.ts | 26 | 0 | 0 | 16 | 0 | 0.0 |
| src/host/node/browser-provider-assets.ts | 101 | 60 | 33 | 0 | 0 | 64.5 |
| src/host/errors.ts | 4 | 2 | 1 | 0 | 0 | 66.7 |
| src/host/plugin-format.ts | 14 | 7 | 3 | 0 | 0 | 70.0 |
| src/host/hook-registry.ts | 135 | 98 | 19 | 0 | 0 | 83.8 |
| src/host/claim-conflicts.ts | 132 | 102 | 18 | 0 | 0 | 85.0 |
| src/host/node/install.ts | 603 | 410 | 72 | 0 | 1 | 85.1 |
| src/host/node/source-drafts.ts | 522 | 364 | 61 | 0 | 1 | 85.7 |
| src/host/node/package-files.ts | 176 | 130 | 21 | 0 | 7 | 86.7 |
| src/host/plugin-claims.ts | 165 | 111 | 17 | 0 | 0 | 86.7 |
| src/host/manifest.ts | 498 | 358 | 53 | 0 | 0 | 87.1 |
| src/host/node/discovery.ts | 200 | 150 | 21 | 0 | 0 | 87.7 |
| src/host/contributions.ts | 287 | 218 | 29 | 0 | 0 | 88.3 |
| src/host/tool-contributions.ts | 54 | 43 | 5 | 0 | 0 | 89.6 |
| src/glue/manifest.ts | 161 | 122 | 12 | 0 | 0 | 91.0 |
| src/host/bundled-initialization.ts | 29 | 26 | 2 | 0 | 0 | 92.9 |
| src/host/node/module-snapshot.ts | 39 | 27 | 2 | 0 | 0 | 93.1 |
| src/host/browser-providers.ts | 160 | 127 | 8 | 0 | 0 | 94.1 |
| src/host/uninstall.ts | 65 | 52 | 3 | 0 | 0 | 94.5 |
| src/host/repo.memory.ts | 39 | 37 | 2 | 0 | 0 | 94.9 |
| src/host/worker/protocol.ts | 66 | 52 | 2 | 0 | 0 | 96.3 |
| src/host/node/loader.ts | 124 | 104 | 3 | 0 | 0 | 97.2 |
| src/host/worker/import-seam.ts | 45 | 37 | 1 | 0 | 0 | 97.4 |
| src/host/capability-sdk.ts | 59 | 39 | 0 | 1 | 0 | 97.5 |
| src/host/source-policy.ts | 51 | 43 | 1 | 0 | 0 | 97.7 |
| src/host/activation.ts | 51 | 45 | 1 | 0 | 0 | 97.8 |
| src/glue/attachment-points/tool-registration.ts | 28 | 22 | 0 | 0 | 0 | 100.0 |
| src/glue/capability-gate.ts | 13 | 10 | 0 | 0 | 0 | 100.0 |
| src/host/declarative-enable.ts | 30 | 26 | 0 | 0 | 0 | 100.0 |
| src/host/quarantine.ts | 11 | 10 | 0 | 0 | 0 | 100.0 |
| src/host/worker/run-call.ts | 55 | 40 | 0 | 0 | 0 | 100.0 |
| src/glue/attachment-points/events.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/glue/attachment-points/content-lifecycle.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/glue/dispatch.ts | 7 | 7 | 0 | 0 | 0 | 100.0 |
| src/host/attach-loaded-plugin.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/host/node/open-flags.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |

**Triage (plugins)**:
- `host/sql/repo.ts` + `repo.rows.ts` (0 % — 39 no-cov, Kysely activation repo): (a) HIGH: **no test executes the SQL plugin-activation repository** (getActivation/save/upsert, row mapping). Needs a PGlite/sqlite kernel-backed round-trip test (save → get; upsert on conflict (workspace_id, plugin_id)).
- `host/node/browser-provider-assets.ts` (64.5 %, 33): (a) provider-approval comparison (lines 18-20): `length ===`, and each of id/kind/contractVersion… equalities replaceable by `true` → a plugin whose browser-provider set/pins differ from the approval is not shown to be rejected. Security gate → HIGH.
- `host/node/install.ts` (85.1 %, 72): (a) package-safety limits: `child.startsWith(parent)` containment (73 — path-escape), regular-file/nlink==1 check (110, hardlink/symlink rejection), size caps (111), read loop bound (101). Missing: hardlink, symlink-escape, oversize-file and total-size-exceeded fixtures. HIGH (supply-chain/path traversal).
- `host/node/source-drafts.ts` (85.7 %, 61): (a) id format check (61), file-path validator (65: backslash, NUL, empty, `..`), relative-path handling (76).
- `host/node/package-files.ts` (86.7 %, 21+7 timeouts): (a) `maxBytes/maxFiles/maxEntries/maxFileBytes/maxTotalBytes` boundary `>` vs `>=` (142,163,194,198), symlink/dir test (129).
- `host/manifest.ts` (87.1 %, 53): (a) id validation (126: length bounds), non-string id error (173-175), version semver check (212), integrity-hash pattern (229).
- `host/hook-registry.ts` (83.8 %, 19): (a) value-type validators `integer/string/boolean` (127-134) accept wrong types; workspaceId scoping (246).
- `host/claim-conflicts.ts` (85.0 %, 18): (a) route-key normalisation (trim/lowercase 96,114), `:param` segment regex (108), method/path split (117).
- `host/plugin-claims.ts` (86.7 %, 17), `contributions.ts` (88.3 %, 29: HTTP-method / route-path regex anchors 47-48), `discovery.ts` (87.7 %, 21: tier validation 78, object guard 71), `plugin-format.ts` (70 %, 3: filename arrays → `[]` survive), `errors.ts` (1): (a) as noted.

# packages/registry — FULL
16 files, 1353 mutants instrumented, 247 static ignored, 1106 tested: killed 1035, timeout 1, survived 69, no-cov 1 → **93.8 %**. Needed a Stryker-only vitest config with absolute paths (repo config resolves `../db` relatively; breaks inside `.stryker-tmp`). Dry run 8 s (338 tests); mutation ~7 min.

| file | mutants | killed | survived | no-cov | timeout | score % |
|---|---|---|---|---|---|---|
| src/trust-certificates.ts | 55 | 44 | 7 | 1 | 0 | 84.6 |
| src/versioning.ts | 267 | 230 | 25 | 0 | 1 | 90.2 |
| src/database-backend.ts | 91 | 69 | 7 | 0 | 0 | 90.8 |
| src/static-backend.ts | 257 | 194 | 18 | 0 | 0 | 91.5 |
| src/tool-catalog/sqlite.ts | 35 | 28 | 2 | 0 | 0 | 93.3 |
| src/github-client.ts | 242 | 160 | 5 | 0 | 0 | 97.0 |
| src/github-backend.ts | 133 | 79 | 2 | 0 | 0 | 97.5 |
| src/tool-catalog-builder/query.ts | 66 | 61 | 1 | 0 | 0 | 98.4 |
| src/trust.ts | 151 | 120 | 2 | 0 | 0 | 98.4 |
| src/tool-catalog-builder/search-enricher.ts | 40 | 35 | 0 | 0 | 0 | 100.0 |
| src/tool-catalog-builder/sqlite.ts | 16 | 15 | 0 | 0 | 0 | 100.0 |

**Triage (registry)**:
- `trust-certificates.ts` (84.6 %, 7+1NC): (a) HIGH — certificate-chain walk: `maxHops` arithmetic (28), loop `hop++`/`<=` (29), `!current → false` (26), `chain.slice(1)` (27), `nextIndex === -1 → false` (32) all survive; L36 final `return false` never reached (NC). Missing: chain with a cycle, chain longer than trusted CAs, broken link, empty chain — each must be *rejected*. Trust-boundary code.
- `versioning.ts` (90.2 %, 25): (a) `name@version` splitting with scope (`@scope/pkg@1`) — `slash>0`/`at>slash+1` boundaries (39); optional-field spreads (`ref`, `manifestDigest`, `archiveIntegrity`) always-true survive (104-108): absent fields must be omitted.
- `static-backend.ts` (91.5 %, 18): (a) search ordering tie-break `score` sort (86), verified issuer/subject only when verified (109-110: `&&→||` survives), `.entries` optional chaining (178).
- `database-backend.ts` (90.8 %, 7): (a) dry-run vs apply warnings arrays; corrupt-JSON error path (181-182) not asserted; `now` clock passed to upsert (65,103).

---
# Cross-cutting

## 2b. Suspected source bugs (final)
None identified in production source. Test-suite problems: two red baseline test files in `packages/db` (see §1). No Postgres-dependent files were included in any run.

## 7. What these numbers do NOT catch
- Type checks disabled (`disableTypeChecks`) and no checker plugin → type-invalid mutants counted as ordinary; `StringLiteral` excluded → error-message/ID/string-constant assertions unmeasured (the pilot found ~half its survivors were string literals).
- **Static mutants ignored** (`ignoreStatic`): db 678+, core 1930, plugins 655, registry 247 — module-level constants/initialisers (regex tables, limit constants, defaults) are NOT scored. Those are exactly where limits such as MAX_* live; a follow-up run without `ignoreStatic` is advised for core/plugins/registry (cheap: ≈20 min each).
- Killed = killed by *any* test in the package (indirect kills); UI/.tsx excluded; `*.typecheck.ts` excluded; `src/testing/**` excluded in db; mutation of untested *inputs* and unimplemented behaviour; Postgres-driver paths (no server).
- Cross-package integration (plugins↔registry↔db) not exercised.

## 8. Top 10 tests to write first (by risk)
1. `owner-store/service.ts:38` — vault authorize guard: wrong workspace / non-null principal / non-copyable kind must each throw `VaultError{context}`; empty `consumerId` too.
2. `registry/trust-certificates.ts` — chain-walk rejection cases: cycle, over-long chain, broken link, empty chain, untrusted root.
3. `plugins/host/node/install.ts` + `package-files.ts` — hardlink (nlink>1), symlink escape, oversize file, total-size and file-count boundaries (exactly at / one over limit), `startsWith` prefix-sibling path (`/a/pkg` vs `/a/pkg-evil`).
4. `core/settings/write-service.ts` — user-scope write for another principal refused; global scope forces workspaceId null; user scope defaults principal to caller.
5. `core/approval.ts` — pre-aborted signal & abort mid-prompt → `confirmed:false`, listener removed.
6. `plugins/host/node/browser-provider-assets.ts` — approval mismatch matrix (extra provider, missing, id/kind/contractVersion differ).
7. `plugins/host/sql/repo.ts` + `repo.rows.ts` — save/get/upsert round-trip on a real kernel (currently 0 % covered).
8. `db/owner-store/backup.ts` — table-driven malformed-backup rejection (INVALID_BACKUP) for every shape check.
9. `core/origin-validation.ts` — RFC1918/loopback boundary addresses (172.15/172.32, 11.x, 192.167) + blank/whitespace allow-list.
10. `db/transfer/sqlite-source.ts` + `postgres-target.ts` — WAL header patch (bytes 18/19) with WAL and non-WAL fixtures; PG* env filtering and psql stderr parsing.

L2 DONE 2026-10-25T19:08Z — wall ≈ 3h11m, ≈0.25M tokens (rough). Artifacts (mutation JSON) were not committed (kept at /root/stryker/reports, ephemeral).
