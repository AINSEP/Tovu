X4 admin: 141 files; 86 MOVE, 55 STAYS-HOST, 29 sheets

| File, relative to `apps/admin/src/` | Verdict | Sheet id | Reason |
|---|---|---|---|
| `components/Placeholder.tsx` | STAYS-HOST | A01 | Jini renders both views. Tovu supplies its nav registry, labels and localized copy. |
| `hooks/use-admin-locale.hooks.ts` | MOVE | A01 | Duplicates Jini’s boot-scoped query and refresh hook. |
| `lib/browser-telemetry.ts` | STAYS-HOST | A01 | Binds Jini’s collector to the authenticated endpoint, initial route, timers and test mode. |
| `lib/server-reconnect.ts` | STAYS-HOST | A01 | Binds Jini’s reconnect engine to `/readyz`, the dev-proxy handshake and test mode. |
| `lib/settings-events.ts` | STAYS-HOST | A01 | Binds Jini’s feed to the workspace URL, principal, host event buses and theme-preview frames. |
| `features/settings/ai-agent-presentation.ts` | STAYS-HOST | A02 | Binds Jini’s warning rule to copy and detects Tovu’s preload bridges. |
| `hooks/use-admin-execution-credential.hooks.ts` | STAYS-HOST | A02 | Jini owns save state and footer selection. This binds migration, redaction, ledger events and copy. |
| `lib/credential-copy.ts` | STAYS-HOST | A02 | Binds existing Jini hint and draft rules to the token validator and Tovu translations. |
| `lib/execution-settings.ts` | STAYS-HOST | A02 | Jini owns the ledger and HTTP adapter. This binds Tovu credentials, defaults and its legacy browser key. |
| `features/settings/SettingsUi.tsx` | MOVE | A03 | Owns the settings shell, readiness gate, tab composition and common view behavior. |
| `hooks/use-admin-appearance.hooks.ts` | STAYS-HOST | A03 | Jini owns draft arbitration. This supplies the theme store, ledger namespace and CSS painting. |
| `lib/settings-tabs.ts` | MOVE | A03 | Owns typed slice decoding, serialization and diff writes in addition to host defaults. |
| `lib/ag-ui-approval-relay.ts` | MOVE | A04 | Owns parked-turn state, one-use resume and approval routing. |
| `lib/durable-run-subscription.ts` | STAYS-HOST | A04 | Binds the existing Jini follower to Tovu’s path, notices, run map and page activity. |
| `components/AssistantDock/ChatCleanupPanel.tsx` | MOVE | A05 | Owns selection and review controls around the existing Jini cleanup dialog. |
| `components/AssistantDock/DockCleanupHeader.tsx` | MOVE | A05 | Projects cleanup selection, pinning and the confirmation accessory into the shared header. |
| `components/AssistantDock/chat-cleanup-copy.ts` | STAYS-HOST | A05 | Supplies the dock dictionary’s wording, reason labels and localized count text. |
| `components/AssistantDock/chat-cleanup-kit.tsx` | STAYS-HOST | A05 | Adapts the selected UI-kit Button to the cleanup view’s native-button slot. |
| `components/AssistantDock/hooks/chat-cleanup.hooks.ts` | MOVE | A05 | Owns overlay, preview and confirmed selected-delete state. |
| `components/AssistantDock/AssistantDock.state.hooks.ts` | MOVE | A06 | Owns the order and composition of dock session, composer and run state. |
| `components/AssistantDock/AssistantDock.tsx` | MOVE | A06 | Owns the reusable dock entry and its state-to-pane contract. |
| `components/AssistantDock/DockChatPane.tsx` | MOVE | A06 | Owns generic chat-pane prop assembly and rendering. |
| `components/AssistantDock/assistant-dock-props.tsx` | MOVE | A06 | Owns execution projection and conditional footer composition. |
| `components/AssistantDock/hooks/agents-inventory.hooks.ts` | MOVE | A06 | Owns accepted snapshots, expiry, pending backoff and resume-capability tracking. |
| `components/AssistantDock/hooks/assistant-transport.binding.ts` | STAYS-HOST | A06 | Supplies Tovu’s transport, canary and saved-selection readers to Jini. |
| `components/AssistantDock/hooks/byok-runtime.hooks.ts` | STAYS-HOST | A06 | Binds Jini’s BYOK runtime to Tovu’s presets, credential and execution writes. |
| `components/AssistantDock/hooks/composer-discovery.hooks.ts` | MOVE | A06 | Owns live refresh subscription and polling lifecycle not covered by Jini’s discovery hooks. |
| `components/AssistantDock/hooks/composer-files.hooks.ts` | STAYS-HOST | A06 | Binds existing Jini hooks to Tovu’s limits, wording, manifests and desktop folder port. |
| `components/AssistantDock/hooks/execution-config.hooks.ts` | STAYS-HOST | A06 | Binds existing Jini ledger and config hooks to host reads, writes and refresh events. |
| `components/AssistantDock/hooks/local-cli-selection.hooks.ts` | STAYS-HOST | A06 | Binds Jini selection to the host’s local CLI, persisted selection and policy. |
| `components/AssistantDock/hooks/messages-change.hooks.ts` | MOVE | A06 | Owns load-echo suppression and run/tool progress refresh arbitration. |
| `components/AssistantDock/hooks/runtime-access.hooks.ts` | MOVE | A06 | Owns health-request coalescing and placeholder snapshot selection. |
| `components/MediaPickerDialog/media-picker-host.tsx` | STAYS-HOST | A07 | Selects the live picker service and injects the host API, redaction, locale and kit. |
| `features/media/ExternalProvidersPanel.tsx` | MOVE | A07 | Owns provider roster rendering and empty-state behavior. |
| `features/media/Media.tsx` | MOVE | A07 | Owns the library, cards, toolbar, detail, modal and tab views. |
| `features/media/MediaLoadMore.tsx` | MOVE | A07 | Owns the paging and retry affordance. |
| `features/media/api/media-api.ts` | STAYS-HOST | A07 | Binds Jini’s existing media client to request and public-site URL. |
| `features/media/chrome-playback-note.tsx` | MOVE | A07 | Owns the codec/size predicate and advisory view. The size policy is a host input. |
| `features/media/hooks/use-edit-media-panel.hooks.ts` | MOVE | A07 | Owns edit drafts, patch shaping and save settlement. |
| `features/media/hooks/use-grid-pages.hooks.ts` | MOVE | A07 | Owns page merging, cursor and stale-view handling. |
| `features/media/hooks/use-media-preview.hooks.ts` | STAYS-HOST | A07 | Binds Jini’s preview hook to the live media port. |
| `features/media/hooks/use-media-writes.hooks.ts` | MOVE | A07 | Owns mutation state and refresh sequencing. |
| `features/media/hooks/use-media.hooks.ts` | MOVE | A07 | Owns list orchestration, grid state, permissions and tab selection. |
| `features/media/media-grid-i18n.ts` | STAYS-HOST | A07 | Supplies a locale overlay to the Tovu media dictionary. |
| `features/media/media-icons.tsx` | MOVE | A07 | Owns portable media card and toolbar SVGs. |
| `features/media/upload-size-copy.ts` | STAYS-HOST | A07 | Maps the Tovu request envelope and ordinary upload limit to host wording. |
| `features/media/use-media-provider-catalog.hooks.ts` | MOVE | A07 | Owns mount-scoped catalog state shared by rows and count. |
| `features/library/Library.tsx` | STAYS-HOST | A08 | Mounts Jini Library with the live controller hook. |
| `features/library/hooks/library-dependencies.hooks.ts` | STAYS-HOST | A08 | Production code binds Jini’s port factory to Tovu clients. The fake is test-only. |
| `components/EmbedInsertControl/EmbedInsertControl.hooks.tsx` | STAYS-HOST | A09 | Binds Jini to this editor’s add-control, placement IDs and translator. |
| `components/EmbedInsertControl/EmbedInsertControl.tsx` | STAYS-HOST | A09 | Mounts the CMS view with Tovu’s editor and picker collaborators. |
| `components/WidgetConfigFields/HtmlAttributeRows.tsx` | STAYS-HOST | A09 | Binds the CMS view to the host’s attribute policy, styles and tip. |
| `components/WidgetConfigFields/MediaContentEditor.hooks.ts` | MOVE | A09 | Owns draft transforms, item lists, layout fields and picker retirement. |
| `components/WidgetConfigFields/MediaContentEditor.tsx` | MOVE | A09 | Owns content, HTML and preview rendering. |
| `components/WidgetConfigFields/WidgetConfigFields.tsx` | STAYS-HOST | A09 | Mounts the Jini view with the media editor, translator and validation policy. |
| `components/WidgetConfigFields/widget-config-host-policy.ts` | STAYS-HOST | A09 | Selects the host’s allowed widget roster and initial config per type. |
| `components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx` | MOVE | A09 | Owns existing/new selection, creation and add-control state. |
| `components/WidgetPickerDialog/WidgetPickerDialog.tsx` | MOVE | A09 | Owns picker, selection dialog and add-control rendering. |
| `features/collections/collection-entry-panel.tsx` | STAYS-HOST | A10 | Mounts the CMS entry editor with TipTap, taxonomy, locale and the live controller. |
| `features/database/Database.tsx` | STAYS-HOST | A11 | Mounts the Jini screen with timeline, schema and migration controllers. |
| `features/deployment/StaticSiteTab.tsx` | MOVE | A12 | Owns build, preview, credential setup and publish UI. |
| `features/deployment/deployment-classes.ts` | STAYS-HOST | A12 | Supplies Tovu stylesheet classes to neutral views. |
| `features/deployment/deployment-host-policy.ts` | STAYS-HOST | A12 | Supplies Tovu capabilities, environment names and operator wording. |
| `features/deployment/deployment-panel.tsx` | MOVE | A12 | Already binds the shell, but still implements the disposable browser download. |
| `features/deployment/hooks/use-deployment-overview.hooks.ts` | STAYS-HOST | A12 | Calls the existing DevOps hook with Tovu’s client, query hook and error translator. |
| `features/deployment/hooks/use-publish-credentials.hooks.ts` | MOVE | A12 | Owns credential draft and row write/verify transitions. |
| `features/deployment/hooks/use-static-export.hooks.ts` | MOVE | A12 | Owns export trigger, status and polling state. |
| `features/deployment/hooks/use-static-publish.hooks.ts` | MOVE | A12 | Owns per-target drafts, preview invalidation, trigger and polling. |
| `features/email/Email.tsx` | MOVE | A13 | Owns the five-tab shell, status rendering and URL section selection. |
| `features/email/EmailProviderTab.tsx` | MOVE | A13 | Owns provider cards, lanes and credential form presentation. |
| `features/email/EmailSegments.tsx` | MOVE | A13 | Owns named radiogroup and choice projection around the injected segmented control. |
| `features/email/EmailTemplateEditor.tsx` | MOVE | A13 | Owns template editing UI, preview modes and keyboard/navigation behavior. |
| `features/fs-files/api/fs-files-api.ts` | STAYS-HOST | A14 | Binds the existing CMS client and desktop `tovuFiles` bridge, including host error projection. |
| `features/import-export/ImportExport.tsx` | MOVE | A15 | Duplicates the existing Jini Import/Export shell. |
| `features/integrations/integration-deliveries-panel.tsx` | STAYS-HOST | A16 | Binds the Webhooks view to the delivery hook, kit, status labels and timezone. |
| `features/menus/hooks/use-route-guarded-menu-editor.hooks.ts` | MOVE | A17 | Owns listener lifetime and dirty-navigation cancellation. |
| `features/pages/PageEditor.tsx` | MOVE | A18 | Owns editor chrome, surface selection and recovery/conflict notices. |
| `features/pages/PageEditorPreview.tsx` | MOVE | A18 | Owns preview/source selection, frame lifecycle and embed presentation. |
| `features/pages/hooks/use-page-editor.hooks.ts` | MOVE | A18 | Owns editor state, flush, save, conflicts and preview orchestration. |
| `features/pages/hooks/use-preview-embed-ids.hooks.ts` | MOVE | A18 | Owns debounce, latest-input ownership and embed-ID loading. |
| `features/pages/page-external-change-bindings.ts` | STAYS-HOST | A18 | Binds the shared change banner to Tovu labels and handles. |
| `features/pages/rules.ts` | MOVE | A18 | Owns reusable editor surface decisions alongside Tovu routes and theme policy. |
| `features/plugins/AgentPluginDetailsModal.tsx` | MOVE | A19 | Owns the details and file/surface view switching. |
| `features/plugins/AgentPlugins.tsx` | MOVE | A19 | Owns the installed/downloaded/marketplace views and row composition. |
| `features/plugins/PluginProviderSettingsDialog.tsx` | MOVE | A19 | Owns grouped settings rendering and focus behavior. |
| `features/plugins/Plugins.tsx` | MOVE | A19 | Owns the site-plugin screen, tab and overlay choreography. |
| `features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts` | STAYS-HOST | A19 | Binds the existing Jini upload/digest factory. The fake is test-only. |
| `features/plugins/hooks/plugin-install-dependencies.hooks.ts` | STAYS-HOST | A19 | Binds the existing Jini preview/install factory. The fake is test-only. |
| `features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts` | STAYS-HOST | A19 | Binds Jini’s modal hook to live metadata, files, package opening and copy. |
| `features/plugins/hooks/use-agent-plugins.hooks.ts` | MOVE | A19 | Owns list, inspect and toggle reconciliation. |
| `features/plugins/hooks/use-plugin-package-files.hooks.ts` | STAYS-HOST | A19 | Binds existing Jini file-query behavior to the live client and error policy. |
| `features/plugins/hooks/use-plugins.hooks.ts` | STAYS-HOST | A19 | Binds existing Jini list and mutation hooks to live ports and installed policy. |
| `features/posts/Posts.tsx` | MOVE | A20 | Owns post-list rendering, row actions and notices. |
| `features/posts/editor/notices/PostEditorNotices.tsx` | MOVE | A20 | Owns notice ordering and suppression, not the leaf banners. |
| `features/posts/hooks/post-cover-host.hooks.ts` | STAYS-HOST | A20 | Binds shared cover behavior to Tovu renditions, picker, kit and theme rules. |
| `features/posts/hooks/use-posts.hooks.ts` | MOVE | A20 | Owns stale-aware selection, reads, writes and row handles. |
| `features/posts/rules.ts` | MOVE | A20 | Contains portable list, draft, conflict, preview and date rules mixed with editor bindings. |
| `features/providers/Providers.tsx` | MOVE | A25 | Owns tab and status projection across integration panels. |
| `features/publish-content/PublishContentDialog.hooks.tsx` | MOVE | A22 | Owns report-row rendering and selection/overwrite affordances. |
| `features/publish-content/PublishContentDialog.tsx` | MOVE | A22 | Owns peer, plan, report and confirmation UI. |
| `features/publish-content/hooks/use-publish-content-confirm.hooks.ts` | MOVE | A22 | Owns plan/confirm/execute state and guarding effects. |
| `features/publish-content/publish-section-button-binding.tsx` | STAYS-HOST | A22 | Supplies section IDs, app-store hook and labels to Jini’s existing button. |
| `features/recovery/recovery-panel.tsx` | STAYS-HOST | A23 | Binds the DB view to live controllers, navigation, kit and wording. |
| `features/routines/RoutineForm.tsx` | MOVE | A21 | Owns routine draft form, submit controls and picker integration. |
| `features/routines/Routines.hooks.ts` | MOVE | A21 | Owns polling, visibility, refresh and mutation settlement. |
| `features/routines/Routines.tsx` | MOVE | A21 | Owns table, actions and availability rendering. |
| `features/routines/RoutinesMount.tsx` | MOVE | A21 | Owns the release-gated mount order before controller work. |
| `features/routines/index.ts` | STAYS-HOST | A21 | Binds endpoint, live request, timers, focus, kit and release input. |
| `features/routines/project-routine-row.ts` | MOVE | A21 | Owns routine schedule, run state and conversation-row projection. |
| `features/routines/routines-api.ts` | MOVE | A21 | Owns versioned wire operations and refusal normalization. |
| `features/routines/routines-i18n.ts` | STAYS-HOST | A21 | Supplies Tovu’s locale table, desktop wording and missing-conversation copy. |
| `features/routines/use-conversation-deep-link.ts` | MOVE | A21 | Owns consume-once semantics and distinguishes confirmed absence from failing lookup. |
| `features/security/AccessTokensTab.hooks.tsx` | MOVE | A24 | Owns dialog state and merged credential ordering. |
| `features/security/AccessTokensTab.tsx` | MOVE | A24 | Owns the live list, filters and credential edit/copy/remove UX. |
| `features/security/OtherCredentialsSection.hooks.tsx` | MOVE | A24 | Owns removal dialog state and row handles. |
| `features/security/OtherCredentialsSection.tsx` | MOVE | A24 | Owns credential group, placeholder, replace and remove views. |
| `features/security/RecoveryCodesCard.tsx` | MOVE | A24 | Duplicates Jini’s recovery kit UI and sequencing. |
| `features/security/Security.tsx` | MOVE | A24 | Duplicates site-key permission-aware shell logic already in Jini. |
| `features/security/access-token-forms.ts` | MOVE | A24 | Owns form readiness, input/patch shaping and failure classification. |
| `features/security/hooks/copy-keys-dependencies.hooks.ts` | STAYS-HOST | A24 | Injects copy policy, live client and host refresh event into Jini. |
| `features/security/hooks/use-access-tokens.hooks.ts` | MOVE | A24 | Owns multi-store precedence, refresh, drafts and mutation orchestration. |
| `features/security/hooks/use-other-credentials.hooks.ts` | MOVE | A24 | Owns per-store load/replace/remove state and settled reload behavior. |
| `features/security/other-credential-stores.ts` | MOVE | A24 | Owns reusable matching and display projection mixed with a Tovu store/link catalog. |
| `features/settings/ExternalMcpAdmissionsBanner.tsx` | MOVE | A25 | Duplicates Jini’s banner, with host presentation collaborators still local. |
| `features/settings/ExternalMcpSettingsPanel.hooks.tsx` | MOVE | A25 | Duplicates Jini’s add-form, intent and drift logic. |
| `features/settings/ExternalMcpSettingsPanel.tsx` | MOVE | A25 | Owns source cards and add, list, edit and remove orchestration. |
| `features/settings/SettingsUi.tsx` | MOVE | A03 | Listed above under the Settings UI sheet. |
| `features/settings/hooks/use-external-mcp-admissions.hooks.ts` | MOVE | A25 | Owns bounded admission retry, restart observation and refusal projection. |
| `features/settings/hooks/use-external-mcp-tool-picker.hooks.ts` | STAYS-HOST | A25 | Binds the existing picker to the live probe client, error recognition and Tovu copy. |
| `features/settings/hooks/use-external-mcp.hooks.ts` | MOVE | A25 | Owns source projection, update shaping, versioning and reload behavior. |
| `features/skills/api.ts` | STAYS-HOST | A26 | Binds Jini’s client to request, host event, prompt instructions and refusal copy. |
| `features/skills/skills-host.hooks.ts` | STAYS-HOST | A26 | Supplies browser events, query hooks, notices and confirmation to existing Jini hooks. |
| `features/source-control/source-control-panel.tsx` | STAYS-HOST | A27 | Binds the existing DevOps shell and provider view to navigation, classes, copy and credentials. |
| `features/storage/Storage.tsx` | MOVE | A28 | Owns the screen and screenshot review UI around Jini’s existing storage panel. |
| `features/storage/api/screenshot-cleanup-api.ts` | MOVE | A28 | Owns preview/apply wire shapes and the client factory. |
| `features/storage/api/storage-api.ts` | MOVE | A28 | Owns report/cleanup wire shapes and the client factory. |
| `features/storage/hooks/use-screenshot-cleanup.hooks.ts` | MOVE | A28 | Owns the screenshot preview, confirm and outcome state. |
| `features/storage/hooks/use-storage.hooks.ts` | MOVE | A28 | Owns the report, dry-run, confirmation and live-pass transition. |
| `features/storage/index.ts` | MOVE | A28 | Forwarding barrel to delete; no Jini counterpart needed. |
| `features/storage/storage-i18n.ts` | STAYS-HOST | A28 | Supplies the Tovu storage dictionary and locale fallback. |
| `features/trash/Trash.tsx` | STAYS-HOST | A29 | Mounts the existing Jini Trash screen. |
| `features/trash/hooks/use-trash.hooks.ts` | STAYS-HOST | A29 | Binds Jini’s hook to the live port, locale and error presentation. |

## Count and build conventions

I recovered `scan.mjs` from Tovu `b70d23a28e` and the five count documents from `ab82b224fa`. I ran the scanner and the `combine-18-plan.mjs` classification in memory, omitting file writes. The scanner’s test exclusion and the planner’s original keep and shell rules ran before removing the `theme` and `adm-themes` areas. Expanding the five documents as specified produced **3,615 rules**. The result was **977 planner candidates → 449 after keeps**, including **374 → 141** in admin. Admin has no source diff from the report’s count anchor `1b05ab3763` to checkout `a96020e1e7`, which equals `origin/codex/m24-tip`. Jini comparisons used `origin/integ/merge-24-2026-11-25` at `0718702bb`. MOVE includes duplicate removal and the one dead forwarding path, not just new Jini code.

For each sheet, write the indicated characterization first against the current behavior and record the named mutation. The coordinator runs the tests and mutations. Use Jini first, then Tovu. For each new public path add `exports` and `jini.entries`, and mirror `typesVersions` where the package uses it. React/DOM paths are `browser`, pure paths are `universal`. Add `.changeset/x4-aNN.md` at `minor` for the Jini packages changed by that sheet. A reuse-only or host-only sheet with no Jini code or export change has no changeset. Retain why-comments, wire formats and effect order. New package functions take `(required, _optional = {})`, and hook props are required. Keep product wiring in Tovu and never import it back into Jini. No new route, capability, permission, flag flip, or theme edit.

**Importer rule.** The Tovu ledgers below identify production entry points and non-obvious outside consumers. For each deleted or split symbol, also update every resolved relative or `@/` import, barrel, type import/query, dynamic import and Vitest mock in `apps/admin` that targets it. Keep Tovu imports only for symbols still genuinely bound there. Retarget test fixtures to the existing package seam or the remaining host binding as appropriate. Don’t add forwarding barrels to preserve old paths. For the done check, rerun the same counter with exact, reviewed keep entries for the surviving host bindings/policy files. Do not use directory-wide exemptions or add a keep for a file that still owns generic behavior.

**Stop rule.** Recheck named source and destination anchors before each half. Stop the affected half if parity, package isolation, or the ≤80-line, ≤10-complexity and ≤500-line limits cannot be attained with the named cuts. No blanket debt exceptions. No other slice is required for the cuts below. Where a surface calls a held server or desktop feature, bind the current contract and keep the hold.

## Build sheets

### A01 — Shell browser, locale and fallback

**Test first.** In `hooks/__tests__/use-admin-locale.hooks.test.ts`, pin the newer scoped locale winning over a late old read after refresh. Mutation `locale-drop-refresh-invalidation` removes the invalidation. For the retained feed, preserve the existing `lib/__tests__/settings-feed-principal.unit.test.ts` principal isolation and `settings-events.unit.test.ts` supplemental event behavior.

**Jini.** Reuse `@jini-ai/admin/shell/hooks/use-admin-locale.hooks#useAdminLocale` as-is. It already takes boot scope, query/invalidate hooks, prefix, fallback and mount-captured port. Reuse `admin/browser` telemetry, reconnect and feed entries, and `admin/react/shell/Placeholder` with no export changes.

**Tovu.** Replace the duplicate hook body with calls into Jini. Keep `hooks/use-admin-locale.hooks.ts` as a compatibility-shaped **binding**, not a re-export: its injected-port callers still need the host query and boot configuration. Existing no-argument consumers can keep the binding. `admin-locale-dependencies.hooks.ts` already binds Jini for the kit, so don’t introduce another cache or key. Leave the four verified host files on their paths, including the `themePreview=1` supplemental feed and return/dispose behavior.

### A02 — Execution wiring and credential copy

**Test first.** Extend `lib/__tests__/execution-settings.binding.nonsecret-ledger-and-rollback.unit.test.ts` to pin that saving config never sends a typed secret to the ledger. Mutation `execution-ledger-send-key`. In `hooks/__tests__/admin-execution-credential.binding.refused-save.unit.test.tsx`, pin that refused save leaves the legacy key intact, mutation `execution-clear-legacy-on-refusal`.

**Jini.** Reuse `@jini-ai/admin/shell/lib/execution-settings-ledger`, `@jini-ai/ui`’s `createExecutionHttpAdapter` and `useExecutionCredential`, `@jini-ai/chat/react/admin-execution/ai-agent-presentation`, and `@jini-ai/integrations/react/{admin-credentials/byok-footer-status,credentials/credential-copy}`. Draft classification already lives in `@jini-ai/admin/security`. No new exports.

**Tovu.** Keep all four files as bindings/policy. Keep the legacy key and migration read local, including explicit post-save removal. Keep Tovu’s preload detection, exception recognizer, provider defaults and footer text at their existing seams. `AiAssistant`, Settings, AssistantDock and the credential callers retain their bound imports.

### A03 — Settings UI, typed slices and appearance

**Test first.** In `features/settings/__tests__/SettingsUi.bound-tabs-and-legacy-links.unit.test.tsx`, pin a legacy tab’s resolved content and unchanged replacement history after all required reads settle. Mutation `settings-open-before-slices-ready`. In `lib/__tests__/settings-tabs.test.ts`, assert that a one-field change sends only its existing field write with the original scope and that a no-op sends none. Mutation `settings-send-full-slice`.

**Jini.** Add `@jini-ai/admin/screens/settings/SettingsUi` and `@jini-ai/admin/core/settings/settings-tabs`, implementing `SettingsUi` and the existing typed `load*`/`save*` behavior over injected ledger reads/writes, scope, namespaces and defaults. Keep serialization and sentinel handling in that one package owner. Keep `SettingsUiShell` and `SettingsExecutionPanel` in the screen. Cut the existing tab bodies into `SettingsGeneralTabs.tsx`, `SettingsPrivacyTab.tsx` and `SettingsMemoryTab.tsx` at the existing tab entries, without moving hooks across the loading gate. Required inputs are the current settings, execution, credential, agent-presentation and locale hooks, plus tab/body, theme, mem­ory, product-copy and navigation collaborators. Reuse the existing `SettingsUi.hooks.ts`, locale-sync hook and appearance arbitration instead of copying them.

**Tovu.** Keep `SettingsUi.tsx` as the route binding and `settings-tabs.ts` as bound slices plus Tovu namespaces, locale catalog, defaults and theme/consent policy. Package-only types and pure helpers go direct from `features/settings/{index.ts,AdminAppearance.tsx,hooks/*}`, `hooks/{admin-locale-dependencies,use-admin-appearance-snapshot,use-admin-appearance,use-interface-preferences}.hooks.ts`, `features/sites/hooks/use-site-list-prefs.hooks.ts`, `components/Placeholder.tsx` and the admin theme hook if it already uses the now-shared shape. Leave the theme implementation and CSS untouched. `use-admin-appearance.hooks.ts` stays the painter and snapshot binding.

### A04 — AG-UI approval relay and transport binding

**Test first.** In `lib/__tests__/assistant-transport.ag-ui.approvals.unit.test.ts`, pin two clicks on one parked exchange producing one resume with the original parent run, and an unmatched exchange reaching the original fallback. Mutation `agui-drop-one-use-claim`.

**Jini.** Add `@jini-ai/chat/transports/ag-ui/approval-relay` from `chat/src/core/assistant-client/ag-ui-approval-relay.ts`. Export `createAgUiApprovalRelay`, `routeApprovalToolCall` and their existing public types. Keep the public AG-UI transport entry unchanged. Inject the approval/refusal copy and MCP-UI fallback. Use the existing AG-UI/core/wire types, not daemon runtime imports. Preserve canonical run identity, the durable sink and held completion order. Split `createAgUiApprovalRelay`’s segment callback construction into `segmentHandlersFor` only if needed for complexity, with the same `turn` and settlement closures.

**Tovu.** Repoint `lib/assistant-transport-ag-ui.ts` and `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts` before deleting the relay. Keep its copy and fallback at those mounts, without changing the AG-UI canary. The durable follower file remains the path, notice and activity binding.

### A05 — Dock chat cleanup

**Test first.** Extend `components/AssistantDock/__tests__/chat-cleanup.unit.test.tsx`. After selection, cancel the visible confirmation and assert no delete. Accept it and assert exactly the selected IDs are sent. Mutation `chat-cleanup-delete-before-confirm`. Keep the native `onClick` adapter assertion against the real Button kit.

**Jini.** Add `@jini-ai/chat/react/chat-cleanup/{ChatCleanupPanel,chat-cleanup.hooks}` from the two source files. Export the panel, cleanup hooks and the existing controller/client/kit/confirm types. Reuse `ChatCleanupDialog`, list hooks and the current server cleanup contract. Inject the host client, copy and clock/list collaborators. Add `@jini-ai/admin/shell/components/AssistantDock/DockCleanupHeader` for the existing header projection, taking `ChatCleanupPanel` and `useChatCleanup` as required inputs so admin doesn’t acquire a chat runtime dependency.

**Tovu.** Repoint `hooks/assistant-chats-dependencies.hooks.ts`, `chat-cleanup-kit.tsx` and `DockChatPane.tsx` to the package contracts. Bind the header’s panel/hook at the dock mount. Delete all three MOVE files. Keep the copy and kit bindings. No cleanup scheduling or change to what counts as a deletable chat.

### A06 — Assistant dock composition and runtime inventory

**Test first.** In `components/AssistantDock/__tests__/{agents-loader.unit.test.ts,use-messages-change-handler.unit.test.tsx,assistant-dock-hook-injection.unit.test.tsx}`, pin an empty inventory during restart not becoming a completed cache value, one content refresh for one new tool result without re-publishing on replay, and required hooks flowing to the pane. Mutations `dock-cache-empty-inventory` and `dock-republish-tool-result`.

**Jini.** Add `@jini-ai/admin/shell/components/AssistantDock/{AssistantDock,AssistantDock.state.hooks,DockChatPane,assistant-dock-props,hooks/agents-inventory.hooks,hooks/runtime-access.hooks,hooks/messages-change.hooks}`. Export the present public symbols for those files. Extend the existing `hooks/composer-discovery.hooks` with the residual subscription lifetime and polling orchestration, not a second discovery resolver. Reuse the existing files, transport, BYOK, execution, local-CLI and run-context hooks. Inject chat pane and cleanup-header view, UI kit, posted-answer handlers, voice/folder controls, native-tool policy, preferences, notices, live inventory/rescan/health requests, query hooks, boot scope, clock, visibility subscription, refresh sinks and deep-link hook. Keep the production cache scoping and existing throttle/delay values. In `DockChatPane`, separate the composer attachment/folder props from the existing composer prop projection, without changing spread precedence.

**Tovu.** `App.tsx` and `App.chrome.tsx` mount the package dock through `AssistantDock.tsx`, reduced to binding. Reduce `agents-inventory.hooks.ts`, `runtime-access.hooks.ts` and `composer-discovery.hooks.ts` to their live I/O/event bindings. Repoint `assistant-transport.binding.ts` to the same bound resume-capability source, not a second cache. Delete `AssistantDock.state.hooks.ts`, `DockChatPane.tsx`, `assistant-dock-props.tsx` and `messages-change.hooks.ts`. Bind voice controls, desktop bridge, styles and conversation selection in the remaining mount. A05 can be consumed here, but the cleanup slot can also be bound to the pre-cut implementation while A05 is pending.

### A07 — Media and picker

**Test first.** In `features/media/__tests__/media-grid-cursor.unit.test.tsx`, settle a page from an old grid view after switching filters and assert it never appends to the new view. Mutation `media-accept-old-cursor`. In `Media.unit.test.tsx`, pin that the same returned provider catalog drives both rows and count. Mutation `media-count-from-pinned-catalog`.

**Jini.** Add `@jini-ai/cms/react/media/{Media,ExternalProvidersPanel,MediaLoadMore,chrome-playback-note,media-icons,use-media-provider-catalog.hooks,hooks/use-edit-media-panel.hooks,hooks/use-grid-pages.hooks,hooks/use-media-writes.hooks,hooks/use-media.hooks}`. Export their existing neutral views, controllers and rules. Move the current `Media.tsx` blocks to `MediaGrid.tsx` for cards and paging, `MediaToolbar.tsx` for filter/order/size, `MediaEditPanel.tsx` for form and override fields, `MediaPreview.tsx` for preview/lightbox, and `MediaLibraryPanel.tsx` for list and empty states. Move the existing long JSX blocks into leaf components at those boundaries. Separate edit draft/submit and media grid/write orchestration along their current hook boundaries. Inject query hooks, kit, preview hook, API/error policy, embed marker configuration, slot for Publish, import controller, codec limit, provider catalog and copy. Reuse CMS media picker and Jini’s existing `screens/media` preview logic via the injected hook.

**Tovu.** Keep `Media.tsx`, `hooks/use-media.hooks.ts` and `hooks/use-edit-media-panel.hooks.ts` as screen/port bindings only. Delete the seven other MOVE files after updating `features/media/index.ts`, `media-panel.ts`, `hooks/media-dependencies.hooks.ts` and the media screen/test imports. The picker host, client, preview hook, grid copy and upload-size policy stay. No change to rendition URLs, conversion thresholds or upload refusal wording.

### A08 — Library

**Test first.** In `features/library/__tests__/Library.unit.test.tsx`, replace a media client method after creating the live port and assert that the replacement is called. Mutation `library-capture-client-method-early`.

**Jini.** Reuse `@jini-ai/admin/screens/library/{Library,hooks/library-api-port.hooks}` unchanged.

**Tovu.** Keep the screen and bound port. Move `FakeLibraryPortOptions`, `fakeDocument` and `createFakeLibraryPort` verbatim to `features/library/__tests__/library-port.fixture.ts` and repoint their test importers. `use-wired-library.hooks.ts` keeps its production port import. The counted dependencies file then contains only live-client and fetch injection.

### A09 — Widget and embed controls

**Test first.** In `components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx`, assert cancel after an existing-instance selection makes no create call and reopening restores the current baseline draft behavior. Mutation `widget-create-on-select`. In `components/WidgetConfigFields/__tests__/MediaContentEditor.markup.unit.test.tsx`, assert mode switches preserve the appropriate existing HTML/attribute state. Mutation `widget-reset-html-on-mode-switch`.

**Jini.** Add `@jini-ai/cms/react/widgets/{WidgetConfigFields/MediaContentEditor,WidgetConfigFields/MediaContentEditor.hooks,WidgetPickerDialog/WidgetPickerDialog,WidgetPickerDialog/WidgetPickerDialog.hooks}`. Export the neutral editor, controller, picker, selection dialog and add-control surfaces. Move the existing picker loader/draft blocks as `useExistingInstances` and `useWidgetPickerDraft` to keep the picker hook under the limits. Inject the widget catalog/defaults, create/list port, media/picker hook, ID minting, locale, validation and preview slots. Use the existing `EmbedInsertControl`, `HtmlAttributeRows` and `WidgetConfigFields` package implementations. No TipTap dependency in the package.

**Tovu.** Keep the picker’s existing view and hook paths as bound variants after removal of their state and JSX bodies. Delete `MediaContentEditor.hooks.ts`; reduce `MediaContentEditor.tsx` to the bound editor. Repoint generic types/helpers in `WidgetConfigFields.tsx`, both `EmbedInsertControl` files, `lib/widget-embed-extension{,.hooks}.tsx/ts` as applicable, and `integrations/jini-admin/widgets-module.hooks.ts`. Keep the five STAYS-HOST rows and the existing Capabilities/manifest and TipTap policy.

### A10 — Collection entry route

**Test first.** In `features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx`, assert the bound dynamic control uses the injected field key and preserves an unrelated field. Mutation `collection-drop-json-field-slot`.

**Jini.** Reuse `@jini-ai/cms/react/collections/CollectionEntryEditor` and the existing admin taxonomy and JSON field hooks. No new export.

**Tovu.** Keep `collection-entry-panel.tsx` as the TipTap, taxonomy, status, locale and editor-controller binding. `panel-pages.ts` and its tests retain the bound entry. Do not move theme or live rich-text commands.

### A11 — Database route

**Test first.** In `features/database/__tests__/Database.binding.unit.test.tsx`, pin that choosing the schema-state view reaches its injected controller, not timeline or migrate-forward. Mutation `database-swap-schema-timeline-hook`.

**Jini.** Reuse `@jini-ai/admin/screens/database/Database`. No second Database screen or export.

**Tovu.** Keep `Database.tsx` and `index.ts` binding the three current controllers, locale and labels. Keep all migration controls at their current availability.

### A12 — Deployment and Static Site

**Test first.** Extend `features/deployment/hooks/__tests__/use-static-publish.unit.test.tsx` to settle a stale preview after a field edit and verify it cannot arm publishing, mutation `deploy-accept-stale-preview`. Pin one POST for two same-tick starts, mutation `deploy-drop-trigger-claim`. In `DockerfileTab.unit.test.tsx`, pin create URL → click → revoke order, mutation `deploy-revoke-before-click`.

**Jini.** Add `@jini-ai/devops/deploy/react/{StaticSiteTab,download-dockerfile,hooks/use-publish-credentials.hooks,hooks/use-static-export.hooks,hooks/use-static-publish.hooks}`. Export the view, download function and the controller/hooks. Reuse the current `Deployment`, `HistoryTab`, `PublishRunResult`, overview and rule entries. Split StaticSiteTab at its existing components into `StaticExportCard.tsx`, `PublishCredentialsSection.tsx`, `StaticPublishForm.tsx` and `StaticSiteTab.tsx`. Split controller internals at the existing draft, preview, run and polling blocks into `static-publish-preview.hooks.ts`, `static-publish-run.hooks.ts` and `publish-credential-rows.hooks.ts`. Inject browser download primitives, timers, query hooks, ports, versioned credential helpers, target policy, copy, classes and redaction. Keep target IDs and host definition callbacks at their current seam.

**Tovu.** Keep `deployment-panel.tsx` as the existing shell binding with a bound package download. Reduce StaticSiteTab and the three controller files to mounts/port injection or fold those bindings into `deployment-panel.tsx` and delete the emptied paths. Repoint the `panel-pages.ts` entry if needed and the deployment tests that import pure hooks or views. Keep host policy, classes and the overview binding. No new trigger or target.

### A13 — Email and template editor · owner review required

**Test first.** In `features/email/__tests__/Email.unit.test.tsx`, pin the five tab IDs and order, first render mounting only Overview, and a subsection changing `?p=` without adding history. Mutation `email-mount-inactive-tab`. In `EmailTemplateEditor.unit.test.tsx`, pin the existing navigation/keyboard save guard, mutation `email-ignore-dirty-leave`.

**Jini.** Complete ext-a J10 in `@jini-ai/user-management/react/mail/{Email,EmailProviderTab,EmailSegments,EmailTemplateEditor}`. Reuse the existing admin `EmailParts`, Overview, Sender, Activity, Templates and controller implementations via injected views/hooks, not reverse imports. The owner-approved `parts` map is `{ Overview, Sender, Activity, Templates }`. Specify Provider separately as its own view/controller seam so the fifth tab remains visible and its hook remains lazy. `EmailTabHooks` is the current status/overview/provider/sender/activity/templates hook contract, required at the package boundary. `kit` supplies tab bar, named segmented control, theme boundary and template editor chrome. Opus must confirm the exact interfaces, including Provider and template hook shapes, before the move as required by J10/T10.

**Tovu.** `features/email/index.ts` mounts the two bound route entries, with live hooks in `email-hooks-host.ts`. Reduce `Email.tsx` and `EmailTemplateEditor.tsx` to bindings. Delete `EmailProviderTab.tsx` and `EmailSegments.tsx` after repointing their tests and callers. Keep route/copy inputs and the same `?tab`/`?p` semantics.

### A14 — Filesystem and native folder bridge

**Test first.** In `features/fs-files/api/__tests__/folder-drop-deps.unit.test.tsx`, pin render-time `tovuFiles` lookup and classification of the existing `409` picker response. Mutation `files-drop-host-bridge-key`.

**Jini.** Reuse `@jini-ai/cms/react/fs-files/fs-files-api` and the existing admin folder-drop and native-picker hooks. The missing `cms/fs-files/agent-tools` export in ext-w1 is unrelated and not a dependency.

**Tovu.** Keep `fs-files-api.ts` binding route clients, bridge and host error projection. The dock and API wire tests use the same binding. No preload file changes.

### A15 — Import & Export

**Test first.** In `features/import-export/__tests__/ImportExport.unit.test.tsx`, pin that Other mounts Git backup without a Sites read, and Export/Import use the bound site bodies. Mutation `import-export-read-sites-on-other`.

**Jini.** Reuse `@jini-ai/admin/screens/import-export/ImportExport` and its existing `import-export-tabs.tsx`. The package owns the card, lazy tab body and replace-navigation behavior. Bind `ImportExportHandleLabels`, including the exact Tovu archive wording. No new path.

**Tovu.** Reduce `features/import-export/ImportExport.tsx` to the mount passing Site Export/Import views, translations, availability hook, Git backup hook, navigation and handles. `index.ts` and host route tests keep that binding. Where tests exercise the neutral view, import it directly. Do not change archive, Sites, or sharing policy.

### A16 — Webhook deliveries route

**Test first.** Extend `features/integrations/__tests__/IntegrationDeliveries.unit.test.tsx` with an injected delivery rendered in the bound viewer timezone. Mutation `deliveries-drop-viewer-zone`.

**Jini.** Reuse `@jini-ai/integrations/react/webhooks/IntegrationDeliveries` unchanged.

**Tovu.** Keep `integration-deliveries-panel.tsx`, `index.ts` and the live hook binding. There is no portable body remaining in the counted file.

### A17 — Menu editor navigation guard

**Test first.** In `features/menus/__tests__/MenuEditor.unit.test.tsx`, assert that Back invokes the mounted dirty callback exactly once and that unmount removes the listener. Mutation `menus-ignore-router-cancellation`.

**Jini.** Add `@jini-ai/admin/screens/menus/hooks/use-route-guarded-menu-editor.hooks#useRouteGuardedMenuEditor`. Inject the editor hook and before-navigation subscription. Preserve layout-effect registration, cancellation and `leaveGuardOwner: "router"`.

**Tovu.** Move live hook and browser event injection to `features/menus/hooks/use-menu-editor.hooks.ts`. Repoint `panels.tsx` and the menu tests, then delete the original route-guard file. No change to menu targets, permissions or theme menus.

### A18 — Page editor, HTML, preview and save

**Test first.** Extend `PageEditor.interactive-flush.unit.test.tsx` to show that changing tabs/templates and saving observe the flushed Interactive edit, mutation `page-save-before-interactive-flush`. In `PageEditor.preview-youtube.unit.test.tsx`, settle two pending embed-ID lookups out of order, mutation `page-apply-stale-embed-ids`.

**Jini.** Add `@jini-ai/cms/react/pages/{PageEditor,PageEditorPreview,page-editor-rules,hooks/use-page-editor.hooks,hooks/use-preview-embed-ids.hooks}`. Reuse CMS `hooks/page-editor-save` and `PageExternalChangeBanner`; inject existing admin page rules rather than recreate them. Cut the page view into `PageEditorHeader.tsx`, `PageEditorNotices.tsx` and `PageEditorPane.tsx` using the existing declarations. Cut the controller at its current load/apply, save/conflict, external-refresh/standing-draft, and preview/flush blocks into `page-editor-load.hooks.ts`, `page-editor-save-actions.hooks.ts`, `page-editor-drafts.hooks.ts` and `page-editor-preview.hooks.ts`. Keep the top-level call/effect order and synchronous no-mounted-canvas branch. Inject actual editor, template/canvas, preview refresh, taxonomy, URLs, draft, navigation, clock and kit collaborators. The neutral surface selector takes the styling state as data. The embed loader takes the host request and path.

**Tovu.** Reduce `PageEditor.tsx` and `hooks/use-page-editor.hooks.ts` to mounts/live dependencies. Delete `PageEditorPreview.tsx` and `hooks/use-preview-embed-ids.hooks.ts` after updating the editor and `hooks/page-editor-dependencies.hooks.ts`. Keep only routes, static-theme fallback filenames, theme row/link policy and related bindings in `rules.ts`. Repoint neutral rules and types in `features/pages/{index.ts,Pages.tsx,ThemePagesTab.tsx,hooks/*}`, `features/menus/menus-host-ports.ts` and `panels.tsx`, without changing any theme behavior. Keep `page-external-change-bindings.ts` for both editors. **Opus check before controller implementation:** confirm the split keeps flush, pending preview submit, save and draft-clear order. A physical split that merely moves the 700-line hook is not acceptable.

### A19 — Plugins and Agent Plugins route group

**Test first.** In the `features/plugins/__tests__/` route and controller tests, show that a late list read cannot revert a confirmed toggle, and that selecting package files does not open an Admin surface. Mutations `agent-plugins-replace-newer-toggle` and `plugins-eager-open-surface`.

**Jini.** Add `@jini-ai/agent-plugins/react/{AgentPlugins,AgentPluginDetailsModal,use-agent-plugins.hooks}` and `@jini-ai/plugins/react/{Plugins,PluginProviderSettingsDialog}`. Export the present views and controller types. Split `AgentPluginsScreen` at installed/downloaded, marketplace and details regions into `AgentPluginListPanel.tsx`, `AgentPluginMarketplacePanel.tsx` and the existing modal destination. Split `Plugins.tsx` along its existing row and overlay declarations into `PluginRows.tsx` and `PluginsOverlays.tsx`. Inject row/add/update/remove views, file reader and surface hooks, settings/change handlers, availability policy, router, kit and copy. Reuse the install factories and existing admin details/file/list hooks. Agent-plugin and site-plugin packages do not import each other or `admin` for view implementations.

**Tovu.** Reduce `AgentPlugins.tsx`, `Plugins.tsx` and `hooks/use-agent-plugins.hooks.ts` to bound entries. Delete the two moved modal/dialog paths and bind their current dependencies at the entries. Repoint `features/plugins/index.ts`, `panels.tsx` and direct leaf/controller tests. Keep the five existing live bindings. Move their two install fakes into the existing test area in `agent-plugin-install-port.fixture.ts` and `plugin-install-port.fixture.ts`, preserving fixture API and bodies. Preserve install/update digest checks, linked locks and existing feature flags.

### A20 — Post list and editor notices

**Test first.** In the Posts controller tests, assert a stale refresh cannot restore an old selection after the existing row action, mutation `posts-apply-stale-list`. In the post-editor notice tests, show the stale draft notice remains suppressed only while the outside-change notice is active, mutation `posts-show-duplicate-stale-notice`.

**Jini.** Add `@jini-ai/cms/react/posts/{Posts,hooks/use-posts.hooks,editor/notices/PostEditorNotices,posts-list-rules,post-editor-rules}`. Export the neutral list view/controller, row action and handle projection, draft/conflict messages, preview branch and date rules. Split the list hook between existing cache/selection and mutations in `hooks/post-list-writes.hooks.ts`. Reuse existing CMS editor save/state rules and Jini notice leaves via slots. Inject Publish, refreshed scopes, template constraints, media policy and editor notice collaborators. Keep conflict and recovery notice precedence.

**Tovu.** Keep `Posts.tsx` and `hooks/use-posts.hooks.ts` as bindings. Delete the concrete `PostEditorNotices.tsx` after wiring `PostEditor.tsx` and its screen hook to the Jini view and bound notice slots. Reduce `rules.ts` to Tovu editor bindings: TipTap node/transaction/drop integration, toolbar choices and theme-specific picker/cover policies. Repoint package-owned imports in `index.ts`, the post editor/dependencies/hooks, toolbar and bubble menu, and the list dependencies. Reuse `post-cover-host.hooks.ts` unchanged except for imports. If any retained TipTap section still contains portable logic that cannot be cut from its concrete editor type, record the precise residual under the existing rich-text hold instead of claiming that file passed the counter.

### A21 — Routines and conversation deep link

**Test first.** In `features/routines/__tests__/Routines.test.tsx`, pin the Waiting for approval and Catch-up labels, and stale revision reload without retrying the write. Mutation `routines-render-waiting-as-complete`. In `components/AssistantDock/__tests__/dock-conversation-deep-link.integration.test.tsx`, assert an owned ID is selected without launching a run and a transient lookup failure does not consume the query. Mutation `routines-consume-link-on-lookup-error`.

**Jini.** Add `@jini-ai/admin/screens/routines/{Routines,RoutineForm,Routines.hooks,RoutinesMount,project-routine-row,routines-api}`. Export existing view/hook/types/projection and `createRoutinesApi`. Reuse `@jini-ai/core/contracts/site/routines` row and schedule types. Do not use daemon routes as a browser client. Keep typed refusal/409 mapping and inject request, base path, timers, focus, copy, kit, schedule picker and link builder. Add `@jini-ai/admin/shell/hooks/use-conversation-deep-link` for `useApplyConversationDeepLink` and its port types, with host lookups, query replacement, notification and dock selection injected.

**Tovu.** Keep `features/routines/index.ts` and `routines-i18n.ts` as the live bindings. Delete the six moved routines modules after updating the index and `integrations/jini-kits.ts`. Reduce `use-conversation-deep-link.ts` to Tovu’s URL/owned-list/notice/browser binding. Repoint neutral types and tests in `App.tsx`, `App.chrome.tsx` and whichever AssistantDock mount A06 leaves. Preserve the release check, original hook call order, timer interval and desktop-only behavior. No daemon change.

### A22 — Publish content dialogue

**Test first.** Extend `features/publish-content/__tests__/PublishContentDialog.unit.test.tsx` and `publish-content-client.ceremony.unit.test.ts`. Pin no execute before the confirmed-phase token, an overwrite replan blocking stale confirmation, and only one execute for duplicate clicks. Mutations `publish-execute-unconfirmed` and `publish-confirm-during-replan`.

**Jini.** Add `@jini-ai/cms/react/publish-content/{PublishContentDialog,PublishContentDialog.hooks,hooks/use-publish-content-confirm.hooks}`. Export dialog, report row and neutral confirm/view types and functions. Reuse `cms/publish/content/ui`, `criteria-publish-result`, the client, the existing port and `PublishSectionButton`. Move the report JSX into `PublishContentReport.tsx`, and the current peer/plan/replan, confirmation/execute, and criteria blocks into `publish-peer-plan.hooks.ts`, `publish-confirm-execute.hooks.ts` and `publish-criteria.hooks.ts`. Keep token-based execute in its current effect position, layout-effect arming, and the synchronous re-entry guard. Inject host section/criteria policy functions, peer/destination client, locale hook, error description, app subscriptions, kit and copy.

**Tovu.** Reduce `PublishContentDialog.tsx` to the binding used by `App.tsx` and `App.chrome.tsx`. Delete its original report-row and confirm-hook implementations after repointing direct tests and binding the existing port/policy. Keep the section button and both host stores. **Opus check before controller implementation:** pin the order of peer change, criteria replan, confirmation and execute against the current hook. No dependency on unbuilt peer mounts, write fences or rollout flags.

### A23 — Recovery route

**Test first.** In `features/recovery/__tests__/Recovery.unit.test.tsx`, pin that opening the restore preview calls the bound preview and does not apply. Mutation `recovery-wire-apply-to-preview`.

**Jini.** Reuse `@jini-ai/db/react/recovery/Recovery` and its existing structural kit slots.

**Tovu.** Keep `recovery-panel.tsx` and `panel-pages.ts` wiring. Keep the slot adapters, viewer timezone and navigation port. No live-database replacement, compaction or new recovery action.

### A24 — Security, access tokens and owner recovery

**Test first.** In `features/security/__tests__/` and `hooks/__tests__/`, pin that blank replacement keeps saved material, latest store reload wins, site-key permission hides the tab, and a recovery kit’s codes disappear only on the current successful download/dismiss path. Mutations `security-serialize-blank-replacement`, `security-apply-earlier-reload` and `security-show-site-key-without-grant`.

**Jini.** Add `@jini-ai/integrations/react/credentials/{AccessTokensTab,AccessTokensTab.hooks,OtherCredentialsSection,OtherCredentialsSection.hooks,access-token-forms,other-credential-stores,hooks/use-access-tokens.hooks,hooks/use-other-credentials.hooks}` for the live credential feature. Export its current neutral forms, projections, views, hooks and port-facing types. The existing admin `security/react/tabs/AccessTokensTab` consumes the separate `TabViewProps` model. Don’t replace it with the live Tovu controller or copy its equivalent leaf rules. Reuse existing token validation/copy, copy-keys and site-key implementations. Split the live view at token fields and custom dialog into `AccessTokenFields.tsx` and `AddCustomCredentialDialog.tsx`. Split the live controller at its existing store-read/reload, drafts, credential writes and final group projection into `access-token-load.hooks.ts`, `access-token-drafts.hooks.ts`, `access-token-actions.hooks.ts` and `access-token-groups.ts`. Inject the store/read catalog, allowed credential operations, query hooks, navigation, form slots, kit, copy and host error recognizers.

Reuse `@jini-ai/admin/security/react/live/Security` for tab resolution and view. Add the optional-by-composition pre-tab region for the existing TOTP, recovery and passkey children if the existing props cannot place them in the same order. Reuse `@jini-ai/user-management/react/auth/RecoveryCodesCard` with bound error notice, proof, download filename and recovery/reset hooks. Changeset only packages with an actual delta.

**Tovu.** Reduce `Security.tsx`, `AccessTokensTab.tsx`, `RecoveryCodesCard.tsx` and both wired controller files to live mounts/bindings. Keep the actual four-store roster, links and host write/read adapters, not their search/projection logic, in the residual store file. Delete `AccessTokensTab.hooks.tsx`, `OtherCredentialsSection{,.hooks}.tsx` and `access-token-forms.ts` after repointing direct consumers and tests. `features/security/index.ts` keeps the bound route. Keep the copy-keys bindings, default-key and grant checks, write-only secret boundary and `TOVU_SITE_KEY` copy. **Opus check before controller implementation:** verify that the named cut splits the >500-line controller body without moving the three seed effects or changing late reload precedence.

### A25 — Providers and External MCP

**Test first.** In `features/settings/__tests__/external-mcp-missing-launcher-recovery.unit.test.tsx`, pin that retry/restart observation stops after the existing bound. Mutation `mcp-retry-past-cap`. In the external MCP settings tests, apply a write-allowlist patch to a configured server and assert unrelated stored credential fields aren’t blanked. Mutation `mcp-write-blank-secret-in-partial-patch`.

**Jini.** Add `@jini-ai/integrations/react/providers/Providers` and `@jini-ai/mcp/react/external-mcp/{ExternalMcpSettingsPanel,hooks/use-external-mcp-admissions.hooks,hooks/use-external-mcp.hooks}`. Export current neutral views, controller/port types, and source projection/write rules. Split the panel at existing form, source row and confirmation sections into `ExternalMcpSourceRow.tsx`, `ExternalMcpAddFormSection.tsx` and `ExternalMcpRemoveConfirmSection.tsx`. Split the client hook at source projection/patch shaping and writes in `external-mcp-config.ts` and `external-mcp-writes.hooks.ts`. Use the **existing** MCP `ExternalMcpAdmissionsBanner` and `ExternalMcpSettingsPanel.hooks` exports for banner, saved intent, allow-write patch and lagged form fields. Inject UI/Picker/OAuth hooks, allowlist policy, retry timers, live request, query hooks, copy, error and redaction hooks. The Providers shell takes the MCP and Webhooks panels as slots and doesn’t import their runtime.

**Tovu.** Keep `features/providers/Providers.tsx`, `features/settings/ExternalMcpSettingsPanel.tsx` and both controller entry hooks as bindings. Delete the duplicate banner after binding its copy/classification at the panel. Reduce `ExternalMcpSettingsPanel.hooks.tsx` to the host translator/adapter used by the retained tool-picker hook, and repoint its generic consumers to Jini. Update `features/providers/index.ts`, the tool-picker binding and tests. Add direct `@jini-ai/mcp` intake to `apps/admin` if needed for the new imports. No change to connection admission, credentials, or effective transport/auth defaults.

### A26 — Skills

**Test first.** In the existing skills client/surface tests, pin that the host change event fires only after accepted installation. Mutation `skills-notify-before-accept`. Preserve the existing enabled-guidance read for composing a draft.

**Jini.** Reuse `@jini-ai/agentic/react/skills/{api,use-skill-files.hooks,use-skill-install.hooks,use-skills.hooks}`. No DOM code goes into Agentic.

**Tovu.** Keep `api.ts` and `skills-host.hooks.ts` binding the browser event, live client, host prompt text, confirmation and error UI. The skills page and dock retain the bound entry, with no new variant of the install client.

### A27 — Source Control

**Test first.** In `features/source-control/__tests__/ProvidersTab.unit.test.tsx`, pin the existing credential hint, provider detail and host-bound navigation/credential hook. Mutation `source-control-drop-bound-credentials`.

**Jini.** Reuse `@jini-ai/devops/source-control/react/{SourceControl,ProvidersTab}` and the existing credential hook. No portable shell remains to copy.

**Tovu.** Keep `source-control-panel.tsx` as the route mount and kit/copy/class binding. `panel-pages.ts` retains it. No new history, commit or push action.

### A28 — Storage and screenshot cleanup

**Test first.** In `features/storage/__tests__/Storage.unit.test.tsx`, pin measurement before live cleanup, only the measured automatic classes, and the same preview token on the confirmed live request. Mutation `storage-send-unmeasured-class`. In `use-screenshot-cleanup.unit.test.ts`, pin that screenshot apply waits for explicit confirmation and uses its shown preview token. Mutation `screenshots-apply-on-preview`.

**Jini.** Add `@jini-ai/admin/screens/storage/{StorageScreen,api/storage-api,api/screenshot-cleanup-api,hooks/use-storage.hooks,hooks/use-screenshot-cleanup.hooks}`. Export the two client factories and contracts, views and controllers. Reuse `StoragePanel` and `@jini-ai/platform/retention` contracts, not its server runner. Keep the screenshot section as `ScreenshotCleanupSection.tsx` with an injected clock, age, anchor, Button and copy. Inject links, labels, formatting locale, request/path builders, error presentation and live hooks. Preserve dry-run, outcomes, confirmation and live ordering and both clients’ header/body shapes.

**Tovu.** Reduce `Storage.tsx` to the composed route with the real clients, errors, links and 90-day policy. Keep only bound client instances at the API paths. Delete both hook paths after updating the screen and tests. Repoint `panel-pages.ts` directly to `Storage.tsx` and delete `index.ts`. Keep the dictionary. Do not add Desktop T6 wiring, compaction or recovery actions. None is needed for this sheet.

### A29 — Trash

**Test first.** In `features/trash/__tests__/use-trash.unit.test.tsx`, assert restore uses the bound client and retains the existing failure projection when that client refuses. Mutation `trash-bypass-bound-error-projection`.

**Jini.** Reuse `@jini-ai/admin/screens/trash/{Trash,hooks/use-trash.hooks}` unchanged.

**Tovu.** Keep both files as the screen/controller bindings. `features/trash/index.ts` retains the bound route. No automatic permanent delete, widened permission or behavior change.

No files were changed. No tests, builds, installs, linters or type-checks ran.
