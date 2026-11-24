# AssistantDock (host side)

The dock's generic pieces live in `@jini-ai/admin/shell/components/AssistantDock/*`. This folder keeps
the host composition: `AssistantDock.tsx`, `DockHeader.tsx`, `DockChatPane.tsx`, the `*.adapter.ts`
preference bindings, `FolderDropNotice.tsx`, the `useWired*` hooks and every Tovu product string.

## Wiring

- **Copy.** `assistant-dock-i18n` (Jini) holds the neutral dock and chat-pane dictionaries. Tovu's
  product copy ("Tovu assistant", the folder-window note) lives in `app-i18n.ts` and reaches the
  package as `ASSISTANT_DOCK_HOST_FIELDS` (dock `t`) and `CHAT_I18N_HOST_FIELDS`
  (`createChatI18nAdapter`, with the settings-dialog dictionaries and the chat package's
  secret/credential keys passed by identity).
- **Gear menu.** `DockHeader` mounts the Jini `DockSettingsMenu` and passes `useTaxonomyRowMenuHook`
  (`@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks`) and `ChatSettingsSegmented`
  (`@jini-ai/chat/react`). `DockChatPane`/`DockHeader` pass `CHAT_TOOL_CALL_OPTIONS` and
  `REPLY_LENGTH_OPTIONS` to `dockSettingsMenuSections`. `DockHeaderTip` passes `useInfoTip` to
  `useDockHeaderTip`.
- **Preferences.** The adapters pass `CHAT_DISPLAY_NAMESPACE` (and `DEFAULT_ASSISTANT_RUNTIME_PREFERENCES`)
  to the Jini preference hooks. `AssistantDock.state.hooks` passes `createExecutionPort` /
  `selectedAgentWarning` to `useSelectedAgentAuthWarning` and `defaultAssistantChatsPort` to
  `useConversationRefreshSignal`. `DockHeader` passes `useWiredAssistantSubagentsSettings` to
  `SubagentsIndicator`.
- **Folder drop.** `FolderDropNotice` and `assistant-dock-props` pass `useTHook={useT}` to the Jini
  notices and `FolderPathButton`. `composer-files.hooks` passes `legacyManifestNames:
  ["tovu.plugin.json"]` to `partitionChatPackages`.
- **Styles.** The Jini components render `jini-*` classes; `styles/assistant.css` styles
  `jini-folder-drop-notice*`, `jini-composer-folder-path`, `jini-dock-settings-menu*` and
  `jini-assistant-dock-icon-button`. Tests that render them use `@/__tests__/render-with-jini-kits`.
