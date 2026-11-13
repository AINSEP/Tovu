### jini:packages/admin/src/forms/react/pages/FormsList.tsx
- **Over:** `FormsList` 107
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/use-forms-list.unit.test.tsx`, `.../FormsModule.unit.test.tsx`, `.../copy-polish.unit.test.tsx`, `.../forms-agent-drive.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<DataTable<(typeof rows)[number]>` (~L85-143) — forms table; B = header `<div`, `<ConfirmDialog` and guards — screen shell.
- **Splits:**
  1. SUB-COMPONENT `FormsTable({ rows, rowSavingId, t }: FormsTableProps): JSX.Element` ← unit A verbatim, plus the "Form ids are stable and unique…" comment that sits above the return (it explains the table's row keys). `rows` type = `ReturnType<typeof useFormsListView>["rows"]` (export a named `FormsListRow` type from `forms-view.hooks.ts` if the hook already exports one; else use that ReturnType). Add any other names the block reads.
  2. `FormsList` renders `<FormsTable … />` in place.
- **Importers to update:** none.
- **After:** `FormsList` ~52; `FormsTable` ~60.
- **Risks / notes:** none beyond verbatim JSX.
