# `apps/admin/src/lib/api.ts` coverage measurement — 2026-09-05

Status: DONE.

## The number, with its exact scope

**Functions: 207/219 (94.52%) · Branches: 173/184 (94.02%) · Lines: 285/298 (95.63%) · Statements: 304/324 (93.82%)**

This is from ONE `vitest run`, coverage `include` restricted to `src/lib/api.ts` only, over exactly
the 13 test files listed below. Do not compare this to any previously-reported number for this file
(e.g. an inherited "branch 49.46% / FNH 71/216") — those came from a different scope (different
suite set and/or a different denominator, 216 vs this run's 184 branches), and this repo's coverage
denominators shift with scope. This is the first measurement of this file taken under this exact
scope, so there is no valid "before" to diff against.

`api.ts` itself declares roughly 200 client methods on the exported `api` object, plus ~19 internal
helpers (constructor, error classification, `request()`, `describeApiError()` and its inline
branch-table closures, `onUnauthenticated`) — hence `FNF:219`, not 200.

## Command run

```
cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run \
  src/lib/__tests__/api-system-endpoints.unit.test.ts \
  src/lib/__tests__/api-widgets-endpoints.unit.test.ts \
  src/lib/__tests__/api-themes.unit.test.ts \
  src/lib/__tests__/api-media.unit.test.ts \
  src/lib/__tests__/api-users.unit.test.ts \
  src/lib/__tests__/api-assistant.unit.test.ts \
  src/lib/__tests__/api-connectors-policies-forms-seo-redirects-posts.unit.test.ts \
  src/lib/__tests__/api-long-tail-endpoints.unit.test.ts \
  src/lib/__tests__/api-endpoint-option-branches.unit.test.ts \
  src/lib/__tests__/api-request-unreachable.unit.test.ts \
  src/lib/__tests__/api-request-onok-and-null-body.unit.test.ts \
  src/lib/__tests__/api-assistant-daemon-readyz.unit.test.ts \
  src/lib/__tests__/api-describe-error.unit.test.ts \
  --coverage --coverage.include='src/lib/api.ts' --no-file-parallelism
```

Result: 13 test files passed, 326 tests passed, 17.7s wall. Ran from inside `apps/admin` (not
`--root` from repo root) so `process.cwd()`-dependent fixtures don't spuriously fail.

## Suites included, and why

All 13 were opened and confirmed to import the REAL `api` module (`import { api } from "../api"` /
`from "../api"` for `ApiError`/`describeApiError`) with no `vi.mock("../api", ...)` and no
`vi.spyOn(api, ...)` anywhere in the file. They instead stub the network boundary
(`vi.stubGlobal("fetch", ...)` / a `fetchMock`), so every call still runs `api.ts`'s own
URL-assembly, method, headers, and body-building code for real:

- `api-system-endpoints.unit.test.ts`
- `api-widgets-endpoints.unit.test.ts`
- `api-themes.unit.test.ts`
- `api-media.unit.test.ts`
- `api-users.unit.test.ts`
- `api-assistant.unit.test.ts`
- `api-connectors-policies-forms-seo-redirects-posts.unit.test.ts`
- `api-long-tail-endpoints.unit.test.ts`
- `api-endpoint-option-branches.unit.test.ts` (pre-existing)
- `api-request-unreachable.unit.test.ts` (pre-existing)
- `api-request-onok-and-null-body.unit.test.ts` (pre-existing)
- `api-assistant-daemon-readyz.unit.test.ts` (pre-existing, found alongside the above in
  `src/lib/__tests__/`, also clean — no api-module mock)
- `api-describe-error.unit.test.ts` (pre-existing, same directory, tests `describeApiError`
  directly, no mock)

That is every `.test.ts*` file directly under `apps/admin/src/lib/__tests__/` whose name starts
`api-`.

## Suites excluded, and why

A repo-wide `find ... -name "*.test.ts*" | xargs grep -l` for anything importing `../api` /
`@/lib/api` (using `*.ts*` specifically, since `--include="*.test.ts"` misses the `.tsx` suites)
turns up **126 additional files** (139 total match the import pattern, minus these 13) — one per
feature area (`features/pages/__tests__/use-pages...`,
`features/collections/...`, `hooks/__tests__/use-admin-execution-credential...`, etc.). These were
**not** added to this run, for two reasons, both dictated by this dispatch's own constraints:

1. **Machine/scope constraint** — the dispatch explicitly forbids a full `apps/admin` suite run and
   grants exactly one coverage slot. ~115 extra feature/hook suites is most of the app's test tree.
2. **Mock-through contamination requires per-file auditing, and spot checks confirm it is present.**
   Sampled files show a mixed, non-uniform pattern that the blanket filter in this dispatch can't
   safely wave through in bulk:
   - `hooks/__tests__/use-admin-execution-credential.hooks.test.ts` and
     `lib/__tests__/execution-settings.test.ts` do `vi.mock("../../lib/api", ...)` /
     `vi.mock("../api", ...)` outright — zero real `api.ts` coverage from those files, confirming
     the exact failure mode this dispatch warned about.
   - `features/pages/__tests__/use-pages.unit.test.ts` is worse to classify automatically: it runs
     the real `api` module against a stubbed `fetch` for its "wired hook" tests (real coverage) but
     also does `vi.spyOn(api, "getSettingsEffective")` inside the same file (that one method gets
     zero credit from this file specifically), *and* has a second describe block driving a fully
     fake `createFakePagesPort` that never touches `api.ts` at all. A file-level include/exclude
     rule cannot represent "this file contributes real coverage to methods A/B but not C" — it
     would need per-test verification, which the single coverage slot here doesn't afford.

   Given that, mixing in the full feature/hook tree without auditing every file individually would
   produce a number this report could not stand behind. The 13-suite scope above is the set that
   was actually written today specifically to cover `api.ts`'s methods directly, and it was fully
   verified clean.

**If a wider, audited pass is wanted, it needs its own dispatch** — 126 files is enough that
auditing them for mock-through, one at a time, is its own task, not a rider on this one.

## Unhit functions — named (12 of 219)

Every one below was confirmed by reading the actual source at the reported line (never inferred
from line position alone):

| Line | Name | Notes |
|---|---|---|
| 1790 | `onUnauthenticated` | Module-level listener-registration export (not an `api.*` HTTP method). No suite in this scope registers a listener or drives a real 401/`UNAUTHENTICATED` response through `request()` to fire it. |
| 1792 | *(inner)* | The unsubscribe closure `onUnauthenticated` returns — unhit for the same reason. |
| 2013 | `api.listPages` | |
| 2015 | `api.createPage` | |
| 2221 | `api.listMembers` | |
| 2225 | `api.disableMember` | |
| 2238 | `api.listMenus` | |
| 2240 | `api.getMenu` | |
| 2542 | `api.getWorkspace` | |
| 2543 | `api.updateWorkspace` | |
| 2881 | `api.listTaxonomies` | |
| 3162 | `api.listPlugins` | |

So of the ~200 `api.*` client methods, **10 are unhit** in this scope: `listPages`, `createPage`,
`listMembers`, `disableMember`, `listMenus`, `getMenu`, `getWorkspace`, `updateWorkspace`,
`listTaxonomies`, `listPlugins`. The other 2 unhit functions are the non-endpoint
`onUnauthenticated` listener utility and its inner closure.

## Unhit branches — named (11 of 184)

All 11 read from source, not inferred from position:

- **`errorName()` (line 1721)** — the ternary's false arm (returns `undefined`) is never taken.
  Every tested rejection cause had an object with a string `.name`; no test exercises a
  non-object/no-`name` rejection cause through this path.
- **`notifyIfUnauthenticated()` (line 1832, body at 1833 also 0 hits)** — the `status === 401 &&
  body?.code === "UNAUTHENTICATED"` condition is never true in this scope, so the
  listener-notification loop never runs. Consistent with `onUnauthenticated` above being fully
  unhit: nothing in this scope drives a genuine session-invalidity 401 through `request()`. (Two
  401s ARE exercised in this scope per the hit counts — matching this file's own documented
  Composio-relayed-401 case — but neither carries `code: "UNAUTHENTICATED"`.)
- **`getSettingsEffective()` (line 2553)** — the false arm of `if (options.principalId)` is never
  taken; every call in this scope supplies a `principalId`, so the no-`principalId` path is
  untested.
- **`getDatabaseTimeline()` (lines 2960-2968)** — the true arm of `if (options.kind)`,
  `options.outcome`, `options.fromDate`, `options.toDate`, and `options.cursor` are each never
  taken (5 branches): every call in this scope omits all five filters. `options.limit`'s TRUE arm
  is hit but its FALSE arm (line 2965) is not, and the resulting `qs` is always non-empty in this
  scope, so the empty-`qs` ternary arm (line 2968) is also untested.
- The remaining branch (line 2543) is inside `updateWorkspace`, already counted above as a fully
  unhit function — its branch gap is redundant with that.

## Skeleton-then-fill note

The skeleton for this file was committed first (`cb5c11b5`), before the coverage run, per this
dispatch's own instruction to avoid losing work on a long-running measurement.
