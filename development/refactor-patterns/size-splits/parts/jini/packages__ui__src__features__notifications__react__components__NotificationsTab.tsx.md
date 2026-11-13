### jini:packages/ui/src/features/notifications/react/components/NotificationsTab.tsx
- **Over:** `NotificationsTab` 134 (file 239)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/notifications/react/components/__tests__/NotificationsTab.characterization.test.tsx`, `packages/ui/src/features/notifications/__tests__/react/components/NotificationsTab.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useState` permission/testStatus, `toggleSound`, `toggleDesktop`, `sendTestNotification` | notification state + handlers |
| B | `label` + the 13 `const xxx = label({...})` lines | resolve label copy |
| C | JSX first `<div className="jini-settings-subsection">` | completion-sound section |
| D | JSX second `<div className="jini-settings-subsection">` | desktop-notification section |

- **Splits:**
  1. NEW `NotificationsTab.hooks.ts` (same folder) — job: tab state + handlers. `useNotificationsTab({ preferences, onChange, testNotificationTitle, testNotificationBody }: UseNotificationsTabInput): { permission, testStatus, toggleSound, toggleDesktop, sendTestNotification }` ← the two `useState` lines, `const t = useT()` copy needed by `sendTestNotification` (hook calls `useT()` itself), and the three handlers verbatim. Move type `TestStatus` there and export it (component imports it). Imports nothing from the original.
  2. HELPER `resolveNotificationsTabCopy({ labels, t }: ResolveNotificationsTabCopyInput): NotificationsTabCopy` (in NotificationsTab.tsx, above the component) ← `label` and the 13 label constants; returns an object with the same 13 names plus `label` (JSX uses `label` directly).
  3. SUB-COMPONENTS (same file, below `NotificationsTab`, next to `NotificationToggle`): `CompletionSoundSection` ← first subsection JSX; `DesktopNotificationsSection` ← second. Plain props: exactly the names each JSX block reads (outline `uses:` of the return); no hook-result object.
- **Importers to update:** none (no export moves; `NotificationsTabLabels`/`Props` stay).
- **After:** `NotificationsTab` ~25; file ~250; hooks file ~45.
- **Risks / notes:** `useT()` is then called in both the component and the hook (same context, same value) — acceptable, no behavior change. Keep `permission` initializer lambda verbatim.
