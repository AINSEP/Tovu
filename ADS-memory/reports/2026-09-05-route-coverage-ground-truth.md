# Route coverage — ground truth — 2026-09-05

**Status: COMPLETE — second measurement pass (TestRunner agent). The previous pass's coverage
number is DISCARDED per dispatch: it was measured while machine load spiked to 27.20 (peak observed
in that pass, §2 below) against a documented crash threshold of 721 — not itself over the threshold,
but the dispatching owner separately reported the machine hit 620 from three concurrent runs earlier
the same day, so this pass re-measures rather than trusting a number produced during any elevated-load
window. This pass's own run was measured at load 2.24-7.6 (quiet) throughout — trustworthy. Everything
else in this file (§1, §5, §8) is that prior pass's own committed, non-coverage work and is retained;
§2a/§3/§4/§4a are this pass's fresh measurement; §7's original #1 claim is corrected (not deleted) by
§2a/§3/§4a. Real figure: **92.75% line / 87.70% branch / 86.19% function** across 238 measurable route
files, 0-contamination lcov (§3). One caveat found AFTER this pass's own run completed: machine load
spiked to 106-108 (1-min) starting ~13:14, well after this measurement's own run and integrity check had
already finished and been captured to disk — noted for the record, does not affect any number above,
and no further test invocation was launched by this pass once that spike was observed.**

Dispatch: produce a trustworthy `apps/website/src/server/routes/**`-equivalent (now
`inbound/{admin-http,public-http}/routes/**`) coverage number, distinguish real gaps from
measurement artifacts, and design (not build) a trustworthy recurring measurement.

Every prior report (`2026-09-03-route-coverage-below-100.md`,
`2026-09-03-coverage-gap-analysis-existing-data.md`,
`2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`) is treated as a CLAIM, not fact, and
re-verified against code and fresh measurements. Every line below is marked **MEASURED** (I ran it
and read the output myself) or **INFERRED** (reasoning on top of a MEASURED fact). A number I did
not personally produce is cited as "per <report>", never stated as fact.

## 1. Confirmed traps (read the scripts myself)

- **`check:route-coverage-floor` runs no tests.** MEASURED: `development/scripts/check-route-coverage-floor.ts`
  only calls `loadRouteCoverage()` against the on-disk `development/coverage/lcov.info` — no test
  invocation anywhere in the file or in `route-coverage-lib.ts`. That lcov's mtime is **2026-09-03
  19:43** (`ls -la development/coverage/`) — 2 days stale as of today. Its green/red proves nothing
  about current code.
- Dual-instantiation contamination is real and partially fixed today (`4d48f645`, `96988ca7`,
  `b3748e94` per the 2026-09-05 report) but not fully — confirmed by re-reading that report and the
  detector script, not yet re-run by me at this point in the task.

## 2. Scope for this measurement

A full `npm run test:cov` (repo-wide: `apps/website/src/**`, `packages/*/src`, `apps/site-chat/src`)
is explicitly forbidden on this machine. `npm run test:cov:server` (all of
`apps/website/src/server/**/*.test.ts`) is the next tier down and still broader than "routes" — it
would include every server subsystem's tests, not just route handlers.

This measurement is scoped narrower still, to exactly the test files that live alongside route
source under the three `MEASURABLE_ROUTE_PREFIXES` the two existing gates already define
(`route-coverage-lib.ts`): **MEASURED** count via `find`, verified every path exists before running
(trap 2) —

- `apps/website/src/server/__tests__/routes/*.test.ts` — 72 files (the historical, pre-restructure
  home for route-level HTTP tests; still where most route tests live post-restructure)
- `apps/website/src/server/inbound/admin-http/routes/**/__tests__/*.test.ts` — 80 files
- `apps/website/src/server/inbound/public-http/routes/**/__tests__/*.test.ts` — 18 files

**170 files total**, verified to exist on disk before the run (a `while read` loop over the file
list, zero `MISSING:` lines). Command (matches the dispatch's shape exactly):

```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
  node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<scratch>/routes.lcov \
  --test-reporter=dot --test-reporter-destination=<scratch>/routes-dot.out \
  <170 files>
```

Named exclusion: this does NOT include tests that exercise routes only indirectly (e.g.
`http/site/__tests__/render.test.ts`, boot-lifecycle integration tests that spin up the whole app and
happen to hit route handlers along the way). Those tests likely contribute real coverage to route
files in a full `test:cov:server` run that this scoped run will not credit — meaning this measurement
is a **conservative floor**, not a ceiling, on real route coverage. Flagged, not corrected — closing
that gap needs the broader (currently infeasible) run.

**Environment note affecting run time, not correctness:** this session ran concurrently with several
other agent sessions on the same machine (`main`, `A-export-leaf` through `F-complexity-truth`,
per the team roster) — **MEASURED** load average peaked at **27.20** partway through this run (`uptime`),
far above the ~1-per-core level this scoped, single-concurrency invocation would need. The run took
materially longer than its file/test count would suggest on an idle machine as a result. This is a
capacity problem, not a correctness problem — see §1 for why a full unscoped `test:cov` is additionally
forbidden regardless of load.

## 2a. Re-verification before re-measuring (this pass)

- **MEASURED**: load average at start of this pass was quiet — `2.64 21.85 95.19` (1/5/15-min),
  i.e. the 15-min average was still elevated from the earlier-today contention but the 1-min figure
  (what matters for "is anything running right now") was near-idle. Re-checked repeatedly through
  the run; 1-min stayed under 6 throughout.
- **MEASURED**: the 170-file scope recomputed fresh (`find` over the same three path globs) still
  totals 170 (72 + 80 + 18), all verified to exist on disk before running.
- **MEASURED**: the environment blocker this report's §"Environment blocker" (in the dual-
  instantiation report) flagged at 10:35 today — `Jini/packages/infra/node_modules/better-sqlite3`
  symlinked to a removed `11.10.0` store path — is **resolved**. The symlink now points to
  `better-sqlite3@13.0.3` consistently in both Tovu's and Jini's `node_modules`, and
  `require('better-sqlite3')` loads and executes a real query on this machine right now. Tests that
  died with `ERR_MODULE_NOT_FOUND` earlier today (`site-exporter.test.ts`, `tool-registrations.unit.test.ts`,
  `adapter.unit.test.ts`, `commit-site.unit.test.ts`) are not expected to hit that failure in this pass.
- **CORRECTION to the prior pass's #1 gap-list item.** `grep -rl "registerAdminSitesRoutes\|routes/system/sites"`
  does return nothing — that grep pattern is real and reproduces cleanly. But it is the wrong test: a
  dedicated 272-line test file, `apps/website/src/server/__tests__/routes/sites-route.test.ts`, **exists
  and was added in the SAME commit as `sites.ts` itself** (`115687af`, 2026-09-04 12:27, "Sites screen
  backend"). It never imports the registrar function or its file path — every assertion is a raw
  `fetch()` against the live HTTP path (`.../system/sites`, `.../system/sites/:name/activate`), so a
  grep for the registrar name or import specifier finds nothing even though the route is fully exercised
  end-to-end. **MEASURED** from the fresh lcov (§3): `sites.ts` reads `FNF:8 FNH:8` (100% functions),
  `LH:200 LF:207` (96.62% lines), `BRH:28 BRF:39` (71.79% branches) — genuinely tested, with a real but
  much narrower branch gap than "zero tests anywhere." This is the same lesson as "grepping for a
  function name never proves coverage," mirrored: **grepping for a registrar name never proves the
  ABSENCE of a test either** — an HTTP-level test file needs no reference to the file it exercises. I
  independently hit the identical trap earlier in this pass with a broader zero-test detector script (236
  of 240 route files false-flagged by path-stub grep, because most test files import via relative
  specifiers a few directories up, not the full `src`-relative path) — discarded before publishing rather
  than compounding the error. Do not use import-path or symbol-name grep to conclude a file is untested;
  only a real lcov run can.

## 3. The real coverage number

**MEASURED.** Scope: the same 170-file set from §2 (72 `__tests__/routes/*.test.ts` + 80 admin-http route
`__tests__` + 18 public-http route `__tests__`), run as ONE sequential invocation (`--test-concurrency=1`),
alone on the machine (load checked before/during/after — see below).

```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
  node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<scratch>/routes.lcov \
  --test-reporter=dot --test-reporter-destination=<scratch>/routes-dot.out \
  <170 files, via xargs from the verified file list — bash 3.2 on this machine has no `mapfile`>
```

Load average: **2.24** (1-min) immediately before launch, stayed under **7.6** throughout the ~16-minute
run (checked repeatedly via `uptime` and by confirming the real node PID's `%CPU`/elapsed time was
advancing, not stalled), **0.0/1652 total exit** — the run finished on its own with exit code 1 recorded
inside the log file itself (not read through a pipe — a literal `echo "EXIT_CODE=$?" >> log` line after
the command). Exit 1 is from 4 failing tests (below), not an infrastructure failure — the lcov reporter
still wrote a complete, non-empty file (2.9 MB, 1298 `SF:` blocks, 1298 matching `end_of_record`s).

**Contamination check (mandatory before quoting any number from this lcov):**

```
npx tsx development/scripts/check-coverage-integrity.ts <scratch>/routes.lcov
check:coverage-integrity — OK: 785 first-party block(s) evaluated (513 skipped: non-first-party or
pure re-export barrel), 0 dual-instantiation contamination found.
```

Exit code confirmed **0** by running the command with no pipe (`> file 2>&1; echo $?` on separate lines) —
not through `tee`, which would have reported `tee`'s exit status instead the first time I (mistakenly)
tried it. **0 of 785 evaluated blocks contaminated.** This lcov is trustworthy.

**Aggregated over 238 measurable route source files** (per `route-coverage-lib.ts`'s own
`isMeasurableRouteFile`/`loadRouteCoverage`, reused rather than reimplemented, to inherit its already-
fixed prefix history and test-file/type-only exclusions):

| Metric | Hit / Found | % |
|---|---|---|
| Lines | 22338 / 24085 | **92.75%** |
| Branches | 3351 / 3821 | **87.70%** |
| Functions | 1055 / 1224 | **86.19%** |

**Known undercount in this same number, inherited from the prior pass's scoping decision (§2):** this is
a conservative **floor**, not a ceiling — tests outside the 170-file set (broad boot-lifecycle
integration tests, admin smoke tests) that hit route handlers indirectly are not counted here, exactly as
flagged before I re-measured.

**A second, smaller undercount found in this pass:** 240 route source files exist on disk matching the
prefixes; only 238 produced an `SF:` record in this lcov. The missing 2 —
`apps/website/src/server/inbound/admin-http/routes/assistant/test-agent.ts` and `test-connection.ts` — are
not uncovered; they are **invisible to this invocation** because Node's `--experimental-test-coverage`
silently excludes any file matching its own built-in test-file-discovery glob (filenames starting
`test-`), a trap `route-coverage-lib.ts`'s own header already documents in detail, including that
`test-connection.ts` has real tests. The real `test:cov`/`test:cov:server` npm scripts already carry the
fix — `--test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**"` — which **overrides** (does
not add to) Node's default exclusion glob and restores visibility. **The dispatch's prescribed command
template for this task omits that flag** — I did not add it for the primary run to keep the invocation
identical to what was specified and reproducible by the next person following this report literally, but
the recurring-measurement recipe (§6) now includes it, and anyone re-running this measurement should use
the corrected command, not the literal template above.

**Test failures in this run (4 of ~1512 tests, exit 1):** none in files this task's scope covers writing
new tests for — both are outside my mandate and on the explicit "do not touch" list:

| Test | File | Failure |
|---|---|---|
| `overridesThemePage false: the theme's own same-slug page wins over the post` | `apps/website/src/server/__tests__/routes/post-template-site-serving.test.ts:207` | `AssertionError` |
| `ROUND TRIP: explicitly resetting overridesThemePage to null...` | same file:316 | `AssertionError` |
| `ROUND TRIP: saving overridesThemePage...persists it and the post wins over the theme page` | same file:360 | `AssertionError` |
| `SETTINGS_SET: tombstoned definition returns 409 DEFINITION_TOMBSTONED` | `apps/website/src/server/__tests__/routes/settings-workspace-scoping.test.ts:346` | `404 !== 409` |

`settings-workspace-scoping.test.ts` was already showing as locally modified (`M`) in git status before
this task started, and is on the shared-tree "do not touch" list — this looks like a concurrent edit by
another session in progress, not a regression I introduced (I made zero source or test edits). Per the
TestRunner skill's guardrails, reporting exact failure output, not fixing it: **flagged to the owner/team-
lead, not triaged further.** These failures do not affect the trustworthiness of the coverage number
above — node:test still writes complete lcov output on a run with failing tests (documented behavior,
per `route-coverage-lib.ts`'s own header).

## 4. Genuinely uncovered vs. artifact-uncovered

**MEASURED, this pass.** Of 238 measured route files, **zero** have `LH:0` with `LF>0` — no route file
in scope is completely dead. The uncovered mass is a long tail of partial gaps, not blank files. Two
things that look like gaps and are not:

- **`test-agent.ts` / `test-connection.ts` reading as "0% coverage" or absent** — artifact, see §3. Not
  a real gap; a Node CLI flag omission in this specific invocation.
- **`system/sites.ts` reading as "zero tests"** — artifact, see §2a. Real coverage is 96.62% line /
  71.79% branch, not zero.

Everything else below is a **real** gap: MEASURED from the clean (0-contamination) lcov, at file
granularity — per the coverage-integrity script's own header, lcov line numbers under `tsx` are not
source line numbers (comments are stripped before instrumenting), so no finding below claims a specific
source line; only file-level function/branch/line counts, which do not have that instability.

Two genuinely different kinds of gap showed up, and they need different fixes:

1. **Whole functions never invoked at all** (`FNH < FNF` by a wide margin) — not a partial-branch gap,
   an entire code path with no test touching it. `connectors/put-config.ts`: `FNF:8 FNH:2` — 6 of 8
   functions never run. `widgets/agent-tools.ts` (route file): `FNF:19 FNH:6` — 13 of 19 never run, and
   this file also has the single largest absolute uncovered-line count of any of the 238 (97 lines).
2. **Branch-only gaps on otherwise well-exercised files** — the happy path is tested, an error/edge
   branch is not. `site/pages.ts`: `LH:1626 LF:1626` (100% lines) but `BRH:197 BRF:213` (92.49%
   branches, 16 uncovered) — every line runs, but 16 decision points never take their other arm. This
   shape is cheaper to close (the harness/fixtures already exist; it's an added assertion or input
   variant, not new scaffolding) and should generally be prioritized over category 1 for quick wins,
   but category 1 carries more real risk (an entire code path with zero verification, not just an edge
   case of a verified one).

## 4a. Ranked worklist — sized for one agent per item

Ranked by (a) real risk — mutating/RBAC-gated/public-facing over read-only internal, (b) size of the
verified gap, (c) whether the gap is whole-function (higher risk) or branch-only (cheaper, still real).
Each entry names one file with its own test file(s) to extend — independently actionable, not a theme.

| # | File | Gap (MEASURED, this lcov) | Why this rank |
|---|---|---|---|
| 1 | `apps/website/src/server/inbound/admin-http/routes/connectors/put-config.ts` | `FNF:8 FNH:2` (6 whole functions untested), `LH:141 LF:226` (62.39%) | Writes third-party connector config (secrets-adjacent), RBAC-gated, majority of its own function surface never runs under test |
| 2 | `apps/website/src/server/inbound/admin-http/routes/widgets/agent-tools.ts` | `FNF:19 FNH:6` (13 whole functions untested), `LH:221 LF:318` — largest absolute uncovered-line count of any of the 238 files | Biggest raw gap in scope; agent-tool registration surface, wrong output here is user-facing in the admin AI assistant |
| 3 | `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts` | `BRH:33 BRF:51` (64.71%, worst branch% of any file with >10 branches), `FNH:21 FNF:26` | **Public, unauthenticated** route — worst branch coverage of any internet-facing endpoint measured |
| 4 | `apps/website/src/server/inbound/public-http/routes/site/pages.ts` | `BRH:197 BRF:213` (16 uncovered branches — largest absolute branch gap of any of the 238 files), `LH:1626 LF:1626` (100% lines) | Single highest-traffic public route (page rendering); every line runs but 16 decision arms never do — cheapest-to-close item on this list since fixtures already exist |
| 5 | `apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts` | `BRH:55 BRF:69` (79.71%, 14 uncovered branches) | Credentials-adjacent system route, RBAC-gated |
| 6 | `apps/website/src/server/inbound/admin-http/routes/system/sites.ts` | `BRH:28 BRF:39` (71.79%, 11 uncovered branches) | Corrected from prior pass (§2a) — real gap is narrower than claimed but still real: RBAC-gated site-switching write paths, already separately flagged for a baselined cyclomatic-11 complexity violation |
| 7 | `apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts` | `BRH` gap 11 uncovered (74.42%) | Part of a 3-file credentials-route cluster (with #8, #9) that all show similar branch-only gaps — likely one shared untested validation/probe-failure pattern; ranked as 3 separate items per dispatch instruction, not bundled |
| 8 | `apps/website/src/server/inbound/admin-http/routes/system/vendor-credentials.ts` | 9 uncovered branches (75.68%) | Same credentials cluster as #7 |
| 9 | `apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts` | 9 uncovered branches (74.29%) | Same credentials cluster as #7 |
| 10 | `apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts` | 11 uncovered branches (56.00% — worst branch% in this top-10) | Destructive taxonomy-merge operation, worst branch percentage of any file in this ranked list |
| 11 | `apps/website/src/server/inbound/admin-http/routes/media/upload.ts` | 10 uncovered branches (61.54%) | File-upload path — arbitrary user-supplied content, security-relevant edge cases most likely to live in the untested branches |
| 12 (infra, not test-writing) | `.../assistant/test-agent.ts` + `test-connection.ts` | Currently invisible to any route-coverage run lacking the `--test-coverage-exclude` override (§3) | Not a test-writing task — whoever owns the recurring-measurement job (§6) should add the flag so these 2 files stop being silently excluded from every future run, including CI's `test:cov:server` today |

Not re-listing the full 238-file table here (would restate the superseded 2026-09-03 worst-10 mechanism
already covered in §5, and 228 more rows add no decision value beyond the top ones above) — the full
per-file breakdown is in `<scratch>/aggregate-output.txt` generated this pass; ask if it needs
committing somewhere durable rather than left in scratch.

## 5. Why prior numbers differ

**MEASURED via `git log --since=2026-09-03`**, checked against the `2026-09-03-route-coverage-below-100.md`
table's 10 worst-ranked files (captured ~12:48 PDT that day, from `development/coverage/lcov.info`).
**Correction made while writing this section:** an initial pass checked only each SOURCE file's git
log and found 3 with no hits (`users/list.ts`, `users/enable.ts`, `comments/moderation-queue.ts`) —
wrong, because their fixes landed entirely in the paired **test** file, which a source-only `git log`
never sees. Checking the test files closes all 10:

| File | Sep 3 rank (branch%) | Fix commit(s) since, same day |
|---|---|---|
| `entries/update.ts`, `entries/lifecycle.ts` | 78.16% / 79.52% | `9e416602`, `7e1cea7e`, `6c499cf0` (15:16–17:13) — "cover update/lifecycle/list/get-entry route branches" |
| `recovery/deep-link.ts`, `connectors/disconnect.ts`, `change-sets/revert.ts`, `redirects/import.ts` | 79.59% / 78.57% / 50.00% / 50.00% | `69157f8c`, `a63534b5` (15:03–15:30) — "close route-level branch gaps on 4 destructive admin ops" |
| `seo/get-entry.ts` | 40.00% | `9e416602` (15:16, same commit as entries/update — "cover update/lifecycle/list/get-entry route branches" covers seo/get-entry too, contrary to my first read of that message) |
| `users/list.ts`, `users/enable.ts` | 66.67% / 44.44% | `419bd266` (15:09) — "100% line/branch/function coverage on 4 RBAC user-admin routes" — **test file only**, source untouched |
| `comments/moderation-queue.ts` | 50.00% | `9ab21f17` (15:04) — "100% line+branch coverage on assign-role, attach-policy, rescan-themes, moderation-queue routes" — **test file only**, source untouched |

**Mechanism, not just delta:** every one of the Sep 3 report's 10 worst-ranked files was targeted by a
dedicated coverage-closing commit **on the same afternoon**, 2-5 hours after that report's own
snapshot (12:48 -> 15:03-17:13). The report was not wrong about what it measured; it is simply older
than the fixes it prompted, and a naive "check if the source file changed" currency check (my own
first attempt) misses fixes that land as test-only diffs. Anyone citing that table today without
re-measuring is citing pre-fix numbers for its entire worst-10. This is the same mechanism found
independently in §8 for `apps/admin/src/lib/api.ts` (a report capturing a true snapshot, then work
landing within hours that the report's own reader has no way to know about without re-running).

Separately, the dual-instantiation contamination fixes (`4d48f645`, `b3748e94`, `96988ca7`, all
2026-09-05 morning) explain why the 2026-09-03 lcov and today's fresh lcov are not directly
comparable even for files with no source changes: today's run should show materially less
contamination on files in Route W's/A's blast radius (theme/widgets/forms/post/media/db-schema
subgraph, `contracts/core/events/*`, `platform/export/*`, `platform/routing/routing.ts`) purely from
the coverage-collection fix, independent of any test-content change.

## 6. Design for a trustworthy recurring measurement (not built)

**MEASURED**: `package.json` already has the right-shaped plumbing, unused as a pipeline —
`test:cov:server` (scoped to `apps/website/src/server/**/*.test.ts` only — narrower than the
forbidden repo-wide `test:cov`, which also runs `packages/*/src` and `apps/site-chat/src`) writes
the same `development/coverage/lcov.info` the two route gates already read. `test:cov:server:unit`
and `:integration` additionally split into `lcov.unit.info`/`lcov.integration.info` for
`check-route-coverage-diff.ts`'s two-tier per-file gate. None of the three currently run in CI or on
a schedule — `check:route-coverage-floor` and `check:route-coverage-diff` both silently trust
whatever stale file happens to be sitting on disk (see §1). A trustworthy recurring measurement
needs exactly three things none of the current gates have:

1. **Run tests as part of the same job that evaluates the gate**, not as a separate, independently-
   scheduled step that a developer might skip. Fold `test:cov:server` (or the tiered pair) into the
   same CI step that then runs `check-route-coverage-floor.ts` / `check-route-coverage-diff.ts`,
   fail-fast on test failure per `route-coverage-lib.ts`'s own header design intent — this is already
   the documented intent, just not wired.
2. **Gate on `check-coverage-integrity.ts` BEFORE trusting the floor/diff numbers.** Run it against
   the fresh `lcov.info` immediately after `test:cov:server` and before either route gate reads it;
   a SEVERE or new-CONTAMINATED result should block, not just advise, because a contaminated block's
   line/branch numbers are not the file's real numbers (see this session's own §7 finding that one
   contaminated file reads dramatically different real vs. corrupted branch%). This closes exactly
   the gap that let `check:route-coverage-floor` report a real-looking 92%+ line number for weeks
   while unrelated to whether any given file's number was trustworthy.
3. **Emit and store the evaluated-file COUNT alongside the percentage, every run**, and alert if it
   drops. `check-route-coverage-floor.ts` already guards against literal zero (§ "Zero measurable
   files"), but a silent partial drop (170 files today vs. 150 next week, say, because a path prefix
   went stale again — this has happened twice per `route-coverage-lib.ts`'s own changelog comment,
   2026-08-28 and 2026-09-02) would still report a plausible-looking percentage over fewer files and
   nobody would notice. A count that's pinned/compared run-over-run turns that silent failure mode
   into a visible one.

None of this requires new tooling — `test:cov:server`, `test:cov:server:tiered`, and
`check-coverage-integrity.ts` all already exist and work; they simply are not chained together and
none of the three run automatically. Per the dispatch's rule ("design it; do not build it"), this is
left as a design, not a PR.

**Addendum from this pass's own measurement (§3):** whatever recurring job gets built on top of
`test:cov:server` must carry `--test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**"` —
without it, Node's own test-file-discovery glob silently drops any route file whose name starts with
`test-` (2 files, confirmed this pass: `assistant/test-agent.ts`, `assistant/test-connection.ts`) from
coverage output entirely, with no error. `test:cov`/`test:cov:server` in `package.json` already carry
this flag; a from-scratch recurring job that copies this report's §3 command literally, rather than the
existing npm scripts, will reproduce the blind spot.

**The exact recurring recipe, given everything above (run from the repo root):**

```
# 1. Measure (scoped; NOT the forbidden repo-wide test:cov)
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
  node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  --experimental-test-coverage --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
  --test-reporter=lcov --test-reporter-destination=<out>/routes.lcov \
  --test-reporter=dot --test-reporter-destination=<out>/routes-dot.out \
  $(find apps/website/src/server/__tests__/routes -maxdepth 1 -name '*.test.ts') \
  $(find apps/website/src/server/inbound/admin-http/routes -path '*/__tests__/*.test.ts') \
  $(find apps/website/src/server/inbound/public-http/routes -path '*/__tests__/*.test.ts')

# 2. Gate BEFORE trusting any number from step 1's output
npx tsx development/scripts/check-coverage-integrity.ts <out>/routes.lcov
# Any exit != 0 (contamination found) invalidates every number below — re-measure, do not quote.

# 3. Aggregate only measurable route files (reuses route-coverage-lib.ts, not a hand-rolled parser)
npx tsx <a script importing loadRouteCoverage()/pct() from development/scripts/route-coverage-lib.ts>
```

One agent, one machine, one invocation at a time — `uptime` before launching (stop above ~60 1-min
load) and don't launch a second test process while the first is in flight, exactly as this pass did.

## 7. Ranked gap list — SUPERSEDED by §4a in this same file

The sub-sections below are the prior pass's #1 entry, kept verbatim for the audit trail. Its verdict is
corrected, not deleted: see §2a and §3 for the measured reality (real tests exist; the gap is a branch
gap, not zero coverage) and §4a for the current ranked worklist, which supersedes the placeholder #2/#3
slots this section originally left open.

### #1 (ORIGINAL CLAIM, corrected in §2a/§3) — `apps/website/src/server/inbound/admin-http/routes/system/sites.ts` — "zero tests, live, wired"

**MEASURED**: `git log --diff-filter=A` shows this file added `115687af` (2026-09-04 12:27, "Sites
screen backend -- list, create, activate") — a full day after the Sep 3 report and not in any prior
coverage snapshot at all (new file, not a regression). **MEASURED**: `grep -rl` across
`apps/website/src --include='*.test.ts'` for its registrar name `registerAdminSitesRoutes` or its
import path returns nothing — zero test references anywhere in the tree **by that grep pattern
specifically; see §2a — this is confirmed true but was the wrong test, and a dedicated 272-line test
file exists that a symbol/path grep cannot see.** **MEASURED**: it IS wired live — `app.ts:198` imports
it, `app.ts:1048` calls `registerAdminSitesRoutes(app, routeDeps)` inside the real composition root,
not a dead/unreachable branch. Three endpoints: `GET .../system/sites` (list), `POST .../system/sites`
(create), `POST .../system/sites/:name/activate` (activate + persist + restart instructions). All three
are mutating or state-revealing filesystem/site-registry operations gated on `system.read`/
`system.write`. The file's own `AdminSitesDeps` type deliberately exposes every real dependency
(`listSites`, `createSite`, `persistActiveSite`, `isSiteSwitcherEnabled`, `describeSiteBinding`,
`readPersistedActiveSite`) as injectable overrides specifically so "a route test proves both branches
without touching the real filesystem or `sites/`" (the file's own comment) — and `sites-route.test.ts`
does exactly that. This is also the same file the concurrent complexity sweep flagged
(`project_tovu_open_decisions_2026_09_05` memory, item 1) at cyclomatic 11 / cognitive 10, currently
causing `check:src-complexity-drift` to be RED — that part of the original claim stands. **Current
verdict (§3/§4a #6): real branch gap (71.79%, 11 uncovered), not zero coverage — ranked #6, not #1, in
the corrected worklist.**

## 8. The `api.ts` "~145 untested endpoints" claim — REFUTED, and stale within the hour

Scope note first: this claim (`project_tovu_open_decisions_2026_09_05` memory, sourced from an
admin-coverage sweep) is about `apps/admin/src/lib/api.ts` — the admin SPA's HTTP **client** wrapper,
`vitest`/jsdom, a different app/runner/layer (client call-sites, not server route handlers) than this
dispatch's `apps/website` server-route scope. Verified anyway per explicit instruction.

**MEASURED** (this session, scoped `vitest run --coverage --coverage.include='src/lib/api.ts'`
against all 13 `apps/admin/src/lib/__tests__/api-*.unit.test.ts` files, from `apps/admin/`):

```
Statements   : 93.82% ( 304/324 )
Branches     : 94.02% ( 173/184 )
Functions    : 94.52% ( 207/219 )
Lines        : 95.63% ( 285/298 )
326 tests, 13 files, all passing
```

The claimed figure was **`BRH 91/184` branch (49.46%), `FNH 71/216` functions (32.9%)** — same
branch denominator (184) as my run, wildly different hit count (91 vs. 173). Root cause, MEASURED via
`git log --diff-filter=A`: five of the thirteen test files I ran were created **today, between 11:01
and 11:05** — `api-users`, `api-widgets-endpoints`, `api-assistant`, `api-connectors-policies-forms-
seo-redirects-posts`, `api-long-tail-endpoints`.unit.test.ts. The memory's own frontmatter timestamps
the finding at `2026-09-05T17:13:11Z` UTC (10:13 local) — **about 50 minutes before** those five files
landed. This is not a bad measurement; it's a true snapshot that a concurrent session's work (visibly
targeting this exact open decision) has since obsoleted. **Verdict: claim was accurate when written,
REFUTED as current — do not act on the 145-endpoint number today.** Whoever owns that open-decision
item should close it: functions/branches are both now in the mid-90s, not a "sharded multi-agent pass"
situation any more. (I did not identify who added those files; no attribution claimed.)
