# Split plan — apps/admin/src/lib/api.ts

## 1. Header
- Path: `apps/admin/src/lib/api.ts` — 2530 counted (4493 raw), `const api` object literal 1026 counted (one property per endpoint, 219 properties). Churn 193/90d.
- Over: file (2530 > 500), `api` (1026 > 100; it is an object literal, its properties are each ≤ 23).
- Phase: **NOW (before the move)**. The survey (u009-2, u033-2, u081-1, u038-2, u063-1, u019-2) marks many wire types here as DEDUPE-later copies of Jini `@jini-ai/admin` ports / `@tovu/contracts`; per-domain modules make that later dedupe one small edit per domain module. Nothing here moves to Jini itself (it is the Tovu admin's own HTTP client).
- Executor: Fable/Opus. Large mechanical part (importer codemod, 642 files) — run it with the script in §4.0, never by hand.

## 2. Decisions (read first)
**D1 — module shape: siblings `apps/admin/src/lib/api-<domain>.ts`, no folder.** CONVENTIONS rule 3 (`<stem>-<job>.ts`); the existing tests are already named that way (`lib/__tests__/api-media.unit.test.ts`, `api-themes…`, `api-users…`, `api-trash-items…`), so each test sits next to its module name.

**D2 — `api` stays in `api.ts` as a composed object; every call site keeps `api.<method>`.** Evidence (rg in apps/admin): 258 `vi.spyOn(api, "<method>")` in 45 test files, 22 `vi.mock("…/lib/api", …)` factories of the form `{ ...actual, api: { ...actual.api, <method> } }`, 162 files import `api`. All of them only work if production code reads methods through the `api` object exported by `lib/api`. So: each domain module exports a plain method object (`postsApi`, …) that ONLY `api.ts` imports; `api.ts` becomes `export const api = { ...authApi, ...postsApi, … };`. This is api.ts's own job (the client object), not a re-export barrel. Rule for the executor and reviewers: **no file other than `api.ts` may import a `<domain>Api` object** (header comment in every domain module says so, and why).

**D3 — importers: option (a), scripted rewrite.** Every other export (types, `ApiError`, `describeApiError`, `WORKSPACE_ID`, `authenticatedAdminRequest`, …) moves out and its importers are rewritten by a ts-morph codemod (§4.0). Numbers (python scan of import/export-from declarations resolving to `lib/api`): 714 files reference `lib/api`; **642 change** (295 tests); 72 import only `api` and do not change. No importer outside `apps/admin`. No barrel, so no rule-4 deviation.
- Why not (b) thin barrel: it would keep ~210 re-exported names in one module that every feature depends on, which is the exact coupling the split is for, and rule 4 forbids it. Type imports are erased at runtime, so moving them cannot break any `vi.mock`; the only runtime-sensitive moves are the request-core values, handled in D4.

**D4 — test edits beyond an import path (2 files, documented deviation of rule 11).** Two tests replace the WHOLE module with a factory that also supplies core values:
- `apps/admin/src/lib/__tests__/ledger-slice.test.ts:41` — `vi.mock("../api", () => ({ api: {…}, ApiError: FakeApiError }))`; `lib/ledger-slice.ts:15` does `error instanceof ApiError`.
- `apps/admin/src/lib/__tests__/execution-settings.test.ts:63` — supplies `api`, `ApiError: FakeApiError`, `WORKSPACE_ID`; `lib/execution-settings.ts:363` does `instanceof ApiError`.
After the codemod those modules import `ApiError`/`WORKSPACE_ID` from `./api-request`, so the factory entries must move with them: keep `vi.mock("../api", () => ({ api: { …unchanged… } }))` and add, right below it,
`vi.mock("../api-request", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api-request")>()), ApiError: FakeApiError }))` (execution-settings also keeps `WORKSPACE_ID: "workspace-local"` and its comment line in this second factory). This is "move the mock path to the new module" for exactly the moved names; nothing else in those tests changes.
- Plus one import-path-only edit: `apps/admin/src/__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx:7` `import * as apiModule from "../../lib/api"` (used only for `onUnauthenticated`, lines 176/179) → `"../../lib/api-request"`.

## 3. Responsibility map (every top-level declaration → unit)
Names below are the outline's declaration names; `api.<m>` are `api` properties (anchor = property name; they move verbatim with the comments above them).

| Unit (new file) | Declarations | `api` properties | Job |
|---|---|---|---|
| `api-request.ts` | `WORKSPACE_ID`, `BASE` (now exported), `ApiError`, `API_UNREACHABLE_CODE`, `REQUEST_TIMEOUT_CODE`, `DEFAULT_REQUEST_TIMEOUT_MS`, `timeoutApiMessage`, `unreachableApiMessage`, `UNPARSEABLE_BODY`, `errorName`, `throwTranslatedFetchFailure`, `fetchOrThrowUnreachable` (now exported), `UnauthenticatedListener`, `unauthenticatedListeners`, `onUnauthenticated`, `KEEPALIVE_MAX_BODY_BYTES`, `bodyFitsKeepalive`, `buildFetchInit`, `parseJsonBody`, `notifyIfUnauthenticated`, `buildRequestFailedError`, `requestOnce`, `upstreamRefusedErrors`, `requestRidingOutRestart`, `request` (now exported), `AuthenticatedAdminRequestOptions`, `requestPayload`, `authenticatedAdminRequest`, `authenticatedAdminUrl`, `describeApiError` | — | the shared request/error/session core every domain module calls |
| `api-identity.ts` | `AdminUser`, `AdminIdentityUser`, `AdminRole`, `AdminPolicy`, `AdminPolicyPermission` | `login` … `getPasswordStatus` (7), `listUsers` … `removePolicyPermission` (20) → `identityApi` | sign-in/session, users, roles, policies |
| `api-settings.ts` | the two existing type re-exports (`export type { SettingScope }` L58 with its import, `export type { SettingResolvedValue } from "./settings-effective-reads"` L60), `SettingValueResponse`, `SettingResetResponse`, `AdminWorkspace` | `getWorkspace`, `updateWorkspace`, `getSettingsEffective`, `setSetting` → `settingsApi` | settings ledger + workspace record |
| `api-posts.ts` | `AdminPagePluginEmbed`, `AdminPostCreateInput`, `AdminPost` | `listPosts` … `deletePage` (14, incl. `templatePreviewUrl`, autosave trio) → `postsApi` | posts and pages |
| `api-themes.ts` | `ThemeFileGroup`, `PresentationSettings`, `NO_THEME_ID`, `ThemeTier`, `AdminThemeSummary` | `getPresentation` … `setActiveTheme` (13) → `themesApi` | presentation + theme files |
| `api-media.ts` | `AdminMediaProviderCredentials`, `AdminMediaProviderMap`, `AdminMedia` | `listMedia`, `getMediaProviders`, `saveMediaProviders`, `mediaOriginalUrl` … `readDocumentText` (11) → `mediaApi` | media + documents |
| `api-mcp-servers.ts` | `AdminExternalMcpOAuthView` … `flattenAdmissionConnection` (L109-449: 15 decls incl. private `RawAdmissionConnection`, `flattenAdmissionConnection`) | `listExternalMcpServers` … `revokeExternalMcpToolApproval` (13) → `mcpServersApi` | external MCP servers |
| `api-assistant.ts` | `AdminExecutionDetectedAgent`, `PublicAssistantSettings`, `SiteAssistantCredential`, `SiteAssistantCredentialPatch`, `AdminExecutionCredential`, `AdminExecutionCredentialPatch` | `detectExecutionAgents` … `deleteAdminExecutionCredential` except `listForms` (19) → `assistantApi` | assistant execution, credentials, fs root, daemon |
| `api-content.ts` | `CONTENT_TYPE_FIELD_KINDS` … `AdminTaxonomyWithTerms`, `MergeTermPlanDetails` | `listContentTypes` … `executeMergeTerm` (18) → `contentApi` | collections, entries, taxonomy |
| `api-database.ts` | `AdminLedgerRow` … `RestoreExecuteResult` minus `MergeTermPlanDetails` (19, incl. `GatedPlanResult`, `GatedConfirmResult` + the "Session 5-6 … gated-mutation ceremonies" comment) | `getDatabaseTimeline` … `executeRestore` (13) → `databaseApi` | database timeline/drift + recovery |
| `api-audience.ts` | `AdminMember`, `AdminAnalyticsHit`, `AdminFormField`, `AdminFormNotify`, `AdminFormDefinition`, `AdminFormSubmission`, `CommentStatus`, `AdminComment`, `AdminCommentsQueuePage`, `CommentsSettings`, `CommentModerationAction` | `listMembers`, `getMember`, `disableMember`, `requestMemberMagicLink`, `listRecentAnalyticsHits`, `listForms`, `listCommentsQueue` → `audienceApi` | site visitors: members, analytics, forms, comments |
| `api-seo.ts` | `RobotsRule` … `SeoEntryAnalysis` (13), `AdminRedirect`, `AdminRedirectHitStats`, `RedirectImportRule`, `AdminRedirectImportResponse` | — (types only; their calls live in feature modules) | SEO + redirects wire types |
| `api-menus-widgets.ts` | `AdminMenuTarget` … `AdminWidgetRegionBinding` (13) | `listMenus`, `getMenu`, `createMenu`, `updateMenuTree`, `listWidgets`, `getWidget`, `createWidget` → `menusWidgetsApi` | navigation menus + widgets |
| `api-integrations.ts` | `AdminWebhookDeliverySummary`, `AdminWebhookSubscription`, `AdminWebhookDelivery` | `listIntegrationSubscriptions` … `listIntegrationDeliveries` (5) → `integrationsApi` | webhooks |
| `api-trash.ts` | `AdminTrashItem` … `AdminTrashPurgeReport` (6) | `listTrash`, `restoreTrashItems`, `purgeTrashItems`, `trash` → `trashApi` | trash |
| `api-plugins.ts` | `AdminPlugin` … `AdminAgentPluginFiles` (8) | `listPlugins` … `setAgentPluginEnabled` (10, incl. `useProjectKey`) → `pluginsApi` | plugins + agent plugins |
| `api-sites.ts` | `AdminSiteListEntry` … `AdminSiteActivation` (13), `adminSitePreviewUrl` | `getSitesConfig` … `manageLocalSite` (8) → `sitesApi` | local sites |
| `api-system-status.ts` | `ProviderDomainVerification`, `AdminDeploymentEnvVarStatus` … `AdminMailStatus` (9) | `getDeploymentOverview`, `getObservabilityStatus`, `sendObservabilityTestError`, `getToolGaps`, `getServerLogs`, `getMailStatus` → `systemStatusApi` | health readouts |
| `api-publish.ts` | `AdminDockerfileSource` … `AdminPublishCredentialsSnapshot` (20) | `getDockerfileSource` … `verifyPublishCredential` (14) → `publishApi` | Dockerfile, export, static publish + its credentials |
| `api-publish-content.ts` | `publishContentPeerPath`, `publishContentDestinationPath`, `AdminPublishDestinationView` | `listPublishContentPeers` … `executePublishContent` (6) → `publishContentApi` | content push to a peer |
| `api-credentials.ts` | `AdminSiteKeyRuntimeMode` … `AdminRevealedSiteKey` (11), `AdminSourceControlProviderId` … `AdminCustomCredentialsSnapshot` (11), `AdminCredentialCopySource`, `AdminCredentialCopyResult` | `getSiteKeyStatus` … `startFreshSiteKey` (6), `listSourceControlProviders` … `deleteCustomCredential` (11) → `credentialsApi` | site key, source control, custom credentials, credential copy |
| `api.ts` (stays) | `api` | composition only | the admin's API client object |

Coverage check (scripted): every one of the 199 declarations and 219 properties is in exactly one row (dup = none, missing = none).

## 4. Target layout
Every domain module: header comment `/** @file <job>. Its \`<x>Api\` object is imported ONLY by \`api.ts\`, which composes the one \`api\` client — call sites use \`api.<method>\` so \`vi.spyOn(api, …)\` and \`vi.mock("…/lib/api")\` keep applying. */`, then its imports, its types/helpers in original order, then `export const <x>Api = { …properties in original order… };`.

Imports per module (computed from identifiers used; type-only where the name is a type):
| Module | from `./api-request` | other |
|---|---|---|
| api-request | — | `decodeApiError` (@jini-ai/protocol), `redactSecretShapes` (@tovu/contracts/secret-redaction), `isPageUnloading` (./page-lifecycle), `adminFailureChannel, publishAdminFailure` (./admin-failure-channel), `serverReconnect, shouldRetryAfterReconnect, UPSTREAM_REFUSED_HEADER, UPSTREAM_REFUSED_VALUE, type ServerReconnect` (./server-reconnect) |
| identity | `request, requestOnce, authenticatedAdminRequest, WORKSPACE_ID` | — |
| settings | `authenticatedAdminRequest, WORKSPACE_ID` | `type SettingScope` (@jini-ai/core/settings), `shareSettingsEffectiveRead` + `type SettingResolvedValue` (./settings-effective-reads) |
| posts | `request, WORKSPACE_ID, BASE, bodyFitsKeepalive` | `siteUrl` (./site-url) |
| themes | `request, WORKSPACE_ID` | `querySuffix` |
| media | `request, WORKSPACE_ID, BASE` | `type CredentialTokenHint` (./credential-copy), `type MediaProviderCredentials` (@jini-ai/ui/core), `siteUrl`, `querySuffix` |
| mcp-servers | `request, WORKSPACE_ID` | `type CredentialTokenHint` |
| assistant | `ApiError, fetchOrThrowUnreachable, authenticatedAdminRequest, WORKSPACE_ID` | `type CredentialTokenHint` |
| content | `request` | `type GatedPlanResult, type GatedConfirmResult` (./api-database), `querySuffix` |
| database | `request` | `querySuffix` |
| audience | `request, authenticatedAdminRequest, WORKSPACE_ID` | `querySuffix` |
| seo | — | — |
| menus-widgets | `request, authenticatedAdminRequest, WORKSPACE_ID` | `querySuffix` |
| integrations, plugins | `request, WORKSPACE_ID` | — |
| trash | `authenticatedAdminRequest, WORKSPACE_ID` | `querySuffix` |
| sites | `request, authenticatedAdminUrl, WORKSPACE_ID` | `adminFailureChannel` |
| system-status | `request, WORKSPACE_ID` | `querySuffix` (`getToolGaps` keeps its inline `import('@jini-ai/daemon/tool-audit')` type) |
| publish | `request, authenticatedAdminRequest, WORKSPACE_ID` | `type CredentialTokenHint` |
| publish-content | `request, WORKSPACE_ID` | `PublishContent*`/`PublishScope` types (@tovu/publish-content-ui), `siteUrl` |
| credentials | `request, authenticatedAdminRequest, type AuthenticatedAdminRequestOptions, WORKSPACE_ID` | `type AdminDescriptorI18n, type AdminPublishTargetField` (./api-publish), `type CredentialTokenHint` |
| api.ts | — | the 19 `<x>Api` objects |

Cycles: `api-request` imports no `api*` module; domain modules import only `api-request` plus `api-database` (content) and `api-publish` (credentials), neither of which imports back; `api.ts` is imported by no `api-*` module. None of the helper modules (`credential-copy`, `page-lifecycle`, `admin-failure-channel`, `site-url`, `settings-effective-reads`, `server-reconnect`, `query-suffix`) imports `./api` (checked).

Code changes that cross the new boundary (the only non-verbatim edits):
- `api-request.ts`: add `export` to `BASE`, `request`, `fetchOrThrowUnreachable` (were module-private).
- `api-media.ts` `mediaContentType` (was api.ts:3428): `fetch(api.mediaOriginalUrl(id), …)` → `fetch(mediaApi.mediaOriginalUrl(id), …)` (same object property, read at call time; no test spies `mediaOriginalUrl` — checked).
- `api.ts` final shape: imports of the 19 objects, then `export const api = { ...identityApi, ...postsApi, ...themesApi, ...audienceApi, ...menusWidgetsApi, ...integrationsApi, ...mediaApi, ...mcpServersApi, ...settingsApi, ...assistantApi, ...contentApi, ...databaseApi, ...trashApi, ...pluginsApi, ...systemStatusApi, ...sitesApi, ...publishApi, ...credentialsApi, ...publishContentApi };` (order = first appearance in today's literal; keys are unique so order only affects `Object.keys(api)`, which nothing iterates — rg checked). Keep a short header: what `api` is and D2's reason.

### 4.0 Codemod (scripted importer rewrite; executor saves it in its scratchpad, not in the repo)
ts-morph is installed at repo root (`node_modules/ts-morph`). Script `api-split-codemod.mjs --map <json> [--dry]`:
1. Map JSON = `{ "<exportedName>": "api-<domain>" }` for the names moved IN THIS STEP only (build it from §3; include `SettingScope`/`SettingResolvedValue` → `api-settings`).
2. `new Project({ tsConfigFilePath: "apps/admin/tsconfig.json", skipAddingFilesFromTsConfig: true })`; add `apps/admin/src/**/*.{ts,tsx}` and `apps/admin/vite.config.ts`, `apps/admin/vitest.config.ts`.
3. For each `ImportDeclaration` and `ExportDeclaration` with a module specifier, resolve: `@/x` → `apps/admin/src/x`, relative → from the file's dir; strip `.js/.ts`. Act only when it resolves to `apps/admin/src/lib/api`.
4. Partition its named specifiers by map target; specifiers not in the map stay. For each target, add a declaration with the SAME specifier style (alias `@/lib/api-<d>` if the original used `@/`, else the original relative path with the last segment `api` → `api-<d>`), the same `import type`/`export type` modifier, and each specifier's own `type` modifier and `as` alias. Remove the original declaration if it is left empty. Insert new declarations directly after the original.
5. `ImportTypeNode`s (`import("…/lib/api").Name`; 3 sites: `features/security/security-i18n.ts:2198`, `components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx:279` ×2, `lib/__tests__/api-request-onok-and-null-body.unit.test.ts:80`): rewrite the argument when `Name` is in the map. `typeof import("…/lib/api")` (16 files, all `importOriginal<…>()` generics for `{ ...actual, api: … }`) stays.
6. Re-export case: `features/email/email-api.ts:73` `export type { ProviderDomainVerification } from "@/lib/api"` → `"@/lib/api-system-status"` (step 4 handles it).
7. Save only changed files; print the list. `--dry` prints without saving.
Post-check script (same project, read-only): for every import/export-from/ImportTypeNode resolving to `lib/api` or `lib/api-*`, assert each imported name is exported by that module (`sourceFile.getExportedDeclarations().has(name)`); exit 1 on any miss. Run after every step (replaces the banned local full `tsc`; CI typecheck re-checks on push).

## 5. Steps (one commit each; `git add -- <paths> && git commit -F msg -- <paths>`)
Each step: create the module (cut the listed declarations/properties from api.ts with their comments), add the `<x>Api` spread / core import to api.ts, run the codemod with that step's names, run the post-check, `npx eslint <changed files>`, then the listed tests (`cd apps/admin && npx vitest run <path> --maxWorkers=2`, one file at a time).

1. **api-request.ts** (core). api.ts imports from it every core name its remaining code uses (`request, requestOnce, authenticatedAdminRequest, authenticatedAdminUrl, fetchOrThrowUnreachable, bodyFitsKeepalive, ApiError, WORKSPACE_ID, BASE, type AuthenticatedAdminRequestOptions`). Codemod map: all 30 core names that are exported (`WORKSPACE_ID, BASE, ApiError, API_UNREACHABLE_CODE, REQUEST_TIMEOUT_CODE, onUnauthenticated, KEEPALIVE_MAX_BODY_BYTES, bodyFitsKeepalive, buildFetchInit, requestOnce, requestRidingOutRestart, AuthenticatedAdminRequestOptions, authenticatedAdminRequest, authenticatedAdminUrl, describeApiError`) → ~256 files. Apply D4's three test edits in this same commit. Tests: all 24 `apps/admin/src/lib/__tests__/api-*.unit.test.ts` (+ `api-users.test-d.ts` via `npx vitest run --typecheck` only if the suite already runs it; else skip), `lib/__tests__/ledger-slice.test.ts`, `lib/__tests__/execution-settings.test.ts`, `src/__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx`, `lib/__tests__/retry-unreachable*.test.ts` (rg for the file name). api.ts ≈ 2360 counted.
2. **api-posts.ts** + `postsApi` (55 importer files). Tests: `lib/__tests__/api-autosave-keepalive.unit.test.ts`, `api-id-url-encoding.unit.test.ts`, `api-connectors-policies-forms-seo-redirects-posts.unit.test.ts`, `features/pages/hooks/__tests__/page-editor-dependencies.unit.test.ts`, `features/posts/__tests__/post-editor-dependencies.unit.test.ts`.
3. **api-themes.ts** (26). Tests: `lib/__tests__/api-themes.unit.test.ts`, `features/pages/hooks/__tests__/theme-pages-dependencies.unit.test.ts`.
4. **api-media.ts** (58). Tests: `lib/__tests__/api-media.unit.test.ts`, `features/media/__tests__/media-providers-port.unit.test.ts`, `integrations/jini-admin/__tests__/seo-ports.unit.test.ts`.
5. **api-identity.ts** (26). Tests: `lib/__tests__/api-users.unit.test.ts`, `api-boot-session.unit.test.ts`, `src/__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx`.
6. **api-settings.ts** (11). Tests: `lib/__tests__/ledger-slice.test.ts`, `execution-settings.test.ts`, `api-workspace-taxonomy-plugins-and-unauthenticated-listener.unit.test.ts`.
7. **api-mcp-servers.ts** (23). Tests: `lib/__tests__/api-external-mcp-admissions.unit.test.ts`, `api-long-tail-endpoints.unit.test.ts`.
8. **api-assistant.ts** (24). Tests: `lib/__tests__/api-assistant.unit.test.ts`, `api-assistant-daemon-readyz.unit.test.ts`, `api-fs-files-custom-root.unit.test.ts`, `features/ai-assistant/__tests__/ai-assistant-dependencies.unit.test.ts`, `visitor-credential-form-dependencies.unit.test.ts`, `hooks/__tests__/use-admin-execution-credential.hooks.test.ts`.
9. **api-database.ts** (31) then 10. **api-content.ts** (60) — order matters (content imports database types). Tests: `features/recovery/__tests__/*` (rg list), `lib/__tests__/api-workspace-taxonomy-plugins-and-unauthenticated-listener.unit.test.ts`, `api-remaining-endpoints.unit.test.ts`.
11. **api-audience.ts** (13), 12. **api-seo.ts** (no `api` props), 13. **api-menus-widgets.ts** (39; tests `lib/__tests__/api-widgets-endpoints.unit.test.ts`, `widget-embed-extension*.unit.test.ts*`), 14. **api-integrations.ts** (12), 15. **api-trash.ts** (8; `api-trash-items.unit.test.ts`, `features/trash/__tests__/rules.unit.test.ts`), 16. **api-plugins.ts** (44; `features/plugins/__tests__/AgentPlugins.unit.test.tsx`), 17. **api-sites.ts** (30), 18. **api-system-status.ts** (27; `api-system-endpoints.unit.test.ts`, `features/email/__tests__/*`), 19. **api-publish.ts** (36) then 20. **api-credentials.ts** (36) — order matters; tests `features/deployment/hooks/__tests__/{use-publish-credentials-wired,dockerfile-source-dependencies,publish-credentials-dependencies,static-publish-dependencies,static-export-dependencies}.unit.test.ts(x)`, `features/security/hooks/__tests__/{use-other-credentials,access-tokens-dependencies,other-credentials-dependencies,use-access-tokens}.unit.test.ts(x)`, `features/source-control/__tests__/source-control-credentials-dependencies.unit.test.ts`, `features/members/__tests__/members-dependencies.unit.test.ts` (step 11), 21. **api-publish-content.ts** (4).
For steps 11-21 also run every test file the codemod touched in that step whose name matches the domain (the codemod prints the list; run them, max 10 per step, pick ones that `vi.spyOn(api` or `vi.mock(` the domain's methods).
22. Final: `outline.mjs --check apps/admin/src/lib/api.ts apps/admin/src/lib/api-*.ts`; rg `from ['"][^'"]*lib/api['"]` must show only `api` (and `typeof import`) imports.

Merge note: the codemod is re-runnable; if a step conflicts with concurrent work on import lines, take theirs and re-run that step's map.

## 6. After (counted, ±10)
api.ts ~30 · api-request ~200 · identity ~150 · settings ~45 · posts ~125 · themes ~132 · media ~108 · mcp-servers ~190 · assistant ~125 · content ~172 · database ~168 · audience ~120 · seo ~113 · menus-widgets ~124 · integrations ~68 · trash ~61 · plugins ~118 · sites ~100 · system-status ~82 · publish ~190 · publish-content ~76 · credentials ~205. Every function/property ≤ 25 (largest: `getThemeDetail`, `planPublishContent` 23). No exception candidates.

## 7. Risks
- Mocks: D2/D4 cover all 22 `vi.mock(…lib/api…)` and 45 `vi.spyOn(api…)` files; any domain object imported outside `api.ts` silently bypasses those spies — reviewer greps `rg "\b[a-zA-Z]+Api\b.*from ['\"].*lib/api-"` must hit only `api.ts`.
- Module-level state: `unauthenticatedListeners` (a single Set) must exist once — it lives only in api-request; no domain module duplicates it.
- `request` signature is shared by all domains — move it verbatim; do not touch `requestRidingOutRestart`/`upstreamRefusedErrors` order (restart recovery).
- Type-only moves are invisible to vitest; only the post-check script (and CI tsc) catches a wrong target — never skip it.
- `typeof import("…/lib/api")` in mock factories keeps working (module still exports `api`).
- Survey dedupe later (recovery, integrations, media, members types → Jini ports): edits stay inside one domain module each.
