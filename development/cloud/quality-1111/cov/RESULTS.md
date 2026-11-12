# Quality audit 2026-11-11: COV (coverage + test quality)

Session COV, report only: no source or test file was changed, and no source or test file was opened by the model to judge it. Every number comes from tool output parsed by the scripts in `scripts/`.

- **Repos:** Tovu `cloud/quality-1111` @ `deebc92`; Jini `main` @ `f6fa96a`.
- **Wall clock:** first command 00:10:28Z; the cap is 03:10:28Z.
- **Container:** 4 cores, 16 GB, Node v24.22.3 (nodejs.org tarball in `~/.local/node24`), pnpm 10.33.2 via corepack.

## Files in this folder

| file | what |
| --- | --- |
| `coverage.tsv` | Per-file coverage for both repos: repo, area, file, status (LOADED / NEVER-LOADED), lines%, branches%, functions%, statements%, below99, zero_coverage, uncovered_lines, statements_source |
| `coverage-totals.json` | Totals per repo and per app/package |
| `failures.tsv` | Every failing test: repo, file, test, class, basis, exact error (first 600 chars), source file |
| `test-quality.tsv`, `test-quality-by-area.tsv` | Static test-quality counts per test file and per area |
| `test-safety-all.tsv` | Message-less `assert` calls per Tovu test file (full-tree run of the `check:test-safety` lint config) |
| `stryker/` | Mutation pilot config, full JSON report, and the survivors list |
| `scripts/` | Every script used. The runners are `tovu-shards*.sh`, `tovu-subshards.sh`, `desktop-cov.sh` and `jini-cov.sh`; the parsers are `finalize.sh`, `lcov-abs.mjs`, `build-coverage-table.mjs`, `extract-failures.mjs`, `test-quality.mjs`, `test-safety-all.mjs` and `results-tables.mjs` |
| `raw/` | Every raw command output (`*.txt`, with TAP as `*.tap.txt`), vitest JSON results, and the all-files reports as Markdown |

## Setup timings

| step | result | time |
| --- | --- | ---: |
| Jini `pnpm install --frozen-lockfile` | exit 0 | 18 s |
| Jini `pnpm --no-bail -r build` | exit 0 | 149 s |
| Tovu `npm ci`: root / apps/admin / apps/desktop / apps/site-chat | exit 0 each | 74 / 17 / 17 / 8 s |
| Tovu `npm run build --workspace @tovu/sdk` | exit 0 | 1 s |
| Tovu `npm run link:jini` | exit 0 on the second attempt | 4 s |
| Tovu `apps/desktop npm run build:preload` | exit 0 | 2 s |

`link:jini` first failed (exit 1) because it looks for Jini at `/root/Programming/Jini/packages` by default. Re-run with `JINI_PACKAGES_DIR=/home/user/Jini/packages`, it linked 79 packages (`raw/tovu-link-jini.txt`).

## How each suite was run

**Tovu root suite.** This is the exact `npm test` file set: `apps/website`, `content/agent-plugins`, `content/agent-plugin-overlays`, `packages/*`, `apps/site-chat`, `development/scripts` and `development/eslint-rules`, 3,148 test files in all.
- Command: the `test:cov` flags plus `--test-concurrency=1 --test-timeout=300000` (`scripts/tovu-shards.sh`).
- Sharding: 8 round-robin shards, each writing its own lcov and TAP.
- The suite was too slow for the plan as written. Shards 0–2 took about 87–97 min each while sharing the CPU. Three changes were made, all recorded in `raw/tovu-root-shards-timing.txt`:
  1. At 00:41 the fixed 3-at-a-time `xargs` was replaced by a scheduler that ran 5 at a time.
  2. At 01:09 the 80-min timeout wrappers were removed from running shards 0–4 (their test processes kept running), and shards 5–7 were started at once with a 95-min cap.
  3. At 01:38 shards 5 and 6 were stopped and re-run from the start as sub-shards 5a/5b/6a/6b, two halves each, with a 65-min cap.
  4. At 02:06, with the CPU saturated, 5a and 6a were stopped. Their files were then re-run in fast chunks: 5ax/6ax (02:09), 5ay/5az/6ay/6az (02:14), and the 6 slow `src/cli/__tests__/integration/*` files one process each, cli1–cli6 (02:24).
  5. Every chunk completed; the last finished at 02:31:31.
- Partial output of the stopped runs is in `raw/aborted/` and is not used for coverage or failures. **Every one of the 3,148 root test files therefore ran to completion exactly once in a run whose lcov and TAP are used.**
- The `exit 137` lines in that timing file are the wrappers being killed on purpose, not test results.

**Tovu admin.** `npx vitest run --coverage --maxWorkers=2`, which uses the repo's own coverage config (v8, include `src/**/*.{ts,tsx}`, so files no test loads are still counted). Lcov, json-summary and JSON results were added as reporters.

**Tovu desktop.** Both `npm test` node:test invocations, with the same globs and imports, plus node:test coverage and `--test-concurrency=1` (`scripts/desktop-cov.sh`).

**Jini.** Each of the 41 packages ran `npx vitest run --coverage --coverage.reportOnFailure=true`, adding json-summary, lcov and JSON results (`scripts/jini-cov.sh`). The run used 2 lanes and `nice 10` so it would not starve the Tovu shards.
- `commerce`: its kernel vitest config and its node:test unit files were also run. The node:test part has no coverage.
- Per-package results: `raw/jini-package-summary.tsv`.

**Coverage table.** Tovu's own `npm run coverage:all-files` (`development/scripts/coverage-all-files.ts`) was run once per repo over every lcov:
- Relative `SF:` paths were made absolute first (`scripts/lcov-abs.mjs`).
- Jini was run with `--root packages`.
- Tovu was run with `--exclude sites --exclude development/cloud`. No tracked source lives under `sites/`, and test runs leave untracked staging files there. `development/cloud` holds this audit's own scripts.

That tool counts every tracked source file. A file no test loaded is marked NEVER-LOADED, scored 0%, and its size estimated from its AST. Type-only, test, fixture, generated and declaration files are excluded.

LCOV has no statements metric:
- For admin and Jini files, `statements%` comes from vitest's json-summary.
- For node:test-only files (`statements_source = lines`), `statements%` is the lines figure.
- `below99 = yes` when any of the four metrics is under 99.
- `zero_coverage = yes` when the file is NEVER-LOADED or has 0 covered lines.

**Failure classes.** The classes are assigned by regex rules on the error text (`scripts/extract-failures.mjs`), not by reading code. The `basis` column says which rule fired.
- **ENV:** a Postgres socket or 5432, Chromium or Playwright, IPv6 / `::1` / EADDRNOTAVAIL, EPERM/EACCES, or a missing tool.
- **TEST DRIFT:** an assertion-shaped error message, a module or export the test imports could not be resolved, or a timeout.
- **PRODUCT:** a TypeError, ReferenceError or similar whose first stack frame is in non-test source.
- **Unmatched:** TEST DRIFT with basis `default`.

The PRODUCT and TEST DRIFT rows are therefore a triage starting point, not a verdict.

## Summary

**Run status.**
- Every planned suite ran. No test file is NOT RUN.
- The owner's mid-session stop message expected 6 CLI integration files to be unfinished. In fact all 6 completed (exit 0) at 02:31:31, before the stop arrived, and their lcov and TAP are included. Their files: `adopt-command`, `init-agent-plugin-tokens`, `serve-command-site-key`, `deploy-config-command`, `init-command` and `serve-command`, all under `apps/website/src/cli/__tests__/integration/`.
- By this session's clock the stop came 2 h 21 min after the first command, at 02:31Z, against a 03:10Z cap. All test runs had ended before the stop.

**Coverage (owner floor: 99% per file on all 4 metrics)**

| repo | files | ≥99% on all 4 | below 99% | zero-coverage | lines | branches | functions | statements |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| Tovu | 3,367 | 2,163 | 1,204 | 145 | 96.24% | 88.36% | 83.36% | 96.27% |
| Jini | 3,352 | 2,559 | 793 | 452 | 88.22% | 86.95% | 78.89% | 88.22% |

| Tovu app | files | ≥99% all 4 | below | zero | lines | branches | functions |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| apps/website | 2,069 | 1,240 | 829 | 7 | 99.49% | 95.16% | 84.96% |
| apps/admin | 825 | 712 | 113 | 6 | 98.47% | 97.20% | 97.86% |
| apps/desktop | 262 | 185 | 77 | 8 | 97.06% | 95.82% | 87.92% |
| apps/site-chat | 28 | 16 | 12 | 4 | 97.90% | 94.80% | 92.24% |
| development/scripts | 102 | 6 | 96 | 50 | 65.69% | 31.26% | 42.95% |

- Lowest Jini packages:
  - `devops` 17.86% lines (57 of 74 files never loaded)
  - `chat` 36.08% (149 never loaded)
  - `agent-plugins` 45.79% (99 never loaded)
  - `sqlite` 12.50% (2 files)
  - `integrations` 80.76%
  - `plugins` 84.17%
  - `db` 85.33%
  - `agent-runtime` 87.38%
- The full per-area table and all files are below and in `coverage.tsv` / `coverage-totals.json`.
- 17 Jini packages exit 1 only because of their own vitest coverage thresholds (`ERROR: Coverage for …`), not failing tests. See `raw/jini-package-summary.tsv`.

**Failing tests: 277 in total, all listed in `failures.tsv`.**

| class | Tovu | Jini |
| --- | ---: | ---: |
| ENV | 147 (112 Postgres, 19 cancelled children of Postgres failures, 15 Chromium, 1 network) | 0 |
| TEST DRIFT | 118 (80 assertion mismatch, 32 unmatched/default, 3 module resolution, 3 missing `charts-recharts/0.6.24` asset in linked Jini) | 10 (8 assertion mismatch, 2 timeout) |
| PRODUCT | 2 | 0 |

- Tovu admin: 4 failed tests and 1 test file that failed to load, out of 14,470 tests (`raw/tovu-admin-vitest-cov.txt`).
- Jini: 10 failing tests in 8 packages (agent-plugins, chat ×3, cms, db, infra, platform, plugin-fixture-provider, provider-plugins).

**Test quality (script-only)**
- 87,178 tests in 8,183 test files.
- Tests with no assertion: 50 (Tovu 27, Jini 23).
- Weak-only tests: 1,000 (Tovu 605, Jini 395).
- Snapshot-only tests: 11, all in Jini.
- Tests that mock the unit under test: 0.
- Skipped: 154. `.only`: 0. Todo: 16.
- `check:test-safety` FAIL: 2 files add message-less asserts. A full-tree run of the same lint finds 4,722 message-less asserts in 1,365 Tovu test files.

**Mutation pilot.** Jini `protocol`: score 98.05%, 302 of 308 mutants killed, 5 survived, 1 with no coverage. It took 2 min.

## Generated tables

### Coverage totals per app/package

| area | files | at99_all4 | below99 | zero_coverage | never_loaded | lines | branches | functions | statements |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jini (all) | 3352 | 2559 | 793 | 452 | 398 | 190539/215978 (88.22%) | 95152/109432 (86.95%) | 20600/26112 (78.89%) | 190542/215981 (88.22%) |
| Jini: packages/admin | 343 | 331 | 12 | 2 | 2 | 14169/14178 (99.94%) | 7805/7824 (99.76%) | 2088/2089 (99.95%) | 14169/14178 (99.94%) |
| Jini: packages/agent-plugins | 213 | 64 | 149 | 120 | 99 | 6403/13982 (45.79%) | 4385/8480 (51.71%) | 844/2315 (36.46%) | 6403/13982 (45.79%) |
| Jini: packages/agent-runtime | 162 | 121 | 41 | 29 | 29 | 13455/15399 (87.38%) | 7490/8581 (87.29%) | 1426/1946 (73.28%) | 13455/15399 (87.38%) |
| Jini: packages/agentic | 50 | 45 | 5 | 1 | 1 | 3161/3168 (99.78%) | 1860/1884 (98.73%) | 335/336 (99.70%) | 3161/3168 (99.78%) |
| Jini: packages/analytics | 12 | 9 | 3 | 1 | 1 | 690/692 (99.71%) | 442/445 (99.33%) | 94/94 (100.00%) | 690/692 (99.71%) |
| Jini: packages/artifacts | 10 | 10 | 0 | 0 | 0 | 707/707 (100.00%) | 367/367 (100.00%) | 77/77 (100.00%) | 707/707 (100.00%) |
| Jini: packages/capability-providers | 22 | 21 | 1 | 1 | 1 | 1075/1077 (99.81%) | 425/425 (100.00%) | 115/115 (100.00%) | 1075/1077 (99.81%) |
| Jini: packages/chat | 206 | 46 | 160 | 149 | 149 | 4325/11986 (36.08%) | 2933/8535 (34.36%) | 482/2633 (18.31%) | 4325/11986 (36.08%) |
| Jini: packages/cli | 17 | 15 | 2 | 1 | 1 | 1071/1075 (99.63%) | 666/667 (99.85%) | 123/123 (100.00%) | 1071/1075 (99.63%) |
| Jini: packages/cms | 273 | 234 | 39 | 14 | 10 | 17442/17955 (97.14%) | 8342/8568 (97.36%) | 1802/1855 (97.14%) | 17442/17955 (97.14%) |
| Jini: packages/commerce | 85 | 23 | 62 | 3 | 1 | 5019/5146 (97.53%) | 2600/2695 (96.47%) | 685/750 (91.33%) | 5019/5146 (97.53%) |
| Jini: packages/cookie-consent | 28 | 18 | 10 | 5 | 3 | 1248/1289 (96.82%) | 1018/1041 (97.79%) | 195/197 (98.98%) | 1248/1289 (96.82%) |
| Jini: packages/core | 102 | 89 | 13 | 4 | 3 | 6198/6371 (97.28%) | 3052/3183 (95.88%) | 607/642 (94.55%) | 6198/6371 (97.28%) |
| Jini: packages/daemon | 140 | 109 | 31 | 4 | 3 | 12675/12767 (99.28%) | 7075/7163 (98.77%) | 1527/1535 (99.48%) | 12675/12767 (99.28%) |
| Jini: packages/db | 103 | 79 | 24 | 16 | 7 | 4241/4970 (85.33%) | 2110/2159 (97.73%) | 490/519 (94.41%) | 4241/4970 (85.33%) |
| Jini: packages/desktop-host | 65 | 60 | 5 | 1 | 1 | 2391/2406 (99.38%) | 1306/1313 (99.47%) | 400/402 (99.50%) | 2391/2406 (99.38%) |
| Jini: packages/devops | 74 | 8 | 66 | 57 | 57 | 679/3801 (17.86%) | 354/2467 (14.35%) | 75/947 (7.92%) | 679/3801 (17.86%) |
| Jini: packages/diagnostics | 42 | 37 | 5 | 2 | 2 | 2969/2973 (99.87%) | 1866/1872 (99.68%) | 410/410 (100.00%) | 2969/2973 (99.87%) |
| Jini: packages/http-kit | 26 | 23 | 3 | 1 | 1 | 1013/1017 (99.61%) | 569/576 (98.78%) | 129/129 (100.00%) | 1013/1017 (99.61%) |
| Jini: packages/infra | 12 | 10 | 2 | 1 | 1 | 571/573 (99.65%) | 302/305 (99.02%) | 95/95 (100.00%) | 571/573 (99.65%) |
| Jini: packages/integrations | 103 | 89 | 14 | 5 | 1 | 6742/8348 (80.76%) | 2877/3008 (95.64%) | 681/780 (87.31%) | 6742/8348 (80.76%) |
| Jini: packages/mcp | 80 | 60 | 20 | 1 | 1 | 5837/6402 (91.17%) | 2930/3072 (95.38%) | 641/685 (93.58%) | 5837/6402 (91.17%) |
| Jini: packages/memory | 10 | 9 | 1 | 1 | 1 | 1113/1115 (99.82%) | 554/554 (100.00%) | 123/123 (100.00%) | 1113/1115 (99.82%) |
| Jini: packages/oauth | 39 | 33 | 6 | 6 | 6 | 1865/2015 (92.56%) | 1017/1084 (93.82%) | 191/229 (83.41%) | 1865/2015 (92.56%) |
| Jini: packages/platform | 107 | 88 | 19 | 1 | 1 | 8764/8817 (99.40%) | 5714/5774 (98.96%) | 1192/1200 (99.33%) | 8764/8817 (99.40%) |
| Jini: packages/plugin-catalog | 1 | 0 | 1 | 0 | 0 | 103/119 (86.55%) | 70/76 (92.11%) | 11/12 (91.67%) | 103/119 (86.55%) |
| Jini: packages/plugins | 59 | 41 | 18 | 4 | 0 | 4162/4945 (84.17%) | 2357/2435 (96.80%) | 486/515 (94.37%) | 4162/4945 (84.17%) |
| Jini: packages/protocol | 8 | 7 | 1 | 1 | 1 | 295/297 (99.33%) | 90/90 (100.00%) | 14/14 (100.00%) | 295/297 (99.33%) |
| Jini: packages/provider-plugins | 45 | 28 | 17 | 6 | 1 | 1692/1745 (96.96%) | 1217/1241 (98.07%) | 251/258 (97.29%) | 1695/1748 (96.97%) |
| Jini: packages/registry | 15 | 13 | 2 | 1 | 1 | 1117/1124 (99.38%) | 664/669 (99.25%) | 133/135 (98.52%) | 1117/1124 (99.38%) |
| Jini: packages/sandbox | 11 | 8 | 3 | 1 | 1 | 497/500 (99.40%) | 224/227 (98.68%) | 44/44 (100.00%) | 497/500 (99.40%) |
| Jini: packages/search | 15 | 14 | 1 | 1 | 1 | 1407/1409 (99.86%) | 842/842 (100.00%) | 207/207 (100.00%) | 1407/1409 (99.86%) |
| Jini: packages/server | 17 | 11 | 6 | 2 | 2 | 1649/1669 (98.80%) | 698/708 (98.59%) | 178/188 (94.68%) | 1649/1669 (98.80%) |
| Jini: packages/sidecar | 13 | 10 | 3 | 1 | 1 | 1179/1181 (99.83%) | 613/626 (97.92%) | 134/134 (100.00%) | 1179/1181 (99.83%) |
| Jini: packages/sqlite | 2 | 1 | 1 | 1 | 1 | 1/8 (12.50%) | 0/0 (100.00%) | 0/2 (0.00%) | 1/8 (12.50%) |
| Jini: packages/ui-kit | 30 | 24 | 6 | 1 | 1 | 1012/1014 (99.80%) | 713/723 (98.62%) | 152/152 (100.00%) | 1012/1014 (99.80%) |
| Jini: packages/ui | 679 | 656 | 23 | 3 | 2 | 45081/45135 (99.88%) | 15662/15737 (99.52%) | 3194/3244 (98.46%) | 45081/45135 (99.88%) |
| Jini: packages/user-management | 107 | 94 | 13 | 2 | 2 | 6746/6804 (99.15%) | 3071/3115 (98.59%) | 802/808 (99.26%) | 6746/6804 (99.15%) |
| Jini: packages/vibecoding | 26 | 21 | 5 | 2 | 2 | 1775/1799 (98.67%) | 872/901 (96.78%) | 167/173 (96.53%) | 1775/1799 (98.67%) |
| Tovu (all) | 3367 | 2163 | 1204 | 145 | 145 | 342195/355552 (96.24%) | 89959/101813 (88.36%) | 34928/41898 (83.36%) | 346327/359728 (96.27%) |
| Tovu: .claude | 2 | 0 | 2 | 2 | 2 | 0/170 (0.00%) | 0/68 (0.00%) | 0/41 (0.00%) | 0/170 (0.00%) |
| Tovu: .dependency-cruiser.mjs | 1 | 0 | 1 | 1 | 1 | 0/22 (0.00%) | 0/6 (0.00%) | 0/9 (0.00%) | 0/22 (0.00%) |
| Tovu: .semgrep | 5 | 0 | 5 | 5 | 5 | 0/77 (0.00%) | 0/0 (100.00%) | 0/19 (0.00%) | 0/77 (0.00%) |
| Tovu: ADS-memory | 3 | 0 | 3 | 3 | 3 | 0/97 (0.00%) | 0/51 (0.00%) | 0/20 (0.00%) | 0/97 (0.00%) |
| Tovu: apps/admin | 825 | 712 | 113 | 6 | 6 | 19732/20038 (98.47%) | 15975/16436 (97.20%) | 8508/8694 (97.86%) | 23864/24214 (98.55%) |
| Tovu: apps/desktop | 262 | 185 | 77 | 8 | 8 | 37482/38617 (97.06%) | 8374/8739 (95.82%) | 3101/3527 (87.92%) | 37482/38617 (97.06%) |
| Tovu: apps/site-chat | 28 | 16 | 12 | 4 | 4 | 1868/1908 (97.90%) | 529/558 (94.80%) | 214/232 (92.24%) | 1868/1908 (97.90%) |
| Tovu: apps/website | 2069 | 1240 | 829 | 7 | 7 | 269029/270397 (99.49%) | 62147/65308 (95.16%) | 21993/25886 (84.96%) | 269029/270397 (99.49%) |
| Tovu: cloud | 1 | 0 | 1 | 1 | 1 | 0/38 (0.00%) | 0/22 (0.00%) | 0/4 (0.00%) | 0/38 (0.00%) |
| Tovu: content/themes | 16 | 0 | 16 | 16 | 16 | 0/1238 (0.00%) | 0/606 (0.00%) | 0/257 (0.00%) | 0/1238 (0.00%) |
| Tovu: development/eslint-rules | 2 | 0 | 2 | 0 | 0 | 197/216 (91.20%) | 62/80 (77.50%) | 13/14 (92.86%) | 197/216 (91.20%) |
| Tovu: development/evals | 32 | 0 | 32 | 31 | 31 | 128/2244 (5.70%) | 8/874 (0.92%) | 6/683 (0.88%) | 128/2244 (5.70%) |
| Tovu: development/playwright.desktop-journeys.config.ts | 1 | 0 | 1 | 1 | 1 | 0/4 (0.00%) | 0/0 (100.00%) | 0/0 (100.00%) | 0/4 (0.00%) |
| Tovu: development/playwright.desktop-shell.config.ts | 1 | 0 | 1 | 1 | 1 | 0/4 (0.00%) | 0/0 (100.00%) | 0/0 (100.00%) | 0/4 (0.00%) |
| Tovu: development/playwright.journeys.config.ts | 1 | 0 | 1 | 1 | 1 | 0/9 (0.00%) | 0/14 (0.00%) | 0/2 (0.00%) | 0/9 (0.00%) |
| Tovu: development/playwright.memory-soak.config.ts | 1 | 0 | 1 | 1 | 1 | 0/10 (0.00%) | 0/4 (0.00%) | 0/2 (0.00%) | 0/10 (0.00%) |
| Tovu: development/playwright.mobile-visual.config.ts | 1 | 0 | 1 | 1 | 1 | 0/7 (0.00%) | 0/0 (100.00%) | 0/1 (0.00%) | 0/7 (0.00%) |
| Tovu: development/scripts | 102 | 6 | 96 | 50 | 50 | 12751/19412 (65.69%) | 2804/8970 (31.26%) | 1060/2468 (42.95%) | 12751/19412 (65.69%) |
| Tovu: development/sonarjs | 3 | 0 | 3 | 2 | 2 | 79/96 (82.29%) | 10/21 (47.62%) | 3/6 (50.00%) | 79/96 (82.29%) |
| Tovu: development/test-support | 3 | 2 | 1 | 1 | 1 | 36/37 (97.30%) | 5/5 (100.00%) | 1/1 (100.00%) | 36/37 (97.30%) |
| Tovu: eslint.config.mjs | 1 | 1 | 0 | 0 | 0 | 437/437 (100.00%) | 3/3 (100.00%) | 2/2 (100.00%) | 437/437 (100.00%) |
| Tovu: packages/contracts | 4 | 1 | 3 | 3 | 3 | 116/123 (94.31%) | 1/1 (100.00%) | 0/2 (0.00%) | 116/123 (94.31%) |
| Tovu: packages/sdk | 2 | 0 | 2 | 0 | 0 | 280/283 (98.94%) | 26/30 (86.67%) | 22/22 (100.00%) | 280/283 (98.94%) |
| Tovu: scripts | 1 | 0 | 1 | 0 | 0 | 60/68 (88.24%) | 15/17 (88.24%) | 5/6 (83.33%) | 60/68 (88.24%) |

### Top 50 files below 99% (by uncovered lines; full list: coverage.tsv, 1997 rows with below99=yes)

| repo | file | status | lines% | branches% | functions% | statements% | uncovered_lines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tovu | development/scripts/extraction-dossier.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 1666 |
| Tovu | apps/desktop/src/main/index.ts | LOADED | 48.71 | 20.00 | 0.00 | 48.71 | 595 |
| Jini | packages/integrations/src/api-connections/hosted-mcp/sign-in.ts | LOADED | 3.85 | 100.00 | 10.81 | 3.85 | 549 |
| Jini | packages/mcp/src/federation/hosted/store.ts | LOADED | 53.33 | 48.75 | 60.00 | 53.33 | 442 |
| Jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 427 |
| Jini | packages/plugins/src/host/tools/management.ts | LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 426 |
| Tovu | development/scripts/measure-site-memory.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 420 |
| Jini | packages/db/src/data-modules/data-module.ts | LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 399 |
| Jini | packages/integrations/src/credentialed-http/tools/tool-registrations.ts | LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 391 |
| Tovu | development/scripts/dev.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 379 |
| Tovu | development/scripts/check-architecture.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 372 |
| Jini | packages/agent-plugins/src/connect/connect-tool.ts | LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 313 |
| Tovu | development/scripts/build-brand-icons.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 309 |
| Jini | packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 307 |
| Jini | packages/agent-plugins/src/lifecycle/host-tools/skill-tool.ts | LOADED | 1.72 | 100.00 | 0.00 | 1.72 | 285 |
| Jini | packages/agent-plugins/vercel/targets/vercel.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 269 |
| Jini | packages/agent-plugins/meilisearch/providers/meilisearch.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 254 |
| Jini | packages/chat/src/react/hooks/assistant-chats.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 244 |
| Jini | packages/chat/src/store/runtime/durable-run-store.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 243 |
| Jini | packages/chat/src/embed-widget/browser/frontend-session-bridge.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 239 |
| Jini | packages/agent-plugins/github/source-control/write-files.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 238 |
| Jini | packages/chat/src/react/components/Markdown.tsx | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 237 |
| Tovu | development/scripts/check-outbox-bridge.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 236 |
| Jini | packages/chat/src/embed-widget/vanilla/index.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 235 |
| Jini | packages/devops/src/checks/hardwiring.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 232 |
| Jini | packages/agent-plugins/github/source-control/commit-site.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 230 |
| Tovu | development/evals/tool-search-parent-tool-read.eval.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 230 |
| Jini | packages/devops/src/packaging/electron/staging.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 224 |
| Tovu | apps/website/src/server/inbound/assistant/agent-daemon-scope.ts | LOADED | 86.98 | 52.34 | 41.28 | 86.98 | 215 |
| Tovu | development/evals/tool-search-argument-fill.eval.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 215 |
| Jini | packages/agent-plugins/github-pages/targets/github-pages.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 212 |
| Tovu | apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 212 |
| Jini | packages/integrations/src/api-connections/host.ts | LOADED | 0.96 | 100.00 | 0.00 | 0.96 | 206 |
| Jini | packages/chat/src/react/components/QuestionForm.tsx | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 202 |
| Jini | packages/devops/src/static-export/runner.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 201 |
| Tovu | development/scripts/dev-desktop.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 197 |
| Jini | packages/devops/src/deploy/ops-runner.ts | LOADED | 8.02 | 0.00 | 0.00 | 8.02 | 195 |
| Jini | packages/chat/src/react/components/Composer.tsx | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 192 |
| Jini | packages/plugins/src/host/node/runtime-core.ts | LOADED | 55.76 | 60.26 | 51.06 | 55.76 | 192 |
| Jini | packages/agent-plugins/cloudflare/worker/forms-receiver.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 189 |
| Tovu | development/evals/tool-search-distractors.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 188 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 187 |
| Jini | packages/chat/src/react/hooks/useComposer.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 180 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 176 |
| Tovu | apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 175 |
| Jini | packages/agent-plugins/cloudflare/lib/forms.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 174 |
| Jini | packages/chat/src/react/components/ToolCard.tsx | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 173 |
| Tovu | development/evals/tool-search-parent-tool-delete.eval.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 172 |
| Jini | packages/chat/src/store/sql/store.ts | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 171 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs | NEVER-LOADED | 0.00 | 0.00 | 0.00 | 0.00 | 165 |

### Top 50 zero-coverage files (full list: coverage.tsv zero_coverage=yes, 597 rows)

| repo | file | status | uncovered_lines |
| --- | --- | --- | --- |
| Tovu | development/scripts/extraction-dossier.mjs | NEVER-LOADED | 1666 |
| Jini | packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts | NEVER-LOADED | 427 |
| Jini | packages/plugins/src/host/tools/management.ts | LOADED | 426 |
| Tovu | development/scripts/measure-site-memory.mjs | NEVER-LOADED | 420 |
| Jini | packages/db/src/data-modules/data-module.ts | LOADED | 399 |
| Jini | packages/integrations/src/credentialed-http/tools/tool-registrations.ts | LOADED | 391 |
| Tovu | development/scripts/dev.mjs | NEVER-LOADED | 379 |
| Tovu | development/scripts/check-architecture.ts | NEVER-LOADED | 372 |
| Jini | packages/agent-plugins/src/connect/connect-tool.ts | LOADED | 313 |
| Tovu | development/scripts/build-brand-icons.mjs | NEVER-LOADED | 309 |
| Jini | packages/agent-plugins/s3-compatible/targets/s3-compatible.mjs | NEVER-LOADED | 307 |
| Jini | packages/agent-plugins/vercel/targets/vercel.mjs | NEVER-LOADED | 269 |
| Jini | packages/agent-plugins/meilisearch/providers/meilisearch.mjs | NEVER-LOADED | 254 |
| Jini | packages/chat/src/react/hooks/assistant-chats.ts | NEVER-LOADED | 244 |
| Jini | packages/chat/src/store/runtime/durable-run-store.ts | NEVER-LOADED | 243 |
| Jini | packages/chat/src/embed-widget/browser/frontend-session-bridge.ts | NEVER-LOADED | 239 |
| Jini | packages/agent-plugins/github/source-control/write-files.mjs | NEVER-LOADED | 238 |
| Jini | packages/chat/src/react/components/Markdown.tsx | NEVER-LOADED | 237 |
| Tovu | development/scripts/check-outbox-bridge.ts | NEVER-LOADED | 236 |
| Jini | packages/chat/src/embed-widget/vanilla/index.ts | NEVER-LOADED | 235 |
| Jini | packages/devops/src/checks/hardwiring.ts | NEVER-LOADED | 232 |
| Jini | packages/agent-plugins/github/source-control/commit-site.mjs | NEVER-LOADED | 230 |
| Tovu | development/evals/tool-search-parent-tool-read.eval.ts | NEVER-LOADED | 230 |
| Jini | packages/devops/src/packaging/electron/staging.ts | NEVER-LOADED | 224 |
| Tovu | development/evals/tool-search-argument-fill.eval.ts | NEVER-LOADED | 215 |
| Jini | packages/agent-plugins/github-pages/targets/github-pages.mjs | NEVER-LOADED | 212 |
| Tovu | apps/desktop/scripts/verify-find-in-page.ts | NEVER-LOADED | 212 |
| Jini | packages/chat/src/react/components/QuestionForm.tsx | NEVER-LOADED | 202 |
| Jini | packages/devops/src/static-export/runner.ts | NEVER-LOADED | 201 |
| Tovu | development/scripts/dev-desktop.mjs | NEVER-LOADED | 197 |
| Jini | packages/chat/src/react/components/Composer.tsx | NEVER-LOADED | 192 |
| Jini | packages/agent-plugins/cloudflare/worker/forms-receiver.mjs | NEVER-LOADED | 189 |
| Tovu | development/evals/tool-search-distractors.ts | NEVER-LOADED | 188 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/recon-site.mjs | NEVER-LOADED | 187 |
| Jini | packages/chat/src/react/hooks/useComposer.ts | NEVER-LOADED | 180 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/asset-harvest.mjs | NEVER-LOADED | 176 |
| Tovu | apps/desktop/scripts/verify-site-power.ts | NEVER-LOADED | 175 |
| Jini | packages/agent-plugins/cloudflare/lib/forms.mjs | NEVER-LOADED | 174 |
| Jini | packages/chat/src/react/components/ToolCard.tsx | NEVER-LOADED | 173 |
| Tovu | development/evals/tool-search-parent-tool-delete.eval.ts | NEVER-LOADED | 172 |
| Jini | packages/chat/src/store/sql/store.ts | NEVER-LOADED | 171 |
| Jini | packages/agent-runtime/src/skills/web-clone/scripts/interaction-probe.mjs | NEVER-LOADED | 165 |
| Jini | packages/chat/src/server/durable-runs/recover.ts | NEVER-LOADED | 162 |
| Jini | packages/chat/src/react/hooks/composer-draft-cache.ts | NEVER-LOADED | 158 |
| Tovu | .claude/skills/tovu-demo-video/scripts/take-example.mjs | NEVER-LOADED | 158 |
| Tovu | content/themes/__original-themes__/static/tovu-starter/scripts/main.js | NEVER-LOADED | 158 |
| Tovu | content/themes/__original-themes__/static/tovu-theme/scripts/main.js | NEVER-LOADED | 158 |
| Tovu | content/themes/static/tovu-starter/scripts/main.js | NEVER-LOADED | 158 |
| Tovu | content/themes/static/tovu-theme/scripts/main.js | NEVER-LOADED | 158 |
| Jini | packages/agent-plugins/src/connect/access-token-tool.ts | LOADED | 156 |

### Failure totals (277)

| repo / class / basis | count |
| --- | --- |
| Jini / TEST DRIFT / assertion-mismatch | 8 |
| Jini / TEST DRIFT / timeout | 2 |
| Tovu / ENV / cancelled-by-parent(postgres) | 19 |
| Tovu / ENV / chromium | 15 |
| Tovu / ENV / network | 1 |
| Tovu / ENV / postgres | 112 |
| Tovu / PRODUCT / exception-in-source | 2 |
| Tovu / TEST DRIFT / assertion-mismatch | 80 |
| Tovu / TEST DRIFT / default | 32 |
| Tovu / TEST DRIFT / linked-jini-plugin-asset-missing | 3 |
| Tovu / TEST DRIFT / module-resolution | 3 |

### Failures, top 50 (PRODUCT and TEST DRIFT first; full list: failures.tsv)

| repo | file | test | class | basis | error |
| --- | --- | --- | --- | --- | --- |
| Tovu | apps/admin/src/components/__tests__/AssistantDock.chat-settings.unit.test.tsx | AssistantDock Chat settings keeps personal MCP opt-in and the master OFF while other local-owner per | PRODUCT | exception-in-source | Error: [2mexpect([22m[31melement[39m[2m).not.toBeChecked()[22m Received element is checked: |
| Tovu | apps/website/src/server/runtime/composition/__tests__/storage-secret.unit.test.ts | new-site sealing prepares its identified key file and the default reader reopens it | PRODUCT | exception-in-source | /home/user/Tovu/apps/website/src/features/webhooks/keyring.env.ts:149 throw new Error(`no site key: none of the configured sources resolved (${this.sources.map(describeSiteKeySource).join(", ")})`); ^ Error: no site key: |
| Tovu | apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts | chat FAB z-order sits above every in-page layer; only blocking modals and their popovers go higher | TEST DRIFT | assertion-mismatch | AssertionError: expected [ Array(1) ] to deeply equal [] at /home/user/Tovu/apps/admin/src/__tests__/unit/chat-fab-z-order-css.unit.test.ts:82:19 at file:///home/user/Tovu/apps/admin/node_modules/@vitest/runner/dist/chun |
| Tovu | apps/admin/src/components/__tests__/AssistantDock.chat-settings.unit.test.tsx | AssistantDock Chat settings passes the effective current CLI limits to the picker before a message i | TEST DRIFT | assertion-mismatch | AssertionError: expected { nativeToolAccess: true, …(3) } to deeply equal { nativeToolAccess: true, …(3) } Ignored nodes: comments, script, style |
| Tovu | apps/admin/src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts | (file/suite failed to run) | TEST DRIFT | module-resolution | Cannot find module 'file:///home/user/Jini/packages/provider-plugins/plugins/charts-recharts/0.6.24/client/provider.js' imported from /home/user/Tovu/apps/admin/src/integrations/chart-providers/__tests__/recharts-bundle- |
| Tovu | apps/admin/src/lib/__tests__/admin-literal-copy.unit.test.ts | production admin features and shared components add no untranslated JSX copy | TEST DRIFT | assertion-mismatch | AssertionError: Translate new copy through its owner: features/sites/SiteImportTab.tsx:223 placeholder "https://": expected [ { …(4) } ] to deeply equal [] at /home/user/Tovu/apps/admin/src/lib/__tests__/admin-literal-co |
| Tovu | apps/desktop/src/jini-mcp-peers.test.ts | the packaged desktop can load its shared agent daemon supervisor without the site payload | TEST DRIFT | assertion-mismatch | Expected values to be strictly equal: '0.7.0' !== '0.7.1' |
| Tovu | apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts | every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected + [ + 'assistant/ask-choice-custom-answer.ts:143: args', + 'cli/commands/import-local.ts:151: file' + ] - [] |
| Tovu | apps/website/src/assistant/__tests__/moved-tools.golden.test.ts | moved tools, cards, approvals and counters match the golden recorded before any move | TEST DRIFT | assertion-mismatch | catalog + actual - expected { + bytes: 752572, - bytes: 752240, names: 328 } |
| Tovu | apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts | tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI,  | TEST DRIFT | assertion-mismatch | introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help + actual - expected ... Skipped lines [ 'owner-store status', 'owner-store list', 'o |
| Tovu | apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts | tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected ... Skipped lines [ 'tovu_owner-store_status', 'tovu_owner-store_list', 'tovu_owner-store_put', 'tovu_owner-store_delete', ... 'tovu_import', + 'tovu_import- |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | a declared API connection connects through the real host: waiting card, then connected card, status  | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | API sign-in displays only the declaring plugin oauth card copy | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | a failed connected-card update never turns a real connection into a tool failure | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts | with no poll interval or wait bound configured, the built-in defaults still let a finished sign-in c | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts | vertical slice: connect -> public callback -> plugin access token -> form-delivery credential | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/api-connections/__tests__/api-connection-slice.test.ts | security: a form-delivery credential stays on the job's frozen account, for the attempt and for ever | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/api-connections/__tests__/surface-adapters.security.test.ts | workspace: every connection-ref operation names the port's workspace (connect, confirm, cancel, disc | TEST DRIFT | default | 'Invalid URL' |
| Tovu | apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts | no generic seam file names the first provider | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected + [ + 'apps/website/src/features/agent-plugins/__tests__/unit/overlay-guidance-single-copy.unit.test.ts:33', + 'apps/website/src/features/agent-plugins/__tes |
| Tovu | apps/website/src/features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts | real core tree has only reviewed pattern exceptions, each with its exact current total | TEST DRIFT | assertion-mismatch | Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: + actual - expected + [ + 'apps/admin/src/lib/admin-nav-i18n.ts: commerce 22', + 'apps/admin/src/panels.tsx: commerce 4', + 'apps/admin/src/{comp |
| Tovu | apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts | startPublishRun: a history-store failure never changes the reported outcome — best-effort only | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected [ [ + "[plugin-runtime] bundled initialization failed for 'charts-recharts'", + "PluginLoadError: plugin 'charts-recharts' failed to load (INTEGRITY_FAILED)\ |
| Tovu | apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts | a registry reload failure logs a sanitized warning and preserves outcome-only history | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected [ [ + "[plugin-runtime] bundled initialization failed for 'charts-recharts'", + "PluginLoadError: plugin 'charts-recharts' failed to load (INTEGRITY_FAILED)\ |
| Tovu | apps/website/src/features/theme/__tests__/shipped-theme-original-drift.canary.test.ts | canary: shipped theme static/tovu-starter's committed original matches what the generator produces f | TEST DRIFT | assertion-mismatch | content/themes/__original-themes__/static/tovu-starter no longer matches what 'tovu theme sync-originals' generates from content/themes/static/tovu-starter. generated but not committed: (none) committed but not generated |
| Tovu | apps/website/src/features/webhooks/__tests__/seal-aad-invariant.test.ts | the CLI exits successfully and prints OK when the real repository has no seal violations | TEST DRIFT | assertion-mismatch | Expected values to be strictly equal: + actual - expected + Error: spawnSync /root/.local/node24/bin/node ETIMEDOUT + at Object.spawnSync (node:internal/child_process:1191:20) + at spawnSync (node:child_process:929:24) + |
| Tovu | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | psql() returns ok:true with stdout for a successful query | TEST DRIFT | assertion-mismatch | Expected values to be strictly equal: false !== true |
| Tovu | apps/website/src/platform/db/__tests__/pg-fixture.unit.test.ts | recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails | TEST DRIFT | assertion-mismatch | Expected values to be strictly equal: false !== true |
| Tovu | apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts | no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) | TEST DRIFT | assertion-mismatch | New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead. + actual - expected + [ + 'apps/website/src/features/plugin-runtime/host-tool-binding.ts: prepare |
| Tovu | apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts | TEST DRIFT | default | "Cannot read properties of undefined (reading 'close')" |
| Tovu | apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts | apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts | TEST DRIFT | default | 'test failed' |
| Tovu | apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts | /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test | TEST DRIFT | assertion-mismatch | 'The "path" argument must be of type string or an instance of Buffer or URL. Received undefined' |
| Tovu | apps/website/src/server/__tests__/admin-local-boot-session-route.test.ts | security: a failing pull or a throwing sign-in port never changes the sign-in response, and logs no  | TEST DRIFT | default | "timed out waiting for the failed pull's log line" |
| Tovu | apps/website/src/server/__tests__/assistant-byok-routes.test.ts | /api/admin/v1/assistant/byok-turn sends a metadata note then loads guidance through the real delegat | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected + [ + { + event: 'error', + payload: { + code: '500', + message: 'stub provider respond() threw', + type: 'error' + } + } + ] - [] |
| Tovu | apps/website/src/server/__tests__/routes/forms-submit.test.ts | POST /forms/:slug/submit: AC-13 — a honeypot-tripped request returns the identical 201 accepted resp | TEST DRIFT | assertion-mismatch | 'Missing expected rejection (FormRateLimitExceededError).' |
| Tovu | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a missing owner before minting a session | TEST DRIFT | assertion-mismatch | Expected values to be partially and strictly deep-equal: + actual - expected { code: 'INTERNAL_ERROR', + error: 'The request could not be completed. Check the result before repeating this operation. Report this error ID. |
| Tovu | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a disabled owner before minting a session | TEST DRIFT | assertion-mismatch | Expected values to be partially and strictly deep-equal: + actual - expected { code: 'INTERNAL_ERROR', + error: 'The request could not be completed. Check the result before repeating this operation. Report this error ID. |
| Tovu | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption rejects a member owner before minting a session | TEST DRIFT | assertion-mismatch | Expected values to be partially and strictly deep-equal: + actual - expected { code: 'INTERNAL_ERROR', + error: 'The request could not be completed. Check the result before repeating this operation. Report this error ID. |
| Tovu | apps/website/src/server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts | boot redemption refuses a minted session that Jini cannot validate before setting a cookie | TEST DRIFT | assertion-mismatch | Expected values to be partially and strictly deep-equal: + actual - expected { code: 'INTERNAL_ERROR', + error: 'The request could not be completed. Check the result before repeating this operation. Report this error ID. |
| Tovu | apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts | AGENT_PLUGIN_SET_ENABLED: post-activation discovery failure preserves the successful toggle (object) | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected [ [ + "[plugin-runtime] bundled initialization failed for 'charts-recharts'", + "PluginLoadError: plugin 'charts-recharts' failed to load (INTEGRITY_FAILED)\ |
| Tovu | apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts | AGENT_PLUGIN_SET_ENABLED: post-activation discovery failure preserves the successful toggle (string) | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected [ [ + "[plugin-runtime] bundled initialization failed for 'charts-recharts'", + "PluginLoadError: plugin 'charts-recharts' failed to load (INTEGRITY_FAILED)\ |
| Tovu | apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/browser-provider.integration.test.ts | step 5: metadata points only to digest-pinned admitted bytes; disable retires metadata and URLs | TEST DRIFT | assertion-mismatch | Expected values to be strictly equal: + actual - expected + undefined - 'plugin.recharts' |
| Tovu | apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop.routes.pins.test.ts | plan uploads a selected file's bytes the peer is missing before staging the bundle | TEST DRIFT | default | 'Express request did not finish' |
| Tovu | apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site-listing.unit.test.ts | publish preview: refusals are logged; with a configured credential an invalid credentialId is a 400, | TEST DRIFT | assertion-mismatch | Expected values to be strictly deep-equal: + actual - expected [ [ "[publish-site] plugin 'broken' refused: descriptor id collides with 'fixture'" ], [ + "[plugin-runtime] bundled initialization failed for 'charts-rechar |
| Tovu | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts | plugin preflight sends only the live run id and closes after receiving its prepared prefix | TEST DRIFT | assertion-mismatch | [ { "code": "invalid_type", "expected": "array", "received": "undefined", "path": [ "pluginIds" ], "message": "Required" } ] |
| Tovu | apps/website/src/server/inbound/assistant/__tests__/integration/component-catalog-routes.integration.test.ts | the real daemon answers component-catalog search, describe, and a 404 over real HTTP | TEST DRIFT | assertion-mismatch | expected the daemon to start listening, but it exited: [agent-daemon] failed to start standalone daemon requires its site binding + actual - expected + 'exited' - 'listening' |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | handlebars-worker.ts source graph contains no @jini-ai package roots, including deferred imports | TEST DRIFT | assertion-mismatch | handlebars-worker.ts names @jini-ai root barrels; use narrow export subpaths: /home/user/Jini/packages/cms/dist/core/form-collection.js -> @jini-ai/core /home/user/Jini/packages/cms/dist/core/keyset-cursor.js -> @jini-ai |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | handlebars-worker.ts loads no database, blob-store or agent packages | TEST DRIFT | assertion-mismatch | handlebars-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: /home/user/Jini/packages/cms/dist/core/form-collection.js -> @jini-ai/core /home/user/Jini/packages/cms/dist/forms/submit-service.js -> @jini |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | liquid-worker.ts source graph contains no @jini-ai package roots, including deferred imports | TEST DRIFT | assertion-mismatch | liquid-worker.ts names @jini-ai root barrels; use narrow export subpaths: /home/user/Jini/packages/cms/dist/core/form-collection.js -> @jini-ai/core /home/user/Jini/packages/cms/dist/core/keyset-cursor.js -> @jini-ai/cor |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts | liquid-worker.ts loads no database, blob-store or agent packages | TEST DRIFT | assertion-mismatch | liquid-worker.ts loaded @jini-ai root barrels; use narrow export subpaths: /home/user/Jini/packages/cms/dist/core/form-collection.js -> @jini-ai/core /home/user/Jini/packages/cms/dist/forms/submit-service.js -> @jini-ai/ |
| Tovu | apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts | AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site rend | TEST DRIFT | default | 'Express request did not finish' |
| Tovu | apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts | vertical slice: connect -> public callback -> executable tool call -> admin-surface action, all thro | TEST DRIFT | default | 'Invalid URL' |

### Test-quality totals

| repo | files | tests | no_assert | weak_only | snapshot_only | indirect | mocks_uut | skip | only | todo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tovu | 4396 | 42025 | 27 | 605 | 0 | 251 | 0 | 77 | 0 | 3 |
| Jini | 3787 | 45153 | 23 | 395 | 11 | 148 | 0 | 77 | 0 | 13 |

### Test files with the most flagged tests, top 50 (663 files flagged; full list: test-quality.tsv)

| repo | file | tests | no_assert | weak_only | snapshot_only | skip | todo | flagged |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts | 215 | 0 | 30 | 0 | 0 | 0 | 30 |
| Tovu | apps/website/src/features/theme/validation/__tests__/validate-theme-package.test.ts | 61 | 0 | 26 | 0 | 0 | 0 | 26 |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/render-blocks-site-branches.unit.test.ts | 36 | 0 | 26 | 0 | 0 | 0 | 26 |
| Jini | packages/plugins/src/host/__tests__/unit/manifest.unit.test.ts | 38 | 0 | 17 | 0 | 0 | 0 | 17 |
| Tovu | apps/website/src/features/theme/__tests__/menu-tree-render.test.ts | 28 | 0 | 16 | 0 | 0 | 0 | 16 |
| Tovu | apps/admin/src/features/sites/__tests__/Sites.unit.test.tsx | 57 | 0 | 13 | 0 | 0 | 0 | 13 |
| Jini | examples/neutral-host/src/neutral-host/neutral-host.test.ts | 15 | 0 | 0 | 0 | 0 | 13 | 13 |
| Jini | packages/platform/src/__tests__/shell.test.ts | 9 | 0 | 0 | 0 | 10 | 0 | 10 |
| Tovu | apps/website/src/features/theme/__tests__/handlebars-allowlist.test.ts | 40 | 0 | 9 | 0 | 0 | 0 | 9 |
| Tovu | development/scripts/__tests__/check-governance-adr-scope-drift.test.ts | 24 | 0 | 8 | 0 | 1 | 0 | 9 |
| Tovu | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts | 13 | 0 | 8 | 0 | 0 | 0 | 8 |
| Jini | packages/plugins/src/glue/__tests__/manifest.test.ts | 16 | 0 | 8 | 0 | 0 | 0 | 8 |
| Tovu | apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts | 9 | 0 | 7 | 0 | 0 | 0 | 7 |
| Jini | packages/sidecar/src/__tests__/index.test.ts | 67 | 3 | 0 | 0 | 4 | 0 | 7 |
| Jini | packages/ui/src/react/__tests__/components/CustomSelect.test.tsx | 78 | 0 | 7 | 0 | 0 | 0 | 7 |
| Tovu | apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-resume-wiring.unit.test.ts | 17 | 0 | 6 | 0 | 0 | 0 | 6 |
| Tovu | apps/website/src/server/inbound/public-http/http/site/__tests__/render-components-branches.unit.test.ts | 29 | 0 | 6 | 0 | 0 | 0 | 6 |
| Tovu | apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.site-timezone.route.test.ts | 8 | 0 | 6 | 0 | 0 | 0 | 6 |
| Tovu | apps/website/src/server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts | 12 | 0 | 6 | 0 | 0 | 0 | 6 |
| Tovu | development/scripts/__tests__/dead-path-sweep.test.ts | 41 | 0 | 6 | 0 | 0 | 0 | 6 |
| Jini | packages/mcp/src/federation/__tests__/mcp-federation.trust.test.ts | 43 | 0 | 6 | 0 | 0 | 0 | 6 |
| Jini | packages/platform/src/__tests__/download.test.ts | 95 | 0 | 0 | 0 | 6 | 0 | 6 |
| Jini | packages/ui/src/features/connectors/__tests__/components/ConnectorCard.test.tsx | 24 | 0 | 6 | 0 | 0 | 0 | 6 |
| Jini | packages/ui/src/features/connectors/__tests__/components/ConnectorDetailDrawer.test.tsx | 24 | 0 | 6 | 0 | 0 | 0 | 6 |
| Jini | packages/ui/src/utils/__tests__/notifications.test.ts | 28 | 0 | 6 | 0 | 0 | 0 | 6 |
| Tovu | apps/desktop/src/main-move-to-applications-wiring.test.ts | 4 | 0 | 1 | 0 | 4 | 0 | 5 |
| Tovu | apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts | 18 | 4 | 1 | 0 | 0 | 0 | 5 |
| Tovu | apps/website/src/features/theme/__tests__/static-render-api-version.test.ts | 5 | 0 | 5 | 0 | 0 | 0 | 5 |
| Tovu | apps/website/src/features/theme/__tests__/static-render-asset-quotes.test.ts | 5 | 0 | 5 | 0 | 0 | 0 | 5 |
| Tovu | apps/website/src/features/theme/__tests__/static-render-collection.test.ts | 13 | 0 | 5 | 0 | 0 | 0 | 5 |
| Tovu | apps/website/src/platform/db/__tests__/migration-manifest.test.ts | 49 | 0 | 5 | 0 | 0 | 0 | 5 |
| Jini | packages/admin/src/security/react/__tests__/RootKeyTab.test.tsx | 9 | 0 | 5 | 0 | 0 | 0 | 5 |
| Jini | packages/agent-runtime/src/agent-protocol/acp/__tests__/session.test.ts | 126 | 0 | 5 | 0 | 0 | 0 | 5 |
| Jini | packages/daemon/src/agent-executor/__tests__/agent-executor-filesystem-policy.test.ts | 3 | 0 | 0 | 0 | 5 | 0 | 5 |
| Jini | packages/ui/src/features/connectors/__tests__/ConnectorsBrowser.test.tsx | 27 | 0 | 5 | 0 | 0 | 0 | 5 |
| Tovu | apps/admin/src/features/collections/__tests__/rules.unit.test.ts | 53 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx | 41 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/desktop/src/smoke-native.test.ts | 26 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/desktop/src/tovu-server.test.ts | 84 | 0 | 1 | 0 | 3 | 0 | 4 |
| Tovu | apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts | 11 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/activation-durable-write.unit.test.ts | 3 | 0 | 2 | 0 | 2 | 0 | 4 |
| Tovu | apps/website/src/features/agent-plugins/__tests__/unit/resolve-agent-plugin-refs.unit.test.ts | 18 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/identity/__tests__/wiring.test.ts | 19 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/site-backup/__tests__/share-site-plugin-versions.integration.test.ts | 11 | 0 | 0 | 0 | 4 | 0 | 4 |
| Tovu | apps/website/src/features/theme/__tests__/inject-current-entity-content-id.test.ts | 9 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/theme/__tests__/liquid-allowlist.test.ts | 18 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/theme/__tests__/starter-theme-neutral.canary.test.ts | 7 | 0 | 3 | 0 | 1 | 0 | 4 |
| Tovu | apps/website/src/features/theme/__tests__/static-render-post-previews.test.ts | 6 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts | 65 | 0 | 4 | 0 | 0 | 0 | 4 |
| Tovu | apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts | 5 | 0 | 4 | 0 | 0 | 0 | 4 |

### Message-less assert calls (full-tree run of the check:test-safety lint config), top 50 of 1365 files

| file | messageless_asserts |
| --- | --- |
| apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts | 42 |
| apps/website/src/features/custom-credentials/__tests__/credentialed-request.unit.test.ts | 34 |
| apps/website/src/features/site-backup/__tests__/static-copy.unit.test.ts | 33 |
| apps/website/src/features/theme/__tests__/menu-tree-render.test.ts | 31 |
| apps/website/src/cli/__tests__/integration/owner-store.integration.test.ts | 28 |
| apps/website/src/features/external-mcp/__tests__/external-mcp-store.test.ts | 27 |
| apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts | 27 |
| apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts | 26 |
| apps/website/src/features/external-mcp/__tests__/external-mcp-dcr.test.ts | 25 |
| apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts | 24 |
| apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts | 24 |
| apps/website/src/features/agent-plugins/__tests__/unit/resolve-agent-plugin-refs.unit.test.ts | 23 |
| apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts | 23 |
| apps/website/src/features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts | 23 |
| apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts | 22 |
| apps/website/src/features/theme/migration/__tests__/migrate-theme.test.ts | 22 |
| apps/website/src/features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts | 21 |
| apps/website/src/server/__tests__/admin-external-mcp-oauth-routes.test.ts | 20 |
| apps/website/src/server/inbound/public-http/http/site/__tests__/render-blocks-site-branches.unit.test.ts | 20 |
| apps/website/src/features/consent/__tests__/service.test.ts | 19 |
| apps/website/src/features/theme/__tests__/entry-list-render.test.ts | 19 |
| apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts | 18 |
| apps/website/src/assistant/mcp-federation/__tests__/registrations.test.ts | 18 |
| apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts | 18 |
| apps/website/src/features/members/__tests__/write-service.test.ts | 18 |
| apps/website/src/server/__tests__/routes/post-template-site-serving.test.ts | 18 |
| development/scripts/__tests__/coverage-changed.test.ts | 18 |
| apps/website/src/features/publish-content/__tests__/file-tree-policy.boundary.test.ts | 17 |
| apps/website/src/features/site-backup/__tests__/sources.unit.test.ts | 17 |
| apps/website/src/assistant/__tests__/content-read-tool.test.ts | 16 |
| apps/website/src/features/identity/__tests__/tool-registrations.human-confirm.test.ts | 16 |
| apps/website/src/features/theme/__tests__/code-tier-asset-normalizer.test.ts | 16 |
| apps/website/src/server/__tests__/assistant-byok-routes.test.ts | 16 |
| apps/website/src/server/__tests__/visitor-assistant-safety.integration.test.ts | 16 |
| development/scripts/__tests__/dead-path-sweep.test.ts | 16 |
| apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts | 15 |
| apps/website/src/features/custom-credentials/__tests__/extract-s8-x-host-operations.test.ts | 15 |
| apps/website/src/features/media-import/__tests__/fetch-image.test.ts | 15 |
| apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts | 15 |
| apps/website/src/assistant/__tests__/byok-provider-turn.test.ts | 14 |
| apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts | 14 |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-compliance-package.unit.test.ts | 14 |
| apps/website/src/features/deployments/static-publish/__tests__/verify.unit.test.ts | 14 |
| apps/website/src/features/newsletter/__tests__/confirmation.test.ts | 14 |
| apps/website/src/features/newsletter/__tests__/errors.test.ts | 14 |
| apps/website/src/features/publish-content/__tests__/peer-transport.l061.test.ts | 14 |
| apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts | 14 |
| apps/website/src/features/theme/__tests__/theme.test.ts | 14 |
| apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts | 14 |
| apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts | 14 |

## Test quality (static, script-only)

Script: `scripts/test-quality.mjs` (TypeScript-AST scan of every git-tracked `*.test.*` / `*.spec.*` file in both repos, excluding
`node_modules`, `dist`, and Jini's `AI-Dev-Shop/`, `ADS-memory/`, `foundry/`). No test file was read or judged by the model;
every number below is script output. Per-file results: `test-quality.tsv`; per-area totals: `test-quality-by-area.tsv`.

What each column counts (heuristics, stated in the script header):

- `tests`: `test()`/`it()` calls, including `.each`, `.skip`, `.only` and `.concurrent` variants and `t.test` subtests. Hooks (`test.before`, `test.after`, etc.) are excluded.
- `no_assert`: tests whose callback has no assertion call (`expect…`, `assert…`, Node assert functions), no helper named `assert*`/`expect*`/`verify*`/`check*`/`should*`/`ensure*`/`must*`, and no call to a function in the same file that itself asserts, directly or transitively.
  - Known false positives: tests that delegate to an imported helper with a non-assert name, and tests that rely on an implicit throw.
- `weak_only`: tests whose every assertion is a truthiness, existence or no-throw check (`ok(x)`, `assert(x)`, `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `not.toBeUndefined`, `not.toBeNull`, `not.toThrow`, `doesNotThrow`, `doesNotReject`).
- `snapshot_only`: tests whose every assertion is a snapshot.
- `indirect`: tests with no direct assertion but with an asserting helper. These are not counted in `no_assert`.
- `mocks_uut`: `vi.mock` / `vi.doMock` / `jest.mock` / `mock.module` calls on a relative specifier whose basename equals the test file's subject name (the test basename with `.test` and suffixes like `.unit` or `.integration` stripped).
- `skip` / `only` / `todo`: `.skip`/`.skipIf`/`xit`/`xdescribe`/`{ skip }`/`t.skip()`, `.only`/`fit`/`{ only }`, and `.todo`/`{ todo }`/`t.todo()`.

| repo | test files | tests | no_assert | weak_only | snapshot_only | indirect | mocks_uut | skip | only | todo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tovu | 4396 | 42025 | 27 | 605 | 0 | 251 | 0 | 77 | 0 | 3 |
| Jini | 3787 | 45153 | 23 | 395 | 11 | 148 | 0 | 77 | 0 | 13 |

Notes:

- `mocks_uut` = 0 in both repos under this heuristic, i.e. no test mocks a module whose name equals the unit under test. The heuristic does not catch mocks of the unit through a barrel or index re-export.
- `only` = 0 in both repos.
- Area breakdown (`test-quality-by-area.tsv`): `no_assert` is highest in `apps/website` (24), `packages/provider-plugins` (5) and `packages/ui` (4). `weak_only` is highest in `apps/website` (458), `packages/ui` (158), `apps/admin` (72) and `apps/desktop` (34). `skip` is highest in `apps/website` (52), `packages/platform` (24), `packages/agent-runtime` (16) and `apps/desktop` (16).

### `npm run check:test-safety` (Tovu)

- Ran against `origin/main`: **FAIL**, exit 1. It is a diff check, so it only looks at test files this branch changed relative to its merge-base with main. Two files hold more message-less asserts than their merge-base copy:
  - `apps/website/src/assistant/__tests__/ask-choice-custom-answer.test.ts`: 0 → 1
  - `apps/website/src/features/plugin-runtime/__tests__/unit/plugins-tool-registrations.unit.test.ts`: 2 → 4
- I also ran the same lint config over the whole tree with `scripts/test-safety-all.mjs`, an ESLint API run with no diff gating. It scanned **3,230** test files and found **1,365** files with **4,722** message-less `assert` / `assert.ok` / `assert.strict` calls. Per file: `test-safety-all.tsv`. Raw: `raw/tovu-check-test-safety.txt`, `raw/tovu-test-safety-all.txt`.

### `npm run quality:semgrep:test` (Tovu): did not run

Exit 127: "Semgrep is not installed". Semgrep is a Python CLI, not an npm package, so it cannot be installed under the brief's `npx --yes <tool>@<version>` rule. Raw: `raw/tovu-quality-semgrep-test.txt`.

## Mutation pilot (StrykerJS)

- **Slice:** Jini `packages/protocol`, the only slice run. It has 12 source files (1,105 lines, 5 of them with runtime code that Stryker could mutate) and 13 test files with 205 vitest tests. Its line, statement and function coverage is 100%.
- **Tool:** StrykerJS **9.6.1** with `@stryker-mutator/vitest-runner` 9.6.1, vitest 2.1.9 (the version Jini uses), and typescript 5.9.3 (Jini's version, needed by Stryker's tsconfig preprocessor). All were installed via `npx --yes -p …` into the npx cache, from a neutral cwd.
- **Config:** `stryker/stryker.protocol.config.json`: default mutators, `coverageAnalysis: perTest`, concurrency 2.
- **Setup issues:** two attempts failed before the run (`raw/stryker-protocol-attempt1.txt`, `raw/stryker-protocol-attempt2.txt`). When npx runs inside the Jini workspace it skips installing `typescript`/`vitest` into its cache because they already exist in the workspace. Stryker, running from the cache, then cannot resolve `typescript`. Installing from `/tmp` and running the cached `stryker` binary from the package dir fixed it.
- **Result:** 308 mutants. Done in **1 min 59 s** (120 s wall), well under the 40-min step cap.

| file | score % | killed | timeout | survived | no coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| **all** | **98.05** (covered 98.37) | 302 | 0 | 5 | 1 |
| delegated-result.ts | 95.65 | 88 | 0 | 4 | 0 |
| errors.ts | 98.41 | 62 | 0 | 0 | 1 |
| registry.ts | 100.00 | 99 | 0 | 0 | 0 |
| run-context.ts | 97.96 | 48 | 0 | 1 | 0 |
| run.ts | 100.00 | 5 | 0 | 0 | 0 |

Stryker also warned that 97 of the 308 mutants (31%) were static mutants, estimated to take 81% of the run time.

**Surviving and no-coverage mutants.** The brief asked for 10 example survivors; only 6 mutants were not killed, so all 6 are listed (also in `stryker/survivors-protocol.tsv`; full report `stryker/mutation-protocol.json`):

| file:line:col | mutator | status | replacement |
| --- | --- | --- | --- |
| src/delegated-result.ts:13:10 | ConditionalExpression | Survived | `true` |
| src/delegated-result.ts:17:52 | ConditionalExpression | Survived | `false` |
| src/delegated-result.ts:28:7 | ConditionalExpression | Survived | `false` |
| src/delegated-result.ts:36:11 | BlockStatement | Survived | `{}` |
| src/run-context.ts:56:11 | BlockStatement | Survived | `{}` (a `catch { return undefined; }` emptied) |
| src/errors.ts:91:23 | StringLiteral | NoCoverage | `""` (default `fallbackMessage`) |

So 100% line coverage in this package still leaves 6 mutants that no test kills. Four of them are in `delegated-result.ts` conditionals.

## What did not run, or ran differently, and why

- **Semgrep (`quality:semgrep:test`): not run.** Semgrep is not installed, and it is not an npm package, so the brief's `npx` rule cannot install it.
- **Statements metric for node:test files:** LCOV has no statements, so for those files it equals lines (`statements_source = lines` in `coverage.tsv`). Vitest json-summary statements were used for admin and Jini.
- **Jini `commerce`:** its node:test unit files ran (pass) but without coverage.
- **Jini scope:** coverage comes only from each package's own vitest config. Files that only Tovu's tests load (through `link:jini`) do not count toward Jini.
- **Root shards:** reorganised several times to fit the cap; see "How each suite was run". Stopped partial runs (`raw/aborted/`) are excluded. The `exit 137` lines in `raw/tovu-root-shards-timing.txt` are deliberate wrapper kills, not test results.
- **Test byproducts:** the test runs left untracked staging files under `sites/tovu-dev/` and a `chat.db` in the Tovu root. They are excluded from the coverage denominator and were not committed.
- **Failure classes** are regex heuristics on error text, as the owner instructed (no file reading). The PRODUCT and TEST DRIFT split is a triage hint, and 32 Tovu rows matched no rule (`basis = default`).
