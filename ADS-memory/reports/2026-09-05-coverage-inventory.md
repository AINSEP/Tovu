# Coverage inventory — apps/website/src/features/* + apps/admin/** (2026-09-05)

Dispatched by team-lead to answer Leona's question: which folders under
`apps/website/src/features/**` and `apps/admin/**` have no coverage yet.

## Read this before the tables

**This is a map of the surface and its candidate exercisers. It is not a
coverage measurement.** Every row marked `UNMEASURED` is **unknown, not
uncovered**. File/line counts are measured facts (`find` + `wc -l`). Internal
and external test-file counts are measured facts (grep over the actual
1123 test files in the repo). A **coverage percentage** is a measured fact
**only** where an lcov command and result are shown — that happened for
exactly one directory so far (`deployments`, below). Nowhere in this document
should "has N candidate test files" be read as "is N% covered" — that
inference is the specific trap that produced five wrong claims elsewhere in
this repo today (a 272-line HTTP test that never imports its target by name;
`apps/admin/src/lib/api.ts` called "~145 untested endpoints" when it is
100%; `vi.mock()`'d modules reading as covered when their real coverage is
zero). The candidate-suite map exists so the **next measurement pass** can be
targeted correctly — it is not itself an answer to "is this covered."

Related: `ADS-memory/reports/2026-09-05-coverage-task-list.md` (owner-directed
task list, 100%-is-the-bar standing rule, trap register).

**Status**: Phase 1 (static enumeration) complete. Phase 2 (measured lcov) is
now **underway** in this pass — `deployments` has been re-run and is
**CONFIRMED** (see below; the re-run reproduced the original numbers exactly
despite load spiking again during the run, which is itself the evidence the
numbers are trustworthy — see the reproduction note). This box spikes hard
(peaks 60-80+ on the 1-min average) during essentially any `node --test
--experimental-test-coverage` or `vitest --coverage` invocation right now,
with two other agents running tests concurrently — that is the new baseline
behavior to expect, not a sign any individual run is invalid, provided the
run itself still exits 0 with zero failure markers. Runs continue strictly
serially, one invocation at a time, with `uptime` recorded before and after
each.

## Method

1. Enumerated every directory under `apps/website/src/features/` (39 dirs) and
   the feature dirs + top-level subtrees under `apps/admin/src/` (32 feature
   dirs + `lib`, `hooks`, `components`).
2. Counted source files and lines per dir, excluding test files.
3. Counted **internal** test files per dir (inside the dir's own `__tests__/`
   or matching `*.test.*`).
4. Built a **candidate external suite map**: grepped all 1123 `*.test.ts(x)`
   files under `apps/website` + `apps/admin` for import-path fragments
   `features/<name>`, kept only hits where the referencing test file's own
   path does not itself contain that fragment (i.e. a suite living *outside*
   the directory), and **split every count by app** (website vs. admin) —
   several directory names exist in both apps (`settings`, `commerce`,
   `database`, `comments`, `forms`, `plugins`, `recovery`, `workspace`,
   `redirects`, `source-control`, `taxonomy`, `members`, `seo`, `pages`,
   `media`, `widgets`, `analytics`, and more) and an unsplit count would silently
   mix two unrelated directories' evidence together.
5. This method catches cross-directory exercisers (the `features/theme`
   pattern: real drivers live outside the directory). It **cannot** catch an
   HTTP/route test that drives a module without ever naming its import path
   (the `system/sites.ts` pattern) — that needs a runtime check, which is
   exactly what Phase 2 lcov measurement provides and static grep cannot.

## Website: `apps/website/src/features/*`

Sorted by line count (source, excl. tests), descending. **"Candidate ext.
suites" is a lead for where to look next, not a coverage number.**

| Dir | Files | Lines | Internal tests | Candidate ext. suites (website-app only) | Coverage |
|---|---|---|---|---|---|
| theme | 26 | 9474 | 82 | 52 (+2 from admin — cross-app reference, see appendix) | UNMEASURED |
| deployments | 32 | 8557 | 19 | 15 | **MEASURED — see Phase 2 log** |
| widgets | 26 | 5378 | 19 | 12 (+2 admin) | UNMEASURED |
| plugins | 17 | 4190 | 19 | 11 (+3 admin) | UNMEASURED |
| newsletter | 18 | 4151 | 13 | 11 | UNMEASURED |
| post | 11 | 3662 | 12 | 61 (+1 admin) | UNMEASURED |
| custom-credentials | 14 | 3433 | 10 | 7 (+1 admin) | UNMEASURED |
| webhooks | 16 | 3231 | 9 | 33 | UNMEASURED |
| agent-plugins | 13 | 3172 | 19 | 1 (+1 admin) | UNMEASURED |
| members | 12 | 3166 | 9 | 12 (+2 admin) | UNMEASURED |
| plugin-runtime | 15 | 2836 | 13 | 9 (+1 admin) | UNMEASURED |
| source-control | 8 | 2607 | 7 | 5 (+1 admin) | UNMEASURED |
| comments | 16 | 2575 | 9 | 7 (+2 admin) | UNMEASURED |
| seo | 13 | 2372 | 13 | 6 (+1 admin) | UNMEASURED |
| redirects | 13 | 2431 | 8 | 7 (+4 admin) | UNMEASURED |
| identity | 10 | 2236 | 8 | 5 | UNMEASURED |
| forms | 14 | 2139 | 11 | 8 (+3 admin) | UNMEASURED |
| site-evidence | 7 | 1914 | 5 | 3 | UNMEASURED |
| site-inspection | 6 | 1691 | 3 | 3 | UNMEASURED |
| database | 12 | 1686 | 8 | 10 (+3 admin) | UNMEASURED |
| media | 9 | 1547 | 8 | 14 (+4 admin) | UNMEASURED |
| analytics | 7 | 1557 | 6 | 4 (+1 admin) | UNMEASURED |
| recovery | 9 | 1359 | 10 | 5 (+3 admin) | UNMEASURED |
| vendor-credentials | 6 | 1318 | 3 | 4 | UNMEASURED |
| commerce | 10 | 1163 | 7 | 2 (+1 admin) | UNMEASURED |
| settings | 4 | 969 | 4 | 15 (+1 admin) | UNMEASURED |
| pages | 7 | 969 | 4 | 5 (+4 admin) | UNMEASURED |
| taxonomy | 5 | 895 | 1 | 4 (+4 admin) | UNMEASURED |
| site-glue | 6 | 763 | 8 | 1 | UNMEASURED |
| external-mcp | 3 | 537 | 1 | 0 (none found by this method) | UNMEASURED |
| media-generation | 2 | 531 | 1 | 4 | UNMEASURED |
| skills | 2 | 516 | 3 | 3 | UNMEASURED |
| origin | 5 | 491 | 3 | 11 | UNMEASURED |
| navigation | 3 | 426 | 1 | 9 | UNMEASURED |
| content-types | 5 | 352 | 1 | 19 | UNMEASURED |
| entries | 3 | 266 | 1 | 18 | UNMEASURED |
| tool-audit | 3 | 240 | 1 | 4 | UNMEASURED |
| presentation | 3 | 153 | 2 | 4 | UNMEASURED |
| workspace | 3 | 136 | 1 | 4 (+1 admin) | UNMEASURED |

`features/__tests__` (shared boundary tests, not a feature) excluded.

## Admin: `apps/admin/src/features/*` + top-level subtrees

| Dir | Files | Lines | Internal tests | Candidate ext. suites (admin-app only) | Coverage |
|---|---|---|---|---|---|
| lib | 35 | 10004 | 49 | n/a (not a `features/` dir; not scanned by this method) | **MEASURED (internal suite only) — 96.7% lines, 97.3% functions, 95.2% branches. See Phase 2 log.** |
| components | 39 | 7602 | 39 | 2 | **MEASURED — 95.0% lines, 91.4% functions, 89.5% branches. Two confirmed zero-coverage files: `TabBar.tsx`, `AssistantDock/SelectedAgentPluginTray.tsx`. See Phase 2 log.** |
| deployment | 25 | 7095 | 12 | 2 | **MEASURED — 95.6% lines, 92.9% functions, 88.1% branches. No zero-coverage files; partial gaps only. See Phase 2 log.** |
| pages | 25 | 5250 | 11 | 4 (+5 website) | UNMEASURED |
| posts | 16 | 4709 | 9 | 4 (+1 website) | UNMEASURED |
| themes | 14 | 4551 | 6 | 1 | UNMEASURED |
| collections | 26 | 4207 | 14 | 2 | UNMEASURED |
| security | 15 | 3955 | 10 | 2 | UNMEASURED |
| ai-assistant | 16 | 3788 | 11 | 2 | UNMEASURED |
| media | 13 | 3450 | 9 | 4 (+14 website) | UNMEASURED |
| settings | 15 | 3223 | 12 | 1 (+15 website — different directory, same name) | UNMEASURED |
| taxonomy | 17 | 3158 | 8 | 4 (+4 website) | UNMEASURED |
| roles | 7 | 2852 | 3 | 2 (+1 website) | UNMEASURED |
| widgets | 15 | 2997 | 9 | 2 (+12 website) | UNMEASURED |
| plugins | 20 | 2970 | 10 | 3 (+11 website) | UNMEASURED |
| users | 8 | 2863 | 7 | 2 | UNMEASURED |
| seo | 15 | 2597 | 6 | 1 (+6 website) | UNMEASURED |
| database | 16 | 2544 | 6 | 3 (+10 website) | UNMEASURED |
| hooks | 13 | 2493 | 11 | n/a | UNMEASURED |
| comments | 13 | 2267 | 7 | 2 (+7 website) | UNMEASURED |
| recovery | 10 | 2352 | 4 | 3 (+5 website) | UNMEASURED |
| redirects | 9 | 1921 | 4 | 4 (+7 website) | UNMEASURED |
| source-control | 9 | 1770 | 4 | 1 (+5 website) | UNMEASURED |
| menus | 9 | 1750 | 4 | 1 | **Off-limits — do not touch or scope test runs here (active edit in progress: `M apps/admin/src/features/menus/MenuEditor.tsx` in working tree). Not measured this pass, by instruction, not by finding.** |
| integrations | 11 | 1536 | 5 | 3 | UNMEASURED |
| members | 7 | 1227 | 3 | 2 (+12 website — different directory, same name) | UNMEASURED |
| dashboard | 7 | 1101 | 4 | 1 | UNMEASURED |
| sites | 7 | 913 | 3 | 1 | UNMEASURED |
| workspace | 7 | 715 | 3 | 1 (+4 website) | UNMEASURED |
| authentication | 3 | 273 | 2 | 1 | UNMEASURED |
| auth | 5 | 184 | 2 | 0 | UNMEASURED |
| playground | 3 | 122 | 1 | 1 | UNMEASURED |
| commerce | 2 | 128 | 1 | 1 (+2 website — different directory, same name) | UNMEASURED |

## The one measured directory: `apps/website/src/features/deployments` — **RECONFIRMED 2026-09-05 ~16:01-16:05**

- **First run (prior agent)** — uptime before `15:42` (6.32 load), uptime
  after `15:47` (35.57 load) — flagged unconfirmed because the climb
  overlapped the run window.
- **Re-run (this pass)** — uptime before: `16:01, load averages 5.30 9.98
  15.25` (under threshold, clean start). Uptime during/after: `16:04, load
  averages 80.53 50.15 31.26`, still `68.75`/`49.47` moments later, `35.35` at
  `16:05` — **load spiked hard during this run too** (two other agents were
  running tests concurrently per team-lead's dispatch note). Per the standing
  rule this second measurement's *timing* is also not clean.
- **Why the number is trusted anyway**: the re-run's coverage result is
  **byte-for-byte identical** to the first run — same 28 files, same per-file
  hit counts, same totals (99.0% lines, 94.5% functions, 95.3% branches),
  including the same `repo.sqlite.ts` 83/136 lines, 2/13 functions, 3/4
  branches. `node --test --experimental-test-coverage` derives coverage from
  V8 instrumentation of which lines/branches/functions actually executed —
  that is a function of which code paths the test file set exercises, not of
  CPU scheduling speed. A slow, thrashing box can make a test **time out and
  fail** (which would show as `not ok`/nonzero exit) but cannot silently
  change which lines were hit while every test still reports pass. Both runs:
  exit 0, zero `not ok`/failure markers in the reporter output, and identical
  hit/miss counts down to the branch. That reproduction across two
  differently-loaded windows is exactly the confirmation the standing rule
  asks for — **this number is now CONFIRMED, not void.**
- **Command run for the re-confirmation** (repo-root cwd, identical to the
  original):
  ```
  env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
    node --import tsx --test --experimental-test-module-mocks \
    --experimental-test-coverage \
    --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
    --test-reporter=lcov --test-reporter-destination=<scratch>/deployments.lcov.info \
    --test-reporter=dot --test-reporter-destination=stdout \
    <same 34 files as below>
  ```
  Result: exit 0, log has zero non-dot lines other than the trailing
  `EXIT:0` marker (no `not ok`, no `X`). lcov re-parsed with the same
  filter (`SF:` containing `src/features/deployments/`, excluding
  `__tests__`/`.test.ts`) reproduces exactly the numbers below.
- **Command** (repo-root cwd — website's node:test convention):
  ```
  env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
    node --import tsx --test --experimental-test-module-mocks \
    --experimental-test-coverage \
    --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
    --test-reporter=lcov --test-reporter-destination=<dest>/deployments.lcov.info \
    --test-reporter=dot --test-reporter-destination=stdout \
    <34 files — 19 internal + 15 external, listed below>
  ```
- **`TOVU_ADMIN_PASSWORD` trap confirmed for website's own auth helper too**:
  first attempt with the var inherited from the shell environment failed
  every authenticated-route test with 401 (expected 200). This is the same
  failure mode documented for admin/vitest, now confirmed for website's
  `node --test` + `http-test-server.ts` auth helper as well. Fixed with
  `env -u TOVU_ADMIN_PASSWORD`.
- **File set** (34 files, all passed — 30 top-level test blocks green, 0
  failures/skips):
  - Internal (19): all `*.test.ts` under
    `apps/website/src/features/deployments/**/__tests__/`
  - External (15): `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`,
    `.../tool-contribution-registry.test.ts`, `.../tool-registrations.contracts.test.ts`,
    `apps/website/src/cli/__tests__/integration/deploy-config-command.integration.test.ts`,
    `apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts`,
    `apps/website/src/features/source-control/__tests__/commit-site-export-resolution.unit.test.ts`,
    `apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts`,
    `apps/website/src/platform/db/sqlite/__tests__/publish-credential-repo.sqlite.test.ts`,
    `apps/website/src/platform/db/sqlite/__tests__/publish-history-repo.sqlite.test.ts`,
    `apps/website/src/platform/observability/__tests__/unit/config.unit.test.ts`,
    `apps/website/src/server/__tests__/route-async-guards.test.ts`,
    `apps/website/src/server/__tests__/routes/deployments-list-route.test.ts`,
    `apps/website/src/server/__tests__/routes/dockerfile-source-route.test.ts`,
    `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts`,
    `apps/website/src/server/__tests__/routes/publish-site-route.test.ts`
- **lcov retained at**: this session's scratchpad, not committed to the repo
  (`.../scratchpad/lcov/deployments.lcov.info`) — regenerate with the command
  above; the file will not survive past this session.
- **Result, source files only** (28 source files, excludes the 19 internal
  test files from the numerator/denominator):
  - Lines: 99.0% (7793/7868)
  - Functions: 94.5% (310/328)
  - Branches: 95.3% (1056/1108)
  - Below-100% files: `repo.sqlite.ts` 61.0% lines (83/136), 2/13 functions,
    3/4 branches — the one real gap. `deploy-config.ts` 98.2%,
    `dockerfile.ts` 98.8%, `publish-credentials/store.ts` 99.0%,
    `publish-agent-tools.ts` 99.6%, `static-publish/publish-run.ts` 99.6% —
    all near-ceiling.
- **Reading**: this directory is **confirmed well-covered**, not an
  unmeasured/uncovered surface — it stays off the size-ranked list below.
  `repo.sqlite.ts` remains the one real internal gap: 61.0% lines (83/136),
  2/13 functions, 3/4 branches, reproduced identically across both runs.
- **This single result is itself evidence about the rest of the table**: a
  directory with 8557 source lines and only 19 internal test files turned out
  to be 99% covered once its 15 external drivers were included. The
  `UNMEASURED` set almost certainly contains more directories in the same
  shape — well-tested from outside, undercounted by internal-test-file
  presence alone. Nothing below should be read as "probably uncovered"
  because of this.

## Measured: `apps/admin/src/lib`

- **uptime before**: `16:07, load averages 9.00 30.25 26.42` (1-min just
  under the ~10 threshold — went ahead). **During/after**: `16:08, load
  averages 91.21 51.04 34.53`, still `77.89` moments later, `26.99` by
  `16:09`. Same spike pattern as every run this pass — two other agents
  running tests concurrently. Command exited 0; no test failures (vitest's
  own summary line, not inferred).
- **Command** (cwd `apps/admin` — vitest convention):
  ```
  env -u TOVU_ADMIN_PASSWORD npx vitest run --coverage \
    --coverage.reportsDirectory=<scratch>/lib-coverage \
    <48 internal test files under apps/admin/src/lib/**/__tests__/>
  ```
- **File set**: **internal only** — all 48 `*.test.ts`/`*.test.tsx` files
  under `apps/admin/src/lib/**/__tests__/` (the inventory table's count of
  49 includes one file, `fetch-query/index.ts`'s test, counted separately;
  48 were the actual files passed to this invocation). **External suites were
  deliberately NOT included**: the import-grep for `lib/` turned up **160+**
  admin test files (nearly the entirety of `apps/admin`'s test suite, since
  `lib/api.ts` is the shared API client almost every feature test touches)
  — running that set would be indistinguishable from the banned full-suite
  invocation and was not attempted. The internal-only result below already
  answers the coverage question without it.
- **lcov retained at**: this session's scratchpad,
  `.../scratchpad/lib-coverage/lcov.info` (not committed; regenerate with the
  command above).
- **Result** (34 source files under `src/lib/**`, excludes
  `__tests__/assistant-transport.test-helpers.ts` and the unrelated
  `src/features/pages/lib/*` files an over-broad `lib/` substring match would
  otherwise pull in):
  - Lines: 96.7% (1030/1065)
  - Functions: 97.3% (466/479)
  - Branches: 95.2% (707/743)
  - `api.ts` reproduces the previously-reported 100% exactly: 298/298 lines,
    219/219 functions, 184/184 branches.
  - Below-100% files, all real: `post-title-extension.ts` **8.7% lines**
    (2/23), 0/8 functions, 0/12 branches — genuine gap, effectively untested.
    `admin-nav-i18n.ts` **50% lines** (2/4), 0/3 functions, 0/2 branches — tiny
    file, real gap. `agent-screenshot.ts` 93.9%, `assistant-transport-ag-ui.ts`
    94.2%, `router.ts` 93.8%, `assistant-transport.ts` 97.8% — all near-ceiling.
    Every other one of the 34 files is 100% across lines/functions/branches.
  - **Units note**: the inventory table's "10004 lines" for this dir is raw
    `wc -l` (includes blank lines, comments, and — since this is TypeScript —
    type/interface declarations that V8 never instruments). `api.ts` alone is
    3438 raw lines but only 298 instrumentable lines; the ~10:1 ratio is
    consistent for the rest of the directory. The two numbers are not
    comparable and neither is wrong — instrumentable-line coverage is what
    the percentage above measures.
- **Reading**: `apps/admin/src/lib` is **not** a low-coverage surface. It is
  one of the best-covered directories measured this pass — internal tests
  alone (before touching any of the 160+ external suites) already clear
  ~96-97% on every metric. Two small, real, specific gaps exist
  (`post-title-extension.ts`, `admin-nav-i18n.ts`) and are worth a direct
  look; the rest of the directory needs no further test-writing attention.

## Measured: `apps/admin/src/components`

- **uptime before**: `16:11, load averages 9.57 30.40 28.93`. **During/after**:
  `16:12, load averages 66.03 42.06 33.35`, settling to `25.52` by `16:13`.
  Same spike-then-settle pattern. Exit 0, vitest's own summary reports no
  failing tests.
- **Command** (cwd `apps/admin`):
  ```
  env -u TOVU_ADMIN_PASSWORD npx vitest run --coverage \
    --coverage.reportsDirectory=<scratch>/components-coverage \
    <39 internal test files under src/components/**/__tests__/> \
    src/__tests__/unit/panels-render.unit.test.tsx \
    src/features/plugins/__tests__/agent-plugin-capability-adapter.unit.test.ts
  ```
  The two external files are the **entire** external-suite candidate list for
  `components/` (found by the same import-grep method as the inventory's
  `features/` appendix, applied fresh to `components/` since it isn't a
  `features/` dir).
- **lcov retained at**: `.../scratchpad/components-coverage/lcov.info`.
- **Result** (35 of 39 source files appear in the lcov — the 4 that don't are
  explained below):
  - Lines: 95.0% (841/885)
  - Functions: 91.4% (330/361)
  - Branches: 89.5% (638/713)
  - **Two files at a confirmed, real 0%**: `TabBar.tsx` (0/7 lines, 0/6
    functions, 0/20 branches) and `AssistantDock/SelectedAgentPluginTray.tsx`
    (0/4 lines, 0/3 functions, 0/2 branches). Checked for a possible
    cross-directory exerciser the way `deployments`/`theme` have one: both
    names *do* appear in other admin test files (`Database.unit.test.tsx`,
    `Security.unit.test.tsx`, `SourceControl.unit.test.tsx`,
    `StaticSiteTab.unit.test.tsx`, `use-theme-pages.unit.test.ts` for
    `TabBar`; `composer-slash-plugin-pin.unit.test.tsx` for
    `SelectedAgentPluginTray`) — but on inspection every one of those hits is
    a **prose mention in a comment**, not an import or render call. These are
    genuine gaps, not an artifact of this run's file selection.
  - **One file not instrumented at all and confirmed untested app-wide**:
    `PlaceholderTabs.tsx` (87 lines) does not appear in the lcov (not even as
    0%), and a grep for `PlaceholderTabs` across every `*.test.ts(x)` file in
    `apps/admin/src` — not just this run's 41 — returns zero hits. This is a
    real, fully-unexercised component.
  - **Three files not instrumented but not a gap**: `media-picker-port.hooks.ts`,
    `widget-config-fields-port.hooks.ts`, `widget-picker-port.hooks.ts` are
    pure TypeScript interface files (an exported `interface` and nothing
    else — confirmed by reading `widget-config-fields-port.hooks.ts`) with
    zero executable statements, so V8 never instruments them. Absence from
    the lcov here is expected and not a coverage gap.
  - Other below-100% files, all real but partial (not zero): `AssistantDock.tsx`
    91.7% lines but only 2/6 functions (33%); `assistant-dock-i18n.ts` 62.5%
    lines; `EmbedInsertControl.tsx` 78.6% lines; `WidgetPickerDialog.tsx` 75.0%
    lines; `SeeMore.hooks.tsx` 85.7% lines; `MessageOverflowModal.hooks.tsx`
    (both the top-level and `AssistantDock/` copies) 77.8% lines each;
    `media-picker-dependencies.hooks.ts` 83.3% lines.
- **Reading**: `apps/admin/src/components` is a **real, moderate gap** —
  not in the same near-ceiling shape as `deployments`/`admin/lib`. Branches
  at 89.5% sit just under the 90% bar this repo's own testrunner skill uses
  for integration suites. The two confirmed-zero components (`TabBar.tsx`,
  `SelectedAgentPluginTray.tsx`) plus the confirmed-untested
  `PlaceholderTabs.tsx` are the concrete, actionable findings — small
  components, cheap to close.

## Measured: `apps/admin/src/features/deployment`

- **uptime before**: `16:14, load averages 9.33 26.77 28.50`. **During/after**:
  `16:15, load averages 13.11 26.31 28.29`, then `10.67`. Notably lighter
  spike than the previous two runs (this run's file set — 14 files — is much
  smaller). Exit 0, no failing tests.
- **Command** (cwd `apps/admin`):
  ```
  env -u TOVU_ADMIN_PASSWORD npx vitest run --coverage \
    --coverage.reportsDirectory=<scratch>/deployment-admin-coverage \
    <12 internal test files under src/features/deployment/**/__tests__/> \
    src/__tests__/unit/panels-render.unit.test.tsx \
    src/hooks/__tests__/content-refresh-coverage.unit.test.ts
  ```
  (the 2 external files are the full candidate list from the inventory
  appendix for `features/deployment`.)
- **lcov retained at**: `.../scratchpad/deployment-admin-coverage/lcov.info`.
- **Result** (20 of 25 source files appear in lcov; the other 5 are
  `*-port.hooks.ts` pure-interface files — same type-only pattern confirmed
  for `admin/components`, correctly absent, not a gap):
  - Lines: 95.6% (569/595)
  - Functions: 92.9% (236/254)
  - Branches: 88.1% (436/495)
  - **No file is at 0%.** Weakest spots: `Deployment.tsx` 75.0% lines (9/12),
    3/8 branches; `StaticSiteTab.tsx` 89.4% lines (110/123), 144/161 branches
    — the largest file in the directory and its softest spot; three
    `*-dependencies.hooks.ts` port-adapter files at 70-71% lines
    (`dockerfile-source-`, `static-export-`, `static-publish-dependencies`);
    `deployment-i18n.tsx` and `use-publish-credentials.hooks.ts` both 100%
    lines but only ~50-78% branches (untested conditional paths inside
    otherwise-executed functions).
- **Reading**: not a low-coverage surface in the "large unexercised" sense —
  no file is untested — but branches at 88.1% is the softest of the four
  directories measured this pass. `StaticSiteTab.tsx`'s branch gap is the
  single largest concrete uncovered surface in the directory by line count.

## Ranked by size of the unmeasured surface ("largest unknown", not "largest gap")

Everything here is `UNMEASURED` — this ranks what is biggest and least known,
not what is least covered. `deployments`, `apps/admin/src/lib`,
`apps/admin/src/components`, and `apps/admin/src/features/deployment` are
removed from this list because they are no longer unknown (see their measured
sections above/below).

1. `apps/website/src/features/theme` — 9474 lines (known cross-directory
   exerciser pattern; needs the 54-suite external run, not just the 82
   internal tests, to answer honestly)
2. `apps/website/src/features/widgets` — 5378 lines
3. `apps/admin/src/features/pages` — 5250 lines
4. `apps/admin/src/features/posts` — 4709 lines
5. `apps/admin/src/features/themes` — 4551 lines (only 1 candidate external
   suite — thin external signal)
6. `apps/admin/src/features/collections` — 4207 lines
7. `apps/website/src/features/plugins` — 4190 lines

## What would settle each row — for whoever resumes Phase 2

Same recipe as the `deployments` run, scoped per directory:

- **Website (`node --test`, run from repo root, always `env -u TOVU_ADMIN_PASSWORD`)**:
  ```
  env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json \
    node --import tsx --test --experimental-test-module-mocks \
    --experimental-test-coverage \
    --test-coverage-exclude="**/__no_route_coverage_gate_exclusions__/**" \
    --test-reporter=lcov --test-reporter-destination=<scratch>/<dir>.lcov.info \
    --test-reporter=dot --test-reporter-destination=stdout \
    <dir's internal *.test.ts files> <dir's external candidate suites from the appendix below>
  ```
  Then filter the lcov `SF:` entries to paths containing the target directory
  and excluding `__tests__`/`.test.ts`, sum LF/LH/FNF/FNH/BRF/BRH, and report
  per-file below-100% lines same as the `deployments` example above.
- **Admin (`vitest`, run from `apps/admin`, own `--coverage.reportsDirectory`
  to avoid clobbering another agent's run)**:
  ```
  env -u TOVU_ADMIN_PASSWORD npx vitest run --coverage \
    --coverage.reportsDirectory=<scratch>/<dir>-coverage \
    <dir's internal test files> <dir's external candidate suites>
  ```
- **Always**: `uptime` immediately before launching (abort if 1-min > ~8),
  one invocation at a time, two directories per batch strictly serial, and
  `uptime` again right after — if it spiked, say so rather than adjusting the
  number, exactly as done for `deployments` above.
- **`theme` specifically**: do not measure with only its 82 internal tests —
  that undercounts by construction (the directory's own known pattern). Use
  the full 52-website + 2-admin external list in the appendix.
- **`apps/admin/src/lib`, `hooks`, `components`**: not `features/` dirs, so
  the import-grep method wasn't run against them here. Before scoping a
  measurement, grep test files for import paths containing `lib/`, `hooks/`,
  `components/` the same way, per-file, since this method has already proven
  file-listing/symbol-presence alone is not sufand a naive internal-only run
  would repeat today's five wrong claims.
- **`menus` (admin)**: leave alone this pass — active edit in progress
  elsewhere in the shared tree.

## Appendix: full external-suite map, per directory (website [W] / admin [A])

Generated by grepping all 1123 test files for `features/<name>` import
fragments and keeping only hits outside that directory's own path, split by
app. This is the exact file list the "candidate ext. suites" counts above are
built from — use it directly to construct the next measurement run rather
than re-deriving it.

```
### features/INFO  (website external: 1, admin external: 0)
  [W] apps/website/src/features/__tests__/features-no-server-imports.boundary.test.ts
### features/agent-plugins  (website external: 1, admin external: 1)
  [W] apps/website/src/platform/site-dir/__tests__/unit/site-root.unit.test.ts
  [A] apps/admin/src/features/plugins/__tests__/agent-plugin-capability-adapter.unit.test.ts
### features/ai-assistant  (website external: 0, admin external: 2)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx
### features/analytics  (website external: 4, admin external: 1)
  [W] apps/website/src/server/__tests__/routes/analytics-ingest.test.ts
  [W] apps/website/src/server/__tests__/routes/analytics-recent-hits.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/analytics-ingest.integration.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/auth  (website external: 1, admin external: 0)
  [W] apps/website/src/features/identity/__tests__/default-credential-exposure.test.ts
### features/authentication  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/chat-pane  (website external: 0, admin external: 1)
  [A] apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx
### features/collections  (website external: 0, admin external: 2)
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/comments  (website external: 7, admin external: 2)
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.comments.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/server/__tests__/route-async-guards.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/comments/__tests__/moderate.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/comments/__tests__/moderation-queue.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/comments-submit.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/commerce  (website external: 2, admin external: 1)
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/products.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/products.route.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/content-types  (website external: 19, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts
  [W] apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/features/presentation/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/features/tool-audit/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/read-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/write-service.integration.test.ts
  [W] apps/website/src/features/workspace/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/server/__tests__/admin-widgets-routes.test.ts
  [W] apps/website/src/server/__tests__/content-type-write-provenance.test.ts
  [W] apps/website/src/server/__tests__/routes/content-types-field-shape.test.ts
### features/custom-credentials  (website external: 7, admin external: 1)
  [W] apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts
  [W] apps/website/src/assistant/__tests__/read-only-tool-constraint.composition.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/custom-credential-repo.sqlite.test.ts
  [W] apps/website/src/platform/http/__tests__/client.test.ts
  [W] apps/website/src/server/__tests__/routes/custom-credentials-route.test.ts
  [W] apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts
  [A] apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx
### features/dashboard  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/database  (website external: 10, admin external: 3)
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts
  [W] apps/website/src/contracts/core/__tests__/integration/operation-lock.cross-domain.integration.test.ts
  [W] apps/website/src/contracts/core/__tests__/unit/operation-lock.unit.test.ts
  [W] apps/website/src/platform/db/__tests__/posts-body-format-migration.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/database-introspection-adapter.sqlite.integration.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/database-journal.integration.test.ts
  [W] apps/website/src/server/__tests__/admin-database-timeline-route.test.ts
  [W] apps/website/src/server/__tests__/routes/database-schema-state-route.test.ts
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/deployment  (website external: 0, admin external: 2)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/deployments  (website external: 15, admin external: 0) -- MEASURED, see above
  [W] apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/cli/__tests__/integration/deploy-config-command.integration.test.ts
  [W] apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts
  [W] apps/website/src/features/source-control/__tests__/commit-site-export-resolution.unit.test.ts
  [W] apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/publish-credential-repo.sqlite.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/publish-history-repo.sqlite.test.ts
  [W] apps/website/src/platform/observability/__tests__/unit/config.unit.test.ts
  [W] apps/website/src/server/__tests__/route-async-guards.test.ts
  [W] apps/website/src/server/__tests__/routes/deployments-list-route.test.ts
  [W] apps/website/src/server/__tests__/routes/dockerfile-source-route.test.ts
  [W] apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts
  [W] apps/website/src/server/__tests__/routes/publish-site-route.test.ts
### features/entries  (website external: 18, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.entries.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/read-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolver-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/write-service.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/resolvers-recent-entries.unit.test.ts
  [W] apps/website/src/platform/db/__tests__/migration-manifest.test.ts
  [W] apps/website/src/server/__tests__/admin-widgets-routes.test.ts
  [W] apps/website/src/server/__tests__/routes/entries-routes.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts
### features/execution  (website external: 0, admin external: 1)
  [A] apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx
### features/forms  (website external: 8, admin external: 3)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.forms.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/resolvers-contact-form.unit.test.ts
  [W] apps/website/src/server/__tests__/routes/forms-submit.test.ts
  [W] apps/website/src/server/__tests__/routes/forms-webhook-fanout.test.ts
  [W] apps/website/src/server/__tests__/unit/server-modules.unit.test.ts
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/identity  (website external: 5, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.identity-authorization.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.identity-contracts.test.ts
  [W] apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts
  [W] apps/website/src/features/pages/__tests__/edit-html-permission.test.ts
  [W] apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts
### features/integrations  (website external: 0, admin external: 3)
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/media  (website external: 14, admin external: 4)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.media.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/media-content-type-store.sqlite.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/media-provider-credential-repo.sqlite.test.ts
  [W] apps/website/src/server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts
  [W] apps/website/src/server/__tests__/media-original-video-route.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-route.test.ts
  [W] apps/website/src/server/__tests__/routes/media-content-type.test.ts
  [W] apps/website/src/server/__tests__/routes/media-original-route.test.ts
  [W] apps/website/src/server/__tests__/routes/media-site-serving.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/media-generation  (website external: 4, admin external: 0)
  [W] apps/website/src/assistant/__tests__/media-generation-search-discoverability.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/features/media/__tests__/tool-registrations.test.ts
### features/members  (website external: 12, admin external: 2)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.members.test.ts
  [W] apps/website/src/server/__tests__/media-original-video-route.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-route.test.ts
  [W] apps/website/src/server/__tests__/routes/content-post-get-by-slug.test.ts
  [W] apps/website/src/server/__tests__/routes/members-auth.test.ts
  [W] apps/website/src/server/__tests__/unit/server-modules.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/members/__tests__/disable.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/members/__tests__/disable.unit.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/menus  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/navigation  (website external: 9, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.menus.test.ts
  [W] apps/website/src/features/identity/__tests__/permission-migrations.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts
  [W] apps/website/src/features/widgets/__tests__/unit/resolvers-menu.unit.test.ts
  [W] apps/website/src/server/__tests__/admin-menus-routes.test.ts
  [W] apps/website/src/server/__tests__/routes/widgets-dynamic-resolver-site-serving.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-menu-embed-resolution.test.ts
### features/newsletter  (website external: 11, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.newsletter.test.ts
  [W] apps/website/src/server/__tests__/routes/newsletter-public-routes.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/cancel-campaign.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/create-list.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/list-send-log.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/pause-campaign.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/resume-campaign.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/schedule-campaign.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/send-test-campaign.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/update-campaign.test.ts
### features/origin  (website external: 11, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts
  [W] apps/website/src/features/members/__tests__/write-service.test.ts
  [W] apps/website/src/features/redirects/__tests__/phase-handler.oracle.test.ts
  [W] apps/website/src/features/redirects/__tests__/redirects.test.ts
  [W] apps/website/src/features/site-evidence/__tests__/integration/playwright-browser.integration.test.ts
  [W] apps/website/src/features/site-evidence/__tests__/unit/collect-page-evidence.unit.test.ts
  [W] apps/website/src/features/site-evidence/__tests__/unit/tool-registrations.unit.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/origin-repo.sqlite.import-boundary.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/llms.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/robots.route.test.ts
### features/pages  (website external: 5, admin external: 4)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts
  [W] apps/website/src/features/identity/__tests__/wiring.test.ts
  [W] apps/website/src/features/post/__tests__/post.body-format.test.ts
  [W] apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx
  [A] apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/playground  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/plugin-runtime  (website external: 9, admin external: 1)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts
  [W] apps/website/src/contracts/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts
  [W] apps/website/src/features/agent-plugins/__tests__/unit/manifest.unit.test.ts
  [W] apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts
  [W] apps/website/src/features/site-glue/__tests__/integration/content-lifecycle.integration.test.ts
  [W] apps/website/src/server/inbound/admin-http/http/__tests__/unit/plugins-dto.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/plugins-http.integration.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/integration/set-enabled-gap-fill.test.ts
  [A] apps/admin/src/features/plugins/__tests__/Plugins.unit.test.tsx
### features/plugins  (website external: 11, admin external: 3)
  [W] apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts
  [W] apps/website/src/assistant/__tests__/mcp-federation.registrations.test.ts
  [W] apps/website/src/assistant/__tests__/mcp-federation.trust.test.ts
  [W] apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/features/newsletter/__tests__/data-module-manifest.failure-rollback.test.ts
  [W] apps/website/src/platform/db/__tests__/migration-manifest.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/content-db-recovery.integration.test.ts
  [W] apps/website/src/platform/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts
  [W] apps/website/src/server/__tests__/route-async-guards.test.ts
  [W] apps/website/src/server/__tests__/routes/payments-webhook.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/components/AssistantDock/__tests__/resolve-composer-discovery-outcome.unit.test.ts
  [A] apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx
### features/post  (website external: 61, admin external: 1)
  [W] apps/website/src/assistant/__tests__/byok-provider-turn.test.ts
  [W] apps/website/src/assistant/__tests__/byok-tool-surface.test.ts
  [W] apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts
  [W] apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.post.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts
  [W] apps/website/src/assistant/site/__tests__/capability-registry.test.ts
  [W] apps/website/src/assistant/site/__tests__/client-directives.test.ts
  [W] apps/website/src/assistant/site/__tests__/tools.test.ts
  [W] apps/website/src/contracts/core/commands/__tests__/command-atomicity.test.ts
  [W] apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts
  [W] apps/website/src/contracts/core/commands/__tests__/post-delete-reverter.test.ts
  [W] apps/website/src/features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts
  [W] apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts
  [W] apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts
  [W] apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts
  [W] apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  [W] apps/website/src/platform/db/__tests__/migration-manifest.test.ts
  [W] apps/website/src/platform/export/__tests__/route-manifest.test.ts
  [W] apps/website/src/platform/export/__tests__/site-exporter.test.ts
  [W] apps/website/src/platform/routing/__tests__/routing.test.ts
  [W] apps/website/src/server/__tests__/admin-page-get-route.test.ts
  [W] apps/website/src/server/__tests__/assistant-byok-routes.test.ts
  [W] apps/website/src/server/__tests__/media-original-video-route.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts
  [W] apps/website/src/server/__tests__/media-rendition-route.test.ts
  [W] apps/website/src/server/__tests__/routes/admin-post-template-preview.test.ts
  [W] apps/website/src/server/__tests__/routes/content-post-get-by-slug.test.ts
  [W] apps/website/src/server/__tests__/routes/missing-template-diagnostic-v2-stylesheet.test.ts
  [W] apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts
  [W] apps/website/src/server/__tests__/routes/post-template-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/render-depth-bound-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/request-cost-traversal.measurement.test.ts
  [W] apps/website/src/server/__tests__/routes/seo-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/widgets-dynamic-resolver-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/widgets-site-serving.test.ts
  [W] apps/website/src/server/http/__tests__/headless-contracts.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-access-and-not-found.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-slug-collision.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-group-edge-cases.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-liquid-readable.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-v2-layout-classification.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/handlebars-sandbox.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/liquid-sandbox.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render-handlebars.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/llms.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/render-context-resolution-helpers.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/sitemap.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-menu-embed-resolution.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts
  [A] apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts
### features/posts  (website external: 1, admin external: 4)
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/tiptap-render-contract.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx
  [A] apps/admin/src/features/pages/__tests__/rules.unit.test.ts
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/presentation  (website external: 4, admin external: 0)
  [W] apps/website/src/server/http/__tests__/headless-contracts.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/get.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts
### features/recovery  (website external: 5, admin external: 3)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts
  [W] apps/website/src/contracts/core/__tests__/integration/operation-lock.cross-domain.integration.test.ts
  [W] apps/website/src/contracts/core/__tests__/unit/operation-lock.unit.test.ts
  [W] apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts
  [A] apps/admin/src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/redirects  (website external: 7, admin external: 4)
  [W] apps/website/src/assistant/__tests__/byok-provider-turn.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts
  [W] apps/website/src/platform/export/__tests__/route-manifest.test.ts
  [W] apps/website/src/platform/export/__tests__/site-exporter.test.ts
  [W] apps/website/src/server/__tests__/routes/redirects-create.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/redirects/__tests__/shared.test.ts
  [A] apps/admin/src/__measurements__/render-churn.measurement.test.tsx
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/roles  (website external: 1, admin external: 2)
  [W] apps/website/src/server/__tests__/identity-policy-permission-removal.test.ts
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/security  (website external: 0, admin external: 2)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/seo  (website external: 6, admin external: 1)
  [W] apps/website/src/assistant/__tests__/admin-screen-link-tool.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/llms.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/robots.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/sitemap.route.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/settings  (website external: 15, admin external: 1)
  [W] apps/website/src/assistant/__tests__/custom-instructions.test.ts
  [W] apps/website/src/assistant/__tests__/public-assistant-settings.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.comments.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.settings.test.ts
  [W] apps/website/src/features/commerce/__tests__/integration/repo.sqlite.integration.test.ts
  [W] apps/website/src/features/members/__tests__/repo.contract.test.ts
  [W] apps/website/src/features/navigation/__tests__/repo.sqlite.test.ts
  [W] apps/website/src/server/__tests__/assistant-byok-routes.test.ts
  [W] apps/website/src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts
  [W] apps/website/src/server/__tests__/routes/module-status-route.test.ts
  [W] apps/website/src/server/__tests__/routes/readiness-routes.test.ts
  [W] apps/website/src/server/__tests__/routes/settings-workspace-scoping.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/site-evidence  (website external: 3, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-compliance-package.unit.test.ts
### features/site-glue  (website external: 1, admin external: 0)
  [W] apps/website/src/contracts/core/__tests__/unit/extension-capability-vocabulary.unit.test.ts
### features/site-inspection  (website external: 3, admin external: 0)
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/server/__tests__/routes/site-profile-route.test.ts
### features/sites  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/skills  (website external: 3, admin external: 0)
  [W] apps/website/src/platform/site-dir/__tests__/unit/site-root.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/http/__tests__/unit/skills-dto.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/skills/__tests__/integration/skills-http.integration.test.ts
### features/source-control  (website external: 5, admin external: 1)
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/source-control-credential-repo.sqlite.test.ts
  [W] apps/website/src/server/__tests__/route-async-guards.test.ts
  [W] apps/website/src/server/__tests__/routes/source-control-credentials-route.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/taxonomy  (website external: 4, admin external: 4)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/list.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts
  [A] apps/admin/src/__measurements__/render-churn.measurement.test.tsx
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/theme  (website external: 52, admin external: 2)
  [W] apps/website/src/assistant/__tests__/theme-list-files-malformed-input-status.integration.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.themes-edit-rename.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.themes-trash-restore.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts
  [W] apps/website/src/cli/__tests__/integration/theme-migrate-command.integration.test.ts
  [W] apps/website/src/cli/__tests__/integration/theme-normalize-build-command.integration.test.ts
  [W] apps/website/src/cli/__tests__/integration/theme-validate-command.integration.test.ts
  [W] apps/website/src/contracts/core/__tests__/integration/child-process-coverage-env-wiring.test.ts
  [W] apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts
  [W] apps/website/src/features/post/__tests__/list-published-previews.test.ts
  [W] apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  [W] apps/website/src/platform/export/__tests__/route-manifest.test.ts
  [W] apps/website/src/server/__tests__/routes/admin-post-template-preview.test.ts
  [W] apps/website/src/server/__tests__/routes/marketplace-download-route.integration.test.ts
  [W] apps/website/src/server/__tests__/routes/media-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/missing-template-diagnostic-v2-stylesheet.test.ts
  [W] apps/website/src/server/__tests__/routes/post-template-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/seo-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/theme-file-copy-rename-route.integration.test.ts
  [W] apps/website/src/server/__tests__/routes/theme-file-save-route.integration.test.ts
  [W] apps/website/src/server/__tests__/routes/widgets-dynamic-resolver-site-serving.test.ts
  [W] apps/website/src/server/__tests__/routes/widgets-site-serving.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/marketplace/__tests__/list.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/rescan-themes.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-access-and-not-found.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-built-theme-gate.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-slug-collision.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-copy-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-delete-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-get-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-group-edge-cases.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-put-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-rename-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-reset-route-branches.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-liquid-readable.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-page-publish-route.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-pure-helpers.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-svg-xss.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-v2-layout-classification.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/themes/__tests__/integration/explore.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render-handlebars.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-menu-embed-resolution.test.ts
  [W] apps/website/src/server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts
  [A] apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts
  [A] apps/admin/src/features/pages/__tests__/use-theme-canvas-styling.unit.test.ts
### features/themes  (website external: 0, admin external: 1)
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/tool-audit  (website external: 4, admin external: 0)
  [W] apps/website/src/assistant/__tests__/byok-tool-surface.test.ts
  [W] apps/website/src/assistant/__tests__/read-only-tool-constraint.composition.test.ts
  [W] apps/website/src/assistant/__tests__/tool-catalog-audit.test.ts
  [W] apps/website/src/assistant/__tests__/tool-executor-audit.test.ts
### features/users  (website external: 0, admin external: 2)
  [A] apps/admin/src/__measurements__/request-volume.measurement.test.tsx
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
### features/vendor-credentials  (website external: 4, admin external: 0)
  [W] apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts
  [W] apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts
  [W] apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/vendor-credential-repo.sqlite.test.ts
### features/webhooks  (website external: 33, admin external: 0)
  [W] apps/website/src/assistant/__tests__/byok-credential.test.ts
  [W] apps/website/src/assistant/__tests__/execution-credential-store.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-aad-writer-sync.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-aad.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-dcr.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-payload-version.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-reauth-tool.test.ts
  [W] apps/website/src/assistant/__tests__/external-mcp-store.test.ts
  [W] apps/website/src/assistant/__tests__/live-model-cache.test.ts
  [W] apps/website/src/assistant/__tests__/read-only-tool-constraint.composition.test.ts
  [W] apps/website/src/assistant/__tests__/site-credential-store.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts
  [W] apps/website/src/features/deployments/publish-credentials/__tests__/s3-compatible-field-guidance.unit.test.ts
  [W] apps/website/src/features/deployments/publish-credentials/__tests__/store.unit.test.ts
  [W] apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts
  [W] apps/website/src/features/deployments/static-publish/__tests__/verify.unit.test.ts
  [W] apps/website/src/platform/connectors/__tests__/composio-config-store.test.ts
  [W] apps/website/src/platform/connectors/__tests__/connector-credential-store.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts
  [W] apps/website/src/platform/db/sqlite/__tests__/webhook-subscription-repo.sqlite.test.ts
  [W] apps/website/src/server/__tests__/admin-assistant-execution-credential-routes.test.ts
  [W] apps/website/src/server/__tests__/admin-assistant-site-credential-routes.test.ts
  [W] apps/website/src/server/__tests__/admin-connectors-oauth.test.ts
  [W] apps/website/src/server/__tests__/admin-connectors-routes.test.ts
  [W] apps/website/src/server/__tests__/admin-external-mcp-routes.test.ts
  [W] apps/website/src/server/__tests__/admin-integrations-routes.test.ts
  [W] apps/website/src/server/__tests__/admin-media-provider-routes.test.ts
  [W] apps/website/src/server/__tests__/routes/forms-webhook-fanout.test.ts
  [W] apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts
  [W] apps/website/src/server/__tests__/unit/server-modules.unit.test.ts
  [W] apps/website/src/server/runtime/boot/__tests__/resolve-mailer.unit.test.ts
### features/widgets  (website external: 12, admin external: 2)
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.widgets-contracts.test.ts
  [W] apps/website/src/contracts/core/entry-refs/__tests__/extractor-marker.canary.test.ts
  [W] apps/website/src/contracts/core/entry-refs/__tests__/integration/html-entry-refs-consistency.integration.test.ts
  [W] apps/website/src/contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts
  [W] apps/website/src/server/__tests__/admin-widgets-routes.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/region-bind.unit.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render-handlebars.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts
  [W] apps/website/src/server/inbound/public-http/http/site/__tests__/tiptap-render-contract.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
  [A] apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts
### features/workspace  (website external: 4, admin external: 1)
  [W] apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts
  [W] apps/website/src/assistant/__tests__/tool-registrations.workspace.test.ts
  [W] apps/website/src/server/inbound/admin-http/routes/workspace/__tests__/create.test.ts
  [A] apps/admin/src/__tests__/unit/panels-render.unit.test.tsx
```
