# Tasks: settings-core-ledger

- Spec: SPEC-007 v0.3.1 (hash: sha256:fc322f69fe3cc586dbe9823c4d3d6d5225e419d538be554bdfe88873a40a501b)
- ADR: ADR-PIPE-007 (ACCEPTED 2026-07-11)
- Outline: ADS-project-knowledge/reports/pipeline/007-settings-core-ledger/implementation-outline.md (Status: PRODUCED)
- Date: 2026-07-11T21:00:00Z
- Author: Coordinator

## Format

`[ID] [P?] [Story ref] Description` — [P] = parallel-safe (different files, no shared mutable state within the phase). Phases + order derived from the implementation outline's Module Map, Wiring Map, and Downstream Handoff Notes.

Task checkboxes are **Coordinator-owned state**. TDD, Programmer, TestRunner, and Code Review treat this file as **read-only** unless the Coordinator explicitly delegates a task-list update.

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` (lines/branches/functions/statements). **Flag:** this repo has no coverage tool wired yet (confirmed via `package.json` — no `test:cov`/coverage script exists); Phase 0 adds it via node:test's built-in coverage, matching the precedent set in `reports/pipeline/001-admin-command-gateway/tasks.md`.
- Integration minimums: defaults `90/90/90/90`.
- E2E minimums: N/A — no browser E2E suite for this backend+admin-screen feature (see Required Suites; the Settings screen gets a manual `/verify` pass per ADR-PIPE-007's Post-Cutover Verification, not an automated E2E suite in this pass).
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests (AC-01…09, 11, 14…17, 21, 23, 25) and all invariants (INV-01…09) passing. No lower threshold requested.
- **Contract Tests** (from outline): `SettingsRepoPort` shared contract-test suite run against both `repo.memory.ts` and `repo.sqlite.ts` (C-007).

### Required Suites

- Unit: **required** — resolver precedence/totality, definition validation, `deriveRequiredPermission`, alias/rename/retype state machine, cache invalidation.
- Integration: **required** — 5 admin HTTP endpoints via the existing `src/server/__tests__/routes/` harness; `SettingsWriteService.set/clear` at the real SQLite adapter (chokepoint tx integrity); the presentation-settings migration against fixture rows.
- E2E: **not applicable** — no browser/CLI end-to-end automated suite in this slice; the Settings screen is manually `/verify`-checked per ADR-PIPE-007.

### Coverage Tool

- Tool: node:test built-in coverage — `node --import tsx --test --experimental-test-coverage` (no new dependency; matches existing `npm test`).
- Machine-readable output path: `coverage/lcov.info` (via `--test-reporter=lcov`).
- Cleanup paths before run: `coverage/`.
- Per-suite output: unit + integration share the node:test run (co-located `*.test.ts`); split reporting by path glob if TestRunner needs per-suite numbers.

### Performance (optional)

- N/A — SPEC-007 has no latency/throughput NFRs beyond the existing `WRITE_STANDARD`/`READ_STANDARD` rate-limit profiles (api.spec.md §3), which are enforced at the existing rate-limit middleware, not a new performance target for this feature.

---

## Phase 0 — Setup

No story dependencies.

- [x] T001 [P] Create directory structure: `src/features/settings/` (+ `__specs__/`, `__tests__/`), `src/server/routes/admin/settings/`
- [x] T002 [P] Wire node:test coverage output (`--experimental-test-coverage` → `coverage/lcov.info`) into an `npm run test:cov` script in `package.json`
- [x] T003 [P] Add the 5 Drizzle table definitions from ADR-028 §2 DDL to `src/infra/db/schema.ts`: `settingDefinitions`, `settingValuesGlobal`, `settingValuesWorkspace`, `settingValuesUser`, `settingRevisions` — deviation: no literal `FOREIGN KEY...REFERENCES principals`; `identity` has no SQLite adapter yet (in-memory only), so REQ-13's principal check is enforced at the application layer instead (see T017). The `setting_values` UNION view (ADR-028 §2) was not added — no reader needs it yet (resolver reads per-layer tables directly); add when a real consumer needs it.

---

## Phase 1 — Foundational (blocks all stories)

The registry, resolver, and single write chokepoint — the highest-risk, most load-bearing code in this feature (INV-01/02/07/09 all live here). **No story phase begins until this checkpoint.**

- [x] T004 [AC-02, AC-03, AC-15, INV-05, INV-08] Write failing tests: `registerDefinitions` owner-fence validation (core/site/theme namespace CHECKs), `scopes` bitmask 1..7, `secret:true` rejection — `src/features/settings/__tests__/settings.registration.test.ts`
- [x] T005 [P] [AC-04, AC-05, AC-06, AC-21, INV-02, INV-03, INV-04] Write failing tests: `getEffective` layer precedence (all pairs + all-absent→default), alias-transparent resolution by old/new key, stale `def_version` in-memory coercion (no write-back) — `src/features/settings/__tests__/settings.resolver.test.ts`
- [x] T006 [P] [C-007] Write failing `SettingsRepoPort` shared contract-test suite (definitions + all 3 value-scope tables + revisions) — `src/features/settings/__tests__/repo.contract.test.ts` — runs against **both** adapters (T012, T013)
- [x] T007 [P] [AC-25, AC-26] Write failing tests for `deriveRequiredPermission`: scope=user + principalId omitted/self → `settings.user.self.write`; principalId differs → `settings.user.write` — `src/features/settings/__tests__/write-service.permission-derivation.test.ts`
- [x] T008 [AC-07, AC-08, INV-01, INV-07] Write failing tests: `SettingsWriteService.set` — authorize-first ordering, one value row + one `op='set'` revision same tx, unauthorized → `FORBIDDEN` with zero rows written — `src/features/settings/__tests__/write-service.set.test.ts`
- [x] T009 [P] [AC-24, INV-09] Write failing tests: `SettingsWriteService.set`/`.clear` at scope=user targeting a `principalId` whose own `workspace_id` differs from the request's `workspaceId` → `PRINCIPAL_NOT_FOUND`, zero rows written — `src/features/settings/__tests__/write-service.principal-check.test.ts`
- [x] T010 [P] [EC-02, EC-03, EC-04] Write failing tests: write to a scope not in `scopes` → `SCOPE_NOT_ALLOWED`; site-def with global bit → `DEFINITION_INVALID`; register `secret:true` → `SECRET_NOT_SUPPORTED` — landed in `settings.registration.test.ts` (EC-03/EC-04) and `write-service.set.test.ts` (EC-02) rather than a separate `edge-cases.test.ts` file; same coverage, different file split
- [x] T011 [C-007] Implement `SettingsRepoPort` interface — `src/features/settings/ports.ts`
- [x] T012 [C-007] Implement in-memory adapter — `src/features/settings/repo.memory.ts` (depends T011)
- [x] T013 [C-007] Implement SQLite/Drizzle adapter against the Phase 0 schema — `src/features/settings/repo.sqlite.ts` (depends T003, T011). Uses manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` against the raw better-sqlite3 handle rather than Drizzle's `db.transaction()` wrapper (that wrapper requires a synchronous callback; the chokepoint's callback is async) — proven correct by a dedicated atomicity test (`repo.sqlite.test.ts`) that forces a mid-transaction failure and asserts rollback.
- [x] T014 [AC-02, AC-03, AC-15, INV-05, INV-08] Implement definition-registration validation (`registerDefinitions` pure half: owner-fence CHECKs, scopes bitmask, secret rejection) + typed errors `DefinitionInvalidError`/`SecretNotSupportedError` — `src/features/settings/settings.ts`, `src/features/settings/errors.ts` (depends T011). **Design correction from the outline:** `registerDefinitions`'s actual *write* (authorize + persist + revision) lives in `write-service.ts`, not `settings.ts` — ADR-028 §4 requires every definition-lifecycle op to go through the chokepoint, which the outline under-specified. `settings.ts` holds only the pure validation half.
- [x] T015 [AC-04, AC-05, AC-06, AC-21, INV-02, INV-03, INV-04] Implement `getEffective`/`resolveDefinition` resolver (precedence, totality, alias-transparency, stale-version in-memory coercion via a small registered-coercer map) — `src/features/settings/settings.ts` (depends T012, T014). `getLayer` was not implemented as a separate export — `getEffective` covers every tested case; add if a real caller needs raw single-layer reads.
- [x] T016 [AC-25, AC-26] Implement `deriveRequiredPermission` as an isolated, directly-exported pure function `[internal-invariant]` — `src/features/settings/write-service.ts` (depends T007; certified green before T017)
- [x] T017 [AC-07, AC-08, AC-24, INV-01, INV-07, INV-09] Implement `SettingsWriteService.registerDefinitions/set/clear` chokepoint: `authorize()` first via `deriveRequiredPermission`, scope/value validation, REQ-13 target-principal check via `identity.PrincipalRepoPort.findById` (W-002), value+revision same-tx write; repo write methods imported here only — `src/features/settings/write-service.ts` (depends T012, T014, T015, T016). AC-09/AC-10 (rename/retype) deferred to Phase 2 as planned.
- [x] T018 [EC-09] Implement `resetNamespace` orchestrator: authorize `settings.reset.*` once, loop `clear()` in the reset-authorized internal context (each still emits its own `op='clear'` revision, per ADR-028 §7 R3-01) — `src/features/settings/write-service.ts` (depends T017)
- [x] T019 [REQ-06] Register the full `settings.*` permission catalog in `BASE_CATALOG` and mark `settings.write` deprecated per ADR-028 §7 — `src/identity/permissions.ts`
- [x] T020 [REQ-06, ADR-028 §7] Grant the full `settings.*` set (incl. `settings.definitions.manage`) to the built-in admin role — `src/identity/seed.ts`. Simplified from "migrate existing grants": pre-launch, `seedIdentity` is the sole source of built-in role permissions (no production installation's data to migrate yet), so this is a direct addition to `BUILTIN_ADMIN_PERMISSIONS`, not a separate migration script.
- [x] T021 Run Phase 1 tests to convergence — **424/424 passing** (40 new Settings tests + 0 regressions across the pre-existing 374/374; `npx tsc --noEmit` clean). Caught and fixed 2 real bugs during TDD: (1) `getEffective` used the caller's own `scopeContext.workspaceId` as a platform definition's partition key instead of falling back to the platform (null) partition; (2) `findActiveDefinition` excluded tombstoned rows entirely, so the write path couldn't distinguish "not found" from "found but tombstoned" (fixed via a `resolveDefinitionRaw` that preserves status, with `resolveDefinition` as the tombstone-collapsing read-path wrapper). Also closed a self-caught gap: T018's `resetNamespace` had no direct test until `write-service.reset.test.ts` was added (3 tests, incl. the ADR-028 §7 R3-01 authorization-scope behavior).
- Coverage (measured, `npm run test:cov`): `settings.ts` 96/89/87, `write-service.ts` 92/83/90, `repo.memory.ts` 90/86/83, `repo.sqlite.ts` 86/69/85 (lines/branches/functions %) — below the 98/98/98/98 target stated in this file's Coverage Profile; expected at a Phase-1-only checkpoint since Phase 2–7 code paths (rename/retype/purge/reset-route/UI) don't exist yet. Full-feature coverage should be re-checked at T054 (Polish).

**Checkpoint**: Registry + resolver + chokepoint green — story phases can begin (Phase 2, 3, 4 are parallelizable per the implementation outline; Phase 5/6 depend on this checkpoint but not on each other's story siblings). **PASSED 2026-07-11.**

---

## Phase 2 — [Story: AC-09/AC-10] Definition lifecycle (rename/retype/deprecate/tombstone) (P1) — [P] with Phase 3, Phase 4

**Goal**: `registerDefinitions` supports rename (marker-row), retype (version+1 with coercer), deprecate, and tombstone, all through the chokepoint with same-tx revisions.
**Independent test**: register a definition, retype it, then rename it → assert the resulting alias marker is `version=1` pointing at the current active key, and both operations produced ledgered revisions.

- [x] T022 [P] [AC-09, EC-06] Write failing tests: rename after retype → v1 alias marker at old name; sequential rename A→B→C retargets prior markers to C; alias-to-alias → `ALIAS_DEPTH_EXCEEDED` — `src/features/settings/__tests__/settings.lifecycle-rename.test.ts` (4 tests, incl. rename-of-missing-definition guard)
- [x] T023 [P] [AC-10, EC-05] Write failing tests: rename+retype in one op → `RENAME_RETYPE_CONFLICT`; retype without a coercer for every prior version → rejected — `src/features/settings/__tests__/settings.lifecycle-retype.test.ts` (3 tests)
- [x] T024 [AC-09, AC-10, EC-05, EC-06] Implement rename (marker-row mechanism, same-tx pair), retype (deprecate-then-insert same-tx pair), deprecate, tombstone lifecycle ops through the chokepoint — `src/features/settings/write-service.ts` (depends T017). 4 new exports: `renameDefinition`, `retypeDefinition`, `deprecateDefinition`, `tombstoneDefinition` (+2 private helpers). All four gate on `settings.definitions.manage` per ADR-028 §7. Added `settings.lifecycle-deprecate-tombstone.test.ts` (4 tests) beyond T022/T023's letter since T024 requires all four ops implemented+tested. Reused `DefinitionInvalidError` for the missing-coercer case (no dedicated error code exists in errors.spec.md's 16-code registry). `ALIAS_DEPTH_EXCEEDED` triggers when a rename's *destination* resolves to an existing alias row. No port/adapter changes needed — sequential-rename retarget reuses `listActiveDefinitions` filtered client-side.
- [x] T025 Run Phase 2 tests to convergence — **11/11 new tests passing**, 0 regressions (full-suite count observed 445-450 depending on snapshot timing while Phase 3/4 sibling agents landed concurrently; author confirmed own 11 pass in isolation every run and saw two full clean `npm test` runs with 0 failures). `npx tsc --noEmit` clean against own files.

**Checkpoint**: AC-09/AC-10 passing — definition lifecycle independently testable. **PASSED.**

---

## Phase 3 — [Story: AC-12/AC-13] Ledgered tenant/principal purge (P1/P2) — [P] with Phase 2, Phase 4

**Goal**: Tenant/principal teardown runs through an authorize-once, ledgered purge service; raw deletes are blocked by `RESTRICT` FKs.
**Independent test**: seed a workspace with N setting values, run the purge service → assert N redacted `op='purge'` revisions + N row deletions, all in one transaction; a raw `DELETE` on that workspace is rejected by the FK.

- [x] T026 [P] [AC-12, INV-06] Write failing tests: purge appends a redacted `op='purge'` revision per row before deleting, all in one tx; prior revision rows remain in the ledger — `src/features/settings/__tests__/purge-service.test.ts`
- [x] T027 [P] [AC-13, EC-07] Write failing test: raw `DELETE` on a workspace holding setting values is rejected by the `RESTRICT` FK (`PURGE_REQUIRED`) — `src/features/settings/__tests__/purge-service.fk.test.ts` — DB-level proof only; mapping the raw constraint error to the `PURGE_REQUIRED` API code is Phase 5 route-layer work (no workspace-delete code path exists yet to wrap)
- [x] T028 [AC-12, AC-13, INV-06] Implement `purgeTenantSettings` (authorize `settings.definitions.manage` once → enumerate → redacted revision per row → delete, one tx) — `src/features/settings/purge-service.ts` (depends T017). Supports both tenant-wide and single-principal (GDPR) purge via an optional `principalId`. Added `listUserValuesByWorkspace` to `SettingsRepoPort` (+ both adapters) so tenant-wide purge can enumerate every principal's rows. Declares its own smaller `PurgeServiceDeps` (`repo`/`clock`/`authorize`) rather than reusing `SettingsWriteServiceDeps`.
- [x] T029 Run Phase 3 tests to convergence — **434/434 passing** (424 baseline + 10 new: 5 in `purge-service.test.ts`, 3 in `purge-service.fk.test.ts`, 1 new contract-test case run against both adapters, +1), 0 regressions; `npx tsc --noEmit` clean.

**Checkpoint**: AC-12/AC-13 passing — purge independently testable. **PASSED.**

---

## Phase 4 — [Story: AC-14] Retire `PresentationSettingsRepoPort` into the ledger (P1, brownfield) — [P] with Phase 2, Phase 3

**Goal**: The active theme id becomes `core.presentation.activeThemeId`; theme presets become `theme.{themeId}` definitions; existing consumers read through the resolver. Per ADR-PIPE-007 Migration Safety, the migration and all 3 named consumer re-points land together — no partial cutover.
**Independent test**: seed legacy `presentation_settings` rows, run the migration, then assert `getEffective('core.presentation.activeThemeId', …)` returns the same value the old port would have, for every seeded workspace (AC-14); assert `appliers.ts`/`navigation/ports.ts` now read through the resolver, not the old port.

- [x] T030 [AC-14] Write failing test: post-migration, `getEffective` equals the pre-migration `PresentationSettingsRepoPort.findByWorkspaceId` value for every fixture workspace; migration is idempotent on rerun — `src/features/settings/__tests__/migration.test.ts` (5 tests, incl. theme-availability backfill + discovered-themes precedence + zero-legacy-rows case)
- [x] T031 [AC-14] Implement `migrateLegacyPresentationSettings` — reads every `presentation_settings` row, writes `core.presentation.activeThemeId` (global scope) via `SettingsWriteService.set`, backfills `theme.{themeId}` definitions from `ALLOWED_THEME_IDS`/discovered themes — `src/features/settings/migration.ts` (depends T017). Added `PresentationSettingsRepoPort.listAll()` (additive) to enumerate rows. `theme.{themeId}` uses key `"available"` (boolean, default `true`) — schema/key not specified by the ADR. Skip-if-already-registered / skip-if-unchanged so reruns append zero new definitions or revisions.
- [x] T032 [AC-14] Wire `migrateLegacyPresentationSettings()` into the existing seed boot path — `src/server/seed.ts` (depends T031). Deviation: `seed.ts` held only data constants, no executable seed function yet — added `seedSettingsFromPresentation()` there, called fire-and-forget (mirrors the existing `identityReady` pattern) from both real boot paths, `src/server/app.ts` and `src/server/deps.ts`. Added `RouteDeps.settingsRepo`/`settingsReady` in `src/server/routes/types.ts`.
- [x] T033 [AC-14] Re-point `src/core/commands/appliers.ts` from `PresentationSettingsRepoPort` to `getEffective('core.presentation.activeThemeId', …)` (depends T031). `ReverterDeps.presentationRepo` → `ReverterDeps.settingsRepo: SettingsRepoPort`, propagated to the one construction site (`src/server/routes/admin/change-sets/revert.ts`). No reverter currently reads this field yet (presentation-settings revert still awaits a `version` field per the file's own pre-existing comment) — type-level re-point, zero behavior change; the future reverter will call `getEffective`.
- [x] T034 [P] [AC-14] Re-point `src/navigation/ports.ts` from `PresentationSettingsRepoPort` to the resolver (depends T031). This file had no functional usage of the old port — only a JSDoc analogy citing it as a rule-of-two precedent — updated the comment to cite `SettingsRepoPort` instead.
- [x] T035 Run Phase 4 tests to convergence — all of T031-T034 landed together (verified via `git status`, no partial cutover). **450/450 passing** (Coordinator-verified full-suite run, independent of the implementing agent's own run), `npx tsc --noEmit` clean.

**Checkpoint**: AC-14 passing — theme retirement complete; `src/features/presentation/*` and the `presentation_settings` table are left in place (deletion is an explicitly out-of-scope follow-up per ADR-PIPE-007 Migration Safety Point of No Return) but are no longer read by any in-scope consumer. **PASSED.**

---

## Phase 5 — [Story: AC-16] Admin HTTP API surface (P1) — depends on Phase 1 only

**Goal**: The 5 admin endpoints (register-definitions, get-effective, set, clear, reset) are each gated by the matching `settings.*` permission and map every domain error to its api.spec.md §6 HTTP code, including the new `PRINCIPAL_NOT_FOUND` → 404.
**Independent test**: call each endpoint without the matching permission → 403; call `SET`/`CLEAR` with a cross-workspace `principalId` → 404 `PRINCIPAL_NOT_FOUND`.

- [x] T036 [P] [AC-16] Write failing integration tests: each of the 5 endpoints without its matching `settings.*` permission → 403 `FORBIDDEN` — `src/server/__tests__/routes/settings-auth.test.ts` (5 tests)
- [x] T037 [P] [AC-24] Write failing integration test: `SETTINGS_SET`/`SETTINGS_CLEAR` with a cross-workspace `principalId` → 404 `PRINCIPAL_NOT_FOUND` (via the real SQLite adapter) — `src/server/__tests__/routes/settings-principal-check.test.ts` (4 tests, real SQLite via `createSqliteRouteDeps`)
- [x] T038 [P] [REQ-10] Implement `registerAdminSettingsRegisterDefinitionsRoute` — `src/server/routes/admin/settings/register-definitions.ts` (depends T014)
- [x] T039 [P] [REQ-10] Implement `registerAdminSettingsGetEffectiveRoute` — `src/server/routes/admin/settings/get-effective.ts` (depends T015)
- [x] T040 [P] [REQ-10, AC-24] Implement `registerAdminSettingsSetRoute` incl. `PrincipalNotFoundError`→404 mapping — `src/server/routes/admin/settings/set.ts` (depends T017). Real bug found+fixed during TDD: `set`/`clear`/`resetNamespace` derived the authorize-call's workspace id as `input.workspaceId ?? callerPrincipalId` — for `scope=global` (no `workspaceId`), this fed the caller's own id into `authorize()` as a bogus workspace id, denying even the owner. Fixed additively via a new optional `authWorkspaceId` field (mirrors `RegisterDefinitionsRequired`'s existing field); routes pass `deps.workspaceId` explicitly. Invisible in Phase 1-4 unit tests since they stub `authorize` directly.
- [x] T041 [P] [REQ-10, AC-24] Implement `registerAdminSettingsClearRoute` incl. `PrincipalNotFoundError`→404 mapping — `src/server/routes/admin/settings/clear.ts` (depends T017)
- [x] T042 [P] [REQ-10] Implement `registerAdminSettingsResetRoute` — `src/server/routes/admin/settings/reset.ts` (depends T018). `resetNamespace` additionally now returns `revisionSeqs: number[]` for `ResetResponse`'s contract (additive).
- [x] T043 [REQ-10] Wire all 5 route registrars into the app — `src/server/app.ts` (depends T038–T042). Mounted at `/api/admin/v1/workspaces/:workspaceId/settings/...` (workspace-scoped path, matching every other admin route registrar in this codebase — posts/menus/presentation/media) rather than api.spec.md's literal unscoped `/api/v1/admin/settings/...`; documented in each route file's header.
- [x] T044 Run Phase 5 tests to convergence — **459/459 passing** (Coordinator-verified independently), 0 regressions. `npx tsc --noEmit` clean. `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` (api.spec.md §1) deliberately not built — genuinely absent from T036-T044's scope, confirmed not an oversight.

**Checkpoint**: AC-16 passing — admin API independently testable end-to-end against the real SQLite adapter. **PASSED.**

---

## Phase 6 — [Story: AC-17/AC-18/AC-22/AC-23] Settings admin screen (P1/P2) — depends on Phase 5

**Goal**: The Settings screen lists definitions by namespace, shows effective + per-layer + default values, lets a permitted operator set/clear/reset, and — for a `settings.user.write` holder — offers the validated target-principal identifier field (not a directory picker, per RT-002).
**Independent test**: open the screen as an operator with a workspace override present → see effective/global/workspace/default distinctly (AC-17); as a `settings.user.write` holder, enter another principal's id and set their value (AC-22); as an operator without `settings.user.write`, confirm no target-principal field renders and a direct API write is rejected (AC-23).

- [x] T045 [AC-17, AC-18, AC-22, AC-23] Implement `Settings.tsx` — `SettingsContainer`, `PrincipalSelector` (validated identifier field, `onSubmitPrincipal`/`onClearPrincipal`, inline `PRINCIPAL_NOT_FOUND` error), `NamespaceGroupList`, `SettingRow`, `SettingDetailPanel`, `ValueEditor`, `ResetNamespaceDialog`, `EmptyState`, `ErrorBanner` per ui.spec.md §1–§5 — `apps/admin/src/sections/Settings.tsx` (depends T036–T043). Extended `apps/admin/src/lib/api.ts` (exposes `effectivePermissions` from `/auth/me`, adds `getSettingsEffective`/`setSetting`/`clearSetting`/`resetSettingsNamespace`). Three disclosed adaptations forced by T044's confirmed absence of `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS`: (1) no namespace-discovery endpoint — operator types a namespace identifier, auto-loads `core.presentation` on mount; (2) no raw per-layer read endpoint — per-layer breakdown derived from calling `GET_EFFECTIVE` twice (with/without `principalId`); when workspace wins over global, global's raw value is honestly rendered as "hidden (overridden)" rather than fabricated — the one place AC-17 is under-delivered relative to the literal spec; (3) no permissions-introspection endpoint — solved for real via `/auth/me`'s already-existing `effectivePermissions`, newly typed on the client, so `PrincipalSelector` visibility (AC-23) is exact, not guessed.
- [x] T046 Mount `<Settings />` in the admin route table — `apps/admin/src/App.tsx` (depends T045)
- [x] T047 Manual `/verify` pass: exercise the golden path (view → edit → save → reset) and the target-principal path in a running browser session per ADR-PIPE-007's Post-Cutover Verification note — **steps handed to user, not run by the agent** (golden path: log in as seeded admin → Settings section → `core.presentation` auto-loads → click row → edit/save/clear/reset → target-principal path for `settings.user.write` holders). User must run this manually.

**Checkpoint**: AC-17/18/22/23 passing (automated) + T047 manual verification — screen complete. **Automated portion PASSED 2026-07-13** (474/474 tests, root + `apps/admin` `tsc --noEmit` both clean, Coordinator-verified independently); **T047's manual browser pass is still owed by the user**.

---

## Phase 7 — [Story: AC-19/AC-20] Per-layer + definition cache (P2) — [P] with Phase 5/6 (extends the resolver only)

**Goal**: Effective reads are cached per layer with single-key invalidation; the definition cache is workspace-qualified.
**Independent test**: write a global value in namespace N → assert only the `settings:global:N` cache key is invalidated, no per-tenant fan-out; two workspaces with the same site-owned key never see each other's definition cache entry.

- [x] T048 [P] [AC-19] Write failing test: global write to namespace N invalidates only `settings:global:N`, no fan-out — `src/features/settings/__tests__/cache.test.ts` (11 tests total, incl. workspace-scope AC-19 variant + all Phase-2 lifecycle ops + purge)
- [x] T049 [P] [AC-20] Write failing test: definition cache is workspace-qualified — one workspace's read never returns another's site-owned definition — `src/features/settings/__tests__/cache.test.ts`
- [x] T050 [AC-19, AC-20] Implement per-layer cache with single-key invalidation + workspace-qualified definition cache — `src/features/settings/settings.ts` (depends T015, T017). Cache store is a `WeakMap<SettingsRepoPort, {...}>` (per-repo-instance, behaviorally identical to a shared map in production). Layer cache keys: `settings:global:{ns}` / `settings:ws:{wsId}:{ns}` / `settings:user:{wsId}:{pid}:{ns}`. Definition cache keys: `def:{workspaceId|"platform"}:{namespace}:{key}:e{epoch}`, epoch bumped by any definition-lifecycle write for lazy invalidation. `resolveDefinitionRaw` (write chokepoint) stays uncached — only read-path `resolveDefinition`/`getEffective` are cache-aware. Wired into `write-service.ts` (set/clear/registerDefinitions/rename/retype/deprecate/tombstone) and `purge-service.ts` (workspace + principal-scoped invalidation).
- [x] T051 Run Phase 7 tests to convergence — **474/474 passing** (Coordinator-verified independently), 0 regressions, `tsc --noEmit` clean.

**Checkpoint**: AC-19/AC-20 passing — cache independently testable. **PASSED 2026-07-13.**

---

## Phase N — Polish

Cross-cutting improvements after all required stories pass.

- [ ] T052 [P] Update `src/features/settings/INFO.md` documenting module purpose, mirroring `presentation`/`identity` `INFO.md` convention
- [ ] T053 [P] Additional unit tests for pure logic gaps found during TestRunner coverage report (dedup rules §5, tie-break §6.1, `EC-01`/`EC-08`/`EC-10` if not already covered by Phase 1–7 tasks)
- [ ] T054 Full `npm run test:cov` pass — confirm coverage minimums (98/98/98/98 unit, 90/90/90/90 integration) or file a human-approved override with TestRunner's actual measured numbers
- [ ] T055 Update `ADS-project-knowledge/reports/pipeline/007-settings-core-ledger/traceability.spec.md` impl/test columns from `pending` to real file/function/test references

---

## Parallelization Rules

- Tasks marked [P] in the same phase can be dispatched simultaneously
- Modules must have no shared mutable state during parallel execution
- No Programmer instance writes to a file another instance reads
- If a shared utility needs changes, serialize — do not parallelize writes to shared code
- Phase 2, Phase 3, and Phase 4 are parallelizable with each other (disjoint files: `write-service.ts` rename/retype logic vs. `purge-service.ts` vs. `migration.ts`+3 consumer files) but each individually depends on the Phase 1 checkpoint
- Phase 7 (cache) is parallelizable with Phase 5/6 (routes/UI) since it only extends `settings.ts`'s resolver internals, not the route or UI files — but do not parallelize Phase 7 against Phase 1 itself (shared file: `settings.ts`)

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 checkpoint → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase N

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 checkpoint → {Phase 2, Phase 3, Phase 4} simultaneously → Phase 5 (needs Phase 1 only, could start once Phase 1 checkpoint passes, running alongside 2/3/4) → Phase 6 (needs Phase 5) → Phase 7 (parallel with Phase 5/6) → TestRunner aggregates → Phase N

---

## Coverage Summary Against SPEC-007 v0.3.1

Every P1 AC, invariant, and edge case has explicit task coverage; no ADR-backed deferrals were needed except the one already recorded in ADR-PIPE-007 Migration Safety (deleting the legacy `presentation` module — out of this feature's scope by design, not a coverage gap).

| Spec Item | Priority | Task Coverage |
|---|---|---|
| REQ-01 | — | T003, T011–T013 (dedicated tables, never `entries`) |
| REQ-02 / AC-02, AC-03 | P1 | T004, T014 |
| REQ-03 / AC-04, AC-05, AC-06, AC-21 | P1 | T005, T015 |
| REQ-04 / AC-01, AC-07, AC-08 | P1 | T004 (AC-01 via T004's fixture setup), T008, T017 |
| REQ-05 / AC-09, AC-10 | P1 | T022–T025 (Phase 2) |
| REQ-06 / AC-11, AC-25, AC-26 | P1 | T007, T016 (derivation), T011–T020 (catalog); AC-11 covered by T008's authorize-first tests extended in T017 |
| REQ-07 / AC-12, AC-13 | P1/P2 | T026–T029 (Phase 3) |
| REQ-08 / AC-14 | P1 | T030–T035 (Phase 4) |
| REQ-09 / AC-15 | P1 | T004, T014 |
| REQ-10 / AC-16 | P1 | T036–T044 (Phase 5) |
| REQ-11 / AC-17, AC-18, AC-22, AC-23 | P1/P2 | T045–T047 (Phase 6) |
| REQ-12 / AC-19, AC-20 | P2 | T048–T051 (Phase 7) |
| REQ-13 / AC-24 | P2 | T009, T017, T037, T040, T041 |
| INV-01…INV-09 | — | T004–T020 (INV-01/02/03/04/05/07/08/09 all in Phase 1); INV-06 in T026–T028 (Phase 3) |
| EC-01…EC-11 | — | EC-01/EC-08/EC-10 folded into T005/T015 (resolver) or T053 (Polish, if gaps found); EC-02/03/04 → T010; EC-05/06 → T022/T023; EC-07 → T027; EC-09 → T018; EC-11 → T009 |
| errors.spec.md all 16 codes | — | Covered across T004, T008–T010, T017, T022–T028, T036–T041 (each error's producing task also asserts its route-layer mapping) |
| behavior.spec.md §1.1–§1.3, §2, §5, §6, §7 | — | §1.1/§1.2 → T005; §1.3 → T007/T016; §2.1 (listing order) → T045 (UI groups by namespace/key per this rule); §2.3 (sequential rename) → T022; §5 (dedup) → T004/T014 or T053; §6.1 (tie-break) → T005 or T053; §7 (edge cases) → distributed across T009/T010/T022/T023/T026/T027 |

---

## Deferred (ADR-backed, not a coverage gap)

- Deleting `src/features/presentation/*` and the `presentation_settings` table/schema entry — explicitly deferred to a follow-up feature per ADR-PIPE-007 Migration Safety "Point of No Return." Not tracked as a task here by design.
- `settings.write` removal from `BASE_CATALOG` — gated on verifying the T020 seed-time grant migration in production use; ADR-028 §7 treats this as a separate, later cleanup, not part of this feature's task list.
- OQ-01 (per-setting revision-history screen) — deferred per SPEC-007's resolved Open Questions; no task exists for it in this list by design.
