### jini:packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx
- **Over:** `WidgetsLibrary` 130
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetsLibrary.unit.test.tsx`, `.../use-widgets-library.hooks.unit.test.tsx`, `.../use-widgets-library.wiring.unit.test.tsx`, `.../fetch-query-migration.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<div className="page-header">` (~37: kicker/title/description + create-type picker) — header + create control; B = `<DataTable` (~56) — widgets table; C = guards, notices, `ConfirmDialog` — shell.
- **Splits:**
  1. SUB-COMPONENT `WidgetsLibraryHeader({ headerActions, createType, setCreateType, widgetTypes, t }: WidgetsLibraryHeaderProps): JSX.Element` ← unit A verbatim.
  2. SUB-COMPONENT `WidgetsTable({ widgets, rowHandleById, statusLabel, requestTrash, t }: WidgetsTableProps): JSX.Element` ← unit B verbatim; props = names the JSX reads (check `trashing`).
- **Importers to update:** none.
- **After:** `WidgetsLibrary` ~45; header ~40; table ~60.
- **Risks / notes:** `export { WidgetsLibraryNotices }` re-export stays.
