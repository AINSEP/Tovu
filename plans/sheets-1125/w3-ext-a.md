SHEETS ADMIN PARTIAL: 40 sheets (20 Jini / 20 Tovu), 38 OPUS-REVIEW, 67 files move

| Disposition | Files | Basis |
|---|---:|---|
| MOVE candidates | 176 | 155 from `r62t-count2-a.md` and 21 `a/` entries from `r62t-count1124.md`. No overlap. Website `admin-http` is outside this ADMIN browser job. |
| Absent at merge-23 | 34 | 33 have a Jini successor. `SourceControl.tsx` was replaced by the Jini shell plus a renamed Tovu mount. |
| Present, behavior already in Jini | 15 | Live bindings, test support, or duplicate implementations. No second extraction. |
| Sheeted | 67 | Counts each source once, including splits that leave a real host binding. |
| NOT-SHEETED | 60 | Listed at the end. No builder should infer a move from a ledger verdict alone. |

Anchors are Tovu `bf1519bba7329e0637eee4a6600dbdaba48f83db` and Jini `ad71bf68dee9907ce4db8fe86dcb8d1ffd06e8ba`, both matching the local merge-23 remote-tracking refs. The checkout was read-only. No tests, builds, installs, type-checks, generators, or writes ran. The lookup cap was not reached. This is partial because the remaining files did not get builder-ready seams and importer instructions within the deliverable limit.

### Rules for every sheet

- Tovu paths below are relative to `apps/admin/src/` unless rooted explicitly. `F/` means `features/`, `C/` means `components/`, and `E/` in an importer list means `__tests__/` **under the directory prefix given for that list**. Jini `pkg:path` means `packages/pkg/src/path`. An importer listed against a source uses that source’s new leaf for moved symbols and the specified host binding for live symbols. Retain `.js` on Jini relative imports. Drop `.tsx?` on package specifiers.
- Recheck both tips before editing. For each mapped file, refresh the listed anchors with `git grep -n -F -e "/<filename-without-extension>" HEAD -- apps packages development`. Resolve relative and `@/` imports against the importer. Include dynamic imports, `vi.mock`/`importOriginal` paths, source pins, and `?raw` imports. Follow named feature barrels to their lazy consumers. The lists below are the merge-23 repoint ledger, including tests and relevant source-path pins. Imports between files moved together become relative Jini imports. Replace path pins with a source pin on the new owner or a behavior pin of equal strength. Delete a former source or barrel only once no host behavior or importer remains.
- For each Jini destination below, add the exact leaf `./<path relative to src, without extension>` to that package’s `package.json` `exports`, with `types`, `import`, and `default` pointing to the corresponding `dist` files. An explicit existing entry or exception below wins. Mirror the entry in `jini.entries`, `typesVersions` where used, and the package’s existing boundary capability map where it enumerates leaves. Browser for React or browser I/O, universal for neutral types, pure rules, and request-injected clients. React leaves must not pull server barrels into the browser. If a new React entry needs a peer, use the repository’s optional React peer pattern and matching dev types. No domain dependency goes into `@jini-ai/admin`.
- Each J sheet adds `.changeset/admin-extraction-<NN>.md` with a minor for its listed package or packages. Record the exact new leaves and added symbols against `api-baseline/jini-ai__<package>.json`. For an existing public leaf, record just the added exports. Opus owns generated baseline updates and `api:check`. Each T sheet has **no Tovu changeset or API baseline delta**. Use the corresponding Jini exports against the linked source tree and record any manifest range change for release integration. Sol does not depend on an Opus-generated baseline or published package.
- Write the named test and mutation witness before production edits. Existing tests keep their assertions. The mutations are temporary instructions for verification, not committed changes. Every builder is Sol. Opus runs verification afterward, with the marked security-sensitive seams reviewed explicitly.
- Copy decision bodies and why-comments intact. Change imports, signatures, and argument projection at seams only. Use the host’s existing kit from `integrations/jini-kits.ts` with `AdminKitProvider` where applicable. Across package boundaries pass the needed kit components, values, and hooks as required, structurally typed props. No default custom hook in a moved component. `Empty` below is `Record<string, never>`. For new public APIs use `(required, _optional: Empty = {})` unless a typed options object is named. Keep existing pads. Preserve omitted properties via conditional spread, use explicitly undefined-capable required fields when a slot must always exist, and narrow indexed reads. No `any`, non-null assertions to placate strict TS, or expansion of an existing trust boundary. Cap functions at 80 lines and complexity at 10.

## Jini build order

### J01 — Shared deployment contracts · BUILDER: SOL · OPUS-REVIEW · 3 files

`F/deployment/api/publish-destination.types.ts:6`, `hooks/static-export-port.hooks.ts:8`, `hooks/static-publish-port.hooks.ts:7` → `core:contracts/site/deployment-admin.ts`.

Copy the static and deploy variants as `StaticDeploymentDestination` and `DeployRunDestination`. Export `DeploymentDestination<Peer extends { kind: string }> = StaticDeploymentDestination | DeployRunDestination | Peer`. Keep the target an open string and preserve optional `credentialId`, `statusMessage`, and `linkedPeerId` exactly. The literal `tovu-peer` belongs to Tovu. This is not `PublishDestinationView` in `cms-publish-content.ts:122`.

Copy `StaticExportPort` using core’s existing `ExportRunSnapshot` at `contracts/site/export-run.ts:23`. For `StaticPublishPort<Target, Config extends object, Preview, Run>`, substitute the four type parameters for the four Admin-package types in the original interface, retaining object inputs and options. Do not change any wire request. The host can specialize the port without the core package depending on the admin kit.

First tests `deployment-admin.contract.test.ts` and `publish-destination-wire-parity.unit.test.ts`. Pin all three host discriminants and omitted `credentialId`. `M-drop-deploy-linked-peer` removes that field from the live response fixture and must fail parity.

### J02 — Browser telemetry, reconnect, settings feed · BUILDER: SOL · OPUS-REVIEW · 3 files

- `lib/browser-telemetry.ts:32,58` → `admin:browser/telemetry.ts`, already exposed by `admin:browser/index.ts:19`. Add `toAdminRouteTemplate({ routePath, params, base }, {})` and `reactRootErrorOptions({ telemetry, logError }, {})`. Leave collector behavior alone. Accept `componentStack?: string | null` from React and omit it from the report when nullish. Strip query and fragment before templating. Do not add full URL, form, or DOM capture.
- `lib/server-reconnect.ts:24,55,113,129` → `admin:browser/server-reconnect.ts`. Move the state machine and retry decision. `shouldRetryAfterReconnect(input, {})` keeps the five existing fields. `probeReadyz({ request, url, timeoutSignal }, {})` keeps the existing ready-boolean test and failure fallback. Vite mode, header/value, clocks, browser singleton, and `/readyz` URL stay host-side. Preserve synchronous listener reentry joining the already-published poll.
- `lib/settings-events.ts:56,106` → `admin:browser/settings-events.ts`. `subscribeToSettingsChanges({ workspaceId, principalId, open, ports, activity, urlFor, publishSettings, warn }, { supplemental } = {})`. Use the existing structural `BrowserStreamPorts` and `StreamActivity`. `urlFor({ workspaceId, cursor, supplementalRevision })` returns the complete URL. Optional `supplemental` is `{ event: string; consume(required: { data: string }, optional?: Empty): string | undefined }`. The host owns supplemental decoding and publishing. Update its cursor only for a returned revision. Extract `receiveSettingsFrame` from `:75–102` and use a `SettingsFeedState` record for both callbacks. Do not share a feed across principals or close it on a native reconnect.

First tests `browser-adapter-parity.unit.test.ts`, `settings-feed-principal.unit.test.ts`. Pin joined polling, no ambiguous write retry, route-only telemetry, and independent revision replay. Mutations `M-retry-ambiguous-write`, `M-share-settings-across-principals`, `M-keep-telemetry-query`.

### J03 — Durable browser transport and routed A2UI · BUILDER: SOL · OPUS-REVIEW · 2 files

`lib/durable-run-subscription.ts:28,42,52` → `chat:transports/http/browser-durable-subscription.ts`. Export `browserDurableSubscriptionPorts({ request, open, schedule, runPath }, {}): DurableSubscriptionPorts`. `runPath({ runId }, {})` returns the already-encoded run base. Keep same-origin credentials, bodyless 304, terminal 404, per-message-or-run ETag, reset on explicit recovery, and native stream drop vs named error-frame split. Keep transport-independent `followDurableRun` on its existing entry. Do not move Tovu’s map, run notices, or page-activity callback.

`C/AssistantDock/RoutedA2uiSurfaceCard.tsx:61,71` → `chat:react/components/RoutedA2uiSurfaceCard.tsx`. Public export `./react/components/RoutedA2uiSurfaceCard`. Existing `A2uiSurfaceCardProps` plus required `SurfaceCard`, `useTHook`, `useRoutedA2uiSurfaceCardHook`, and `useChartRegistryHook`. Derive the route hook’s return contract from exactly the six destructured values at `:77–83`, not the bus implementation. Separate injected fields from forwarded surface props. Retain inline refusal and portaled dismiss behavior. CSS stays at the host renderer mount.

First tests `browser-durable-subscription.unit.test.ts` and `RoutedA2uiSurfaceCard.routing.unit.test.tsx`. Mutations `M-use-checkpoint-etag-on-recover` and `M-portal-live-refusal`.

### J04 — Credential hints and BYOK chrome · BUILDER: SOL · OPUS-REVIEW · 2 files

`lib/credential-copy.ts:8,19` → `integrations:react/credentials/credential-copy.ts`. Keep existing `storedCredentialHint` input fields and require `formatHint` alongside `stored`. Keep `locale` in options. `credentialDraftError({ value, assertToken, describeTokenError }, { locale, required = false } = {})` uses `describeTokenError({ error, locale }): string | undefined`. An unrecognized exception is rethrown unchanged. The host injects its real validator and its existing `CredentialInputError` classifier. Never trim the draft or reconstruct a stored token from the hint.

`C/AdminByokKeyPanel.tsx:46,62,99,120,152,179,198` → `integrations:react/admin-credentials/AdminByokKeyPanel.tsx`. Keep all four function names. Make `useAdminLocaleHook: () => string` required on the three components. Replace the shell translator import with required `createTranslator({ locale }, {})` typed to its consumed lookup result. Project each controller with `Pick` of the actual controller members read by that view, preserving their argument and result types. No dependency on the incomplete extraction of `use-admin-execution-credential.hooks.ts`. `resolveByokSettingsStatusLine` keeps its status and options signature.

First tests `credential-copy.fidelity.unit.test.ts` and `AdminByokKeyPanel.status.unit.test.tsx`. `M-trim-secret-before-validation` and `M-show-mask-for-other-endpoint`.

### J05 — Shell placeholder and appearance arbitration · BUILDER: SOL · 2 files

`C/Placeholder.tsx:45,60,96,100,161` → `admin:react/shell/Placeholder.tsx`. Add required `navGroups: readonly { label?: string; items: readonly AdminNavItem[] }[]` to `findNavGroupLabel` and the private `findNavItem`. `Placeholder` takes existing props plus required `navGroups`, `translateNavLabel`, and `copy`. `ComingSoonNotice` takes the existing props plus `copy`. `copy` supplies fallback locale, unknown-section prefix and observable label, default group label, and the coming-soon description and observable label. Move the matching and markup, not the host dictionaries. Keep `useAdminLocaleHook` required.

`hooks/use-admin-appearance.hooks.ts:21,56,90` → `admin:react/shell/appearance.ts`. Add `createAppearanceDraftStore({}, {}): WeakMap<HTMLElement, Map<string, { accentColor: string | undefined; version: number }>>`. Both hooks require the same store and root. `useAdminAppearance` also takes `port`, `useThemeStateHook`, `useAppearanceSnapshotHook`, `useInvalidateHook`, `paintAccent`, `resolveAccent`, and `queryPrefix`. `useSettingsAppearance` takes its existing `accentColor` and `ready` plus `useThemeStateHook`, `advancePreview`, and `paintAccent`. Keep `:34–52` and both theme CSS and DOM defaults in Tovu. Use one generic snapshot payload type for the injected reader and resolver.

First tests `Placeholder.two-hosts.unit.test.tsx` and `appearance-arbitration.unit.test.tsx`. `M-retire-newer-appearance-draft` changes the version comparison and must fail the in-flight preview witness.

### J06 — Files client and publish deep link · BUILDER: SOL · OPUS-REVIEW · 2 files

`F/fs-files/api/fs-files-api.ts:9–25` → `cms:react/fs-files/fs-files-api.ts`. `createFsFilesApi({ request, workspaceId }, {})` returns the five original methods. The generic request takes `{ path; method; body? }` plus optional host options. Keep `path: null` on cancel and clear. Native folder picker, its 409 classification, Electron bridge name, and `folderDropDeps` remain host-owned.

`lib/publish-criteria-deep-link.ts:24–58` → `cms:react/publish-content/publish-criteria-deep-link.ts`. `takePublishCriteriaFromQuery<T>({ location, history, parameter, decode }, {}): T | null`, with the existing `Pick<Location, …>` and `Pick<History, …>`, and `decode({ raw }, {}): T | null`. Preserve absent vs invalid, all other parameters, hash, and exactly one `replaceState` when present.

First tests `fs-files-api.wire.unit.test.ts` and `publish-criteria-deep-link.consume.unit.test.ts`. `M-send-custom-root-clear-as-put` and `M-keep-invalid-publish-query`.

### J07 — Skills browser client and controllers · BUILDER: SOL · OPUS-REVIEW · 4 files

`F/skills/{api.ts:8, use-skill-files.hooks.ts:14,28,55, use-skill-install.hooks.ts:9, use-skills.hooks.ts:139}` → `agentic:react/skills/`, same filenames.

- `createSkillsApi({ request, workspaceId, notifyChanged, formatDraft, invalidGuidanceError }, {})`. Keep core `SkillInstallPayload` and `InstalledSkill`. `installSkill({ payload }, {})` retains `confirmed: true` and notifies only after acceptance. Preserve list/file/guidance routes and patch/delete payloads.
- `useSkillFiles` adds `useFetchQueryHook`, `packageFilesRead`, `packageFilesViewState`, `describeFailure` to its required args. `useSkillFilesModal` adds required `read`, `useSkillFilesHook`, and `FailureNotice`, with `t` still in options. Narrow selection once with `selection !== null && selection.toolId === toolId`. Do not construct `headerExtras: undefined` for an optional field.
- `useSkillInstall({ installSkill, prepareSkillUpload, describeFailure }, { onInstalled } = {})`. Copy the generation and confirmation lock. `useSkills({ port, t, queryHooks, subscribeChanged, useSkillInstallHook, useSkillConfirmationHook, useSkillsTabsHook, describeFailure }, {})` keeps the current controller. `queryHooks` is the four existing fetch-query functions. Extend `useSkillsList`, `useSkillsReload`, and `useSkillChanges` arguments with just the collaborators they use. Emit `sourceUrl` and `shortCommit` only on the non-uploaded arm if the row type makes them optional.

First tests `skills-client.wire.unit.test.ts`, `skills-install-generation.unit.test.tsx`, `skills-reload-after-write.unit.test.tsx`. `M-install-before-confirm` and `M-allow-superseded-upload-read`.

### J08 — Plugin install transports and installed-skills projection · BUILDER: SOL · OPUS-REVIEW · 3 files

`F/plugins/installed-skills-composer-source.ts:33,47,78,112` → `agent-plugins:react/installed-skills-composer-source.ts`. `createInstalledSkillsComposerCapabilitySource({ request, path, isNotModified, reportFailure }, {})`. Give the request the existing narrow `{ path, method }` and `{ headers, onOk }` shapes. The source and leaf define their existing capability return shape structurally. Inject host status discrimination and error sink. Keep force generation, 304 retaining the last good snapshot, invalid-body refusal, abort silence, and no guidance bodies in the cache.

`F/plugins/hooks/agent-plugin-install-dependencies.hooks.ts:7–17` → `agent-plugins:react/agent-plugin-install-port.ts`. `createAgentPluginInstallPort<Result>({ request, workspaceId, digest }, {})` returns `installZip` and `sha256` with the original input objects. Copy `expectedSha256`, `replace`, and update-only `expectedOldDigest`, and leave crypto invocation at the host.

`F/plugins/hooks/plugin-install-dependencies.hooks.ts:5–16` → `plugins:react/plugin-install-port.ts`. `createPluginInstallPort<Preview>({ request, workspaceId }, {})`. The original `source` union selects folder JSON vs zip MIME. Preserve the preview suffix and `expectedDigest` behavior. For both install leaves keep the existing request results and port shapes through the generic parameter, with `satisfies` at the host. The fake ports constructing host `ApiError` stay with host tests.

First tests `plugin-install-transport.wire.unit.test.ts` and `installed-skills-snapshot.unit.test.ts`. `M-drop-expected-old-digest`, `M-use-unconfirmed-replacement`, `M-stale-skill-refresh-wins`.

### J09 — Webhook screens and controller · BUILDER: SOL · OPUS-REVIEW · 5 files

`F/integrations/` → `integrations:react/webhooks/`, same paths for `rules.ts:28,48,77,102,119`, `hooks/use-integrations.hooks.ts:54,84`, `hooks/use-integration-deliveries.hooks.ts:36,45`, `Integrations.tsx:21,134`, `IntegrationDeliveries.tsx:14,23`.

Rules keep the scoped keys and parsing. Add `translate` to row-menu args, `viewerTimeZone` to `displayTimestamp({ delivery, viewerTimeZone }, {})`, and `describeApiError` and `translate` to `visibleIntegrationsError`. Preserve its toggle-then-delete-then-initial-list precedence. Hooks keep current args plus `describeApiError` and required query hooks. The subscription hook additionally takes `useContentRefreshSubscriptionHook`. Keep the two operation port scopes and reuse `cms-integrations` core wire contracts. The screens take required controller hooks, the current rendering kit, and `ServerLabel` as a component. Bind translation through `IntegrationsProps` instead of importing host i18n. Preserve the disabled-row branch and the distinction between opening Delete confirmation and sending a delete. Move `useWired*` bodies nowhere in Jini.

First tests `Integrations.confirm-delete.unit.test.tsx`, `IntegrationDeliveries.subscription-key.unit.test.tsx`. `M-delete-from-row-menu` and `M-share-delivery-key-across-subscriptions`.

### J10 — Mail admin views · BUILDER: SOL · OPUS-REVIEW · 4 files

`F/email/{Email.tsx:128,193, EmailProviderTab.tsx:167,241, EmailSegments.tsx:15, EmailTemplateEditor.tsx:264,273}` → `user-management:react/mail/`, same filenames.

`Email(props: EmailProps)` retains `tabId`/`part` and requires `useEmailHook`, complete `EmailTabHooks`, `useAdminThemeBoundaryHook`, `kit`, and `parts`. `parts` supplies the currently imported Overview, Sender, Activity, and Templates components and their small presentational helpers. Inject `translateAdminNavLabel`, mail copy, and tab/part navigation. Keep tab-specific controller calls in their current child components. `EmailProviderTab` keeps its current controller/status/selection inputs, adding injected display-name resolution and mail copy. `Segments` takes its existing props plus required segment renderer from the host kit. For `EmailTemplateEditor` require editor, locale and keyboard hooks, copy for both dictionaries, and the same kit; preserve `editorStatus` and the saved/draft/preview branch order. Keep required and optional props from the current leaf render interfaces; guard lookup results before rendering a selected provider.

First tests `EmailPanel.part-routing.unit.test.tsx` and `EmailTemplateEditor.preview-copy.unit.test.tsx`. `M-reveal-provider-key-in-status` and `M-preview-marks-unsaved-template-saved`.

### J11 — Page editor port and save transaction · BUILDER: SOL · OPUS-REVIEW · 2 files

`F/pages/hooks/page-editor-port.hooks.ts:33–63` → `core:contracts/site/content-editor-ports.ts`. Factor `EditorDraftPort<Draft, Snapshot>` from the port actually used by the host (`hooks/use-standing-draft-autosave.hooks.ts:7–12`), not the host’s hook implementation. `PageEditorPort<Row, Embed, Draft, Snapshot>` extends it. Spell `updatePost` and `deletePage` out from `pages-dependencies.hooks.ts:21–24` and the row envelopes. Use core’s existing `HeadlessThemeTier` union. Keep `activeThemeApiVersion: 2 | undefined` required and `activeThemeTier` nullable. Preserve `templateChoice` null versus empty string. Do not move theme configuration or broaden the delete port.

`F/pages/hooks/page-editor-save.ts:19,60,79,97,128` → `cms:react/pages/hooks/page-editor-save.ts`. Keep write/result payloads generic over the row returned by the port, constrained by the exact fields read in `applySavedPage` and `applyPartialSave`. `applySaveFailure` additionally requires `readVersionConflict({ error, attemptedStatus }, {})` and `isUnexpectedServerFailure({ error }, {})`. Carry the conflict result as a type parameter through `setSaveConflict`. Supply the existing page-save message functions and `PageSavePlan` shape through the call boundary. Keep body write separately refused when `canSaveHtml` is false. Preserve the metadata response’s version as the expected version for the body, and leave the HTML dirty on partial success.

First tests `page-editor-save.expected-version.unit.test.ts` and `page-editor-save.partial.unit.test.ts`. `M-use-pre-metadata-version-for-body` and `M-clean-html-after-partial-save`.

### J12 — Editor-independent post chrome, preview, and state · BUILDER: SOL · OPUS-REVIEW · 10 files

`F/posts/` → `cms:react/posts/`, same relative paths, except `hooks/post-editor-port.hooks.ts:31` contributes `PostEditorPort<Row, CreateInput, Presentation, Draft, Snapshot>` to **J11’s core leaf**. Extend `EditorDraftPort`. Keep the full `updatePost` patch member list, `expectedVersion` optional at the port, and unchanged list/media result envelopes. `Presentation` is supplied by the host and has exactly the four members listed under `getPresentation`. No `ThemeTier`- or TipTap-owned runtime import. Add a `core` minor to this changeset in addition to `cms`.

- `editor/header/PostEditorActions.tsx:21`, `PostEditorHeader.tsx:20`, `editor/view-bar/PostEditorViewBar.tsx:21`. Keep current render input names. Inject kit icon/components, public `siteUrl`, and the toolbar-end renderer as required props at their use sites. Keep unsaved-leave, delete confirmation, and template-control ordering. TipTap toolbar end stays in Tovu.
- `editor/preview/PostPreview.tsx:81` and `PostPreviewFrame.tsx:16`. Inject `resolvePostPreviewBranches` from the still-local post rules, and require `useThemePreviewFrameHook` on the frame. Preserve the iframe attributes and ref/refresh behavior. Thread the hook from the editor composition, without moving the theme implementation.
- `hooks/post-editor-messages.ts:21,43,53,77`, `post-editor-state.rules.ts:45,60,70,105,129,165`, `post-editor-save.rules.ts:23,34,57,81,96,107`. Inject the exact date, scheduling and slug functions the files currently import from `../rules`. Where a helper accepts a row positionally, use `{ post }` or `{ saved }` with an options pad. `reportPostLoadFailure` requires `isUnexpectedServerFailure`, `isApiError`, and `publishLocalFailure`, preserving expected refusal vs unexpected reporting. Keep a single `postId`/`entryId` distinction and the same generic row through state, save, and load. Reuse the same port’s patch type for `PostUpdatePatch`.
- `hooks/use-post-url-dialog.hooks.ts:17,49`. Keep its structural editor command port. Require `afterEditorFocus` in the hook’s options instead of importing/reading a browser timer default. Keep the submit guard, scheme checks, opener restore, and subsequent editor focus order. Omit empty image alt where the command type expects absent, rather than passing `undefined` to an exact optional field.

First tests `post-editor-chrome.guard.unit.test.tsx`, `post-editor-save.rules.unit.test.ts`, `use-post-url-dialog.hooks.unit.test.tsx`. Mutations `M-recompute-entry-id-from-new-slug`, `M-accept-refused-url-scheme`, `M-refocus-before-dialog-cleanup`.

### J13 — Publish-content request and ceremony port · BUILDER: SOL · OPUS-REVIEW · 2 files

`F/publish-content/api/publish-content-api.ts:8,14,19` → `cms:react/publish-content/api/publish-content-api.ts`. `createPublishContentApi({ request, workspaceId }, {})`. Copy all six methods. Keep peer name in the encoded path, only destination’s optional `{ siteUrl }` in its connect body, plan’s omission rules for all three optional filters, and execute’s original bundle/token/overwrite fields. `planPublishContent` gets an empty second-argument pad. No format or server changes.

`F/publish-content/hooks/publish-content-port.hooks.ts:26–87` → `cms:react/publish-content/hooks/publish-content-port.hooks.ts`. Move the port verbatim apart from package-local imports, using the already landed core peer/destination contracts and CMS publish results. This is a UI collaboration port, not a second site DTO owner. Keep default port, application stores, dialog and confirmation controller in Tovu.

First test `publish-content-client.ceremony.unit.test.ts`. `M-drop-confirmed-overwrite-set` and `M-send-empty-plan-body-when-absent`.

### J14 — Site-key screen and recovery controllers · BUILDER: SOL · OPUS-REVIEW · 4 files

`F/security/{SiteKeyRecoveryCard.tsx:15, SiteKeyTab.tsx:49,58,260, hooks/use-site-key-recovery.hooks.ts:23,53,67,100, hooks/use-site-key.hooks.ts:36,72,83,93}` → `integrations:react/site-key/`, same paths. Use existing core `SiteKeyPort` at `contracts/site/site-key.ts:127`.

`useSiteKey({ port, t, locale, queryHooks, describeApiError, readApiRefusal, copy }, {})` and `useSiteKeyRecovery` with its current `port`, `t`, and `onRecovered` plus the same refusal/copy seam. `readApiRefusal({ error }, {})` returns the structural code and supported detail for known host API failures, or null. Preserve `code ?? message`, refusal mapping, refresh sequencing, and clearing the pasted key. `SiteKeyTabProps` makes `useSiteKeyHook` and `useSiteKeyRecoveryHook` required and adds required reveal-copy hook, kit, and copy including the host environment-variable name. Preserve masking and private input markup in the tab and recovery card. Preserve the all-caps confirmation and affected-resource preview before execution. The already landed owner recovery code card is not part of this move.

First tests `SiteKeyTab.agent-secrecy.unit.test.tsx` and `use-site-key-recovery.confirmation.unit.test.ts`. `M-execute-start-fresh-without-confirmation`, `M-render-revealed-key-in-agent-tree`.

### J16 — Deployment shell, overview, and Dockerfile · BUILDER: SOL · OPUS-REVIEW · 6 files

`F/deployment/{Deployment.tsx:65,72, OverviewTab.tsx:54,300, deployment-visuals.tsx:30,152, rules.ts:27,298,313,332, DockerfileTab.tsx:56,352, hooks/use-dockerfile-source.hooks.ts:63,277}` → `devops:deploy/react/`, same paths. Keep existing `./deploy/react` entry and its history tab. Add the six leaves.

- `Deployment(props)` requires locale hook, tab navigation and translation, kit `TabBar`, and the host-mounted Static Site and History components. Overview and Dockerfile are local domain components and receive the corresponding required controller hooks from this shell. The Dockerfile template and bytes are not deployment policy. Do not reach either live client from these views.
- Move neutral rules and visuals. Leave `STATIC_SITE_CAPABILITIES` and `FULL_SITE_CAPABILITIES` data in Tovu, passing them to `OverviewTab` and leaving existing Static Site use local. Inject token subtitle copy in `credentialStepSubtitle`. Keep exact field-handle suffix and warning selection. Convert positional exported rules to named objects, e.g. `{ varStatus }`, `{ gate }`, `{ field }`, `{ credential }`, and thread pads. Scope type dependencies to the existing field/status members read. Do not pull a theme or a credential registry into Jini.
- Overview uses the existing generic `useDeploymentOverview` at `devops:deploy/react/use-deployment-overview.hooks.ts:37` through a required host binding. `useDockerfileSource` keeps `port`, `t`, `locale` and adds required query/dirty hooks, conflict reader, failure formatter, and clipboard writer. `DockerfileTab` requires the hook and `download({ contents }, {})`. Leave DOM Blob URL handling in Tovu. Split the editor card at its status/actions block (`:228–351`) and the save hook at `:214–259` if needed to keep the caps. Preserve captured version and keep-local-edits/reload choices.

First tests `Deployment.routes.unit.test.tsx`, `DockerfileTab.conflict.unit.test.tsx`, `deployment-fields.requires-credential.unit.test.ts`. `M-save-dockerfile-without-captured-version` and `M-mark-unverified-credential-connected`.

### J15 — Source Control credential form · BUILDER: SOL · OPUS-REVIEW · 4 files

`F/source-control/{rules.ts:21,40,68,92,159, source-control-visuals.tsx:27,42,59, hooks/use-source-control-credentials.hooks.ts:58,74,115, ProvidersTab.tsx:80,93}` → `devops:source-control/react/`, same paths. Keep the already exported Source Control shell.

`sourceControlProviderInfoFromDescriptor({ descriptor }, {})` keeps descriptor order. Add the injected error classifier to `classifySourceControlCredentialSubmitError`. Keep provider/credential input objects and the exact default-picker rule. `useSourceControlCredentials` keeps `port`, `locale`, and `t` and adds required `useFetchQueryHook`, error classifier/describer, provider localization, and credential draft/translation functions. Type these ports from the fields read at `:115–208`; do not infer provider validity from token presence. `ProvidersTabProps` takes a required controller and locale hook, navigation, `CredentialHint`, kit, field helper functions from J16, and viewer zone. Do not replace plugin-discovered providers with a built-in list. Preserve the current behavior where an existing connection still displays if its provider is absent from discovery.

First tests `SourceControl.provider-catalog.unit.test.tsx` and `SourceControl.credential-refusals.unit.test.ts`. `M-hide-unlisted-saved-connection` and `M-pass-unredacted-token-to-hint`. This does not repair the separate catalog trust-gate bug from combine-23.

### J18 — Media edit and picker · BUILDER: SOL · OPUS-REVIEW · 3 files

`C/MediaEditDialog/MediaEditDialog.tsx:31,57` and `C/MediaPickerDialog/{MediaPickerDialog.hooks.tsx:51,66,81,117, MediaPickerDialog.tsx:60,119,167}` → `cms:react/media/`, same subdirectories. Do not replace the existing `cms:react/media/index.ts` entry.

`MediaEditDialog` keeps `MediaEditDialogProps`, but requires `useDialog` and the host native-dialog component. Its extension callbacks and field rendering remain injected. Picker hooks retain `port`, `locale`, `onSelect`, and `onCancel` where currently present, add required `useFetchQueryHook`, `describeError`, and translation/acceptance collaborators where used, and keep `acceptedMediaItems`’ null/empty distinction. Keep `useWired*` in Tovu. `MediaPickerDialog` requires the legacy controller hook and `useJiniMediaPickerHook`, `useHostMediaPickerHook`, `useAdminLocaleHook`, dialog components, translator, and `pickerHostArgs`. Type `pickerHostArgs` by the fields at `:159–165`, not the Tovu `ApiError` class. The calling component follows `:167–172` in choosing enabled vs legacy. Preserve newest selection, single cancel, and incident rendering. Native dialog CSS and redaction policy stay with the host mount.

First tests `MediaPickerDialog.backend-parity.unit.test.tsx` and `MediaEditDialog.hidden-alt.unit.test.tsx`. `M-drop-picker-redaction-port` and `M-clear-hidden-alt-on-style-save`.

### J17 — Embed insert and attribute rows · BUILDER: SOL · OPUS-REVIEW · 3 files

`C/EmbedInsertControl/{EmbedInsertControl.hooks.tsx:16,46,74, EmbedInsertControl.tsx:54,200}`, `C/WidgetConfigFields/HtmlAttributeRows.tsx:22,32` → `cms:react/widgets/`, same subdirectories.

`useEmbedInsertControl({ editor, useWidgetAddControlHook, mintPlacementId }, { widgetPort } = {})` keeps the structural editor and two unconditional Form/Menu hooks. No TipTap imports. `createEmbedInsertControlTranslator({ locale, translate }, {})` preserves current dictionary key handling. `EmbedInsertControlProps` requires `useEmbed`, `useAdminLocaleHook`, the picker/control components and their required hooks, translator, and renderer collaborators. Keep the menu shortcuts and gallery path byte-for-byte after projection. `HtmlAttributeRowsProps` requires `useRows`, `htmlAttributesToRows`, `isDroppedAttributeRow`, and `rowsToHtmlAttributes`, with existing types inferred structurally from the hook boundary. Keep `aria-invalid`, sanitization/serialization, and index-as-editing-identity unchanged. J18 gives T17 an existing host picker mount to inject.

First tests `EmbedInsertControl.subtype-and-placement.unit.test.tsx` and `HtmlAttributeRows.refused-attributes.unit.test.tsx`. `M-bypass-attribute-rejection` and `M-reuse-placement-id`.

### J19 — Agent presentation and auth warning · BUILDER: SOL · OPUS-REVIEW · 2 files

`F/settings/ai-agent-presentation.ts:10,24,36,44` and `hooks/use-ai-agent-presentation.hooks.ts:6` → `chat:react/admin-execution/`, same relative paths. `isDesktopAdmin` and branded scope keys remain host policy. `localCliScopeCopy({ desktop, desktopKey, serverKey }, {})` makes the two branches portable. `selectedAgentWarning` keeps its four inputs and adds required `translate`. `createAgentPresentationPort` retains its signature, source port `this`, and conditional rescan property. `useAiAgentPresentation({ port, config, locale, desktop, defaultLocalAgentId, translate, scopeKeys }, {})` preserves latest-scan wins and no unmounted write. Tovu supplies the same default agent as its Dock selection.

First test `ai-agent-presentation.scan-race.unit.test.tsx`. `M-older-scan-replaces-auth-state` and `M-warn-when-auth-is-unknown`.

### J20 — Recovery screen · BUILDER: SOL · OPUS-REVIEW · 1 file

`F/recovery/Recovery.tsx:92,386,414,423,502,513,531` → `db:react/recovery/Recovery.tsx`. `RecoveryProps` keeps `tabId` and requires `useRecoveryHook`, `useRecoveryNavigationHook`, `useRestoreFlowHook`, `navigationPort`, `kit`, `ServerLabel`, dictionaries, formatting/copy helpers, and viewer zone. Thread `useRestoreFlowHook` into `RestoreTabPanel` and `RestoreFlowProps` as required. Do not move the host recovery client or mount. Split `RestoreFlow:423–494` into controller invocation and a pure `RestoreFlowBody` with an explicit controller-result prop if necessary to keep the cap. Preserve disclosure acknowledgement, plan → confirm → execute, token gating, and the no-selection restore deep link. Keep local restart behavior and deployment access decisions at the existing ports.

First tests `Recovery.restore-ceremony.unit.test.tsx` and `Recovery.direct-tab.unit.test.tsx`. `M-execute-without-confirmation-token` and `M-bypass-disclosure-ack`.

## Tovu build order

Parenthesized lines are importer anchors. File lists in each T sheet inherit the corresponding J sheet’s source-to-leaf mapping, test name, mutation, and security review. Where a test intentionally exercises live defaults, test the actual binding. All other tests pass the same fakes to the Jini leaf.

### T01 — Bind the deployment wire · BUILDER: SOL · OPUS-REVIEW

`F/deployment/deployment-host-ports.ts:4,18` imports the core variants. Define the local peer arm there with its literal `"tovu-peer"` and derive `AdminPublishDestination` as `DeploymentDestination<TovuPeerDestination>`. At `apps/website/src/features/deployments/static-publish/publish-history.ts:167,230`, compose the same neutral variants with the existing host peer arm. Keep `publicPublishConfigFields:182` and route registration `routes/system/publish-site.ts:423` semantically unchanged. Repoint `F/deployment/hooks/{static-export-dependencies.hooks.ts:3, use-static-export.hooks.ts:13, static-publish-dependencies.hooks.ts:3, use-static-publish.hooks.ts:23}`. Instantiate publish type params with the four existing Admin types and remove both old port files and the old destination type file. Pin route/client parity with unchanged fixtures, including the omitted credential field.

### T02 — Keep singleton I/O in the host · BUILDER: SOL · OPUS-REVIEW

- `lib/browser-telemetry.ts` keeps `adminTelemetry` and constructor binding. Remove its Jini passthrough exports. `App.tsx:47` stays on the singleton and passes `ADMIN_BASE` for route templating if used there. `main.tsx:24` splits the singleton from `installBrowserErrorListeners` and `reactRootErrorOptions`, injecting the actual logger. `lib/E/browser-telemetry.unit.test.tsx:15` splits the same symbols and supplies base/logger in generic cases.
- `lib/server-reconnect.ts` keeps `browserServerReconnectDeps`, `serverReconnectForMode`, the test stub, and header constants. `lib/admin-http/request.ts:8` takes the retry rule from the new leaf and the singleton/headers from the host. `lib/shell-notices-wiring.tsx:9`, `lib/E/admin-failure-channel.unit.test.ts:10`, `api-request.characterization.test.ts:6`, `server-reconnect.unit.test.ts:4`, `shell-notices-wiring.unit.test.tsx:6` keep live symbols local and import type/factory/rule from Jini.
- `lib/settings-events.ts` becomes the actual host binder. `App.hooks.ts:41`, `App.session.ts:13`, `F/themes/E/theme-preview-refresh.unit.test.tsx:134`, `hooks/E/use-host-admin-locale.hooks.test.tsx:16`, `lib/E/{settings-events.unit.test.ts:4, shared-stream-adapters.unit.test.ts:4}` keep that binding for live parity. Inject original `/settings/events?themePreview=1`, exact cursor query order, credentialed `EventSource`, and the existing preview callback. Reconcile the two moved source pins in `development/scripts/error-gate-debt.json:243,248` without dropping coverage for real host catches.

### T03 — Bind run URLs and chart registry · BUILDER: SOL · OPUS-REVIEW

`lib/durable-run-subscription.ts` keeps the activity-aware `followDurableRun`, map, and a real injection of `fetch`, EventSource, schedule, and `runPath`. Remove its type passthrough. `lib/{assistant-transport-ag-ui.ts:38, assistant-transport.ts:7, E/assistant-transport.run-status.unit.test.ts:12, E/durable-run-subscription.unit.test.ts:3, E/durable-subscription.fixture.ts:2, E/shared-stream-adapters.unit.test.ts:7}` import bound values locally, port types directly from `@jini-ai/chat/transports/http`, and the generic factory directly only for port-level tests.

`C/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:23` binds the routed card using the actual route hook, kit chat renderer, translator, and `useContext(AdminChartRegistryContext)` adapter. Keep `createElement` registration and import interactive CSS at this mount. Repoint `C/AssistantDock/E/{RoutedA2uiSurfaceCard.contract.unit.test.tsx:7, RoutedA2uiSurfaceCard.unit.test.tsx:36, chart-provider.contract.unit.test.tsx:12}` and `C/E/AssistantDock.unit.test.tsx:77`. `C/AssistantDock/E/interactive-ui-styles.unit.test.ts:4` pins the host CSS import and package-owned rendering rather than reading the removed TSX via `?raw`.

### T04 — Credential copy and BYOK mounts · BUILDER: SOL · OPUS-REVIEW

Keep `lib/credential-copy.ts` only as the binder of validator, classifier, and product translations. Existing live callers are `F/ai-assistant/{AiAssistant.tsx:54, rules.ts:6}`, `F/deployment/hooks/use-publish-credentials.hooks.ts:3`, `F/security/hooks/{use-access-tokens.hooks.ts:2, use-other-credentials.hooks.ts:2}`, `F/settings/hooks/use-external-mcp.hooks.ts:2`, `F/source-control/hooks/use-source-control-credentials.hooks.ts:3`, and `hooks/use-admin-execution-credential.hooks.ts:17`. `lib/E/credential-fidelity.unit.test.ts:4` keeps the host witness and adds the fake classifier on the Jini test. Bind BYOK props at `F/ai-assistant/AiAssistant.tsx:19` and `F/settings/SettingsUi.tsx:126`, passing the locale hook and existing panel translator. Repoint `C/E/{AdminByokKeyPanel.unit.test.tsx:10, agent-handle-batch1.unit.test.tsx:8}`. Remove the local BYOK view.

### T05 — Bind nav/copy and theme effects · BUILDER: SOL

Keep real composition in `C/Placeholder.tsx` for `getNav`, translations, fallback labels and resource scope. `App.tsx:36` and its route children retain their current facade prop shape. Repoint named pure-helper tests to Jini with host fixtures. Update `__tests__/unit/{locale-hook-required-props.source-pin.unit.test.ts:13, panels-render.unit.test.tsx:63}`, `C/E/{Placeholder.unit.test.tsx:5, agent-handle-batch1.unit.test.tsx:9}`, and `F/{admin-ui/E/redirects.unit.test.tsx:6, authentication/E/Authentication.unit.test.tsx:6, library/E/Library.unit.test.tsx:11}`.

`hooks/use-admin-appearance.hooks.ts` owns one draft store instance for both bound hooks, retains the existing snapshot port, and passes the real theme hook, CSS painter, invalidation, and `advanceAppearancePreview`. Keep `App.tsx:11,607` and `F/settings/hooks/use-admin-appearance-settings.hooks.ts:1,19` on those bound functions. Repoint `hooks/E/{use-admin-appearance.tw2-pin.test.ts:4, use-admin-appearance.unit.test.ts:6}` by whether a test covers arbitration or host painting.

### T06 — Bind files and consume publish query · BUILDER: SOL · OPUS-REVIEW

`F/fs-files/api/fs-files-api.ts` instantiates the new client with `authenticatedAdminRequest` and `WORKSPACE_ID`. Keep `nativeFolderPickerDeps`, the 409 test, and `folderDropDeps`, including `"tovuFiles"`. Preserve bound imports from `C/AssistantDock/{AssistantDock.state.hooks.ts:4, hooks/composer-files.hooks.ts:13}`, `F/fs-files/{E/fs-files-api.unit.test.ts:4, api/E/folder-drop-deps.unit.test.tsx:9}`, and `lib/E/{api-fs-files-custom-root.unit.test.ts:3, api-request-shapes.clients.ts:9}`.

Repoint `App.hooks.ts:34` and `lib/E/publish-criteria-deep-link.unit.test.ts:5`. Bind `PUBLISH_CRITERIA_QUERY_PARAM` and `decodePublishCriteriaFromQuery` from the existing host package at the call site. Delete the old deep-link file.

### T07 — Skills mounts and browser event · BUILDER: SOL · OPUS-REVIEW

`F/skills/api.ts` keeps the bound client, original `SKILLS_CHANGED_EVENT`, guidance text, and `window.dispatchEvent`. Bind J07 hooks in a real `F/skills/skills-host.hooks.ts` and remove the three former controller files. Mount the bound files/list hooks at `F/skills/SkillsPage.tsx:13,14` and the install hook at `C/AssistantDock/AssistantDock.state.hooks.ts:22`. Keep event/client consumers `C/AssistantDock/{hooks/composer-discovery.hooks.ts:3, E/AssistantDock.hooks.unit.test.tsx:26, E/composer-installed-skills.integration.test.tsx:6}` and `lib/E/audit-admin-request-regressions.unit.test.ts:3`. Keep `development/parity/tool-guides.json:2586` pointed to the real bound client.

Repoint `F/skills/E/{use-skill-files.hooks.unit.test.tsx:4,5, chat-drop.unit.test.tsx:4, skill-dialogs-and-row.unit.test.tsx:2,8,16,18, skill-install-i18n.unit.test.tsx:7, use-skill-install.hooks.unit.test.ts:6, skills-page-i18n.unit.test.tsx:6, use-skills.unit.test.ts:4,6}` and `__tests__/fqfix-actions.unit.test.tsx:8`. Relocate the `development/scripts/error-gate-debt.json:208` source pin according to actual catch ownership. Browser event unsubscription stays paired to the same listener.

### T08 — Install bindings and composer snapshot · BUILDER: SOL · OPUS-REVIEW

Instantiate the two install factories in their original `F/plugins/hooks/*-install-dependencies.hooks.ts` files with the existing workspace, request, and `crypto.subtle` digest adapter. Production consumers `F/plugins/AgentPlugins.tsx:25` and `F/plugins/hooks/use-plugins.hooks.ts:7` keep the live ports. Preserve the fakes for `F/plugins/E/{AgentPluginsAddTab.unit.test.tsx:15, agent-plugin-update.unit.test.tsx:18, plugin-install-size.unit.test.ts:7, plugin-ports.unit.test.ts:4,7, PluginsAddTab.unit.test.tsx:8, plugin-host-deps.ts:3, plugin-zip-install.unit.test.tsx:7, use-plugin-install.hooks.unit.test.ts:7}`.

Bind installed skills at `C/AssistantDock/hooks/composer-discovery.hooks.ts:2`, keeping the same workspace URL, host 304 classifier, and error sink. Move its direct tests `F/plugins/E/installed-skills-composer-source.unit.test.ts:3` and `lib/E/audit-admin-request-regressions.unit.test.ts:4` to the new symbols with the same host transport witness. Delete the old snapshot file. No reorder of installed vs bundled discovery sources.

### T09 — Mount Webhooks and rewire delivery lazy load · BUILDER: SOL · OPUS-REVIEW

Use existing live dependency files to bind both wired hooks. `F/providers/Providers.tsx:15,16` supplies controller hook, status label, kit, and translation to `Integrations`. Replace the forwarding part of `F/integrations/index.ts:21` with a lazy real host mount binding delivery props. Keep `panel-pages.ts:31` on the mounted lazy component and update `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:54,207`. Repoint `F/integrations/E/{Integrations.unit.test.tsx:7,9, IntegrationDeliveries.unit.test.tsx:4,5,6, rules.unit.test.ts:4, use-integrations.unit.test.tsx:6,8, use-integration-deliveries.unit.test.ts:5}`. Repoint `__measurements__/request-volume.measurement.test.tsx:559,573` and `hooks/E/content-refresh-coverage.unit.test.ts:81` to the bound or neutral hooks as tested. Move `lib/E/fixtures/admin-literal-copy.baseline.json:46` and `development/scripts/error-gate-debt.json:83` pins to the correct owner without relaxing them. Delete the original five files after real mount code has been bound.

### T10 — Mail mount and lazy routes · BUILDER: SOL · OPUS-REVIEW

Bind J10 in `F/email/email-panel.tsx` with `email-hooks-host.ts`, the existing site theme boundary, copy, and tab navigation. Bind the two controller families independently. Keep CSS side-effect imports at the host entry. Replace `F/email/index.ts:5,6` re-exports and repoint the lazy targets at `panel-pages.ts:55,56` and `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:42`. Repoint `F/email/E/{Email.unit.test.tsx:5, email-controller.test-helpers.ts:2, EmailTabs.unit.test.tsx:7, EmailTemplateEditor.unit.test.tsx:4}`. Remove the old views. Keep provider edit error and typed-secret request wiring on the existing client.

### T11 — Page editor host instantiation · BUILDER: SOL · OPUS-REVIEW

`F/pages/hooks/page-editor-dependencies.hooks.ts:11` specializes the generic core port with current `AdminPost`, `AdminPagePluginEmbed`, and the two host draft shapes. Export its binding type beside the live value, not from a forwarding shim. `F/pages/hooks/use-page-editor.hooks.ts:45,46,893,910` uses the J11 functions, the current port specialization, existing message functions, and `readVersionConflict`/`isUnexpectedServerFailure`. `F/pages/E/page-editor-save.expected-version.unit.test.ts:3` imports the new helper and witnesses the metadata→body version handoff. Reconcile `development/scripts/error-gate-debt.json:103`. Delete the old port and save files. Do not move `PageEditor`, the page controller, or the theme canvas.

### T12 — Post chrome and commands at the existing editor seam · BUILDER: SOL · OPUS-REVIEW

Keep J12’s specialized `PostEditorPort` next to `F/posts/hooks/post-editor-dependencies.hooks.ts:11`. Wire its bound arguments through `F/posts/PostEditor.tsx:5,6,9,11` and `F/posts/hooks/use-post-editor-screen.hooks.ts:10,11,14,19`. Inject `siteUrl`, `PostEditorToolbarEnd`, `useThemePreviewFrame`, and neutral rule projections from the existing host modules. The iframe and branch helper import between moved previews is internal.

Repoint `F/posts/hooks/{use-loaded-post-apply.hooks.ts:7,79, use-post-editor.hooks.ts:58,61,70,71,113,114,772, post-editor-file-upload.ts:5}` and `F/posts/E/{post-editor-hook-injection.unit.test.tsx:6, use-post-editor.hooks.unit.test.tsx:20, post-editor-save.rules.unit.test.ts:12, post-editor-state.rules.unit.test.ts:12}`. Pass live error classification and reporting in the two `reportPostLoadFailure` calls. Update the named-object calls when a positional rule changed.

The URL dialog importer set is `F/posts/editor/{PostEditorBody.tsx:7, bubble-menu/BubbleFormattingMenu.tsx:6, toolbar/Toolbar.tsx:6, toolbar/ToolbarFormattingGroup.tsx:3, toolbar/insert-controls.tsx:7}`, and `F/posts/E/{PostUrlDialog.chromecheck.unit.test.tsx:4, use-post-url-dialog.hooks.unit.test.ts:3}`. Bind `requestAnimationFrame` only in the live host hook caller; retain fake scheduler and null-editor behavior in tests. Update `development/eslint-rules/__tests__/fixtures/error-gate-sites.json:12` if the source pin follows the moved guard. TipTap itself, toolbar/bubble menus, theme editor toolbar, and the post controller remain in Tovu.

### T13 — Publish-content host client · BUILDER: SOL · OPUS-REVIEW

`F/publish-content/hooks/publish-content-dependencies.hooks.ts:4,6` instantiates `createPublishContentApi` once with `request` and `WORKSPACE_ID` and imports the new port. Repoint port-only imports in `F/publish-content/{PublishContentDialog.tsx:12, hooks/use-publish-content-confirm.hooks.ts:27}`. Point `lib/E/{api-long-tail-endpoints.unit.test.ts:10, api-request-shapes.clients.ts:21}` to the same live binding. Delete the old API and port files, keeping fake ports with the host and all confirmation/deep-link scope tests. Do not add wire credentials to browser inputs or results.

### T14 — Site-key mounts · BUILDER: SOL · OPUS-REVIEW

`F/security/hooks/site-key-dependencies.hooks.ts` remains the live client and can construct both bound hooks with Tovu error classifiers and current translator. `F/security/Security.tsx:14,17,193` passes both required hooks, reveal-copy hook, policy and kit. Preserve the existing site-key permission gate. `F/security/E/{SiteKeyRecoveryCard.unit.test.tsx:4,5, SiteKeyTab.agent-secrecy.unit.test.tsx:6,7, SiteKeyTab.unit.test.tsx:6,7,8, site-key-copy.i18n.unit.test.tsx:3,6,7, use-site-key-recovery.unit.test.ts:6, Security.unit.test.tsx:9, site-key-generate-error.unit.test.ts:4, use-site-key.unit.test.ts:6}` import the correct live vs neutral symbols. Reconcile `development/scripts/error-gate-debt.json:163,168,173`. Remove the four old sources. Do not touch the owner recovery card or service.

### T16 — Deployment ports and mounts · BUILDER: SOL · OPUS-REVIEW

Use `F/deployment/deployment-panel.tsx` as the real lazy composition mount. Repoint `F/deployment/index.ts:7`, `panel-pages.ts:60`, `__tests__/unit/admin-route-lazy-loading.unit.test.tsx:45`, and `F/deployment/E/Deployment.unit.test.tsx:6`. Mount Jini Overview and Dockerfile with existing wired collaborators. At `F/deployment/hooks/use-deployment-overview.hooks.ts:33,57`, replace the duplicate query implementation with a binding to Jini’s existing generic hook. Preserve test seam in `hooks/E/use-deployment-overview.unit.test.tsx:5`. Bind Dockerfile conflict, dirty, clipboard, download, and error collaborators from the existing host files.

Using `F/deployment/` as prefix, repoint `StaticSiteTab.tsx:30,31`, `E/{OverviewTab.unit.test.tsx:4,5, PureTabs.unit.test.tsx:7, deployment-visuals.unit.test.tsx:7, StaticSiteTab.unit.test.tsx:16, rules.unit.test.ts:35, DockerfileTab.unit.test.tsx:5,6}`, and `hooks/{use-publish-credentials.hooks.ts:21, use-static-export.hooks.ts:10, use-static-publish.hooks.ts:21, E/use-static-export.unit.test.tsx:8, E/use-dockerfile-source.unit.test.tsx:6}`. Move capability tables and subtitle product copy to `F/deployment/deployment-host-policy.ts`. Outside that prefix, repoint `F/security/{AccessTokensTab.tsx:12, access-token-forms.ts:5, hooks/use-access-tokens.hooks.ts:14,25}`, `F/source-control/ProvidersTab.tsx:9`, `lib/E/credential-fidelity.unit.test.ts:6`. Preserve size/error path pins at `development/scripts/{size-debt.json:33,error-gate-debt.json:53,58}` or remove only the row for an eliminated violation.

### T15 — Source Control provider mount · BUILDER: SOL · OPUS-REVIEW

`F/source-control/source-control-panel.tsx:9–11,79` remains a real host mount. Bind provider discovery and credential controller in `hooks/source-control-credentials-dependencies.hooks.ts`. Inject display/validation/translation, kit, navigation and J16 field helpers at the providers tab render. Preserve viewer time zone and distinct statuses for unlisted stored connections.

Repoint `F/source-control/E/{SourceControl.unit.test.tsx:7,9,11, rules.unit.test.ts:15, source-control-visuals.unit.test.ts:3, ProvidersTab.unit.test.tsx:4,5, use-source-control-credentials.unit.test.tsx:7}` and `F/security/{E/AccessTokensTab.unit.test.tsx:17, E/access-token-providers.fixture.ts:3, access-token-forms.ts:6, hooks/use-access-tokens.hooks.ts:23,26}`. Repoint `lib/E/credential-fidelity.unit.test.ts:5` and reconcile `development/scripts/error-gate-debt.json:213`. Delete the four old modules, retaining the real mount and live port. No change to provider trust, manifest admission, or saved-secret routing.

### T18 — Bind media-picking backends and editor dialogs · BUILDER: SOL · OPUS-REVIEW

Keep a real `C/MediaPickerDialog/media-picker-host.tsx` for the dual backend, incident extraction and redaction policy. Keep `useWiredMediaPickerItems` and `useWiredMediaPickerDialog` with `media-picker-dependencies.hooks.ts`, where production HTTP is already bound. `C/MediaEditDialog/MediaEditDialog.hooks.tsx` remains the live dialog controller. Pass that hook and the native dialog at `lib/{media-embed-extension.tsx:4, widget-embed-extension.tsx:7}`. Repoint `C/E/{MediaEditDialog.hooks.unit.test.tsx:2, MediaEditDialog.unit.test.tsx:5}`.

Picker consumers `C/EmbedInsertControl/EmbedInsertControl.tsx:7`, `F/posts/hooks/post-cover-host.hooks.ts:6`, `integrations/jini-admin/seo-module.hooks.ts:7`, and `lib/{media-embed-extension.tsx:3, media-image-extension.tsx:7}` use the host mount. `C/WidgetConfigFields/MediaContentEditor.hooks.ts:3` uses the wired items hook. Repoint `C/MediaPickerDialog/E/JiniMediaPicker.hooks.unit.test.tsx:6`, `C/E/{JiniMediaPicker.hooks.unit.test.tsx:10, MediaPickerDialog.hooks.unit.test.tsx:1,10, MediaPickerDialog.unit.test.tsx:9,10, agent-handle-batch3.unit.test.tsx:9}`, and `integrations/jini-admin/E/{media-swap.unit.test.tsx:9, seo-swap.unit.test.tsx:11}`. Keep native CSS in the host mount. Confirm dialog cancel, fallback, and provider switching through the unchanged host witnesses.

### T17 — Bind Embed editor controls and attribute handling · BUILDER: SOL · OPUS-REVIEW

`F/posts/editor/toolbar/insert-controls.tsx:5` mounts the new `EmbedInsertControl`, supplying its structural editor and bound hook, placement ID, current widget add/picker collaborators, and the T18 media picker. Bind `HtmlAttributeRows` at `C/WidgetConfigFields/MediaContentEditor.tsx:13` and `lib/widget-embed-extension.tsx:13` with existing sanitizer/parser and required hook. Preserve the CSS and TipTap state in Tovu.

Repoint `C/E/{EmbedInsertControl.hooks.unit.test.tsx:4, EmbedInsertControl.unit.test.tsx:9,10, GalleryInsertControl.unit.test.tsx:3,4, agent-handle-batch4.unit.test.tsx:7}`, `C/WidgetConfigFields/E/HtmlAttributeRows.unit.test.tsx:3`, and `F/posts/E/posts-i18n.unit.test.ts:115`. Replace the `HtmlAttributeRows` path pin at `lib/E/fixtures/admin-literal-copy.baseline.json:401`. No sanitizer or allowed-attribute change.

### T19 — Bind desktop facts and warning copy · BUILDER: SOL · OPUS-REVIEW

`F/settings/ai-agent-presentation.ts` keeps `isDesktopAdmin`, scope keys, and a real bound warning with existing `settings-execution-i18n`. Desktop-only consumers stay local at `C/AssistantDock/assistant-dock-props.tsx:7`, `F/import-export/hooks/import-export-dependencies.hooks.ts:5`, `hooks/use-tovu-execution-policy.hooks.ts:6`, and `site-section-availability.hooks.ts:1`. Mixed consumers at `C/AssistantDock/AssistantDock.state.hooks.ts:19` and `F/ai-assistant/AiAssistant.tsx:7` import Jini rules for moved symbols and the host binding for desktop/copy. `F/settings/SettingsUi.tsx:131` binds default agent and copy at the moved hook’s call. Repoint `C/AssistantDock/E/use-selected-agent-auth-warning.hooks.unit.test.ts:7` and `F/settings/E/{ai-agent-card-presentation.unit.test.tsx:7, ai-agent-presentation.unit.test.ts:6,7, settings-execution-i18n.unit.test.ts:6}`. Remove the former hook file.

### T20 — Recovery lazy mount · BUILDER: SOL · OPUS-REVIEW

Create `F/recovery/recovery-panel.tsx` with required props from existing `recovery-dependencies.hooks.ts` and `restore-flow-dependencies.hooks.ts`, router, dictionaries, and status renderer. Mount the J20 view without altering the existing permission/restore routes or engine. Repoint `F/recovery/index.ts:9`, `panel-pages.ts:58`, `F/recovery/E/Recovery.unit.test.tsx:5`, and `__tests__/unit/{admin-nav-recovery-acs.unit.test.ts:6, admin-route-lazy-loading.unit.test.tsx:44}`. Keep app-facing lazy export `Recovery`, remove the old source and forwarding-only barrel, and update the laziness witness to the actual mount. Do not widen the plan, confirmation, or execute permissions.

## Excluded after reconciliation

The absent paths were the dock’s `run-context` and overflow card, media’s `Media.hooks.tsx`, 16 plugin leaves, the three external-MCP picker/modal files, deployment History, three post cover/slug-warning leaves, three publish-content leaves, five security leaves, and the old Source Control screen. The checks for the less obvious replacements were `admin: screens/media/media-tabs.hooks.tsx:56,72`, `core:contracts/site/cms-publish-content.ts:122`, `core:contracts/site/site-key.ts:127`, and `F/source-control/source-control-panel.tsx:14,68`.

The 15 present non-moves are `F/database/Database.tsx`, `F/library/{Library.tsx,hooks/library-dependencies.hooks.ts}`, `F/media/{api/media-api.ts,hooks/use-media-preview.hooks.ts}`, `F/plugins/hooks/{use-agent-plugin-details-modal,use-plugin-package-files,use-plugins}.hooks.ts`, `F/settings/hooks/use-external-mcp-tool-picker.hooks.ts`, `F/trash/{Trash.tsx,hooks/use-trash.hooks.ts}`, `F/deployment/hooks/use-deployment-overview.hooks.ts`, `hooks/use-admin-locale.hooks.ts`, `F/security/RecoveryCodesCard.tsx`, and `F/import-export/ImportExport.tsx`. The last four include duplicate implementations or screens with an existing Jini equivalent. Their presence is not evidence for a second Jini move.

## NOT-SHEETED — 60 files

| Area | Exact remaining files, relative to the area in the first column |
|---|---|
| `C/AssistantDock` | `AssistantDock.tsx`, `DockChatPane.tsx`, `AssistantDock.state.hooks.ts`, `assistant-dock-props.tsx`, `hooks/agents-inventory.hooks.ts`, `hooks/byok-runtime.hooks.ts`, `hooks/composer-discovery.hooks.ts`, `hooks/composer-files.hooks.ts`, `hooks/execution-config-ledger.hooks.ts`, `hooks/execution-config.hooks.ts`, `hooks/local-cli-selection.hooks.ts`, `hooks/messages-change.hooks.ts`, `hooks/runtime-access.hooks.ts` |
| `C/WidgetConfigFields` | `MediaContentEditor.hooks.ts`, `MediaContentEditor.tsx`, `WidgetConfigFields.tsx` |
| `C/WidgetPickerDialog` | `WidgetPickerDialog.hooks.tsx`, `WidgetPickerDialog.tsx` |
| `F/collections` | `CollectionEntryEditor.tsx` |
| `F/media` | `Media.tsx`, `hooks/use-edit-media-panel.hooks.ts`, `hooks/use-media.hooks.ts` |
| `F/plugins` | `AgentPluginDetailsModal.tsx`, `AgentPlugins.tsx`, `hooks/use-agent-plugins.hooks.ts`, `PluginProviderSettingsDialog.tsx`, `Plugins.tsx` |
| `F/providers` | `Providers.tsx` |
| `F/settings` | `ExternalMcpAdmissionsBanner.tsx`, `ExternalMcpSettingsPanel.hooks.tsx`, `ExternalMcpSettingsPanel.tsx`, `hooks/use-external-mcp-admissions.hooks.ts`, `hooks/use-external-mcp.hooks.ts`, `SettingsUi.tsx` |
| `F/deployment` | `hooks/use-publish-credentials.hooks.ts`, `hooks/use-static-export.hooks.ts`, `hooks/use-static-publish.hooks.ts`, `StaticSiteTab.tsx` |
| `F/pages` | `PageEditor.tsx`, `rules.ts`, `hooks/use-page-editor.hooks.ts` |
| `F/posts` | `rules.ts`, `editor/notices/PostEditorNotices.tsx`, `hooks/use-posts.hooks.ts`, `Posts.tsx` |
| `F/publish-content` | `hooks/use-publish-content-confirm.hooks.ts`, `PublishContentDialog.hooks.tsx`, `PublishContentDialog.tsx` |
| `F/security` | `access-token-forms.ts`, `AccessTokensTab.hooks.tsx`, `AccessTokensTab.tsx`, `other-credential-stores.ts`, `OtherCredentialsSection.hooks.tsx`, `OtherCredentialsSection.tsx`, `hooks/use-access-tokens.hooks.ts`, `hooks/use-other-credentials.hooks.ts`, `Security.tsx` |
| `hooks` | `use-admin-execution-credential.hooks.ts` |
| `lib` | `settings-tabs.ts`, `execution-settings.ts` |

The next cuts should start with the execution ledger and dock state, the publish confirmation controller, and the remaining credential projections. Those seams unlock their views without moving Tovu’s desktop and theme policy, reintroducing a domain dependency into the admin shell, or changing a confirmation or credential boundary.
