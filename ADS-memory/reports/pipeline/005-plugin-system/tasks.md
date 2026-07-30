# Tasks: plugin-system

- Spec: SPEC-005 v1.1.1 (hash: sha256:057bcf45540398391aa7ac4b96a451bf1f8ee256ebcc75e8335f7ab53f29d479)
- ADR: ADR-005-ARCH (`reports/pipeline/005-plugin-system/adr.md`) — Microkernel/Hexagonal, in-process Tier-3 (ADR-024). Human-approved 2026-07-28.
- Outline: `reports/pipeline/005-plugin-system/implementation-outline.md` (Status: PRODUCED)
- Critical Internal Constraints: `reports/pipeline/005-plugin-system/critical-internal-constraints.md` (Status: PRODUCED — 5 units: U-001, U-002, U-003, U-005 ESCALATE_SECURITY; U-004 not escalation-marked)
- Date: 2026-07-28T21:03:41Z
- Author: Coordinator (generated as Coordinator-delegated work by TDD this dispatch, mirroring the SPEC-003 precedent this session — `tasks.md` did not exist before this pass)

## Format

`[ID] [P?] [Story ref] Description`

- **[P]**: Task can run in parallel — touches different files, no shared mutable state with other [P] tasks in the same phase
- **[Story ref]**: Maps to an acceptance criterion, invariant, or Unit ID (e.g., AC-01, INV-01, U-001)
- Every task references exact file paths, per the Implementation Outline's Module/File Map
- Derived from the ADR's own "Downstream Handoff Notes" Parallel Delivery framing plus the UI amendment's independent scope (REQ-12..17)
- Tasks touching CIC-designated units reference their Unit IDs (U-001…U-005) so TDD and Programmer load the Binding constraints before touching those files
- Task checkboxes are Coordinator-owned state. Implementation, TDD, TestRunner, and Code Review agents must treat this file as read-only unless the Coordinator explicitly delegates a task-list update.

---

## Constraints

### Coverage Profile

- Unit minimums: `98/98/98/98` (project default — **not loosened**; this feature is security-sensitive: in-process code loading, capability model, integrity verification. No human override requested or granted.)
- Integration minimums: `90/90/90/90` (project default, not loosened)
- E2E minimums: `80/80/80/80` for any suite actually run under a Playwright/E2E runner; **not applicable to the Plugins admin screen specifically** — see Required Suites below for the documented reason
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and invariants passing
- **Contract Tests** (from Implementation Outline's Contract Map): `PluginActivationRepoPort` (C-013, both adapters against one shared suite, mirrors `PresentationSettingsRepoPort`'s contract-test shape); `@tovu/sdk` public-API snapshot test (C-001…C-004, REQ-08/AC-10); `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract (C-016, api.spec.md §5/§6)

### Required Suites

- Unit: required — manifest validation, capability-SDK construction, DTO mapping, word-count tokenization, SDK public surface
- Integration: required — load pipeline, discovery, hook composition/fail-closed atomicity, activation/gateway, repo contract (both adapters), boot-time resolver hook, HTTP routes, post.ts hook-wiring regression seam, revert-path (CIC U-005)
- E2E (Playwright): **not applicable this slice** — no prior admin list/toggle screen in this codebase (`Roles.tsx`, `Redirects.tsx`) has a dedicated Playwright suite; this amendment does not introduce a new testing convention. RTL-based component/interaction tests (render, interaction, a11y, state/prop edge cases per the React Component Testing Policy) substitute for AC-18…25/EC-11, consistent with `test-design/SKILL.md`'s module-class table (View/UI components: `70%+ line OR documented E2E coverage` — satisfied here via RTL, documented, not silently skipped)

### Coverage Tool

- Tool: Node's built-in `--experimental-test-coverage` (already wired via `npm run test:cov`) for `src/**` and `packages/sdk/src/**`; `@vitest/coverage-v8` (new devDependency, added this pass — see Phase 0) for `apps/admin/src/**` RTL suites, since `apps/admin` has no coverage tooling today
- Machine-readable output path: `coverage/lcov.info` (backend, existing convention); `apps/admin/coverage/lcov.info` (new, admin package)
- Cleanup paths before run: `coverage/`, `apps/admin/coverage/`
- Per-suite output paths: unit — same `lcov.info` (Node's runner does not separate by suite type natively; TestRunner filters by file path glob), integration — same, e2e — N/A this slice

### Performance

- Tool: N/A — no numeric NFR budget exists anywhere in SPEC-005 for hook-composition latency (ADR `scalability` axis, score 3, explicitly names this as an open gap, not an oversight). No performance test is certified this pass. Tracked as a Coverage Gap (see test-certification.md) and as an ADR Mitigation (owner: Software Architect/TDD, trigger: OQ-03 second-hook-point kickoff or any latency complaint).

---

## Phase 0 — Setup

Project initialization and tooling. No story dependencies.

- [ ] T001 [P] Create `packages/sdk/` directory skeleton (`package.json`, `src/index.ts`, `tsconfig.json`) — TDD has already written the certified stub + snapshot test this pass (`packages/sdk/src/index.ts`, `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts`); Programmer fills the stub in, does not restructure it
- [ ] T002 [P] Add `"workspaces": ["packages/*"]` and `"engines": {"node": ">=20.6.0"}` to root `package.json` — Programmer must smoke-test `npm --prefix apps/admin install` / `admin:build` still work unchanged afterward (ADR Consequences/Risks)
- [ ] T003 [P] Create `src/features/plugin-runtime/` directory skeleton mirroring `src/features/post/` (`__tests__/`, `__specs__/`) — TDD has already written certified stubs + tests this pass for every C-005…C-013 contract
- [ ] T004 [P] `apps/admin` test harness: TDD has already added `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitest/coverage-v8` as devDependencies + `vitest.config.ts` + a `test` script this pass (first-ever test infra for `apps/admin` — pre-existing gap, not introduced by this feature). Programmer/TestRunner run `npm --prefix apps/admin install` before executing the new RTL suite.

**Checkpoint**: Setup complete — story phases can now begin in parallel per the ADR's own parallelization note.

---

## Phase 1 — Foundational / Parallel Track (independently sliceable per ADR)

The ADR's Downstream Handoff Notes state explicitly: "`packages/sdk` (C-001…004) and `plugin-runtime`'s manifest/discovery/loader/capability-sdk/hook-registry core (C-005…010) can be built in parallel with the DB migration (`schema.ts`) and the HTTP routes (C-016/017), since all three depend only on the contracts fixed in [the implementation outline], not on each other's internals." The UI screen (REQ-12..17) additionally depends only on the already-approved `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract shape (api.spec.md §5, unchanged since v1.0.0), not on the backend's actual implementation — so it can also proceed in parallel, exercised against the certified test suite's fixtures/mocks until the real routes exist.

### Track A — `@tovu/sdk` package [P]

- [ ] T005 [A] Implement `packages/sdk/src/index.ts` against `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` (C-001 `definePlugin`, C-002 types, C-003 hook-point constant, C-004 capability tokens) — REQ-08, AC-10
- [ ] T006 [A] Implement `packages/sdk/package.json`'s `exports` map to block deep imports (ADR-005 rule 1) — AC-10's "deep import fails to resolve" clause

### Track B — `plugin-runtime` core (manifest/discovery/loader/capability-sdk/hook-registry) [P]

- [ ] T007 [B] Implement `src/features/plugin-runtime/manifest.ts` (`validateManifest`, C-006) against `__tests__/unit/manifest.unit.test.ts` — REQ-01, BR-02/BR-03, AC-07/AC-08/AC-12, EC-01/EC-04/EC-05
- [ ] T008 [B] Implement `src/features/plugin-runtime/discovery.ts` (`discoverPlugins`, C-007) against `__tests__/integration/discovery.integration.test.ts` — REQ-02/REQ-03, AC-09, EC-08/EC-09, TB-01, DUP-01 (depends on T007)
- [ ] T009 [B] [U-001] Implement `src/features/plugin-runtime/loader.ts` (`loadPlugin`, C-008) against `__tests__/integration/loader.integration.test.ts` — **CIC U-001 (verify-before-import ordering, ESCALATE_SECURITY)**: integrity → sdkRange → import, in that exact order, no reordering for convenience (depends on T007)
- [ ] T010 [B] [U-003] Implement `src/features/plugin-runtime/capability-sdk.ts` (`buildCapabilityScopedSdk`, C-009) against `__tests__/unit/capability-sdk.unit.test.ts` — **CIC U-003 (stub-vs-absent for ungranted surfaces, ESCALATE_SECURITY)**: every ungranted surface throws typed `CAPABILITY_DENIED`, never an absent property
- [ ] T011 [B] [U-004] Implement `src/features/plugin-runtime/hook-registry.ts` (`runBeforeSave`, C-010, implements `BeforeSaveHookPort`) against `__tests__/integration/hook-registry.integration.test.ts` — **CIC U-004 (fail-closed atomicity, no escalation marker)**: TB-01 composition order, BR-06 ext validation, BR-07 fail-closed (depends on T010)
- [ ] T012 [B] Implement `src/features/plugin-runtime/activation.ts` (`setPluginEnabled`/`getActivation`, C-011/C-012) + `repo.memory.ts`/`repo.sqlite.ts` (C-013, `PluginActivationRepoPort`, rule-of-two) against `__tests__/integration/activation.integration.test.ts` + `__tests__/integration/repo.contract.test.ts` — REQ-07, BR-05, AC-02/AC-13, INV-03/INV-05 (depends on T008, T009)

### Track C — DB migration [P]

- [ ] T013 [C] Add `posts.ext` column (additive, `NOT NULL DEFAULT '{}'`) + `pluginActivations` table to `src/infra/db/schema.ts`; run `drizzle-kit generate` — state.spec.md §7. No TDD-owned test file changes existing schema.ts directly; `repo.contract.test.ts` (T012) exercises the generated migration via `SqliteWidgetRegionBindingRepo`-equivalent adapter.

### Track D — HTTP routes [P]

- [ ] T014 [D] Implement `src/server/routes/admin/plugins/list.ts` + `set-enabled.ts` (C-016) + `src/server/http/admin/plugins.ts` (`toAdminPluginResponse`, C-017) against `__tests__/integration/plugins-http.integration.test.ts` + `__tests__/unit/plugins-dto.unit.test.ts` — REQ-10, AC-11 (depends on T008, T012)

### Track E — Boot-time SDK resolution hook [P]

- [ ] T015 [E] [U-002] Implement `src/server/boot/plugin-sdk-resolver.ts` (`registerPluginSdkResolver`, C-015) against `__tests__/integration/plugin-sdk-resolver.integration.test.ts` — **CIC U-002 (registration-before-reachability, ESCALATE_SECURITY)**: registered exactly once, synchronously, before any route/plugin-import path is reachable (depends on T005)
- [ ] T016 [E] Wire `registerPluginSdkResolver()` into `src/index.ts`'s boot sequence, before route registration (W-001) — depends on T015

### Track F — Admin UI screen [P] (depends only on the fixed `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` contract shape, not on Tracks A–E landing first)

- [ ] T017 [F] Implement `apps/admin/src/sections/Plugins.tsx` against `apps/admin/src/sections/__tests__/Plugins.test.tsx` — REQ-12/13/14/15/16, AC-18…24, EC-11
- [ ] T018 [F] Add `api.listPlugins()` / `api.setPluginEnabled()` to `apps/admin/src/lib/api.ts` (client wrapper functions, mirrors every existing `api.*` function's shape) — consumed by T017

**Checkpoint**: Tracks A–F pass their certified suites independently — each is independently testable per the ADR's parallelization note.

---

## Phase 2 — `word-count` built-in (sequential — depends on Phase 1 Track B in full)

- [x] T019 [AC-01, AC-16] Implement `src/features/plugin-runtime/built-ins/word-count/index.ts` against `__tests__/unit/word-count.unit.test.ts` — REQ-09's pinned tokenization algorithm (RT-005: depth-first text-node concatenation, single-space join, trim, split on `/\s+/`, count non-empty tokens); discovered via the same validator/loader path as a site plugin, integrity trivially satisfied (compiled-in, not tampered) (depends on T007, T008, T009, T010, T011) — shipped `ca7a85d`

**Checkpoint**: `word-count` is discoverable, loadable, and its filter is unit-certified — ready for the Phase 3 end-to-end wiring.

---

## Phase 3 — `post.ts` integration + revert-path fix (gated — own phase, brownfield/regression-sensitive)

Per the ADR's own Downstream Handoff Notes: "The `post.ts` integration (C-014, W-003) and the revert-path fix (W-005) should be sequenced as their own phase, gated by TDD certifying CIC U-004/U-005 first, given their brownfield/regression sensitivity." **TDD has certified both this pass** (`hook-registry.integration.test.ts` for U-004, `revert-plugin-ext.integration.test.ts` for U-005) — this phase is now unblocked for Programmer, but must not start before Phase 1 Track B/Phase 2 land (it depends on `runBeforeSave`/`word-count` existing to exercise end-to-end).

- [x] T020 [U-004] [AC-01, AC-05, EC-10] Add optional `beforeSaveHook?: BeforeSaveHookPort` to `CreatePostDeps`/`UpdatePostDeps` and `ext?: JsonObject` to `PostRecord` in `src/features/post/post.ts`; call `runBeforeSave()` (or no-op default) immediately before the single `deps.repo.save()` call in both `createPost`/`updatePost` — **must satisfy CIC U-004-B1/F1**: exactly one `repo.save()` call, never invoked if the hook throws. Existing `post.test.ts`/`post.transition-events.test.ts` fixtures must keep passing unmodified (regression seam) — depends on Phase 1 Track B (T011), Phase 2 (T019) — shipped `ca7a85d`, confirmed unmodified fixtures still pass (re-verified locally 2026-07-30, 35/35 green)
- [x] T021 Persist/read `ext` in `src/features/post/repo.memory.ts` / `repo.sqlite.ts` (JSON column, mirrors `bodyJson` handling) — depends on T013, T020 — shipped `ca7a85d`
- [x] T022 [AC-11, AC-14] Additive `ext` exposure on `src/server/http/admin/posts.ts`'s `toAdminPostResponse()` — REQ-11 (depends on T020) — shipped `ca7a85d` (as `src/server/http/shared/post.ts`)
- [x] T023 [U-005] [BR-08, AC-17] Fix `src/core/commands/appliers.ts`'s `postUpdateReverter.applyInverse` to call `deps.postRepo.save()` **directly** with the reconstructed pre-image (never `updatePost`/`createPost`) — **must satisfy CIC U-005-B1/SM2 (ESCALATE_SECURITY on the SM2 transition)**: the revert path must never re-fire `content.entry.beforeSave`, and must still restore verbatim even when the contributing plugin is since disabled/uninstalled. **TDD finding, load-bearing**: the CURRENT `postUpdateReverter.applyInverse` already calls `updatePost()` directly (`src/core/commands/appliers.ts` lines 80-90, pre-existing code) — this is exactly the illegal transition CIC U-005 names, and it is only "accidentally" safe today because `updatePost`'s current deps object literal never threads a `beforeSaveHook` through. Once T020 wires the hook into `updatePost`, this reverter becomes live-broken unless explicitly fixed. `src/features/post/repo.sqlite.ts`'s `captureInverse` equivalent in `src/server/routes/admin/posts/update.ts` must also snapshot pre-edit `ext` (BR-08) — depends on T020, T021 — **shipped `ca7a85d`, ESCALATE_SECURITY fix confirmed applied via `git show`, ext never re-fires the hook on revert**
- [x] T024 Update `src/server/routes/admin/posts/update.ts`'s `captureInverse` closure to snapshot pre-edit `ext` alongside `title`/`slug`/`bodyJson`/`status` — depends on T023 — shipped `ca7a85d`

**Checkpoint**: AC-01/AC-02/AC-13/AC-17 (word-count enable → save → `ext` written → disable/revert → data retained/restored) pass end to end — the ADR's own "concrete, spec-certified post-cutover proof." **CONFIRMED closed 2026-07-30 (`ca7a85d`).**

---

## Phase 4 — Nav/routing wiring + polish

- [x] T025 [AC-25] Restore `href: "#/section/plugins"` and drop `soon: true` on `apps/admin/src/nav.ts`'s `plugins` `NavItem`; **also replace the stale comment** citing SPEC-045 as "BLOCKED pending an owner decision" (RT-008 — that decision (Option A) is now made and is exactly what this amendment implements; leaving the comment verbatim would ship an actively false statement) — depends on T017 — **was already shipped pre-`ca7a85d`, checkbox was stale (confirmed via `ca7a85d`'s own commit message)**
- [x] T026 [AC-25] Add `route.sectionId === "plugins" ? <Plugins /> : …` branch to `apps/admin/src/App.tsx`'s `case "section":` dispatch, alongside the existing `"roles"`/`"redirects"` branches — depends on T017, T025 — **was already shipped pre-`ca7a85d`, checkbox was stale (confirmed via `ca7a85d`'s own commit message)**
- [x] T027 [P] Add a `.dependency-cruiser.cjs` (`check:boundaries`) rule restricting `module.register()`/plugin-loading-internals access to `src/features/plugin-runtime/**` only (ADR Enforcement section) — shipped `ca7a85d`
- [x] T028 [P] Code Review pass: confirm no new doc/UI copy describes capability enforcement as a "sandbox"/"isolated"/"safe" without the ADR-024 Tier-3 caveat (ADR security-axis mitigation) — audited in `ca7a85d`, none found

**Checkpoint**: Human/TestRunner review before Code Review dispatch.

---

## Parallelization Rules

- Tasks marked with the same track letter `[A]`…`[F]` in Phase 1 can be dispatched simultaneously — each track's files are disjoint (see Implementation Outline File Map)
- No Programmer instance writes to a file another instance reads uncommitted
- Phase 2/3/4 are sequential relative to their stated dependencies — do not start Phase 3 before Phase 1 Track B + Phase 2 land; do not start Phase 4's `App.tsx`/`nav.ts` edits before T017 lands
- If a shared utility needs changes (e.g. `src/core/ports.ts`), serialize — do not parallelize writes to shared code

## Execution Strategies

**Sequential (single agent):** Phase 0 → Phase 1 (A→F in any order) → Phase 2 → Phase 3 → Phase 4

**Parallel (multiple Programmer instances):** Phase 0 → Phase 1 Tracks A/B/C/D/E/F simultaneously → checkpoint → Phase 2 → Phase 3 (sequential, regression-sensitive) → Phase 4

---

## CIC Deviation/Closeout Reminder (carried from the companion artifact)

Before final Programmer handoff on this feature, each of the 5 Binding-constraint units above (U-001…U-005) must be confirmed-still-applies, `[CIC_DEVIATION]`-recorded, or reclassification-requested. `U-001`, `U-002`, `U-003`, and the `U-005` SM2 transition are `ESCALATE_SECURITY` — any deviation from those specifically requires a Coordinator/Software-Architect-approved `[CIC_DEVIATION_APPROVED]` entry **before** implementation, not after.

## Non-Blocking Housekeeping Carried From Red-Team (RT-008, RT-011 — Programmer-level, not TDD's concern)

- RT-008: see T025 above (nav.ts stale-comment replacement folded into the task Red-Team named it against).
- RT-011: `errors[].file` is silently dropped from the per-row error display in `ui.spec.md` with no disclosed reason. Not a blocking gap (Red-Team: ADVISORY, ui.spec.md itself does not require it) — noted here for Programmer/owner awareness only; no task created since the spec does not require the field to render and TDD does not invent scope beyond REQ-16/AC-24 as written.
