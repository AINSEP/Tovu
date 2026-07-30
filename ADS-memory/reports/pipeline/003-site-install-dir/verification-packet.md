# Coordinator Verification Packet

- Feature: FEAT-003 — site-install-dir (`tovu init`/`tovu serve`/`tovu --help`)
- Spec ID: SPEC-003
- Spec Version: 1.0.0
- Active Spec Hash: sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142
- Packet Created At: 2026-07-29T00:25:00Z
- Packet Created By: Coordinator
- Source TestRunner Report: `ADS-memory/reports/test-runs/TESTRUN-003-site-install-dir-2026-07-28-1712.md` (supersedes the earlier `...-1605.md` run)
- Source Test Certification: `ADS-memory/reports/pipeline/003-site-install-dir/test-certification.md` (recertified 2026-07-28T17:40:00Z; four unit-file digests record-corrected 2026-07-29 after a Coordinator comment-only edit, per TESTRUN-...-1712.md §1.2 — verified behavior-neutral three independent ways there)
- Source Tasks: `ADS-memory/reports/pipeline/003-site-install-dir/tasks.md`
- Advisory-Only Review: no

This packet is Coordinator-owned. It summarizes accepted verification evidence for downstream review. Specialist agents validate the packet for freshness and completeness but do not edit it, wait on its producers, or dispatch other agents.

## Hash Verification

| Artifact | Path | Expected Hash | Verification Command | Status |
|---|---|---|---|---|
| Active spec | `ADS-memory/specs/003-site-install-dir/` | sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142 | `validate_spec_package.py --phase spec --print-hash` | PASS |
| Test certification (13 files) | see Test File Inventory below | per-file, see below | `shasum -a 256`, cross-checked by both TDD and TestRunner independently, and by the Coordinator directly for the 4 post-recert files | PASS |

## Test File Inventory Check

All 13 certified files, current on-disk digest confirmed by TestRunner's 2026-07-28 17:12 run and by the Coordinator directly re-hashing the 4 files that changed after that run's pre-run gate (comment-only edit, verified behavior-neutral).

| Test File | Certified sha256 (current) | Current sha256 | Expected Test Count | Status |
|---|---|---:|---:|---|
| `src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts` | `5249a51b…d2eec` | match | 3 | PASS |
| `src/site-dir/__tests__/unit/schema-guard.unit.test.ts` | `a6fdf022…58631` | match | 5 | PASS |
| `src/site-dir/__tests__/unit/read-site-dir.unit.test.ts` | `555d1b8d…9c5b5` | match | 12 | PASS |
| `src/site-dir/__tests__/unit/read-template.unit.test.ts` | `e091ff72…23c` | match | 3 | PASS |
| `src/site-dir/__tests__/integration/init-site.integration.test.ts` | `c161e8a6…1f966` | match | 8 | PASS |
| `src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts` | `3703f9aa…1a492bd` | match | 4 | PASS |
| `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts` | `5ef53bea…6bf9d5` | match | 8 | PASS |
| `src/site-dir/__tests__/integration/path-containment.integration.test.ts` | `9304347c…58961` | match | 3 | PASS |
| `src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts` | `67bb0f84…6a17e` | match | 1 | PASS |
| `src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts` | `2e45d513…3790ac` | match | 5 | PASS |
| `src/cli/__tests__/integration/init-command.integration.test.ts` | `c33b2aa4…4a8750` | match | 6 | PASS |
| `src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts` | `65fabcb8…699ca8` | match | 3 | PASS |
| `src/cli/__tests__/integration/serve-command.integration.test.ts` | `587dccba…1d4ce76` | match | 10 | PASS |

Total expected/executed: **71/71.**

## Suite Status

| Suite | Required? | Command | Executed Tests | Expected Tests | Result | Coverage Artifact |
|---|---|---|---:|---:|---|---|
| unit | yes | `node --import tsx --test --experimental-test-coverage ... "src/site-dir/__tests__/unit/*.test.ts"` | 23 | 23 | PASS | `coverage/unit/lcov.info` (fresh) |
| integration | yes | full 9-file certified set, one invocation | 48 | 48 | PASS | `coverage/integration/lcov.info` (975,006 bytes; the 1605 run's 0-byte artifact defect is confirmed resolved) |
| e2e | no | N/A — recorded `tasks.md` Coverage Profile deviation (no E2E surface exists for a CLI/filesystem feature; Playwright is browser-only) | — | — | N/A | — |

Regression baseline (U-001-B2, 5 named suites, unmodified): 19/19 PASS.

## Coverage Gate Status

Raw-measured branch figures read below their gates; **real-source-arm figures (owner-accepted, independently re-derived by TDD and then TestRunner via two different classification methods, converging on the same conclusion) pass both gates.** Lines/functions/statements pass outright as raw-measured on both suites — no adjustment needed there. Full mechanical breakdown: `test-certification.md` Coverage Gates section + `TESTRUN-...-1712.md` §4.4.

| Suite | Lines | Branches (raw / real-arms) | Functions | Statements | Status |
|---|---:|---:|---:|---:|---|
| unit | 301/304 (99.01%) | 72/86 raw (83.72%) / **72/73 real (98.63%)** | 39/39 (100%) | 301/304 (99.01%) | **PASS** (real-arms, gate 98%) |
| integration | 1691/1736 (97.41%) | 273/334 raw (81.74%) / **273/288 real (94.79%)** | 189/197 (95.94%) | 1691/1736 (97.41%) | **PASS** (real-arms, gate 90%) |
| e2e | N/A | N/A | N/A | N/A | N/A |

**Owner decision on record (2026-07-28):** accepted the real-source-arm evidence as satisfying the branch gate rather than requiring a coverage-tool swap or a profile-override waiver — the raw shortfall is esbuild's injected CommonJS-interop scaffolding (`__copyProps`/`__toESM`/dead `0 && (...)` export-annotation branches), not missing tests. Logged as a real, non-blocking tooling follow-up in `todos.md` (evaluate a source-map-accurate coverage tool). Documented directly in the 4 affected unit test files' docblocks with concrete line-number evidence.

## Flaky Test Status

| Test ID | Registry Entry | Approval Fields Present | Expires At | Status |
|---|---|---|---|---|
| — | N/A | — | — | **NONE** — no flaky tests found or registered for this feature. |

## Convergence Gate

- Threshold Source: `tasks.md` default (no human-approved override needed or used)
- P1 Acceptance Tests: 10/10 (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08, AC-09, AC-10, AC-13)
- Invariant Tests: 6/6 (INV-01 through INV-06; INV-06 is the architectural depcruise check, 0 production-code violations, 1 test-only advisory warning)
- Required Coverage Gates: **PASS** (on real source arms, owner-accepted per above)
- Empty/Skipped-Only Suite Check: PASS (71/71 executed, 0 skipped, 0 cancelled)
- Unapproved Flaky Tests: none
- Overall Verification Status: **PASS**
- Code Review Gate Status: **READY**

## Advisory Items Carried Forward (non-blocking, for Code Review's own judgment)

- `EACCES` privileged-port refusal surfaced as `PORT_IN_USE` — error-mapping precision, not a defect (both TestRunner runs).
- INV-06 depcruise warning on the C-009 byte-parity test (`read-template.unit.test.ts` → `server/seed.ts`) — recommend a `__tests__` dependency-cruiser exclusion or a recorded exception.
- ADR-PIPE-003's Migration Safety table lists 3 of 5 regression-baseline files by bare filename; they actually resolve under `src/server/__tests__/routes/`, not the implied path — a wrong-path glob silently yields a smaller "green" run. Worth a doc fix, not a code fix.
- `server/deps.ts` has 4 uninvoked closures (78.79% per-file function coverage; aggregate passes at 95.94%) — all four are other features' (SPEC-011/SPEC-033/ADR-PIPE-012) boot-failure handlers, outside SPEC-003's own changed surface. Not this feature's gap.
- SPEC-003 remains entirely untracked in git; this is the second consecutive verification round where a concurrent writer touched files mid-run (in both cases, harmless and independently confirmed behavior-neutral, but TestRunner explicitly flagged committing the feature — or verifying in a dedicated worktree — as the fix for this recurring class of finding.
