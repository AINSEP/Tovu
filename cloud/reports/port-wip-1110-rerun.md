# port/wip-1110 changed-file tests — re-run (tip 1bb2b5441, main fad66fb87)

Report only; nothing fixed. Node v24.22.2, published Jini 0.7.0, one file at a time (--test-concurrency=1 / vitest --maxWorkers=2).
Raw output: `cloud/reports/raw/port-wip-1110-rerun/<path with / as __>.txt`; main runs in `raw/.../main/`; the repeat branch run in `raw/.../second-run-branch/`.

**Result: 2 of 50 files fail on the branch. Both pass on origin/main, so both are regressions on the branch.** Both reproduced on a second run.

## Table

| file | runner | pass/fail | already failing on main? |
|---|---|---|---|
| apps/desktop/src/renderer/App.render.test.ts | node:test (desktop renderer) | 23 pass / 1 fail (exit 1) | no - passes on main (26/0 and 6/0) |
| apps/desktop/src/renderer/App.sites-home.render.test.ts | node:test (desktop renderer) | 5 pass / 0 fail | n/a (passed) |
| apps/desktop/src/renderer/ImportWebsite.render.test.ts | node:test (desktop renderer) | 10 pass / 0 fail | n/a (passed) |
| apps/desktop/src/renderer/app/TabStrip.render.test.ts | node:test (desktop renderer) | 7 pass / 0 fail | n/a (passed) |
| apps/desktop/src/renderer/use-import-drop.hooks.render.test.ts | node:test (desktop renderer) | 5 pass / 0 fail | n/a (passed) |
| apps/desktop/src/renderer/use-section-nav.hooks.render.test.ts | node:test (desktop renderer) | 5 pass / 0 fail | n/a (passed) |
| apps/desktop/src/renderer/use-import-handoff.hooks.render.test.ts | node:test (desktop renderer) | 5 pass / 0 fail | n/a (passed) |
| apps/desktop/src/import-handoff-ipc.test.ts | node:test (desktop) | 7 pass / 0 fail | n/a (passed) |
| apps/desktop/src/preload/preload.test.ts | node:test (desktop) | 3 pass / 0 fail | n/a (passed) |
| apps/desktop/src/preload/preload-staleness.test.ts | node:test (desktop) | 3 pass / 0 fail | n/a (passed) |
| apps/desktop/src/speech/preload-speech.test.ts | node:test (desktop) | 6 pass / 1 fail (exit 1) | no - passes on main (26/0 and 6/0) |
| apps/admin/src/features/sites/__tests__/use-live-import-site.hooks.unit.test.tsx | vitest | 6 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/sites/__tests__/use-desktop-import.hooks.unit.test.tsx | vitest | 6 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx | vitest | 49 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx | vitest | 63 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/sites/__tests__/sites-i18n.unit.test.ts | vitest | 93 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/import-export/__tests__/ImportExport.unit.test.tsx | vitest | 11 pass / 0 fail | n/a (passed) |
| apps/admin/src/features/plugins/__tests__/AgentPluginRow.unit.test.tsx | vitest | 19 pass / 0 fail | n/a (passed) |
| apps/website/src/assistant/__tests__/moved-tools.golden.test.ts | node:test (website) | 1 pass / 0 fail | n/a (passed) |
| apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts | node:test (website) | 11 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/integration/bundled-higgsfield-media-injection.integration.test.ts | node:test (website) | 3 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/integration/bundled-upgrade-digest-supersession.integration.test.ts | node:test (website) | 7 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts | node:test (website) | 6 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-package.unit.test.ts | node:test (website) | 13 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-activation.unit.test.ts | node:test (website) | 3 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-mail-credential-cards.unit.test.ts | node:test (website) | 35 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch.unit.test.ts | node:test (website) | 5 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-site-import-package.unit.test.ts | node:test (website) | 8 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-software-engineering-package.unit.test.ts | node:test (website) | 2 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts | node:test (website) | 5 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts | node:test (website) | 54 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/descriptor-i18n.unit.test.ts | node:test (website) | 14 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/identity.unit.test.ts | node:test (website) | 8 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/import-access-token.unit.test.ts | node:test (website) | 25 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts | node:test (website) | 1 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/retire-bundled.unit.test.ts | node:test (website) | 22 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts | node:test (website) | 8 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/switch-on-saved-token.unit.test.ts | node:test (website) | 10 pass / 0 fail | n/a (passed) |
| apps/website/src/features/agent-plugins/__tests__/unit/tool-registrations.unit.test.ts | node:test (website) | 26 pass / 0 fail | n/a (passed) |
| apps/website/src/features/deployments/__tests__/deploy-config-registry.unit.test.ts | node:test (website) | 11 pass / 0 fail | n/a (passed) |
| apps/website/src/features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts | node:test (website) | 4 pass / 0 fail | n/a (passed) |
| apps/website/src/features/deployments/deploy-ops/__tests__/registry.test.ts | node:test (website) | 28 pass / 0 fail | n/a (passed) |
| apps/website/src/features/deployments/deploy-targets/__tests__/descriptor-fields.unit.test.ts | node:test (website) | 17 pass / 0 fail | n/a (passed) |
| apps/website/src/features/deployments/deploy-targets/__tests__/registry.unit.test.ts | node:test (website) | 17 pass / 0 fail | n/a (passed) |
| apps/website/src/features/object-storage/__tests__/registry.unit.test.ts | node:test (website) | 15 pass / 0 fail | n/a (passed) |
| apps/website/src/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts | node:test (website) | 4 pass / 0 fail | n/a (passed) |
| apps/website/src/server/__tests__/routes/publish-site-route.test.ts | node:test (website) | 34 pass / 0 fail | n/a (passed) |
| apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts | node:test (website) | 6 pass / 0 fail | n/a (passed) |
| apps/website/src/server/runtime/composition/__tests__/bundled-inactive-gating.integration.test.ts | node:test (website) | 8 pass / 0 fail | n/a (passed) |
| apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts | node:test (website) | 25 pass / 0 fail | n/a (passed) |

## Failing tests

### 1. apps/desktop/src/renderer/App.render.test.ts — file-level failure, test 25 never completes
23 of 24 reported subtests pass; the file then reports `✖ src/renderer/App.render.test.ts (37377ms)` / `'test failed'`. On main the same file runs 26 tests, 0 fail (the last passing there is `a share link goes to the archive importer, a live address to Create`).
The test that follows it in the source (line 553) is the new one:
`App: the web admin's "Open Import in Tovu" leaves a site's tab for the Import tab, with the address typed in (owner, 2026-11-10)`.
It never reports. The kernel log shows an OOM kill of the node process (`MainThread`, anon-rss ~13.8 GB) at the same moment, so this test most likely loops or allocates without bound (suspect a render/effect loop in the new import-open path) rather than failing an assertion. Same result on the repeat run. Note that all sessions share one memory limit, so the kill is the environment's limit, but 13.8 GB is far beyond what the passing tests use.
First error lines: only `✖ failing tests: test at src/renderer/App.render.test.ts:1:1 ... 'test failed'` (no assertion text, consistent with a killed process).

### 2. apps/desktop/src/speech/preload-speech.test.ts:148 — `compiled admin import bridge asks main to open the Import tab, forwarding only a string address`
```
AssertionError [ERR_ASSERTION]: Values have same structure but are not reference-equal:
[ ['tovu:import:open', {address:'https://example.com'}], ['tovu:import:open', {}], ['tovu:import:open', {}] ]
    at TestContext.<anonymous> (preload-speech.test.ts:154:10)   operator: 'deepStrictEqual'
```
"Same structure but not reference-equal" is the signature of a cross-realm comparison: the objects built inside the preload's sandbox/vm context have a different `Object.prototype` than the test's, so `deepStrictEqual` rejects them. The values themselves look right (address forwarded only when a string). Likely a test-side fix (compare after JSON round-trip / use `deepEqual`) but I did not change anything. Passes on main (that test does not exist there; 6/0).

## Setup problems
- Node 24 was installed from nodejs.org as instructed; `npm ci` printed "install-scripts" warnings (node-pty, esbuild postinstall not run). Nothing failed because of it that I could see; the tests ran.
- My own runner script initially split the file list wrongly and two runs overlapped, so the first results were discarded; the numbers above come from a single clean run (and the repeat run agrees).
- OOM kills occurred in the sandbox (see failure 1). Other files showed no sign of being affected.
- The task asked for "every other website test importing bundled-source-root": 28 files found, all included (the named ones overlap and are deduped). All 25 website files + 7 admin files + 9 other desktop files pass.
- Desktop non-renderer files were run with `node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test`, as in `apps/desktop` `npm test`.
