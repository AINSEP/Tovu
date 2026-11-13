### tovu:apps/website/src/features/publish-content/raw-file-contributor.ts
- **Over:** `contributeRawFilePublish` 152 · its `build` 150 (file 199, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-08
- **Tests:** `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-undo.routes.pins.test.ts` (it `mock.module`s THIS path spreading the real exports + `undoRawFile` — no export moves, so the mock still covers everything), `.../publish-content/__tests__/backstop-import-ui.routes.test.ts`.
- **Responsibility map** (inside `build(deps)`):

| unit | nested functions | job |
|---|---|---|
| A path/blob | `pathReason`, `blob` | policy reason for a path; read a packed blob |
| B check | `check`, `checkedBytesReason` | scan verified bytes + compare state hash |
| C pack | `selectedPaths`, `selectedFile`, `packFile`, `recordInverse` | read selected files, index snapshots, record undo inverses |
| D (stays) | `files`, `skipped`, `const handler: PublishContentHandler = {`, `return handler` | the raw-file handler |

- **Splits:**
  1. HELPER `buildRawFileHandler({ deps }: { deps: PublishContentDeps }): PublishContentHandler` at module level directly above `contributeRawFilePublish` ← the whole `build` arrow body. `contributeRawFilePublish` returns `{ entityType: "raw-file", dependsOn: [], build: (deps) => buildRawFileHandler({ deps }) }` (mirrors `raw-row-contributor.ts`'s `buildRawRowHandler`). Use the `deps` type the contributor interface gives `build` (copy it; `PublishContentDeps` in raw-row).
  2. HELPERS at module level above `buildRawFileHandler`, bodies word for word with their `@complexity` comments: `rawFilePathReason({ deps, relPath })`, `readRawFileBlob({ deps, entity })`, `checkRawFile({ deps, files, entity }, { sourceBytes } = {})` (calls the two above), `checkedBytesReason({ entity, bytes, relPath, size })` (already one-object; just move), `readSelectedRawFile({ deps, files, relPath })`, `packRawFile({ deps, files, skipped, relPath, file })`, `recordRawFileInverse({ deps, entity, inverse })`, `selectedRawFilePaths({ deps, files })`. Return types = the nested ones' (copy). `files` type = `NonNullable<PublishContentDeps["backstop"]>["files"]` (or the existing name). Inside `buildRawFileHandler` the `handler` object calls them with `deps`/`files`/`skipped`.
- **Importers to update:** none (exports unchanged).
- **After:** `contributeRawFilePublish` ~3; `buildRawFileHandler` ~78; file ~215.
- **Risks / notes:** `skipped` must stay ONE array per `build` call (created in `buildRawFileHandler`, passed by reference).
