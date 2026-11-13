### jini:packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts
- **Over:** `useSettingsSlice` 125 (file 191)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/panel-kit/hooks/__tests__/use-settings-slice.hooks.test.tsx`, `packages/ui/src/features/panel-kit/hooks/__tests__/admin-lifecycles.test.tsx`, `packages/ui/src/features/execution/__tests__/react/hooks/use-execution-credential.lifecycle.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | refs `io`, `persisted`, `latest`, `timer`, `writes`, `saveTicket`, `hasUnsavedEdits`, `commits`, `mounted` + state | slice bookkeeping (stays) |
| B | `useEffect(() => {` initial load (~L304) | first load of the persisted value |
| C | `runSave`, unmount-flush effect, `onChange` | debounced save chain (stays) |
| D | `const refresh = useCallback(async () => {`, `const refreshPort = …`, its `useEffect` | external-notification re-read |

- **Splits** (same file, above `useSettingsSlice`):
  1. SUB-HOOK `useSettingsInitialLoad({ io, persisted, latest, hasUnsavedEdits, setValue, setLoadError, defaultValue }: UseSettingsInitialLoadInput<T>): void` ← the load `useEffect` with its "`defaultValue` is a module-level constant…" comment and deps array verbatim.
  2. SUB-HOOK `useSettingsRefresh({ options, io, timer, hasUnsavedEdits, mounted, commits, refreshSettlement, latest, persisted, setValue }: UseSettingsRefreshInput<T>): () => Promise<void>` ← `refresh` (with its doc comment), `const refreshPort = options.refreshPort;` (with comment) and the subscribe `useEffect`; returns `refresh`. Call it where `refresh` was declared (after `onChange`), so hook order is unchanged.
- **Importers to update:** none.
- **After:** `useSettingsSlice` ~65; file ~205.
- **Risks / notes:** hook call order must stay: mount effect, load effect, runSave, unmount effect, onChange, refresh, refreshPort effect. Refs are passed as `MutableRefObject`s (read `.current` at run time as before). Generic `T` flows through both input types.
