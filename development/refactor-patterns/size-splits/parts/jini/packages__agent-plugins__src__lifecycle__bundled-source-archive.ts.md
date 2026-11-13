### jini:packages/agent-plugins/src/lifecycle/bundled-source-archive.ts
- **Over:** `buildModule` 224
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-source-archive.edges.unit.test.ts`, `.../bundled-source-options.unit.test.ts`, `.../lifecycle-edge-paths.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../seed-bundled-edges.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map / splits** (same per-instance pattern as activation.ts: module-level pure helpers + ports-scoped sub-factories called once inside `buildModule`; grep moved bodies for hoisted callees):
  1. MODULE-LEVEL pure helpers verbatim above `buildModule`: `MAX_SOURCE_FILES`, `assertSourceFileCount`, `assertPackingLimit`, `encodedFileBytes`, `checkFileBudget`, `createSnapshotReader`, `onceAsyncIterable`, `regularEntryFiles`, `recordFile`, `isNameExcluded`, `selectPath`, `refuseEntry` (~75). Job: packing budgets + path selection. Keep `MAX_SOURCE_FILES` exactly `2048`.
  2. SUB-FACTORY `createArchiveEntryReader({ magic }: CreateArchiveEntryReaderInput): { createBundledSourceArchiveReader(): AgentPluginArchiveReaderPort }` ← `createBundledSourceArchiveReader`, `readEntries` (`MAGIC` → `magic`, or keep the local name `const MAGIC = magic;` at the top to keep bodies verbatim) (~40). Job: read the packed format.
  3. SUB-FACTORY `createSourceDirectoryWalker({ readdir }: CreateSourceDirectoryWalkerInput): { listRegularFiles }` ← `listRegularFiles`, `directoryEntryFiles` (~26). Job: walk runtime files.
  4. `buildModule` keeps binds, `normalizePackageEntryPath`, `packAgentPluginDirectory`, `createPackingState`, `refuseRoot`, `readBoundedFile`, `openWalkedFile` and returns the same two names (~95).
- **Importers to update:** none.
- **After:** `buildModule` ~95; sub-factories ~40 / ~26; file ~280.
- **Risks / notes:** `PackingState` type stays at module level (already is). The Windows O_NOFOLLOW comment stays with `openWalkedFile`. If `--check` shows `buildModule` >100, also move `readBoundedFile` into a `createBoundedFileReader({ ports })` — not before.
