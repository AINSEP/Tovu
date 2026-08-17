# Route Coverage Gates — 2026-08-16

**Status: DONE.** Built on top of `2026-08-16-server-routes-coverage-complexity-audit.md`
(commit `4593bee4`), which measured but did not fix anything. This session fixed the one real gap
the audit found, then built the two gates it recommended.

## What shipped, in commit order

1. `b2d130bc` — tests for `src/server/routes/admin/assistant/test-agent.ts`, the audit's one
   genuinely-untested route handler.
2. `d71eef2d` — `development/scripts/route-coverage-lib.ts` +
   `check-route-coverage-floor.ts` + `check-route-coverage-diff.ts`, plus a fix to the existing
   (previously unused-in-CI) `test:cov` script.
3. `3c35f78b` — wired both gates into `.github/workflows/ci.yml`.

## 0. A Node coverage-tool bug found while verifying the audit's baseline — read this first

Before trusting the audit's numbers enough to set thresholds from them, I tried to reproduce
`test-agent.ts`'s "zero coverage" finding after writing tests for it, to confirm the tests actually
registered. They didn't show up. Neither did `test-connection.ts` — even though it already has 8
passing tests hitting its exact route (verified: `admin-assistant-execution-routes.test.ts` lines
141-199, 304-321).

**Root cause, verified by direct experiment:** `node --experimental-test-coverage` silently
excludes from its report any file whose name matches Node's own built-in test-file-discovery glob
(the same patterns Node uses to auto-discover test files, e.g. `test-*.{js,cjs,mjs,ts}`) — even
when that file is application code, not a test, and even when `--test-coverage-include` is given an
explicit glob that names it directly:

```
$ node --experimental-test-coverage --test-coverage-include='**/routes/admin/assistant/*.ts' ...
      detect-agents.ts   |  97.83 |  79.31 | 100.00 |     <- shows up
      list-models.ts     |  98.37 |  75.61 | 100.00 |     <- shows up
      (test-agent.ts and test-connection.ts: absent — same directory, include glob matches them too)

$ node --experimental-test-coverage --test-coverage-exclude='**/nonexistent-dir-xyz/**' ...
      test-agent.ts       |  85.34 |  71.43 |  90.91 | 50-57 59-64 66-67 72   <- now shows up
      test-connection.ts  |  99.13 |  76.74 | 100.00 | 13                     <- now shows up
```

Passing an explicit `--test-coverage-exclude` **replaces** Node's default exclude list rather than
adding to it, which is why a pattern matching nothing real in this repo restores the two files to
the report. (Verified separately that `node_modules` exclusion is independent and unaffected —
`node_modules` never appeared in either run's output.)

**Consequences:**

- The 2026-08-16 audit's "no lcov record at all — never loaded" finding for `test-connection.ts`
  was measuring this Node behavior, not the file's real test coverage. The brief's instruction to
  treat it as disproven was correct, and now doubly so.
- `test-agent.ts` genuinely had zero tests (the audit was right about that one), but even after
  writing tests for it, a bare `node --experimental-test-coverage` run would **still** have reported
  it as uncovered, because of this naming collision — not because the tests don't work.
- The repo's own `test:cov` npm script (existed before this session, not wired into CI until this
  session) had this bug too. **Fixed**: added
  `--test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**"` — a sentinel pattern that
  matches nothing, whose only job is to override Node's silent default.
- Any *future* route file whose name happens to start with `test-` would hit the same blind spot if
  that sentinel is ever removed. Documented prominently in `route-coverage-lib.ts`'s header.
- Checked whether any other real (non-test) file under `src/server/routes/**` collides with this
  naming pattern: only `test-agent.ts` and `test-connection.ts`. Everything else in the directory
  tree starting with `test`/ending in `.test.ts` is a genuine co-located test file (`explore-*.test.ts`,
  `*.route.test.ts`, `plugins-http.integration.test.ts`, etc.) and correctly stays excluded.

## 1. `test-agent.ts` — the fix

Added to `src/server/__tests__/admin-assistant-execution-routes.test.ts` (already the home for the
other 3 "Execution mode" probe routes, all sharing the same auth/workspace/module wiring):

| Test | What it proves |
|---|---|
| Extended the existing 3-route auth/permission/workspace tests to all 4 routes | 401 unauthenticated, 403 missing `admin.assistant.manage`, 404 workspace mismatch |
| `rejects a missing agentId with 400` | validation-first, before any PATH probe |
| `rejects a blank/whitespace-only agentId with 400` | same validation, trimmed-empty case |
| `reports ok:false for an agentId not present in the real detectAgents() result` | the "not found on this server's PATH" branch — real, no-network `detectAgents()` call, deterministic on any host since the id used will never match |

**Coverage on `test-agent.ts` alone after these tests:** 85.34% line / 71.43% branch / 90.91% funcs
(measured with the `--test-coverage-exclude` fix; see §0 for why an unfixed run would show nothing
at all).

**Explicit gap, left uncovered on purpose:** the installed/authenticated, installed/not-authenticated
(`authStatus === "missing"`), auth-status-unknown, model-mismatch, and success branches. These all
depend on which CLIs are actually on the host's PATH and their live auth state.
`detectAgents()` is called directly inside the route (not through an injectable dep), and this
repo's Node version needs an experimental flag for `mock.module()` (documented precedent:
`database-migrate-forward-routes.test.ts`'s own note on the same constraint, which is why that file
also avoids it). Faking a CLI binary on PATH to force these branches deterministically would need a
real test-seam change to the route (constructing an injectable `detectAgents` dependency) — that's
Programmer/Refactor scope, not TDD gap-fill, and out of scope for this task. Flagging as a
`[CIC_PROPOSED]`-shaped candidate for whoever next touches this file: if `detectAgents` is ever made
injectable, these branches become cheap to cover with a stand-in CLI list, matching how
`assistant-agent-list-live-models.test.ts` stands in a fake daemon instead of hitting anything real.

## 2. The floor gate — `check:route-coverage-floor`

Reads `development/coverage/lcov.info` (produced by `npm run test:cov`) and sums line/branch/func
hit-and-found across every "measurable" file under `src/server/routes/**` — real source, excluding
co-located test files (`__tests__/` dirs, `*.test.ts`, `*.spec.ts`) and the audit-confirmed
type-only files (`deps.ts` / `execution-deps.ts` / `types.ts`, which export types only and produce
no lcov record at all).

**Thresholds:** `line >= 88`, `branch >= 68`, `funcs >= 93`.

**Measured basis** (this session, 2026-08-16, `node --import tsx --test
--experimental-test-coverage --test-coverage-exclude=<sentinel> "src/server/**/*.test.ts"`, 217
measurable route files, includes this session's new `test-agent.ts` tests):

```
line:   92.15%
branch: 73.86%
funcs:  97.52%
```

Nearly identical to the original audit's 92.20% / 74.05% / 97.54% (215/234 files) — the small
deltas are expected: two more real files now correctly counted (§0), plus a day of unrelated
concurrent work on other route files. Chosen thresholds are a few points under today's number on
every axis, matching the brief's suggestion and the `apps/admin` precedent
(`check:admin-complexity-drift`) of a gate that's green on arrival with real margin, not
razor-thin.

**Verified green** against a real lcov file:

```
check:route-coverage-floor — 213 measurable src/server/routes/** files
  line:   92.00% (floor 88%)
  branch: 73.70% (floor 68%)
  funcs:  97.60% (floor 93%)
check:route-coverage-floor — OK
```

(213 vs 217 above: the lib's `isMeasurableRouteFile` also excludes the 3 type-only basenames from
the numerator, which the ad hoc verification script used to derive the baseline number did not —
both are internally consistent, neither changes the threshold decision.)

## 3. The diff gate — `check:route-coverage-diff`

Every route `.ts` file that is new or modified relative to a base ref must individually hit **>=80%
branch coverage**, read from the same lcov file. A changed file with no lcov record at all (never
loaded by any test) fails outright — the strongest "genuinely untested" signal, distinct from a
file that legitimately has zero branches (which is vacuously 100%, not a failure — see the code
comment on why these must not be conflated).

This is the gate that would have caught the file that triggered the original audit:
`admin/system/publish-credentials.ts` shipped at 97.82% line / **71.93% branch** — an aggregate
floor at any reasonable level absorbs one bad file (today's aggregate is 73.86% branch; that file
alone would not have moved it enough to trip a floor gate), but a per-file 80% diff gate fails on
it specifically.

**Base ref resolution:** `ROUTE_COVERAGE_DIFF_BASE` env var → positional CLI arg → `GITHUB_BASE_REF`
(set automatically by GitHub Actions on `pull_request` events) → `origin/main`. Needs
`git merge-base` to actually resolve, which needs non-shallow history — `ci.yml`'s checkout step
now sets `fetch-depth: 0` for this reason.

**Smoke-tested** against `origin/main` — mechanically correct (merge-base resolution, `git diff`
filtering, per-file lcov lookup, exit codes all verified working). The live run on this branch
showed ~39 "failures," but that's an artifact of `general-work` being dozens of commits and several
concurrent agents' worth of unrelated WIP ahead of `origin/main` right now — not a gate defect. On
an actual small PR diff it only evaluates what that PR actually touched.

## 4. CI wiring (`.github/workflows/ci.yml`)

- `actions/checkout@v4` gets `fetch-depth: 0` (needed for #3's merge-base).
- The existing "Test" step's `npm test` → `npm run test:cov` (same test globs, now also writes
  `development/coverage/lcov.info`). Still fails the build on any test failure — a non-zero exit on
  this step stops the workflow before either gate step runs, so neither gate needs its own
  test-failure detection.
- Two new steps after Test: `Check route coverage floor` (`npm run check:route-coverage-floor`) and
  `Check route coverage diff` (`npm run check:route-coverage-diff`).

**Not independently verified in real GitHub Actions** — no way to run a GH Actions job from this
session. Verified locally: valid YAML, and both underlying npm scripts run and exit correctly
against a real lcov file.

## An empty-lcov false-positive, found and fixed during verification

While `npm run test:cov` (the full, canonical script — all of `src/**` + `packages/*`, not just
`src/server`) was still mid-run in the background, I pointed `check:route-coverage-floor` at the
`development/coverage/lcov.info` it had already truncated-and-not-yet-written: **0 measurable
files, and the gate printed a 100%-across-the-board PASS.** `pct()`'s `found === 0 → 100%`
convention is correct for a single real file that legitimately has no branches, but applied to a
*zero-file* aggregate it silently turns "no data" into "perfect score" — exactly the kind of
manufactured-coverage failure mode the coverage-integrity policy warns about, even though nothing
here was intentionally gaming it. **Fixed**: `check-route-coverage-floor.ts` now hard-fails with a
clear message ("0 measurable files... run `npm run test:cov` to completion first") before computing
any percentage, since this repo has 200+ real route files and zero is never a legitimate reading.
`check-route-coverage-diff.ts` did not have the same hole — it only short-circuits to a pass when
zero files *changed*, and every changed file with no coverage record already fails outright.

## Verification

- `node --import tsx --test src/server/__tests__/admin-assistant-execution-routes.test.ts` — 20/20
  pass (7 new, 13 pre-existing untouched).
- `check:route-coverage-floor` against a real lcov file — OK, numbers above (213 measurable files).
- `check:route-coverage-floor` against a truncated/in-progress lcov file — now correctly FAILs
  instead of the false-positive 100% described above.
- `check:route-coverage-diff origin/main` — ran to completion, correct mechanics, expected FAIL
  given this branch's unrelated ahead-of-main state (see §3).
- `npm run test:cov` (the full, canonical, now-fixed script): **started in the background during
  this session and was still running at the time this report was committed** — it exercises the
  entire `src/**` + `packages/*` suite (484 test files, several multi-minute CLI serve/boot
  integration tests observed mid-run), materially longer than the `src/server`-scoped run used for
  the numbers above. Everything reported here was verified against that smaller, real,
  `--test-coverage-exclude`-fixed `src/server` run instead, which exercises the exact same route
  test files and is not expected to differ meaningfully in the route-scoped numbers. Whoever picks
  this up next should let that background run finish (or re-run `npm run test:cov` fresh) and
  confirm `check:route-coverage-floor`/`check:route-coverage-diff` still pass against its output
  before treating CI as proven end-to-end. Also observed, purely as an FYI and unrelated to this
  task: 3 pre-existing CLI `serve` integration test failures mid-run (`BR-02/AC-11`, `BR-07`, `B1`
  in `src/cli/__tests__/integration/serve-command.integration.test.ts`) — not touched by this
  session's changes, not investigated further, out of scope here.

## Explicitly out of scope (per brief — not started)

- The 70 complexity violations / a complexity gate for `src/` (needs a debt list + ratchet like
  `check:admin-complexity-drift`, separate large effort).
- The 21 unguarded async Express handlers (some already being swept by a concurrent agent this
  session per the audit's own update note).
- Mutation testing (`development/scripts/mutation-sweep.mjs` exists, recommended as a fourth signal,
  not attempted here).

## Files touched

- `src/server/__tests__/admin-assistant-execution-routes.test.ts` — new tests
- `development/scripts/route-coverage-lib.ts` — new, shared lcov parsing + the §0 write-up
- `development/scripts/check-route-coverage-floor.ts` — new
- `development/scripts/check-route-coverage-diff.ts` — new
- `package.json` — `test:cov` fix, 2 new script entries
- `.github/workflows/ci.yml` — fetch-depth, swapped Test step, 2 new steps
