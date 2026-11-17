# size50 — apps/website/src plain functions 51..80 lines → ≤50

Branch `refactor/size50-tovu-website` (from `origin/integ/wave-b`). One commit per file; no behaviour change.
Measured with eslint `max-lines-per-function {max:50, skipBlankLines, skipComments}` (non-test files), plus `complexity` / `sonarjs/cognitive-complexity` ≤10 on every touched file.

## List (worst-first) and outcome

| lines | function | file | status | commit |
|---|---|---|---|---|
| 75 | createThemeTrashAdapter | features/theme/theme-trash.ts | DONE | 8d542412 |
| 74 | saveMediaCredential | features/media-generation/providers-tools.ts | DONE | cd930d03 |
| 73 | up | platform/db/migrations/0012_secrets_vault.ts | SKIPPED — pinned migration (checksum in `migrations/checksums.ts`; may already have run in user DBs; excluded from the complexity scope for the same reason) | – |
| 72 | main | index.ts | DONE (+ follow-up 6514c336 keeps helper order for the source-pinned boot test) | 2cb147be |
| 72 | renderSiteChatComparisonPage | server/inbound/public-http/routes/site/chat-comparison-html.ts | DONE (rendered HTML byte-identical, sha1 checked) | cdca6c3a |
| 69 | registerThemePagePreview | server/.../middleware/theme-page-preview.ts | DONE | 401153f1 |
| 64 | createSurfaceDeliveryBindings | features/agent-plugins/admin-surfaces/delivery-bindings.ts | DONE | 1002b95d |
| 62 | buildSitesRegistrations | features/sites/tool-registrations.ts | DONE | 2eca34c6 |
| 62 | composeAgentPluginConnections | server/runtime/composition/agent-plugin-connections.ts | DONE | e5a435c5 |
| 62 | createAssistantModule | server/runtime/composition/modules/assistant.ts | DONE | b62800f5 |
| 59 | buildFsFilesRegistrations | features/fs-files/tool-registrations.ts | DONE | cc1eda91 |
| 57 | removeUnreadableOwnerEntries | features/entries/unreadable-owner-entries-repair.ts | DONE | ba2da394 |
| 56 | buildRenderUiRegistrations | assistant/render-ui-tool.ts | DONE | 9bb6a3fb |
| 56 | createRawRowSqlitePort | features/publish-content/publish-backstop-row.sqlite.ts | DONE | 9946a29b |
| 55 | createVisitorFrontendControl | assistant/site/visitor-frontend-control.ts | DONE | 82ac9f89 |
| 55 | subscribeSiteEventHandlersOnce | server/runtime/composition/app.ts | DONE | 4917d9f8 |
| 53 | createVisitorConfirmations | assistant/site/visitor-confirmations.ts | DONE | 816e7e66 |
| 53 | createFileProvisioning | features/publish-trust/provisioning.ts | DONE | 9ca50278 |
| 53 | checkOneArtifactHashEntry | features/theme/build-conformance.ts | DONE | 0e62edf5 |
| 52 | createTovuPluginHost | server/runtime/composition/plugin-host.ts | DONE | 48e2552b |
| 51 | createVisitorExecutor | assistant/site/visitor-executor.ts | DONE | 27f5f697 |
| 51 | buildDeploymentsRegistrations | features/deployments/tool-registrations.ts | DONE | f0456735 |
| 51 | getSeoAgentToolCatalog | features/seo/agent-tools.ts | DONE | d6d449e4 |
| 51 | loadTheme | features/theme/theme.ts | DONE | 0cd9843e |
| 51 | up | platform/db/migrations/0006_submission_ip_retention.ts | SKIPPED — pinned migration (see above) | – |
| 51 | registerAdminDockerfileSourceRoute | server/.../routes/system/dockerfile-source.ts | DONE | d7ecf63e |
| 75 | (arrow) registerPluginPreviewRoute | routes/plugins/preview.ts | DONE | 2f1acb4c |
| 72/70 | (arrows) registerAdminPostDeleteRoute | routes/posts/delete.ts | DONE | d035d9ec |
| 64/58 | (arrows) registerAdminPostCreateRoute | routes/posts/create.ts | DONE | 0a857bcb |
| 54 | (arrow) registerAdminPostAutosaveRoute | routes/posts/autosave.ts | DONE | ab7fc610 |
| 56/54 | (arrows) registerAdminMediaUploadRoute | routes/media/upload.ts | DONE | 08246ed6 |
| 52 | (arrow) registerAdminAssistantPutExecutionCredentialRoute | routes/assistant/put-execution-credential.ts | DONE | 5956aed6 |
| 56 | (async arrow) import execute handler | routes/publish-content/import.ts | DONE | 2f00ddb5 |
| 57 | (arrow) registerPublishContentPeerRoutes | routes/publish-content/peers.ts | DONE | 4c099bb1 |
| 52 | (async arrow) publish POST handler | routes/system/publish-site.ts | DONE | 95fc53bb |
| 51 | (arrow) registerProductRoutes | public-http/routes/site/products.ts | DONE | 5a876a7c |
| 54 | (arrow) Promise executor in serveBootedSite | cli/commands/serve.ts | DONE | 1a0f5be7 |
| 56 | (arrows) createUserWithHumanPassword | features/identity/tool-registrations.ts | DONE | 4f9d1fa4 |
| 51 | (arrow) contributeMenusPublish | features/navigation/publish-content.ts | DONE | 3cc056fe |
| 64 | (async method) connect tool handler | features/publish-content/tool-registrations.ts | DONE | 41726102 |

Re-running the size lint after the last commit: the only 51..80 functions left in non-skipped files are the two pinned migrations.

## Skipped files (not touched)
66 more 51..80-line functions sit in files changed on `origin/refactor/size-tovu` / `origin/fix/hang-bugs` or listed in the move backlog `CLASSIFY-files.tsv` (e.g. post/post.ts, post/tool-registrations.ts, deployments/publish-agent-tools.ts, external-mcp/tool-registrations.ts, runtime/composition/deps.ts, daemon-supervisor.ts, agent-daemon-scope.ts). Exempt hooks/components: none were in range in `apps/website/src`.

## Side notes
- Functions that stay >80 lines and were out of scope (e.g. `createRouteDeps`, `createApp`, `serveBootedSite`, `buildGatedIdentityRegistrations`) are unchanged; `ownedDurableRun` (assistant.ts) already had complexity 11 before this work.
- New helpers follow `(required, optional = {})`; no exported names or signatures changed; every "why" comment moved with its code; no new eslint-disable; `size-debt.json` untouched.

## Verification & pre-existing failures
Env: Node 24.11.1, Jini `origin/integ/wave-b` linked via `link-jini.mjs` (Jini `reference-web` and `packages/user-management` builds fail on the unmodified tree — pre-existing, not used by these tests).
Per file: eslint (size + complexity + cognitive) clean on the target function; `tsc -p tsconfig.json` error set for `apps/website` identical to the unmodified tree (58 pre-existing errors, line numbers ignored); the test files that import the file (and its own `__tests__/<stem>.test.ts`) run on the tree and, where anything failed, re-run in a worktree of `origin/integ/wave-b` — the failing test names were identical every time.
This environment has many pre-existing red tests (they fail identically on `origin/integ/wave-b`), so those files give weaker evidence: e.g. `features/media-generation/__tests__/providers-tools.test.ts` (t10 media callback), `server/__tests__/assistant-*` and `admin-mcp-ui-tool-calls-route` (hang/timeouts), `__tests__/index-boot.characterization.test.ts` (5 of 8, `dbPath` argument shape), `publish-content/__tests__/*` (50 of 69), `routes/posts/create` (12 of 17 in importer set), `site/chat-comparison` test, `create-app-event-subscriptions-once.integration`. Only `index-bind-host-wiring.unit.test.ts` was newly red from my own change; fixed in 6514c336.
