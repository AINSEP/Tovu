# StrykerJS run 2 — FORCED re-run (measure-only)

Status: IN PROGRESS. Progress log (append-only) is at the bottom; final report replaces this header when done.

## Progress log
### 2026-10-25T21:43Z — STARTED
Tovu `cloud/stryker-1025-tovu` @ origin tip; Jini detached at **`9fa38851`** (= `3e2fbae8` + run-2's Part-0 `exports.ts` test commit — run 2's Parts 1–3 were measured on this tree, so this is the comparable one; ASSUMPTION, see report). Plan: pnpm install + build, plain `vitest run` baseline counts, dry-run count check, then Parts 1/2/3a/3b with `--force`.
### 2026-10-25T22:07Z — PROGRESS
Setup: Stryker 9.6.1 core+vitest-runner + typescript 5.9.3 in a separate dir; Stryker's peer-installed vitest 5.0.5 REPLACED by a symlink to Jini's vitest 2.1.9 (otherwise the runner would drive a different vitest than the tests). Runner patched (`data/force-vitest-runner-collection-error.patch`): a test file that fails to collect now FAILS the run (mutant Killed, reason `STRYKER-FORCE-COLLECTION-ERROR …`) instead of reporting zero tests = Survived. Config: `force:true`, `incremental:false`, `vitest.related:false` (dry run = whole suite, so its count is directly comparable to plain `vitest run`), `inPlace:true` + tempDir outside the package (sandbox copies broke tests that read `../../../../package.json` / sibling packages), wrapper vitest config with ABSOLUTE alias + `.stryker-tmp` excluded.
FAILURE (fixed): first two p3a dry runs aborted — sandbox mode: `ENOENT …/.stryker-tmp/agent-plugins/src/lifecycle/ports.ts`; inPlace with in-package tempDir: vitest collected the backup copy of the tests (`ENOENT …/.stryker-tmp/backup-P9KpVo/package.json`).
Count check agent-plugins: plain `vitest run` (orig config) 1465 passed + 2 skipped; wrapper config same; Stryker dry run "Ran 1465 tests" → MATCH. cms: plain run 4199 pass + 1 PRE-EXISTING FAILURE (`subpath-isolation.contract.test.ts`: plugin-export.ts reaches consent/types.ts) → excluded in wrapper; wrapper 4199; dry run 4199 → MATCH.
Part 3a forced: 255 mutants (41 ignored StringLiteral) K193 T8 S13 → **93.93 %** (run 2: 93.93 %). Part 3b forced (full cms suite, run 2 used 6 widget test files/141 tests): K144 S25 → **85.21 %** (run 2: 85.21 %). 0 collection-error kills, 0 vitest-timeout kills in either.
