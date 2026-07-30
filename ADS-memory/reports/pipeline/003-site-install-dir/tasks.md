# Tasks: site-install-dir

- Spec: SPEC-003 v1.0.0 (hash: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142)
- ADR: ADR-PIPE-003 (v1.1.0)
- Outline: `ADS-memory/reports/pipeline/003-site-install-dir/implementation-outline.md`
- Critical Internal Constraints: `ADS-memory/reports/pipeline/003-site-install-dir/critical-internal-constraints.md` (U-001 Workspace-id single-source-of-truth, U-002 Schema guard comparison + atomic stamp write, U-003 Init commit-marker ordering + cleanup-on-failure, U-004 Install-dir path containment)
- Date: 2026-07-28T00:00:00Z
- Author: Coordinator (generated as a delegated action within this TDD dispatch, per this project's pipeline rule that tasks.md is normally Coordinator-produced after ADR approval and before TDD dispatch)

> Generated retroactively as part of the TDD dispatch prompt (tasks.md did not exist for this feature at dispatch time). Derived from `adr.md` (Decision, Module/Service Boundaries, Pattern Evaluation, Re-evaluation Triggers), `implementation-outline.md` (Module Map, File Map, Contract Map C-001…C-010, Wiring Map W-001…W-005, Critical Invariants, Downstream Handoff Notes), and `critical-internal-constraints.md` (Designated Units U-001…U-004).

---

## Constraints

### Coverage Profile

- Unit minimums: defaults `98/98/98/98` for lines/branches/functions/statements — **applied, no override**. `site-dir`'s selector/pure-mapping functions (`resolveWorkspace`, `runtimeSchemaVersion`+compare, `readSiteDir`, `readTemplate`) are pure/near-pure per ADR-PIPE-003's testability axis and fit the standard unit bar.
- Integration minimums: defaults `90/90/90/90` for lines/branches/functions/statements — **applied, no override**. This feature's real work (fs writes, db open/migrate, CLI process spawn) is integration-shaped per Constitution Article V ("P1 ACs are CLI/process-level or DB-boundary").
- E2E minimums: default `80/80/80/80` — **DEVIATION RECOMMENDED: N/A for this feature, not merely unmeasured.** Reasoning (recorded per dispatch instruction, not silently assumed):
  1. `ui.spec.md` is OMITTED from this feature's spec package (`spec-manifest.md` A-06) — there is no browser/UI surface. This repo's own E2E tooling (`package.json`'s `test:visual: playwright test`) is specifically browser/UI E2E; it has no applicability to a CLI/filesystem feature with zero rendered pages.
  2. The feature's own artifacts already classify every CLI-process-spawning test as **Integration**, not E2E: `feature.spec.md`'s Success Signal calls the init→serve→edit→restart round-trip "integration tests"; `implementation-outline.md`'s Contract Map Test Seam/Expectation column labels every `tovu init`/`tovu serve` process-spawn test "Integration"; `traceability.spec.md` has no E2E column at all.
  3. Constitution Article V (ADR-PIPE-003 Constitution Check) states P1 ACs are "CLI/process-level ... or DB-boundary" — both integration-tier by this project's own taxonomy, not a third E2E tier.
  - **Recommendation:** carry the full certification weight on Unit (98/98/98/98) + Integration (90/90/90/90); do not gate this feature's Code Review dispatch on an E2E coverage number that has no measurable surface. Coordinator/human owner should confirm this deviation; flagged explicitly rather than assumed away.
- Convergence threshold before Code Review: default `100%` of P1 acceptance tests and invariants passing — applied, no override. P1 items: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-13; INV-01…INV-06.
- **Contract Tests**: Derived from Implementation Outline Contract Map — C-001 (`CLI_INIT`), C-002 (`CLI_SERVE`), C-003 (`CLI_HELP`), C-004 (`readSiteDir`), C-005 (`resolveWorkspace`), C-006 (`runtimeSchemaVersion`+guard compare), C-007 (`initSite`), C-008 (`bootSiteDir`), C-009 (`readTemplate`), C-010 (`createSqliteRouteDeps`, changed signature — both its new `overrides` branch and its unchanged default branch).

### Required Suites

- Unit: required — `site-dir`'s pure selectors/mappers (C-004, C-005 read path, C-006 compare logic, C-009).
- Integration: required — CLI process spawns (C-001/C-002/C-003), fs+db orchestration (C-007/C-008), the `server/deps.ts` contract change (C-010), and the four Critical Internal Constraints' observable surfaces (U-001…U-004).
- E2E: not applicable — see Coverage Profile deviation above.

### Coverage Tool

- Tool: Node's built-in test runner with `--experimental-test-coverage` (this repo's existing convention — see `package.json`'s `test:cov` script; no new coverage tool introduced).
- Machine-readable output path: `coverage/lcov.info` (existing `test:cov` script output, unchanged).
- Cleanup paths before run: `coverage/` (existing script already does `rm -rf coverage && mkdir -p coverage`).
- Per-suite output paths: unit and integration tests share one lcov report (this repo does not split coverage output by suite type today — no override introduced by this feature); e2e: N/A.

### Performance

- Tool: N/A — ADR-PIPE-003's Quality Attribute Scorecard scores `scalability` 5/5 as "structurally inapplicable" (single local process, boot-once path); no NFR in `feature.spec.md`/`behavior.spec.md` names a latency/throughput budget.

---

## Phase 1 — Foundational (must land together, certified together)

**Goal:** The one shared contract point (`resolveWorkspace`) and the one changed brownfield signature (`createSqliteRouteDeps`) land as a single certified unit before anything else in this feature can build on either. Per `implementation-outline.md`'s Downstream Handoff Notes: "sequence `tasks.md` so the `server/deps.ts` change (C-010) and `site-dir/resolve-workspace.ts` (C-005) land in the same phase, before any `cli/` task that depends on `bootSiteDir` (C-008)." This phase also carries the highest blast-radius edit in the feature (touching all 15 internal `seededWorkspace.id` usage sites inside a ~500-line brownfield composition root) and is the sole home of CIC **U-001**.

- [ ] T001 [P] [C-005] Write failing unit tests for `resolveWorkspace` (0 rows / 1 row / >1 rows) — `src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts`
- [ ] T002 [P] [C-010, U-001] Write failing regression + contract tests for `createSqliteRouteDeps`'s additive `overrides` parameter (legacy default-path parity, new overrides-path honored, "supplied together or not at all" validation) — `src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts`
- [ ] T003 [C-005, REQ-06] Implement `resolveWorkspace(db)` — `src/site-dir/resolve-workspace.ts`
- [ ] T004 [C-010, U-001, REQ-06, REQ-10, AC-08, AC-13] Implement the additive `createSqliteRouteDeps(dbPath?, overrides?: {db, workspaceId})` signature, replacing all 15 internal `seededWorkspace.id` references with the one `resolveWorkspace`-resolved variable — `src/server/deps.ts` (depends on T003)
- [ ] T005 Run T001/T002 to convergence against T003/T004; the **existing, untouched** suites named in ADR-PIPE-003's Migration Safety table (`database-migration-reconciliation-boot.integration.test.ts`, `boot-lifecycle-real-deps.integration.test.ts`, `settings-principal-check.test.ts`, `settings-register-definitions-op-validation.test.ts`, `newsletter-routes.test.ts`) plus `src/index.ts`'s legacy call site must all stay green with **zero test-file edits** — this is U-001-B2's own verification surface, not a new test to author.

**Checkpoint**: Phase 1 complete — `resolveWorkspace` and the extended `createSqliteRouteDeps` are certified and merged before any Phase 2 task that imports either.

---

## Phase 2 — `[P]` parallel slices (all depend on Phase 1's C-005/C-010 landing; independent of each other except where noted)

**Goal:** Every remaining File Map entry, grouped by Module Map ownership. Per Downstream Handoff Notes: "`cli/` and `site-dir`'s other files (C-001/C-003/C-004/C-006/C-007/C-009) can otherwise proceed in parallel `[P]` slices once C-005/C-010 are certified." Sub-groups below note the few intra-Phase-2 ordering dependencies the Wiring Map (W-001…W-004) implies (e.g., `boot-site-dir.ts` needs `schema-guard.ts` + `read-site-dir.ts` first; `cli/commands/serve.ts` needs `boot-site-dir.ts` first) — these are internal to Phase 2, not a reason to defer the whole phase.

### 2a — `site-dir` data + read path (no intra-phase dependency)

- [ ] T006 [P] [C-009, REQ-02, AC-02] Write failing unit test: `readTemplate` output content-equal to `server/seed.ts`'s current seed output (byte-parity, incl. the SPEC-002 `about` page) — `src/site-dir/__tests__/unit/read-template.unit.test.ts`
- [ ] T007 [P] [C-004, EC-03] Write failing unit tests: `readSiteDir` against missing/corrupt/oversized (`>64 KiB`) `config.json`/`.site-meta.json` fixtures, and a valid-parse case — `src/site-dir/__tests__/unit/read-site-dir.unit.test.ts`
- [ ] T008 [P] [REQ-02] Implement `templates/starter/template.json` + `templates/starter/seed-content.json` (data files; content-equal to `server/seed.ts`) — `templates/starter/*.json`
- [ ] T009 [C-009] Implement `readTemplate(templateId)` — `src/site-dir/read-template.ts` (depends on T008; certifies against T006)
- [ ] T010 [C-004] Implement `readSiteDir(dir)` — `src/site-dir/read-site-dir.ts` (certifies against T007)

### 2b — `site-dir` schema guard (U-002, no intra-phase dependency beyond Phase 1)

- [ ] T011 [P] [C-006, U-002-B1, RT-005] Write failing unit tests: `runtimeSchemaVersion()` against the real `drizzle/meta/_journal.json`; guard-compare fixture pairs (older idx→migrate, equal-idx+matching-tag→compatible, equal-idx+divergent-tag→`SiteNewerThanRuntimeError`, newer idx→`SiteNewerThanRuntimeError`) — `src/site-dir/__tests__/unit/schema-guard.unit.test.ts`
- [ ] T012 [C-006] Implement `runtimeSchemaVersion()` + guard compare — `src/site-dir/schema-guard.ts`

### 2c — `site-dir` orchestration (`initSite`, U-003, U-004 half)

- [ ] T013 [P] [C-007, U-003, U-004, INV-01, INV-02, AC-01, AC-03, AC-04, AC-14, EC-01, EC-02, EC-06, EC-10, RT-003] Write failing integration tests: happy-path layout/config/meta (AC-01/AC-14), non-empty-dir and file-at-path rejection (AC-04/EC-01/EC-02), empty `--name` rejection (EC-06), commit-marker-last + full-cleanup fault injection (AC-03/EC-10/RT-003), path-containment (INV-01/U-004) — `src/site-dir/__tests__/integration/init-site.integration.test.ts`, `src/site-dir/__tests__/integration/path-containment.integration.test.ts`
- [ ] T014 [C-007] Implement `initSite(...)` — `src/site-dir/init-site.ts` (depends on T009, T010; certifies against T013)

### 2d — `site-dir` orchestration (`bootSiteDir`, U-002 remainder, U-004 half)

- [ ] T015 [P] [C-008, U-002-B2, U-002-B3, U-002-ORD1, U-002-ORD2, INV-04, INV-05, AC-06, AC-07, AC-08, AC-09, EC-05, EC-07, EC-09, REQ-08, AC-10] Write failing integration tests: full BR-05 validation chain, atomic stamp write + fault injection between `migrate()` and the stamp write (U-002-B2/ORD1/ORD2), round-trip re-serve after migration (INV-05/AC-07), zero/multiple-workspace-row `SITE_CORRUPT` (AC-09), locked-db (EC-05), unknown-`templateId` warn-and-proceed (EC-07), moved/renamed install dir portability (REQ-08/AC-10) — `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts`, `src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts`
- [ ] T016 [C-008] Implement `bootSiteDir(...)` — `src/site-dir/boot-site-dir.ts` (depends on T010, T012, and Phase 1's T003; certifies against T015)

### 2e — `cli` (depends on `commander` being added; `program.ts`/`errors.ts` before `main.ts`/commands; `commands/serve.ts` depends on 2d's `bootSiteDir`)

- [ ] T017 [P] [C-001, C-003, REQ-09, AC-12] Write failing integration tests: `tovu init` process spawn (AC-01 stdout contract, AC-03/AC-04 exit codes), `tovu --help` / no-args / unknown-command (`CLI_HELP`, AC-12) — `src/cli/__tests__/integration/init-command.integration.test.ts`, `src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts`
- [ ] T018 [P] [C-002, BR-02, BR-03, BR-04, BR-07, AC-05, AC-06, AC-07, AC-08, AC-09, AC-11, EC-04, EC-08] Write failing integration tests: `tovu serve` process spawn + HTTP round-trip, port/name precedence (BR-02/BR-03/AC-11), dir-argument-overrides-legacy-env (EC-08/BR-04), graceful shutdown (BR-07), `PORT_IN_USE` (EC-04) — `src/cli/__tests__/integration/serve-command.integration.test.ts`
- [ ] T019 **[NOTE for Coordinator/Programmer, not a TDD task]** Add `"commander": "^15.0.0"` to `package.json` dependencies (ADR-PIPE-003 v1.1.0) before implementing T020.
- [ ] T020 [C-001, C-002, C-003] Implement `src/cli/program.ts`, `src/cli/errors.ts`, `src/cli/help.ts`, `src/cli/main.ts`, `src/cli/commands/init.ts`, `src/cli/commands/serve.ts` (depends on T014, T016, T019; certifies against T017/T018)

**Checkpoint**: Phase 2 complete — every Contract Map entry (C-001…C-010) certified; every Critical Invariant (INV-01…INV-06) and Designated Unit (U-001…U-004) has dedicated observable coverage or a recorded audit-only/gap note.

---

## Phase 3 — Polish

- [ ] T021 [P] Extend `.dependency-cruiser.cjs` with `site-dir-no-server-express-or-cli-imports` and `cli-no-direct-drizzle-imports` (ADR-PIPE-003 Enforcement) — architectural, not a TDD-authored runtime test (INV-06's own Test Expectation is "Architectural: zero imports," not a Node test).
- [ ] T022 [P] Code Review Agent: grep-verify U-001-B1 (zero remaining `seededWorkspace.id` references inside `createSqliteRouteDeps`'s body outside the one `resolveWorkspace` call) — audit-only per CIC, not a TDD assertion.
- [ ] T023 Governance ADR Promotion follow-up (deferred in ADR-PIPE-003, action recorded there): promote the `commander`-as-shared-program-source-of-truth rule to `ADR-INDEX.md` before SPEC-005 Software Architect dispatch begins.

---

## Parallelization Rules

- Tasks marked `[P]` in the same phase/sub-group can be dispatched simultaneously — they touch different files with no shared mutable state.
- No Phase 2 task may begin implementation before Phase 1 (T001–T005) is certified and green — every Phase 2 module either imports `resolveWorkspace` directly (2b/2d) or transitively depends on modules that do (2c/2e via 2d).
- Within Phase 2, respect the noted intra-phase orders (2c depends on 2a; 2d depends on 2a+2b+Phase1; 2e depends on 2c+2d+T019) even though the phase as a whole is `[P]` relative to other Phase-2 sub-groups' non-overlapping files.

## Execution Strategy

**Sequential (single agent, this TDD pass):** Phase 1 tests (T001/T002) → Phase 2 tests (T006/T007/T011/T013/T015/T017/T018), certified as failing/non-compiling against not-yet-implemented `cli/`/`site-dir`/`server/deps.ts` changes → Programmer dispatch implements T003/T004/T008–T010/T012/T014/T016/T019/T020 against this certified suite → TestRunner → Phase 3.

**Checkpoint**: Human/Coordinator reviews the certified test suite (this document's companion `test-certification.md`) before Programmer dispatch.
