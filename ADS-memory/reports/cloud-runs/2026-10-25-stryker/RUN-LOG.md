# Stryker run 2 log (append-only)
## 2026-10-25T15:49:13Z — STARTED
Tovu branch stryker @ 89ed9a22. Setting up Jini clone.

## 2026-10-25T15:53:28Z — FAILURE
Jini push to cloud/stryker-1025-jini refused (403: AINSEP/Jini not in session authorized set; add_repo push_check=refused, Claude GitHub App lacks access). Jini commit 9fa38851 saved as part0-exports-tests.patch in this dir (git am). Part 0: exports.ts 90.53% -> 99.2% (2 equivalent survivors + 1 fixed). Continuing; further test-only patches go to Tovu.

## 2026-10-25T15:53:34Z — PROGRESS
Correction: the retried Jini push SUCCEEDED (cloud/stryker-1025-jini @ 9fa38851); earlier 403 was transient/before add_repo. Patch file is redundant.

## 2026-10-25T17:43:21Z — PROGRESS
Part 1 (lifecycle) done: 4508 mutants, 87.84%, 97m29s Stryker wall. Data in data/. Part 2 running.

## 2026-10-25T18:11:32Z — PROGRESS
Part 2 (admin-surfaces) done: 2085 mutants. Anomaly: 6 files show 0 kills / 666 NoCoverage under perTest although tests exist (478 tests pass) — rerunning those 6 with coverageAnalysis=off against admin-surfaces tests only. Part 3 running.

## 2026-10-25T18:26:48Z — PROGRESS
ROOT CAUSE of the 666 NoCoverage in part 2: my wrapper vitest config used a relative alias for @jini-ai/plugins/host (resolved against sandbox dir) -> test files importing lifecycle/tools/__tests__/support.ts failed to collect silently (dry run: 102 of 1242 tests ran...). Fixed with absolute alias; part 2 rerun (incremental): 90.60%, 0 nocov. Re-running part 1 incrementally with the fixed config (earlier part-1 numbers understated for files hit by those tests).

## 2026-10-25T18:55:16Z — DONE
All parts done; report STRYKER-RUN-2.md. Jini cloud/stryker-1025-jini @ 9fa38851 (part 0 tests).
