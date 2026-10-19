Programmer(Direct): Chosen for the boot lifecycle and cache integration fix.

**ROOT CAUSE:**

- Initial SSE `open` triggered an unscoped settings refresh. It now skips the first open and retains reconnect refreshes: [settings-events.ts:98](/Users/la/Programming/Tovu/apps/admin/src/lib/settings-events.ts:98).
- Restored chat history was treated as a newly completed run, publishing settings and content refreshes. Existing publication markers now seed from history: [AssistantDock.hooks.tsx:1528](/Users/la/Programming/Tovu/apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1528).
- Direct reads, always-stale queries, and separate agents health probes amplified those notifications.
- The dashboard independently requested `auth/me`; it now uses the authenticated principal: [dashboard-dependencies.hooks.ts:19](/Users/la/Programming/Tovu/apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts:19).

**CHANGED FILES:** All under `apps/admin/src/`.

- Boot boundary: `App.tsx`, `App.hooks.ts`, `lib/admin-boot-scope.ts`.
- Refresh and persisted inventory: `lib/settings-events.ts`, `lib/assistant-agents-snapshot.ts`.
- Settings readers: `hooks/use-admin-locale.hooks.ts`, `hooks/use-admin-appearance.hooks.ts`, `hooks/use-interface-preferences.hooks.ts`.
- Shared readers: `features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts`, `features/sites/hooks/use-sites-snapshot.hooks.ts`, `integrations/chart-providers/use-chart-registry.hooks.ts`.
- Dock: `components/AssistantDock/hooks/AssistantDock.hooks.tsx`.
- Dashboard: `features/dashboard/hooks/{dashboard-port.hooks.ts,dashboard-dependencies.hooks.ts,use-dashboard.hooks.ts}`.
- Added [real-App request-count regression](/Users/la/Programming/Tovu/apps/admin/src/__tests__/app-boot-request-volume.test.tsx) and [remount, isolation, and restored-history tests](/Users/la/Programming/Tovu/apps/admin/src/__tests__/admin-boot-readers.test.tsx).
- Updated five existing tests: settings events, agents snapshots, runtime access, appearance, and Sites visibility.

Reused Jini’s existing fetch-query cache and host ports. Added no cache or module-level store. Principal keys also scope the existing persisted agents placeholder. `request-volume.measurement.test.tsx` remains unchanged.

**NOT DONE:**

No tests, typecheck, builds, Vite, or servers were run, as instructed. The exact-once assertions and runtime behavior remain unverified. No git commands or commits were made.
