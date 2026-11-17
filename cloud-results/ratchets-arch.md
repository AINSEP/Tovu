# ratchets-arch 2026-11-17 — cycle cut + API surface

Branch `integ/ratchets-arch-2026-11-17` (Tovu), cut from `origin/integ/ratchets-green-2026-11-17` (`ac284a04`). Jini was not changed (built and linked only, at `refactor/terra` `65d73b0d5`; the checkout's `main` is 0.7.2 and does not typecheck against terra, so I checked out `refactor/terra` of Jini and rebuilt). Nothing pushed anywhere but this branch; no force-push, no subagents, no `--update` / `--write-baseline`, no baseline raised.

**Verdict: PARTIAL.** Both assigned metrics are fixed: the `site-backup <-> source-control` pair is gone and module API surface is **821, equal to the baseline** (was 853). `check:architecture` still exits 1 on a third blocker that was already there: **120 NEW cross-feature file edges** (124 before this run), see "Left".

## Commits (all pushed to `integ/ratchets-arch-2026-11-17`)

| SHA | What |
|---|---|
| `5ef062bf` | **Cycle cut.** `source-control` owns `StaticSitePackagerPort` (`features/source-control/static-site-packager-port.ts`, exported from its index); `site-backup/static-site-packager.ts` implements it (the packaging body of `commit-site.ts` moved verbatim, `SiteShareRefusal` collision -> `destination-collision` result, anything else rethrown); `commit-site.ts` and `tool-registrations.ts` call `input.packager` / `deps.staticSitePackager` (incl. `entryFile` for the commit and dry-run entry path); `RouteDeps.staticSitePackager` bound in `composition/app.ts` and `deps.ts`. `source-control` no longer imports `site-backup`. No forwarder. Design followed: `designs/import-cycles/DESIGN.md` §2.5 (S5) on `plan/import-cycle-design-2026-11-16`, the packager travels on `CommitSiteInput` beside the other host-bound functions. |
| `db03e7e8` | `bindStaticSiteContext` (`composition/static-site-context.ts`): the identical site/theme identity closure that both composition roots built is bound once (late-read getter, same as `exportSiteBound`), which also pays for the new `RouteDeps` field under `check:size`; `StaticSiteHostPorts` names the two host ports `RouteDeps` and `SourceControlToolDeps` both carry; the packaging `catch` in `commit-site.ts` now logs the error (`describeErrorForLog`) instead of dropping it (keeps `check:errors` at 0 New / 0 Worse; the user-facing message is unchanged). |
| `73020166` | 23 files leave the API surface: 24 importers deep-imported files whose every imported name the feature's `index.ts` already exports (same symbol, checked with the TypeScript checker); repointed to the index. 850 -> 827. Cross-feature edge baseline: 11 entries renamed by hand `<importer -> file>` to `<importer -> index>` (436 -> 431 edges, nothing added). |
| `a6a4de78` | 6 more files: `sites`, `workspace`, `email-templates`, `site-guide`, `member-login` indexes now export the names their importers already used (one rename: `sites/list-tool` `Deps` is exported as `SitesListToolDeps`, the name the importer already gave it). 827 -> **821**. |

## Module API surface: why 821 could not be reproduced (verified)

The gate's own measuring command, `npx tsx development/scripts/check-architecture.ts` (the script at that commit, `node_modules` symlinked into a detached worktree), "module API surface (files exposed)":

| commit | files exposed | prop. (runtime) | cycle pairs | largest SCC | hubs |
|---|---|---|---|---|---|
| `9240cbe1` (baseline file added here, says 821) | **870** | 3.09 | 6 | 61 | 376 |
| `fad66fb87b` (merge-base of main and terra) | **870** | 3.10 | 6 | 61 | n/a |
| `origin/main` `0df57a3a` | **870** | 3.10 | 6 | 61 | n/a |
| `e559fad1` (baseline last rewritten) | **850** | 3.17 | 6 | 61 | 364 |
| `origin/refactor/terra` `232764af5` | **852** | 3.18 | 6 | 60 | 363 |
| `ratchets-green` `ac284a04` | **853** | 3.18 | 4 | 5 | 363 |
| this branch after `5ef062bf`/`db03e7e8` | 850 | 3.18 | 3 | 4 | 364 |
| after `73020166` | 827 | 3.19 | 3 | 4 | 364 |
| after `a6a4de78` (HEAD) | **821** | 3.19 | 3 | 4 | 364 |

So the claim holds: no commit I measured (main, terra, and the three in between) measures 821; `check-architecture.baseline.json` is first added to the tree by `9240cbe1` as a new file (`git log --all -S'"moduleApiSurfaceFiles": 821'` finds only that commit) with a number its own script does not produce there. Nobody "merged +32": terra is 18 *below* main (870), and the +32 over the stale number is the difference between the baseline's era and the tree. I did not touch the baseline value. It happens to equal today's HEAD by construction of this work; the owner may now lower it to 821 (a lowering) with the gate's `--update`, but I did not run it (it also rewrites every other metric).

How the 32 were reduced (the "accidental" exposures; nothing was exposed only for tests, tests are excluded from this metric):
- The measurement finds distinct files reached by a cross-module import that is not the target's `index.ts`. Of the 850, 86 sit in modules that have an `index.ts` that already re-exports them. 56 of those could be repointed with every imported name provably the same symbol. Applying all 56 gave 794, but **raised propagation cost (runtime) 3.18 -> 3.61 and hubs 364 -> 421**, which is the trade the gate itself warns about, and it **broke 7 cases of `worker-import-graph.test.ts` (public routes keep public reads off feature barrels)**: files under `server/inbound/public-http/**` must not import feature barrels (the theme render worker loads the whole import graph in a 64 MB heap). Those importers were excluded on purpose and stay on deep imports.
- Each remaining module was measured on its own in a throwaway worktree; only modules whose repoint cost nothing in propagation or hubs were kept (`vendor-credentials`, `forms`, `mail`, `members`, `webhooks`, `media`, `theme`, `trash`, `redirects`, `settings`, `deployments`, `custom-credentials`, `content-types`, `navigation`, `presentation`, `source-control`: 23 files). `assistant`, `post`, `site-export`, `form-destinations`, `site-inspection` cost hubs or propagation and were left alone.
- Then indexes were extended for modules where adding the export is free (`sites`, `workspace`, `email-templates`, `site-guide`, `member-login`); `seo` and `trash` would have given 6 more files for +0.02 propagation and were not taken.

## Gates (exact command -> result, on HEAD `a6a4de78`)

| command | result |
|---|---|
| `npm run check:architecture` | **exit 1**. module cycles 3 (the 3 in the baseline; the NEW pair is gone), largest SCC 4 (baseline 22), API surface **821** (baseline 821), back-edges 0. Still blocking: 120 NEW cross-feature edges. Warn tier: propagation (runtime) 3.19 vs 3.06, hubs 364 vs 335 (both already there before this run: 3.18 / 363). Full output: `cloud-results/ratchets-arch-after.txt` |
| `npm run typecheck` | green |
| `npm run typecheck:tests` | green |
| `npm run check:size` | "ok: 203 violations ... 193 debt entries" (the new `RouteDeps` field was first +1 over three baselines; fixed by the shared `bindStaticSiteContext`, not by editing a debt entry) |
| `npm run check:complexity` | "ok: 43 entries" |
| `npm run check:errors` | "Error gate passed: 817 findings in 483 file/rule entries" (the first cut had a bare `catch {` = 1 Worse; fixed in code) |
| `npm run check:boundaries` | 15 errors / 92 warnings (terra: 16 / 99) |
| `npm run check:hooks`, `npm run check:error-rule-copies` | ok |
| desktop `npm run gates` | not run: no desktop file touched; the push needed no `--no-verify` |

## Tests (changed-file scope; `node --test`, concurrency 2)

- New: `site-backup/__tests__/static-site-packager.unit.test.ts` (4: entry file, exact ordered file list, collision result, rethrow), `source-control/__tests__/commit-site.packager-port.unit.test.ts` (3, fakes of the port: file list/identity, collision message, generic message), `composition/__tests__/static-site-context.unit.test.ts` (3).
- Existing `commit-site.unit.test.ts` (and the 4 other source-control/assistant fixtures) now build `CommitSiteInput` / `SourceControlToolDeps` with the **real** packager, so every file-list assertion still runs through real packaging; the two credential-only fixtures get a fake port that fails the test if called. Source-control dir + packager + golden + static-export-none: 244 tests, 244 pass.
- After the repoints: member-login, mail-status, forms, media-generation, media-import, widgets, deployments/static-publish, `backup*`, worker-import-graph: 1126 tests, 1123 pass, 3 fail, all three also fail on `origin/refactor/terra` or need Postgres (`registry reload failure ...` verified red on a clean terra worktree; `adding the local importer introduces no misses` was already listed in the ratchets-green report; one `[postgres]` test, no DB here). sites, email-templates, workspace, site-guide, member-login, worker-import-graph, route-table pin: 356 / 356 pass; 6 composition files: 32 / 32.
- Not run: the full website suite, Playwright e2e, a desktop smoke.

## Left / next step

1. **`check:architecture` blocker: 120 NEW cross-feature edges** (list: `cloud-results/ratchets-arch-new-edges.txt`; 124 on `ratchets-green`). 98 are new file-level edges between feature pairs that already depended on each other; 22 are new feature pairs (`site-backup -> site-export` x4, `api-connections -> project-keys` x2, `deployments -> settings` x2, `entries -> media` x2, and 12 single ones around `settings`, `project-keys`, `api-connections`, `webmcp`, `widgets`). They come from terra's moves and splits, not from renames of baseline edges (only 4 could be matched to a vanished file), so I did not hand-edit them into the baseline: that would borrow credit the gate refuses to give. They need a decision per pair (port, or accept and re-baseline on purpose).
2. Warn tier: propagation (runtime) 3.19 vs 3.06 and hubs 364 vs 335.
3. The baseline can now be lowered to API surface 821 / cycles 3 / SCC 4 by the owner.

## Overlaps with other runs

`server/routes/types.ts`, `composition/app.ts`, `composition/deps.ts`, `features/source-control/*`, the 5 feature indexes touched by `a6a4de78` (`sites`, `workspace`, `email-templates`, `site-guide`, `member-login`) and 24 importer files across `server/` and `features/` repointed by `73020166` (list in the diff), and `development/scripts/check-architecture.baseline.json` (11 edge renames). A parallel run touching those files will conflict on rebase; the baseline JSON change is a pure renamed-line edit.
