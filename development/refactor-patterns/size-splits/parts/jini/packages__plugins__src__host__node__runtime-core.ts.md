### jini:packages/plugins/src/host/node/runtime-core.ts
- **Over:** file 564 lines · `createPluginRuntimeCore` 397
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/runtime-core.extract-s6.unit.test.ts` plus every `src/host/__tests__/**` test that imports `../node/index.js` or `createPluginRuntimeCore` (find: `rg -l "createPluginRuntimeCore|host/node" packages/plugins/src --glob '*.test.*'`) (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/plugins run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| T | `PluginRuntimeSource`, `PluginRuntimeCoreBindings`, `PluginRuntimeHostBinding`, `PluginRuntimeTracker`, `PluginRuntimeLookup`, `PluginRuntimeText`, `PluginRuntimeCoreRequired`, `PluginRuntimeCoreOptional` | public runtime-core contract types |
| L | `PluginLoadTarget`, `resolveLoadTarget`, `SAFE_PLUGIN_ID_SEGMENT`, `PluginUninstallPathError`, `SAFE_VERSION_SEGMENT`, `resolvePackageLocation` | where a plugin's code/package lives on disk |
| A | `discoverPlugins`, `discoverActivePlugins`, `coreClaims`, `listPluginConflicts`, `installPreviewConflicts`, `assertNoConflicts`, `onPluginEnabled` | discovery, conflicts, enable |
| B | `attachPlugin`, `performPluginAttachment`, `resolveRuntimeImporter`, `publishPluginAttachment` | load + attach one plugin |
| D | `quarantineConflictingAtBoot`, `initializeBootDefaults`, `attachEnabledPluginsAtBoot`, `reattachBootPlugin` | boot pass |
| E | `attachProviderWithin`, `listProviderPlugins`, `loadProviderPlugins` | provider-plugin loading |
| F | `locatePluginPackageDirs`, `readPluginPackageFiles` | package file access |
| G | `pluginInstaller`, `reloadActivation`, `assertReloadApproved`, `restoreReloadedPlugin`, `pluginSource`, `composeSourceService` | install/reload + source service composition |
| M | setup locals (L391-L420 incl. `closing`, `browserGeneration`), `retainBrowserProviders`, `onPluginDisabled`, `return {` | runtime state + surface (stays) |

- **Splits:**
  1. NEW `runtime-core-types.ts` — job: public contract types. Moves unit T verbatim (all exported, with their `@agent-note` comments). Imports only external types.
  2. NEW `runtime-core-load-target.ts` — job: plugin load target + package location. Moves unit L; exports `PluginLoadTarget`, `resolveLoadTarget`, `PluginUninstallPathError`, `resolvePackageLocation`. Imports `PluginRuntimeSource` from `./runtime-core-types.js`.
  3. HELPERS in `runtime-core.ts`, module level above `createPluginRuntimeCore`, each `<TEvent, TOptions>`-generic like the main function where its input types need it, each returning the functions listed (input = exactly the closure names the bodies read; check with the outline `uses:` and tsc):
     - `createPluginAttacher({ isClosing, pendingAttachments, loadEpochs, sources, installDir, runtimeBinding, tier2CallRunner, required, pluginContributions, providerContributions, hookRegistry, loadedVersions, selectedProviders, snapshots, retainBrowserProviders }): { attachPlugin; publishPluginAttachment }` ← unit B. `attachPlugin`'s `if (closing)` becomes `if (isClosing())`; main passes `isClosing: () => closing`.
     - `createPluginEnablement({ required, optional, runtimeBinding, sources, installDir, activationRepo, attachPlugin }): { discoverPlugins; discoverActivePlugins; listPluginConflicts; installPreviewConflicts; onPluginEnabled }` ← unit A (with the "Reachability fix" and "Enable-time c…" comments).
     - `createBootAttachment({ quarantineDeps, required, optional, clock, activationRepo, snapshots, installDir, discoverActivePlugins, onPluginDisabled, attachPlugin }): { attachEnabledPluginsAtBoot }` ← unit D.
     - `createProviderPluginLoading({ activationRepo, required, discoverActivePlugins, attachPlugin, selectedProviders }): { listProviderPlugins; loadProviderPlugins }` ← unit E.
     - `createPluginPackageFiles({ installDir, sources }): { locatePluginPackageDirs; readPluginPackageFiles }` ← unit F.
     - `createPluginSourceComposition({ installDir, runtimeBinding, sources, activationRepo, required, clock, onPluginEnabled, onPluginDisabled, readPluginPackageFiles, pluginSourcePolicy, optional }): { pluginInstaller; pluginSource }` ← unit G in its current order (`pluginInstaller` const, reload helpers, `const pluginSource = composeSourceService({}, {});`, `composeSourceService`).
  4. Main keeps unit M and calls the factories in this order: attacher (needs `retainBrowserProviders`, a hoisted declaration in main), enablement, boot, providers, package files, source composition — then destructures and `return {` unchanged.
- **Importers to update:** `src/host/node/index.ts` (`export * from './runtime-core.js'`): add `export * from './runtime-core-types.js'` (types-only, all were public) and `export { PluginUninstallPathError } from './runtime-core-load-target.js'` (NOT `export *` — it would publish `resolveLoadTarget`). Check `rg -n "PluginRuntimeSource|PluginUninstallPathError|PluginRuntimeCore" packages --glob '!node_modules'` for direct `runtime-core.js` imports and repoint them (none found outside `node/index.ts` at design time).
- **After:** `runtime-core.ts` ~445; `createPluginRuntimeCore` ~90; `createPluginAttacher` ~85; `createPluginSourceComposition` ~65; others ≤ 75; `runtime-core-types.ts` ~105; `runtime-core-load-target.ts` ~60.
- **Risks / notes:** inner functions today are hoisted and reference each other freely; after the split each factory gets the others' functions as inputs, so a factory must not be called before the factories it needs. If two groups call each other (cycle) — STOP and report. `browserGeneration`/`closing` stay `let`s in main; only `attachPlugin` reads `closing` through `isClosing`. `pluginSource` is built at construction exactly as today (inside the composition factory). The long `@agent-note` lifecycle comment on `createPluginRuntimeCore` stays. Recommend Opus/Fable execution.
