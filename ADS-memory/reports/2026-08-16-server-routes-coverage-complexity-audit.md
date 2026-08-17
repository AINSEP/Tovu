# Server Routes Coverage & Complexity Audit — 2026-08-16

**Status: COMPLETE.**

Scope: `src/server/routes/**` (234 route `.ts` files, excludes `__tests__` dirs).
Audit only — no fixes applied, no tests added, no lint rules changed.

Trigger: `src/server/routes/admin/system/publish-credentials.ts` shipped with 97.82%
line coverage but 71.93% branch coverage; the bug (unhandled async rejection killing
the process) lived in the missing branch coverage, not the missing lines. Line % alone
is not a safe signal for this codebase — every number below is reported with its
branch-% partner wherever one exists.

## Headline numbers

| Metric | Value | Measured / Estimated |
|---|---|---|
| Route files in scope | 234 (`.ts`, excl. `__tests__`) | Measured (`find` count) |
| Route-relevant test files | 65 (59 mirrored under `src/server/__tests__/routes/` + 6 co-located under `src/server/routes/**/__tests__/`) | Measured |
| Complexity violations at ≤9 (cyclomatic + cognitive) | 70 files / 113 functions | Measured (own eslint run) |
| Complexity violations at ≤15 (repo's current `warn` bar) | 18 files / 30 functions | Measured (own eslint run) |
| Unguarded async Express handlers (`app.<verb>`, async, no try/catch, no `.catch`) | 21 occurrences across 15 files | Measured (own AST scan) |
| Coverage — line / branch / funcs (aggregate, 215/234 files exercised) | **92.20% / 74.05% / 97.54%** | Measured (own `node --test --experimental-test-coverage` run, parsed from lcov) |
| Zero-coverage route modules | 19 total — **17 are type-only (`deps.ts`/`types.ts`, no runtime code) + 2 are real, complex, untested route handlers** (`admin/assistant/test-agent.ts`, `admin/assistant/test-connection.ts`) | Measured |

The 24-point line-vs-branch spread at the aggregate level (92.2% vs 74.0%) is the
same shape as the bug that triggered this audit, just visible in the rollup instead
of one file. Line % is not a usable gate metric here on its own — see §4.

## 1. Complexity — measured directly

Command run (per dispatch brief), against every file under `src/server/routes`:

```
npx eslint --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' src/server/routes
npx eslint --rule '{"complexity":["error",15],"sonarjs/cognitive-complexity":["error",15]}' src/server/routes
```

- **≤9 (the `apps/admin` hard-gate bar):** 70 of 234 files (29.9%) contain at least
  one function over the line; 113 individual function-level violations total.
- **≤15 (the repo's current default `warn` bar):** 18 of 234 files (7.7%) still
  violate even the looser bar; 30 individual violations. These 18 files are the
  floor of any complexity debt list — they fail today's own configured rule, just
  at `warn` severity so CI does not currently block on them.

Top offenders by violation count at ≤9:

| File | Violations (≤9) | Violations (≤15) |
|---|---|---|
| `src/server/routes/admin/themes/explore.ts` | 6 | 2 |
| `src/server/routes/admin/system/publish-site.ts` | 4 | 3 |
| `src/server/routes/admin/widgets/agent-tools.ts` | 3 | 0 |
| `src/server/routes/admin/assistant/put-execution-credential.ts` | 2 | 2 |
| `src/server/routes/admin/connectors/put-config.ts` | 2 | 2 |
| `src/server/routes/admin/media/update.ts` | 2 | 2 |
| `src/server/routes/admin/newsletter/update-campaign.ts` | 2 | 2 |
| `src/server/routes/admin/redirects/create.ts` | 2 | 2 |
| `src/server/routes/admin/settings/clear.ts` | 2 | 2 |
| `src/server/routes/admin/settings/register-definitions.ts` | 2 | 2 |
| `src/server/routes/admin/settings/set.ts` | 2 | 2 |
| `src/server/routes/site/pages.ts` | 2 | 2 |

Full per-file, per-function violation lists (rule id + line + eslint message) are
preserved at the scratch paths used to produce these counts (not committed — the
brief asked for a report, not a raw-tool-output dump; the parsing script is at
`.ads-scratch-audit/scan-async-handlers.mjs` inside this checkout if a re-run is
wanted, and will be removed before the audit is closed out).

**`src/` (including `src/server/routes`) has no hard complexity gate today** —
repo-wide `eslint.config.mjs` sets `complexity: ['warn', 15]` and
`sonarjs/cognitive-complexity: ['warn', 15]`, `warn` only, so none of the 30
violations above currently fail CI.

## 2. Unguarded async Express handlers — measured directly (TypeScript AST scan)

Scanned all 209 route files containing an `app.get/post/put/delete/patch(...)`
call (234 route files total; 25 register no HTTP verb directly — routers/helpers/
types, consistent with the brief's expectation that not every file needs a direct
test). Scanner: `ts.createSourceFile` per file, walks every `app.<verb>()` call,
checks each function-typed argument for the `async` modifier, and for async
handlers checks whether the function body contains a `TryStatement` anywhere or a
`.catch(` call anywhere in its text. This is a structural check (presence of
try/catch), not a proof the catch is well-formed — a `try {} catch { /* silent */ }`
still counts as "guarded" here even though it may swallow errors badly; that is a
different finding class than "kills the process," which is what this scan targets.

- 242 total `app.<verb>()` registrations found across 209 files.
- 5 are synchronous (non-`async`) handlers — out of scope for this bug class.
- 212 async handlers have a `try` or `.catch` somewhere in their body.
- **21 async handlers across 15 files have neither** — same bug shape as the one
  that shipped in `publish-credentials.ts`.

| File | Line | Verb |
|---|---|---|
| `admin/analytics/recent-hits.ts` | 72 | GET |
| `admin/comments/moderate.ts` | 46 | POST |
| `admin/comments/moderate.ts` | 96 | POST |
| `admin/comments/moderation-queue.ts` | 28 | GET |
| `admin/commerce/status.ts` | 29 | GET |
| `admin/deployments/list.ts` | 43 | GET |
| `admin/system/deployment-overview.ts` | 145 | GET |
| `admin/system/dockerfile-source.ts` | 78 | GET |
| `admin/system/dockerfile-source.ts` | 105 | PUT |
| `admin/system/export-site.ts` | 83 | POST |
| `admin/system/export-site.ts` | 126 | GET |
| `admin/system/module-status.ts` | 20 | GET |
| `admin/system/publish-credentials.ts` | 163 | GET |
| `admin/system/publish-credentials.ts` | 231 | DELETE |
| `admin/system/publish-site.ts` | 171 | POST |
| `admin/system/publish-site.ts` | 235 | GET |
| `admin/system/publish-site.ts` | 260 | GET |
| `admin/system/source-control-credentials.ts` | 109 | GET |
| `admin/system/source-control-credentials.ts` | 148 | DELETE |
| `site/comments-submit.ts` | 28 | POST |
| `site/payments-webhook.ts` | 73 | POST |

**Point-in-time note (per dispatch brief):** `decrypt-crash-fix` is actively
sweeping this same bug class concurrently in this tree. This list was produced
against the working tree as it stood during this scan; some of these may already
be fixed by the time this report is read — re-run the scan to confirm current
state before treating any single row as still-open. Two of `publish-credentials.ts`'s
five verbs (`GET` list, `DELETE`) are still unguarded here even though `POST`/`PUT`
in the same file already carry `try { ... } catch (err) { sendStoreError(res, err); }`
per an in-file comment — consistent with a partial, in-progress fix rather than an
untouched file.

**Update, mid-audit:** `decrypt-crash-fix` committed `650b92f6` while this report
was being written (`git log` shows it landed after §1/§2's data was captured but
before this report's final commit). It adds `src/server/boot/process-error-guards.ts`
(`installUnhandledRejectionGuard()`, wired into `index.ts`'s `main()`) — a
process-wide `unhandledRejection` listener that logs and continues rather than
crashing — and fixes `POST .../:id/verify` in `publish-credentials.ts`
specifically. **Verified against current HEAD:** that commit did NOT touch the
`GET`/`DELETE` handlers this report flags at lines 163/231 — both are confirmed
still-unguarded at HEAD, not stale findings. With the process-level guard now
committed, the missing-`unhandledRejection`-handler premise of the original crash
(no process-level catch anywhere in `src/`) is no longer true repo-wide — the
21 unguarded handlers in the table above would still send wrong-shaped/empty
error responses to the client on failure, but per-route fixes are no longer the
only thing standing between a decrypt error and a full process crash. This audit
did not review or test that guard's correctness on its own merits (that is
`decrypt-crash-fix`'s deliverable, not this one's) — noted here only because it
changes the severity framing of every row in the table above.

## 3. Coverage — measured directly

Command:

```
node --import tsx --test --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<scratch>/server.lcov.info \
  --test-reporter=dot --test-reporter-destination=stdout \
  "src/server/**/*.test.ts"
```

This runs all 121 test files under `src/server/__tests__/` and the 6 co-located
under `src/server/routes/**/__tests__/` (127 files touching `src/server`, a
superset of the 65 route-relevant ones — non-route `src/server` tests are in
scope too since they can and do exercise route modules indirectly). The lcov
output was parsed directly (not the human-readable dot-table) so per-file
line/branch/func hit-and-found counts could be summed precisely; every route
file appeared in at most one lcov record (no double-counting risk from parallel
worker processes — verified: 0 of 215 loaded files had more than one record).

**Does node:test still emit a coverage table on a failing run? Confirmed by direct
observation, not assumption:** running only the known-failing
`src/server/http/site/__tests__/render.test.ts` (3 assertion failures, process
exit code 1) still printed the complete `start of coverage report` /
`end of coverage report` table with real numbers. **Node's coverage reporting is
not gated on test outcome.** This differs from vitest's silent-on-failure
behavior referenced in the brief — confirming that assumption was correct to
flag as unverified, because it does NOT hold for node:test.

**Timing note:** this coverage run was captured before `decrypt-crash-fix`'s
`650b92f6` landed (see §2's update), which added new tests to
`publish-credentials-route.test.ts` (+123 lines) and `store.unit.test.ts` (+49
lines). `publish-credentials.ts`'s branch % below (75.0%, 48/64) predates those
new tests and is very likely stale-low now — re-run to get its current number
before treating it as still-accurate; every other file's number is unaffected
since that commit touched only this one route module and its store.

### Aggregate (215 of 234 route files were loaded/exercised during this run)

| | Hit / Found | % |
|---|---|---|
| Lines | 16,888 / 18,316 | **92.20%** |
| Branches | 3,598 / 4,859 | **74.05%** |
| Functions | 2,183 / 2,238 | **97.54%** |

### Zero-coverage files (19 total) — separated by what they actually are

A file with **no lcov record at all** means it was never loaded/imported by any
`src/server` test — the strongest possible "zero coverage" signal, stronger than
"0% of lines executed," since it means node's coverage instrumentation never even
saw the module.

- **17 are `deps.ts` (one is `execution-deps.ts`) files that export ONLY
  TypeScript types** (`Pick<RouteDeps, ...>` slices + a registrar function
  *type*, no runtime declarations) — verified by reading three of them
  (`admin/assistant/deps.ts`, `admin/connectors/deps.ts`,
  `admin/database-recovery/deps.ts`) and confirming every export is
  `export type`. Type-only exports compile to nothing at runtime, so they
  cannot appear in a coverage report regardless of test coverage — this is the
  "helpers/barrel files that need no direct tests" category from the brief, not
  a gap.
- **1 is `src/server/routes/types.ts`** (698 lines) — same category, the
  `RouteDeps` interface itself.
- **2 are real, logic-bearing route handlers with genuinely zero test coverage:**
  `admin/assistant/test-agent.ts` and `admin/assistant/test-connection.ts`
  (115–116 lines each, both registered via `src/server/modules/
  assistant-execution.ts`, both flagged by the complexity scan in §1, both DO
  have `try`/`catch` so they're not in the §2 unguarded list). No test file
  matching either name exists anywhere in `src/` (verified with `find -iname`).
  `test-agent.ts` shells out to `@jini-ai/agent-runtime`'s `detectAgents()` to
  probe a locally installed CLI's live auth status; `test-connection.ts` is its
  API-key counterpart. These are the two real gaps in the "zero coverage" list —
  everything else in it is a non-finding.

### Worst branch coverage among files that DO have tests (top 15 of 40 measured)

| File | Line % | Branch % | Funcs % |
|---|---|---|---|
| `admin/newsletter/update-campaign.ts` | 91.3 | **42.9** | 100.0 |
| `admin/redirects/create.ts` | 74.5 | **47.6** | 100.0 |
| `site/comments-submit.ts` | 92.9 | **50.0** | 100.0 |
| `admin/widgets/agent-tools.ts` | 81.4 | **51.1** | 90.0 |
| `admin/content-types/update-fields.ts` | 85.7 | **52.2** | 100.0 |
| `admin/settings/events.ts` | 97.2 | **53.6** | 81.3 |
| `admin/settings/register-definitions.ts` | 84.4 | **53.6** | 100.0 |
| `admin/users/create.ts` | 94.3 | **54.5** | 100.0 |
| `admin/users/write-policy-permission.ts` | 78.5 | **54.5** | 100.0 |
| `admin/settings/clear.ts` | 81.6 | **55.0** | 100.0 |
| `admin/entries/lifecycle.ts` | 67.5 | **55.6** | 90.0 |
| `admin/seo/put-entry.ts` | 68.8 | **55.6** | 100.0 |
| `admin/posts/update.ts` | 89.6 | **56.0** | 85.7 |
| `admin/presentation/patch-active-theme.ts` | 89.9 | **57.1** | 75.0 |
| `admin/redirects/update.ts` | 67.1 | **57.9** | 100.0 |

Full 40-row list and the raw per-file JSON were produced by
`.ads-scratch-audit/parse-lcov.mjs` (removed from the tree at the end of this
audit — re-run against a fresh lcov file to regenerate; the command is above).

## 4. Ranked risk table

Risk heuristic per the brief: `(1 − branch%) × sensitivity-keyword-hits`, plus
additive weight for complexity violations and unguarded-async-handler count.
Sensitivity is a path/keyword heuristic (credential, secret, auth, payment,
webhook, publish, deploy, database, restore, source-control, connector,
workspace, users/, members/, policy) — **inferred from path, not from reading
every file's logic**, flagged as such. The two `deps.ts`-style zero-coverage
files that only matched a keyword and carried no complexity/unguarded findings
were excluded manually — they are type-only, not risk.

| File | Branch % | Complexity ≤9 | Complexity ≤15 | Unguarded | Why it's here |
|---|---|---|---|---|---|
| `admin/system/publish-site.ts` | 76.4 | 4 | 3 | **3** | Live publish trigger/status — highest combined score: complex, under-branch-tested, and has unguarded async handlers |
| `admin/system/export-site.ts` | 75.0 | 1 | 0 | **2** | Full-site export — writes/reads bulk data, 2 unguarded handlers |
| `admin/system/publish-credentials.ts` | 75.0 | 0 | 0 | **2** | The file that triggered this audit; GET list + DELETE still unguarded (see §2) |
| `admin/system/source-control-credentials.ts` | 78.0 | 0 | 0 | **2** | Credential CRUD, same shape as publish-credentials.ts |
| `admin/comments/moderate.ts` | 65.4 | 0 | 0 | **2** | Low branch coverage + 2 unguarded handlers |
| `admin/system/dockerfile-source.ts` | 85.7 | 0 | 0 | **2** | 2 unguarded handlers (GET/PUT) |
| `admin/system/deployment-overview.ts` | 71.9 | 2 | 0 | 1 | Complexity + coverage gap on a deployment-state read |
| `admin/themes/explore.ts` | 66.9 | **6** | **2** | 0 | Worst complexity file in the whole scope (§1) |
| `site/comments-submit.ts` | 50.0 | 1 | 0 | 1 | Lowest branch % among unguarded-handler files, public-facing endpoint |
| `site/payments-webhook.ts` | 76.7 | 0 | 0 | 1 | Unguarded, handles inbound payment webhook payloads (inferred from path) |
| `admin/assistant/test-agent.ts` | **never loaded** | 2 | 1 | 0 | Zero test coverage, real logic, shells to an external CLI (§3) |
| `admin/assistant/test-connection.ts` | **never loaded** | 2 | 1 | 0 | Zero test coverage, real logic, API-key probe path (§3) |
| `admin/users/write-policy-permission.ts` | 54.5 | 2 | 1 | 0 | Low branch % on a permissions-write path (inferred sensitivity from path) |
| `admin/database/restore-points.ts` | 61.5 | 2 | 0 | 0 | Low branch % on a DB-recovery read path |
| `admin/newsletter/update-campaign.ts` | **42.9** | 2 | 2 | 0 | Worst branch % of any file with tests |

The top 6 rows are the ones I'd fix first if this were a fix pass: they combine
low branch coverage with either high complexity or an unguarded async handler,
on routes that touch credentials, publish/export actions, or moderation writes.

## 5. Where could a coverage gate realistically be set today?

**Not at 98% on any axis.** Measured aggregate is line 92.20% / branch 74.05% /
funcs 97.54%. A 98% gate fails immediately on all three, and catastrophically on
branch — a 24-point gap. Per the `apps/admin` precedent already in this repo
(hard gate + grandfathered debt list + drift-check script,
`development/scripts/admin-complexity-debt.json` /
`check:admin-complexity-drift`), a gate that fails on day one gets disabled
within a day, so the number matters more than the aspiration.

Two concrete, realistic options — I'd go with the second:

1. **Single repo-wide floor, set a few points under today's baseline for margin**
   (e.g. line ≥88%, branch ≥68%, funcs ≥93%), ratcheted upward on a schedule.
   Simple to wire, but per the coverage-integrity concern in this codebase's own
   review skill, an aggregate floor absorbs new bad files — `update-campaign.ts`
   sits at 42.9% branch today while the aggregate reads 74.05%; a floor gate at
   68% would not have caught it and would not catch the next one either.

2. **Floor gate at the same conservative numbers as (1), PLUS a changed-code /
   diff branch-coverage gate on new or modified route files** (e.g. new/changed
   lines in a route file must hit ≥80% branch coverage before merge). This is
   the mechanism that actually would have caught the triggering bug — a single
   file shipping at 71.93% branch would fail an 80% diff gate regardless of what
   the aggregate does. The debt list from §4 becomes the grandfathered set the
   floor gate tolerates today; the diff gate stops the list from growing.

Either way, a straight jump to 98% is not realistic without first: (a) adding
tests for the 2 real zero-coverage handlers in §3, and (b) pushing the ~15-20
files in the branch-% tail (§3's worst-40, §4's risk table) up from the 42–65%
range into the 90s. That is weeks of targeted test-writing, not a config change.

## What was measured vs. inferred — summary

**Measured directly (commands run, output parsed by me this session):** route/test
file counts (§ all), complexity violation counts at both thresholds (§1), the
async-handler AST scan (§2), the full coverage run and its lcov-derived
line/branch/func numbers including the zero-coverage list (§3), and node:test's
behavior on a failing run (§3).

**Inferred, not measured:** the "sensitivity" keyword tags in §4 (path-based
heuristic, not a read of every flagged file's actual secret/auth handling —
`payments-webhook.ts` and `write-policy-permission.ts` specifically were tagged
by path only, not verified by reading their bodies). The claim that
`process-error-guards.ts` would neutralize the crash risk (§2) is inferred from
reading its doc comments, not from running it against a real decrypt failure —
noted there as unverified and not this audit's to endorse.

**Could not measure:** whether any of the 21 unguarded handlers or the branch-%
tail are exercised by Playwright/e2e tests instead of node:test — e2e runs in a
separate process and node's coverage instrumentation cannot see it. A "zero
node:test coverage" finding here is not a claim of "never executed by any test
in this repo," only "never executed by a `src/server` unit/integration test."
`publish-e2e` and `static-site-verify` are running concurrently in this session
and may cover some of these paths at the e2e layer — this audit did not check
Playwright spec contents for that overlap.
