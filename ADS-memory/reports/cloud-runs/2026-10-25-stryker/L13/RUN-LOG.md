# L13 run log (append-only)
## 2026-10-25T16:36Z — PROGRESS
Setup done (Node 24.22, Jini linked, admin npm ci). Stryker 9.x + vitest-runner CAN drive admin's vitest 4.1.11 (no runner error). Two env fixes needed, both untracked/in report dir only:
1. Stryker sandbox lives at apps/admin/.stryker-tmp/sandbox-X, so relative imports `../../../website/...` (src/lib/settings-tabs.ts) broke: fixed with symlink `.stryker-tmp/website -> ../../website` and cleanTempDir=false.
2. Unmodified tree has 19 failing tests in 8 files (env: timeouts/i18n/dictionary), Stryker aborts dry run on any failure -> untracked wrapper vitest.stryker.config.ts excludes those 8 files (copy: vitest.stryker.config.ts.txt).
Full admin suite (13541 tests, 3357 suites) takes 13m21s at maxWorkers=3. Candidate set 106 files / 8396 mutants; batch A (64 files, hooks+integrations+risky lib) then batch B (42 files). Started A 16:36Z.

## 2026-10-25T17:40Z — PROGRESS / REPLAN
First attempt (whole admin suite 13.5k tests as the test set, batch A = 64 files / 3721 mutants): dry run ~28 min, then mutation ran at only ~9-15 mutants/min (402/2859 in 27 min) — would not finish in the clock. Killed at 17:36Z, nothing reported from it (no partial JSON).
Also needed: `retry: 2` + 60 s timeouts (a widgets-swap test flaked once in the dry run, passes alone).
REPLAN: wrapper config now INCLUDES only src/lib, src/hooks, src/integrations tests (158 files / 2217 tests, 2m20s, all pass). Consequence: mutants only killed by feature/component/App-level tests will show as survived/no-coverage — see report section 7.
Started A then B at 17:40Z.
