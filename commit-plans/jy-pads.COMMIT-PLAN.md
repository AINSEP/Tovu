# jy-pads commit plan

Base: merge-6 `d3e78b387`; branch `codex/jy-pads`. Work remains unstaged and uncommitted; .git was read only.

No tests, mutations, builds, installs, typechecks, linters, catalog generation or graph tools ran. Static source parsing found no diagnostics; AST token comparison of the prose inventory found zero executable changes after accounting for authorized J-PADS deletions. No test cases were added or deleted (J-CHART adds one assertion). 2 class-token families were renamed: 4 emitted class literals and 4 selector literals changed.

## J05 — done

79/79 audited anchors edited in 30 widget files; 0 stopped anchors, 0 test literals updated. Deleted upstream IDs while preserving the stated rules, typed entry writes, reference capture, render ordering and unconditional Trash semantics. No API change or changeset. No review mutation per cull.

Files:

- `packages/cms/src/widgets/authorize-helper.ts`
- `packages/cms/src/widgets/concurrency.ts`
- `packages/cms/src/widgets/config-validation.ts`
- `packages/cms/src/widgets/document-embed-refs.ts`
- `packages/cms/src/widgets/embed-service.ts`
- `packages/cms/src/widgets/embed-validation.ts`
- `packages/cms/src/widgets/entry-payload.ts`
- `packages/cms/src/widgets/entry-refs-extractor.ts`
- `packages/cms/src/widgets/errors.ts`
- `packages/cms/src/widgets/html/html-embeds.ts`
- `packages/cms/src/widgets/html/server-fragment.ts`
- `packages/cms/src/widgets/media-embed-resolution.ts`
- `packages/cms/src/widgets/page-widget-resolution.ts`
- `packages/cms/src/widgets/ports.ts`
- `packages/cms/src/widgets/read-service.ts`
- `packages/cms/src/widgets/region-area-service.ts`
- `packages/cms/src/widgets/registry.ts`
- `packages/cms/src/widgets/repo.memory.ts`
- `packages/cms/src/widgets/resolver-contracts.ts`
- `packages/cms/src/widgets/resolver-service.ts`
- `packages/cms/src/widgets/resolvers/contact-form.ts`
- `packages/cms/src/widgets/resolvers/index.ts`
- `packages/cms/src/widgets/resolvers/menu.ts`
- `packages/cms/src/widgets/resolvers/recent-entries.ts`
- `packages/cms/src/widgets/sql/entry-refs-repo.ts`
- `packages/cms/src/widgets/sql/repo.ts`
- `packages/cms/src/widgets/types.ts`
- `packages/cms/src/widgets/where-used.ts`
- `packages/cms/src/widgets/widget-instance-resolution.ts`
- `packages/cms/src/widgets/write-service.ts`

Diff re-read deletion: removed an unnecessary neutralization of the existing frontend library name; restored that name and kept only citation cleanup. No other out-of-scope edit retained.

Files over 500 lines (continue per dispatch): `packages/cms/src/widgets/embed-service.ts` (661), `packages/cms/src/widgets/html/html-embeds.ts` (545), `packages/cms/src/widgets/write-service.ts` (522).

## J10 — done with 3 stopped anchors

83/86 audited anchors edited in 27 files; 3 anchors retained (compatibility class literals and historical artifact path locators), recorded in REFRESH.md. Historical password-override clearing is described in prose; recorded verification outcomes remain unchanged. 0 test literals updated. No API change, changeset or review mutation.

Files:

- `packages/admin/src/comments/PORT.md`
- `packages/admin/src/comments/SOURCE-RATIONALE.md`
- `packages/admin/src/core/ledger-slice.ts`
- `packages/admin/src/forms/PORT.md`
- `packages/admin/src/forms/SOURCE-RATIONALE.md`
- `packages/admin/src/forms/react/hooks/use-form-editor-parts.hooks.ts`
- `packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts`
- `packages/admin/src/forms/react/pages/FormEditor.tsx`
- `packages/admin/src/forms/react/pages/FormsList.tsx`
- `packages/admin/src/media/PORT.md`
- `packages/admin/src/media/PROTOTYPE.md`
- `packages/admin/src/playground/PORT.md`
- `packages/admin/src/redirects/PORT.md`
- `packages/admin/src/redirects/SOURCE-RATIONALE.md`
- `packages/admin/src/security/PORT.md`
- `packages/admin/src/seo/PORT.md`
- `packages/admin/src/seo/SOURCE-RATIONALE.md`
- `packages/admin/src/seo/react/pages/SeoPage.tsx`
- `packages/admin/src/source-control/PORT.md`
- `packages/admin/src/widgets/PORT.md`
- `packages/admin/src/widgets/SOURCE-RATIONALE.md`
- `packages/user-management/src/admin/PEOPLE-SOURCE-RATIONALE.md`
- `packages/user-management/src/admin/PORT.md`
- `packages/user-management/src/admin/SOURCE-RATIONALE.md`
- `packages/user-management/src/react/members/Members.tsx`
- `packages/user-management/src/react/users/Users.tsx`
- `packages/user-management/src/react/users/rules.ts`

Diff re-read deletions: none; grammar fixes remained on audited lines.

Files over 500 lines (continue per dispatch): `packages/admin/src/comments/SOURCE-RATIONALE.md` (511), `packages/admin/src/forms/SOURCE-RATIONALE.md` (1604), `packages/admin/src/seo/SOURCE-RATIONALE.md` (1077), `packages/admin/src/widgets/SOURCE-RATIONALE.md` (773), `packages/user-management/src/admin/PEOPLE-SOURCE-RATIONALE.md` (1411), `packages/user-management/src/admin/SOURCE-RATIONALE.md` (555), `packages/user-management/src/react/users/Users.tsx` (959).

## J-CHART — done

Moved the constant verbatim to the internal UI chart module, repointed 3 imports, added only the auto-mode assertion and deleted the one allowed baseline symbol row. Exact symbol grep found only the named source users. No manifest edit.

BREAKING: `DEFAULT_CHART_THEME` removed from `./contracts/charts` (moved into the UI chart host).

Changeset: `.changeset/jy-pads-j-chart.md` (`@jini-ai/core` minor). Combine owes the automatic-theme Chrome look and named mutation.

Files:

- `api-baseline/jini-ai__core.json`
- `packages/core/src/contracts/charts.ts`
- `packages/ui/src/features/charts/__tests__/browser.characterization.test.ts`
- `packages/ui/src/features/charts/browser.ts`
- `packages/ui/src/features/charts/default-theme.ts`
- `packages/ui/src/features/charts/react.tsx`

Diff re-read deletions: none.

Files over 500 lines (continue per dispatch): `api-baseline/jini-ai__core.json` (1778).

## J-MAIL — done

Replaced the local Clock alias with core’s structurally identical Clock import; both slots remain unchanged. 0 test edits. No changeset. Combine must verify the public mail signature remains structurally equivalent.

Files:

- `packages/agent-plugins/src/lifecycle/mail/catalog.ts`

Diff re-read deletions: only the named local Clock alias.

## J-EXPECT-IO — done

Pinned all 4 bad-reply inputs to their exact error-message patterns, preserving input order; pinned filesystem cleanup to ENOENT. 0 new test cases. No production edit or changeset. Named mutations left to cloud.

Files:

- `packages/mcp/src/federation/stdio/__tests__/smoke.test.ts`
- `packages/node-adapters/src/__tests__/runtime-ports.test.ts`

Diff re-read deletion: removed the intermediate const assertion; tuple inference uses satisfies without a cast.

## J-EXPECT-DOMAIN — done

Pinned the existing OAuth rejection to its exact fake error message and member-cursor rejection to its existing validation code/message. 2 assertions strengthened, 0 new cases. No production edit or changeset. Named mutations left to cloud.

Files:

- `packages/oauth/tests/sealed-state-codec.test.ts`
- `packages/user-management/src/admin/__tests__/members.list-cursor.test.ts`

Diff re-read deletions: none.

## J-PREVIEW — done

Renamed 1 emitted class and 4 existing test selector literals. Exact class grep found only the named files.

BREAKING: the image preview dialog class is now `jini-image-preview-modal`.

Changeset: `.changeset/jy-pads-j-preview.md` (`@jini-ai/ui` minor). Combine owes preview open/backdrop/Escape checks after host adoption.

Files:

- `packages/ui/src/features/admin-widgets/__tests__/ImagePreviewModal.unit.test.tsx`
- `packages/ui/src/features/admin-widgets/components/ImagePreviewModal.tsx`

Diff re-read deletions: none.

## J-FORM — done

Renamed 3 emitted class literals. Preserved ids/aria pairs. 0 test edits; pad removal belongs to J-PADS below. Exact class grep found no other producer or selector.

BREAKING: form editor panel class is now `jini-form-editor-panel`.

Changeset: `.changeset/jy-pads-j-form.md` (`@jini-ai/admin` minor). Combine owes the narrow form-name-row Chrome look and panel tab addressing.

Files:

- `packages/admin/src/forms/react/components/FormEditorMainPanel.tsx`

Diff re-read deletions: none.

## J-PADS — done with item skips

Removed 103 unused second parameters from 74 files: admin 71, chat 4, ui 2, ui-kit 12, user-management 14. No tests. 20 item skips are listed in REFRESH.md (10 parallel-owned exclusions, 8 existing size-limit violations, 2 optional parameter spellings outside the named variants). Lowercase functions and real second parameters remain intact. Per-component exact greps checked direct positional callers and Parameters reads.

Changeset: `.changeset/jy-pads-j-pads.md` (patch for each affected package; “components take props only”).

Files and component signatures (each now takes props only):

- `packages/admin/src/agent-plugins/react/components/AgentPluginFileContent.tsx`: `AgentPluginFileContent`
- `packages/admin/src/agent-plugins/react/components/AgentPluginFileTree.tsx`: `AgentPluginFileTree`
- `packages/admin/src/agent-plugins/react/components/AgentPluginInspector.tsx`: `AgentPluginInspector`
- `packages/admin/src/agent-plugins/react/components/AgentPluginListPanel.tsx`: `AgentPluginListPanel`
- `packages/admin/src/agent-plugins/react/pages/AgentPluginsPage.tsx`: `AgentPluginsPage`
- `packages/admin/src/agent-plugins/react/tabs/DownloadedTab.tsx`: `DownloadedTab`
- `packages/admin/src/agent-plugins/react/tabs/InstalledTab.tsx`: `InstalledTab`
- `packages/admin/src/agent-plugins/react/tabs/MarketplaceTab.tsx`: `MarketplaceTab`
- `packages/admin/src/comments/react/components/SettingsFields.tsx`: `CommentsSwitchFields`
- `packages/admin/src/forms/react/components/FieldAttributesDialog.tsx`: `FieldAttributesDialog`
- `packages/admin/src/forms/react/components/FieldAttributesStyling.tsx`: `FieldAttributesActions`, `FieldAttributesStyling`, `FieldAttributeRow`
- `packages/admin/src/forms/react/components/FormEditorFieldsSlot.tsx`: `FormEditorFieldsSlot`
- `packages/admin/src/forms/react/components/FormEditorHeader.tsx`: `FormEditorHeader`
- `packages/admin/src/forms/react/components/FormEditorHeaderText.tsx`: `FormEditorHeaderText`
- `packages/admin/src/forms/react/components/FormEditorMainPanel.tsx`: `FormEditorMainPanel`
- `packages/admin/src/forms/react/components/FormEditorTabStrip.tsx`: `FormEditorTabStrip`
- `packages/admin/src/forms/react/components/FormFieldsEditor.tsx`: `FormFieldsEditor`
- `packages/admin/src/forms/react/components/FormFieldsTableParts.tsx`: `FormFieldsTableFoot`
- `packages/admin/src/forms/react/components/FormSubmissionDate.tsx`: `FormSubmissionDate`
- `packages/admin/src/forms/react/pages/FormEditor.tsx`: `FormEditor`
- `packages/admin/src/forms/react/pages/FormsList.tsx`: `FormsList`
- `packages/admin/src/media/react/components/EditMediaPanel.tsx`: `EditMediaPanel`
- `packages/admin/src/media/react/components/MediaCard.tsx`: `MediaCard`, `MediaPreview`, `PreviewMarkup`
- `packages/admin/src/media/react/components/MediaDialog.tsx`: `MediaDialog`
- `packages/admin/src/media/react/components/MediaGrid.tsx`: `MediaGrid`
- `packages/admin/src/media/react/components/MediaIcons.tsx`: `CloudIcon`, `VideoIcon`, `ImageIcon`, `AllIcon`, `ExpandIcon`, `EyeIcon`, `HiddenEyeIcon`, `ReloadIcon`, `DocumentIcon`
- `packages/admin/src/media/react/components/MediaLightbox.tsx`: `MediaLightbox`
- `packages/admin/src/media/react/components/MediaPicker.tsx`: `MediaPicker`
- `packages/admin/src/media/react/components/MediaPurgeDialog.tsx`: `MediaPurgeDialog`
- `packages/admin/src/media/react/components/UploadButton.tsx`: `UploadButton`
- `packages/admin/src/media/react/pages/MediaPage.tsx`: `MediaPage`
- `packages/admin/src/media/react/tabs/ProvidersTab.tsx`: `ProvidersTab`
- `packages/admin/src/playground/react/components/Canvas.tsx`: `Canvas`
- `packages/admin/src/playground/react/pages/PlaygroundPage.tsx`: `PlaygroundPage`
- `packages/admin/src/playground/react/tabs/CanvasTab.tsx`: `CanvasTab`
- `packages/admin/src/react/OverlayHost.tsx`: `OverlayHost`
- `packages/admin/src/react/kit.tsx`: `AdminKitProvider`
- `packages/admin/src/redirects/react/components/CreateRedirectForm.tsx`: `CreateRedirectForm`, `CreateRedirectFields`, `StatusCodeField`, `RedirectsHeader`
- `packages/admin/src/security/react/components/CredentialEditor.tsx`: `CredentialEditor`
- `packages/admin/src/security/react/pages/SecurityPage.tsx`: `SecurityPage`
- `packages/admin/src/security/react/tabs/AccessTokensTab.tsx`: `AccessTokensTab`
- `packages/admin/src/seo/react/components/MediaPickerBridge.tsx`: `MediaPickerBridge`
- `packages/admin/src/seo/react/components/SeoIcons.tsx`: `SeoEntriesIcon`, `SeoSitemapIcon`, `SeoDefaultsIcon`
- `packages/admin/src/seo/react/tabs/SeoDefaultsSections.tsx`: `SeoSaveActions`, `SeoCrawlingSection`, `SeoSocialPreviewSection`, `SeoSearchAppearanceSection`
- `packages/admin/src/source-control/react/components/SourceControlCredentialFields.tsx`: `SourceControlCredentialFields`
- `packages/admin/src/source-control/react/components/SourceControlProviderRow.tsx`: `SourceControlProviderRow`
- `packages/admin/src/source-control/react/pages/SourceControlPage.tsx`: `SourceControlPage`
- `packages/admin/src/source-control/react/tabs/ProvidersTab.tsx`: `ProvidersTab`
- `packages/admin/src/widgets/react/components/TrashWidgetDialog.tsx`: `TrashWidgetDialog`
- `packages/admin/src/widgets/react/components/WidgetPageHeaders.tsx`: `WidgetRegionEditorHeader`, `WidgetsLibraryHeader`
- `packages/chat/src/react/components/ChatSettingsDialog.tsx`: `ChatSettingsDialog`, `SettingSwitch`
- `packages/chat/src/react/components/ChatSettingsSegmented.tsx`: `ChatSettingsSegmented`
- `packages/chat/src/react/surfaces.tsx`: `ChatSurfacesProvider`
- `packages/ui-kit/src/react/KitProvider.tsx`: `ToastRegion`, `Overlay`, `KitProvider`
- `packages/ui-kit/src/react/confirm/ConfirmDialog.tsx`: `ConfirmDialog`
- `packages/ui-kit/src/react/native/Controls.tsx`: `NativeBadge`, `NativeSpinner`, `NativeNotice`, `NativeToast`
- `packages/ui-kit/src/react/native/Dialog.tsx`: `NativeConfirmDialog`
- `packages/ui-kit/src/react/native/Navigation.tsx`: `NativeTooltip`, `NativeMenu`, `NativeTabs`
- `packages/ui/src/features/tab-strip/react/components/TabBar.tsx`: `TabBar`
- `packages/ui/src/react/kit.tsx`: `UiKitProvider`
- `packages/user-management/src/admin/react/components/DestructiveDialog.tsx`: `DestructiveDialog`
- `packages/user-management/src/admin/react/components/MembersConfirmation.tsx`: `MembersConfirmation`
- `packages/user-management/src/admin/react/components/PermissionPanel.tsx`: `PermissionPanel`
- `packages/user-management/src/admin/react/components/PolicyRow.tsx`: `PolicyRow`
- `packages/user-management/src/admin/react/components/RoleRow.tsx`: `RoleRow`
- `packages/user-management/src/admin/react/components/UsersConfirmation.tsx`: `UsersConfirmation`
- `packages/user-management/src/admin/react/pages/LoginPage.tsx`: `LoginPage`
- `packages/user-management/src/admin/react/pages/MembersPage.tsx`: `MembersPage`
- `packages/user-management/src/admin/react/tabs/AuthTab.tsx`: `AuthTab`
- `packages/user-management/src/admin/react/tabs/MembersTab.tsx`: `MembersTab`
- `packages/user-management/src/admin/react/tabs/PoliciesTab.tsx`: `PoliciesTab`
- `packages/user-management/src/admin/react/tabs/RolesTab.tsx`: `RolesTab`
- `packages/user-management/src/react/kit.tsx`: `UserManagementKitProvider`
- `packages/user-management/src/react/users/ChangeUsernameDialog.tsx`: `ChangeUsernameDialog`

Diff re-read deletions: only the authorized unused parameter spans.

## J-ARGS — done with item skips

Converted 22 functions and 50 calls across 38 files; 16 items skipped in REFRESH.md. Bodies remain unchanged except calls to other named converted functions. Defaults and argument order are preserved; optional object fields retain explicit undefined support. readSavedWidth/saveWidth and all other drafts are excluded.

Changeset: `.changeset/jy-pads-j-args.md`: UI minor (public exports), agent-runtime/cms/core/daemon/integrations/mcp/platform patch (internal helpers). No docs, manifests or generated API files edited by this sheet.

BREAKING: `isCustomSelectEventInside`, `isOutsideHeaderMenu`, `triggerBrowserDownload`, `useWiredBrowserBridgeRegistration`, `useWiredBrowserHistory`, `toastEffectiveTtl` take one object.

Changed signatures (all followed by `_optional = {}`):

- `isUnclaimedOrClaimedBy({ claimedRunId, runId }: { claimedRunId: string | undefined; runId: string | undefined }, _optional = {})` — `packages/daemon/src/http/attachment-records.ts` (1 calls).
- `isStaleSelfRegisteredClient({ record, endpoints, redirectUri }: { record: ExternalMcpServerRecord; endpoints: StoredOAuthEndpoints; redirectUri: string | undefined }, _optional = {})` — `packages/integrations/src/api-connections/hosted-mcp/sign-in-provider.ts` (1 calls).
- `isCustomSelectEventInside({ target, button, menu }: { target: Node; button: HTMLElement | null; menu: HTMLElement | null }, _optional = {})` — `packages/ui/src/react/components/CustomSelect.tsx` (4 calls).
- `isOutsideHeaderMenu({ container, target }: { container: HTMLElement | null; target: EventTarget | null }, _optional = {})` — `packages/ui/src/react/components/HeaderActionsMenu.tsx` (5 calls).
- `emitPendingOpenAiToolUseEvents({ toolCalls, onEvent }: { toolCalls: readonly OpenAiToolCall[]; onEvent: (event: OpenAiTurnEvent) => void }, _optional = {})` — `packages/agent-runtime/src/providers/openai-chat-stream.ts` (1 calls).
- `resolvePostContentRenderContext({ deps, bodyJson, context }: { deps: ResolveHtmlPageEmbedsDeps; bodyJson: JsonObject; context: WidgetResolveContext }, _optional = {})` — `packages/cms/src/widgets/post-content-context.ts` (2 calls).
- `trailingValue({ category, group }: { category: string; group: number }, _optional = {})` — `packages/core/src/redaction-spans.ts` (4 calls).
- `reportPostCloseFailure({ onCleanupFailure, context }: { onCleanupFailure: (context: AgentCleanupFailureContext) => void; context: AgentCleanupFailureContext }, _optional = {})` — `packages/daemon/src/agent-executor/event-cleanup.ts` (4 calls).
- `classifyFailureSafely({ ctx, classifyFailure, context }: { ctx: PostCloseGuardContext; classifyFailure: ClassifyFailure; context: FailureClassificationContext }, _optional = {})` — `packages/daemon/src/agent-executor/event-cleanup.ts` (3 calls).
- `toRunEvent({ runId, entry }: { runId: string; entry: EventLogEntry }, _optional = {})` — `packages/daemon/src/run-lifecycle-events.ts` (4 calls).
- `selfConfigureConnection({ deps, record, redirectUri, options = {} }: { deps: SignInDeps; record: ExternalMcpServerRecord; redirectUri: string | undefined; options?: { readonly configurationOnly?: boolean } | undefined }, _optional = {})` — `packages/integrations/src/api-connections/hosted-mcp/sign-in-configuration.ts` (2 calls).
- `resolveGrantFromDiscovery({ grantTypesSupported, serverId, ports }: { grantTypesSupported: readonly string[]; serverId: string; ports: HostedMcpSignInPorts }, _optional = {})` — `packages/integrations/src/api-connections/hosted-mcp/sign-in-discovery.ts` (1 calls).
- `mintClientForConnection({ deps, record, discovered, input }: { deps: SignInDeps; record: ExternalMcpServerRecord; discovered: DiscoveredOAuthConfiguration; input: { readonly redirectUri: string | undefined; readonly scopes: readonly string[]; readonly grant: ExternalMcpOAuthGrant } }, _optional = {})` — `packages/integrations/src/api-connections/hosted-mcp/sign-in-discovery.ts` (1 calls).
- `resolveWriteGrantAttribution({ input, writeAllowedToolNames, existing, nowIso }: { input: Pick<SaveExternalMcpServerInput, "principalId">; writeAllowedToolNames: readonly string[]; existing: ExternalMcpServerRecord | null; nowIso: ISODateTime }, _optional = {})` — `packages/mcp/src/federation/hosted/access.ts` (1 calls).
- `resolveExternalMcpAccessToken({ record, oauth, settingsLink, reauthRequiredCode }: { record: ExternalMcpServerRecord; oauth: ExternalMcpOAuthTokenResolverPort | undefined; settingsLink: Pick<HostedMcpStorePorts, "settingsLink" | "reauthRequiredCode">["settingsLink"]; reauthRequiredCode: Pick<HostedMcpStorePorts, "settingsLink" | "reauthRequiredCode">["reauthRequiredCode"] }, _optional = {})` — `packages/mcp/src/federation/hosted/store-credentials.ts` (2 calls).
- `resolveSavedCredentialColumns({ deps, identity, context }: { deps: SealDeps; identity: ExternalMcpIdentity; context: {
    readonly authMode: ExternalMcpAuthMode;
    readonly transport: ExternalMcpTransport;
    readonly input: SaveExternalMcpServerInput;
    readonly oauthFields: ResolvedOAuthFields;
    readonly keepToken: boolean;
    readonly existing: ExternalMcpServerRecord | null;
  } }, _optional = {})` — `packages/mcp/src/federation/hosted/store-credentials.ts` (1 calls).
- `createManifest({ target, state, patch = {} }: { target: NormalizedTarget; state: "complete" | "partial"; patch?: Partial<Pick<DownloadManifest, "totalBytes" | "validators">> | undefined }, _optional = {})` — `packages/platform/src/download-store.ts` (3 calls).
- `downloadWithRetries({ target, manifest, options }: { target: NormalizedTarget; manifest: DownloadManifest | null; options: {
    emit: (progress: ManagedDownloadProgress) => void;
    fetchImpl: typeof globalThis.fetch;
    maxAttempts: number;
    requestHeaders?: Record<string, string> | undefined;
  } }, _optional = {})` — `packages/platform/src/download-transfer.ts` (1 calls).
- `triggerBrowserDownload({ blob, filename }: { blob: Blob; filename: string }, _optional = {})` — `packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.ts` (2 calls).
- `useWiredBrowserBridgeRegistration({ scopeKey, handle }: { scopeKey: string | undefined; handle: BrowserTabHandle | null }, _optional = {})` — `packages/ui/src/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.ts` (1 calls).
- `useWiredBrowserHistory({ scopeKey, options }: { scopeKey: string; options?: UseBrowserHistoryOptions | undefined }, _optional = {})` — `packages/ui/src/features/browser-chrome/react/hooks/useBrowserHistory.ts` (1 calls).
- `toastEffectiveTtl({ code, ttlMs }: { code: string | null | undefined; ttlMs: number }, _optional = {})` — `packages/ui/src/react/components/Toast.tsx` (5 calls).

Files:

- `packages/agent-runtime/src/providers/openai-chat-request.ts`
- `packages/agent-runtime/src/providers/openai-chat-stream.ts`
- `packages/cms/src/widgets/content-embed-resolution.ts`
- `packages/cms/src/widgets/post-content-context.ts`
- `packages/cms/src/widgets/post-embed-resolution.ts`
- `packages/core/src/redaction-collectors.ts`
- `packages/core/src/redaction-spans.ts`
- `packages/daemon/src/agent-executor/acp-events.ts`
- `packages/daemon/src/agent-executor/child-lifecycle.ts`
- `packages/daemon/src/agent-executor/event-cleanup.ts`
- `packages/daemon/src/agent-executor/pi-rpc-events.ts`
- `packages/daemon/src/http/attachment-records.ts`
- `packages/daemon/src/http/disk-attachment-store.ts`
- `packages/daemon/src/run-lifecycle-events.ts`
- `packages/daemon/src/run-lifecycle-transitions.ts`
- `packages/integrations/src/api-connections/hosted-mcp/sign-in-configuration.ts`
- `packages/integrations/src/api-connections/hosted-mcp/sign-in-discovery.ts`
- `packages/integrations/src/api-connections/hosted-mcp/sign-in-provider.ts`
- `packages/integrations/src/api-connections/hosted-mcp/sign-in.ts`
- `packages/mcp/src/federation/hosted/access.ts`
- `packages/mcp/src/federation/hosted/store-config.ts`
- `packages/mcp/src/federation/hosted/store-credentials.ts`
- `packages/mcp/src/federation/hosted/store.ts`
- `packages/platform/src/download-state.ts`
- `packages/platform/src/download-store.ts`
- `packages/platform/src/download-transfer.ts`
- `packages/ui/src/features/asset-tree-browser/__tests__/react/hooks/useAssetTreeBatchActions.test.ts`
- `packages/ui/src/features/asset-tree-browser/react/hooks/useAssetTreeBatchActions.ts`
- `packages/ui/src/features/browser-chrome/__tests__/react/hooks/useBrowserBridgeRegistration.test.ts`
- `packages/ui/src/features/browser-chrome/__tests__/react/hooks/useBrowserHistory.test.ts`
- `packages/ui/src/features/browser-chrome/react/hooks/useBrowserBridgeRegistration.ts`
- `packages/ui/src/features/browser-chrome/react/hooks/useBrowserHistory.ts`
- `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx`
- `packages/ui/src/react/__tests__/components/HeaderActionsMenu.test.tsx`
- `packages/ui/src/react/__tests__/components/Toast.test.tsx`
- `packages/ui/src/react/components/CustomSelect.tsx`
- `packages/ui/src/react/components/HeaderActionsMenu.tsx`
- `packages/ui/src/react/components/Toast.tsx`

Diff re-read deletions: none beyond the named positional signatures. Public docs/API fingerprints await coordinator refresh.

Files over 500 lines (continue per dispatch): `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx` (952), `packages/ui/src/react/components/CustomSelect.tsx` (644).
