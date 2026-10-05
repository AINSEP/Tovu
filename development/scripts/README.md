# Development scripts

## Coverage of changed source files

```bash
development/scripts/coverage-changed.sh HEAD~1 --out /tmp/tovu-changed-coverage
```

Use a git ref or a Codex job report (`CHANGED FILES:` / `TESTS TO RUN:` blocks) as the first
argument. Git mode includes staged/unstaged differences from that commit and untracked source
under `apps/` and `development/`. Report mode measures exactly its reported source set.
Tests, fixtures, declarations and generated output are excluded and listed. Report `(deleted)`
suffixes and git `D` status produce **deleted — not measured** rows. Missing non-deleted paths
produce warning rows; both are excluded from coverage gaps and do not block other measurements.
All remaining changed source files stay in the denominator: a test that mocks a module does not
cover it. After executed tests, a file with no instrumented hits is **0% / NOT LOADED**. Without
confirmed aggregate execution or surviving singleton coverage it is **NOT RUN**, with unknown
(`null` / N/A) metrics. Surviving singleton images from aborted aggregates are partial diagnostics.

The command discovers tests through static imports (including literal dynamic imports,
re-exports, `require`, `#src`, admin aliases), feature/own `__tests__` directories and report
paths. It ranks relevant report tests first, own directory/feature next, direct one-hop importers
by path proximity next, then wider transitive importers. Standalone report tests are retained.
Only git tracked plus nonignored untracked tests are eligible; `_tmp-*` paths are never selected.
It prints why each test was selected and exact omitted paths. Default cap: **20 tests per changed
file**, `--max-tests N` (1–200). Round-robin allocation serves each file before filling its next
slot. The total cap defaults to **200**; `--max-total-tests N` (1–2000) changes it. A total cap
too small to serve every file emits a warning naming the unserved files.
Computed imports are not statically discoverable.
Missing report tests fail rather than being quietly ignored. Browser E2E paths are reported as
unsupported tool errors; this command does not start browsers or build desktop preloads.

Each test command goes through `ADS-memory/.local-artifacts/test-slots/run-gated.sh`, sequentially,
with one worker and `TOVU_ADMIN_PASSWORD` **unset**. Singleton gate timeout is 600 seconds;
aggregate timeout is twice observed singleton durations plus 60 seconds (minimum 600), or
600 seconds per selected test file when durations are unavailable. Website/server/dev
use Node/tsx coverage with site-chat tsconfig; admin uses its existing Vitest configuration and V8
provider plus a generated exact-file include whitelist; desktop reuses its canonical bare-Node vs
renderer/contracts tsx pass arguments. The gate and the owner `common.md` rules file must exist.

`report.md`, `report.json` and the ready-to-launch **code-only** `fix-prompt.md` appear in `--out`
(default `ADS-memory/.local-artifacts/coverage-changed`). Every invocation creates a fresh `run-*`
subdirectory for raw LCOV, generated admin configs and test logs. It never reads saved
`development/coverage/` output. Reusing `--out` replaces only the three summary files; retained
run directories identify each measurement. Give simultaneous invocations different output roots.

For multiple selected tests on one runner, singleton probes establish which tests recorded real
instrumented hits and one aggregate pass supplies the percentages. Thus the cap bounds unique
test paths, and execution costs up to twice that test set. No branch identities are merged between
the differently scoped probes. Duplicate `SF` records in an aggregate artifact union their hits;
incompatible layouts or dual-instantiation contamination invalidate the measurement. The existing
integrity detector is reused without baseline suppression, also for development source.
If an aggregate aborts or loses sources present in singleton LCOV, surviving whole singleton
images appear as **partial singleton; aggregate incomplete / NOT EVIDENCE**, never false
NOT LOADED zeroes. They cannot authorize code fixes. A gate timeout names the timeout and
completed test points rather than claiming no tests executed; incomplete TAP remains an error.

The report lists line/branch/function percentages, distance in percentage points from 100%,
uncovered LCOV ranges, named functions, branch gap counts/opaque IDs, actual hit provenance and
deterministic advisory triage. `refactor-candidate` means complexity over 9 (AST estimate), hard
runtime/network/process calls, or all selected importing tests using at least four module mocks.
It is an inspection suggestion for trustworthy measured rows, never proof that a gap is
unreachable or exempt from coverage. NOT RUN, missing/deleted and NOT LOADED rows cannot
receive a refactor diagnosis based on static complexity alone. Unknown or failed measurements
are listed for remeasurement in the fix prompt before any production-code fix is proposed.

**Measurement limits:** tsx LCOV positions are instrumented indices, not trustworthy source line
anchors. Its branch IDs cannot identify source arms. Node includes comments/blanks in line totals;
Vitest's source-mapped coverage has a different denominator. Where different runners measure a
file, the tool keeps the most complete *whole* image and retains other artifacts for inspection.
Overall file means include NOT LOADED files at zero and are unknown when any file is NOT RUN;
deleted/missing paths are outside the denominator. Measured hit/total counters are shown
separately per runner because executable counts for unloaded files are unknown. Source changes
during measurement invalidate results only for changed-set files and selected tests.
Other inventoried source/test edits appear as informational notes. Coverage cannot prove assertions or execution in a
serialized browser/process context. Test failure marks all coverage **NOT EVIDENCE**.

The headline explicitly says **no tests ran: reason** when no test executions are confirmed.
Exit: **0** all eligible changed sources have trustworthy 100% lines + branches + functions; **1** gaps, unrun scope or
test failure; **2** tool/input/runner/integrity error. An empty source set exits 0 with zero files
explicitly reported when any explicitly reported tests pass; those tests still run with an empty
coverage include scope. Failed runs still write reports when output creation is possible.

No new dependency: reuses TypeScript, tsx, admin's V8/Istanbul pipeline, desktop TEST_PASSES and
the integrity detector. Installed Istanbul coverage/report APIs do not parse Node LCOV, and
lcov-parse/c8/v8-to-istanbul are absent. The narrow adapter handles the repository's merge and
integrity rules. [diff-cover](https://github.com/Bachmann1234/diff_cover) measures changed *lines*;
a future `--changed-lines` view is useful once source-position accuracy is reliable and would
supplement the whole-file denominator. Pure policy/model are **JINI CANDIDATE** modules; the
sibling Jini checkout is outside this job's writable roots.

Coordinator verification paths (implementation dispatch did not run them):

- `development/scripts/__tests__/coverage-changed-model.test.ts`
- `development/scripts/__tests__/coverage-changed-discovery.test.ts`
- `development/scripts/__tests__/coverage-changed.test.ts`
- `development/scripts/__tests__/coverage-changed-cov3.test.ts` (verbatim trial2 LCOV/TAP fixtures)
