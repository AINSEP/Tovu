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

**Tovu root suite.** This is the exact `npm test` file set: `apps/website`, `content/agent-plugins`, `content/agent-plugin-overlays`, `packages/*`, `apps/site-chat`, `development/scripts` and `development/eslint-rules`, 3,152 test files in all.
- Command: the `test:cov` flags plus `--test-concurrency=1 --test-timeout=300000` (`scripts/tovu-shards.sh`).
- Sharding: 8 round-robin shards, each writing its own lcov and TAP.
- The suite was too slow for the plan as written. Shards 0–2 took about 87–97 min each while sharing the CPU. Three changes were made, all recorded in `raw/tovu-root-shards-timing.txt`:
  1. At 00:41 the fixed 3-at-a-time `xargs` was replaced by a scheduler that ran 5 at a time.
  2. At 01:09 the 80-min timeout wrappers were removed from running shards 0–4 (their test processes kept running), and shards 5–7 were started at once with a 95-min cap.
  3. At 01:38 shards 5 and 6 were stopped and re-run from the start as sub-shards 5a/5b/6a/6b, two halves each, with a 65-min cap. Their partial output is in `raw/aborted/` and is not used.
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
