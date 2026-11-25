SHEETS r62t-w3b-ext-a2 COMPLETE: 36 sheets (18 Jini / 18 Tovu), 34 OPUS-REVIEW, 30 files move, 0 STAYS-HOST, 0 BLOCKED

All 30 inputs have a disposition. The move count counts each input once, including splits that retain a real host binding. Sheet IDs 081–116 follow the first pass’s 40 sheets and the 40 IDs reserved for `r62t-w3b-ext-a1`. The anchors below are from the checked-out integration tips, Tovu `c0f1068a59e78a39dfdbbd3760b2c8aac996f794` and Jini `fd06f45b12ae0516b0fc196f58d785eba4d3831e`. Neither checkout was changed. No tests, builds, installs, or type-checks ran.

### Input disposition

Paths are relative to `apps/admin/src/`. `F` means `features`, `C` means `components`, and `E` means `__tests__` under the prefix where it appears.

| # | Input | Status | Sheets |
|---:|---|---|---|
| 31 | `F/settings/ExternalMcpSettingsPanel.tsx` | SHEETED | 083–084 |
| 32 | `F/settings/hooks/use-external-mcp-admissions.hooks.ts` | SHEETED | 081–082 |
| 33 | `F/settings/hooks/use-external-mcp.hooks.ts` | SHEETED | 081–082 |
| 34 | `F/settings/SettingsUi.tsx` | SHEETED | 115–116 |
| 35 | `F/deployment/hooks/use-publish-credentials.hooks.ts` | SHEETED | 085–086 |
| 36 | `F/deployment/hooks/use-static-export.hooks.ts` | SHEETED | 087–088 |
| 37 | `F/deployment/hooks/use-static-publish.hooks.ts` | SHEETED | 087–088 |
| 38 | `F/deployment/StaticSiteTab.tsx` | SHEETED | 089–090 |
| 39 | `F/pages/PageEditor.tsx` | SHEETED | 093–094 |
| 40 | `F/pages/rules.ts` | SHEETED | 091–092 |
| 41 | `F/pages/hooks/use-page-editor.hooks.ts` | SHEETED | 091–092 |
| 42 | `F/posts/rules.ts` | SHEETED | 095–096 |
| 43 | `F/posts/editor/notices/PostEditorNotices.tsx` | SHEETED | 095–096 |
| 44 | `F/posts/hooks/use-posts.hooks.ts` | SHEETED | 097–098 |
| 45 | `F/posts/Posts.tsx` | SHEETED | 097–098 |
| 46 | `F/publish-content/hooks/use-publish-content-confirm.hooks.ts` | SHEETED | 099–100 |
| 47 | `F/publish-content/PublishContentDialog.hooks.tsx` | SHEETED | 101–102 |
| 48 | `F/publish-content/PublishContentDialog.tsx` | SHEETED | 101–102 |
| 49 | `F/security/access-token-forms.ts` | SHEETED | 103–104 |
| 50 | `F/security/AccessTokensTab.hooks.tsx` | SHEETED | 105–106 |
| 51 | `F/security/AccessTokensTab.tsx` | SHEETED | 105–106 |
| 52 | `F/security/other-credential-stores.ts` | SHEETED | 103–104 |
| 53 | `F/security/OtherCredentialsSection.hooks.tsx` | SHEETED | 105–106 |
| 54 | `F/security/OtherCredentialsSection.tsx` | SHEETED | 105–106 |
| 55 | `F/security/hooks/use-access-tokens.hooks.ts` | SHEETED | 103–104 |
| 56 | `F/security/hooks/use-other-credentials.hooks.ts` | SHEETED | 103–104 |
| 57 | `F/security/Security.tsx` | SHEETED | 107–108 |
| 58 | `hooks/use-admin-execution-credential.hooks.ts` | SHEETED | 109–110 |
| 59 | `lib/settings-tabs.ts` | SHEETED | 111–112 |
| 60 | `lib/execution-settings.ts` | SHEETED | 113–114 |

### Conventions for the sheets

- `pkg:path` means `packages/pkg/src/path` in Jini. Every listed public destination is an exact leaf export, without the source extension. In that package’s `package.json`, add `types` → `./dist/<leaf>.d.ts` and `import`/`default` → `./dist/<leaf>.js`. Add the entry to `jini.entries` and to `typesVersions` where the package has it. All React, browser-controller, and browser-dependent leaves below are `browser`. Pure rules, contracts, and I/O-injected non-React leaves are `universal` as indicated. Keep split implementation files private. For each Jini sheet, add `.changeset/admin-extraction-<ID>.md` with a minor for its destination package and record the listed new leaves and symbols in the handoff for `api-baseline/jini-ai__<package>.json`. Opus generates/checks the baseline. Every Tovu sheet has **no Tovu changeset or API baseline delta**.
- Expose only the stated surface. Use existing core DTOs where available and preserve all wire envelopes. For browser collaboration types that mention React or UI types, use the structural callback or component contract at the destination, not a server import or a dependency from Admin to a domain. A type-only reference to an existing kit shape uses the narrow kit surface. Inject runtime kit leaves through the host’s `integrations/jini-kits.ts` composition or required typed slots. Preserve the single fetch-query provider. React is already an optional peer in CMS and DevOps. Use their optional React peer and matching dev-types pattern for the new MCP and Integrations React leaves. Do not give their Node entry points a React import.
- For public non-component calls use `(required, _optional: Empty = {})` unless the original typed options object applies. `Empty` is `Record<string, never>`. Keep options pads. For React components use one props object and make every custom hook prop required. Preserve callback presence versus omission, use `T | undefined` for an always-present slot, and narrow array/map/ref reads before dereferencing. No `any`, non-null assertions, or casts from `ForwardedRef` to `RefObject`. Move why-comments with the decisions they explain. Keep host-specific path or product gloss in the actual host binding and retain the rationale in neutral terms at the moved decision. Split at the named boundaries without changing hook order or dropping dependencies, to keep functions ≤80 lines and complexity ≤10.
- Anchors in Tovu sheets include direct imports, mocks, live binders, and source pins. Re-run `git grep -n -F` for the old specifier and moved symbols on both tips before editing, especially where the preceding sheets already changed a consumer. In a mixed file, pure consumers go straight to the new leaf and wire consumers stay on the actual binding. Keep existing characterization tests and the production composition witness. If a source-reading test cannot read the linked Jini source reliably, replace that assertion with an equivalent behavioral witness. No forwarding-only compatibility modules. Keep theme code, CSS policy, live client instances, and route mounts in Tovu.
- Tests named on each sheet are written first. Each `M-…` names a temporary mutation for Opus to verify, not a change to land. The Tovu end of a pair can use linked Jini source without waiting for a publish or a generated baseline. Where an A1 item is involved, use its Tovu-side binding or the already-landed Jini leaf. No new dependency here requires an unsheeted move.

### 081 — Jini · External MCP admissions and connection controller · BUILDER: SOL · OPUS-REVIEW

Move `F/settings/hooks/use-external-mcp-admissions.hooks.ts:43–320` and `use-external-mcp.hooks.ts:70–438` into `mcp:react/external-mcp/hooks/`, with the same filenames. The first exports `ExternalMcpAdmissionsPort`, `ExternalMcpAdmissionsController`, `UNAVAILABLE_RETRY_INTERVAL_MS`, `UNAVAILABLE_RETRY_ATTEMPTS`, `isAssistantStartingError`, and `useExternalMcpAdmissions`. The second exports `ExternalMcpPort`, `ExternalMcpController`, `describeStoredCredentials`, `toAccessTokenWriteBody`, and `useExternalMcp`. Private projections stay private.

- `useExternalMcpAdmissions({ port, savedAllowedToolNamesById, t, deps }, {})`. The port keeps `getAdmissions`, `me`, and `restartAssistantDaemon` and their current resolved envelopes. `deps` requires the existing query/mutation hook pair, `describeApiError`, `readApiError({ error }, {}) → { status: number; code: string | undefined } | null`, `describeAdmissionDrift`, `admissionRestartHelps`, `canRestart({ permissions }, {})`, and `schedule({ delayMs, run }, {}) → () => void`. Move `:110` to `isAssistantStartingError({ error, readApiError, transientCodes }, {})` with the same code/status branches. Keep the 3-second/60-attempt startup budget, the separate restart watch, and settled-failure state across an in-flight read. A resolved `{ ok: false }` must not start the watch.
- `useExternalMcp({ port, useAdminLocaleHook, deps }, {})`. Restate the four methods from `:282` with the arguments and results actually consumed at `:309,331,347,379,422`, using `core/contracts/site/cms-external-mcp` wire types. The `deps` object takes the serial-write hook, translator and credential-copy callbacks, API error describer and version-conflict classifier, source-update merge, auth/transport normalization and OAuth validation, and `nowMs`. `describeStoredCredentials({ server, copy }, { locale } = {})` uses the same hint/label projections. `toAccessTokenWriteBody({ fields }, {})` preserves absent/replace/clear semantics. Pull the adapter object at `:305–433` into small private list, add, edit, remove, and test constructors, keeping the memoized dependencies identity and one per-ID serial lane. An edit must capture the previous row and version **inside** that lane and update `lastKnown` after success. No new secret field in any returned item, hint, or error.

First tests `external-mcp-admissions.retry-budget.unit.test.tsx` and `external-mcp-controller.credential-version.unit.test.tsx`. `M-reset-budget-while-fetching` and `M-omit-edit-expected-version`.

### 082 — Tovu · Bind the MCP clients, clocks, and copy · BUILDER: SOL · OPUS-REVIEW

Keep the implementations of `defaultExternalMcpAdmissionsPort` at `F/settings/hooks/use-external-mcp-admissions.hooks.ts:78` and `useWiredExternalMcpAdmissions:324` together in `external-mcp-admissions-dependencies.hooks.ts`. The latter takes `{ savedAllowedToolNamesById }` and the options pad. Bind the existing `ApiError` check, transient codes, `system.write` predicate, drift copy, query hooks, and cancelable browser timer there. Only Tovu calls `integrationsApi`, `authApi`, and `aiAssistantApi`.

Create `F/settings/hooks/external-mcp-dependencies.hooks.ts` with `useWiredExternalMcp(_required: Empty = {}, _optional: Empty = {})` and the stable collaborators from the old file. Keep `Date.now`, product credential copy, and the client instance here. Add `@jini-ai/mcp` as a direct dependency in `apps/admin/package.json` at the workspace’s existing Jini prerelease range for the linked/release integration. Repoint:

- `F/providers/Providers.tsx:19` to the wired hook/type split, and `F/providers/hooks/E/use-providers.unit.test.ts:5` to the neutral hook with a fake port and real or fake explicit collaborators.
- Under `F/settings`, `ExternalMcpSettingsPanel.tsx:35` to the admissions binder until 084. `ExternalMcpAdmissionsBanner.tsx:5` or its A1 successor imports the neutral controller type. `E/{ExternalMcpAdmissionsBanner.unit.test.tsx:8,ExternalMcpSettingsPanel.unit.test.tsx:10,external-mcp-missing-launcher-recovery.unit.test.tsx:8}` and `hooks/E/use-external-mcp-admissions.unit.test.tsx:16` import neutral types/hooks and bind their fakes.
- `F/settings/hooks/E/{use-external-mcp.lost-update.unit.test.ts:7,use-external-mcp.unit.test.ts:5–6}` and `lib/E/credential-fidelity.unit.test.ts:7` import neutral helpers. Test the production copy through the same bound collaborators, not an English-only replacement. Retire old hook paths and reconcile `development/scripts/{error-gate-debt.json:188,size-debt.json:250}`.

First host test `external-mcp-host-bindings.unit.test.tsx`. `M-bind-restart-to-read-permission` must fail at the live permission binding.

### 083 — Jini · External MCP settings panel · BUILDER: SOL · OPUS-REVIEW

Move `F/settings/ExternalMcpSettingsPanel.tsx:157,197,255,279,309,405,456,487–627` to `mcp:react/external-mcp/ExternalMcpSettingsPanel.tsx`. Export `ExternalMcpSettingsPanel` and `ExternalMcpSettingsPanelProps`. Keep `dependencies`, `saveStatusLabel?`, and `showTitle?`. Make `useTHook`, `useWiredSourceConfigListHook`, `useExternalMcpAddFormHook`, `useSavedAllowedToolNamesByIdHook`, `useExternalMcpAdmissionsHook`, and `useExternalMcpDriftCopyHook` required. Use `{ sources }` and `{ savedAllowedToolNamesById }` for the latter two data calls, adapting the old positional signatures on the binder side if needed.

Require the OAuth connect and shared-choice hooks at the row level, and pass the list/form parts, admission banner, tool modal, remove dialog, and `InfoTip` from the kit/host. Bind the tool-modal escape, focus trap, picker, and remove-confirm hooks on the host side, passing their result through the existing modal seams. `rules` takes the exact collaborators from `:27–38` used by the view, including card handles, field specs, grant-write patch, built-in predicate and effective auth mode. Product variables are data. Split `:309` at OAuth status/tools and `:508` at the add-form/admission section. Preserve standalone title default, card handle suffixes, add-cancel reset, the user MCP “can write” disclosure, and confirm-before-remove. “Allow write” must apply only the patch for the selected connection and tool.

First test `ExternalMcpSettingsPanel.admissions-actions.unit.test.tsx`. `M-remove-on-request` and `M-drop-write-disclosure`. The independently moved A1 banner and form helpers are injected, not copied or directly imported into this package.

### 084 — Tovu · Mount the MCP panel in Providers · BUILDER: SOL · OPUS-REVIEW

At `F/providers/Providers.tsx:11,19` and its actual tab render, mount the Jini panel with `showTitle={false}` and the existing restart-status label. If A1 moved Providers, do this in its Tovu-side MCP tab binder. Keep `useHostExternalMcpOAuthConnect`, `useHostExternalMcpSharedChoice`, `EXTERNAL_MCP_PICKER_COLLABORATORS`, and `EXTERNAL_MCP_PRODUCT_VARS` at that binding. Supply the A1 form/banner collaborators and the 082 admissions hook. Use a real component such as `F/settings/external-mcp-settings-panel.binding.tsx` if needed so the Providers domain sees a bound slot, not a second copy of the panel.

Repoint `F/settings/E/{ExternalMcpSettingsPanel.unit.test.tsx:9–10,built-in-mcp.unit.test.tsx:6–7,external-mcp-agent-drive.unit.test.tsx:11,external-mcp-missing-launcher-recovery.unit.test.tsx:6,8}`. The tests for `ExternalMcpSettingsPanel.hooks` at `:5` and `ExternalMcpToolsModal.unit.test.tsx:10` still target the A1/helper owner for their assertions. Same for `hooks/use-external-mcp-tool-picker.hooks.ts:9`. `F/integrations/index.ts:14` is a doc pointer, not a competing mount. Reconcile literal-copy pins at `lib/E/fixtures/admin-literal-copy.baseline.json:323,330`.

First host test `Providers.external-mcp-mount.unit.test.tsx`. `M-drop-host-oauth-binding` must break Connect on the bound panel, with no change to the route or OAuth policy.

### 085 — Jini · Publish credential controller · BUILDER: SOL · OPUS-REVIEW

Move `F/deployment/hooks/use-publish-credentials.hooks.ts:84,121,180–437,452–end` to `devops:deploy/react/hooks/use-publish-credentials.hooks.ts`, beside first-pass J16. Export `PublishCredentialRowState`, `PublishCredentialsController`, and `usePublishCredentials({ port, t, locale, targets, deps }, {})`. Keep the existing `PublishCredentialsPort` members and return envelopes as a structural port. Use the core publish-credential summary, verification, and mode types at `core:contracts/site/api-security-api-types.ts`. Targets remain `readonly Target[] | undefined` for the required `targets` slot. Use the J16 descriptor/field shape rather than a new catalog.

Require `useFetchQueryHook`, credential error classification/describing, draft-safe error shaping, translation, and the submit/verify/select copy callbacks. Reuse J16 field validation, connection-input and default-promotion rules with their named arguments. Split controller work into private query/seeding, row drafts, save/verify, and default-selection groups at `:242–270`, `:273–299`, `:306–390`, and `:392–425`. Preserve seed-once behavior, per-provider in-flight guards, edits typed while a save is pending, and verification’s own `verifiedCredentialId`. Local verification may improve the summary without inventing an account finding. Never mark a saved but unverified row connected on this screen.

First test `publish-credentials.inflight-edit.unit.test.tsx`. `M-clear-newer-draft-after-save` and `M-verify-wrong-selected-id`.

### 086 — Tovu · Bind publish credential effects · BUILDER: SOL · OPUS-REVIEW

Put `useWiredPublishCredentials({ targets }, {})` from `F/deployment/hooks/use-publish-credentials.hooks.ts:445` beside the live `defaultPublishCredentialsPort` in `publish-credentials-dependencies.hooks.ts:13`. Bind locale, translation/redaction, error classification, and the existing query provider there. Keep the fake port at `:23`. Repoint `StaticSiteTab.tsx:37–38`, `E/StaticSiteTab.unit.test.tsx:8,18`, and `hooks/E/{use-publish-credentials-wired.unit.test.tsx:23,use-publish-credentials.unit.test.tsx:7}`. The dynamic import in the wired test targets the real binder. `F/source-control/hooks/use-source-control-credentials.hooks.ts:30` is a rationale reference, not a runtime edge. Reconcile `development/scripts/error-gate-debt.json:63,68` and `size-debt.json:47`.

First host test `publish-credentials-wired.redaction.unit.test.tsx`. `M-forward-raw-draft-error` must expose a sentinel in the test and fail. Do not add a client read for the submitted secret.

### 087 — Jini · Static export and publish controllers · BUILDER: SOL · OPUS-REVIEW

Move `F/deployment/hooks/{use-static-export.hooks.ts:53,114–262,use-static-publish.hooks.ts:56,128,144–386,400–end}` to `devops:deploy/react/hooks/` with the same filenames. Export `StaticExportController`, `useStaticExport`, `StaticPublishController`, `StaticPublishOptions`, and `useStaticPublish`. Use first-pass J01’s `StaticExportPort` and `StaticPublishPort<Target, Config, Preview, Run>` and core `ExportRunSnapshot`. Keep one specialization of the publish type parameters with J16’s descriptor shapes and the existing fields from `admin:deployment/api/deployment-api.types.ts`, not narrower vendor unions.

- `useStaticExport({ port, t, locale, deps }, {})`. Require `useFetchQueryHook`, `useContentRefreshSubscriptionHook`, error/copy projection, and the cancelable `schedule` shape from 081, structurally declared here. Preserve the bespoke refresh at `:239–246`, which reseeds from the port without replacing an actively polled run. Keep trigger, polling, and load errors separate. Schedule only after settlement, retain bounded consecutive failures, and cancel the previous generation on cleanup.
- `useStaticPublish({ port, t, locale, deps }, {})`. Require query hook, `localizePublishTargets`, error/copy projection, and `schedule`. Move existing rules calls to J16. Split target/config/preview (`:145–224`), run/query/poll (`:230–300`), and submit (`:303–343`). Preserve first target ordering and the stale preview generation check. `credentialId` is omitted when no specific credential is selected. Keep target-required credential/project readiness, synchronous duplicate-submit exclusion, and policy refusal rendering distinct from transport errors. Do not replace the controller with the existing history view.

First tests `static-export.refresh-while-running.unit.test.tsx` and `static-publish.preview-generation.unit.test.tsx`. `M-reseed-active-export` and `M-accept-stale-publish-preview`.

### 088 — Tovu · Bind static run ports and scheduling · BUILDER: SOL · OPUS-REVIEW

Move `useWiredStaticExport:267` and `useWiredStaticPublish:394` into their existing `static-{export,publish}-dependencies.hooks.ts` modules alongside the live ports from T01. Bind locale, error presenters, target localization, query/refresh hooks, and the browser scheduler there. No shared module-level timer. Repoint `F/deployment/StaticSiteTab.tsx:33–36`, deployment `E/StaticSiteTab.unit.test.tsx:6–7`, and `hooks/E/{use-static-export.unit.test.tsx:6,use-static-publish.unit.test.tsx:5}` to the new live/neutral owners. Existing fake ports stay. Rehome or replace the refresh source pin at `hooks/E/content-refresh-coverage.unit.test.ts:77` and reconcile `development/scripts/{error-gate-debt.json:73,78,size-debt.json:54}`.

First host test `static-run-bindings.request-parity.unit.test.tsx`. `M-serialize-absent-credential-selection` must fail parity on the actual bound request.

### 089 — Jini · Static Site tab · BUILDER: SOL · OPUS-REVIEW

Move `F/deployment/StaticSiteTab.tsx:379,434–end` and its preceding private view helpers to `devops:deploy/react/StaticSiteTab.tsx`. Export `StaticSiteTab` and `StaticSiteTabProps`. Require the four hooks currently in `StaticSiteTabProps.hooks`, using a single required hook group. Also require `useCopyToClipboardHook`, the kit and portable `CredentialHint`/secret control slots, `tForLocale({ locale, key }, {})`, `capabilities`, viewer zone, and the manage-access-tokens href/navigation callbacks. Use J16 rules and visual leaves, 085/087 controller types, and `RenderPublishRunResult` or the same-package existing `PublishRunResult` with host facts passed explicitly.

Keep the layout order and status checks. Split the card at `:515`, the credential form/step UI at `:722,758,888,991,1056`, and preview/execute actions at `:1198,1239,1311`. Preserve one credential row in edit mode, the exact `verifiedCredentialId` gating of the success step, private field markup and paste/reveal behavior, and the distinction between copyable endpoint/fact text and secret input. Retain conditional spreading of the selected credential and project-name fields. No theme CSS or target/provider policy moves.

First test `StaticSiteTab.credential-ceremony.unit.test.tsx`. `M-mark-unverified-row-done` and `M-start-publish-without-required-credential`.

### 090 — Tovu · Finish the static deployment mount · BUILDER: SOL · OPUS-REVIEW

Replace the temporary Static Site slot from T16 with a real `F/deployment/static-site-tab.binding.tsx`. Supply the wired hooks from 086/088, host `StaticSiteTab.hooks.ts:4` translator, J16’s host capability data, credential copy/control bindings and `adminHref`/`navigate`. At current `F/deployment/Deployment.tsx:9,60`, this becomes the static-tab slot in T16’s mount. Keep `panel-pages.ts:60` and the `/deployment` lazy boundary. `F/deployment/E/StaticSiteTab.unit.test.tsx:5–8,18` renders the neutral component with a complete fake kit/hook group, and the bound case remains a Tovu integration test. Reconcile `development/scripts/size-debt.json:40`. The occurrences in `F/source-control/ProvidersTab.tsx` and `F/security/AccessTokensTab.tsx:461` are rationale links, not imports of the tab.

First host test `deployment-static-tab.mount.unit.test.tsx`. `M-map-static-tab-to-overview` must break `?tab=static-site` through the actual lazy screen.

### 091 — Jini · Page editor rules and controller · BUILDER: SOL · OPUS-REVIEW

Move neutral portions of `F/pages/rules.ts:97,113,121–152,215–239,261–272` to universal `cms:react/pages/rules.ts`. Export `PAGES_RESOURCE`, `HOME_PAGE_HANDLE`, `PageAdminHandle`, `pagePublicPath`, `pageAdminPath`, `pagePickerValue`, `PAGE_VERSION_CONFLICT_CODE`, `PageSaveConflict`, `PageEditorSurface`, and `pageEditorSurface`. Keep `themePageRowMenuItems` and its types (`:159–195`) in the theme-facing host module. Use the common optimistic-concurrency constant, and keep the exact fields of the existing conflict type. Make the options injection explicit where needed:

```ts
pageAdminPath({ page }: { page: PageAdminHandle }, _optional: Empty = {}): string
pagePickerValue(
  { templateChoice, availableTemplates, shellTemplates, defaultSentinel }: PagePickerInput,
  _optional: Empty = {},
): string
pageEditorSurface<Styling>(
  { view, canvasStyling }: {
    view: "preview" | "html" | "interactive"
    canvasStyling: { status: "pending" } | { status: "ready"; styling: Styling }
  },
  _optional: Empty = {},
): PageEditorSurface<Styling>
```

`PagePickerInput` keeps `templateChoice: string | null`, and both template lists are readonly strings. Never normalize `""` to `null`. Public root is `/`, editor root alias is `/pages/home`, and a real `home` slug still gets its ID path.

Move `F/pages/hooks/use-page-editor.hooks.ts:81–1297,1315–1317` to `cms:react/pages/hooks/use-page-editor.hooks.ts`. Export `PageEditorController`, `PageEditorDependencies`, and `usePageEditor({ routeSlug, deps }, {})`. Preserve the controller’s existing field and callback names. Parameterize `deps.port` over the J11 row/embed/draft/snapshot specialization, using the fields read by the controller, and keep `activeThemeTier` nullable and `activeThemeApiVersion` `2 | undefined`. Require the existing query, invalidate, agent screen, content-refresh, dirty guard, settlement, external-refresh, standing-draft, device/width, interactive-flush, HTML-jump, and theme-styling hooks. The bound styling hook accepts the current display input and returns the generic `pending`/`ready` union, so no `ThemeCanvasPort` or theme-fetch runtime comes into CMS. Also require the schema-aware embed describer inputs, page copy, navigation, J11 failure readers, and the preview scheduling/DOM callbacks presently at `:456,1005`. Use the existing shared save/body/title rules instead of relocating another copy.

Split at load/cache and hydration (`:605–741`), flush/view and external application (`:743–838`), save/overwrite/delete (`:860–998`), preview/screen/refresh/leave (`:1000–1107`), and recovery/transition (`:1122–1206`), with a private controller assembly for `:1207–1297`. Use typed mutable refs for the owner of each request and narrow nullable refs before use. Keep seed/write order, stable row ID, and save metadata → returned version → body write from J11. Preserve the authored-document refusal, partial-save dirty body, permission-refused preview, and explicit trash confirmation.

First tests `page-editor.root-and-picker.unit.test.ts`, `page-editor.flush-and-stale-save.unit.test.tsx`, and `page-editor.authored-document.unit.test.tsx`. `M-force-html-over-authored-doc` and `M-use-route-slug-as-write-id`.

### 092 — Tovu · Wire the page controller and split rule consumers · BUILDER: SOL · OPUS-REVIEW

At `F/pages/hooks/page-editor-dependencies.hooks.ts:11–12,22,272` keep the J11 port specialization and live embed loader. Move `useWiredPageEditor:1299` there or into a sibling `page-editor.binding.hooks.ts` if needed to keep the fake-port tests isolated. Bind `defaultThemeCanvasPort` to the existing stylesheet/template/token hook in Tovu. Bind the current router, locale/copy, DOM preview scheduling and scroll callbacks, editor flush/HTML-jump hooks, and shared cache/draft subscriptions. Update J11’s save caller against this binding, not a second save implementation.

Use the new rules leaf at `F/pages/{PageEditor.tsx:46,Pages.tsx:12,hooks/pages-dependencies.hooks.ts:5,hooks/use-pages.hooks.ts:11,hooks/use-theme-pages.hooks.ts:7}`, `F/menus/menus-host-ports.ts:12`, and `F/pages/E/{rules.unit.test.ts:11,use-page-editor.unit.test.ts:9,use-pages.unit.test.ts:9}`. The J11 `page-editor-save.ts:11` type edge follows the moved rule or its structural conflict type. Bind the shipped shell names and default sentinel for picker tests. Keep `ThemePagesTab.tsx:10` on the real theme menu rule; no re-export of the moved names from it. Convert every `pageAdminPath` call to `{ page }`.

Repoint the controller references in `F/pages/PageEditor.tsx:32`, `panels.tsx:15,271`, `__tests__/fqfix-editor-reopen.unit.test.tsx:11`, `hooks/E/editor-session-expiry.unit.test.ts:8`, `F/themes/E/theme-preview-dirty.unit.test.tsx:8`, and `F/pages/E/{PageEditor.interactive-flush.unit.test.tsx:8,PageEditor.preview-remount.unit.test.tsx:18,PageEditor.preview-youtube.unit.test.tsx:13,PageEditor.unit.test.tsx:9,html-tab-new-page.unit.test.ts:4,scriptblocks-controller.unit.test.ts:4,use-page-editor.unit.test.ts:4}`. Only the wired-hook test and route composition use the bound hook. Rehome `hooks/E/content-refresh-coverage.unit.test.ts:90`, `development/scripts/error-gate-debt.json:113`, and `size-debt.json:152,159`. `PageEditorPreview.tsx:132` and post controller comments are doc links.

First host test `page-editor-binding.keepalive-and-replace.unit.test.tsx`. `M-drop-replace-on-canonical-redirect` must fail with the ID-to-slug redirect; retain the existing editor-session expiry witness.

### 093 — Jini · Page Editor view · BUILDER: SOL · OPUS-REVIEW

Move `F/pages/PageEditor.tsx:82–1115` to `cms:react/pages/PageEditor.tsx`. Export `PageEditor`, `PageEditorProps`. Keep `slug` and all four existing required hooks (`usePageEditorHook`, keyboard, preview-frame, preview-embed IDs). For host components require typed slots for `PagePreview`, interactive HTML editor, template source modal, reload button, and term picker. The preview and editor props preserve their current nullable refs, inactive/flush callbacks, key and embed data. Take `useTermListRevealHook` and `useTermPickerHook` as required where the picker renders. Inject kit, device component slots, URL resolver, external-change bindings, standing-draft message projection, and theme picker input from 091. The live preview implementation, theme canvas and routing stay out of CMS.

Separate header/actions (`:126–337`), notices (`:340–582`), toolbar and template gate (`:583–696`), and view/form assembly and panes (`:697–953`, `:955–1115`) into small private components. Preserve notice order, no interactive mount until styling settles, the actual preview form ref, preview revision keys, the flush-before-source/view/template transitions, and the independently mounted leave/delete/overwrite dialogs. Host HTML not yet saved is never passed to a public-only URL path.

First test `PageEditor.surface-and-confirmations.unit.test.tsx`. `M-mount-before-canvas-ready` and `M-skip-interactive-flush-on-view-switch`.

### 094 — Tovu · Mount Page Editor without moving theme integrations · BUILDER: SOL · OPUS-REVIEW

Create `F/pages/page-editor.binding.tsx` to pass the 092 controller, current `PageEditorPreview`/HTML editor, theme reload/frame hooks, `useLivePreviewEmbedIds`, taxonomy hooks, template modal, URL/copy and kit. Preserve lazy `PageEditor` in `panel-pages.ts:24` and the `key={ctx.params.slug}` mount at `panels.tsx:271`. Point the lazy import to the real binder, remove the `F/pages/index.ts:10` forwarding export, and leave the Pages-list export alone. Move the lazy witness `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:24,62` to the new module split and preserve the assertions in `panels-render.unit.test.tsx:213–215,406`.

Repoint `F/pages/E/{PageEditor.interactive-flush.unit.test.tsx:7,PageEditor.preview-remount.unit.test.tsx:17,PageEditor.preview-youtube.unit.test.tsx:12,PageEditor.unit.test.tsx:8}` and `F/themes/E/theme-preview-dirty.unit.test.tsx:7` to the neutral view with explicit collaborators or the bound component when exercising actual Tovu theme wiring. Reconcile `lib/E/fixtures/admin-literal-copy.baseline.json:109,116`, `development/hook-injection-debt.json:175`, and `development/scripts/size-debt.json:117,124,131,138`. Keep the page visual and route journey selectors.

First host test `page-editor-binding.route-identity.unit.test.tsx`. `M-unkey-editor-on-slug-change` must fail across navigation between pages.

### 095 — Jini · Post rules and independent editor notices · BUILDER: SOL · OPUS-REVIEW

From `F/posts/rules.ts`, move the list rules at `:36–101` and the reusable draft/conflict, loose-document, preview, schedule, cover and slug rules at `:107–182,398–565` to universal `cms:react/posts/rules.ts`. Export `POSTS_RESOURCE`, `PostRowMenuHandlers`, `postRowMenuItems`, `buildPostRowMenuHandleMap`, `buildPostAutosaveDraft`, `POST_VERSION_CONFLICT_CODE`, `PostSaveConflict`, `postVersionConflictMessage`, `postAutosaveStaleBasisMessage`, `withTitleNode`, `titleNodeText`, `PostPreviewBranches`, `resolvePostPreviewBranches`, `isoToLocalDateTimeInput`, `localDateTimeInputToIso`, `isScheduledPost`, `showsCoverImageSlot`, `showsHideCoverInBodyToggle`, `postSlugFollowsTitle`, and `postSlugForTitle`. No TipTap type in this leaf. Treat the JSON document as the current loose tree. A generic row menu uses the same row throughout `PostRowMenuHandlers<Row>` and `postRowMenuItems({ post, handlers, t }, {})`. Copy both conflict formatters with named inputs and supplied `t` if they resolve locale. Leave editor drag/drop, `FileReader`, toolbar constants/styles, and the theme override select mapping at `:188–397` in Tovu.

Move `F/posts/editor/notices/PostEditorNotices.tsx:33–end` to `cms:react/posts/editor/notices/PostEditorNotices.tsx`, exporting `PostEditorNotices` and the props type factored from `:46`. Keep its four existing notice props and actions. Inject the three existing banner kit components, `PageExternalChangeBanner` as a bound slot, and the draft recovery message projector. Use structural draft/stale/conflict fields from the kit or 095 rules, not the host autosave hook. Notices are independent except when an outside-change notice suppresses the corresponding stale-basis notice. Preserve order recovery → stale basis → save conflict → external change.

First tests `post-rules.slug-and-row-menu.unit.test.ts` and `PostEditorNotices.concurrent-notices.unit.test.tsx`. `M-hide-conflict-when-recovery-is-visible`, `M-show-stale-and-external-for-same-event`, and `M-drop-delete-menu-intent`.

### 096 — Tovu · Repoint post rules without moving the rich-text editor · BUILDER: SOL · OPUS-REVIEW

Bind notice kit/adapters at `F/posts/PostEditor.tsx:8` and its notice mount, with type projection at `hooks/use-post-editor-screen.hooks.ts:12`. Keep existing loaded-update, reload, and overwrite callbacks. In J12/T12 preview/state/save compositions, replace the injected old pure rule implementations with 095’s leaf without adding a second rule path.

Under `F/posts`, repoint moved symbols in `Posts.tsx:15`, `editor/preview/PostPreview.tsx:4` or its T12 binder, `hooks/{post-cover-host.hooks.ts:8,post-editor-dependencies.hooks.ts:9,post-editor-messages.ts:6,post-editor-state.rules.ts:3,posts-list-dependencies.hooks.ts:4,use-post-editor.hooks.ts:53,use-posts.hooks.ts:9}`. The J12 moves of messages/state receive the same helpers through their existing injection seam. Keep `PostEditor.tsx:20`, `editor/bubble-menu/BubbleFormattingMenu.tsx:7`, `editor/toolbar/{ToolbarColorGroup.tsx:2,ToolbarFormattingGroup.tsx:4,ToolbarTypographyGroup.tsx:2}`, and `hooks/post-editor-file-upload.ts:3` on the host remainder. Split mixed imports rather than forwarding moved rules through the remainder.

Repoint `F/posts/E/{Posts.unit.test.tsx:9,post-cover-image.unit.test.tsx:13,post-editor-state.rules.unit.test.ts:13,post-schedule-featured.unit.test.tsx:12,posts-agent-drive.unit.test.tsx:8,rules.unit.test.ts:19,use-posts.unit.test.ts:9}` and `hooks/E/editor-session-expiry.unit.test.ts:13`. The DOM characterization test at `F/posts/E/PostEditor.dom.characterization.unit.test.tsx:11` keeps its toolbar constants in Tovu. Retain both code paths when the test at `rules.unit.test.ts:19` covers a mixture.

First host test `PostEditor.notices-bound-actions.unit.test.tsx`. `M-dismiss-external-by-overwriting` must break the distinct actions.

### 097 — Jini · Posts list controller and screen · BUILDER: SOL · OPUS-REVIEW

Move `F/posts/{hooks/use-posts.hooks.ts:62–243,Posts.tsx:30–216}` to `cms:react/posts/` with the same relative paths. Export `PostsController`, `PostsListDependencies`, `usePostRowMenuHandleMap`, `usePosts`, `PostsProps`, `postsListNotice`, and `Posts`. `usePosts({ port, navigate, deps }, { locale = "en" } = {})` keeps the exact list/update/delete port envelopes and requires locale-bound translation, query/cache/mutation/invalidate hooks, and content-refresh hook. Preserve `["posts","list"]`, invalidation of `["posts"]`, owner of latest cache reads, and cache replacement after mutation. Private query/read, status mutation, and confirmed delete blocks come from `:102–136`, `:137–196`, and `:197–223`. Do not invent a server-side create in `createPost`. It opens the local working-copy route.

`Posts(props)` requires `usePostsHook`, locale hook, kit `DataTable`/`RowMenu`/`ConfirmDialog`, translation, `ServerLabel`, section publish slot, URL/navigation functions and viewer zone. Inject shared compare/label functions if supplied by the Admin kit today. Pull the five columns at `:129–195` and delete confirmation at `:197–213` out of the top-level render. Preserve newest-first default for Updated, a stale table under background load/failure, accessible handles, and pending-delete identity. Guard index/handle lookup and never generate an `undefined-…` handle.

First tests `use-posts.latest-read-and-trash.unit.test.tsx` and `Posts.sort-and-background-error.unit.test.tsx`. `M-trash-on-menu-selection` and `M-clear-table-on-background-error`.

### 098 — Tovu · Wire and lazy-load the Posts list · BUILDER: SOL · OPUS-REVIEW

Move `useWiredPosts:245` into `F/posts/hooks/posts-list-dependencies.hooks.ts` beside `defaultPostsListPort:13` and wire existing cache, locale, save-copy and router collaborators there. Create `F/posts/posts-list.binding.tsx` for status rendering, site URL, publish section slot and kit. Remove only `F/posts/index.ts:9`, not the PostEditor barrel entry. Point `panel-pages.ts:23` to the actual list binder and retain `panels.tsx:304`. Rewire lazy fixture `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:23,59,132,176`, and preserve `panels-render.unit.test.tsx:222–223`. The side-effect `../../features/posts` in `app-admin-assistant-dock-visibility.unit.test.tsx:14` must target the real enabled module if it was relying on warming the list, not a new barrel.

Repoint `F/posts/E/{Posts.unit.test.tsx:5,7–9,posts-agent-drive.unit.test.tsx:6–8,posts-i18n.unit.test.ts:6,use-posts.unit.test.ts:8–9}`. The wired hook case uses the binder. Preserve query ownership and why-comment pins `__tests__/fqfix-rationale.unit.test.ts:16`, `hooks/E/content-refresh-coverage.unit.test.ts:54`, and `development/eslint-rules/__tests__/single-fetch-query-provider.unit.test.ts:20,31,36`. The ESLint fixture can keep a synthetic path only if it still exercises the same import policy. Reconcile literal-copy pins `:274,281` and size debt `:173`.

First host test `posts-list.binding.trash-and-publish-section.unit.test.tsx`. `M-bind-trash-as-permanent-delete` must fail on the port call, not just the button copy.

### 099 — Jini · Publish confirmation controller · BUILDER: SOL · OPUS-REVIEW

Move `F/publish-content/hooks/use-publish-content-confirm.hooks.ts:63–1289` to `cms:react/publish-content/hooks/use-publish-content-confirm.hooks.ts`. Export `PublishContentConnectOffer`, `PublishContentConfirmView`, `PublishPrimaryKind`, `CONFIRM_ARM_DELAY_MS`, `liveGapLinesFor`, `overwriteTooltipFor`, `reportRowNote`, `reportRowPillClass`, `usePublishContentConfirm`, and `publishMismatchMessage`. Keep the existing view shape. Convert `reportRowNote` and `reportRowPillClass` to `{ row, t }` and `{ row }` plus pads. Keep the existing `liveGapLinesFor` locale options and the helper output strings. `usePublishContentConfirm({ onCancel, t, port, deps, criteria?, scope?, onPlanned?, confirmArmDelayMs? }, {})` uses J13’s port as **required**. Preserve `400` when the delay is omitted and `0` when intentionally supplied.

Inject `useLocaleHook`, `describeApiError`, `nowMs` (monotonic), scope copy functions and typed publication policy. The K5 prerequisite is local to this sheet. Replace the six `@tovu/publish-content-ui` imports at `:1` with the already-existing CMS functions plus required data for `PublishReportPolicy`, `PublishSection[]`, type aliases and the confirm drift message. Pass `policy` to `toPublishReportRows`, `typeAliases` to `applyPublishCriteria`, `sections` to entity labels/section selection, and `driftMessage` to `preparePublishConfirmation`. The host test must prove output parity of that injection, not substitute default copy. No new alias or route. The existing Jini contracts at `core:contracts/site/cms-publish-content.ts` and the existing criteria result at `cms:react/publish-content/hooks/criteria-publish-result.ts` are sufficient.

Split into private peer/discovery and scope (`:461–600`), request/overwrite operations (`:611–719`), connect/confirm/execute (`:720–872`), criteria and report (`:876–998,1093–1289`), and primary-control arming/assembly (`:999–1090`). All plan requests flow through one scoped function. Keep blank/multiple/single-peer distinctions, exact scope/selected/overwrite arrays, carry-along media behavior, change-of-plan refusal, and the original state-machine fences before `executePublish`. A response from a superseded request or unmounted dialog cannot proceed. Preserve the layout-effect arming stamp and synchronous in-flight ref.

First tests `publish-confirmation.scope-drift-and-token.unit.test.tsx` and `publish-confirmation.arming.unit.test.tsx`. `M-drop-scope-on-overwrite-replan`, `M-execute-from-unconfirmed-plan`, and `M-arm-before-replan-settles`.

### 100 — Tovu · Bind publish confirmation policy · BUILDER: SOL · OPUS-REVIEW

Create `F/publish-content/hooks/publish-content-confirm.binding.hooks.ts` exporting `useWiredPublishContentConfirm({ onCancel, t, criteria?, scope?, onPlanned?, confirmArmDelayMs?, port? }, {})`. Bind J13’s live port and the existing locale and refusal describer. Project the existing section table, criteria aliases, report wording/rewrites and drift message from the host `apps/website/src/features/publish-content/ui/` binding. If those values are private there, expose one deliberate host-owned `publishContentDialogPolicy` alongside the wrappers and export it from the existing host alias. Do not remove that alias from `apps/admin/{tsconfig.json:17,vite.config.ts:168,vitest.config.ts:93}` or change `App.hooks.ts`, deep links, section buttons, or planner tools. Use `performance.now()` only in the live binding.

Repoint `F/publish-content/{PublishContentDialog.tsx:10–12,PublishContentDialog.hooks.tsx:3}` during the transition. Neutral helper and controller tests go straight to the Jini leaf, giving it a test policy/port, at `E/{PublishContentDialog.unit.test.tsx:12,publish-content-L057.characterization.unit.test.tsx:5}` and `hooks/E/{use-publish-content-confirm-T4-03.characterization.unit.test.tsx:6,use-publish-content-confirm.guards.unit.test.ts:6,use-publish-content-confirm.hooks.unit.test.ts:3}`. Reconcile `development/scripts/size-debt.json:194,201`. Only the actual bound mount supplies defaults.

First host test `publish-confirmation.host-policy-parity.unit.test.tsx`. `M-use-unbound-entity-aliases` must fail on the same fixture through the existing host wrapper and the new controller.

### 101 — Jini · Publish confirmation dialog and report row · BUILDER: SOL · OPUS-REVIEW

Move `F/publish-content/{PublishContentDialog.hooks.tsx:7–82,PublishContentDialog.tsx:77–439}` to `cms:react/publish-content/` with the same filenames. Export `PublishContentReportRow({ row, view, t }, {})`, `PublishContentDialog`, and `PublishContentDialogProps`. The report-row `.tsx` helper can render as a normal React component with one props object, with its pure helper calls using 099’s args rule. Make `usePublishContentConfirmHook` required. The dialog takes the same input shape as 100, plus the injected `Dialog` component. At `:107` use conditional spreads for optional `port`, `criteria`, `scope`, `onPlanned`, and delay, not `{ key: undefined }`. At `:121–124` narrow the single peer via destructuring before reading `label`.

Keep the phase-derived control labels, pending/dismissible coupling, peer chooser, the form-recipient-local warning, report order, the separate include/overwrite controls, and non-selectable rows. Split any over-cap report group out of `:307–438`. Native domain dialog and report CSS remain loaded in Tovu. No default controller, store, or direct upload/execute path in this view.

First test `PublishContentDialog.distinct-consent-controls.unit.test.tsx`. `M-wire-overwrite-checkbox-to-inclusion` and `M-allow-close-while-executing`.

### 102 — Tovu · Bind the publish dialog at App chrome · BUILDER: SOL · OPUS-REVIEW

Create `F/publish-content/publish-content-dialog.binding.tsx` supplying 100’s hook, the native dialog kit slot, and existing styles. Repoint `App.chrome.tsx:12,242–248` and keep the conditional `openPublishRequest` mount, scope, criteria, resolve callback and close action. Omit the current `port={undefined}`. `App.tsx:55` is an import with no corresponding render in that file. Remove it rather than keeping a second mount. Repoint `F/publish-content/E/PublishContentDialog.unit.test.tsx:10,12` to neutral dialog and controller with explicit fake bindings, and update the `publish-content.css:2` source reference. Do not move `publishRequestStore` or `publishAvailabilityStore`.

First host test `app-chrome.publish-dialog.scope-and-result.unit.test.tsx`. `M-resolve-request-at-dialog-open` must fail before planning produces a result.

### 103 — Jini · Credential form rules, store projection, and controllers · BUILDER: SOL · OPUS-REVIEW

Move four inputs to `integrations:react/credentials/`:

- **Universal `access-token-forms.ts`.** Source `F/security/access-token-forms.ts:21,45,68,82,93,117,125,143`. Export its current eight named public rules/type entries, retaining the exact distinctions between missing, overwrite, field-only, rename-only, and new credentials. Use existing core security DTOs for publish/custom credentials. Keep source-control input’s `providerId`, token and declared string fields structurally identical to the existing `admin:source-control/api/source-control-api.types.ts:54`. `classifyAccessTokenSubmitError({ e, readApiFailure }, {})` returns `AccessTokenSubmitFailure`. `readApiFailure({ error }, {})` returns the recognized status/code/detail projection or `null`, never an arbitrary object cast to `ApiError`. Route the current publish/source-control builders and field/readiness helpers through typed collaborators from J15/J16. Preserve custom `worksFor` change detection and never emit an empty replacement merely because a box was untouched.
- **Universal `other-credential-stores.ts`.** Source `:7,26,93,101,121,130,139,154`. Export `OtherCredentialStoreId`, `OtherCredentialStoreInfo`, `otherCredentialStoreInfo`, `otherCredentialMatchesQuery`, `mediaProviderLabel`, `maskedTailFact`, `envNamesFact`, and `accessTokensCountText`. Move logic, not the host registry at `:51`. `otherCredentialStoreInfo({ id, stores }, {})` takes the ordered host list and preserves the original fallback behavior with an explicit guard. `mediaProviderLabel({ providerId, labelForProvider }, {})` retains the ID fallback. Keep mask/env facts presentation-only, and preserve the count and search projections.
- **Browser `hooks/use-access-tokens.hooks.ts`.** Source `:96–902`. Export `useAccessTokens`, `AccessTokenFormFields`, `AccessTokenExistingRowState`, `AccessTokenAddFormState`, `AccessTokenProviderGroupState`, `AccessTokenCustomAddFormState`, and `AccessTokensController`. Signature `useAccessTokens({ port, t, locale, deps }, {})`. Keep the existing narrow `publish`, `sourceControl`, `custom`, and discovery port members. Require query, refresh, and settlement hooks, error and draft-safe copy, category/order/row and provider projection, legacy default-label policy, descriptor localization, and the engine’s “works for” suggestion as structural collaborators. Split private initial reads (`:383–432`), refresh and row projection (`:462–540`), existing-row mutations (`:541–732`), add rows (`:734–815`), and custom creation (`:817–860`). Preserve load failures per store, stale-response ownership, version/ID-based update, reconciliation after removal/default promotion, and latest inventory attachments after a custom PUT.
- **Browser `hooks/use-other-credentials.hooks.ts`.** Source `:46–410`. Export `OtherCredentialRowState`, `OtherCredentialGroupState`, `OtherCredentialsController`, and `useOtherCredentials({ port, t, locale, filter, deps }, {})`, retaining the current query/category defaults in the host or in typed options according to today’s caller. `deps` requires the ordered stores, refresh/serial hooks, masked credential copy, provider-label resolver, and draft-safe refusal handling. Keep the `:126–174` per-store read projections and `:357–409` per-store replace/remove dispatch separate from query/UI state. Use the existing host-port members verbatim as structural signatures, not broad store access or capability inference. Preserve loading vs empty vs refused, immutable/env-only rows and store-specific clear payloads. For an indexed store reader use an exhaustive `Record<OtherCredentialStoreId, StoreReader>` only when all four ports are present; otherwise guard before invoking.

The existing Admin `security/controllers/*` and `security/react/tabs/AccessTokensTab.tsx` are the module-kit security surface. This cut ports the live row-controller behavior, including its mixed stores, plugin catalog and draft/reload sequencing. Do not replace it with that alternate module, create new HTTP routes, or duplicate `security` DTOs in Integrations.

First tests `access-token-forms.patch-fidelity.unit.test.ts`, `access-tokens.refresh-and-default.unit.test.tsx`, and `other-credentials.readonly-and-serial.unit.test.tsx`. `M-clear-token-on-rename`, `M-promote-stale-default`, and `M-allow-remove-env-only-row`.

### 104 — Tovu · Bind actual credential stores and controllers · BUILDER: SOL · OPUS-REVIEW

Move `useWiredAccessTokens:911` and `useWiredOtherCredentials:412` into their existing `F/security/hooks/{access-tokens,other-credentials}-dependencies.hooks.ts` beside the live and fake ports. Keep `OTHER_CREDENTIAL_STORES:51` in a real host registry module, with the exact links, permissions, store IDs and order. Bind catalog lookup, category/copy, `ACCESS_TOKENS_RESOURCE`, J15/J16 default labels and builders, `ApiError` classification, and draft redaction. Reuse current Jini `access-token-rows`, provider/form, media-catalog, and “works for” leaves via these collaborators. Do not re-export the entire rules/controller leaves from the binders.

Repoint these references under `F/security`:

- Forms `AccessTokensTab.tsx:18`, `hooks/use-access-tokens.hooks.ts:20`, `E/{AccessTokensTab.credential-flows.unit.test.tsx:7,rules.unit.test.ts:10}`.
- Store metadata/rules `AccessTokensTab.hooks.tsx:5`, `AccessTokensTab.tsx:20`, `OtherCredentialsSection.tsx:6`, `hooks/use-other-credentials.hooks.ts:12`, and `E/{AccessTokensTab.credential-flows.unit.test.tsx:10,AccessTokensTab.hooks.unit.test.tsx:7,OtherCredentialsSection.unit.test.tsx:7,rules.unit.test.ts:8}`. Store fixtures import the host list only when they are pinning the real list.
- Controllers `AccessTokensTab.hooks.tsx:8–9`, `AccessTokensTab.tsx:25–33`, `OtherCredentialsSection.hooks.tsx:4`, `OtherCredentialsSection.tsx:8`, `Security.tsx:16`, `E/{AccessTokensTab.credential-flows.unit.test.tsx:19–20,AccessTokensTab.hooks.unit.test.tsx:11–12,AccessTokensTab.unit.test.tsx:10–12,Security.unit.test.tsx:7,OtherCredentialsSection.unit.test.tsx:6,access-tokens-revoke-copy.unit.test.tsx:8–9}`, and `hooks/E/{use-access-tokens.unit.test.tsx:11,14,use-other-credentials.unit.test.tsx:8–9}`. `F/settings/E/built-in-mcp.unit.test.tsx:7` takes the neutral result type, not a security binder. Keep wire mocks aimed at the real live clients.

Rehome the refresh witness `hooks/E/content-refresh-coverage.unit.test.ts:61`. Reconcile `development/scripts/{error-gate-debt.json:148,153,158,size-debt.json:229,236}`. References to the old controller in deployment rules are rationale only.

First host test `credential-stores.binding-parity.unit.test.tsx`. `M-bind-remove-to-another-store` must fail for the particular port member and ID, even if the UI still closes.

### 105 — Jini · Access Tokens tab and other-credential rows · BUILDER: SOL · OPUS-REVIEW

Move the four inputs `F/security/{AccessTokensTab.hooks.tsx:28,61,107,171,AccessTokensTab.tsx:89–1070,OtherCredentialsSection.hooks.tsx:15,30,49,OtherCredentialsSection.tsx:41–end}` into `integrations:react/credentials/` with the same filenames.

- Export `RemoveConfirmDialogActions`, `AddCustomCredentialDialogState`, `MergedSecretsEntry`, `useRemoveConfirmDialog`, `useAddCustomCredentialDialog`, and `useMergedSecretsOrder`. Use the existing argument objects/pads and inject category ordering/filtering into the merged-order hook. `useRemoveConfirmDialog({ ref, row, controller }, {})` and the analogous `useOtherCredentialRemoveDialog` keep close-before-delete. Use a local DOM ref combined with the forwarded handle, or pass `closeDialog({} , {})` from the actual DOM owner as a required action, so both callback and object refs work without the current cast. Export `OtherCredentialRemoveDialogActions` and `rowHandleBase`. Preserve display handles versus storage/draft keys.
- Export `OtherCredentialEntry` with `{ store, row, controller, kit, copy, useOtherCredentialRemoveDialogHook }`, keeping `row: OtherCredentialRowState | undefined`. Deep links and delete copy are provided by the host. Preserve placeholder/static/replaceable branch order, disabled writes for non-replaceable rows, and distinct confirmation actions.
- Export `AccessTokensTab` and `AccessTokensTabProps`. Make locale, access-token, other-credential, copy-keys, remove-confirm, add-custom, merged-order, and tab keyboard hooks required at the components that call them. Pass kit controls, `CopyKeysDialog`/`CredentialHint` slots, existing category/visual/copy data, viewer zone, and link resolver. Split provider/row rendering (`:296–490`), fields (`:492–764`), add flow (`:767–830`), removal confirmation (`:837–887`) and custom dialog (`:948–end`). Preserve empty results versus store-load errors, searching across both tiers, last-row copy, write-only token input and the shared-key warning. No DOM/agent handle may expose raw token data. Host CSS stays loaded by the host.

First tests `AccessTokensTab.merged-filter-and-confirm.unit.test.tsx` and `OtherCredentialEntry.private-replace.unit.test.tsx`. `M-render-token-in-agent-label`, `M-delete-before-confirm`, and `M-discard-other-store-filter`.

### 106 — Tovu · Compose the credential tab with host visuals and copy · BUILDER: SOL · OPUS-REVIEW

Create `F/security/access-tokens-tab.binding.tsx`. Bind 104’s hooks, locale, existing chip field, BYOK/store hints, copy-keys hook/port, category and provider copy, router, viewer zone, styles and security visual kit. Respect J04’s credential hint and the existing `@jini-ai/admin/security/host/CopyKeysDialog` port. Wire `F/security/Security.tsx:13,192` to this mount until 108. Move internal edges from `AccessTokensTab.tsx:34–35` and `OtherCredentialsSection.tsx:9` into the Jini relatives. Repoint `F/security/E/{AccessTokensTab.credential-flows.unit.test.tsx:6,AccessTokensTab.hooks.unit.test.tsx:4,AccessTokensTab.unit.test.tsx:7,access-tokens-revoke-copy.unit.test.tsx:4,OtherCredentialsSection.unit.test.tsx:5}`. At `AccessTokensTab.hooks.unit.test.tsx:4` match the actual `.hooks` leaf, not the tab view. The input/autofill source pin at `F/users/E/Users.autofill.unit.test.tsx:16`, literal-copy pins `:288,295,302,309,316`, and hardwiring/size debt `development/scripts/{hardwiring-debt.json:34,size-debt.json:208,215,222}` follow the responsible owner. Cross-feature links to `/access-tokens` remain unchanged.

First host test `access-tokens-tab.binding.shared-key-copy.unit.test.tsx`. `M-omit-last-row-warning` must fail using the real bound copy.

### 107 — Jini · Live Secrets screen shell · BUILDER: SOL · OPUS-REVIEW

Move `F/security/Security.tsx:101–196` to `integrations:react/credentials/Security.tsx`. Export `Security` and `SecurityProps`. Do not replace this with the independent Admin `SecurityPage` module. `Security({ tabId?, useAdminLocaleHook, useSecurityPermissionsHook, kit, panels, copy, onTabChange })` takes required tab kit/icons, the required locale and permission hooks, and slots `AccessTokens`, `SiteKey`, `Totp`, `RecoveryCodes`, and `Passkeys`. Owner control slots accept the bound translator. The two domain-tab slots are real bound components, so no live hook or owner client is required inside Jini. `onTabChange({ nextTabId }, {})` preserves current navigation intent.

Keep `resolveSecurityTabId`’s permission-filtered valid IDs. When `canManageSiteKey` is false, the button and body are both absent and a direct `?tab=site-key` falls back to Access Tokens. Split tab construction from the header/render and keep owner cards in their original order ahead of the tabs. UI authority remains an affordance, not permission to invoke the underlying endpoint.

First test `Security.site-key-affordance.unit.test.tsx`. `M-trust-query-over-permission` must fail both on direct entry and after a permission downgrade.

### 108 — Tovu · Mount Secrets, owner controls, and Site key · BUILDER: SOL · OPUS-REVIEW

Create `F/security/security.binding.tsx` with `ownerMfaPort`, `ownerPasskeySettingsPort`, the existing `RecoveryCodesCard` and 106’s access-token mount. Supply the T14 site-key mount, including both hooks, reveal-copy policy, kit, and the existing permissions hook. Keep `navigateSecurityTab`, “Secrets” copy, and all owner client setup here. Repoint `panel-pages.ts:62` directly to the binder and remove `F/security/index.ts:7` if it has no remaining live exports. Keep `panels.tsx:1103`, where the query is projected into the lazy mount.

Repoint `F/security/E/Security.unit.test.tsx:5,7,9` to the appropriate neutral shell/bound panel. Update `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:47,200` and `panels-render.unit.test.tsx:184`. Preserve the visual journey `development/e2e/journeys/admin-visual.pins.journey.ts:130`. Do not retarget or flatten passkey/recovery tests into a generic tab test.

First host test `security.binding.owner-controls-and-gate.unit.test.tsx`. `M-mount-site-key-for-unprivileged-principal` must fail without asserting any server change.

### 109 — Jini · BYOK footer status rule · BUILDER: SOL · OPUS-REVIEW

Move `hooks/use-admin-execution-credential.hooks.ts:23,25–48` to universal `integrations:react/admin-credentials/byok-footer-status.ts`. Export `AdminByokSaveState` as the existing save-state shape or its type alias, and `resolveByokFooterStatusLine({ status, isStored, copy }, { storedKeyIsForOtherEndpoint = false } = {})`. `copy` has required `saving`, `saved`, `otherEndpoint`, `stored`, and `enterKey` strings or their equivalent bound message functions. The function takes no token or masked key. Keep precedence saving → saved → non-idle silent → other endpoint → stored/unset.

Do **not** move a second credential controller. `ui:features/execution/react/hooks/use-execution-credential.hooks.ts:410` already owns save, refresh and draft clearing. The remainder at `:68–120` is a real host adapter, not a package forwarder. Do not add a new endpoint-matching rule or import the host bus from Jini.

First test `byok-footer-status.endpoint-precedence.unit.test.ts`. `M-show-stored-for-other-endpoint`.

### 110 — Tovu · Keep write-only BYOK wiring local · BUILDER: SOL · OPUS-REVIEW

In `hooks/use-admin-execution-credential.hooks.ts`, keep the port memoization, host error mapping and `executionCredentialEffects:82–96`. Convert `useAdminExecutionCredential(input, port)` at `:98` to `useAdminExecutionCredential({ input, port, useExecutionCredentialHook }, {})`; the host supplies the existing UI hook. `useWiredAdminExecutionCredential(input, {})` binds locale, port and hook. Keep `AdminExecutionCredentialController` and `UseAdminExecutionCredentialInput` beside this real binder. Bind translated footer strings at `C/AdminByokKeyPanel.tsx:9` or J04’s existing host footer wrapper. In `C/E/AdminByokKeyPanel.unit.test.tsx:11,17`, import the neutral status helper/type directly if used and preserve the real footer-copy test.

Audit the remaining binder import sites for the object signature and keep them on the host module: `C/E/agent-handle-batch1.unit.test.tsx:10`, `F/ai-assistant/AiAssistant.tsx:44`, `F/ai-assistant/E/{AdminExecutionMode.unit.test.tsx:1,23,AiAssistant.unit.test.tsx:2,byok-no-key-message-i18n.unit.test.tsx:2}`, `F/settings/{SettingsUi.tsx:125,E/SettingsUi.unit.test.tsx:23}`, `hooks/E/{tovu-execution-entry-points.integration.test.tsx:10,use-admin-execution-credential.hooks.test.ts:39}`, and `panels.tsx:19`. If A1 relocated a caller, provide the hook at its host entry. Do not make `useExecutionCredential` hydrate plaintext or clear legacy storage on a failed save.

First host test `admin-execution-credential.binding.refused-save.unit.test.tsx`. `M-clear-legacy-on-refusal`.

### 111 — Jini · Settings ledger tab projections · BUILDER: SOL · OPUS-REVIEW

Extract `lib/settings-tabs.ts:35–169,173–255,259–261,266–321,326–368` into universal `admin:shell/lib/settings-tabs-ledger.ts`. This is shared ledger behavior within Admin, with no UI or domain runtime dependency. Export `createSettingsTabsLedger`, `AppearanceConfig`, `InterfaceConfig`, and the six namespace constants. Export `adminThemeAccent` and `withAdminThemeAccent` with their existing object inputs/pads plus a required `normalizeAccentColor` where the old implementation uses it. Use the existing structural kit types for notification and privacy shapes. Keep the host locale list out of Jini.

`createSettingsTabsLedger({ ledger, defaults, effects }, {})` returns `loadInstructions`, `loadNotifications`, `loadPrivacy`, `loadAppearance`, `loadLanguage`, `loadInterface`, and corresponding `save*` methods. Loads take `({}, {})`. Saves take `({ next, previous }, {})` with their exact tab types. Reuse Admin’s `core:ledger-slice.ts` readers and inject its bound load/diff-write calls. `defaults` includes instructions, notifications, privacy, appearance, interface, and locale. Keep per-field parsing, scope choices, JSON comparison for the optional theme accent map, and partial updates. `effects` requires `normalizeAccentColor`, `withdrawMetricsLive({}, {})`, and `onPersistedMetrics({ enabled }, {})`. In `savePrivacy`, call withdrawal **before** any durable write on a true→false transition, write metrics first, notify only when its key was written, and write the rest afterward. The denial marker and DOM event implementations stay host-side. Preserve `0` and `""` as the two privacy absence sentinels.

First tests `settings-tabs-ledger.scope-and-appearance.unit.test.ts` and `settings-tabs-ledger.withdrawal-order.unit.test.ts`. `M-signal-grant-before-ledger-write`, `M-delay-live-withdrawal-until-success`, and `M-erase-unmentioned-theme-accents`.

### 112 — Tovu · Bind settings defaults and live preference effects · BUILDER: SOL · OPUS-REVIEW

`lib/settings-tabs.ts` remains a **real binding**, not a re-export shell. Construct the 111 factory with `lib/ledger-slice.ts:11–18`, the exact current default values, injected accent normalization, and the present window/localStorage code from `:308–318`. Keep `classic`, the current accent defaults, `ADMIN_LOCALES`, locale policy and DOM painting in Tovu. Keep the withdrawal marker value and event semantics. Do not emit a grant because the marker could not be read or cleared. Adapt existing positional host callback contracts with closures at this binding where callers take them, instead of threading a new signature into theme implementations. Import `AppearanceConfig`/`InterfaceConfig` and namespace constants directly from 111 where consumed. Use `@tovu/contracts/admin-locales` directly for locale catalog consumers.

Importer ledger for the mixed binding:

- Live settings/defaults: `F/settings/{SettingsUi.tsx:115,AdminAppearance.tsx:12,hooks/use-admin-appearance-settings.hooks.ts:6,hooks/use-settings-ui.hooks.ts:34,hooks/use-user-interface-tab.hooks.ts:1}`, `F/sites/hooks/use-site-list-prefs.hooks.ts:13`, `hooks/{admin-locale-dependencies.hooks.ts:1,use-admin-appearance.hooks.ts:4,use-admin-appearance-snapshot.hooks.ts:9,use-interface-preferences.hooks.ts:3,13}`, `admin-themes/use-admin-theme.hooks.ts:16`, `C/Placeholder.tsx:6` or its T05 binder. For `AdminAppearance.tsx`, bind the pure accent functions at the call site; for the theme port keep real `loadAppearance/loadInterface/saveAppearance/saveInterface` functions. `hooks/use-admin-locale.hooks.ts:26` is a rationale link.
- Tests: `__tests__/unit/{app-chat-dock-seam.unit.test.tsx:12,app-confirm-dialog-i18n.unit.test.tsx:38}`, `admin-themes/E/use-admin-theme.hooks.unit.test.tsx:3`, `F/{admin-themes/E/AdminThemes.unit.test.tsx:4,integrations/E/integrations-i18n.unit.test.tsx:4}`, `F/settings/E/{AdminAppearance.unit.test.tsx:6,15–16,152,SettingsUi.unit.test.tsx:41,43–44,UserInterfaceSettingsPanel.unit.test.tsx:5,ai-agent-card-presentation.unit.test.tsx:6,ai-agent-locales.unit.test.ts:3}`, `F/settings/hooks/E/use-settings-ui.unit.test.ts:23–24`, `F/skills/E/{skill-install-i18n.unit.test.tsx:4,skills-page-i18n.unit.test.tsx:4}`, `F/webmcp/E/browser-agent-settings.unit.test.tsx:7`, `hooks/E/{tovu-execution-entry-points.integration.test.tsx:13,use-admin-appearance.tw2-pin.test.ts:3,use-admin-appearance.unit.test.ts:8,12,use-admin-document-locale.unit.test.ts:3,use-interface-preferences.hooks.test.ts:4}`, and `lib/E/{settings-effective-reads.integration.test.ts:6,settings-privacy-live.unit.test.ts:6,settings-tabs.test.ts:60}`. Keep mocks of live setters on the binding and repoint only type/pure imports. Dock comments at `C/AssistantDock/AssistantDock.tsx:130` and `hooks/dock-chrome.hooks.ts:101` are rationale, not extra loading paths.

First host test `settings-privacy-live.bound-withdrawal.unit.test.ts`. `M-treat-denial-marker-as-consent` must fail on reload. Retain the website `admin-interface.unit.test.ts:108` drift witness.

### 113 — Jini · Non-secret execution configuration ledger · BUILDER: SOL · OPUS-REVIEW

Extract `lib/execution-settings.ts:80–112,216–251,264–532`, excluding the host default preset at `:252`, to universal `admin:shell/lib/execution-settings-ledger.ts`. Export `EXECUTION_NAMESPACE`, `hasUsableAdminKey`, `hasTypedAdminKey`, `readExecutionMode`, `readByokProtocol`, `readByokProviderId`, `buildByokConfigFromLedger`, `buildLocalCliConfigFromLedger`, `selectedLocalCliModel`, `selectedLocalCliReasoning`, `reconcileExecutionConfigRefresh`, and `createExecutionSettingsLedger`. No React, browser storage, provider catalog, client, or log sink dependency. Use core `ExecutionConfig` and `ByokConfig`.

`createExecutionSettingsLedger({ port, defaults, isUnregisteredNamespace, reportRestoreFailure }, {})` returns the live-independent `loadExecutionConfig({}, {})` and `saveExecutionConfig({ next, previous }, {})`. The port reads an effective namespace as `{ key: string; value: unknown }[]` and writes `{ namespace, key, scope, valueJson }` with `{}`. `selectedLocalCliModel({ config }, {})`, its reasoning twin, and `reconcileExecutionConfigRefresh({ current, loaded }, {})` use named inputs. Keep key order, projection `apiKey: ""`, `0` as unset max tokens, selected-agent-only round trips, and user scope of `localCli.*` distinct from workspace scope of the other keys. The refresh projector preserves the current in-memory typed key **without** giving it to the diff writer. Only a classified unregistered namespace falls back to defaults. Reverse-restore only successful keys on partial failure. Index by key and check `previousValues.has(key)` before reading. Report restore failures through the injected classifier/sink and rethrow the original write failure, never the rollback failure.

First tests `execution-settings-ledger.no-secrets.unit.test.ts` and `execution-settings-ledger.partial-rollback.unit.test.ts`. `M-write-api-key-to-ledger`, `M-write-local-cli-at-workspace-scope`, and `M-rollback-in-forward-order`.

### 114 — Tovu · Bind execution settings and audit all entry points · BUILDER: SOL · OPUS-REVIEW

`lib/execution-settings.ts` retains the live namespace binding, `DEFAULT_EXECUTION_CONFIG:252`, host credential-only reads/writes `:194–214`, legacy `localStorage` access `:118–172`, and the existing `createExecutionHttpAdapter:535` singleton. Keep `createExecutionPort:543` and `resetLocalAgentDetectionCache:547` on that actual binder. Pure `CreateExecutionPortOptions` users can import the type from its existing UI owner. Bind the settings client envelope guard, the existing 404-only fallback and scrubbed rollback logging. Export real bound load/save functions where existing host callback ports require them, using closures to project positional host inputs to Jini’s named objects. The host default keeps the exact deployment preset and initial Local CLI selection. Code in Jini sees neither a storage key nor the preset source.

Repoint pure imports and keep live ones on the binding at these merge-tip sites. For A1-moved dock code, wire the new pure rule or live port at its Tovu composer rather than importing back into Jini.

- Dock `C/AssistantDock/{AssistantDock.state.hooks.ts:31,DockChatPane.tsx:21,execution-config-write.ts:6,hooks/assistant-transport.binding.ts:5,hooks/byok-runtime.hooks.ts:7,hooks/execution-config-ledger.hooks.ts:9,hooks/execution-config.hooks.ts:10}` and dock `E/{agents-loader.unit.test.ts:4,composer-send-stop.integration.test.tsx:4,conversation-title-editor.unit.test.tsx:4,daemon-starting-label.integration.test.tsx:10,dock-conversation-deep-link.integration.test.tsx:4,execution-config-write.unit.test.ts:5,6,11,local-cli-selection-persistence.unit.test.ts:2,run-start-failure.integration.test.tsx:4,use-selected-agent-auth-warning.hooks.unit.test.tsx:6}`.
- `C/E/{AssistantDock.chat-settings.unit.test.tsx:15,AssistantDock.execution-refresh.unit.test.tsx:11,AssistantDock.hooks.unit.test.tsx:25–26,119,AssistantDock.load-recovery.unit.test.tsx:21–22,43,AssistantDock.runtime-access.unit.test.tsx:26,AssistantDock.unit.test.tsx:70}`. `vi.mock`/`importOriginal` for `loadExecutionConfig` or adapter reset still point at the real binder.
- `F/ai-assistant/{AiAssistant.hooks.ts:4,AiAssistant.tsx:45,api/ai-assistant-api.ts:14,hooks/use-admin-execution-mode.hooks.ts:11,hooks/visitor-credential-form-dependencies.hooks.ts:14,E/AdminExecutionMode.unit.test.tsx:26}`. Keep the execution request wire type from its owner and `aiAssistantApi` credential calls local. `api/ai-assistant-api.ts:104,117` and `E/use-visitor-credential-form.unit.test.ts:29` are rationale references.
- `F/settings/{SettingsUi.tsx:119,hooks/use-settings-ui.hooks.ts:11,E/SettingsUi.unit.test.tsx:25,E/ai-agent-card-presentation.unit.test.tsx:5,E/ai-agent-presentation.unit.test.tsx:5,hooks/E/use-settings-ui.unit.test.ts:19–20}`, `hooks/{admin-execution-credential-dependencies.hooks.ts:1,use-admin-execution-credential.hooks.ts:11,use-tovu-execution-adapters.hooks.ts:5}`, `hooks/E/{tovu-execution-entry-points.integration.test.tsx:12,use-tovu-execution-adapters.unit.test.tsx:5,use-tovu-execution-policy.unit.test.tsx:3}`, and `lib/E/{execution-provider-catalog.unit.test.ts:8,execution-settings.test.ts:91,settings-effective-reads.integration.test.ts:5}`. Split the combined import in the credential hook so `hasTypedAdminKey`/namespace are neutral and storage operations remain host-bound. Do not repoint the website assistant routes just because their comments mention this file. Preserve the server-registration parity test and vendor-policy pins.

First host test `execution-settings.binding.nonsecret-ledger-and-rollback.unit.test.ts`. `M-send-raw-rollback-error` and `M-use-provider-form-save-to-write-key`.

### 115 — Jini · Settings page layout, tab chrome, and locale bridge · BUILDER: SOL

Split `F/settings/SettingsUi.tsx:143,197–231,321–597,633–674,717–754` at the generic page layout and tab composition. Create `admin:react/settings/SettingsPageLayout.tsx`. Export `SettingsPageLayout`, `SettingsPageLayoutProps`, and `SettingsAboutPanel`. Move the `TabIcon`/tab framing and the tab descriptors’ icon/ordering decisions with the layout. The descriptor slots are the existing order `execution`, `instructions`, `notifications`, `privacy`, `language`, `interface`, `memory`, `workspace`, `about`. Each takes the current label, handle label where present, and a panel node from the host. Build descriptors in small private groups rather than a 270-line render function. No execution, workspace, memory, browser-agent or theme policy imports in Admin.

`SettingsPageLayout({ loading, locale, loadError, save, tabId, tabs, kit, themeBoundary, rootRef, rootDataAttributes, dictionaries, fallbackLocale, useSettingsLocaleSyncHook, onTabChange, copy })` takes the existing structural tab/save/kit contracts. `locale` is `string | null`. Preserve the initial independent-slice loading gate; before `I18nProvider` mounts narrow locale and use the host fallback if absent, never a cast. Keep `syncDocumentAttributes={false}`, the required locale-sync hook in the mounted child, `settings-page` styling hook, alert/status live regions, inline-only chrome, no fullscreen, and the explicit unknown-tab check. In JSX omit `activeTabId` when `requestedTabId` is absent. Keep the report of saved defaults when there is a load error. `SettingsAboutPanel({ versionLabel, hint, t })` renders the existing card without owning either product/version string. `SettingsExecutionPanel:676–715` remains a host-provided body.

First test `SettingsPageLayout.loading-locale-and-tab.unit.test.tsx`. `M-show-fallback-tab-during-loading` and `M-write-document-locale-from-nested-provider`.

### 116 — Tovu · Bind Settings slices, tab bodies, and legacy deep links · BUILDER: SOL

`F/settings/SettingsUi.tsx` remains the actual composition, with `useSettingsUi`, locale translators, `useAdminThemeBoundary`, active-tab scroll, execution/credential/agent policy adapters and the current body slots. Build the host tab inputs from the existing slices and pass them into 115, splitting construction into ordinary helpers with no conditional hook calls. Keep `data-tovu-local-cli`, `SETTINGS_EXECUTION_PRODUCT_VARS`, `ADMIN_LOCALES`, version/copy, and current memory read-only behavior in the host. Bind `createSettingsTabChange({})` to the neutral `onTabChange({ tabId }, {})` seam. Keep `?tab=skills` → `/addons/skills` and `?tab=appearance` → `/admin-ui?tab=appearance` as replace navigation at `:290–294`. Workspace still has no second page header. No changes to save, authorization or secret handling in this sheet.

`F/settings/index.ts:9`, `panel-pages.ts:36`, and `panels.tsx:1179` keep the existing lazy host boundary. The settings barrel still owns the actual `AdminAppearance` export consumed by `F/admin-ui/AdminUi.tsx:9`. `F/settings/E/SettingsUi.unit.test.tsx:9` and `hooks/E/tovu-execution-entry-points.integration.test.tsx:7` stay on the live composition. Render just the new neutral leaf for layout-only cases. Preserve `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:34,65` and `panels-render.unit.test.tsx:185`. Update `lib/E/fixtures/admin-literal-copy.baseline.json:337,344`, `development/scripts/size-debt.json:243`, and `development/why-comments-debt.json:9710` against the actual relocated sections. `App.chrome.tsx:94`, `F/ai-assistant/AiAssistant.tsx:134,177,319,716,790,893`, its execution hook at `:19,35`, and `lib/app-version.ts:2` are rationale references, not new layout importers.

First host test `SettingsUi.bound-tabs-and-legacy-links.unit.test.tsx`. `M-reopen-settings-as-modal` and `M-push-instead-of-replace-legacy-tab` must fail without touching the existing execution setup.
