# Admin hooks (host side)

## Wiring

- `assistant-chats-dependencies.hooks.ts` binds Tovu's chats client to the Jini
  `AssistantChatsPort` (`@jini-ai/admin/shell/hooks/assistant-chats-port.hooks`) as
  `defaultAssistantChatsPort`; `use-assistant-chats.hooks.ts` stays host-side.
- `App.tsx` calls `useBrowserTelemetryFeed` (`@jini-ai/admin/react`) with `base: ADMIN_BASE` and
  `telemetry: adminTelemetry`, and the Jini `useDesktopViewRelease` with `{ routePath, signedIn }`.
