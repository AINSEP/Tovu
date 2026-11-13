### jini:packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx
- **Over:** `VersionManagerModal` 137 (file 207)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/version-manager/__tests__/react/components/VersionManagerModal.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useI18n`, `controller = useVersionManagerHook(…)`, `useCopyToClipboard`, controller destructure (~L57), `versionCountLabel`, `promptOpenRef`, `handleEscape`, Escape `useEffect` | modal state + layered Escape |
| B | `return createPortal(` | render list + preview (stays) |

- **Splits:**
  1. NEW `VersionManagerModal.hooks.ts` (same folder) — job: modal wiring. `useVersionManagerModal({ fileRef, currentContent, onClose, onRestored, dependencies, viewportPresets, useVersionManagerHook }: UseVersionManagerModalInput): VersionManagerModalView` ← unit A verbatim (with the "Layered Escape handling…" comment); returns every local the JSX reads (take the list from the return statement's `uses:`). Imports nothing from the original.
  2. `VersionManagerModal` keeps the props destructure (incl. its defaults, unchanged) and calls the hook.
- **Importers to update:** none.
- **After:** `VersionManagerModal` ~88; file ~165; hooks file ~70.
- **Risks / notes:** the default `dependencies = defaultVersionManagerDependencies as unknown as …` is pre-existing (banned pattern) — leave it exactly where it is, do not copy it into the hooks file. If the JSX still pushes the component over 100, also move the version list `<ul>`/list block into a sub-component `VersionList` (plain props).
