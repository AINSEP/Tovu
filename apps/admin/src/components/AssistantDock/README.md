# AssistantDock

## Wiring (host-owned storage keys)

- Recent working-directory names: Jini owns `createBrowserWorkingDirectoryAccess`
  (`@jini-ai/admin/shell/lib/browser-working-directory-access`); `hooks/composer-files.hooks.ts`'s
  `useWorkingDirectoryAccess` injects `recentDirectoryNamesStorageKey`
  (`"tovu.assistant.recentWorkingDirectoryNames"`, the pre-move key).
- Last-seen agent inventory: Jini owns `createAssistantAgentsSnapshot`
  (`@jini-ai/admin/shell/lib/assistant-agents-snapshot`); `lib/shell-collaborators.ts` binds it once
  with `@jini-ai/chat/browser/agent-inventory`'s `createAgentInventorySnapshot` and the key
  `"tovu.admin.assistant-agents.v1"`, and exports `readAgentsSnapshot` / `writeAgentsSnapshot`.
