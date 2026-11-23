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

## Wiring: components-4 moves (`@jini-ai/admin/shell/components/...`)

Jini now owns `agent-failure-hints`, `WidgetConfigFields/WidgetConfigFields.hooks`,
`AdminFailureNotice`, `MailStatusBanner` and `SitesSidebarNav`. The host injects:
- `main.tsx` passes `channel={adminFailureChannel}` and imports `AdminFailureNotice/admin-failure-notice.css`.
- `App.tsx` passes `port={defaultSitesPort}`, `useSitesSnapshot`, `translateNavLabel={translateAdminNavLabel}`
  `useSitesSidebarNavHook={useSitesSidebarNav}`, `SidebarNav={Sidebar.Nav}` and `useSidebar` to `SitesSidebarNav`.
- `MailStatusBanner` callers pass `useMailStatusBannerHook={useMailStatusBanner}` (host hook file stays).
- Host stylesheets style the Jini classes: `.jini-admin-failure-notice*`, `.jini-mail-status-banner*`
  (`mail-status-banner.css`) and `.jini-sites-*` (`styles.css`).

## Wiring: components-5 moves (`@jini-ai/admin/shell/components/AssistantDock/...`)

Jini now owns `AgentFailureCard` and `AgentFailureCard.hooks`. The host injects:
- `hooks/use-dock-renderer-registry.hooks.ts` registers the card with `useTHook={useT}` (chat),
  `useAgentFailureCardHook={useAgentFailureCard}` and `redactionOptions={TOVU_ERROR_REDACTION_OPTIONS}`.
- `assistant.css` styles the Jini class `.jini-agent-failure` (was `.admin-agent-failure`).
- `hooks/agents-inventory.hooks.ts` and `hooks/runtime-access.hooks.ts` stay host-side for now: they
  call the host request client, its `ApiError`, the agents snapshot and the `/api/agents` route.
