### jini:packages/agent-plugins/src/lifecycle/resolve-agent-plugin-refs.ts
- **Over:** `buildModule` 154
- **Phase:** now · **Batch:** size-31
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/resolve-agent-plugin-refs.unit.test.ts`, `.../ref-read-failure-m1.unit.test.ts`, `.../bundled-digests.unit.test.ts`, `.../layout-b-persistent-state.unit.test.ts`, `packages/agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. SUB-FACTORY `createInstalledRefLookup({ ports, stat, indexInstalledRoot, preferBundledAgentPluginDigests }: CreateInstalledRefLookupInput): { listInstalledPlugins; isInstalledDigestPresent; resolveOnePluginRef }` ← those three (~50). Job: find installed revisions for a ref (zero/one/many rules).
  2. SUB-FACTORY `createInjectedSections({ ports, persistentState, readInstalledSkillFile }: CreateInjectedSectionsInput): { buildInjectedSection; buildPointerSection; renderSkillInventory }` ← `instructionNotes`, `buildInjectedSection`, `renderSkillInventory`, `buildPointerSection` (~57). Job: render inject/pointer text.
  3. `buildModule` keeps the module wiring, `resolveAgentPluginDeliveryMode`, `resolveAgentPluginRefs`, `resolveAgentPluginSelection`, `activationRefusal`, return (same four names).
- **Importers to update:** none.
- **After:** `buildModule` ~60; sub-factories ~50 / ~57.
- **Risks / notes:** `resolveAgentPluginSelection` probably calls `resolveOnePluginRef`/`buildInjectedSection` (hoisted) — destructure them from the sub-factories at the top of `buildModule`.
