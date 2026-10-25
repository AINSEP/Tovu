# F5 run log (Jini: Stryker L10 + RUN 2 — agent-plugins + cms plugin-export)

## 2026-10-25T21:34Z — STARTED
Jini branch cloud/fixwave-1025-F5 from origin/cloud/overnight-1024-jini 3e2fbae8 + cherry-pick of run-2 Part 0 test commit 9fa38851 (exports.ts tests). Node 24.22, pnpm install + pnpm -r build OK (exit 0). Plan: run-2 security musts first (host-validator, plugin-export '//', package-paths containment), then capability-declarations regex tables, memoisation identity tests, then coverage + CCN + Stryker --force re-score.

## 2026-10-25T21:55Z — PROGRESS
Pushed to Jini cloud/fixwave-1025-F5: 803123e4 host-validator envelope tests (44), d7fc7457 cms plugin-export guards (+~55), 99aa2733 package-paths containment + 13-module memoisation identity, 2d7ef642 capability-declarations grammar tables (102). Hand-mutation spot checks: `startsWith('//')`→`endsWith` killed (2 tests), `relative !== '..'` removed killed, root-walk `parent !== current` killed.
Baseline: agent-plugins vitest 92 files / 1465 passed / 2 skipped; coverage already 100 % lines+branches on every src file except automatic-use.ts (99.25 % branches).
FAILURE (setup, fixed): Stryker sandbox broke relative paths (cms `forms/tsconfig.json` extends `../../../tsconfig.base.json` → TSConfckParseError; agent-plugins dry run collected only 1028 tests vs ~1465). Fix: `inPlace:true` on throwaway sibling copies (`packages/*-before`, `*-after`), never on the committed package dirs. Also: npm auto-installed vitest 5 as a peer of @stryker-mutator/vitest-runner — replaced with a symlink to the workspace's vitest 2.1.9.
ASSUMPTION: lane branch = origin/cloud/overnight-1024-jini + cherry-pick of run-2's Part 0 test commit 9fa38851 (tests only).

## 2026-10-25T22:03Z — PROGRESS (SOURCE BUG FOUND + FIXED)
**analytics `ipMatchesRange`**: an excluded-IP range with an empty or negative prefix (`"10.0.0.0/"`, `"10.0.0.0/-1"`) was read as `/0` (`Number("") === 0`) and excluded EVERY visitor — a typo in the operator's `excludedIpRanges` setting silently drops all analytics (Tovu stores the list via `toStringArray`, no validation). Failing test aec57645 → fix 2bdd4d6d (prefix must be 1–2 digits, 0–32; valid ranges unchanged; analytics 168/168 tests pass).
More commits: 4312de8f surface-client guards, 957a9056 skill-file-reader guards, efe5b441 credential scan boundaries, 8f78b617 vibecoding symlink pin (L10 store.ts:72/318 mutants are EQUIVALENT on POSIX — documented), 91b77064 diagnostics request-guard defaults, fd122779 diagnostics redaction grammar, 3d2dd706 desktop-host withRenderTimeout.
Stryker "before" (--force equivalent: incremental off) running on a sibling copy with the pre-F5 tests: cms plugin-export.ts 85.21 % (169 mutants, 25 survived) — identical to run 2, so run-2's cms score was NOT stale.

## 2026-10-25T22:25Z — PROGRESS
Jini commits since last entry: bce4b8eb artifacts manifest, 3be0b790 cli caps, 2575ab7e diagnostics entropy rules, 04b9195b ENOENT/ESRCH shapes, 56587bff persistent-state ports, 810f5cc9 mcp.json read, fa5e279b settings-value, eb395468 surface-capabilities grammars, b2607534 failure codes, cc55164b + f0c26f43 CCN refactors (analytics ipMatchesRange 13→≤10, automatic-use load 11→≤10; tests green before/after), d11f8f79 automatic-use → 100 % branches, 2013ded5 bundled-digests, c9357655 projection (run-2 NO-COVERAGE line closed), 1790ef88 folder zippers, 4a70b5a1 bundled-source-archive, ce383657 set-enabled.
agent-plugins suite: 104 files / 1857 passed / 2 skipped (was 92 / 1465). Per-file coverage of every touched non-UI source = 100 % lines+branches except cms plugin-export.ts (97.4 % branches, lines 79 + 95: unreachable defensive arms) and vibecoding store.ts (not edited; tests only).
Stryker AFTER: cms plugin-export.ts 85.21 % → **96.45 %** (6 survivors left, all equivalent/unreachable). agent-plugins BEFORE (sibling copy, 979 mutants) still running.
FAILURE (setup, fixed): `vitest --maxWorkers=2` alone crashes vitest 2.1.9 (tinypool min/max conflict) — ran without it.
