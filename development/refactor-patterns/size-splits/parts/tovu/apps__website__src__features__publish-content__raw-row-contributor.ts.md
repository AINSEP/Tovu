### tovu:apps/website/src/features/publish-content/raw-row-contributor.ts
- **Over:** `buildRawRowHandler` 134 (file 219, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/bundle-create.routes.pins.test.ts`, `.../__tests__/import.routes.pins.test.ts`, `.../__tests__/backstop-import-ui.routes.test.ts`, `.../__tests__/backstop-undo.routes.pins.test.ts` (it `mock.module`s THIS path spreading the real exports — no export moves, so unaffected), `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`.
- **Responsibility map** (inside `buildRawRowHandler`):

| unit | nested functions | job |
|---|---|---|
| A checks | `blockedTable`, `checkShape`, `checkPrimaryKey`, `checkLiveValues`, `precheck` | decide whether one packed row may be written |
| B pack | `packSelected` | read + precheck the selected rows into packed entities |
| C (stays) | `port`, `skipped`, `const handler: PublishContentHandler = {`, `return handler` | the raw-row handler |

- **Splits:** HELPERS at module level directly above `buildRawRowHandler`, bodies word for word (fold each nested fn's params plus the locals it reads into one object):
  `rawRowBlockedTable({ deps, table }): string | null` · `checkRawRowShape({ deps, entity }): string | null` · `checkRawRowPrimaryKey({ entity, live })` · `checkRawRowLiveValues({ deps, entity, live })` · `precheckRawRow({ deps, port, entity }): Promise<string | null>` · `packSelectedRawRows({ deps, port, selected })` — return types copied from the nested ones; `port` type = `NonNullable<PublishContentDeps["backstop"]>["rows"]` (or its existing name). Drop the nested ones' unused `_optional` params (they were empty). `handler` calls them with `deps`/`port`.
- **Importers to update:** none.
- **After:** `buildRawRowHandler` ~72; file ~230.
- **Risks / notes:** `checkShape`/`checkPrimaryKey` read the parent's `_optional` per the outline — it is the empty `Record<string, never>`; confirm in source that nothing reads a field of it before dropping.
