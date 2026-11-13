### jini:packages/admin/src/forms/react/pages/FormEditor.tsx
- **Over:** `FormEditor` 101
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/FormEditor.unit.test.tsx`, `.../FormEditor.field-settings.unit.test.tsx`, `.../FormEditorFieldsBody.unit.test.tsx`, `.../forms-agent-drive.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = the tab strip `<div` inside the return (~L93-123: tab buttons + panels using `showTabs, tab, activeTab, onTabChange, tabRefs, onTabsKeyDown, formId, fieldsBody, answerColumns`) — fields/submissions tabs; B = rest (hook, guards, `fieldsBody`, header, `ConfirmDialog`) — screen shell.
- **Splits:**
  1. SUB-COMPONENT `FormEditorTabs({ tab, activeTab, onTabChange, tabRefs, onTabsKeyDown, formId, fieldsBody, answerColumns, t }: FormEditorTabsProps): JSX.Element` (same file, above `FormEditor`) ← unit A verbatim. Types from `FormEditorController` (`FormEditorController["tabRefs"]` etc.); `fieldsBody: ReactNode`.
  2. `FormEditor` renders `<FormEditorTabs … />` where the block was (keep the surrounding `showTabs`/`isNew` conditional in `FormEditor` if it wraps the div).
- **Importers to update:** none.
- **After:** `FormEditor` ~75; `FormEditorTabs` ~33.
- **Risks / notes:** `tabRefs` is a ref array mutated by callback refs — pass the same ref object.
