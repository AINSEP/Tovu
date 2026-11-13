### tovu:apps/website/src/platform/db/sqlite/fresh-content-db.ts
- **Over:** `bootstrapFreshContentDb` 187 (file 218, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/platform/db/sqlite/__tests__/fresh-content-db.unit.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A table | `const operations: Readonly<Record<string, () => void>> = {` (43 entries, one per `CONTENT_MIGRATIONS` id) | the fresh-schema operation for each migration id |
| B (stays) | `const client = sqliteClientOf(db);`, `hasTables`, the drift guard `if (migrations.length !== …`, `return client.transaction(…)` | build a brand-new content DB at head, atomically |

- **Splits:**
  1. HELPER in the same file, module level directly above `bootstrapFreshContentDb`: `freshContentOperations({ client }: FreshContentOperationsInput): Readonly<Record<string, () => void>>` ← the whole `operations` object literal, returned as is. `client`'s type = `ReturnType<typeof sqliteClientOf>`. The two-line comment "These are Tovu's fresh-schema operations…" moves onto the helper; every per-entry comment stays inside. Call site: `const operations = freshContentOperations({ client });` at the same position (after the `hasTables()` early return — keep that order so nothing is built for an existing DB).
- **Importers to update:** none (no export moves).
- **After:** `bootstrapFreshContentDb` ~25; `freshContentOperations` ~165 (stays over); file ~222.
- **Risks / notes:** the table is built lazily per call exactly as today (closures over `client`), so behavior is identical.
- **Owner exception candidate:** `freshContentOperations` — one flat table keyed by migration id that mirrors `CONTENT_MIGRATIONS` (43 entries, each a tiny independent op); splitting it by era would be a line-count cut. It is the fresh-DB twin of `migrations/` (already exempt).
