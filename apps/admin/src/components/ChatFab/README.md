# ChatFab

The draggable assistant button. `ChatFab.tsx` (markup, labels, CSS classes) stays in the host.

## Wiring

- Jini owns the position hook: `useFabPosition` from `@jini-ai/admin/shell/components/ChatFab/ChatFab.hooks`,
  which reads the kit's `chat.useFabPosition` (bound in `integrations/jini-kits.ts`), so the button must
  render under `AdminKitProvider` (tests: `@/__tests__/render-with-jini-kits`).
- The host injects `storageKey: FAB_POSITION_STORAGE_KEY` (`"tovu-admin-fab-position"`, exported from
  `ChatFab.tsx`). It is the pre-move key: changing it resets every operator's saved position.
