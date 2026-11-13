### jini:packages/ui/src/features/memory/react/components/MemoryManualEditor.tsx
- **Over:** `MemoryManualEditor` 200 (file 207, fine)
- **Phase:** now · **Batch:** size-35
- **Tests:** `src/features/memory/__tests__/react/components/MemoryManualEditor.test.tsx`, `src/features/memory/__tests__/react/hooks/useMemoryEntries.test.tsx`, `src/features/memory/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="memory-source-summary">` + flash pill | tab header (summary, New button, flash) — stays |
| B | `{!editing.id ? (<div ...> {t('Start from')} ... STARTERS.map ...)` | starter-template picker for a new draft |
| C | the column `<div>` holding Name / Type / Description / Details fields | draft field inputs |
| D | the footer `<div>` with hint + Cancel / Save-or-Create buttons | form actions |
| E | `editing ? (<div ref={editorRef} className="library-card" ...>` wrapper | form card shell — stays, renders B/C/D |

- **Splits** (same file, sub-components at module level above `MemoryManualEditor`, in this order; each that renders text calls `const t = useT();`; JSX verbatim incl. inline styles):
  1. SUB-COMPONENT `MemoryStarterPicker({ draftId, onEditingChange }: MemoryStarterPickerProps): JSX.Element` ← unit B's inner `<div>` (the `!editing.id` guard stays in the parent). Uses `id: draftId` where it used `editing.id` (always `undefined`/falsy there — keep the expression `id: draftId` so behavior is identical). Props: `draftId: DraftEntry['id']; onEditingChange: (draft: DraftEntry) => void`.
  2. SUB-COMPONENT `MemoryDraftFields({ editing, onEditingChange, editorNameRef }: MemoryDraftFieldsProps): JSX.Element` ← unit C. Computes `const typeLabel = useMemo(() => memoryTypeLabels(t), [t]);` itself (move that line out of the parent — only C reads it). Props: `editing: DraftEntry; onEditingChange: (draft: DraftEntry) => void; editorNameRef: MutableRefObject<HTMLInputElement | null>`.
  3. SUB-COMPONENT `MemoryDraftActions({ isExisting, canSave, onCancel, onSave }: MemoryDraftActionsProps): JSX.Element` ← unit D. Parent passes `isExisting={Boolean(editing.id)}` and `canSave={!busy && Boolean(editing.name.trim())}`; inside: `disabled={!canSave}` and `{isExisting ? t('Save') : t('Create')}`. (Equivalent to `busy || !editing.name.trim()` / `editing.id ? ...`.)
  4. `MemoryManualEditor` keeps `t`, `flashLabel`, unit A, and E's wrapper rendering 1–3.
- **Importers to update:** none (no exports move).
- **After:** file ~215; `MemoryManualEditor` ~65; `MemoryStarterPicker` ~45; `MemoryDraftFields` ~70; `MemoryDraftActions` ~30.
- **Risks / notes:** `editorNameRef` must stay on the Name `<input>` (focus effect in useMemoryEntries targets it). `editorRef` stays on the card wrapper in the parent. No mocks of this file.
