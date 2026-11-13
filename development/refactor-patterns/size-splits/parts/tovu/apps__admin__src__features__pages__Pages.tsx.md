### tovu:apps/admin/src/features/pages/Pages.tsx
- **Over:** `Pages` 169 (file 213, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/ThemePagesTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | the `<DataTable rows={pages}` element inside `{activeTab === "mine" ? (` | "My Pages" table: columns, empty card, row menu |
| B | `Pages` | hooks, local tab/sort chrome state, header, TabBar, theme tab, delete confirm |

- **Splits** (same file, module level, directly above `Pages`):
  1. SUB-COMPONENT `MyPagesTable({ pages, sort, onSortChange, rowMenuHandleById, onTogglePublish, onRequestDelete, locale, t }: MyPagesTableProps): JSX.Element` ← the whole `<DataTable rows={pages}` … `/>` element. Inside, `onSortChange={setSort}` → `onSortChange={onSortChange}`, the row-menu `togglePagePublish` → `onTogglePublish`, `onDelete: setPendingDelete` → `onDelete: onRequestDelete`. Types: `pages: AdminPost[]` (the narrowed type the existing comment names), `sort: DataTableSortState`, `onSortChange: (next: DataTableSortState) => void` (match `DataTable`'s prop type), `rowMenuHandleById` / `onTogglePublish` / `locale` / `t` = the types of the existing values (take them from the `use-pages` controller type via indexed access, e.g. `PagesController["togglePagePublish"]` — use the exported controller type name in `./hooks/use-pages.hooks`).
  2. `Pages` keeps everything else; the `"mine"` branch becomes `<>{error ? <div className="notice error">{error}</div> : null}<MyPagesTable … /></>`. The 2026-08-14 owner-ruling comment and the `sort` comment stay on the `useState` lines in `Pages` (that state is intentionally local chrome — do not move it to the hook).
- **Importers to update:** none (no export moves).
- **After:** file ~225; `Pages` ~85; `MyPagesTable` ~95.
- **Risks / notes:** `navigate` used inside the table cells is the module import — keep using it in `MyPagesTable`. Props only.
