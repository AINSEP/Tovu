### tovu:apps/admin/src/features/collections/Collections.tsx
- **Over:** file 556 lines · `Collections` 156
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/Collections.unit.test.tsx`, `collections-agent-drive.unit.test.tsx`, `use-new-content-type-dialog.unit.test.tsx`, `use-edit-fields-dialog.unit.test.tsx`, `use-lifecycle-confirm-dialog.unit.test.tsx`, `collections-i18n.unit.test.ts` (same folder), smoke `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `ContentTypeFieldFieldsetProps`, `ContentTypeFieldFieldset`, `NewContentTypeDialogProps`, `NewContentTypeDialog`, `EditFieldsDialogProps`, `EditFieldsDialog`, `LifecycleConfirmDialogProps`, `LifecycleConfirmDialog`, `CollectionsDialogs` | the screen's three modals |
| B | `<DataTable` element in `Collections`' return | content-types table (columns, row menu, embed copy) |
| C | `CollectionsProps`, `Collections` | hook, loading/error, header, compose (stays) |

- **Splits:**
  1. NEW `Collections-dialogs.tsx` — job: the Collections modals. Moves unit A verbatim (incl. the `// ----` section comments' text as JSDoc where they describe a dialog). Exports `NewContentTypeDialog`, `EditFieldsDialog`, `LifecycleConfirmDialog`, their `*Props`, and `CollectionsDialogs` (+ a `CollectionsDialogsProps` type: today `CollectionsDialogs` takes a slice of `CollectionsProps` — if its param type references `CollectionsProps`, move the `dialogHooks` part it needs as `CollectionsDialogsProps` into the new file and have `CollectionsProps` reference it; never import back from `Collections.tsx`).
  2. SUB-COMPONENT in `Collections.tsx`, above `Collections`: `ContentTypesTable({ types, rowHandles, copiedKey, copyFallback, onCopyEmbedCode, onEditFields, onRequestLifecycle, locale, t }: ContentTypesTableProps): JSX.Element` ← the `<DataTable` element; replace `copyEmbedCode`→`onCopyEmbedCode`, `setEditingFieldsFor`→`onEditFields`, `setPendingLifecycle`→`onRequestLifecycle` inside (check the element for any other outer name it reads, e.g. `runLifecycle`, and add it as a prop). Types via the existing collections controller type indexed access.
- **Importers to update:** `apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx` (`NewContentTypeDialog`), `use-edit-fields-dialog.unit.test.tsx` (`EditFieldsDialog`), `use-lifecycle-confirm-dialog.unit.test.tsx` (`LifecycleConfirmDialog`) → `../Collections-dialogs`. Comments mentioning `Collections.tsx`'s dialogs in `styles.css`/`Integrations.tsx` may stay (prose).
- **After:** `Collections.tsx` ~200 (`Collections` ~75); `Collections-dialogs.tsx` ~330; `ContentTypesTable` ~88.
- **Risks / notes:** `collections-i18n.unit.test.ts` — check whether it parses `Collections.tsx` source for `t()` keys (`rg -n "Collections.tsx" apps/admin/src/features/collections/__tests__/collections-i18n.unit.test.ts`); if it does, the moved dialog keys stop being covered — report it (test edit not allowed beyond import paths).
