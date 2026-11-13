### tovu:apps/website/src/features/trash/table-adapter.ts
- **Over:** `createTableTrashAdapter` 191 (file 211, under)
- **Phase:** after-move (MOVE-AFTER registry.ts / entry types) · **Batch:** size-55
- **Tests:** `apps/website/src/features/trash/__tests__/table-adapter.test.ts`, `.../trash/__tests__/table-adapter.dialects.test.ts`, `.../trash/__tests__/move-to-trash.test.ts`, `.../trash/__tests__/sweeper.test.ts`, `.../trash/__tests__/menu-trash-flow.test.ts`, `.../trash/__tests__/term-trash-flow.test.ts`, `apps/website/src/server/__tests__/admin-trash-routes.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `VERSION_CHANGED`, `MarkerRow`, `isMarkerValueLive`, `affected`, `hasVersionChanged` | marker/version predicates (stay) |
| B | inner `cleanUpTrashedItemsRows`, `selectIds`, `runCascade`, `readMarkerRow`, `readVersion`, `writeMarker`, `checkBlocker` | one entry's row reads/writes + purge cascades |
| C | returned `purge` method | physically remove a trashed row and its cascades |
| D | `const { entry } = required;`, `let resolved`, `kernel`, `run`, `lockRow`, returned `entityType`/`hide`/`unhide` | the adapter (stays) |

- **Splits:**
  1. TYPE (module level, above the helpers): `type TableTrashRun = <T>({ fn }: { fn: (db: Kysely<ContentDatabase>) => Promise<T> }, _optional?: object) => Promise<T>;` — the existing `run` arrow's type, named so it can cross the boundary.
  2. HELPER `createTableTrashRowAccess({ entry, run }: CreateTableTrashRowAccessInput)` (return type inferred; `type TableTrashRowAccess = ReturnType<typeof createTableTrashRowAccess>` declared right after it) (module level, above `createTableTrashAdapter`) ← the seven inner functions from `async function cleanUpTrashedItemsRows(` through the end of `async function checkBlocker(` (~L87-213), moved with every doc block, unchanged; ends `return { cleanUpTrashedItemsRows, selectIds, runCascade, readMarkerRow, readVersion, writeMarker, checkBlocker };`.
  3. HELPER `createTableTrashPurge({ entry, kernel, lockRow, run, rowAccess }: CreateTableTrashPurgeInput): TrashAdapter["purge"]` (above the adapter, below step 2) ← the `async purge(purgeRequired): Promise<TrashPurgeOutcome> {` method body (~L307-360) as `return async (purgeRequired) => { … }`; its doc block moves above the helper. Body reads `rowAccess.readMarkerRow` etc. via a first-line destructure `const { readMarkerRow, runCascade } = rowAccess;` (add whichever B names the body uses) so statements stay identical.
  4. `createTableTrashAdapter` keeps unit D, adds `const rowAccess = createTableTrashRowAccess({ entry, run }); const { readMarkerRow, readVersion, writeMarker, checkBlocker } = rowAccess;` after `lockRow`, and in the returned object replaces the `purge` method with `purge: createTableTrashPurge({ entry, kernel, lockRow, run, rowAccess }),` (its doc comment stays as the property doc — copy it, the helper also keeps one).
- **Importers to update:** none (export unchanged).
- **After:** file ~222; `createTableTrashAdapter` ~65; `createTableTrashRowAccess` ~95; `createTableTrashPurge` ~48.
- **Risks / notes:** `kernel` must stay lazy (`resolved ??=` — the "Resolved on first use" comment stays with it); pass the function, never call it at helper creation. `lockRow`'s type: `(input: { workspaceId: string; entityId: string }, _optional?: object) => ReturnType<TrashDb["lockKey"]>`. `purge` is a method on `TrashAdapter`; `TrashAdapter["purge"]` gives the same contextual typing for `purgeRequired`.
