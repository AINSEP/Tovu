# land-sweep-46 handoff (2026-10-15)

Stopped after s01 per the coordinator task list (handoffs/2026-10-15-tovu-46-tasks.md line 28: day-runner/run-shards.sh now runs landing-cmds for j1, j2, s02-s09; an Opus judge commits).

## Done
1. s01-home-isolation committed: Tovu `fec2a6a9f` (10 files). Marker handoffs/S01-LANDED = fec2a6a9f.
   - RED->GREEN: child-process-coverage-env-wiring with HEAD init-admin-password test 23/24 -> 24/24; new test-home-isolation.unit.test.ts with HEAD child-process-coverage-env 4/5 -> 5/5. Route tests GREEN (2/2, 5/5), init-admin-password 3/3; their RED is the sweep run (FAILURES #27-29), not re-run because it writes the owner's home.
   - Real-home check: all 22 cli/__tests__/integration files + both route tests (115 tests, 114 pass): sites.json entries luvira/plannie/tovu-dev/order-pinch unchanged, ~/.tovu/site-keys 859 before/after (newest de0e7b2c... 09:16), ~/Documents/Tovu unchanged. I never ran a RED that writes keys; my snapshots were 859 the whole time (the 861->859 drop in the tasks file was not this lane).
2. Mutation (s01 sources, both files restored + clean after):
   - sites-home.ts (tests: test-home-isolation + shared-sites-home unit): 2 killed (incl. the new NODE_TEST_CONTEXT guard, line 42), 6 SURVIVED, all pre-existing: :32 `directoryOptions.platform ?? process.platform` default (line touched by s01 but the ?? predates it), :73/:78/:79/:82/:84 nested-sites migration guards (blame pre-s01). sites-config.unit.test.ts, which may cover them, now fails on the guard (r2 item a), so it was left out of the run.
   - site-key-sources.ts (tests: site-key-sources.unit + test-home-isolation): 3 killed, 1 SURVIVED :267 `if (source.kind === "env")` (blame 63065532e, pre-existing).
   - child-process-coverage-env.ts: no guard sites (spread only) -> N/A.

## Remaining (numbered)
1. Pre-existing mutation survivors above go to the mutation lane (not s01 regressions). isolated-journey-site.ts / smoke-packaged-chat.ts have no unit tests (mutation N/A).
2. Round-2 Codex items collected (none launched; prompt dir codex/2026-10-15-sweep-fix-r2/prompts/ not created):
   a. s01 guard fallout = tests that resolved the REAL home and are now refused (fix: import isolated-catalog-home or temp HOME, no guard change):
      - apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts :: "--storage-env moves the site..." (initSite -> createSitesWorkspace guard; was already failing in sweep #111 for a PG-state reason)
      - apps/website/src/platform/site-dir/__tests__/unit/sites-config.unit.test.ts :: "init and CLI boot share the new data.nosync and appData layouts" (bootSiteDir -> normalizeSiteVaultAtBoot -> siteKeySources guard at site-key-sources.ts:72). Likely a source of the stray real site-keys.
      - Expect more node:test files to hit this guard outside FAILURES.md; a static Codex audit (tests reaching initSite/bootSiteDir/createSitesWorkspace/siteKeySources without isolated-catalog-home or a temp HOME) is worth a shard.
   b. s03 NEEDS-OTHER-SHARD: development/evals/tool-search-eval-registry.ts fakeEvalRouteDeps needs settingsRepo (InMemorySettingsRepo), settingsUiTabsReady, getEffective -> 25 discovery failures (#235-246, #251-263).
   c. s05 NEEDS-OTHER-SHARD: seal-aad-invariant.ts must distinguish PluginSourcePort.seal() and contribution-capture .seal() (fail closed, no dummy AAD); admin tests stale after the default-password literal removal: create-site-admin-password.unit.test.tsx, create-site-plugin-tokens.unit.test.tsx, use-sites.hooks.unit.test.tsx. pages.journey.ts:99 onclick-absence precondition = coordinator decision.
   d. j1 NOT-FIXED: infra-retirement.integration.test.ts 3 real failures (Tovu outbox imports + root infra dep) need an outbox-successor decision; not a Codex fix.
   e. j2 NEEDS-JINI-BUILD: rebuild @jini-ai/cms before rerunning html-starter.unit.test.ts and Tovu all-fields-demo-fixture.test.ts (stale dist emits type="url").
   f. Coordinator leftovers: ui-ux-design plugin.json 0.4.6 vs package 0.4.7; Jini html-resource.ts boundHtml maxChars unused; redaction marker "[token removed]" contains "token".
3. Reviewed (not tested, not committed): j1 diff looks right-sized (test fixes + root vitest.config.ts excluding two node:test suites + test:scripts scripts); j2 diff looks right-sized (sandbox_proxy.html sync + 3 stale test files). Jini has unrelated dirty chat styles.ts + styles-attachment-tray-rows test (UI lane) - do not stage.

## Warnings
- The machine lock was contended by 4-5 waiters for 50+ min; mutate-46, land-sites-46, ui-46b were queued with me.
- Jini `general-work` head e703e78e, nothing committed there by me.

## Ownership note (from mutjudge-46, after stop)
mutjudge-46 owns the isolated-catalog-home import for 7 more guard-refused route tests: server/__tests__/{admin-media-routes,admin-menus-routes,identity-routes,route-async-guards}.test.ts and server/__tests__/routes/{forms-auth,publish-trust-gate,publish-trust-apply-coverage}.test.ts. Any r2 home-guard prompt must exclude them.
