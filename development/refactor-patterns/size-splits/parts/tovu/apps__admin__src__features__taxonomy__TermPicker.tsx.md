### tovu:apps/admin/src/features/taxonomy/TermPicker.tsx
- **Over:** `TermPicker` 132 (file 205)
- **Phase:** after-move (MOVE-AFTER taxonomy module) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/TermPicker.unit.test.tsx`, `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`, `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx`
- **Responsibility map:** hook + early return (stays) · agent handle ids (`termIds` … `searchHandles`) · the groups list `<div className="term-picker-groups">` · actions `<span className="editor-actions term-picker-actions">`.
- **Splits:**
  1. HELPER `buildTermPickerHandles({ taxonomies }: BuildTermPickerHandlesInput): TermPickerHandles` (same file, above `TermPicker`) ← `const termIds = …` through `const searchHandles = …` (with the "Term ids are database row ids" comment). Returns `{ termHandleById, moreHandles, searchHandles, addTriggerHandles, addInputHandles, addButtonHandles }`.
  2. SUB-COMPONENT `TermPickerGroups({ t, taxonomies, subject, handles, …the picker fields the block reads… }): ReactNode` ← `<div className="term-picker-groups">` block (renders `TermChecklist`). Pass picker fields individually (read the block for the list: e.g. `toggle`, `selected`, add-term state/handlers) — not the whole `picker`.
  `TermPicker` keeps hook, destructure, `if (hidden) return null;`, the handles call, the loading/empty branches and the actions span.
- **Importers to update:** none.
- **After:** `TermPicker` ~45; `TermPickerGroups` ~85; file ~230.
- **Risks / notes:** `vi.mock` of this module in `posts/__tests__/posts-i18n.unit.test.ts`, `posts/__tests__/PostEditor.unit.test.tsx`, `posts/__tests__/post-editor-agent-drive.unit.test.tsx`, `pages/__tests__/PageEditor.unit.test.tsx`, `pages/__tests__/PageEditor.preview-remount.unit.test.tsx` — they replace `TermPicker` wholesale; nothing moves out of the module, so mocks still apply. The `!` in `termHandles[index]!` is existing code — moved as-is.
