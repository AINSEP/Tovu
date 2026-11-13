### jini:packages/agent-plugins/src/lifecycle/uninstall.ts
- **Over:** `buildModule` 180
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/uninstall.unit.test.ts`, `.../uninstall-fault-injection.unit.test.ts`, `.../update.unit.test.ts` (uses `stageForRemoval`/`restoreStagedTrees`) (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. MODULE-LEVEL pure verbatim above `buildModule`: `UninstallTargets` interface, `STAGED_DIRNAME_PREFIX`, `assertMemoryDeletionConfirmed`, `isAncestorStillInUse`, `assertUnchangedSincePreview` (~30).
  2. SUB-FACTORY `createStagedTreeOps({ randomUUID, stat, chmod, rename, rm, readdir }: CreateStagedTreeOpsInput): { stageForRemoval; restoreStagedTrees; removeFrozenPackageTree }` ← those + `makeTreeWritable` (~55). Job: reversible staging + frozen-tree removal (shared with update.ts via the return).
  3. SUB-FACTORY `createUninstallTargets({ ports, listInstalledPlugins, isAgentPluginRecordedAsBundled, resolveAgentPluginActivation }: CreateUninstallTargetsInput): { resolveUninstallTargets }` ← `resolveUninstallTargets`, `bundledRefusalMessage`, `malformedEntryRefusalMessage` (~33). Job: target lookup + refusals.
  4. `buildModule` keeps wiring, preview/uninstall/unlocked, `stageAndDeleteActivation`, `removeEmptyPackageAncestors`, `deletePersistentMemory`, return (same five names).
- **Importers to update:** none.
- **After:** `buildModule` ~75; sub-factories ~57 / ~35.
- **Risks / notes:** comments referring to "this file's header" stay valid (same file).
