# apps/admin Coverage Report — 2026-08-15

**Producer:** TestRunner (raw coverage report only — changed-code diff attribution belongs to Code
Inspection, per `harness-engineering/sensors/changed-code-coverage.md`)
**Tool:** vitest v4.1.10, v8 coverage provider, `apps/admin/vitest.config.ts` + CLI overrides (below)

## Why there is no single head SHA and no aggregate total

`general-work` was extremely active for the full duration of this run — a peer session shipping a
five-tab Deployment panel, a static exporter, a `tovu export` CLI command, server admin routes, and a
reset-password dialog change, interleaved with a TDD agent landing fixes in `apps/admin`. HEAD moved
many times during measurement (commits observed: `4315a06` → ... → `3a83cf99e`, final measurement SHA
for most sets). Per `coverage-integrity-policy.md`, sets measured at different SHAs do not compose
into one defensible number, so **this report gives per-set results tagged with the SHA each set was
actually measured at, and emits no whole-suite aggregate.**

## Guard protocol actually used, and where the causal model was wrong

Before and immediately after every run: `git rev-parse HEAD` and `git status --short -- apps/admin`.
If either changed during the run, the run's numbers were discarded and re-run (tracked as "attempts"
below). All sets below reflect the guard passing clean on their **final, reported** attempt.

**What I believed early on, and what turned out to be true.** Early guard trips (themes/ and
deployment/ files appearing dirty) were attributed to `TestRunner-negverify`'s mutation-testing sweep,
described at the time as running "injection-seam mutation tests across ~37 files." That was wrong on
two counts: the ~37 number was a miscount of test counts, not file counts, and — more importantly —
the sweep was not the churn source at all. `TestRunner-negverify` mutated exactly **two** files all
session (`use-admin-locale.hooks.ts`, `WidgetPickerDialog.hooks.tsx`), then ran a read-only static
pass across ~50-60 more sites, which came back 63/63 clean with zero mutations needed. **The sweep's
entire footprint on `apps/admin` this session was two files, and it was idle or read-only for nearly
all of this run's duration.** The actual churn was two other things happening concurrently: a peer
session shipping the five-tab Deployment panel, a static exporter, a `tovu export` CLI command, server
admin routes, and a reset-password dialog change; and a TDD agent landing fixes to `apps/admin` in the
same window. Both kept committing throughout — there was nothing to wait for, and no ETA would have
helped, which is why the eventual strategy was to re-run promptly on a trip rather than sequence around
either agent.

**The guard was also stricter than it needed to be, and a precise overlap check replaces the earlier
binary discard-on-any-change rule** (per team-lead's direction): a file changing mid-run only taints a
set's measurement if that file is actually exercised by the set's tests. Checkable exactly, after the
fact: take the files that changed during a tripped run, and check whether they appear in that same
run's own `lcov.info` **with nonzero lines hit** (not merely listed — `coverage.all: true` means every
set's lcov lists the entire `src/` tree, most of it at 0/0 regardless of relevance). Applied
retroactively to every set that tripped, using the retained lcov artifacts and, for HEAD-moves, `git
diff --name-only <sha-before> <sha-after> -- apps/admin`:

| Set / attempt | What changed mid-run | Overlap check | Verdict |
|---|---|---|---|
| set1, attempts using pre-`reportOnFailure` runner (multiple) | n/a | **No artifact was produced at all** (the `reportOnFailure` gap below, not a tree-movement question) | Not a guard case — nothing to check overlap against |
| set2 (`components/`), original attempt | `features/deployment/{StaticSiteTab.tsx,deployment-i18n.tsx,PureTabs.unit.test.tsx}` | `deployment-i18n.tsx` had **66.67% line coverage** in that exact run — genuine overlap, most likely a shared i18n dictionary registry pulling deployment's strings into whatever `components/` tests exercise | **Trip with overlap — correctly discarded.** (Numerically matched the later clean re-run anyway, but that's coincidence, not proof — glad this wasn't asserted as valid on the strength of the coincidence alone.) |
| set3 (`hooks/`), original attempt | `features/integrations/hooks/use-integration-deliveries.hooks.ts` | File does not appear anywhere in that run's lcov, not even at 0/0 (likely didn't exist yet when the coverage file-scan ran) | **Trip, no overlap — measurement was valid.** 94.9%/84.14%/93.18%/97.27% (stmts/branch/funcs/lines) confirmed, and matches the fresh re-run exactly |
| set4 (`lib/`), attempt 1 | `styles.css` | CSS cannot appear in JS/TS v8 coverage instrumentation at all — zero `SF:` matches | **Trip, no overlap — measurement was valid** (matches the final re-run) |
| set4, attempt 2 | (HEAD moved, no `apps/admin` status change) | `git diff --name-only` between the two SHAs touches **zero files under `apps/admin`** | **Trip, no overlap — measurement was valid** (matches the final re-run) |
| set11 (`deployment/`), attempt 1 | `styles.css` | Same CSS reasoning | **Trip, no overlap — measurement was valid** |
| set13 (`media/`), attempt 1 | `styles.css` | Same CSS reasoning | **Trip, no overlap — measurement was valid** |
| set16 (`settings/`+`seo/`), attempts 1 and 2 | (HEAD moved both times, no `apps/admin` status change) | `git diff --name-only` for both SHA ranges touches **zero files under `apps/admin`** | **Trip, no overlap — measurement was valid both times** (all three attempts, including the final one, produced bit-identical numbers) |

Net effect: every set in this report's table was, in retrospect, measuring real, untainted numbers on
its first artifact-producing attempt — the extra re-runs were free of information, not free of cost.
Recorded here anyway because "how many re-runs a set needed" is itself part of an honest result, per
the standard applied to this run throughout.

## Two methodology bugs found and fixed (both CLI-only, no shared-config edits)

1. **`reportsDirectory` collision (self-inflicted, in my own wrapper, not `vitest.config.ts`):** early
   attempts wrote a stdout log file *inside* the same directory passed to
   `--coverage.reportsDirectory`. The v8 provider clears/recreates that directory at startup, unlinking
   the log file out from under its own open fd. Fixed by writing the log as a sibling path
   (`<set>.log`), not nested inside the coverage output directory. `vitest.config.ts`'s own
   `reportsDirectory: "./coverage"` default was never used — every set below used a per-set
   `--coverage.reportsDirectory` override, so no set overwrote another's output.
2. **`coverage.reportOnFailure` gap:** `vitest.config.ts` never sets this (Vitest default: `false`).
   Any set containing even one failing test produced **zero coverage artifacts**, silently — no error,
   just nothing written. This is why the `__tests__`/`__measurements__`/`styles` set produced no data
   across several early attempts regardless of guard status. Fixed by adding
   `--coverage.reportOnFailure=true` to every run in this report (CLI flag only — `vitest.config.ts`
   itself was not touched, so this carries no risk to the other concurrent agents).

## Third finding: `coverage.all` defaults true — set-level aggregate totals are not meaningful

`vitest.config.ts`'s coverage block sets no `include`/`all`, so Vitest's v8 provider instruments
**every file under `apps/admin/src`** on every run, not just files the running set's tests import.
Confirmed empirically: running only `src/components` tests still produced a report spanning the whole
`src/` tree (8000+ statements), with everything outside what that set actually exercised sitting at or
near 0%. **The "All files" summary line printed by each run is therefore not this set's coverage — it
is mostly a measure of what wasn't run.** Per team-lead's direction, this report gives **per-directory
scoped coverage** (the set's own feature directory/directories, computed either from the v8 text
table's own row or, where that row was cut off, parsed directly from the set's `lcov.info`) and does
not report the "All files" line at all.

## Chunking scheme (22 sets, one `npx vitest run --coverage` process per set, sequential)

Non-feature (4): `__tests__/`+`__measurements__/`+`styles/`, `components/`, `hooks/`, `lib/`
Feature, standalone (10): `collections/` `widgets/` `plugins/` `taxonomy/` `posts/` `pages/`
`deployment/` `comments/` `media/` `forms/`
Feature, paired to avoid 29 tiny processes (8): `users/+themes/` `settings/+seo/`
`integrations/+ai-assistant/` `redirects/+recovery/` `menus/+database/` `dashboard/+roles/`
`workspace/+playground/+members/` `authentication/+auth/+analytics/+commerce/`

Raw artifacts (lcov.info + HTML report) per set: `ADS-memory/.local-artifacts/coverage/<set>/`
(gitignored, regenerable — see individual paths in the table).

## Per-set results

All test counts below are from each set's own final clean run. "Attempts" counts every guard-tripped
retry. See the overlap-check table above for which of these retries were actually necessary versus
which discarded a measurement that the retroactive check shows was already valid.

| Set | Final SHA | Attempts | Tests | Own-directory coverage (metric labeled) | Raw artifact |
|---|---|---|---|---|---|
| `__tests__/`+`__measurements__/`+`styles/` | `352adf6c` | 6 (5 produced no artifact — `reportOnFailure` gap, not a guard case; see Findings) | 101/102 pass (1 flaky, see Findings) | N/A — these are test-only files; production code they exercise (App.tsx, AssistantDock, etc.) is scattered across other sets, not owned by this one | `set01-final2/` |
| `components/` | `3a83cf99` | 2 | 337/337 | lines 93.71%, branch 89.36%, funcs 90.71% (lcov) | `set02-components-final/` |
| `hooks/` | `3a83cf99` | 2 | 155/155 | stmts 94.9%, branch 84.14%, funcs 93.18%, lines 97.27% (v8) | `set03-hooks-final/` |
| `lib/` | `a1e86b02` | 3 | 419/419 | stmts 71.48%, branch 74.9%, funcs 50.28%, lines 71.73% (v8) | `set04-lib-r3/` |
| `features/collections/` | `a1e86b02` | 1 | 256/256 | stmts 97.15%, branch 96.15%, funcs 95.45%, lines 97.22% (v8) | `set05-collections/` |
| `features/widgets/` | `a1e86b02` | 1 | 104/104 | stmts 84.61%, branch 83.2%, funcs 85.1%, lines 84.7% (v8); `widgets/hooks` separately: 76.27/65.62/63.63/84.12 | `set06-widgets/` |
| `features/plugins/` | `a1e86b02` | 1 | 55/55 | stmts 95.95%, branch 91.04%, funcs 97.43%, lines 97.77% (v8) | `set07-plugins/` |
| `features/taxonomy/` | `a1e86b02` | 1 | 125/125 | stmts 92.23%, branch 88.46%, funcs 86.95%, lines 93.4% (v8) | `set08-taxonomy/` |
| `features/posts/` | `a1e86b02` | 1 | 159/159 | stmts 63.5%, branch 75.09%, funcs 51.85%, lines 63.93% (v8); `posts/hooks` separately: 93.33/78.03/91.66/97.26 | `set09-posts/` |
| `features/pages/` | `a1e86b02` | 1 | 124/124 | stmts 95.78%, branch 89.42%, funcs 95.74%, lines 97.59% (v8) | `set10-pages/` |
| `features/deployment/` | `a1e86b02` | 2 | 53/53 | stmts 93.9%, branch 81.81%, funcs 100%, lines 95.89% (v8) — see Findings | `set11-deployment-r2/` |
| `features/comments/` | `a1e86b02` | 1 | 57/57 | stmts 92.59%, branch 88.98%, funcs 89.13%, lines 96.47% (v8) | `set12-comments/` |
| `features/media/` | `a1e86b02` | 2 | 48/48 | stmts 76.92%, branch 76.33%, funcs 77.77%, lines 81.05% (v8) | `set13-media-r2/` |
| `features/forms/` | `a1e86b02` | 1 | 27/27 | stmts 69.75%, branch 70.74%, funcs 65.82%, lines 74.43% (v8) | `set14-forms/` |
| `features/users/` + `features/themes/` | `a1e86b02` | 1 | 179/179 | users: 100/97.7/100/100 (v8); themes: 89.06/83.51/92.1/93.33 (v8) | `set15-users-themes/` |
| `features/settings/` + `features/seo/` | `3a83cf99` | 3 (identical numbers on all 3 attempts) | 119/119 | settings: 73.49/74.32/55.1/72 (v8); seo/hooks: 78.33/65.51/67.34/80.18 (v8) | `set16-settings-seo-r3/` |
| `features/integrations/` + `features/ai-assistant/` | `3a83cf99` | 1 | 93/93 | integrations: lines 88.79%, branch 73.24%, funcs 80.0% (lcov); ai-assistant: lines 87.79%, branch 72.47%, funcs 81.25% (lcov) | `set17-integrations-ai/` |
| `features/redirects/` + `features/recovery/` | `3a83cf99` | 1 | 145/145 | recovery: 100/92.4/100/100 (v8); redirects: 76.47/62.5/66.66/75 (v8) | `set18-redirects-recovery/` |
| `features/menus/` + `features/database/` | `3a83cf99` | 1 | 104/104 | database: 100/98.18/100/100 (v8); menus: 71.87/81.48/55.26/78 (v8) | `set19-menus-database/` |
| `features/dashboard/` + `features/roles/` | `3a83cf99` | 1 | 93/93 | dashboard: 96.96/95.12/100/96.55 (v8); roles: 84.61/83.33/76.92/83.33 (v8) | `set20-dashboard-roles/` |
| `features/workspace/` + `features/playground/` + `features/members/` | `3a83cf99` | 1 | 36/36 | workspace: 95.45/100/83.33/94.11 (v8, but see Findings — `workspace/hooks` alone is 5.12%); playground: 83.33/100/80/83.33 (v8); members: 58.82/50/75/73.07 (v8) | `set21-workspace-playground-members/` |
| `features/authentication/`+`auth/`+`analytics/`+`commerce/` | `3a83cf99` | 1 | 41/41 | authentication: 100/100/100 (lcov, 11 lines total); auth: 91.67/100/77.78 (lcov); analytics: 100/100/93.75 (lcov); commerce: 100/n-a/100 (lcov, **1 line total** — see Findings) | `set22-auth-analytics-commerce/` |

**22 of 22 planned sets measured cleanly.** No set was left unmeasured or abandoned after 3+ retries.
Per the overlap-check table above, only one attempt across the whole run (`components/`'s original,
superseded attempt) turned out to have genuine overlap and was correctly discarded; every other tripped
attempt was, in retrospect, measuring the real number on its first artifact-producing try.

## Findings worth surfacing separately

- **Repo-level finding: `apps/admin/vitest.config.ts` silently drops ALL coverage data whenever a
  single test fails, and this outlives this run.** `coverage.reportOnFailure` is unset (Vitest default:
  `false`). Diagnosed by changing one variable at a time rather than re-running blindly: same test
  paths, same failures, only difference was adding `--coverage.reportOnFailure=true` — coverage output
  went from nonexistent to fully written. This is not specific to chunked runs or to this session: **any
  CI job or local `npx vitest run --coverage` on `apps/admin` that hits one failing test produces zero
  coverage artifacts, with no error** — a reader would see "no report" and reasonably conclude the
  tooling broke, not that a test failed. **Recommend adding `coverage.reportOnFailure: true` to the
  coverage block in `apps/admin/vitest.config.ts`.** Not applying that edit myself — the file has
  uncommitted changes from another agent this session, and it's the owner's call, not a TestRunner
  dispatch decision. Every run in this report used the CLI-only equivalent
  (`--coverage.reportOnFailure=true`) instead, which required no edit to shared config.
- **Deployment panel (new feature surface, `features/deployment/`) is well-tested, not a coverage
  gap.** The peer session's five-tab Deployment panel landed with 7 test files / 53 passing tests and
  93.9% statement coverage on its own directory. Flagging this explicitly per team-lead's request,
  since the a-priori expectation for brand-new surface was low/zero coverage — that expectation did not
  hold here.
- **`features/workspace/hooks/` is a real gap (5.12% across all four metrics)**, hidden inside an
  otherwise-healthy `features/workspace/` number (95.45% stmts) because `Workspace.tsx` itself is well
  tested while its hooks module (`use-workspace.hooks.ts`, a dependencies-hooks file) is not.
- **`features/commerce/` is effectively a stub** — the scoped lcov match is 1 total line across 2
  files. Not a coverage failure so much as "there is no commerce feature to cover yet."
- **One recurring flaky test**: `src/__measurements__/request-volume.measurement.test.tsx > redirects
  > initial load` hit its 5000ms timeout in 4 of 6 attempts on the
  `__tests__`/`__measurements__`/`styles` set, independent of guard status or HEAD movement. Also saw,
  in 2 of those attempts, `AssistantDock` throwing `TypeError`s while loading execution config
  (`lib/execution-settings.ts:319`) and BYOK credential state (`components/AssistantDock/AssistantDock.hooks.tsx:203`).
  Team-lead independently ran the identical test paths on a clean tree and got **11 files / 100 tests
  passing** — both implicated source files were unmodified by any of our three agents at that point,
  which supports intermittent-under-load over a real logic bug. Working theory is resource contention
  (three agents plus 22 sequential vitest boots on one machine, against a hard 5000ms test timeout), but
  this was **not** run through the formal rerun-in-isolation flaky-test protocol
  (`AI-Dev-Shop/agents/testrunner/skills.md` Guardrails) to confirm — stating that explicitly so this
  note isn't later read as a cleared verdict. Noting it as an observation for whoever owns
  `request-volume.measurement.test.tsx`, not blocking on it.
- **No coverage-suppression directives, exclusions, or scope narrowing were added anywhere in this
  run** — the two fixes above were both CLI-only flags on my own invocations; `vitest.config.ts` was
  read but never modified.

## Explicitly out of scope (per dispatch)

No changed-code coverage attribution was computed — that is Code Inspection's job per
`harness-engineering/sensors/changed-code-coverage.md`. No coverage gate pass/fail verdict was issued
against the 98/90/80 suite-level thresholds in `test-design/SKILL.md`, since this was a raw-report
dispatch, not a certified TestRunner suite run tied to a spec hash.
