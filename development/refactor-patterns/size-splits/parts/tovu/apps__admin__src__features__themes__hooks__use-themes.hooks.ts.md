### tovu:apps/admin/src/features/themes/hooks/use-themes.hooks.ts
- **Over:** `useThemes` 122 (file 193, under)
- **Phase:** now (?) · **Batch:** size-04
- **Tests:** `apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts`, `Themes.unit.test.tsx`, `themes-delete.unit.test.tsx`, `themes-duplicate.unit.test.tsx`, `themes-localization.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `rescanning`, `rescanNotice`, `rescanHasDuplicates` states + `async function rescan()` | re-read the themes directory |
| B | `duplicatingTheme`, `duplicateNotice` + `async function duplicate(themeId)` | duplicate a theme |
| C | `trashingTheme`, `trashNotice` + `async function trash(themeId)` | move a theme to Trash |
| D | query/loader/presentation, `actionError`, `write`, `activation`, refresh subscriptions, `busyTheme`, `activateSettlement`, `activateWrites`, `applyPresentation`, `activate`, return | presentation + activation (stays) |

- **Splits** (same file, module level, above `useThemes`):
  1. SUB-HOOK `useThemesRescan({ write, port, loader, applyPresentation, setError, t }: UseThemesRescanInput): { rescanning: boolean; rescanNotice: string | null; rescanHasDuplicates: boolean; rescan: () => Promise<void>; dismissRescanNotice: () => void }` ← the three `useState` lines + `async function rescan()` (with its comment). `dismissRescanNotice: () => setRescanNotice(null)` moves from the return into this hook.
  2. SUB-HOOK `useThemeDuplicate({ write, port, loader, applyPresentation, themeNames, setError, t }: UseThemeDuplicateInput): { duplicatingTheme; duplicateNotice; duplicate; dismissDuplicateNotice }` ← `duplicatingTheme`/`duplicateNotice` states + `async function duplicate(`.
  3. SUB-HOOK `useThemeTrash({ write, port, loader, applyPresentation, themeNames, setError, t }: UseThemeTrashInput): { trashingTheme; trashNotice; trash; dismissTrashNotice }` ← `trashingTheme`/`trashNotice` states + `async function trash(`.
  4. `useThemes` calls them after `applyPresentation` is declared (it is a function declaration — hoisted, but call the sub-hooks after its line for readability) and returns `{ settings, themes, themeTiers, themeNames, themePreviewImages, error, busyTheme, activate, ...rescanApi, ...duplicateApi, themeBuiltIn, ...trashApi, t }` — same keys as today. Types: `setError` = `Dispatch<SetStateAction<string | null>>`; `loader`/`write` = `ReturnType<typeof useCachedLoader<…>>`-free: annotate input fields with the controller-independent types the existing calls infer (export a local `type ThemesWrite = ReturnType<typeof useFetchMutation<…>>` only if inference cannot flow; prefer passing `write.mutate`-using code unchanged).
- **Importers to update:** none (no export moves).
- **After:** file ~210; `useThemes` ~75; sub-hooks ~22 each.
- **Risks / notes:** hook order changes only by grouping. `themeNames` is derived from `query` each render — pass the current value.
