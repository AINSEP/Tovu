DONE run V2 | branches 6/6 | tests run 2364 pass 2364 fixed 32 dropped 0 | weak fixed 4 | bugs 11 (all fixed) + 2 suspected open | left: none

# verify-1127 V2 — Jini Codex coverage-test branches

Unattended Opus (high) run. Setup: Node 24, Jini `pnpm install --frozen-lockfile` + `pnpm -r build` on `integ/merge-28-2026-11-26` (green). One git worktree per subagent branch (`pnpm install --offline`, build outputs copied from the built base). gitleaks built from source (`go install`; 8.21.2 for Jini, 8.28.0 for Tovu whose `.gitleaks.toml` the older parser rejects) and run as `gitleaks protect --staged` before every commit. 4 subagents (Opus high, one branch each, local commits only; I pushed). No codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no ts-ignore/`as any`/skips/config edits.

"Coverage after" = a scoped vitest run of only the branch's changed test files (`--coverage.all=true --coverage.include=<FILES>`), so it is a lower bound against the brief's full-suite "before".

## codex/w62-cov-admin-7 — `7bf818ce` (pushed)
18 test files, **185 tests, 185 pass** (first run: 4 red + 4 TS errors in 3 files).
### Reds -> why -> fix
- `routines/__tests__/Routines.test.tsx` "does not treat an inherited JavaScript property name as a service refusal" -> **BUG** `routines/routines-api.ts:61`: `failure.reason in REASON_TO_STATE` is true for `"constructor"`, so a 503 with reason "constructor" resolved as a refusal with `state: Object`. Fixed: `Object.hasOwn(REASON_TO_STATE, failure.reason)`.
- `settings/hooks/__tests__/use-external-mcp-oauth-connect.unit.test.tsx` "does not reopen a provider flow when the operator cancels before the request answers" -> **BUG** `settings/hooks/use-external-mcp-oauth-connect.hooks.ts` `connect`: after Cancel during `starting`, the late start reply still navigated the popup to the provider URL, registered message/focus listeners and set `waiting`. Fixed (+7 lines): an `attempt` ref bumped by `stop()` (cancel, unmount, new connect); a superseded reply closes the popup and returns, a superseded failure sets no error.
- `taxonomy/__tests__/Taxonomy.unit.test.tsx` "distinguishes a held first load…" -> `reject is not a function`: the list fetch starts after render, the test rejected before it. Fix: `vi.fn` fetch, `waitFor` it was called once, then reject (assertions unchanged).
- same file "navigates the detail with keyboard…" -> asserted `aria-current` on the row element captured before selection; selecting switches Taxonomy to its detail layout, which renders a new list. Fix: re-query the row there (same assertion).
- TS: `Routines.test.tsx` fake ConfirmDialog returned `null` (kit type returns an element) -> `<></>`; `SettingsUiTabs.injection.test.tsx` literal-typed slices -> `settingsSlice<NotificationsPreferences>` / `settingsSlice<InterfaceConfig>`; `Taxonomy.unit.test.tsx` `getByRole(…, { exact })` (not a ByRole option) removed — a string `name` already matches exactly.
### Weak tests
Searched every added line for `toBeDefined`/`not.toThrow`/`toBeTruthy`/snapshots/skip/only/`as any`: none. Read the small diffs in full: exact-arg port assertions and state checks.
### Mutation spot-checks (all red, reverted)
1. `routines-api.ts` hasOwn -> `in`: red. 2. oauth `attempt` guard removed: red. 3. `skill-drop.ts` `files.length >= 256` -> `>= 257`: red. 4. `SiteTrashTab.tsx` drop `?? []`: red. 5. `rules.ts` `externalMcpNeedsSignIn` drop `status !== undefined`: red. 6. `rules.ts` `accentSwatchName` drop `toLowerCase()`: red.
### Coverage before -> after (lines / br / fn; `packages/admin/src/`)
- screens/routines/Routines.tsx: 0.0 br 0.0 fn 0.0 -> 100 br 98.64 fn 100
- screens/routines/RoutinesMount.tsx: 0.0 br 100.0 fn 100.0 -> 100 br 100 fn 100
- screens/routines/project-routine-row.ts: 77.78 br 53.33 fn 83.33 -> 100 br 100 fn 100
- screens/routines/routines-api.ts: 36.67 br 100.0 fn 33.33 -> 100 br 97.36 fn 100
- screens/settings/ExternalMcpSharedChoice.hooks.ts: 93.94 br 72.73 fn 100.0 -> 100 br 91.66 fn 100
- screens/settings/ExternalMcpSharedChoice.tsx: 100.0 br 93.33 fn 100.0 -> 100 br 100 fn 100
- screens/settings/ExternalMcpToolPicker.hooks.tsx: 73.77 br 93.75 fn 42.86 -> 100 br 96.87 fn 100
- screens/settings/ExternalMcpToolPicker.tsx: 0.0 br 0.0 fn 0.0 -> 100 br 100 fn 100
- screens/settings/ExternalMcpToolsModal.tsx: 0.0 br 0.0 fn 0.0 -> 100 br 100 fn 100
- screens/settings/SettingsUi.hooks.ts: 81.82 br 100.0 fn 80.0 -> 100 br 100 fn 100
- screens/settings/SettingsUi.tsx: 92.16 br 77.78 fn 88.89 -> 96.07 br 100 fn 87.5
- screens/settings/SettingsUiTabs.tsx: 97.45 br 86.67 fn 76.47 -> 100 br 89.47 fn 94.11
- screens/settings/external-mcp-tool-picker-rules.ts: 97.08 br 96.36 fn 87.5 -> 95.62 br 86.27 fn 93.75
- screens/settings/hooks/use-external-mcp-oauth-connect.hooks.ts: 89.01 br 79.41 fn 75.0 -> 100 br 95.55 fn 100
- screens/settings/hooks/use-settings-active-tab-scroll.hooks.ts: 100.0 br 100.0 fn 66.67 -> 100 br 100 fn 100
- screens/settings/rules.ts: 92.66 br 100.0 fn 80.95 -> 100 br 100 fn 100
- screens/sites/AllSitesTab.tsx: 98.15 br 87.5 fn 100.0 -> 100 br 91.66 fn 100
- screens/sites/SiteCardView.tsx: 100.0 br 68.42 fn 88.89 -> 100 br 95.83 fn 100
- screens/sites/SiteTrashTab.tsx: 100.0 br 93.75 fn 100.0 -> 100 br 100 fn 100
- screens/sites/use-local-sites.hooks.ts: 100.0 br 98.68 fn 100.0 -> 100 br 98.7 fn 100
- screens/skills/SkillInstallConfirmation.tsx: 96.43 br 62.5 fn 100.0 -> 100 br 90.9 fn 100
- screens/skills/SkillRemoveConfirmDialog.tsx: 100.0 br 50.0 fn 100.0 -> 100 br 87.5 fn 100
- screens/skills/SkillRow.tsx: 100.0 br 75.0 fn 100.0 -> 100 br 100 fn 100
- screens/skills/Skills.hooks.ts: 0.0 br 0.0 fn 0.0 -> 100 br 100 fn 100
- screens/skills/Skills.tsx: 0.0 br 0.0 fn 0.0 -> 100 br 100 fn 100
- screens/skills/skill-drop.ts: 3.64 br 100.0 fn 0.0 -> 100 br 94.44 fn 76.92
- screens/skills/skill-failure.ts: 100.0 br 33.33 fn 100.0 -> 100 br 100 fn 100
- screens/skills/skill-upload.ts: 100.0 br 96.3 fn 100.0 -> 100 br 100 fn 100
- screens/skills/skills-page-dictionary.ts: 100.0 br 66.67 fn 100.0 -> 100 br 66.66 fn 100
- screens/skills/use-skill-confirmation.hooks.ts: 76.67 br 100.0 fn 50.0 -> 93.33 br 100 fn 80
- screens/skills/use-skills-tabs.hooks.ts: 0.0 br 0.0 fn 0.0 -> 100 br 100 fn 100
- screens/storage/ScreenshotCleanupSection.tsx: 83.33 br 14.29 fn 33.33 -> 100 br 100 fn 100
- screens/storage/StoragePanel.tsx: 100.0 br 83.33 fn 100.0 -> 100 br 100 fn 100
- screens/storage/api/screenshot-cleanup-api.ts: 0.0 br 100.0 fn 100.0 -> 100 br 100 fn 100
- screens/storage/api/storage-api.ts: 0.0 br 100.0 fn 100.0 -> 100 br 100 fn 100
- screens/storage/hooks/use-screenshot-cleanup.hooks.ts: 100.0 br 66.67 fn 100.0 -> 100 br 100 fn 100
- screens/storage/hooks/use-storage.hooks.ts: 96.43 br 61.64 fn 100.0 -> 100 br 88.5 fn 100
- screens/storage/storage-screen-bindings.tsx: 0.0 br 100.0 fn 100.0 -> 100 br 90.9 fn 100
- screens/taxonomy/Taxonomy.tsx: 0.0 br 100.0 fn 100.0 -> 100 br 97.61 fn 92.85
- screens/taxonomy/TaxonomyTermList.tsx: 0.0 br 100.0 fn 100.0 -> 98.59 br 90 fn 100
- screens/taxonomy/TermDetailPanel.tsx: 0.0 br 100.0 fn 100.0 -> 100 br 84.84 fn 100
- screens/taxonomy/TermPicker.tsx: 100.0 br 81.25 fn 73.68 -> 92.37 br 75 fn 88.88
- screens/taxonomy/api/taxonomy-api.ts: 75.93 br 100.0 fn 72.73 -> 100 br 100 fn 100
- screens/taxonomy/hooks/merge-term-section-dependencies.hooks.ts: 22.22 br 100.0 fn 40.0 -> 100 br 100 fn 100
- screens/taxonomy/hooks/new-taxonomy-form-dependencies.hooks.ts: 22.22 br 100.0 fn 66.67 -> 100 br 100 fn 100
- screens/taxonomy/hooks/new-term-form-dependencies.hooks.ts: 22.22 br 100.0 fn 66.67 -> 100 br 100 fn 100
- screens/taxonomy/hooks/taxonomy-dependencies.hooks.ts: 35.42 br 100.0 fn 28.57 -> 100 br 96.66 fn 100
- screens/taxonomy/hooks/term-picker-dependencies.hooks.ts: 27.91 br 100.0 fn 42.86 -> 100 br 100 fn 100

## codex/w62-cov-devops-2 — `4ae44324` (pushed; subagent)
19 test files (+ helper `publish-credentials/__tests__/store-fixture.ts`), **147 tests, 147 pass** (first run: 1 red + 3 TS errors in 2 files).
- **BUG (fixed)** `devops/src/deploy/site/agent-tools.ts` `deployment_get_export_status` description said asset failures "do not flip ok", but `export-run.ts:108` sets `ok: firstExportFailure({report}) === undefined` and that counts failed assets. Description corrected (text only); `agent-tools.test.ts` "the export status catalog tells callers that failed assets make the copy incomplete" red -> green.
- TS: `publish-agent-tools.unit.test.ts:196` self-referencing `consent.mock.calls.length` -> local `consentChecks` counter (same check); `deploy-ops/__tests__/tool-registrations.test.ts:126/:205` fake `send` gained a typed request param + `bodyTruncated`, `audit` fake typed as `NonNullable<deps['customCredentialsAudit']>` (no casts added).
- Weak: none found. Left as-is (not banned): `as unknown as StaticPublishToolDeps` fixtures in publish-agent-tools/publish-credential-card, `tracker as never` in export-run.
- Mutations (red, reverted): desktop-site-update drop `signal`; store-validation.ts:119 post-loop token check removed; deploy-targets/registry.ts:40 plugin id dropped from refusal; static-publish-run.hooks.ts:81 `pollFailuresRef.current = 0` removed.
- Coverage before -> after: StaticExportCard 56.9/37.5/54.6 -> 100/92.7/100; StaticPublishCredentials 7.3/100/0 -> 100/100/100; StaticPublishForm 2.6/100/0 -> 99.5/96.5/100; StaticSiteTab 54.8/66.7/44.4 -> 100/100/100; deployment-visuals 43.5/100/33.3 -> 100/100/100; publish-credential-draft 100/83.3/100 -> 100/93.1/100; publish-credential-selection 92.6/50/100 -> 100/85.7/100; publish-credential-writes 73.2/51.5/66.7 -> 100/90.7/100; static-publish-actions 90.5/75/100 -> 100/100/100; static-publish-form.hooks 89.1/61.5/75 -> 100/100/100; static-publish-run.hooks 90.5/76.5/80 -> 100/96.3/100; use-dockerfile-source.hooks 89.3/64/90 -> 94.2/87.5/90; use-publish-credentials.hooks 100/80/80 -> 100/95/100; use-static-export.hooks 85.8/70.8/80 -> 100/94.1/80; use-static-publish.hooks 100/100/80 -> 100/100/100; rules 71.8/58.7/51.6 -> 100/94.3/100; desktop-site-update 100/91.7/100 -> 100/100/100; self-hosted-site-update 100/96/100 -> 100/100/100; site/agent-tools 0/100/100 -> 100/100/100; deploy-ops/agent-tools 100/55.6/100 -> 100/100/100; deploy-ops/registry 52.9/75/40 -> 100/97.1/100; run-ops 100/50/100 -> 100/100/100; secret-confirm 95.7/54.6/83.3 -> 100/80/100; host-kit 61.3/63.6/33.3 -> 96/95.1/78.3; deploy-targets/registry 92.4/92.3/53.9 -> 100/94.7/92.3; dockerfile 0/0/0 -> 100/100/100; export-run 100/95.8/100 -> same; publish-agent-tools 30/100/0 -> 91.4/83.3/57.1; compatibility-port 80/100/100 -> 100/100/100; store-owner 0/0/0 -> 100/100/100; store-resolution 0/0/0 -> 100/85.7/100; store-validation 9.9/100/0 -> 100/96.4/100; store 32.5/54.6/33.3 -> 89.4/73.9/90.3; publish-tool-capabilities 81.9/53.3/100 -> 96.2/94.5/100; publish-tool-credential 46.8/48.7/50 -> 88.4/80.4/81; publish-tool-deps 8.3/100/0 -> 100/100/100; publish-tool-execution 10.3/66.7/13.3 -> 98.7/88.4/100.

## codex/w62-cov-agent-plugins-1 — `07142889` (pushed; subagent)
34 files (16 vitest `.ts`, 17 node:test `.mjs`, helper `mcp-fixture.ts`), **472 tests (151 vitest + 321 node:test), 472 pass** (first run: 1 red, scoped tsc 0).
- **BUG (fixed)** `agent-plugins/github/source-control/commit-site.mjs:114`: a GitHub refusal with JSON `null` body threw `TypeError … reading 'message'` in `providerErrorMessage`. Fix: `body.json?.message` (as `write-files.mjs:76`). Test `commit-site.test.mjs` "repository lookup handles null JSON refusal without attempting a commit" red -> green.
- **Possible related bug (not fixed, untested):** `commit-site.mjs:148,163,178,203,234` read `body.json.<field>` after a 2xx parse with no null check; a 2xx `null` body would throw the same TypeError.
- Weak: none found (no assertions weakened; 6 removed lines are rewritten imports).
- Mutations (red, reverted): plugin-state.ts:74 `>=` -> `>`; meilisearch.mjs:438 `>=` -> `>`; `unchangedSiteTree` -> false; render-deploy-workflow exit code discarded; access-token-tool.ts:279 `.trim()` removed.
- Coverage before -> after (`.mjs` via node `--experimental-test-coverage`; files whose neighbouring suites did not run in the scoped run read lower than "before" — not a regression): commit-site.mjs 95.1/70.43/94.74 -> 100/83.98/100; auth.mjs 93.83/73.33/75 -> 100/100/100; product-state.mjs 92.47/100/87.5 -> 100/91.3/100; meilisearch.mjs 73.73/50/43.33 -> 100/94.32/100; render-deploy-workflow.mjs 95.33/96.3/83.33 -> 100/98.21/100; write-files.mjs 100/99.55/100 -> 100/98.62/100; destination-panel.mjs 100/98.92/100 -> 100/98.94/100; s3 object-stores 100/95.7/100 -> 100/96.84/100; forms.mjs 100/94.95/100 -> 94.07/66.43/93.33 (scoped); build-cloudflare.mjs not measured (Codex EXCEPTION); action-tools.ts 100/94.74/100 -> 100/100/100; connections.ts 51.08/60/40.91 -> 91.36/100/90.9; connections/index.ts 0 -> 100; plugin-state.ts 7.59/100/0 -> 100/97.77/100; access-token-tool.ts 6.83/100/0 -> 98.75/89.02/100; apply-connect-defaults.ts 54.29/25/57.14 -> 100/91.8/100; apply-tool-renames.ts 50/37.5/33.33 -> 91.25/87.17/100; catalog.ts 9.68/100/0 -> 100/100/100; connect-card-ui.ts 6.67/100/0 -> 100/78.57/100; connect-destination.ts 0 -> 100; connect-sign-in-wait.ts 0 -> 100; connect-tool.ts 5.67/50/6.25 -> 85.1/69.52/95.65; connection-status.ts 0 -> 100; credential-cards.ts 100/80.95/83.33 -> 100/78.57/100; credential-save-tool.ts 76.23/51.28/61.54 -> 100/94.11/100; enable-access.ts 89.09/23.81/100 -> 94.54/80/100; approval.ts 0 -> 100; host-capabilities.ts 0 -> 100/97.87/100; executable/index.ts 0 -> 100; register.ts 0 -> 91.66/86.11/84.61; federate-mcp.ts 53.72/50/61.54 -> 94.14/85.18/100; grant-signed-in-defaults.ts 78.46/27.78/71.43 -> 92.3/68.57/85.71; host-deps.ts 46.67/100/20 -> 100/100/100; import-access-token.ts 19.51/33.33/16.67 -> 96.34/82.05/100; connect/index.ts 0 -> 100; installed-plugin.ts 100/50/100 -> 100/100/100.
- Still < 100 (follow-up): connect-tool.ts, grant-signed-in-defaults.ts, register.ts 48-52/114-116, apply-tool-renames.ts 132-135/151-153, connections.ts 35-38/125-128, enable-access.ts 41-43. Codex EXCEPTIONs untested: build-cloudflare.mjs, forms-receiver.mjs:317, destination-panel.mjs:112, credential-save-tool.ts:99-101, index barrels.

## codex/w62-cov-agent-plugins-2 — `e0a82365` (pushed; subagent)
53 files (51 vitest, 2 node:test `.mjs`), **623 tests (564 vitest + 59 node:test), 623 pass** (first run: 12 red + 7 TS errors in 5 files).
- **BUG (fixed)** `agent-plugins/src/connect/token-sign-in.ts:53`: a rejected host probe escaped a function documented "never throws", carrying its private error text. Now try/catch -> `"unavailable"`. Test: token-sign-in.unit "maps a thrown probe transport error to an unavailable check without exposing its text".
- **BUG (fixed)** `agent-plugins/src/site/memory-i18n.ts:171`: `dictionary[locale]?.[key]` returned inherited Object members (`memoryText({key:'constructor'})` returned a function). Now `Object.hasOwn` for locale and key. Test: memory-i18n.unit "an unlisted key returns literal copy even when it is also a JavaScript object method name".
- Test fixes: mail-catalog-configuration.integration (5 tests) fixture id `bad-feedback` broke the id rule `^[a-z][a-z0-9_]{0,63}$` -> `bad_feedback`, + required `timeoutMs`; memory-i18n fr "Note"/it "File" are real cognates -> pinned in a `cognates` table, every other locale/key still must differ; AgentPluginDetailsModal.unit missing `afterEach(cleanup)` (two alerts); plugin-embed-source "isolates manifest faults" — a namespace-less manifest really parses as `unknown/legacy`, fixture now uses a name the schema rejects (covers the parse-refusal path). TS: update.unit `onEvent` moved to the optional arg; `workspacesDir` added to layouts (memory.integration, y5m-install-tool, y5m-set-enabled-lazy); `LinkedError` ctor arg.
- **Test-config change (owner review):** customize-tool.unit was red because `customize-tool.ts` self-imports `@jini-ai/agent-plugins/folder-zip/node`, which vitest resolved to `dist/` while `instanceof FolderZipError` used the `src` class. Added a regex alias in `packages/agent-plugins/vitest.config.ts` -> `src/folder-zip-node.ts`, next to the existing `@jini-ai/plugins/host` alias (no coverage/threshold settings touched). Not a production bug: a build shares `dist`.
- Weak fixed: 1 (use-agent-plugins.hooks.unit `toHaveBeenCalled()` -> `toHaveBeenCalledTimes(1)`). Not every one of the 2.8K added lines was read in full (grep scan + 4 mutation checks).
- Mutations (red, reverted): plugin-embed-source `.png` through the text reader (source.ts:70); mail selection attempt cap 3 -> 2 (selection.ts:38-40); memory-tools `gate.isCallable` deny dropped (memory-tools.ts:57); zh-TW uses zh-CN text; both bug fixes reverted.
- Coverage before -> after (selection; full table in the run's coverage-summary): connect/new-site-agent-plugin-tokens 0/100/100 -> 100/100/100; connect/plugin-credential-card 15.8/60/25 -> 100/95/100; connect/plugin-host/index 50.4/90.6/33.3 -> 100/92.5/64; connect/switch-on-saved-token 0 -> 100; connect/token-sign-in 0/0/0 -> 100/100/100; core/plugin-display-name 14.3/100/0 -> 100; core/token-sign-in-list 0 -> 100; lifecycle/host-tools/memory-tools 3.6/100/0 -> 100/97.1/100; skill-tool 21.4/40/23.1 -> 96.7/90/100; write-note-tool 16.7/100/0 -> 100; lifecycle/mail/catalog 50/63.6/50 -> 93.1/88.6/75; mail/configuration 2.4/100/0 -> 100; mail/contribution 6.8/100/0 -> 100/84.6/92.9; mail/selection 1.6/100/0 -> 100/90.9/100; site/exports/runtime 0 -> 100/97.2/100; site/exports/diagnostics 0 -> 100; site/memory-i18n 0/0/0 -> 100/100/100; site/install-tool 66.7/42.5/55.6 -> 92.3/81.2/89.5; site/install-upload 89.8/72.9/83.3 -> 99.6/85.3/90.6; site/automatic-agent-plugins 80.9/75.8/76.5 -> 100/87.4/100; site/provider-plugin-link 53.5/100/90 -> 100; site/uninstall-tool 84.4/81.8/72.7 -> 98.5/93.5/81.8; react/use-agent-plugins.hooks 83.8/68.2/57.1 -> 100/92.5/73.3; react/AgentPluginDetailsModal 100/40/100 -> 100/87.5/100. `vercel/*.mjs` node:test only (not in vitest coverage).

## codex/w62-cov-admin-9 — `20297c64` (pushed; subagent)
73 files, **563 tests, 563 pass**; scoped admin tsc clean.
- **BUG (fixed)** `admin/src/shell/lib/unique-id.ts:23`: fallback suffix concatenated two base-36 words unpadded, so different pairs collided ((1,36) and (37,0) both "110"). Each word now padded to 7 digits (`toFixedBase36`). Test: unique-id "keeps different random word pairs distinct in the same millisecond".
- **BUG (fixed)** `admin/src/shell/components/AssistantDock/hooks/messages-change.hooks.ts` (~83): a retried failed run keeps its message id but its events reset; the published tool-progress mark was never lowered, so the retry's first tool result read as already announced and its content refresh was not published. Mark now lowered on reset. Test: use-messages-change-handler "publishes the first tool result of a retry even when the failed run had exactly one result". 31 neighbouring files (353 tests) still green.
- Test fixes: local-cli-selection.normalization.unit "keeps a new picker choice while its save is pending…" OOM'd a worker (8 GB) — inline injected functions re-created per render re-ran the sync effect forever; now defined once outside the render callback (as the dock's real ones). TS-only: WidgetConfigFields.hooks.unit (`links[0]` possibly undefined, narrow props), dock-conversation-deep-link.integration, use-agent-screen-context.hooks.unit, use-messages-change-handler (explicit initial props types), credential-card-guidance (`cloneNode()` -> `createElement`). No casts.
- Weak fixed: 2 — credential-card-guidance "does not use the ambient page…" gained a positive control (the page's own document does scroll to the card, exact args); paint-admin-accent dark accent also checks the two light-theme variables.
- Mutations (red, reverted): urls drop `encodeURIComponent(name)`; admin-frontend-session drop `requestAssistantDock`; live-tiptap-editor check `isDestroyed` instead of `schema`; both bug fixes reverted.
- Coverage before -> after (lines/br/fn; `packages/admin/src/`; files whose main tests are unchanged read lower in this scoped run):
- shell/components/AssistantDock/agent-failure-scanners.ts: 70.44/87.76/58.82 -> 100/100/100
- shell/components/AssistantDock/agent-failure.ts: 90.6/96.25/86.96 -> 100/98/100
- shell/components/AssistantDock/assistant-dock-props.tsx: 100/56.25/100 -> 100/90/100
- shell/components/AssistantDock/dock-header-rules.ts: 100/91.3/66.67 -> 100/100/100
- shell/components/AssistantDock/dock-pane-props.tsx: 100/75/100 -> 100/88.88/100
- shell/components/AssistantDock/hooks/agents-inventory.hooks.ts: 23.14/66.67/15.38 -> 100/94.2/94.11
- shell/components/AssistantDock/hooks/assistant-mcp-ui.ts: 0/100/100 -> 100/100/100
- shell/components/AssistantDock/hooks/assistant-transport.hooks.ts: 10/100/28.57 -> 98.46/88.88/100
- shell/components/AssistantDock/hooks/byok-runtime.hooks.ts: 43.33/87.5/66.67 -> 100/100/100
- shell/components/AssistantDock/hooks/chat-package-kind.ts: 100/98.86/100 -> 100/98.82/100
- shell/components/AssistantDock/hooks/composer-discovery.hooks.ts: 92.31/75/72.73 -> 100/85.29/100
- shell/components/AssistantDock/hooks/composer-files.hooks.ts: 69.74/96.15/57.14 -> 65.78/95/71.42
- shell/components/AssistantDock/hooks/execution-config-ledger.hooks.ts: 98.02/77.78/85.71 -> 100/85/85.71
- shell/components/AssistantDock/hooks/execution-config.hooks.ts: 96.77/88.89/63.64 -> 100/95/72.72
- shell/components/AssistantDock/hooks/local-cli-selection.hooks.ts: 79.66/50/66.67 -> 100/88.23/100
- shell/components/AssistantDock/hooks/messages-change.hooks.ts: 78.46/65/100 -> 100/97.05/100
- shell/components/AssistantDock/hooks/runtime-access.hooks.ts: 24.39/66.67/40 -> 100/100/100
- shell/components/AssistantDock/hooks/selected-agent-plugins.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/AssistantDock/hooks/use-assistant-empty-state.hooks.ts: 100/81.82/100 -> 100/100/100
- shell/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/AssistantDock/hooks/use-chat-agent-plugins.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/AssistantDock/hooks/use-chat-display-preferences.hooks.ts: 11.11/100/50 -> 100/100/100
- shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts: 100/100/66.67 -> 100/100/100
- shell/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/ChatFab/ChatFab.tsx: 100/92.31/100 -> 100/100/100
- shell/components/CodeView/preview-modal-icons.tsx: 100/100/0 -> 100/100/100
- shell/components/ConfirmActionDialog.tsx: 10/100/0 -> 100/100/100
- shell/components/InstallTabCard/InstallTabCard.tsx: 88.24/69.57/80 -> 100/93.1/100
- shell/components/MediaEditDialog/MediaEditDialog.hooks.tsx: 0/0/0 -> 100/100/100
- shell/components/MediaPickerDialog/JiniMediaPicker.hooks.ts: 100/75/100 -> 100/95.65/100
- shell/components/SecretInput/SecretInput.tsx: 81.25/57.14/100 -> 100/50/100
- shell/components/SitesSidebarNav.tsx: 0/100/100 -> 100/100/100
- shell/components/WidgetConfigFields/HtmlAttributeRows.hooks.ts: 0/0/0 -> 100/100/100
- shell/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx: 87.68/93.02/84.38 -> 100/97.29/100
- shell/components/WidgetConfigFields/media-content-rules.ts: 100/98.08/100 -> 100/98.07/100
- shell/hooks/use-admin-appearance-snapshot.hooks.ts: 0/0/0 -> 100/100/100
- shell/hooks/use-admin-document-locale.hooks.ts: 0/0/0 -> 100/100/100
- shell/hooks/use-agent-screen-context.hooks.ts: 0/0/0 -> 100/100/100
- shell/hooks/use-assistant-chats.hooks.ts: 44.44/100/87.5 -> 100/100/100
- shell/hooks/use-conversation-deep-link.ts: 100/63.64/100 -> 86.2/94.44/50
- shell/hooks/use-desktop-view-release.hooks.ts: 100/85.71/100 -> NOT LOADED by changed tests
- shell/hooks/use-dock-auto-rail.hooks.ts: 100/93.75/100 -> 100/100/100
- shell/hooks/use-external-entry-refresh.hooks.ts: 100/96/100 -> 100/94.11/100
- shell/hooks/use-sidebar-empty-click-toggle.hooks.ts: 94.55/100/85.71 -> 100/100/100
- shell/hooks/use-sites-sidebar-nav.hooks.ts: 0/0/0 -> 95/90.9/80
- shell/lib/addons-routes.ts: 100/91.43/100 -> 100/97.36/100
- shell/lib/admin-failure-reporter.ts: 100/95/90 -> 100/95.12/100
- shell/lib/admin-frontend-session.ts: 50/100/0 -> 100/100/100
- shell/lib/admin-http/config.ts: 0/100/100 -> 100/100/100
- shell/lib/admin-http/request.ts: 100/95/100 -> 100/98.27/100
- shell/lib/admin-http/settings-api.ts: 84.21/85.71/75 -> 100/100/100
- shell/lib/admin-http/urls.ts: 0/0/0 -> 100/100/100
- shell/lib/admin-post-list-sort.ts: 92.31/85.71/100 -> 46.15/42.85/33.33
- shell/lib/agent-screen-context.ts: 40.62/14.29/20 -> 100/100/100
- shell/lib/assistant-daemon-activation.ts: 93.48/78.12/100 -> 100/86.84/100
- shell/lib/assistant-prompt-bus.ts: 0/0/0 -> 100/100/100
- shell/lib/browser-stream.ts: 100/98.89/100 -> 100/98.88/100
- shell/lib/browser-working-directory-access.ts: 100/95.24/100 -> 100/95.83/100
- shell/lib/credential-card-guidance.ts: 0/100/100 -> 100/100/100
- shell/lib/descriptor-i18n.ts: 100/97.67/100 -> NOT LOADED by changed tests
- shell/lib/editor-template-options.rules.ts: 100/33.33/100 -> 100/100/100
- shell/lib/execution-settings-ledger.ts: 95.24/69.81/89.47 -> 89.88/75.47/94.73
- shell/lib/fetch-query/adapter-context.ts: 0/0/0 -> 100/100/100
- shell/lib/live-tiptap-editor.ts: 0/100/100 -> 100/100/100
- shell/lib/media-embed-extension.hooks.ts: 0/0/0 -> 100/100/100
- shell/lib/media-image-extension.hooks.ts: 0/100/100 -> 100/100/100
- shell/lib/paint-admin-accent.ts: 100/75/100 -> 100/100/100
- shell/lib/queued-daemon-start.ts: 100/100/87.5 -> 100/100/100
- shell/lib/server-failure.ts: 0/100/100 -> 100/100/100
- shell/lib/settings-effective-reads.ts: 93.55/86.67/100 -> 100/100/100
- shell/lib/status-labels.ts: 100/90/100 -> 100/90.9/100
- shell/lib/stored-credential-endpoint.ts: 100/95.83/100 -> 100/100/100
- shell/lib/stream-activity.ts: 62.07/100/88.89 -> 100/100/100
- shell/lib/unique-id.ts: 25/50/50 -> 100/100/100
- shell/lib/viewer-time-zone.ts: 100/0/100 -> 100/100/100
- shell/lib/widget-embed-placement-content.ts: 85.71/100/75 -> 100/100/100
- sites/transfer/use-export-password.hooks.ts: 100/95.24/100 -> 100/100/100
- widgets/controllers/regions.controller.ts: 100/86.67/100 -> 100/88.88/100
- widgets/react/components/WidgetInstanceNotices.tsx: 96.97/92.86/100 -> NOT LOADED by changed tests
- widgets/react/hooks/use-widget-instance-editor.hooks.ts: 100/100/92.31 -> 100/66.66/61.53

## codex/w62-cov-db-1 — `a1c5ebcd` (pushed)
27 files, **374 tests, 374 pass** (first run: 11 red of 373; db tsc + react tsc clean). Also ran all of `src/recovery`, `src/react/recovery`, `src/site`: 375/375.
- **BUG (fixed)** `db/src/recovery/journal-repo.sql.ts` `markResolved`: not site-scoped (unlike `updateState`), so a site's repository resolved another site's migration run. Added `.where("site_id", "=", this.deps.siteId)`. Test: journal-repo.sql "a site-scoped migration repository must not resolve another site's run".
- **BUG (fixed; was an OLD red on merge-28)** `db/src/recovery/tool-registrations.ts:215`: the confirm result was cast (`as { confirmationToken: string }`) and executed even with no token. New `readConfirmationToken` refuses with `RESTORE_CONFIRM_MALFORMED…`. Test "a malformed internal confirm result must not proceed to execute" (its bare `rejects.toThrow()` now asserts the exact message).
- **BUG (fixed)** `db/src/react/recovery/Recovery.tsx:324`: `onClick={props.onCreate}` passed the click event into the zero-argument `createRestorePoint` port -> `onClick={() => props.onCreate()}`. Test: Recovery.states.unit "the create action disables during capture…" (`calls toEqual [[]]`).
- Test fixes: `site/__tests__/tool-registrations.database-recovery.test.ts` — the shared fixture's fake `humanConfirmedToolHandler` returned a plain function, which core's `assertToolIsWirable` refuses at registration for a `confirmer-must-equal-own-delegatedBy` tool (this made the file's 3 OLD tests red on merge-28 and all 5 Codex tests red). The fake now builds through core's `humanConfirmedHandler` (only the human's answer is faked); the dialog test likewise. Consequence: the confirmer is the run's own delegating principal (`ctx.principal.id`) as kind `user`, so the OLD assertion `principalId 'human'` became `'agent'` (the principal) with `principalKind 'user'` kept and a new `executedAs principalKind 'agent'` check. Two Codex cases used `[]` as "non-object input" -> `'not-an-object'` (see suspected bug below).
- Weak fixed: 1 (malformed-confirm exact message) + 1 surviving mutant killed: new destination-store test "a blank first save has no saved address to keep, so address validation refuses it and nothing is stored" (mutant `if (connectionString === '') return;` survived before).
- Mutations (red, reverted): stopped.ts SQLITE_BUSY mapping -> always; stopped.ts sidecar cleanup removed (3 red); destination-store `savedAt` fallback removed (4 red); destination-store blank-save guard (red after the new test); journal-repo site scope removed.
- Coverage before -> after (lines/br/fn; `packages/db/src/`; index barrels are re-exports; kernel-core/secrets-vault/owner-store read lower because their main suites were not in the scoped run):
- data-modules/data-module.ts: 52.82/66.67/64.29 -> 100/98.98/100
- data-modules/disk-headroom.ts: 19.23/100.0/0.0 -> 100/100/100
- data-modules/index.ts: 0.0/100.0/100.0 -> 100/100/100
- data-modules/migration-journal.ts: 7.41/100.0/0.0 -> 100/100/100
- data-modules/migration-recovery.ts: 0.0/100.0/100.0 -> 100/100/100
- data-modules/plugin-identity.ts: 78.75/58.33/80.0 -> 100/100/100
- data-modules/restore.ts: 0.0/100.0/100.0 -> 100/100/100
- data-modules/snapshot.ts: 41.18/50.0/33.33 -> 100/100/100
- events/index.ts: 0.0/0.0/0.0 -> 0/0/0
- events/outbox-repo.sql.ts: 100.0/97.06/100.0 -> 100/100/100
- events/repo.rows.ts: 100.0/82.05/100.0 -> 100/100/100
- gated-mutations/index.ts: 0.0/0.0/0.0 -> 0/0/0
- gated-mutations/repo.sql.ts: 100.0/96.15/100.0 -> 100/100/100
- kernel/kernel-core.ts: 100.0/96.97/100.0 -> 86.15/88.15/91.3
- kernel/session-lock.ts: 100.0/81.25/80.0 -> 100/95.23/100
- kernel/sqlite/sqlite-only.ts: 2.33/100.0/0.0 -> 100/100/100
- migrate/legacy-ledger.ts: 100.0/88.57/100.0 -> 100/100/100
- migrate/runner.ts: 97.91/97.1/100.0 -> 97.9/91.66/100
- owner-store/index.ts: 100.0/93.33/100.0 -> 0/100/100
- react/recovery/Recovery.restore-steps.tsx: 90.32/68.97/88.89 -> 100/94.59/88.88
- react/recovery/Recovery.tsx: 48.0/29.41/66.67 -> 96.66/97.36/100
- recovery/journal-repo.sql.ts: 25.0/83.33/30.0 -> 100/100/100
- recovery/tool-registrations.ts: 84.09/78.72/88.24 -> 100/97.29/100
- secrets-vault/repo.sql.ts: 100.0/99.25/100.0 -> 71.42/77.02/71.42
- settings/index.ts: 0.0/0.0/0.0 -> 0/0/0
- settings/repo.rows.ts: 97.96/84.0/100.0 -> 100/92.3/100
- settings/repo.sql.ts: 99.58/92.5/100.0 -> 100/96.42/100
- site/repo.memory.ts: 37.61/55.56/17.39 -> 100/96.66/100
- site/tool-registrations.ts: 50.71/85.71/17.65 -> 100/100/83.33
- sqlite/checked-client.ts: 100.0/98.11/100.0 -> 100/98.14/100
- sqlite/compaction-steps.ts: 91.11/57.89/100.0 -> 100/88/100
- sqlite/compaction.ts: 98.81/94.79/100.0 -> 100/96.93/100
- sqlite/db-ops.ts: 95.89/90.91/100.0 -> 98.63/95.83/100
- sqlite/stopped.ts: 29.73/100.0/33.33 -> 100/100/100
- sqlite/transaction.ts: 100.0/95.45/100.0 -> 100/95.34/100
- transfer/confirmation-ui.ts: 100.0/90.0/100.0 -> 100/100/100
- transfer/copy-order.ts: 100.0/89.66/100.0 -> 100/90/100
- transfer/destination-store.ts: 67.27/53.33/57.14 -> 100/97.29/100
- transfer/schema-catalog.ts: 100.0/97.3/100.0 -> 100/98.71/100
- verified-origin/index.ts: 0.0/0.0/0.0 -> 0/0/0


## Owner decisions
1. **Suspected bug, core (not changed):** `@jini-ai/core` `requireInputRecord` (registration-kit.ts:151) accepts arrays because `isRecord` is `typeof object && !== null`; a tool called with `[]` runs as if `{}`. Proposed fix: `if (!isRecord(candidate) || Array.isArray(input)) throw new ToolInputError({ message: "input must be an object" })` — touches every tool in every package, needs a full Jini suite run, so not done here.
2. **Suspected bug, agent-plugins (untested):** `github/source-control/commit-site.mjs:148,163,178,203,234` read `body.json.<field>` after a 2xx parse with no null check.
3. Review the test-config alias added in `packages/agent-plugins/vitest.config.ts` (agent-plugins-2) — src/dist class identity for the self-import in `customize-tool.ts`.
4. Behaviour changes made under the <=40-line rule (all with proving tests): admin oauth cancel guard, routines refusal own-key, unique-id padding, messages-change retry mark, token-sign-in never throws, memory-i18n own-key, devops export-status text, commit-site null body, db markResolved site scope, recovery confirm-token check, Recovery create-button event.
5. Remaining < 100% after scoped runs are listed per branch (connect-tool, grant-signed-in-defaults, publish-agent-tools, store, host-kit, …); "after" is a lower bound, a full-suite coverage run would settle them.
