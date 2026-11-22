# A-K2-0 — AdminKit gaps: `@jini-ai/ui`/`ui-kit`/`chat` names Jini-bound admin files use that have no kit facade

Generated from `plans/P9-data/k-work.json`. **0a** = ui/ui-kit values (components, hooks, functions) → new `AdminKitComponents`/`AdminKitHooks` fields + same-name facade in `packages/admin/src/react/kit.tsx`, implementation added to Tovu `apps/admin/src/integrations/jini-kits.ts` `adminKit` (A-K2-0.T). **0b** = chat values → a new `chat` group on `AdminKit` (same pattern). **0c** = types (heuristic: PascalCase non-component) → restated structurally in `kit.tsx` beside the existing restated shapes ("shapes restated, DESIGN B4"), or moved to core when core already owns the contract. **css** = side-effect stylesheet imports → the host imports them at the mount (K5css), never Jini. Uppercase constants that are dictionaries/data (e.g. `SETTINGS_DIALOG_DICTIONARIES`) go in 0a as kit values.
Counts: 0a 73, 0c 108, css 3, 0b 30.


| group | specifier | name | uses | first users (file:line) |
|---|---|---|---|---|
| 0a | `@jini-ai/ui` | Icon | 29 | `components/AssistantDock/DockLeadingAccessory.tsx:2`, `components/AssistantDock/FolderDropConfirmation.tsx:2`, `components/AssistantDock/FolderDropError.tsx:2`, `components/AssistantDock/FolderDropPathHint.tsx:2` |
| 0c | `@jini-ai/ui` | ExecutionConfig | 15 | `components/AssistantDock/execution-config-write.ts:3`, `components/AssistantDock/hooks/assistant-transport.hooks.ts:6`, `components/AssistantDock/hooks/byok-runtime.hooks.ts:4`, `components/AssistantDock/hooks/composer-files.hooks.ts:5` |
| 0c | `@jini-ai/chat/core` | ChatMessage | 13 | `components/AssistantDock/AgentFailureCard.hooks.ts:2`, `components/AssistantDock/AssistantDock.state.hooks.ts:21`, `components/AssistantDock/AssistantDock.tsx:10`, `components/AssistantDock/agent-failure.ts:2` |
| css | `@jini-ai/ui/settings-dialog.css` | side-effect | 13 | `components/AssistantDock/AssistantDock.tsx:18`, `components/AssistantDock/DockChatPane.tsx:22`, `features/authentication/Authentication.tsx:10`, `features/email/Email.tsx:5` |
| 0a | `@jini-ai/ui/tab-strip` | TabBarTab | 13 | `features/consent/CookieConsent.tsx:5`, `features/database/Database.tsx:15`, `features/deployment/Deployment.tsx:6`, `features/email/Email.tsx:4` |
| 0b | `@jini-ai/chat/react` | useT | 12 | `components/AssistantDock/AgentFailureCard.hooks.ts:3`, `components/AssistantDock/AgentFailureCard.tsx:3`, `components/AssistantDock/DockLeadingAccessory.tsx:1`, `components/AssistantDock/FolderDropConfirmation.tsx:1` |
| 0a | `@jini-ai/ui` | SETTINGS_DIALOG_DICTIONARIES | 10 | `components/AssistantDock/assistant-dock-i18n.ts:1`, `features/authentication/Authentication.tsx:9`, `features/media/Media.tsx:6`, `features/observability/Observability.tsx:2` |
| 0a | `@jini-ai/ui/tab-strip` | useTabBarKeyboard | 9 | `components/WidgetConfigFields/MediaContentEditor.tsx:7`, `features/email/EmailTemplateEditor.tsx:6`, `features/menus/MenuEditor.tsx:2`, `features/pages/PageEditor.tsx:19` |
| 0a | `@jini-ai/ui/tab-strip` | resolveTabBarTabIndex | 8 | `components/WidgetConfigFields/MediaContentEditor.tsx:7`, `features/email/EmailTemplateEditor.tsx:6`, `features/menus/MenuEditor.tsx:2`, `features/pages/PageEditor.tsx:19` |
| 0a | `@jini-ai/ui` | I18nProvider | 8 | `features/authentication/Authentication.tsx:9`, `features/media/Media.tsx:6`, `features/observability/Observability.tsx:2`, `features/plugins/AgentPlugins.tsx:8` |
| 0a | `@jini-ai/ui` | SettingsDialogTab | 7 | `features/authentication/Authentication.tsx:9`, `features/observability/Observability.tsx:2`, `features/observability/hooks/use-observability-tab.hooks.ts:2`, `features/plugins/AgentPlugins.tsx:8` |
| 0c | `@jini-ai/chat/react` | ChatPaneAgentSelection | 6 | `components/AssistantDock/AgentFailureCard.hooks.ts:3`, `components/AssistantDock/execution-config-write.ts:2`, `components/AssistantDock/hooks/assistant-transport.hooks.ts:4`, `components/AssistantDock/hooks/local-cli-selection.hooks.ts:2` |
| 0c | `@jini-ai/chat/react` | ChatPaneAgent | 6 | `components/AssistantDock/hooks/agents-inventory.hooks.ts:3`, `components/AssistantDock/hooks/composer-files.hooks.ts:4`, `components/AssistantDock/hooks/runtime-access.hooks.ts:2`, `components/AssistantDock/local-cli-selection-echo.ts:1` |
| 0a | `@jini-ai/ui` | SettingsDialogShell | 6 | `features/authentication/Authentication.tsx:9`, `features/observability/Observability.tsx:2`, `features/plugins/AgentPlugins.tsx:8`, `features/recovery/Recovery.tsx:3` |
| 0a | `@jini-ai/ui` | RemixIcon | 5 | `components/AssistantDock/DockSettingsMenu.tsx:3`, `components/AssistantDock/FolderPathButton.tsx:2`, `components/AssistantDock/SubagentsIndicator.tsx:3`, `components/CodeView/preview-modal-icons.tsx:1` |
| 0a | `@jini-ai/ui` | useT | 5 | `features/settings/AdminAppearance.tsx:1`, `features/settings/ExternalMcpRemoveConfirmDialog.tsx:2`, `features/settings/ExternalMcpSettingsPanel.tsx:13`, `features/settings/ExternalMcpToolPicker.tsx:2` |
| 0c | `@jini-ai/chat/react` | ChatPaneRuntimeAccess | 4 | `components/AssistantDock/AgentFailureCard.hooks.ts:3`, `components/AssistantDock/hooks/runtime-access.hooks.ts:2`, `components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts:2`, `hooks/use-tovu-execution-adapters.hooks.ts:3` |
| 0b | `@jini-ai/chat/react` | ChatPane | 4 | `components/AssistantDock/AssistantDock.state.hooks.ts:20`, `components/AssistantDock/AssistantDock.tsx:9`, `components/AssistantDock/DockChatPane.tsx:11`, `components/AssistantDock/assistant-dock-props.tsx:2` |
| 0b | `@jini-ai/chat/react` | FrontendSessionBridge | 4 | `components/AssistantDock/AssistantDock.tsx:9`, `components/AssistantDock/hooks/assistant-transport.hooks.ts:4`, `components/AssistantDock/hooks/run-context.hooks.ts:4`, `lib/assistant-daemon-activation.ts:1` |
| 0c | `@jini-ai/ui` | ExecutionPort | 4 | `components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts:3`, `features/settings/ai-agent-presentation.ts:1`, `features/settings/hooks/use-ai-agent-presentation.hooks.ts:2`, `lib/execution-settings.ts:75` |
| 0c | `@jini-ai/ui/admin-widgets` | SelectOption | 4 | `components/Select/Select.hooks.tsx:2`, `components/Select/Select.hooks.tsx:5`, `components/Select/Select.tsx:2`, `components/Select/Select.tsx:6` |
| 0a | `@jini-ai/ui/panel-kit` | useSerialWrites | 4 | `features/fs-files/hooks/use-folder-drop.hooks.ts:10`, `features/security/hooks/use-other-credentials.hooks.ts:9`, `features/settings/hooks/use-external-mcp.hooks.ts:29`, `features/themes/hooks/use-themes.hooks.ts:6` |
| 0a | `@jini-ai/ui` | Toast | 4 | `features/library/Library.tsx:5`, `features/plugins/Plugins.tsx:5`, `features/themes/ThemeExplore.tsx:7`, `features/themes/Themes.tsx:2` |
| 0a | `@jini-ai/ui/panel-kit` | hasPermission | 4 | `features/library/hooks/use-library.hooks.ts:2`, `features/security/hooks/use-security-permissions.hooks.ts:1`, `features/settings/hooks/use-external-mcp-admissions.hooks.ts:10`, `features/taxonomy/hooks/use-term-picker.hooks.ts:7` |
| 0c | `@jini-ai/chat/core` | ChatTransport | 3 | `components/AssistantDock/AgentFailureCard.hooks.ts:2`, `components/AssistantDock/agent-failure.ts:2`, `lib/stream-activity.ts:2` |
| 0c | `@jini-ai/chat/react` | ExtEventRenderProps | 3 | `components/AssistantDock/AgentFailureCard.tsx:3`, `components/AssistantDock/SlowRunNoticeCard.hooks.ts:14`, `components/AssistantDock/SlowRunNoticeCard.tsx:1` |
| 0c | `@jini-ai/chat/react` | I18nAdapter | 3 | `components/AssistantDock/DockHeader.tsx:3`, `components/AssistantDock/assistant-dock-i18n.ts:3`, `components/AssistantDock/hooks/dock-chrome.hooks.ts:2` |
| 0a | `@jini-ai/ui/admin-widgets` | openLightboxDialog | 3 | `components/AssistantDock/MessageOverflowModal.hooks.tsx:1`, `features/media/hooks/use-edit-media-modal.hooks.ts:1`, `features/pages/ThemePageDetailsModal.hooks.tsx:1` |
| 0a | `@jini-ai/ui/admin-widgets` | closeLightboxDialog | 3 | `components/AssistantDock/MessageOverflowModal.hooks.tsx:1`, `features/media/hooks/use-edit-media-modal.hooks.ts:1`, `features/pages/ThemePageDetailsModal.hooks.tsx:1` |
| 0c | `@jini-ai/chat/core` | StartRunInput | 3 | `components/AssistantDock/agent-failure.ts:2`, `components/AssistantDock/hooks/assistant-transport.hooks.ts:5`, `lib/assistant-transport.ts:2` |
| 0c | `@jini-ai/chat/react` | ChatPaneComposerHandle | 3 | `components/AssistantDock/hooks/composer-skills.hooks.ts:3`, `features/fs-files/hooks/use-folder-drop.hooks.ts:4`, `lib/assistant-prompt-bus.ts:2` |
| 0c | `@jini-ai/ui` | DetectedAgent | 3 | `components/AssistantDock/hooks/use-selected-agent-auth-warning.hooks.ts:3`, `features/settings/ai-agent-presentation.ts:1`, `features/settings/hooks/use-ai-agent-presentation.hooks.ts:2` |
| 0a | `@jini-ai/ui` | CodeWithLines | 3 | `components/TemplateSource/TemplateSourceModal.tsx:3`, `features/plugins/PackageFilesModal.tsx:1`, `features/themes/ThemeExplore.tsx:7` |
| 0a | `@jini-ai/ui` | CodeWrapToggle | 3 | `components/TemplateSource/TemplateSourceModal.tsx:3`, `features/plugins/PackageFilesModal.tsx:1`, `features/themes/ThemeExplore.tsx:7` |
| 0a | `@jini-ai/ui` | useCodeWrap | 3 | `components/TemplateSource/TemplateSourceModal.tsx:3`, `features/plugins/PackageFilesModal.tsx:1`, `features/themes/ThemeExplore.tsx:7` |
| 0c | `@jini-ai/ui/html-editor` | CanvasEmbedPlaceholderDescriptor | 3 | `features/pages/PageEditor.tsx:13`, `features/pages/hooks/use-page-editor.hooks.ts:4`, `features/pages/lib/embed-placeholder.ts:1` |
| 0c | `@jini-ai/ui/html-editor` | InteractiveHtmlEditorHandle | 3 | `features/pages/PageEditor.tsx:13`, `features/pages/hooks/use-interactive-flush.hooks.ts:3`, `features/pages/hooks/use-page-editor.hooks.ts:4` |
| 0c | `@jini-ai/ui/html-editor` | RequestEditHtml | 3 | `features/pages/PageEditor.tsx:13`, `features/pages/hooks/use-editor-html-jump.hooks.ts:2`, `features/pages/hooks/use-page-editor.hooks.ts:4` |
| 0c | `@jini-ai/ui` | SourceConfigDependencies | 3 | `features/settings/ExternalMcpSettingsPanel.hooks.tsx:2`, `features/settings/ExternalMcpSettingsPanel.tsx:13`, `features/settings/hooks/use-external-mcp.hooks.ts:12` |
| 0c | `@jini-ai/ui` | SourceConfigItem | 3 | `features/settings/ExternalMcpSettingsPanel.hooks.tsx:2`, `features/settings/ExternalMcpSettingsPanel.tsx:13`, `features/settings/hooks/use-external-mcp.hooks.ts:12` |
| 0c | `@jini-ai/ui` | NotificationsPreferences | 3 | `features/settings/SettingsUi.tsx:125`, `features/settings/hooks/use-settings-ui.hooks.ts:7`, `lib/settings-tabs.ts:23` |
| 0c | `@jini-ai/ui` | PrivacyConsentState | 3 | `features/settings/SettingsUi.tsx:125`, `features/settings/hooks/use-settings-ui.hooks.ts:7`, `lib/settings-tabs.ts:23` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftAutosaveInput | 3 | `hooks/use-standing-draft-autosave.hooks.ts:5`, `hooks/use-standing-draft-autosave.hooks.ts:6`, `lib/standing-draft-local-backup.ts:3` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftAutosaveSnapshot | 3 | `hooks/use-standing-draft-autosave.hooks.ts:5`, `hooks/use-standing-draft-autosave.hooks.ts:6`, `lib/standing-draft-local-backup.ts:3` |
| css | `@jini-ai/chat/react/styles/chat-settings.css` | side-effect | 2 | `components/AssistantDock/AssistantDock.tsx:1`, `components/AssistantDock/DockChatPane.tsx:1` |
| 0a | `@jini-ai/ui/admin-widgets` | useInfoTip | 2 | `components/AssistantDock/DockHeaderTip.hooks.ts:2`, `features/plugins/hooks/use-linked-lock-tip.hooks.ts:1` |
| 0b | `@jini-ai/chat/react` | ChatSettingsSegmented | 2 | `components/AssistantDock/DockSettingsMenu.tsx:5`, `features/email/EmailParts.tsx:3` |
| 0c | `@jini-ai/chat/react` | A2uiSurfaceCardProps | 2 | `components/AssistantDock/RoutedA2uiSurfaceCard.tsx:3`, `components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts:2` |
| 0c | `@jini-ai/chat/core` | RunHandlers | 2 | `components/AssistantDock/agent-failure.ts:2`, `lib/stream-activity.ts:2` |
| 0c | `@jini-ai/chat/react` | ComposerDiscoveryOutcome | 2 | `components/AssistantDock/hooks/composer-discovery.hooks.ts:6`, `components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts:1` |
| 0c | `@jini-ai/chat/react` | ComposerDiscoverySelection | 2 | `components/AssistantDock/hooks/composer-discovery.hooks.ts:6`, `components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts:1` |
| 0c | `@jini-ai/chat/react` | ChatPaneWorkingDirectoryAccess | 2 | `components/AssistantDock/hooks/composer-files.hooks.ts:4`, `lib/browser-working-directory-access.ts:1` |
| 0c | `@jini-ai/chat/react` | ComposerDiscoveryGroup | 2 | `components/AssistantDock/hooks/composer-skills.hooks.ts:3`, `features/plugins/composer-capabilities.ts:1` |
| 0c | `@jini-ai/ui/admin-widgets` | PanelPosition | 2 | `components/Select/Select.hooks.tsx:2`, `components/Select/Select.hooks.tsx:5` |
| 0a | `@jini-ai/ui/preview-modal-shell` | PreviewModalShell | 2 | `components/TemplateSource/TemplateSourceModal.tsx:5`, `features/plugins/PackageFilesModal.tsx:2` |
| 0c | `@jini-ai/ui` | SettingsThemeChoice | 2 | `features/admin-themes/AdminThemes.tsx:2`, `lib/settings-tabs.ts:23` |
| 0a | `@jini-ai/ui/panel-kit` | standingDraftRecoveryMessage | 2 | `features/pages/PageEditor.tsx:1`, `features/posts/editor/notices/PostAutosaveRecoveryBanner.tsx:11` |
| 0c | `@jini-ai/ui/html-editor` | CanvasStyling | 2 | `features/pages/hooks/use-theme-canvas-styling.hooks.ts:4`, `features/pages/rules.ts:3` |
| 0a | `@jini-ai/ui` | useWiredSourceConfigAddForm | 2 | `features/settings/ExternalMcpSettingsPanel.hooks.tsx:2`, `features/settings/ExternalMcpSettingsPanel.tsx:13` |
| 0c | `@jini-ai/ui` | ByokConfig | 2 | `features/settings/rules.ts:1`, `lib/execution-settings.ts:75` |
| 0c | `@jini-ai/chat/react` | LastConversationStore | 2 | `hooks/assistant-chats-dependencies.hooks.ts:3`, `hooks/use-assistant-chats.hooks.ts:2` |
| 0c | `@jini-ai/ui/panel-kit` | SettingsSliceRefreshPort | 2 | `hooks/use-settings-slice.hooks.ts:5`, `hooks/use-settings-slice.hooks.ts:8` |
| 0c | `@jini-ai/ui/panel-kit` | SettingsSlice | 2 | `hooks/use-settings-slice.hooks.ts:5`, `hooks/use-settings-slice.hooks.ts:8` |
| 0c | `@jini-ai/ui/panel-kit` | SaveState | 2 | `hooks/use-settings-slice.hooks.ts:5`, `hooks/use-settings-slice.hooks.ts:8` |
| 0c | `@jini-ai/chat/transports/http` | CreateA2uiActionPosterOptions | 2 | `lib/a2ui-action-poster.ts:2`, `lib/a2ui-action-poster.ts:3` |
| 0c | `@jini-ai/chat/transports/http` | AssistantConversation | 2 | `lib/assistant-chats.ts:27`, `lib/assistant-chats.ts:28` |
| 0c | `@jini-ai/chat/transports/http` | ChatAttachmentValidatorOptions | 2 | `lib/chat-attachment-liveness.ts:2`, `lib/chat-attachment-liveness.ts:3` |
| 0c | `@jini-ai/chat/transports/http` | DurableRunBinding | 2 | `lib/durable-run-subscription.ts:3`, `lib/durable-run-subscription.ts:7` |
| 0c | `@jini-ai/chat/transports/http` | DurableSubscriptionPorts | 2 | `lib/durable-run-subscription.ts:3`, `lib/durable-run-subscription.ts:7` |
| 0c | `@jini-ai/ui` | CreateExecutionPortOptions | 2 | `lib/execution-settings.ts:75`, `lib/execution-settings.ts:540` |
| 0c | `@jini-ai/ui/panel-kit` | ErrorNoticeProps | 1 | `components/AdminFailureNotice/AdminFailureNotice.tsx:2` |
| 0b | `@jini-ai/chat/react` | useChatSettingsDialog | 1 | `components/AssistantDock/AssistantDock.state.hooks.ts:20` |
| 0b | `@jini-ai/chat/react` | ChatSettingsDialog | 1 | `components/AssistantDock/DockChatPane.tsx:11` |
| 0b | `@jini-ai/chat/react` | JiniChatProvider | 1 | `components/AssistantDock/DockChatPane.tsx:11` |
| 0b | `@jini-ai/chat/react` | createMidRunMessagePoster | 1 | `components/AssistantDock/DockChatPane.tsx:11` |
| 0c | `@jini-ai/chat/react` | ConversationList | 1 | `components/AssistantDock/DockHeader.tsx:3` |
| 0c | `@jini-ai/chat/react` | ConversationTitle | 1 | `components/AssistantDock/DockHeader.tsx:3` |
| 0a | `@jini-ai/ui/admin-widgets` | infoTipBubbleStyle | 1 | `components/AssistantDock/DockHeaderTip.tsx:3` |
| 0b | `@jini-ai/chat/react` | McpUiSurfaceCard | 1 | `components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx:2` |
| 0c | `@jini-ai/chat/react` | McpUiSurfaceCardProps | 1 | `components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx:2` |
| 0b | `@jini-ai/chat/react` | A2uiSurfaceCard | 1 | `components/AssistantDock/RoutedA2uiSurfaceCard.tsx:3` |
| css | `@jini-ai/ui/interactive-ui.css` | side-effect | 1 | `components/AssistantDock/RoutedA2uiSurfaceCard.tsx:5` |
| 0c | `@jini-ai/chat/core` | AgentEvent | 1 | `components/AssistantDock/agent-failure.ts:2` |
| 0c | `@jini-ai/ui` | Locale | 1 | `components/AssistantDock/assistant-dock-i18n.ts:1` |
| 0c | `@jini-ai/chat/core` | SECRET_REDACTED_NOTICE | 1 | `components/AssistantDock/assistant-dock-i18n.ts:2` |
| 0c | `@jini-ai/chat/core` | CREDENTIAL_CARD_GUIDANCE | 1 | `components/AssistantDock/assistant-dock-i18n.ts:2` |
| 0a | `@jini-ai/ui` | nextConfigForAgentSelect | 1 | `components/AssistantDock/execution-config-write.ts:3` |
| 0a | `@jini-ai/ui` | nextConfigForAgentModel | 1 | `components/AssistantDock/execution-config-write.ts:3` |
| 0a | `@jini-ai/ui` | nextConfigForAgentReasoning | 1 | `components/AssistantDock/execution-config-write.ts:3` |
| 0a | `@jini-ai/ui/mcp-ui/surfaces` | buildSandboxProxyDataUrl | 1 | `components/AssistantDock/hooks/assistant-mcp-ui.ts:1` |
| 0a | `@jini-ai/ui` | resolveSelectedPreset | 1 | `components/AssistantDock/hooks/byok-runtime.hooks.ts:4` |
| 0a | `@jini-ai/ui/visible-interval` | startVisibleInterval | 1 | `components/AssistantDock/hooks/composer-discovery.hooks.ts:9` |
| 0b | `@jini-ai/chat/react` | createDaemonAttachmentUploader | 1 | `components/AssistantDock/hooks/composer-files.hooks.ts:4` |
| 0b | `@jini-ai/chat/core` | conversationTitleForDisplay | 1 | `components/AssistantDock/hooks/dock-chrome.hooks.ts:3` |
| 0b | `@jini-ai/chat/core` | isTerminalRunStatus | 1 | `components/AssistantDock/hooks/messages-change.hooks.ts:2` |
| 0b | `@jini-ai/chat/react` | createExtEventRendererRegistry | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0b | `@jini-ai/chat/react` | createMcpUiToolCaller | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0c | `@jini-ai/chat/react` | MCP_UI_EXT_EVENT_NAME | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0b | `@jini-ai/chat/react` | mcpUiSurfaceSlotKey | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0c | `@jini-ai/chat/react` | MidRunUserMessage | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0c | `@jini-ai/chat/react` | MID_RUN_USER_MESSAGE_EXT_EVENT_NAME | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0b | `@jini-ai/chat/react` | midRunUserMessageSlotKey | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0c | `@jini-ai/chat/react` | ExtEventRendererRegistry | 1 | `components/AssistantDock/hooks/use-dock-renderer-registry.hooks.ts:11` |
| 0b | `@jini-ai/chat/react` | resolveChatPaneSelection | 1 | `components/AssistantDock/local-cli-selection-echo.ts:1` |
| 0b | `@jini-ai/chat/react` | useFabPosition | 1 | `components/ChatFab/ChatFab.hooks.tsx:1` |
| 0c | `@jini-ai/chat/react` | FabPositionResult | 1 | `components/ChatFab/ChatFab.hooks.tsx:2` |
| 0c | `@jini-ai/ui` | SecretInput | 1 | `components/SecretInput/SecretInput.tsx:2` |
| 0c | `@jini-ai/ui` | SecretInputProps | 1 | `components/SecretInput/SecretInput.tsx:3` |
| 0a | `@jini-ai/ui/admin-widgets` | useSelectDropdown | 1 | `components/Select/Select.hooks.tsx:1` |
| 0a | `@jini-ai/ui/admin-widgets` | usePanelPosition | 1 | `components/Select/Select.hooks.tsx:4` |
| 0a | `@jini-ai/ui/admin-widgets` | resolveSelectTriggerLabel | 1 | `components/Select/Select.tsx:2` |
| 0c | `@jini-ai/ui/admin-widgets` | SelectProps | 1 | `components/Select/Select.tsx:2` |
| 0a | `@jini-ai/ui/admin-widgets` | useDebouncedHtmlPreview | 1 | `components/WidgetConfigFields/WidgetPreview.hooks.ts:1` |
| 0c | `@jini-ai/ui/admin-widgets` | HtmlPreviewPort | 1 | `components/WidgetConfigFields/WidgetPreview.hooks.ts:1` |
| 0a | `@jini-ai/ui/fetch-query` | useCursorPages | 1 | `features/database/hooks/use-timeline-section.hooks.ts:4` |
| 0a | `@jini-ai/ui` | useWiredCopyToClipboard | 1 | `features/deployment/StaticSiteTab.tsx:2` |
| 0c | `@jini-ai/ui/core` | FolderPathDropPort | 1 | `features/fs-files/folder-drop-port.ts:1` |
| 0a | `@jini-ai/ui` | folderPathsFromDataTransfer | 1 | `features/fs-files/hooks/use-folder-drop.hooks.ts:5` |
| 0c | `@jini-ai/ui` | FileDropzone | 1 | `features/library/Library.tsx:5` |
| 0a | `@jini-ai/ui/renderers` | renderMarkdownToSafeHtml | 1 | `features/library/hooks/use-library.hooks.ts:4` |
| 0c | `@jini-ai/ui/fetch-query` | QueryKey | 1 | `features/library/rules.ts:1` |
| 0a | `@jini-ai/ui` | MediaProvidersTab | 1 | `features/media/Media.tsx:6` |
| 0c | `@jini-ai/ui/admin-widgets` | MiddleTruncate | 1 | `features/media/Media.tsx:42` |
| 0c | `@jini-ai/ui/core` | MediaProviderCredentials | 1 | `features/media/api/media-api.types.ts:1` |
| 0c | `@jini-ai/ui` | MediaProviderOption | 1 | `features/media/media-provider-catalog.ts:7` |
| 0c | `@jini-ai/ui` | MediaProviderMap | 1 | `features/media/media-providers-port.ts:1` |
| 0c | `@jini-ai/ui` | MediaProvidersPort | 1 | `features/media/media-providers-port.ts:1` |
| 0a | `@jini-ai/ui` | createBrowserViewerClipboard | 1 | `features/observability/hooks/recent-server-errors-dependencies.hooks.ts:1` |
| 0a | `@jini-ai/ui` | findActiveTab | 1 | `features/observability/hooks/use-observability-tab.hooks.ts:2` |
| 0a | `@jini-ai/ui` | resolveInitialActiveTabId | 1 | `features/observability/hooks/use-observability-tab.hooks.ts:2` |
| 0a | `@jini-ai/ui` | useTabbedDialog | 1 | `features/observability/hooks/use-observability-tab.hooks.ts:2` |
| 0a | `@jini-ai/ui` | useCopyToClipboard | 1 | `features/observability/hooks/use-recent-error-item.hooks.ts:2` |
| 0c | `@jini-ai/ui/html-editor` | CanvasContentWrapperNode | 1 | `features/pages/hooks/theme-canvas-wrapper.ts:1` |
| 0a | `@jini-ai/ui/html-editor` | findEditorBlockOpening | 1 | `features/pages/hooks/use-editor-html-jump.hooks.ts:2` |
| 0c | `@jini-ai/ui/html-editor` | EditorHtmlTarget | 1 | `features/pages/hooks/use-editor-html-jump.hooks.ts:2` |
| 0a | `@jini-ai/ui/html-editor` | isEditorSourceError | 1 | `features/pages/hooks/use-interactive-flush.hooks.ts:3` |
| 0c | `@jini-ai/ui` | ICON_PATH_DATA | 1 | `features/plugins/agent-plugins-visuals.tsx:2` |
| 0c | `@jini-ai/chat/react` | ComposerDiscoveryItem | 1 | `features/plugins/composer-capabilities.ts:1` |
| 0a | `@jini-ai/ui` | IntegrationsTab | 1 | `features/providers/Providers.tsx:3` |
| 0a | `@jini-ai/ui/admin-widgets` | ComingSoonPanel | 1 | `features/providers/Providers.tsx:10` |
| 0c | `@jini-ai/ui` | OnboardingChipField | 1 | `features/security/AccessTokensTab.tsx:4` |
| 0c | `@jini-ai/ui` | ACCENT_SWATCHES | 1 | `features/settings/AdminAppearance.tsx:1` |
| 0a | `@jini-ai/ui` | resolveAccentColor | 1 | `features/settings/AdminAppearance.tsx:1` |
| 0c | `@jini-ai/ui` | SourceConfigAddForm | 1 | `features/settings/ExternalMcpSettingsPanel.tsx:13` |
| 0a | `@jini-ai/ui` | SourceConfigItemCard | 1 | `features/settings/ExternalMcpSettingsPanel.tsx:13` |
| 0a | `@jini-ai/ui` | sourceDisplayLabel | 1 | `features/settings/ExternalMcpSettingsPanel.tsx:13` |
| 0a | `@jini-ai/ui` | useWiredSourceConfigList | 1 | `features/settings/ExternalMcpSettingsPanel.tsx:13` |
| 0c | `@jini-ai/ui/admin-widgets` | SeeMore | 1 | `features/settings/ExternalMcpToolPicker.tsx:4` |
| 0a | `@jini-ai/ui` | ExecutionTab | 1 | `features/settings/SettingsUi.tsx:125` |
| 0a | `@jini-ai/ui` | InstructionsTab | 1 | `features/settings/SettingsUi.tsx:125` |
| 0a | `@jini-ai/ui` | LanguageTab | 1 | `features/settings/SettingsUi.tsx:125` |
| 0a | `@jini-ai/ui` | MemorySettingsPanel | 1 | `features/settings/SettingsUi.tsx:125` |
| 0a | `@jini-ai/ui` | NotificationsTab | 1 | `features/settings/SettingsUi.tsx:125` |
| 0a | `@jini-ai/ui` | PrivacyTab | 1 | `features/settings/SettingsUi.tsx:125` |
| 0c | `@jini-ai/ui` | MemoryConfigFlagKey | 1 | `features/settings/SettingsUi.tsx:125` |
| 0c | `@jini-ai/ui` | MemoryEntrySummary | 1 | `features/settings/SettingsUi.tsx:125` |
| 0c | `@jini-ai/ui` | MemoryExtractionRecord | 1 | `features/settings/SettingsUi.tsx:125` |
| 0c | `@jini-ai/ui` | AddSourceInput | 1 | `features/settings/hooks/use-external-mcp.hooks.ts:12` |
| 0c | `@jini-ai/ui` | AddSourceResult | 1 | `features/settings/hooks/use-external-mcp.hooks.ts:12` |
| 0c | `@jini-ai/ui` | SourceTestResult | 1 | `features/settings/hooks/use-external-mcp.hooks.ts:12` |
| 0a | `@jini-ai/ui` | useI18n | 1 | `features/settings/hooks/use-settings-locale-sync.hooks.ts:2` |
| 0a | `@jini-ai/ui` | MemoryTopTab | 1 | `features/settings/hooks/use-settings-ui.hooks.ts:7` |
| 0c | `@jini-ai/ui` | SourceFieldSpec | 1 | `features/settings/rules.ts:1` |
| 0c | `@jini-ai/ui` | SourceFieldValues | 1 | `features/settings/rules.ts:1` |
| 0c | `@jini-ai/ui/core` | ACCENT_SWATCH_PRESETS | 1 | `features/settings/rules.ts:2` |
| 0c | `@jini-ai/ui/admin-widgets` | SuggestInput | 1 | `features/taxonomy/TermPicker.tsx:2` |
| 0c | `@jini-ai/ui/admin-widgets` | ImagePreviewModal | 1 | `features/themes/Themes.tsx:11` |
| 0c | `@jini-ai/ui/panel-kit` | DirtyGuard | 1 | `features/themes/hooks/use-theme-explore.hooks.ts:9` |
| 0b | `@jini-ai/chat/core` | deriveConversationTitle | 1 | `hooks/assistant-chats-dependencies.hooks.ts:2` |
| 0b | `@jini-ai/chat/react` | createLastConversationStore | 1 | `hooks/assistant-chats-dependencies.hooks.ts:3` |
| 0a | `@jini-ai/ui` | readableTextColor | 1 | `hooks/use-admin-appearance.hooks.ts:1` |
| 0a | `@jini-ai/ui` | useExecutionCredential | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0c | `@jini-ai/ui` | UseExecutionCredentialInput | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0c | `@jini-ai/ui` | ExecutionCredentialController | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0c | `@jini-ai/ui` | ExecutionCredentialPort | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0c | `@jini-ai/ui` | ExecutionCredentialEffects | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0c | `@jini-ai/ui` | ExecutionCredentialSaveState | 1 | `hooks/use-admin-execution-credential.hooks.ts:2` |
| 0b | `@jini-ai/chat/react` | createAssistantChatsClient | 1 | `hooks/use-assistant-chats.hooks.ts:2` |
| 0c | `@jini-ai/chat/react` | AssistantChatsPort | 1 | `hooks/use-assistant-chats.hooks.ts:2` |
| 0a | `@jini-ai/ui/panel-kit` | useSettingsSlice | 1 | `hooks/use-settings-slice.hooks.ts:5` |
| 0a | `@jini-ai/ui/panel-kit` | mergeSaveStates | 1 | `hooks/use-settings-slice.hooks.ts:5` |
| 0c | `@jini-ai/ui/panel-kit` | SettingsSliceOptions | 1 | `hooks/use-settings-slice.hooks.ts:5` |
| 0c | `@jini-ai/ui/panel-kit` | SAVE_DEBOUNCE_MS | 1 | `hooks/use-settings-slice.hooks.ts:7` |
| 0a | `@jini-ai/ui/panel-kit` | canAcceptRefresh | 1 | `hooks/use-settings-slice.hooks.ts:7` |
| 0a | `@jini-ai/ui/panel-kit` | useStandingDraftAutosave | 1 | `hooks/use-standing-draft-autosave.hooks.ts:3` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftAutosavePort | 1 | `hooks/use-standing-draft-autosave.hooks.ts:3` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftAutosaveOptions | 1 | `hooks/use-standing-draft-autosave.hooks.ts:3` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftAutosaveController | 1 | `hooks/use-standing-draft-autosave.hooks.ts:6` |
| 0c | `@jini-ai/ui/panel-kit` | StandingDraftStaleBasis | 1 | `hooks/use-standing-draft-autosave.hooks.ts:6` |
| 0b | `@jini-ai/chat/transports/http` | createA2uiActionPoster | 1 | `lib/a2ui-action-poster.ts:1` |
| 0c | `@jini-ai/chat/transports/http` | A2uiActionDeliveryOutcome | 1 | `lib/a2ui-action-poster.ts:3` |
| 0a | `@jini-ai/ui/panel-kit` | createFailureChannel | 1 | `lib/admin-failure-channel.ts:2` |
| 0b | `@jini-ai/chat/browser/agent-inventory` | createAgentInventorySnapshot | 1 | `lib/assistant-agents-snapshot.ts:2` |
| 0b | `@jini-ai/chat/transports/http` | createConditionalHistoryRead | 1 | `lib/assistant-chats.ts:1` |
| 0b | `@jini-ai/chat/transports/ag-ui` | createAgUiRunClient | 1 | `lib/assistant-transport-ag-ui.ts:34` |
| 0b | `@jini-ai/chat/transports/http` | createAssistantTransportClient | 1 | `lib/assistant-transport.ts:1` |
| 0c | `@jini-ai/ui/visible-interval` | VisibilitySource | 1 | `lib/browser-stream.ts:2` |
| 0b | `@jini-ai/chat/transports/http` | createChatAttachmentValidator | 1 | `lib/chat-attachment-liveness.ts:1` |
| 0c | `@jini-ai/chat/core` | SecretRedactionSignal | 1 | `lib/credential-card-guidance.ts:1` |
| 0b | `@jini-ai/chat/transports/http` | followDurableRun | 1 | `lib/durable-run-subscription.ts:2` |
| 0a | `@jini-ai/ui` | createExecutionHttpAdapter | 1 | `lib/execution-settings.ts:75` |
| 0a | `@jini-ai/ui` | requireExecutionResponseData | 1 | `lib/execution-settings.ts:75` |
| 0a | `@jini-ai/ui/fetch-query` | FetchQueryProvider | 1 | `lib/fetch-query/provider.tsx:2` |
| 0c | `@jini-ai/ui/fetch-query` | FetchQueryEnvironmentPort | 1 | `lib/fetch-query/provider.tsx:2` |
| 0a | `@jini-ai/ui/fetch-query/tanstack` | FetchQueryProvider | 1 | `lib/fetch-query/provider.tsx:3` |
| 0a | `@jini-ai/ui/panel-kit` | retryWhileUnreachable | 1 | `lib/retry-unreachable.ts:2` |
| 0c | `@jini-ai/ui/panel-kit` | UNREACHABLE_RETRY_DELAYS_MS | 1 | `lib/retry-unreachable.ts:6` |
| 0c | `@jini-ai/ui` | DEFAULT_NOTIFICATIONS_PREFERENCES | 1 | `lib/settings-tabs.ts:23` |
| 0a | `@jini-ai/ui` | normalizeAccentColor | 1 | `lib/settings-tabs.ts:23` |
| 0a | `@jini-ai/ui/panel-kit` | createStandingDraftLocalBackup | 1 | `lib/standing-draft-local-backup.ts:2` |
| 0c | `@jini-ai/ui/panel-kit` | LOCAL_BACKUP_PRINCIPAL_ID | 1 | `lib/standing-draft-local-backup.ts:4` |
| 0c | `@jini-ai/chat/core` | UserTextRedactionOptions | 1 | `lib/typed-answer-poster.ts:2` |
| 0b | `@jini-ai/chat/react` | createTypedAnswerPoster | 1 | `lib/typed-answer-poster.ts:16` |
| 0c | `@jini-ai/chat/react` | DeliverTypedAnswer | 1 | `lib/typed-answer-poster.ts:16` |
