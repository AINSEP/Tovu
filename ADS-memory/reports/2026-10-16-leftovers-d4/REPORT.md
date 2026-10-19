# leftovers-d4 report (2026-10-16)

NOTE: sites.json md5 changed twice during the run. Entries are still only luvira, plannie, tovu-dev, order-pinch; site-keys count and ~/Documents/Tovu unchanged. The changes were `lastOpened` bumps from dev-server (tsx watch) restarts during in-place RED reverts / mutation of apps/website/src files (mine and other lanes'). Nothing restored, nothing to restore.

## Commits
- Jini 4b3b894b fix(ui/execution): Claude Code model picker lists each model once, by name
- Jini 0ae46113 test(ui/execution): mutation follow-up (tests only)
- Tovu b8dd6cf54 fix(admin): concurrent settings reads share one request per namespace
- Tovu 2c4e6f375 test(admin): mutation follow-up (+ removed dead guard)
- Tovu 561696da5 test(site-dir): initSite takes an atomic filesystem port; directory fsync EPERM covered
- Tovu 4057f7d71 test(visual): refresh stale admin-skills-add mobile baseline

## Items
1. Model dupes: `pickerModelOptions` in Jini packages/ui/src/features/execution/rules.ts, used by useReasoningControl. Collapses resolved aliases onto the concrete id, dedupes by id, prefers the human label. The runtime catalog is unchanged, so the list is still dynamic. RED: hook test fails by assertion (9 rows vs 4). GREEN: ui execution 18 files / 231 tests pass; tsc clean. Hand mutation (the sweep script only runs vitest for apps/admin): 10/10 non-equivalent mutants killed, 1 equivalent. Not done: Jini packages/chat `pickerModelOptions` has the same first-wins raw label for the default row (auditfix-5d's scope).
2. Settings reads: the in-flight share moved to `api.getSettingsEffective` (apps/admin/src/lib/settings-effective-reads.ts), keyed by full URL. It absorbs `loadLanguageShared`. A refresh drops in-flight reads before fan-out. RED: 7/7 fail (8 GETs vs 2). GREEN: 319/322 admin files, 4168 tests pass. The 3 failures are not mine: focus-ring-css (.redirects-import, redirects lane), plus composer-send-stop and use-visitor-credential-form, which fail the same with my change reverted. Admin tsc clean. Mutation: 3/3 killed after the follow-up. Not done: real-browser request count. The Chrome tab got chrome-error at 16:09, probably while the dev server was restarting.
3. Baseline: the dispatch premise was wrong. The test does use it (admin-visual.pins.journey.ts:560, mobile project). The image was stale: identical to the pre-88b3eaf64 tab-add baseline. I replaced it with its byte-identical twin admin-skills-tab-add-mobile (desktop and tablet twins were already identical). Visual suite not rerun.
4. initSite: optional `filesystem` port, passed to both atomic JSON writes. The test covers directory-fsync EPERM (completes) and EIO (rejects + cleanup). RED 2/2 fail, GREEN 2/2 pass, duplicate-site passes. Hand mutation of the two passthroughs: 2/2 killed. Pre-existing: path-containment.integration.test.ts fails 3/3 because it never imports isolated-catalog-home (refused by the fec2a6a9f home guard).

## Codex rounds
r1: 3 prompts (m1, m2, m4), all ok. r2: m1 mutation gaps (tests). r3: m2 survivors (one test + delete a dead guard). Prompts/outputs: scratchpad/leftovers-d4/r{1,2,3}-*.
