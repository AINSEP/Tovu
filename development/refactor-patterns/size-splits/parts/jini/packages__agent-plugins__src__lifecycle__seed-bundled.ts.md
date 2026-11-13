### jini:packages/agent-plugins/src/lifecycle/seed-bundled.ts
- **Over:** `buildModule` 118
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts`, `.../seed-bundled-preserve.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../lifecycle-reconciliation.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. SUB-FACTORY `createSeedBookkeeping({ ports, readdir, stat, recordBundledAgentPluginDigests, assertAgentPluginActivationsWritable }: CreateSeedBookkeepingInput): { recordSeededDigests; activationsRefusal; listBundledPluginDirs }` ← those three (~45). Job: pre-flight refusal, source dir listing, digest ledger record.
  2. `buildModule` keeps wiring, `seedBundledAgentPlugins`, `seedOne`, return.
- **Importers to update:** none.
- **After:** `buildModule` ~78; sub-factory ~47.
- **Risks / notes:** the "OWN manifest name" comment stays with `seedOne`.
