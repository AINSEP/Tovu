### jini:packages/admin/src/media/controllers/library.controller.ts
- **Over:** `createLibraryController` 169
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/media/__tests__/library-controller.test.ts`, `.../controllers.test.ts`, `.../parity-controllers.test.ts`, `.../qa-recovery.test.ts`, `packages/admin/src/media/react/__tests__/library-tab-hooks.test.tsx`, `.../qa-round2.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `let writes`, `let exclusiveWrite`, `function write(run, id?)` | serialized write queue with per-id reservation |
| B | returned `upload`, `trash`, `restore`, `requestPurge`, `cancelPurge`, `confirmPurge` | library mutations |
| C | store, read state, `cancelRetry`, `libraryView`, `acceptRead`, `failRead`, `load`, `settleLibrary`, `getSnapshot/subscribe/load/settleLibrary/setQuery/dispose` | reads + controller shell |

- **Splits:**
  1. HELPER `createSerialWriter({ store, beforeWrite, load }: CreateSerialWriterInput): (run: () => Promise<unknown>, id?: string) => Promise<boolean> | undefined` (module level above the controller; keep `write`'s exact return type) ← unit A verbatim. The line `generation++; readAbort?.abort(); cancelRetry();` becomes `beforeWrite();` (its "Starting a write clears other writes' failures" comment stays above it); the controller passes `beforeWrite: () => { generation++; readAbort?.abort(); cancelRetry(); }`. The existing `write(run, id)` positional signature is kept (it is existing code, not a new helper API).
  2. HELPER `createLibraryMutations({ store, api, write, dropPurged }: CreateLibraryMutationsInput): { upload; trash; restore; requestPurge; cancelPurge; confirmPurge }` ← the six methods verbatim (trash-asymmetry comment moves). In `confirmPurge`, the `if (library) { library = …; store.set(…libraryView…) }` block becomes `dropPurged({ id: item.id });` and the controller defines `dropPurged` (the block + its "A failed follow-up read must not leave…" comment) since it reassigns `library`.
  3. Return becomes `{ getSnapshot, subscribe, load, settleLibrary, setQuery, ...mutations, dispose }`.
- **Importers to update:** none.
- **After:** controller ~95; `createSerialWriter` ~35; `createLibraryMutations` ~45; file ~210.
- **Risks / notes:** `write` must stay ONE instance shared by all mutations (the `writes` chain serializes). `api.restore!` non-null is existing code — leave as is (moving it is allowed; do not add new ones). Controller lands near 100 — if `--check` still shows it over, STOP and report (do not improvise).
