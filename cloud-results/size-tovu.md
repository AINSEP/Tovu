# size-tovu — function-size refactor (partial)

Branch: `refactor/size-tovu` (from `origin/integ/wave-b`). Verified per file: eslint (repo config; size + complexity clean, ≤50 lines) and the tests next to each file.

Setup: Node 24.11 in ~/.local/node24; `npm ci --ignore-scripts`; Jini at `origin/integ/wave-b`
(`pnpm install --frozen-lockfile`, `pnpm -r build` — 11 Jini packages fail `tsc` on type errors but still emit dist),
linked with `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`; `packages/contracts` + `packages/sdk` built with `tsc`.

## DONE (all now ≤50 lines, complexity clean)
| function | commit |
|---|---|
| requirePublishTrust (+ middleware) | d8497b78 |
| registerAdminPageDeleteRoute | a35ab6a1 |
| registerAdminPostUpdateRoute | 045b57e8 |
| saveCampaign | d3339d2f |
| registerAdminCustomCredentialsRoutes | 506bebd6 |
| registerPublishContentPeerTransportRoutes | f04f635a |
| buildBaseSystemOverlay (output md5-identical across all 12 flag combos, old vs new) | 67b7ae26 |
| registerPublishTrustHandshakeRoutes | 069a3b16 |
| registerAdminDatabaseMigrateForwardRoutes | 51337f07 |
| registerAdminSiteImportRoutes (first attempt dropped `deps` from the upload registrar and hung the integration test; fixed before commit, 9/9 pass) | see git log |
| (continuation 2) registerAdminSiteShareRoutes | 4fcf21cd |
| registerAdminPublishCredentialsRoutes | 35a064ef |
| registerAdminPublishSiteRoutes | c0e62221 |
| registerAdminSitesRoutes | da322e9e |
| registerPublishContentImportRoutes | 4b541ab0 |
| createAssistantChatsModule (+ registerRoutes) | c9c0a360 |
| publishContentFromTool | ca61f59d |
| contributeRawFilePublish (+ build) | f96459a0 |
| buildRawRowHandler | 95c47f06 |
| createSiteImportBackend | 819b01d2 |
| createSiteShareBackend | fe6a5fab |
| createTovuAgentPluginLifecycle | d4bbc4ae |
| serveBootedSite (new sibling `serve-listen.ts`; serve.ts was 495 lines) | 44d1b7a2 |
| contributeCollectionEntryPublish | 9dfdf397 |
| buildPublishContentImportHooks | 2e7ba4d6 |
| useDockerfileSource | 3d612704 |
| useLibrary | 2876197c |
| useMediaContentEditor | 7afb9e46 |
| useSkills | 1cac615e |
| useThemes | 77067b5f |
| useSites | 1678bc6b |
| createFakePageEditorPort | 4aa4199d |
| AssistantDock (state bundles in AssistantDock.state.hooks.ts + DockChatPane view; admin AssistantDock tests identical to base: 39 pre-existing failures) | 4c3d6f46 |

## SKIPPED / NOT REACHED (numbered, for the next continuation)
1. useSiteExport, useSiteImport (use-site-transfer.hooks.ts is already 502 lines: needs a sibling module for the new code).
2. createAssistantByokModule + handleTurn (assistant-byok.ts, 832 lines, mutually-referencing closures; needs sibling module).
3. createHttpRunDaemonClient, createAssistantRunFinalizer (assistant-run-finalizer.ts, 809 lines; needs sibling module).
4. applyOneRow, createPublishContentApplyPort (+applyReport) (apply-loop.ts, 996 lines; needs sibling module).
5. createLocalSiteSupervisor (local-site-supervisor.ts, 218).
6. useMedia, usePublishCredentials, useMenuEditor, usePageEditor, usePublishContentConfirm, SettingsUi (admin).
(saveCampaign was DONE by an earlier run.)

## size-debt.json entries now removable
requirePublishTrust#1 and requirePublishTrust#1.requirePublishTrustMiddleware#1; registerAdminPageDeleteRoute#1 and its `.<anonymous>#1`; registerAdminPostUpdateRoute#1 and its `.<anonymous>#1`; saveCampaign#1; registerAdminCustomCredentialsRoutes#1; registerPublishContentPeerTransportRoutes#1; buildBaseSystemOverlay#1; registerPublishTrustHandshakeRoutes#1; registerAdminDatabaseMigrateForwardRoutes#1; registerAdminSiteImportRoutes#1.

## Pre-existing test failures (also fail on unmodified origin/integ/wave-b)
In the publish-content peer tests: "connecting learns the destination's workspace instead of asking a human for it", "a fresh install connects and then publishes, with no key displayed or copied", "forms and the active theme publish through a publishing grant" (3 of 102). Likely related to the Jini packages that fail to build here.

Note: `tsc -p apps/website` did not flag an undefined identifier I introduced in one split, so tests (not tsc) were the real gate.


## Continuation-2 notes
- Verification env: Jini integ/wave-b does not match this Tovu (api moved), so many tests could not even load. Local-only, uncommitted shims in the Jini checkout (agentic ./a2ui + findCapabilityInputError re-exports, ui mcp-ui/surfaces exports, ui css copied to dist) made route/admin tests runnable. With them every touched file's tests matched the base.
- Pre-existing (identical on base): publish-tool.test.ts 47/50 fail; serve-command.integration (2 tests: identity re-seed, Constitution Art. VIII); publish-site-listing 'publish preview' test is flaky; admin StaticSiteTab 98, themes 183, pages 190, sites 48, AssistantDock 39 failures; tsc has 72 pre-existing errors in the website tree.
- Unverified by runtime tests (could not run): publishContentFromTool (tests fail on base too), registerAdminPublishCredentialsRoutes/SiteImport (validated by eslint+tsc and, where loadable, tests).
- Another run pushed registerAdminSiteImportRoutes (e162df93) concurrently; my duplicate was dropped.
- Removable size-debt entries: every function in the DONE table (#1 and any .<anonymous>#1/.build#1/.applyReport sub-entries of those).
