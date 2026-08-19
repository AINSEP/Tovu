# Feature Spec: esm-migration

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-049 |
| version | 1.1.0 |
| status | APPROVED |
| content_hash | sha256:af12b9f5cc28ea909a62730ed39d59d18897bc5d25de4822aa8dee7f44016fab |
| feature_name | FEAT-049-esm-migration |
| last_edited | 2026-08-18T04:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | migration |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

**Revision note (v1.0.0 → v1.1.0):** Both blocking `[NEEDS CLARIFICATION]` markers are resolved by human decision. REQ-08: deploy Node runtime bumps to 24 as Phase 0, before Wave 1 (Option A). REQ-10: `packages/*` is in scope; its sole member `packages/sdk` (`@tovu/sdk`) is already `"type": "module"` with zero outward `#src/`-internal dependencies, so it is treated as pre-migrated — a no-op for this migration's conversion work. `status` is now `APPROVED`. Per the Coordinator's explicit instruction, this spec is handoff-ready but pipeline dispatch (Red-Team / Software Architect) is intentionally held — see this run's report for details.

---

## Overview

This spec covers migrating the Tovu repository's module system from CommonJS (root `package.json` `"type": "commonjs"`) to native ES Modules, executed as a strictly bottom-up sequence of small, independently verifiable, revertible waves rather than a single repo-wide cutover. It serves developers authoring code in this repo and the CI/build/deploy pipeline that must keep passing throughout. The outcome is eliminating the CJS-interop shim's fixed dead-coverage cost per file and removing a structural blocker to future ESM-only dependencies, with zero change to any route, API response, or user-visible output.

---

## Problem Statement

**Current state:** Root `package.json` declares `"type": "commonjs"`. Every compiled module boundary carries esbuild's CJS-interop shim (`__copyProps`/`__toCommonJS`/`__export`), which a prior session measured at exactly 2 permanently-dead coverage branches per file (confirmed on 6 files). The repo has 990 `#src/...` cross-module import specifiers; 347 (35%) target a barrel `index.ts`. Of 67 barrels containing re-exports, 37 are pure re-export files. This barrel-heavy shape produces a specific, confirmed failure mode when a file is converted to ESM ahead of a barrel it imports by name from (see `behavior.spec.md` §2 and §7).

**Desired state:** The repo runs as native ESM within the migrated scope. Migrated files carry no CJS-interop shim and therefore no shim-induced dead coverage branches. Migration proceeds wave by wave, each wave bottom-up by the real dependency graph, each wave independently verifiable and revertible, so that the blast radius of any single change stays small.

**Why now:** No external deadline. CodeBase Analyzer (`MIGRATION-esm-2026-08-18.md`) quantified the CJS shim's fixed per-file coverage cost and produced a viable, evidence-grounded wave plan with a verified, already-test-covered wave-1 candidate already sitting in the repo. This is a technical-debt / tooling-quality initiative, not a launch blocker.

**Success signal:** A wave is complete when: (a) every file in that wave's member set executes as native ESM with no `__toCommonJS`/`__copyProps`/`__export` helper present in its build output, (b) the full existing test suite for that wave's changed and transitively-dependent files passes with zero regressions, and (c) `check:boundaries` and `check:architecture` report zero new errors/cycles attributable to that wave.

---

## User Journey

**Trigger:** A developer (or the Coordinator, on the developer's behalf) selects the next candidate wave — starting with Wave 1, the verified 24-file leaf set.

**Steps:**
1. Confirm every file in the candidate wave has zero outward `#src/`-internal dependencies on any still-CommonJS module — i.e., every internal import target is either external (npm) or already migrated to ESM in a previously merged wave (REQ-01).
2. Convert the wave's files: set the module type to ESM for that wave's scope, rewrite every relative import specifier to include an explicit file extension, replace any `require`/`module.exports`/`__dirname`/`__filename` usage with its ESM equivalent.
3. Run the wave's verification gate: typecheck, the existing test suite for changed and transitively-dependent files, `check:boundaries`, `check:architecture`, and a boot/smoke check of affected entry points (REQ-05).
4. If the gate passes, merge the wave as a single atomic, revertible unit; mark its files migrated.
5. If the gate fails, fix forward within the same wave or revert the wave atomically — a partially-converted wave never merges (REQ-04).

**Outcome:** The wave's files run as native ESM. Any subsequent wave whose files depend on this wave's output may now satisfy its own REQ-01 precondition.

**Alternate paths:** Gate failure → atomic revert, not a partial merge. A file whose `#src/`-internal dependencies are not all already migrated is excluded from the candidate wave, not force-included (this is what the `delete.ts` experiment referenced in `MIGRATION-esm-2026-08-18.md` §2 hit when wave ordering wasn't bottom-up).

---

## Scope

**In scope:**
- Migrating `src/**` (all modules) from CommonJS to native ESM, executed in strictly bottom-up dependency-ordered waves (REQ-01).
- Wave 1: the verified 24-file zero-outward-dependency leaf set — `origin` (5 files), `http` (5 files), `headless` (2 files), `features/agent-plugins` (6 files), `features/site-glue` (6 files) (REQ-02).
- Resolving the `core` module's dependency-tool-vs-grep discrepancy (`check:architecture` reports Ce=0; direct grep shows real imports of `#src/db/*`, `#src/features/post/index`, `#src/widgets/*`) as a blocking pre-wave-1 task before `core` may be included in any wave (REQ-03).
- Defining the wave-membership rule, the per-wave verification gate, and the atomic merge/revert unit that governs every wave under this spec (REQ-01, REQ-04, REQ-05).
- The requirement that migrated and not-yet-migrated code coexist with zero observable behavior change throughout the migration period (REQ-06); the specific mechanism (e.g., nested `package.json` overrides vs. extension-based opt-in) is an architecture decision, deferred to Software Architect ADR.
- Explicit-extension rewriting of relative imports in every migrated file (REQ-07, an unavoidable mechanical consequence of native ESM resolution).
- Phase 0: bumping the deploy Node runtime to 24 (`engines.node`, Dockerfile `NODE_VERSION`) before Wave 1, and root `package.json` `"type"` field's end-state transition (REQ-08).
- `packages/*` workspace package scope: in scope. Its sole member, `packages/sdk` (`@tovu/sdk`), is already `"type": "module"` and has zero outward `#src/`-internal dependencies, so it is treated as pre-migrated — no conversion work required, but its already-ESM status is a precondition several `src/` consumers can rely on (REQ-10).

**Out of scope:**
- `apps/admin/**` — owned by a different, concurrently-live session; excluded from every wave under this spec (REQ-09). Will need its own future migration pass; not designed here.
- `src/themes/static/**` and `src/features/theme/**` — same reason and same exclusion (REQ-09).
- Any change to the observable behavior of any route, API response, or user-visible output (REQ-06) — this is a pure module-system migration.
- Big-bang, single-PR conversion of all ~1270 non-test `.ts` files — evaluated and rejected in `MIGRATION-esm-2026-08-18.md` §3–4 in favor of bottom-up waves.
- Individual recompilation/verification of all 347 barrel-mediated imports before Wave 1 starts — the failure-mode inventory in `MIGRATION-esm-2026-08-18.md` §2 is a verified structural proxy (Medium confidence for full generalization), not an exhaustive per-import check; each wave's own verification gate (REQ-05) is what actually proves that wave safe, not the proxy.

---

## Requirements

- REQ-01: A file may be included in a migration wave's member set only if every one of its `#src/`-internal import targets is either an external (npm) dependency or a file already migrated to ESM in a previously merged wave.
- REQ-02: Wave 1's member set consists exactly of the verified 24-file leaf set: `origin` (5 files), `http` (5 files), `headless` (2 files), `features/agent-plugins` (6 files), `features/site-glue` (6 files), per `MIGRATION-esm-2026-08-18.md` §1. No other files may be added to Wave 1.
- REQ-03: The `core` module must not be included in any wave until the discrepancy between `check:architecture`'s reported Ce=0 for `core` and the real imports of `#src/db/*`, `#src/features/post/index`, and `#src/widgets/*` confirmed by direct grep (`MIGRATION-esm-2026-08-18.md` §1) is investigated, its root cause documented, and `core`'s true outward dependency set established.
- REQ-04: Each wave must be merged and, if necessary, reverted as a single atomic unit. No wave may merge in a state where some of its member files are ESM and others are still CommonJS.
- REQ-05: Before a wave merges, its verification gate must report: zero typecheck errors, zero regressions among previously-passing tests for that wave's changed and transitively-dependent files, zero new `check:boundaries` errors attributable to the wave, zero new module cycles reported by `check:architecture` attributable to the wave, and a successful boot/smoke check of the wave's affected entry points.
- REQ-06: No wave may change the observable behavior of any route, API response, or user-visible output relative to its pre-wave behavior.
- REQ-07: Every relative import specifier in a file migrated by any wave must include an explicit file extension.
- REQ-08: Phase 0 of this migration bumps the deploy Node runtime to Node 24 before Wave 1 begins: root `package.json` `engines.node` is raised from `>=20.6.0` to a Node-24-or-higher floor, and the Dockerfile's `ARG NODE_VERSION` is raised from `22` to `24`. Phase 0 must land and be verified (image builds, boots, and the existing test suite passes on Node 24) before any wave merges. Once Phase 0 is verified, a still-CommonJS file `require()`-ing an already-migrated ESM file is safe under Node 24's stable synchronous `require(esm)`, and the bottom-up wave plan's safety argument for that direction holds without further per-wave gating on this specific boundary.
- REQ-09: No wave under this spec may add, modify, or convert any file under `apps/admin/**`, `src/themes/static/**`, or `src/features/theme/**`.
- REQ-10: `packages/*` is in scope for this migration. This repo's `packages/*` contains exactly one package, `packages/sdk` (`@tovu/sdk`): 2 TypeScript files (`src/index.ts`, `src/__tests__/unit/sdk-public-api.unit.test.ts`), already declared `"type": "module"` (already native ESM), with a one-way dependency direction confirmed by direct grep — multiple files in `src/` import from `@tovu/sdk`, and nothing inside `packages/sdk` imports from `src/` or `apps/`. Because `packages/sdk` is already ESM and has zero outward `#src/`-internal dependencies, it satisfies Wave 1's eligibility rule (REQ-01) on inspection and requires no conversion work — it is treated as pre-migrated. No wave may claim credit for converting `packages/sdk`; a wave may only reference it as an already-satisfied dependency for files that import from it.
- REQ-11: A barrel `index.ts` file may not itself be converted to ESM until 100% of the names it re-exports are defined in, or transitively re-exported only from, already-migrated files. A barrel with any still-unmigrated re-export target remains CommonJS.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a candidate wave's proposed file set, when every `#src/`-internal import target across that set is verified (by direct grep, not tool output alone — see AC-04) to be either external or already-migrated ESM, then the wave is eligible for conversion.
- AC-02 (REQ-01) [P1]: Given a candidate wave's proposed file set, when at least one file's `#src/`-internal import target is still CommonJS and not part of the same wave, then that file is excluded from the wave.
- AC-03 (REQ-02) [P1]: Given the repo's current dependency graph state, when Wave 1 executes, then it converts exactly these 24 files and no others: the 5 `origin` files, 5 `http` files, 2 `headless` files, 6 `features/agent-plugins` files, and 6 `features/site-glue` files named in `MIGRATION-esm-2026-08-18.md` §1.
- AC-04 (REQ-03) [P1]: Given the `core` module's Ce=0 (tool)-vs-real-import (grep) discrepancy is unresolved, when any wave is proposed, then `core` is absent from that wave's member set, regardless of what `check:architecture` reports for it.
- AC-05 (REQ-03) [P2]: Given the discrepancy is investigated and a root cause is documented (e.g., a tool configuration gap, a stale index, or a genuine `core` refactor that removed the reported edges), when a subsequent wave is proposed, then `core` becomes eligible for inclusion under the normal REQ-01 rule.
- AC-06 (REQ-04) [P1]: Given a wave's verification gate fails after its files have been converted, when the failure is confirmed, then the wave is reverted as a single atomic commit, leaving zero files of that wave's member set in a mixed CJS/ESM state.
- AC-07 (REQ-05) [P1]: Given a wave is proposed for merge, when its verification gate runs, then the merge proceeds only if all five gate conditions in REQ-05 report zero failures.
- AC-08 (REQ-06) [P1]: Given any wave merges, when the same HTTP requests, CLI invocations, or other observable interactions that succeeded immediately before the wave are re-run immediately after, then their responses/outputs are unchanged.
- AC-09 (REQ-07) [P1]: Given a file is converted by any wave, when its relative import specifiers are inspected, then every one includes an explicit file extension.
- AC-10 (REQ-08) [P1]: Given Phase 0 (the Node 24 runtime bump) has landed and been verified, when a wave produces a boundary where a still-CommonJS file `require()`s an already-migrated ESM file, then that boundary is permitted to merge. Given Phase 0 has not yet landed or been verified, when such a boundary is proposed, then the wave is blocked from merging.
- AC-11 (REQ-09) [P1]: Given any wave, when its member file set is inspected, then it contains zero files under `apps/admin/**`, `src/themes/static/**`, or `src/features/theme/**`.
- AC-12 (REQ-10) [P1]: Given `packages/sdk` is already `"type": "module"` with zero outward `#src/`-internal dependencies, when Wave 1 or any subsequent wave is evaluated for membership, then `packages/sdk`'s files are recognized as already-migrated and are not scheduled for conversion, and any wave-candidate file that imports `@tovu/sdk` treats that import as satisfying REQ-01's precondition without waiting on a `packages/sdk` conversion step.
- AC-13 (REQ-11) [P1]: Given a barrel `index.ts` re-exports N distinct names, when fewer than N of those names' defining files are migrated, then the barrel itself is not converted and remains CommonJS.

---

## Invariants

- INV-01: A merged wave must never contain a mix of ESM and CommonJS module-type files within that wave's own defined member set.
- INV-02: A file must never be added to a wave while any of its `#src/`-internal dependencies is still unmigrated CommonJS and not part of the same wave.
- INV-03: Any test or observable behavior that passed before a wave merges must still pass, with observably identical output, after that wave merges.
- INV-04: Wave ordering must never proceed top-down or by arbitrary module selection — only bottom-up by the verified dependency graph.
- INV-05: `core` must never appear in any wave's member set while its Ce=0-vs-grep discrepancy is undocumented and unresolved.

---

## Edge Cases

- EC-01: What happens when a wave's verification gate fails after files were already converted (e.g., a `require()` call or `__dirname` usage surfaces at runtime that typecheck/static analysis did not catch)?
  Expected behavior: The wave is reverted as a single atomic revert commit. The wave is not left half-merged. The failure is diagnosed and fixed before the wave is retried; retry does not expand scope into other modules to work around the failure.
- EC-02: What happens when a file that `check:architecture` reports as having zero outward internal dependencies (as it did for `core`) turns out, on direct grep, to have real dependencies?
  Expected behavior: The file/module is excluded from every wave until the discrepancy is investigated and resolved. Tool output alone is never sufficient evidence to add a module to a wave — this is exactly the `core` case governed by REQ-03/INV-05.
- EC-03: What happens when a barrel `index.ts` re-exports some names from already-migrated files and other names from still-CommonJS files?
  Expected behavior: The barrel remains CommonJS (governed by REQ-11) until 100% of its re-exported names' defining files are migrated. A partially-eligible barrel is not converted.
- EC-04: What happens when two candidate wave file-sets have zero dependency edges between them, verified via the dependency graph?
  Expected behavior: The two waves may be migrated as separate, independently revertible waves, in either relative order or in parallel — but only after this zero-edge condition is verified per-pair with the same dependency-graph tooling and grep cross-check used for Wave 1 (AC-01), never assumed from the graph's general shape.
- EC-05: What happens when a still-CommonJS file needs to `require()` an already-migrated ESM file, and Phase 0 (the Node 24 runtime bump, REQ-08) has not yet landed or been verified?
  Expected behavior: That wave boundary does not merge. This is a hard block, not a soft warning — the wave plan's safety argument for this direction depends on Node 24's stable synchronous `require(esm)`, which only holds once Phase 0's verification (image builds, boots, existing test suite passes on Node 24) is confirmed.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `check:architecture` (dependency-cruiser-based tool) | Module dependency graph used to determine candidate wave membership | Tool can undercount a module's real dependencies — confirmed for `core` (Ce=0 vs. real imports) | Cross-verify every candidate wave's membership with direct grep for `#src/` imports before finalizing membership, exactly as REQ-03 requires for `core` |
| `check:boundaries` (dependency-cruiser) | Detects import-boundary violations (deep-import edges bypassing barrels); currently 0 errors, 72 warnings repo-wide | N/A — used as a verification-gate signal (REQ-05), not as a source of truth for wave membership | None needed — a gate failure blocks merge (REQ-05), it does not need a fallback path |
| Node.js runtime (`Dockerfile` `ARG NODE_VERSION`, root `package.json` `engines.node`) | Executes both CJS and ESM modules during the coexistence period; Phase 0 (REQ-08) bumps this to Node 24 before Wave 1 | Before Phase 0 lands, the runtime lacks stable synchronous `require(esm)`, so the bottom-up wave safety argument for the CJS-requires-ESM direction does not hold | Phase 0 (Node 24 bump, verified by a successful image build/boot/test-suite run) is the required precondition — no wave may rely on the CJS-requires-ESM boundary before Phase 0 is verified |
| `MIGRATION-esm-2026-08-18.md` (CodeBase Analyzer report) | Verified dependency-graph evidence, the Wave 1 leaf-set, and the failure-mode inventory this spec is built on | Evidence is sampled, not exhaustive, for `apps/admin/**` internals, `packages/*` build/module config, and full per-import recompilation of all 347 barrel imports | Re-verify with direct grep before executing any wave whose membership was not part of the original verified leaf set, per the report's own Coverage Caveat |

---

## Open Questions

- OQ-01: What mechanism keeps migrated (ESM) and not-yet-migrated (CommonJS) files correctly resolving side by side during the transition — e.g., per-directory nested `package.json` `{"type": "module"}` overrides vs. `.mjs`/`.cts` extension-based opt-in? This is an architecture decision, not a spec-level requirement; REQ-06 only constrains the observable outcome (zero behavior change), not the mechanism. — Owner: Software Architect — Resolve by: 2026-08-25 (before Wave 1 ADR sign-off)

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | N/A | This migration uses Node's and TypeScript's native ESM support; no library is adopted or built to replace a custom implementation. |
| II — Test-First | COMPLIES | REQ-05's verification gate requires the existing test suite to pass for every wave before merge. Any new wave-membership-validation tooling built to enforce REQ-01/REQ-11 mechanically must itself go through TDD certification before Programmer implements it. |
| III — Simplicity Gate | COMPLIES | Every module named in this spec (the Wave 1 leaf set, `core`) traces to REQ-02 or REQ-03; no speculative module inclusion. |
| IV — Anti-Abstraction Gate (Rule-of-Two) | N/A | No new port/adapter seam is introduced. This is a module-format change, not a new architectural abstraction. |
| V — Integration-First Testing | COMPLIES | REQ-05's gate runs the real existing test suite plus a boot/smoke check at the entry-point boundary for every wave, satisfying integration-level verification for the P1 "no behavior change" ACs (AC-08). |
| VI — Security-by-Default | N/A | No new endpoint, no new authn/authz surface. Purely internal module-resolution mechanics. |
| VII — Spec Integrity | COMPLIES | All downstream artifacts (behavior.spec.md, traceability.spec.md, and any future ADR/tasks) cite SPEC-049's `content_hash`. |
| VIII — Observability | N/A | No new write paths or domain events are introduced; REQ-06 requires existing observability to remain unchanged, not extended. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-memory/reports/pipeline/` folders — highest prior was `043-widgets`; `ADS-memory/specs/` highest prior was `048-extension-glue-tier`; FEAT-049 is next)
- [x] version set to correct semver (1.1.0 — minor bump for the v1.0.0→v1.1.0 clarification-resolution revision)
- [x] status set to APPROVED (not DRAFT or REVIEW) — both blocking markers resolved by human decision, 2026-08-18
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file — both resolved (REQ-08: Node 24 Phase 0; REQ-10: packages/* in scope, pre-migrated no-op)
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (answer: "no deadline, technical-debt initiative")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial ordering rules — bottom-up wave sequencing)
- [x] traceability.spec.md complete (pending implementation, as expected pre-TDD)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification — revised after both clarifications resolved; overall result is PASS
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `migration`; brownfield/migration evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS — both `[NEEDS CLARIFICATION]` markers resolved by human decision (2026-08-18): REQ-08 (Node 24 bump as Phase 0) and REQ-10 (`packages/*` in scope, `packages/sdk` pre-migrated no-op). Handoff-ready. Per explicit Coordinator instruction, Red-Team / Software Architect dispatch is intentionally held pending the human's return — see this run's report.

---

## Agent Directives (optional)

Always:
- Treat `MIGRATION-esm-2026-08-18.md` as ground truth evidence; do not re-derive its dependency-graph findings from scratch in downstream stages.
- Verify any wave's membership by direct grep of `#src/` imports, not by `check:architecture` tool output alone (per REQ-03/EC-02, the tool is known to undercount at least once).
- Verify Phase 0 (the Node 24 runtime bump — image builds, boots, existing test suite passes on Node 24) is complete before permitting any wave to merge a still-CommonJS-file-requires-already-migrated-ESM-file boundary (REQ-08).
- Treat `packages/sdk` as already-migrated/pre-satisfied — never schedule it for conversion work (REQ-10).

Ask before:
- Executing the Phase 0 Node 24 runtime bump itself (`engines.node`, Dockerfile `NODE_VERSION`) — confirm the verification build/boot/test-suite run passed before treating Phase 0 as complete.

Never:
- Modify `apps/admin/**`, `src/themes/static/**`, or `src/features/theme/**` under this spec (REQ-09).
- Add a file to a wave whose `#src/`-internal dependencies are not all already migrated or external (REQ-01/INV-02).
- Merge a wave that leaves some of its member files ESM and others CommonJS (REQ-04/INV-01).
