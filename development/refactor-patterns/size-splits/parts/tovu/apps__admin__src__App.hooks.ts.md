### tovu:apps/admin/src/App.hooks.ts
- **Over:** file 556 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-53
- **Tests:** `apps/admin/src/__tests__/unit/app-hooks-admin-capability-executors.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-frontend-session-error.unit.test.ts`, `apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-session-seam.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-logout-confirm.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `UseAdminSession`, `useAdminSession`, `usePublishCriteriaDeepLink`, `useAdminAssistantAvailability` | session + boot gates (stays) |
| B | `SITES_PANEL_ID` … `useDefaultSectionRedirect` | Sites-section availability + route gate (stays) |
| C | `UseLogoutConfirm`, `useLogoutConfirm`, `UseSidebarDrawer`, `useSidebarDrawer`, `useInternalLinkInterceptor`, `translateAssistantDockLabel`, `resolveChatFabClearance`, `UseChatDockLayout`, `useChatDockLayout`, `useScreenshotAnnouncement`, `useCollapsibleNavGroupLabels`, `createAdminShellTranslators` | shell chrome state (stays) |
| D | `UseAgentPageBridge`, `PUBLISH_CONTENT_FIRST_PLAN_TIMEOUT_MS`, `stillWorkingPublishResult`, `withFirstPlanTimeout`, `buildAdminCapabilityExecutors`, `logFrontendSessionError`, `AdminWebMcpModelContext`, `resolveWebMcpModelContext`, `registerAdminWebMcpTool`, `useAgentPageBridge` | agent control of this tab (frontend-session bridge + WebMCP) |

- **Splits:**
  1. NEW `apps/admin/src/App-agent-page-bridge.hooks.ts` (plan-given name; stem `App.hooks` has a dot) — job: agent-driven control of this admin tab. Moves unit D verbatim incl. the long doc comment above `PUBLISH_CONTENT_FIRST_PLAN_TIMEOUT_MS` (it documents `useAgentPageBridge`; keep it above the same declarations) and the WebMCP plan comments. Exports: `UseAgentPageBridge`, `buildAdminCapabilityExecutors`, `logFrontendSessionError`, `registerAdminWebMcpTool`, `useAgentPageBridge`. Imports nothing from `App.hooks.ts`. Copy the `@file` paragraph that mentions the agent bridge into the new header.
- **Importers to update:** `apps/admin/src/App.tsx` (`useAgentPageBridge`), `apps/admin/src/components/AssistantDock/AssistantDock.tsx` (`useAgentPageBridge` — check: may be type-only/comment), tests `app-hooks-admin-capability-executors`, `app-hooks-admin-webmcp`, `app-hooks-frontend-session-error`, `app-stream-wiring`, `app-logout-confirm`, `app-chat-dock-seam`, `app-session-seam` (all under `apps/admin/src/__tests__/unit/`), `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`, `apps/admin/src/lib/__tests__/agent-screenshot.unit.test.ts`. `lib/agent-screenshot.ts`/`agent-screenshot-bus.ts` mention the name in comments only — verify with rg `from .*App.hooks`.
- **After:** `App.hooks.ts` ~414 (+~55 if the App.tsx fragment's `useAdminShellState` lands here → ~470); new file ~145.
- **Risks / notes:** no `vi.mock` of `App.hooks` found. Order with App.tsx fragment: do this file first.
