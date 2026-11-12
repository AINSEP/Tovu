# Session COV — coverage + test quality (folder: `cov`, cap 3 hours)
Read `development/cloud/quality-1111/COMMON.md` first; follow it exactly.

1. Full suites WITH coverage (the owner's floor is 99% per file, all 4 metrics: lines, branches, functions, statements):
   - Tovu website: use the existing coverage scripts (`npm run test:cov:server:tiered` or the `test:cov` path), node:test `--test-concurrency=1`; if one run is too slow, split into ~8 shards, 3 at a time, each writing its own lcov. Plus apps/site-chat and development/scripts tests.
   - Tovu admin: `cd apps/admin && npx vitest run --coverage --maxWorkers=2` (all-files coverage).
   - Tovu desktop: its test script with coverage (`npm run build:preload` first).
   - Jini: each package's vitest with `--coverage --coverage.reportOnFailure=true`.
2. Per-file table (`coverage.tsv`: repo, file, lines%, branches%, functions%, statements%, below99=yes/no). Use `npm run coverage:all-files` for Tovu if it works; files with NO test at all count as 0%. Totals: files ≥99% on all 4 / below / zero-coverage, per app/package.
3. Failing tests: every failure with file, test, exact error, class PRODUCT / TEST DRIFT / ENV (`failures.tsv`).
4. Test QUALITY (static, script it under quality-1111/cov/scripts/): per test file count tests with NO assertion; assertions only on truthiness/`ok(x)`/`toBeDefined`/`not.toThrow`; snapshot-only tests; tests that mock the unit under test; `.skip`/`.only`/`todo`; tests whose names don't match what they assert are out of scope. Also run `npm run check:test-safety` and `npm run quality:semgrep:test` if they run. Output `test-quality.tsv` + totals.
5. Mutation pilot (StrykerJS, owner rule: small pilot on ONE slice first): pick ONE small, well-tested Jini package or one Tovu feature folder (≤ ~1,500 lines); run Stryker with its default mutators, 40-minute cap for this step. Report mutation score, surviving mutants count, and 10 example survivors (file:line + mutator). Skip if setup fails; say why.
6. RESULTS.md: setup timings; per-area totals; coverage summary; failures; test-quality totals; mutation pilot; anything that didn't run and why.
