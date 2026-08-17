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

---

# Edge 2 — `export/route-manifest.ts`'s edges into `server/routes/site/{pages,products}.ts`

Follow-up work, same session, explicitly authorized by team-lead after the live-publish e2e (see
below) confirmed edge 1 on the real export path. Two more commits:

- `72c4f95e` — code fix (landed with a **wrong commit message** — see the git-index incident below;
  content verified correct and complete via `git show --stat`)
- `54e8cb35` — `chore(architecture): move check:architecture baseline (edge 2)`

## Live-publish e2e result (reported by team-lead, recorded here since I now own the export path's
## story)

Before starting edge 2, team-lead ran `development/playwright.live-publish-e2e.config.ts` against
the **uncommitted working tree** carrying edge 1's `routeDeps.createSiteApp(routeDeps)` change: a
real spawned `claude` CLI, through the real admin chat, booted the real app via my injected
factory, crawled it, and pushed a real commit to `leonaburime-ucla/tovu-demo`'s `gh-pages` branch —
independently confirmed by the branch HEAD moving (`819c09c5` -> `c0e52de2`) and the published site
serving the owner's fresh one-line theme edit. This is strictly stronger evidence than the unit/
integration suites: the DI seam works on the real, unmocked publish pipeline. One pre-existing,
not-mine finding surfaced in that run's logs, recorded here per team-lead's instruction so it isn't
rediscovered as new: `[widgets] resolveHtmlPageEmbeds: unknown embed type` fired ~17 times across
the export, meaning `partial` and `menu` embeds ship as placeholders on the published site — a known
open gap in the widgets/menus public-render path, unrelated to this decoupling work.

## What I found before touching anything

Verified with the real `dependency-cruiser` JSON (`--ts-pre-compilation-deps`, which resolves
TYPE-ONLY imports as graph edges too — not just runtime ones) rather than reasoning from the
summary numbers. There were exactly FOUR edges from `src/export/**` production files into
`src/server/**`, not two:

```
route-manifest.ts -> server/routes/site/pages.ts      (runtime)
route-manifest.ts -> server/routes/site/products.ts   (runtime)
route-manifest.ts -> server/routes/types.ts            (type-only: RouteManifestDeps = RouteDeps)
site-exporter.ts  -> server/routes/types.ts            (type-only: ExportSiteOptions.routeDeps: RouteDeps)
```

The two type-only ones are marked `circular: true` by dependency-cruiser and are **structurally
required** — `ExportSiteOptions`/`RouteManifestDeps` type directly against the real `RouteDeps`
(deliberately, so a real caller never needs a cast; `route-manifest.ts`'s own pre-existing comment
already says narrowing "would just move the type error to every call site"). `features/deployments/
export-run.ts` avoids this exact problem for *itself* by taking a generic `TRouteDeps` and declaring
`ExportEngine<TRouteDeps>`/`ExportRunReportLike` locally rather than naming `RouteDeps` at all — but
making `site-exporter.ts`/`route-manifest.ts` follow that pattern too would be a materially bigger,
different-shaped change (genericizing the whole export module's public types), not "move two
functions." Flagged this to team-lead before starting; explicitly did not attempt it. Consequence:
`export <-> server` was never going to fully leave the module-cycle list from this dispatch alone,
regardless of what edge 2 did to the two REAL runtime edges — and it hasn't (see numbers below).

## The two runtime edges got two DIFFERENT fixes, chosen by measuring, not assuming

**`resolveActiveThemeId`/`resolveActiveTheme`** (from `pages.ts`) — checked their signatures first:
`(deps: RouteDeps) => Promise<string>` and `(deps: TemplateRenderDeps, id: string) => DiscoveredTheme
| null`. Zero `req`/`res`, zero middleware coupling, pure `(deps) => value`. Moved to a new file,
`src/features/theme/active-theme.ts`, re-exported through `features/theme/index.ts`. Typed against
narrow LOCAL interfaces (`ActiveThemeIdResolutionDeps`/`ActiveThemeResolutionDeps`) rather than
`RouteDeps` or a `Pick` of it — importing `RouteDeps` here, even type-only, would have just relocated
the edge this move exists to remove. `RouteDeps` (and `pages.ts`'s own pre-existing `TemplateRenderDeps`
`Pick`) are structural supersets of both, so every real call site keeps passing its full `deps`
through unchanged, no cast needed anywhere.

Bonus, done and disclosed rather than left silent: `products.ts` had its own **private duplicate**
of `resolveActiveTheme`, kept separate by original design specifically "to avoid a new cross-file
coupling for one three-line function" (its own prior comment). That objection is moot once a real
shared home exists, so I collapsed it — `products.ts` now imports the same function
`pages.ts`/`route-manifest.ts` use. Zero behavior change (identical logic); this was a judgment call
within scope, not requested explicitly, flagged here per my own earlier message saying I'd disclose
it either way.

**`resolveStorefrontProducts`** (from `products.ts`) — did NOT move it, and this was a measured
decision, not the "obvious" symmetric choice. Its return type, `SiteProduct`, is defined in
`server/http/site/render.ts`, and `features/commerce/storefront.ts`'s own file header states this
boundary explicitly and in so many words: *"`features/commerce` does not import `SiteProduct` or
anything from `server/http/site`... `server/routes/site/products.ts` is what bridges the two."*
Moving `resolveStorefrontProducts` into `features/commerce` would violate that existing, documented
architectural decision, not honor Sol's "move it to the feature that owns it" recommendation — the
feature that "owns" this bridge, by prior design, is the routing layer. This is exactly the
"genuinely coupled to route-layer concerns, measure it rather than assume" fallback team-lead's
brief explicitly authorized. Used injection instead: `RouteDeps.resolveStorefrontProducts:
(routeDeps: RouteDeps) => Promise<SiteProduct[]>` (`server/routes/types.ts`), mirroring
`createSiteApp`'s own precedent from edge 1 on the same type. Bound directly in `server/app.ts`'s
`createRouteDeps()` (already imports `products.ts` to register routes); a new plain **static**
import in `server/deps.ts` (unlike `createSiteAppLazily`'s lazy `require` — `products.ts` has no
eager top-level side effect the way `app.ts`'s own `export const app = createApp()` does, verified
by reading the whole file, not assumed).

`route-manifest.ts` now calls `deps.resolveStorefrontProducts(deps)` instead of importing the
function directly, and imports `resolveActiveTheme`/`resolveActiveThemeId` from
`#src/features/theme/index` instead of `../server/routes/site/pages`.

## Measured before/after (edge 2)

| | propagation cost | back-edges into composition root | largest SCC |
|---|---:|---:|---:|
| Before edge 2 (= edge 1's post-fix baseline) | 14.13% | 28 | 36 |
| After edge 2 | **10.31–10.32%** | **26–27** | **37** |

(Small variance in the "after" row reflects concurrent commits from other agents landing on the
tree between measurements, not remeasurement noise from this work — see the git-index section.)

**The SCC growing by one, explained rather than hand-waved.** `active-theme.ts`'s
`resolveActiveThemeId` calls `getPresentationSettings`, a real new `features/theme ->
features/presentation` edge. `features/presentation` was ALREADY a member of the pre-existing
36-module fused SCC (verified directly: ran this repo's own Tarjan SCC computation against both the
pre- and post-edge-2 `dependency-cruiser` graphs and diffed membership — `features/theme` is the
only module that newly joined). This is not new coupling BETWEEN `export` and `server` (that pair
was already fused via the two structurally-required type-only edges from edge 1's own analysis, and
stays fused either way) — it's `features/theme` getting pulled into an already-dominant cluster that
already held 36 of 48 modules, the same "documented nonlinearity" the edge-1 baseline-move commit
already named for a different jump. A real, disclosed tradeoff, not a hidden one: -3.8pts
propagation cost and -2 back-edges, +1 SCC member.

## Verification performed (edge 2)

- `npx tsc --noEmit` — clean.
- `npx eslint` on all 9 changed files — 0 errors. New pre-existing-confirmed warnings on
  `route-manifest.ts` (complexity 17/30) and `pages.ts` (complexity 22/28) — confirmed pre-existing
  by running eslint against an **isolated `git worktree` checkout of unmodified HEAD** (not
  `git stash`, deliberately — see below), same warnings, same values.
- Scoped tests: 92 run, 90 passed, 2 failed. Both failures independently reproduced against
  **unmodified HEAD in an isolated git worktree**, under the same concurrent-agent system load
  (`uptime` showed load averages of 232/259/196 at the time — another agent was running the full,
  uncapped test suite in the background simultaneously): `export-command.integration.test.ts`'s
  CLI-spawn tests hit their own 30s `spawnSync` timeout (`status: null`) on the control run too;
  `media-site-serving.test.ts`'s one ADR-027 placeholder assertion failed identically on the control
  run. Neither is caused by this change. `products.route.test.ts` (the dedicated product-route
  suite) is fully green. `post-template-site-serving.test.ts`'s 3 failures (found during scoping, not
  in my final targeted list) were also independently confirmed pre-existing the same way, before I
  ever ran my real scoped list.
- `npm run check:architecture` — before edge 2: FAILED (baseline still edge-1's). After: measured,
  baseline moved (`54e8cb35`), passed. As of the LAST check in this session it has drifted red again
  by a small amount (propagation cost 10.32 -> 10.56, API surface 203 -> 204) purely from other
  agents' unrelated commits landing after my baseline move — did not chase this with a third
  `--update`; the baseline reflects my own change honestly at the moment I measured it, and
  continuously re-chasing concurrent agents' drift is not this task's job or a good use of the
  ratchet.

## Why I used `git worktree`, not `git stash`, for every "is this pre-existing" check this round

Learned mid-session: `git stash` operates on the WHOLE shared working tree, not just the files I'm
comparing — it briefly reverts every OTHER agent's uncommitted, unstaged work too, for as long as
the stash is active, which is a real (if usually short) window for a concurrent `git status`/test
run to observe a stale tree. Used `git worktree add --detach <scratch-dir> HEAD` instead for every
"was this already broken" check this round (symlinking the existing `node_modules` in rather than
reinstalling) — fully isolated from the shared working tree and index, zero risk to concurrent
agents, `git worktree remove --force` to clean up after each check.

## A SECOND git-index incident this round (worse than the first — not caught until after the fact,
## but no data was lost)

Sequence, reconstructed from `git log`/`git show` after the fact: I ran `git add <my 9 edge-2
files>`, then `git diff --cached --stat` (verified: exactly my 9 files, clean), then in the SAME
bash call, `git commit -F <message>`. Between the verified `diff --cached` and the `commit`, a
DIFFERENT concurrent agent's `git commit` fired first, consuming the shared index — which at that
instant held MY 9 staged files (their own intended files, for a `publish-credentials` account-label
fix, had not been staged yet) — and committed them under **their** commit message
(`72c4f95e "fix(publish-credentials): heal existing rows' account_label..."`). My `git commit -F`
then found nothing staged and exited 1; `HEAD` had already moved to `72c4f95e`.

Verified before doing anything else: (1) my actual file *content* was correct and complete inside
`72c4f95e` (`git show --stat` — exactly my 9 files, matching my intended diff, nothing missing or
corrupted); (2) the other agent's real intended work was NOT lost — `account-label-heal-scheduler.ts`
and its test, plus their `verify.ts`/`publish-credentials.ts` edits, were sitting freshly re-staged
on disk (`git status` showed them `A`/`M`) immediately after, meaning their own `git add` had simply
run a beat after their `git commit` rather than before it, and they would catch the mismatch
themselves on their own routine `git show --stat HEAD` check.

Did NOT attempt to rewrite `72c4f95e`'s history: two more commits (`4cfed73f`, `e63865e3`, from other
agents) had already landed on top of it by the time I noticed, and rebasing a commit three other
agents have already built on is exactly the destructive, shared-history-risking operation this
repo's git discipline rules out except on explicit request. My baseline-move commit for edge 2
(`54e8cb35`) is a clean, correctly-scoped commit of its own, verified `--cached` immediately before
committing with zero gap. Reported this to team-lead by message so whichever agent owns
`72c4f95e`'s real intended commit message/content can decide whether/how to fix the attribution —
not mine to fix unilaterally.

## Files touched (edge 2, all within the extended ownership list team-lead granted)

- `src/features/theme/active-theme.ts` — new file: `resolveActiveThemeId`/`resolveActiveTheme`,
  moved from `pages.ts`, typed against narrow local interfaces.
- `src/features/theme/index.ts` — re-exports the two moved functions + their Deps interfaces.
- `src/server/routes/site/pages.ts` — removed the two function bodies; imports + re-exports them
  from `#src/features/theme/index` instead (preserves `template-preview.ts`'s existing import path
  unchanged — that file is NOT mine); updated two doc comments for accuracy
  (`TemplateRenderDeps`'s "why `themes` is here" note).
- `src/server/routes/site/products.ts` — removed its private duplicate `resolveActiveTheme`; now
  imports the shared one.
- `src/server/routes/types.ts` — new `resolveStorefrontProducts` field on `RouteDeps`, with a doc
  comment naming the `features/commerce`/`SiteProduct` boundary as the reason it's injected rather
  than moved.
- `src/server/app.ts` — binds `resolveStorefrontProducts` directly in `createRouteDeps()`.
- `src/server/deps.ts` — new static import of `resolveStorefrontProducts`; binds it in
  `createSqliteRouteDeps()`.
- `src/export/route-manifest.ts` — imports moved-theme functions from the new home; calls
  `deps.resolveStorefrontProducts(deps)` instead of importing it; rewrote both file-header doc
  blocks explaining the reuse mechanism to match the new (two-different-shapes) reality.
- `src/export/ports.ts` — updated the "architectural role" doc paragraph, which named the old
  `server/routes/site` import path as the reuse mechanism.
- `development/scripts/check-architecture.baseline.json` — moved to the edge-2 measured state.
- No test files needed edits — same "every RouteDeps fixture builds via `createRouteDeps()`"
  finding from edge 1 held here too; `resolveStorefrontProducts` being newly required cost nothing.

## Still open (named, not done)

- The two structurally-required type-only `RouteDeps` edges (`site-exporter.ts`, `route-manifest.ts`
  both -> `server/routes/types.ts`) keep `export <-> server` on the module-cycle list permanently
  unless the export module's public types are genericized the way `features/deployments/
  export-run.ts` already is for its own narrower surface — a materially bigger, differently-shaped
  change than this dispatch, not attempted.
- Largest SCC (37) is NOT an export/server problem per team-lead's own steer — the real cuts, per
  the independent review, live in `src/integrations/repo.sqlite.ts:3` and
  `src/features/database/adapter.sqlite.ts:4`. Not touched, not mine today.
- The widgets/menu embed placeholder gap surfaced in the live-publish e2e logs (see above) — known,
  pre-existing, unrelated, not touched.
- `72c4f95e`'s commit message misattribution (see git-index incident above) — reported to
  team-lead, not resolved by me.

---

# Two independently-caught corrections: core size (edge 1) and largest SCC (edge 2)

Team-lead independently re-measured this session's commits in an isolated worktree and caught two
things I had not reported: edge 1's core-size regression (7.93% → 16.59%, invisible in `4af42ec4`'s
commit body because the pre-fix run showed it in the IMPROVED column against the stale old
baseline), and edge 2's largest-SCC regression (36 → 37) while I was still mid-edit. Both are now
diagnosed with real measurements and, for the SCC one, fixed outright — not just explained.

## Core size: mechanism, measured

Ran the same check in two isolated `git worktree`s (`d9a61b44^` and `d9a61b44` exactly, `node_modules`
symlinked in, zero shared-tree risk), confirmed the official script reproduces team-lead's numbers
exactly (28.94%→14.13% propagation, 7.93%→16.59% core), then went past the script's own aggregate
output to raw `dependency-cruiser` JSON and replicated its `reachableCount`/median logic directly in
Python to see PER-FILE fan-in/fan-out, not just the final percentage.

Finding: the pre-fix tree had `site-exporter.ts → server/app.ts` (the bug this whole task exists to
fix) fusing an enormous ~692-file mutually-reachable cluster — the graph-wide MEDIAN file fan-in was
285, meaning over a third of the codebase could already reach over a third of the codebase through
that one edge. Fixing it shrank fan-OUT for that cluster's hub files (`assistant/index.ts`,
`export/index.ts`, `export/route-manifest.ts`, `export/site-exporter.ts`, several
`tool-registrations.ts`/`publish-agent-tools.ts` files) roughly in half — 691 → 316 — which IS the
real, substantial propagation-cost win. But those same hub files' fan-IN barely moved (284 → 284/285).
`core size` is membership relative to the graph-wide MEDIAN, not an absolute threshold — and fixing
the bug also crashed that median from 285 down to 10. A wide band of files whose own numbers did not
get worse now clear the new, much lower bar on both axes simultaneously. That is the doubling: not
72 files becoming more coupled, but the yardstick used to call something "coupled" collapsing
alongside the real fix.

**Isolating what was actually attributable to this session's chosen shape** (not the underlying fix,
which is non-negotiable): edge 1 also added a NEW edge of its own — `server/deps.ts`'s
`createSiteAppLazily` lazily `require`s `server/app.ts`, which `server/app.ts` did not previously
depend on in that direction (only the reverse, `app.ts → deps.ts`, existed before, for
`builtInThemesDir`). Patched a throwaway copy of the post-fix worktree to strip JUST that one
`require` (replacing it with a same-shaped stub that never references `./app`) and re-ran the
script: core size only recovered from 138 to 132 files (6 of 72, ~8%). The other 66 files (~92%) are
unaffected by removing that edge — they are the structural, unavoidable price of fixing
`site-exporter.ts → server/app.ts` at all, regardless of injection vs. move-down shape.

This is independently corroborated by edge 2 itself: a pure "move logic down" shape (`72c4f95e`,
touching neither `app.ts` nor `deps.ts`) moved core size by less than half a point (16.59% →
16.51%, per team-lead's own concurrent measurement) — consistent with the one-time median-collapse
cost having already been paid by edge 1, with nothing left for a different shape to avoid.

**Answer to "is it avoidable": mostly no, a small slice yes, not worth taking.** The dominant 92%
is inherent to closing this specific cycle — no shape change removes it, because it comes from the
median shift, not from any edge a particular shape introduces. The remaining 8% (6 files) IS
avoidable — extracting `createApp` out of `server/app.ts` into a third file neither `app.ts` nor
`deps.ts` needs to reach circularly would let `deps.ts` bind `createSiteApp` without any `app.ts`
reference at all. Did not do this: it is a materially bigger restructure (also has to reckon with
`createApp`'s default-parameter dependency on `createRouteDeps`, itself defined in `app.ts`), for a
0.7-percentage-point recovery. Flagging as a possible, explicitly-not-taken follow-up rather than
either silently skipping it or doing it unasked.

## Largest SCC: mechanism, measured, and FIXED (commit `45ff16bd`)

Same isolated-worktree method, this time diffing Tarjan SCC membership (not just size) before/after
`72c4f95e`: `features/theme` was the only module that newly joined the pre-existing 36-module fused
cluster. Root cause, once traced to the file level: `active-theme.ts` bundled BOTH
`resolveActiveThemeId` (reads `PresentationSettingsRepoPort`, needs zero theme data) and
`resolveActiveTheme` (needs `DiscoveredTheme`/`findTheme`) into one file, purely because
`pages.ts`/`route-manifest.ts` always call them together. That gave `features/theme` a real NEW
outgoing edge into `features/presentation` — and `features/presentation` was already fused into the
36-module SCC (confirmed independently, not assumed), so `features/theme` got pulled in through it.

Fix: split the two functions into their actual structural homes instead of their call-site pairing.
`resolveActiveThemeId` moved to `src/features/presentation/active-theme-id.ts` (it never touched
theme data — it belongs with the settings it reads, not with the theme it happens to be used
alongside). `resolveActiveTheme` stays in `src/features/theme/active-theme.ts`. `pages.ts` and
`route-manifest.ts` now import each from its own home; `products.ts` untouched (only ever used
`resolveActiveTheme`). Measured, not assumed: largest SCC dropped from 37 back to exactly 36 — the
same value edge 1 alone produced — with edge 2's propagation-cost and back-edges gains fully
retained. Small, disclosed cost: module API surface +1 (the new file is a second cross-module-
imported file in `features/presentation`, alongside `repo.sqlite.ts`'s existing precedent).

## Full before/after table (all four measured states)

| metric | pre-fix | after edge 1 (`d9a61b44`) | after edge 2 (`72c4f95e`) | after SCC fix (`45ff16bd`) |
|---|---:|---:|---:|---:|
| propagation cost | 28.94% | 14.13% | ~10.32% | 10.58% |
| back-edges into composition root | 29 | 28 | ~27 | 27 |
| largest SCC | 36 | 36 | **37** | **36** |
| core size | 7.93% (66/832) | **16.59% (138/832)** | ~16.51% | 16.79% (141/840) |

Baseline moved a third time (`c59d5b01`), with the full trade — both the core-size mechanism and the
SCC round-trip — stated in the commit body itself, not left for a reader to infer from a diff.

## Process note: the `git commit <paths> -F <file>` protocol change

Adopted team-lead's mid-session correction for every commit from the SCC-fix commit onward: scope
the commit itself to explicit paths (`git commit <paths> -F <msgfile>`) rather than
`git add` → verify `--cached` → `git commit -F`, which leaves a window between the verify and the
commit where a concurrent agent's commit can consume the index first (exactly what happened with
`72c4f95e`). `git add` still needed first for the one brand-new untracked file
(`active-theme-id.ts`) — the explicit-path commit form fails on untracked files — everything else in
that commit was already-tracked, modified files. Both post-protocol-change commits (`45ff16bd`,
`c59d5b01`) verified clean via `git show --stat HEAD` immediately after.
