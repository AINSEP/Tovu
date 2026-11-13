### tovu:apps/admin/src/App.tsx
- **Over:** file 553 lines · `AdminShell` 199 · `AssistantChrome` 137
- **Phase:** after-move (MIXED, NEEDS-TIER-2) · **Batch:** size-53
- **Tests:** `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-panel-permissions.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-agent-page-identity.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-plugins-route.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-route-prototype-keys.unit.test.tsx`, `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/__tests__/app-boot-request-volume.test.tsx`, `apps/admin/src/lib/__tests__/import-export-routes.unit.test.ts`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `Route`, `PANELS_BY_ID`, `parseRoute`, `currentPanelId`, `agentPageId`, `RouteAccess`, `renderRoute`, `NoAccess`, `UnavailableSectionRedirect` | routing (stays) |
| B | `SidebarLogoutButton`, `SidebarLabelTooltips`, `SidebarEmptyClickToggle`, `LogoutConfirmDialog`, `AdminTopbar` | shell chrome pieces (stay) |
| C | `AssistantChrome` | assistant dock/sheet + ChatFab chrome |
| D | `AppProps`, `resolve*Hook`, `App`, `AdminShell` | shell composition (stays) |

- **Splits:**
  1. NEW `apps/admin/src/App-assistant-chrome.tsx` — job: assistant dock/sheet chrome. Moves `AssistantChrome` (+ its doc comment) and new sub-components below. Exports `AssistantChrome`. Imports nothing from `App.tsx`.
  2. SUB-COMPONENTS in `App-assistant-chrome.tsx` above `AssistantChrome`: `ChatSheetBar({ dockT, sheetExpanded, setSheetExpanded, setChatOpen }): ReactNode` ← the `<div className="chat-sheet-bar">` block (handle, title, expand button, `DockHeaderTip` close button); `AssistantDockAside({ chatDockRef, themeBoundary, chatOpen, sheetExpanded, locale, onDockDropCapture, dockT, setSheetExpanded, setChatOpen, agentBridge, principalId, publishDropCapture }): ReactNode` ← the whole `<aside` JSX (renders `ChatSheetBar` + `<AssistantDock`). `AssistantChrome` keeps hook call, `enabled` guard, `resolveChatFabClearance`, the hidden/comment wrappers and `<ChatFab`. Type `themeBoundary` as `ReturnType<typeof useAdminThemeBoundary>`.
  3. SUB-HOOK `useAdminShellState({ props, session }: UseAdminShellStateInput): AdminShellState` in `apps/admin/src/App.hooks.ts` ← every statement of `AdminShell` from `const useDrawer = resolveDrawerHook(props.useDrawer);` through `const collapsibleGroups = useCollapsibleNavGroupLabels(navGroups);` (all hook calls in the same order, comments move with them). Returns the locals the JSX reads. The `resolve*Hook` helpers and `NO_PERMISSIONS`, `SIDEBAR_RAIL_STORAGE_KEY` move with it IF used only there (else export from App.tsx is a cycle — keep them in App.hooks.ts and import into App.tsx). `AdminShell` keeps the two early returns (`checking`, `!user`), `renderRoute`, and the JSX.
  4. SUB-COMPONENTS in `App.tsx` above `AdminShell`: `AdminSidebar({ sidebarOpen, setSidebarOpen, navGroups, navLocale, navSoonLabel, collapsibleGroups, onLogout }): ReactNode` ← the `<Sidebar` … `</Sidebar>` block; `AdminMainColumn({ sidebarOpen, setSidebarOpen, navLocale, route, setContentEl, contentEl, content }): ReactNode` ← the `<div className="admin-main-col">` block (topbar, `<main`, `ScrollJumpButtons`).
- **Importers to update:** none outside the file for `AssistantChrome` (not exported). `useAdminShellState` new export.
- **After:** `App.tsx` ~370; `AdminShell` ~85; `AssistantChrome` ~55; `App-assistant-chrome.tsx` ~150; App.hooks.ts +~60.
- **Risks / notes:** hook order inside `useAdminShellState` must be identical (rules of hooks; early returns stay AFTER the hook call in `AdminShell`). Do App.hooks.ts fragment first so App.hooks stays ≤500. `apps/admin/src/__tests__/app-boot-request-volume.test.tsx` `vi.mock`s an AI-assistant path — not this file; check `rg "vi.mock\(.*App" apps/admin/src` before moving. NEEDS-TIER-2 label: shell is a hot path; consider Opus execution.
