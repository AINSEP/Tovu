### jini:packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx
- **Over:** `SketchEditor` 109 (file 181)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/sketch-editor/__tests__/react/components/SketchEditor.test.tsx`, `packages/ui/src/features/sketch-editor/__tests__/react/dependencies-fake.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useI18n`, `canvasWrapRef`, `useSketchThemeHook()`, scene hook destructure (~L134), save-workflow destructure (~L148), `useSketchDomEnhancements({`, `hasContent`, `canSave`, `saveStatus` | wire the editor's hooks (state/effects) |
| B | `return (` JSX | render canvas + toast |

- **Splits:**
  1. NEW `SketchEditor.hooks.ts` (same folder) — job: wire the editor hooks. `useSketchEditor({ props }: UseSketchEditorInput): SketchEditorView` ← unit A verbatim (incl. the "Calls the raw hook (not `useWiredSketchSaveWorkflow`)…" comment); returns every local the JSX reads (`t`, `locale`, `canvasWrapRef`, `theme`, `initialData`, `editorInstanceKey`, `handleChange`, `handleExcalidrawAPI`, `showSaved`, `exporting`, `toast`, `handleSave`, `handleExportImage`, `dismissToast`, `handleToastAction`, `canSave`, `saveStatus`, `Excalidraw`, `MainMenu`). Moves `resolveSaveStatus` there (only unit A uses it). Imports `SketchEditorProps` type from `./SketchEditor.js` — to avoid a cycle, move `SketchEditorProps` into the hooks file and re-export it from `SketchEditor.tsx` only if `SketchEditor.tsx` is a package-entry target (check `packages/ui/package.json` exports); otherwise update importers.
  2. `SketchEditor` keeps props destructuring (with defaults) and calls `useSketchEditor`.
- **Importers to update:** `SketchEditorProps` — `rg -n "SketchEditorProps" packages/ui/src` (feature `index.ts` barrel; update to the hooks path or keep the barrel line pointing to the new file).
- **After:** `SketchEditor` ~65; SketchEditor.tsx ~120; hooks file ~75.
- **Risks / notes:** defaults (`saving = false`, `dirty = false`) must be applied before passing into the hook — pass the destructured values, not raw props. `useSketchThemeHook` comes from `dependencies`/props; keep the call inside the hook unconditionally.
