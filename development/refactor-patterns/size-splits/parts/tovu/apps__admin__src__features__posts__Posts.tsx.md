### tovu:apps/admin/src/features/posts/Posts.tsx
- **Over:** `Posts` 132 (file 163, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-05
- **Tests:** `apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx`, `posts-i18n.unit.test.ts`, `posts-agent-drive.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | the `columns={[ … ]}` array inside `<DataTable` (~L131-197, 5 column descriptors) | posts table columns (title/slug/status/updated/actions) |
| B | rest of `Posts` (hook call, locale, `t`, `sort` state, notice guard, header, `<DataTable` shell, `<ConfirmDialog`) | the screen (stays) |

- **Splits:**
  1. HELPER in `Posts.tsx` (module level, above `Posts`): `postsTableColumns({ t, locale, rowMenuHandleById, togglePostPublish, setPendingDelete }: PostsTableColumnsInput): DataTableColumn<AdminPost>[]` ← the array literal passed to `columns=` (all five descriptors, both "Sortable headers"/"desc" comments word for word). Import `type DataTableColumn` from `@jini-ai/admin/react` (same as `features/trash/Trash.tsx`). Type the inputs from the existing hook result: `t: ReturnType<typeof createPostsTranslator>`, `locale: string`, the other three as `ReturnType<typeof useWiredPosts>["rowMenuHandleById" | "togglePostPublish" | "setPendingDelete"]` (indexed one by one). In JSX: `columns={postsTableColumns({ t, locale, rowMenuHandleById, togglePostPublish, setPendingDelete })}`.
- **Importers to update:** none (no export moves).
- **After:** file ~170; `Posts` ~65; `postsTableColumns` ~72.
- **Risks / notes:** Pure move of a value expression; columns are rebuilt each render exactly as before. `sort` useState stays in the component (owner ruling 2026-08-14 comment explains it) — not touched by this split.
