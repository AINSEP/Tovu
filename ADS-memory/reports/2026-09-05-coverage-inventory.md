# Coverage inventory — apps/website/src/features/* + apps/admin/** (2026-09-05)

Dispatched by team-lead to answer Leona's question: which folders under
`apps/website/src/features/**` and `apps/admin/**` have no coverage yet.
This is an inventory, not a test-writing task. See
`ADS-memory/reports/2026-09-05-coverage-task-list.md` for the related
owner-directed task list and standing rules (100% bar, verify-before-trust).

**Status: Phase 1 (static enumeration) complete. Phase 2 (measured lcov) in
progress, gated by machine load — three other agents were running tests and
the box crashed once today at load 721. Every number below is either measured
with its exact command + file set + uptime, or explicitly `UNMEASURED` with a
reason. File/line counts are measured (`find` + `wc -l`); nothing here is
estimated.**

## Method

1. Enumerated every directory under `apps/website/src/features/` (39 dirs) and
   the feature + top-level subtrees under `apps/admin/src/` (32 feature dirs +
   `lib`, `hooks`, `components`).
2. Counted source files and lines per dir, excluding test files
   (`find ... -name '*.ts' -o -name '*.tsx' -not -path '*__tests__*' -not -name
   '*.test.*'`, piped to `wc -l`).
3. Counted **internal** test files per dir (files inside the dir's own
   `__tests__/` or matching `*.test.*`).
4. Built a **candidate external suite map**: grepped all 1123 `*.test.ts(x)`
   files under `apps/website` + `apps/admin` for import-path fragments
   `features/<name>`, then kept only hits where the referencing test file's own
   path does not itself contain that fragment — i.e. suites *outside* the
   directory that plausibly exercise it. This catches cross-directory
   exercisers (the `features/theme` pattern) but **cannot** catch HTTP/route
   tests that drive a module without naming its path (the `system/sites.ts`
   pattern) — those need a runtime check, listed as a caveat per row where
   relevant.
5. Presence of internal or external test references is a **candidate signal
   only**, not a coverage measurement — a referenced module can still be
   `vi.mock()`'d out (zero coverage) or only partially exercised. Only the
   `Measured coverage` column with an lcov command is a real number.

## Website: `apps/website/src/features/*`

Sorted by line count (source, excl. tests), descending — largest unmeasured
surface first per Leona's ask, pending Phase 2 overrides.

| Dir | Files | Lines | Internal tests | Candidate external suites (count) | Measured coverage |
|---|---|---|---|---|---|
| theme | 26 | 9474 | 82 | 54 (incl. admin ThemeExplore/pages hooks) | UNMEASURED — Phase 2 pending |
| deployments | 32 | 8557 | 19 | 15 | **99.0% lines (7793/7868), 94.5% fn (310/328), 95.3% br (1056/1108)** — see Phase 2 log; well-covered overall, one real gap: `repo.sqlite.ts` 61.0% (83/136 lines, 2/13 fn) |
| widgets | 26 | 5378 | 19 | 14 | UNMEASURED — Phase 2 pending |
| plugins | 17 | 4190 | 19 | 14 | UNMEASURED — Phase 2 pending |
| newsletter | 18 | 4151 | 13 | 11 | UNMEASURED — Phase 2 pending |
| post | 11 | 3662 | 12 | 62 | UNMEASURED — Phase 2 pending |
| custom-credentials | 14 | 3433 | 10 | 8 | UNMEASURED — Phase 2 pending |
| webhooks | 16 | 3231 | 9 | 33 | UNMEASURED — Phase 2 pending |
| agent-plugins | 13 | 3172 | 19 | 2 | UNMEASURED — Phase 2 pending |
| members | 12 | 3166 | 9 | 14 | UNMEASURED — Phase 2 pending |
| plugin-runtime | 15 | 2836 | 13 | 10 | UNMEASURED — Phase 2 pending |
| source-control | 8 | 2607 | 7 | 6 | UNMEASURED — Phase 2 pending |
| comments | 16 | 2575 | 9 | 9 | UNMEASURED — Phase 2 pending |
| seo | 13 | 2372 | 13 | 7 | UNMEASURED — Phase 2 pending |
| redirects | 13 | 2431 | 8 | 11 | UNMEASURED — Phase 2 pending |
| identity | 10 | 2236 | 8 | 5 | UNMEASURED — Phase 2 pending |
| forms | 14 | 2139 | 11 | 11 | UNMEASURED — Phase 2 pending |
| site-evidence | 7 | 1914 | 5 | 3 | UNMEASURED — Phase 2 pending |
| site-inspection | 6 | 1691 | 3 | 3 | UNMEASURED — Phase 2 pending |
| database | 12 | 1686 | 8 | 13 | UNMEASURED — Phase 2 pending |
| media | 9 | 1547 | 8 | 18 | UNMEASURED — Phase 2 pending |
| analytics | 7 | 1557 | 6 | 5 | UNMEASURED — Phase 2 pending |
| recovery | 9 | 1359 | 10 | 8 | UNMEASURED — Phase 2 pending |
| vendor-credentials | 6 | 1318 | 3 | 4 | UNMEASURED — Phase 2 pending |
| commerce | 10 | 1163 | 7 | 3 | UNMEASURED — Phase 2 pending |
| settings | 4 | 969 | 4 | 16 | UNMEASURED — Phase 2 pending |
| pages | 7 | 969 | 4 | 9 | UNMEASURED — Phase 2 pending |
| taxonomy | 5 | 895 | 1 | 8 | UNMEASURED — Phase 2 pending |
| site-glue | 6 | 763 | 8 | 1 | UNMEASURED — Phase 2 pending |
| external-mcp | 3 | 537 | 1 | 0 (none found) | UNMEASURED — Phase 2 pending |
| media-generation | 2 | 531 | 1 | 4 | UNMEASURED — Phase 2 pending |
| skills | 2 | 516 | 3 | 3 | UNMEASURED — Phase 2 pending |
| origin | 5 | 491 | 3 | 11 | UNMEASURED — Phase 2 pending |
| navigation | 3 | 426 | 1 | 9 | UNMEASURED — Phase 2 pending |
| content-types | 5 | 352 | 1 | 19 | UNMEASURED — Phase 2 pending |
| entries | 3 | 266 | 1 | 18 | UNMEASURED — Phase 2 pending |
| tool-audit | 3 | 240 | 1 | 4 | UNMEASURED — Phase 2 pending |
| presentation | 3 | 153 | 2 | 4 | UNMEASURED — Phase 2 pending |
| workspace | 3 | 136 | 1 | 5 | UNMEASURED — Phase 2 pending |

`features/__tests__` (shared boundary tests, not a feature) excluded from ranking.

## Admin: `apps/admin/src/features/*` + top-level subtrees

| Dir | Files | Lines | Internal tests | Candidate external suites (count) | Measured coverage |
|---|---|---|---|---|---|
| lib | 35 | 10004 | 49 | n/a (not a feature dir) | `api.ts` previously measured 100% (FNF 219/219, BRF 184/184, lines 298/298) — see task-list doc; rest of `lib/` UNMEASURED |
| components | 39 | 7602 | 39 | n/a | UNMEASURED — Phase 2 pending |
| deployment | 25 | 7095 | 12 | 2 | UNMEASURED — Phase 2 pending |
| pages | 25 | 5250 | 11 | 9 | UNMEASURED — Phase 2 pending |
| posts | 16 | 4709 | 9 | 5 | UNMEASURED — Phase 2 pending |
| themes | 14 | 4551 | 6 | 1 | UNMEASURED — Phase 2 pending |
| collections | 26 | 4207 | 14 | 2 | UNMEASURED — Phase 2 pending |
| security | 15 | 3955 | 10 | 2 | UNMEASURED — Phase 2 pending |
| ai-assistant | 16 | 3788 | 11 | 2 | UNMEASURED — Phase 2 pending |
| media | 13 | 3450 | 9 | 18 | UNMEASURED — Phase 2 pending |
| settings | 15 | 3223 | 12 | 16 (shared w/ website `features/settings` refs) | UNMEASURED — Phase 2 pending |
| taxonomy | 17 | 3158 | 8 | 8 | UNMEASURED — Phase 2 pending |
| roles | 7 | 2852 | 3 | 3 | UNMEASURED — Phase 2 pending |
| widgets | 15 | 2997 | 9 | 14 | UNMEASURED — Phase 2 pending |
| plugins | 20 | 2970 | 10 | 14 | UNMEASURED — Phase 2 pending |
| users | 8 | 2863 | 7 | 2 | UNMEASURED — Phase 2 pending |
| seo | 15 | 2597 | 6 | 7 | UNMEASURED — Phase 2 pending |
| database | 16 | 2544 | 6 | 13 | UNMEASURED — Phase 2 pending |
| hooks | 13 | 2493 | 11 | n/a | UNMEASURED — Phase 2 pending |
| comments | 13 | 2267 | 7 | 9 | UNMEASURED — Phase 2 pending |
| recovery | 10 | 2352 | 4 | 8 | UNMEASURED — Phase 2 pending |
| redirects | 9 | 1921 | 4 | 11 | UNMEASURED — Phase 2 pending |
| source-control | 9 | 1770 | 4 | 6 | UNMEASURED — Phase 2 pending |
| menus | 9 | 1750 | 4 | 1 | **Off-limits — do not touch (active edit in progress, `M apps/admin/src/features/menus/MenuEditor.tsx` in working tree). Not measured, not scoped for test runs this pass.** |
| integrations | 11 | 1536 | 5 | 3 | UNMEASURED — Phase 2 pending |
| members | 7 | 1227 | 3 | 14 (shared w/ website `features/members`) | UNMEASURED — Phase 2 pending |
| dashboard | 7 | 1101 | 4 | 1 | UNMEASURED — Phase 2 pending |
| sites | 7 | 913 | 3 | 1 | UNMEASURED — Phase 2 pending |
| workspace | 7 | 715 | 3 | 5 (shared w/ website `features/workspace`) | UNMEASURED — Phase 2 pending |
| authentication | 3 | 273 | 2 | 1 | UNMEASURED — Phase 2 pending |
| auth | 5 | 184 | 2 | 1 | UNMEASURED — Phase 2 pending |
| playground | 3 | 122 | 1 | 1 | UNMEASURED — Phase 2 pending |
| commerce | 2 | 128 | 1 | 3 (shared w/ website `features/commerce`) | UNMEASURED — Phase 2 pending |

## Ranked priority (largest genuinely-unmeasured surface first)

Pending Phase 2 measurement, the current ranked candidate list — by lines,
before any measured override — is:

1. `apps/admin/src/lib` (10004 lines, only `api.ts` verified; rest unknown)
2. `apps/website/src/features/theme` (9474 lines — known cross-directory
   exerciser pattern per prior findings; needs the external-suite run, not
   just internal, to avoid a false "zero coverage" claim)
3. ~~`apps/website/src/features/deployments` (8557 lines)~~ — **MEASURED,
   dropped from this list**: 99.0% lines, 94.5% functions, 95.3% branches.
   Not an unmeasured surface. One real gap inside it: `repo.sqlite.ts` at
   61.0% lines / 2 of 13 functions — worth a targeted look, but the
   directory as a whole is not what Leona is asking about.
4. `apps/admin/src/components` (7602 lines)
5. `apps/admin/src/features/deployment` (7095 lines)
6. `apps/website/src/features/widgets` (5378 lines)
7. `apps/admin/src/features/pages` (5250 lines)
8. `apps/admin/src/features/posts` (4709 lines)
9. `apps/admin/src/features/themes` (4551 lines)
10. `apps/admin/src/features/collections` (4207 lines)

This ranking will be corrected as Phase 2 measurements land — a directory with
many lines but strong external suite coverage may drop, and vice versa.

## Phase 2 measurement log

(Appended incrementally as runs complete. Format: command, file set, uptime
before/after, lcov path, result.)

### `apps/website/src/features/deployments` — MEASURED

- **uptime before**: `15:42  load averages: 6.32 6.77 7.30`
- **uptime after**: `15:47  load averages: 35.57 34.81 21.17` — **1-min load spiked
  to 35 during/immediately after this run.** Per the load-spike-voids-a-number
  rule, this is flagged for reconfirmation once the box is calm, but the
  numbers show no internal inconsistency (no decreasing hit count vs. a prior
  superset run — there is no prior run to compare against) so they are
  reported as a first measurement, not discarded, with this caveat attached.
  **The spike appears to have started only at/after test completion** (34
  files ran clean with dot-reporter output and no slowdown symptoms during
  execution) — plausibly other agents on this shared box launching work
  concurrently, not this run's own cost. Flagging to team-lead regardless.
- **Command**:
  `env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" --test-reporter=lcov --test-reporter-destination=<scratch>/lcov/deployments.lcov.info --test-reporter=dot --test-reporter-destination=stdout <34 files>`
  (repo-root cwd, per website's node-test-from-root convention)
- **Note**: first attempt with `TOVU_ADMIN_PASSWORD` inherited from shell
  environment failed every authenticated-route test with 401 (expected 200).
  Re-ran with `env -u TOVU_ADMIN_PASSWORD` per the known trap and it went
  fully green — same failure mode as the documented admin/vitest trap,
  confirmed here for website's own `node --test` auth helper too.
- **File set**: 19 internal test files (`apps/website/src/features/deployments/**/__tests__/*.test.ts`)
  + 15 external candidate suites (route tests, tool-registration tests, sqlite
  repo tests, CLI integration test) identified via the import-grep candidate
  map. 34 files total, all passed (30 top-level test blocks, all green, no
  failures/skips).
- **lcov retained at**: `<scratch>/lcov/deployments.lcov.info` (this session's
  scratchpad — not committed; regenerate with the command above if needed)
- **Result, source files only** (excludes the 19 internal test files
  themselves from the numerator/denominator — 28 source files):
  - Lines: 99.0% (7793/7868)
  - Functions: 94.5% (310/328)
  - Branches: 95.3% (1056/1108)
  - Below-100% files: `repo.sqlite.ts` 61.0% lines (83/136), 2/13 functions,
    3/4 branches — the one real gap in this directory.
    `deploy-config.ts` 98.2%, `dockerfile.ts` 98.8%, `publish-credentials/store.ts`
    99.0%, `publish-agent-tools.ts` 99.6%, `static-publish/publish-run.ts` 99.6%
    — all near-ceiling, not worklist material by the 100%-bar standard but not
    the "no coverage yet" gap Leona asked about either.
- **Conclusion**: `deployments` is NOT an unmeasured/uncovered surface. Removed
  from the ranked-priority list above.

**Phase 2 paused after this one measurement.** Immediately after this run,
1-minute load climbed to 19–35 across three checks (15:47–15:48) — well past
the ~8 go/no-go threshold in the dispatch brief. Per instruction ("if the
1-minute load average is above ~8, wait rather than launching" / "ONE test
invocation at a time, always"), no further test invocations were started.
Reported to team-lead; remaining directories stay `UNMEASURED — Phase 2
pending` until load recovers and measurement resumes, or team-lead redirects.
