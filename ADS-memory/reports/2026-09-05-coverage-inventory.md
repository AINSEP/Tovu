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
| deployments | 32 | 8557 | 19 | 15 | UNMEASURED — Phase 2 pending |
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
3. `apps/website/src/features/deployments` (8557 lines)
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

_None yet — machine load at Phase 1 completion: see first log entry below._
