# Tovu extraction commit plan

Base: `7c87b3c3f95301d59f55041bf163b723bbab5d79` (`codex/tv-x9deploy`). Paired exports inspected read-only on Jini `codex/x9deployj` at `b1ff24a11c608cfece508914560c9cc6c4cf23f3`. Working-tree changes only; coordinator commits. No tests, mutation runs, builds, installs, type-checks, linters or generation run.

## 1. P0.T — destination response contract (DONE)

- Deleted `apps/admin/src/features/publish-content/api/publish-content-api.types.ts`.
- Repointed type imports in `api/publish-content-api.ts`, `hooks/publish-content-dependencies.hooks.ts`, `hooks/publish-content-port.hooks.ts`, `hooks/use-publish-content-confirm.hooks.ts`, and `hooks/__tests__/use-publish-content-confirm-T4-03.characterization.unit.test.ts`, all under `apps/admin/src/features/publish-content/`.
- Characterization first: deferred destination fixture satisfies `PublishDestinationView`; omitted-nextStep negative fixture uses `@ts-expect-error`. Mutation `MAKE_DESTINATION_NEXT_STEP_OPTIONAL` makes the directive unused. Existing response assertions and zero-setup API rationale retained.

## 2. E1.T — preflight copy binding (DONE)

- Created `apps/website/src/features/site-export/export-preflight-copy.ts`; moved placeholder, cap and warning formatters verbatim, including A400 rationale.
- Deleted `apps/website/src/features/site-export/export-preflight.ts`.
- Repointed `site-exporter.ts` and `__tests__/export-preflight.unit.test.ts` in that directory to the declared DevOps leaf and supplied host copy/placeholder. Integration imports unchanged.
- Characterization first: six unsorted hosts yield the exact first-five warning with `, ...` and the exact privacy-template warning. Mutation `SHOW_SIX_HOSTS` changes the cap to six and breaks the assertion.

## 3. E2.T — theme preview host binding (DONE)

- Changed `apps/website/src/features/site-export/theme-preview-manifest.ts` into the specified ports binding; existing signature and all five host/domain imports remain. Orchestration comments travel with the paired Jini implementation.
- Added the enabled-switcher, explicit-preview-opt-out case first in `apps/website/src/features/site-export/__tests__/theme-preview-manifest.test.ts`. Mutation `IGNORE_PREVIEW_OPT_OUT` drops options at delegation and breaks themeCount/path assertions.
- Importers, integration tests, dependency-cruiser edges and architecture baseline untouched. No files deleted for this sheet.

## 4. D1.T — History mount (DONE)

- Deleted `apps/admin/src/features/deployment/HistoryTab.tsx`.
- Repointed `Deployment.tsx` and `__tests__/PureTabs.unit.test.tsx` under that directory to DevOps; injected wired locale, translator, existing icon, real static-site href and agentHandle. Updated the moved-component reference in `DockerfileTab.tsx` only.
- Added the real-href assertion before the move; row-absence and handles remain. Mutation `DROP_HISTORY_LINK_BINDING` substitutes another supplied host path and breaks that assertion. Added the same real-href assertion to the existing direct-History case in `__tests__/Deployment.unit.test.tsx` so mutating the production mount is caught; its imports and route assertions remain unchanged.

## 5. D2.T — deployment overview collaborators (STOPPED)

- No final source or test changes retained for this sheet; its attempted move and characterization were reverted after the final source review exposed the required-provider mismatch.
- Exact mismatch: `apps/admin/src/features/deployment/__tests__/Deployment.unit.test.tsx:1,26` imports raw RTL render and wraps Deployment only in `FetchQueryProvider`. Its default/invalid-tab cases render the real Overview wired hook. `apps/admin/src/__tests__/fetch-query-provider.test-helper.tsx` delegates to `apps/admin/src/lib/fetch-query/provider.tsx`, which supplies the fetch adapter context and query provider, without AdminKitProvider. `apps/admin/src/__tests__/setup.ts` does not supply that provider either.
- The prescribed `@jini-ai/admin/react/kit` facade on paired Jini `packages/admin/src/react/kit.tsx` invokes `useAdminKit().query.useFetchQuery`; `useAdminKit` throws when AdminKitProvider is absent. Production `main.tsx` has that provider, but this existing caller does not. The sheet permits direct UI hook injection only in the leaf hook test, and requires preserving Deployment test imports. Fixing this requires the forbidden new provider setup or a design change.
- STOP rule: “Stop on ... a required new provider.” Named mutation `IGNORE_OVERVIEW_LOCALE` remains pending with this sheet. No tests run. Original host overview implementation and callers retained; independent D1.T remains applied.

## 6. S1.T — lazy source-control host page (DONE)

- Created `apps/admin/src/features/source-control/source-control-panel.tsx`, binding the DevOps shell to AdminKit TabBar, host translation/navigation/icon/handles and unchanged Providers subtree. The default object-args locale prop invokes the old real hook with no port override. Both test overrides remain.
- Deleted `apps/admin/src/features/source-control/SourceControl.tsx` and its one-export `index.ts`.
- Repointed only the dynamic import in `apps/admin/src/panel-pages.ts`, the matching modulePath in `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, and the source-control unit-test import. The Providers subtree remains behind the dynamic import.
- Updated the named stale comments in `apps/admin/src/panels.tsx` and `apps/admin/src/styles/source-control.css`.
- Extended the existing invalid-deep-link test first with a real history.replaceState spy and target URL assertion; retained history length and real-provider tests. Mutation `PUSH_SOURCE_CONTROL_TAB` changes the existing helper to push and breaks that case.

## 7. P1.T — report projection call (DONE)

- Deleted `apps/admin/src/features/publish-content/hooks/criteria-publish-result.ts`.
- Repointed the sole call/import in `hooks/use-publish-content-confirm.hooks.ts` under the same feature and supplied the exact existing host next-step string. Confirm/execute/overwrite/arming/error behavior unchanged.
- Added the forced-preview-row case first in `apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx`; exact result includes the row in both arrays and the host next step. Existing exact onPlanned assertion retained. Mutation `CHANGE_HOST_NEXT_STEP` changes the literal and breaks the exact result.

## 8. P2.T — one bound section button (DONE)

- Created `apps/admin/src/features/publish-content/publish-section-button-binding.tsx`; one module-scope object-args adapter uses the existing host section hook. Bound the CMS component to that hook, core agentHandle and the exact host label. No new stores.
- Deleted `apps/admin/src/features/publish-content/PublishSectionButton.tsx`.
- Repointed only the final import segment in these 17 callers under `apps/admin/src/`: `features/collections/CollectionEntriesScreen.tsx`, `features/collections/CollectionsScreen.tsx`, `features/media/Media.tsx`, `features/menus/menus-panel.tsx`, `features/pages/Pages.tsx`, `features/posts/Posts.tsx`, `features/taxonomy/TaxonomyScreen.tsx`, `features/themes/Themes.tsx`, `features/publish-content/__tests__/PublishSectionButton.unit.test.tsx`, `features/publish-content/__tests__/publish-availability.store.unit.test.tsx`, `features/publish-content/__tests__/use-publish-section-button.hooks.unit.test.tsx`, `integrations/jini-admin/__tests__/modules.hooks.unit.test.tsx`, `integrations/jini-admin/forms-module.hooks.ts`, `integrations/jini-admin/modules.hooks.ts`, `integrations/jini-admin/redirects-module.hooks.ts`, `integrations/jini-admin/seo-module.hooks.ts`, `integrations/jini-admin/widgets-module.hooks.ts`.
- Added the Themes primary-class and exact data-agent-label case first in the button unit test; retained parameterized scopes, real store tests and identity assertion. Mutation `DROP_SECTION_CLASS_OVERRIDE` omits className at the host projection and breaks the new case.

## Skipped/stopped scope

D2.T stopped for the provider mismatch recorded above; no other executable `.T` sheet skipped/stopped. All seven paired `.J` sheets were DONE and their declared exports are present; P0.T uses the existing core contract. The other listed source/call anchors and caller sets match despite shifted line numbers.

OPUS-CLOUD/NOT-PLANNED reservations remain deferred: website deployment operations, targets/host kit, credentials, static publish, agent tools and write registrations; writable deployment tabs/controllers/ports/rules; website source-control credentials, stores, providers and write flows; admin Providers and credential subtree; held exporter/HTML/media/security/route/report work; all database-transfer work; publish dialog/confirmation/store work except the explicitly permitted type imports and report-projection call. D2.T is also deferred as recorded above. No extra `.T` IDs exist for these reservations in this design. Existing deploy-config bindings, publish-destination routes, CSS mounts, stores and architecture exemptions are unchanged except named comments.

## Final diff review

The seven completed sheets' required source deletions are listed in their entries. Three named host binding/copy files were created; no re-export shells remain at deleted paths. Removed only surplus blank lines introduced while applying these edits; no unrelated code, helpers, options, validations or dependencies were added. All 17 button caller changes are import-specifier-only apart from the named button characterization. No package, lockfile, API baseline or architecture configuration changes. Characterizations are written and named mutation targets recorded; neither was run. Cloud verification remains pending. `.git` was not modified by a commit, staging, branch change or push.
