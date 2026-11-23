# AssistantDock

## Wiring (host-owned storage keys)

- Moved to `@jini-ai/admin/shell/components/AssistantDock/`: `agent-failure`, `MessageOverflowModal`,
  `SelectedAgentPluginTray`, `SlowRunNoticeCard` and `hooks/use-routed-a2ui-surface-card.hooks`
  (plus `shell/components/shared-components-i18n` and `AdminByokKeyPanel.hooks` one level up). The
  host injects `@jini-ai/chat/react`'s `useT` as each component's required `useTHook`
  (`DockLeadingAccessory.tsx`, `OverflowAwareMcpUiSurfaceCard.tsx`, `use-dock-renderer-registry.hooks.ts`)
  and `useMessageOverflowModal` as the modal's required `useModal`. `styles.css` styles the modal's
  `jini-message-overflow-modal*` classes. `hooks/composer-skills.hooks.ts` stays here: it ranks with
  the host's `rankComposerDiscoveryGroups`.

- Recent working-directory names: Jini owns `createBrowserWorkingDirectoryAccess`
  (`@jini-ai/admin/shell/lib/browser-working-directory-access`); `hooks/composer-files.hooks.ts`'s
  `useWorkingDirectoryAccess` injects `recentDirectoryNamesStorageKey`
  (`"tovu.assistant.recentWorkingDirectoryNames"`, the pre-move key).
- Last-seen agent inventory: Jini owns `createAssistantAgentsSnapshot`
  (`@jini-ai/admin/shell/lib/assistant-agents-snapshot`); `lib/shell-collaborators.ts` binds it once
  with `@jini-ai/chat/browser/agent-inventory`'s `createAgentInventorySnapshot` and the key
  `"tovu.admin.assistant-agents.v1"`, and exports `readAgentsSnapshot` / `writeAgentsSnapshot`.
