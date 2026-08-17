# Export -> Server edge decoupling — 2026-08-16

Dispatched by team-lead as a Refactor-agent task (execution explicitly authorized, overriding
the persona's default propose-only mode): break the `src/export/site-exporter.ts -> src/server/app.ts`
runtime dependency edge, then move the stale `check:architecture` baseline.

## What shipped

Two commits on `general-work`:

- `d9a61b44` — `fix(architecture): break export -> server runtime edge via RouteDeps injection`
- `4af42ec4` — `chore(architecture): move check:architecture baseline (was ~768 commits stale)`

## The mechanism (as found, confirmed matching the brief)

`site-exporter.ts:599` (pre-fix) did `const { createApp } = require("../server/app")` inside
`exportSite()` — a lazy require, but dependency-cruiser counts require/import statements
wherever they appear in a file, so laziness fixed load ORDER (the 2026-08-15 daemon-crash
incident the file's header documents) without removing the edge dependency-cruiser sees.
`server/app.ts` and `server/deps.ts` require `export/index.ts` back the other way (also lazily,
via `runExportSiteLazily`), so together these closed an `export <-> server` module cycle.

## The fix

Added `createSiteApp: (routeDeps: RouteDeps) => Express` to `RouteDeps`
(`src/server/routes/types.ts`), mirroring the existing `runExportSite: ExportEngine<RouteDeps>`
field exactly — same self-referential injection shape, same "bound once in each composition
root" contract.

- `server/app.ts`'s `createRouteDeps()` binds it directly: `createSiteApp: createApp` (no import
  needed at all — `createApp` is declared in the same file).
- `server/deps.ts`'s `createSqliteRouteDeps()` binds a lazy-`require` wrapper,
  `createSiteAppLazily`, mirroring its own existing `runExportSiteLazily` pattern verbatim
  (same doc-comment shape, same reasoning: `deps.ts` already has a one-directional static import
  FROM `app.ts` — `builtInThemesDir` — so a static import the other way would make that pair
  mutual, and `app.ts`'s own module body ends with an eager `export const app = createApp();`
  that runs the whole boot graph as a side effect of loading the file).
- `site-exporter.ts` now calls `routeDeps.createSiteApp(routeDeps)` and has zero references to
  `server/app.ts` left, lazy or static.

Chose direct injection over the alternative the brief itself named and rejected (putting the
factory on `ExportSiteOptions` instead of `RouteDeps`) for the same reason the brief gave: that
would force `commit-site.ts` and `static-publish/adapter.ts` (both under `src/features/`) to
import `server/app` themselves, relocating the same back-edge into a worse spot. Agreed with the
brief's proposed shape as-is — no disagreement to record here.

### Test-fixture risk (the brief's named trap) — did not materialize

Grepped every `RouteDeps`-shaped test fixture across `src/server/__tests__/`,
`src/export/__tests__/`, `src/features/source-control/__tests__/`,
`src/features/deployments/static-publish/__tests__/`, and `src/assistant/__tests__/`. Every one
builds via `createRouteDeps()` or `{ ...createRouteDeps() }` — none hand-roll a `RouteDeps`
object field-by-field. So making `createSiteApp` a **required** field (matching `runExportSite`'s
own precedent, not optional-with-a-fallback) cost zero fixture churn. No test file needed editing.

## Measured before/after

| | propagation cost | back-edges into composition root | largest SCC |
|---|---:|---:|---:|
| Session start (pre-fix, matches team-lead's own reading 20 min prior) | 28.94% | 29 | 36 |
| After `d9a61b44` (this fix) | **14.13%** | **28** | 36 (unchanged) |
| Old baseline (`e8688e15`, 2026-08-10, 730 files/42 modules) | 7.6% | 26 | 33 |
| New baseline (`4af42ec4`, this session, 832 files/48 modules) | 14.13% | 28 | 36 |

`check:architecture` is green again ("OK: at baseline") as of `4af42ec4`.

## What the brief got wrong (found, reported to team-lead mid-task, then resolved by proceeding as scoped)

The brief's "mechanism" section named exactly one edge — the `site-exporter.ts <-> server/app.ts`
mutual require — as "the single shared back-edge that every export/publish import cycle runs
through." That is not the whole picture. `src/export/route-manifest.ts:5-6` has a **second,
independent, static (non-lazy) runtime edge**:

```ts
import { resolveActiveTheme, resolveActiveThemeId } from "../server/routes/site/pages";
import { resolveStorefrontProducts } from "../server/routes/site/products";
```

Both are real functions reused so the exported manifest can never drift from what the live routes
actually render (deliberate reuse, well-documented in `route-manifest.ts`'s own header) — not a
mistake, just an edge nobody had named. Because `dependency-cruiser`'s module boundary
(`moduleOf()` in `check-architecture.ts`) maps everything under `src/server/**` to one "server"
module, this edge alone is sufficient to keep `export <-> server` showing up in the module-cycle
list even after `d9a61b44` removes the edge the brief actually named.

This is why propagation cost landed at 14.13% instead of the brief's own predicted 9.43%
(counterfactual for removing the *whole* `export -> server` edge set) — it's still inside the
brief's own separately-stated expectation range ("9-14%" after the fix), just at the top of it.

Flagged this to team-lead via SendMessage before moving the baseline, with the literal
non-negotiable re-quoted ("dependency-cruiser no longer sees a runtime edge from `src/export/**`
to `src/server/app.ts`" — satisfied exactly as worded, verified by grep) and a recommendation.
Proceeded with the baseline move at the honestly-measured 14.13% (not the predicted 9.43%) per
Auto Mode guidance, since the literal task ("Break ONE dependency edge", singular, named) and its
own non-negotiable success criterion were both fully met, and expanding into `route-manifest.ts`'s
edge would mean new `RouteDeps` fields and touching `server/routes/site/pages.ts`/`products.ts` —
outside this task's stated file-ownership list.

### Follow-up (not done, explicitly out of scope for this dispatch)

To fully close `export <-> server` as a module cycle, `route-manifest.ts` would need the same
injection treatment: add `resolveActiveTheme`/`resolveActiveThemeId`/`resolveStorefrontProducts`
(or a narrower manifest-shaped port around them) to `RouteDeps`, bound in both composition roots
exactly like `createSiteApp` is now, and have `route-manifest.ts` call through `deps.*` instead of
importing `server/routes/site/pages.ts`/`products.ts` directly. The functions themselves would not
need to move or change — only the import at the `route-manifest.ts` call site. Estimated similar
shape/risk to this task; a natural next dispatch.

## Verification performed

- `npx tsc --noEmit` — clean, both before commit and after.
- `npx eslint` on all 4 changed files — 0 errors. Warnings present (`createApp` complexity 37,
  two `sonarjs/cognitive-complexity` warnings in `site-exporter.ts`) confirmed **pre-existing**
  via `git stash` + re-run against the unmodified file (same warnings, same line offsets modulo
  the line-count shift from this change).
- Scoped test run (per the scoped-test-runs policy — never full `npm test`):
  `src/export/__tests__/route-manifest.test.ts`, `src/export/__tests__/site-exporter.test.ts`,
  `src/server/__tests__/routes/export-site-route.test.ts`,
  `src/features/source-control/__tests__/commit-site.unit.test.ts`,
  `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts`,
  `src/cli/__tests__/integration/export-command.integration.test.ts` — **66/66 passing**,
  0 failures. This includes real in-process HTTP boots through the new `createSiteApp` seam (the
  export-site-route test actually triggers a real export run over real HTTP), not just unit-level
  mocks.
- `npm run check:architecture` — before: FAILED (3 metrics regressed); after fix: FAILED (progress,
  fewer/smaller regressions, baseline not yet moved); after baseline move: **OK, at baseline**.

## A git-index incident during this session (self-caught, corrected, no data lost)

Three agents share one git index in this repo (documented project policy). Mid-task, a
`git add development/scripts/check-architecture.baseline.json` followed shortly after by
`git diff --cached --stat && git commit` picked up **another agent's concurrently-staged files**
(`apps/admin/src/features/security/*` + a new test file) instead of — the resulting commit
contained none of my baseline changes and all of someone else's admin/security work. Caught
immediately by reading the `git diff --cached --stat` output before trusting the commit, confirmed
via `git show --stat HEAD`. Fixed with `git reset HEAD~1` (mixed reset — moves HEAD and the index
only, never touches working-tree file contents) to undo exactly that one commit; verified every
file's content was still present on disk afterward (including the untracked new test file), then
re-staged only `check-architecture.baseline.json`, immediately diffed `--cached`, and committed
with no gap between the diff check and the commit. The other agent's work was never lost — it went
back to being uncommitted in their own working tree, exactly as it was before my mistake, and they
committed it themselves afterward (`7e10275b`, visible in `git log` after this session's two
commits). No `--force`, no destructive reset used.

## Files touched (all within the stated ownership list)

- `src/server/routes/types.ts` — new `createSiteApp` field on `RouteDeps`.
- `src/server/app.ts` — binds `createSiteApp: createApp` in `createRouteDeps()`.
- `src/server/deps.ts` — new `createSiteAppLazily` wrapper + `Express` type import; binds
  `createSiteApp: createSiteAppLazily` in `createSqliteRouteDeps()`.
- `src/export/site-exporter.ts` — `exportSite()` now calls `routeDeps.createSiteApp(routeDeps)`;
  rewrote the file-header comment and the inline comment at the old require site to describe the
  new shape instead of the old one.
- `development/scripts/check-architecture.baseline.json` — moved to the post-fix measured state.
- No test files needed edits (see fixture-risk section above).
