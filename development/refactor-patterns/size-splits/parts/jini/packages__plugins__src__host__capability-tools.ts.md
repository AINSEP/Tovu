### jini:packages/plugins/src/host/capability-tools.ts
- **Over:** `createPluginCapabilityTools` 186
- **Phase:** now · **Batch:** size-34
- **Tests:** `src/host/__tests__/unit/capability-tools.extract-s6.unit.test.ts`, `src/host/__tests__/unit/capability-tools.before-save-hook.extract-s6-fix.unit.test.ts` (`pnpm --filter @jini-ai/plugins exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | exported interfaces/types, `isPluginEnabledInWorkspace`, `runsFreshFor`, `pluginCapabilityToolDerivedRisk`, `readStoredFieldBag`, `decodeFieldValue` | contracts + pure helpers (unchanged) |
| B | `genericFieldDescription`, `buildFieldSources`, `buildCapabilityToolDescription`, `loadEnabledPluginCapabilityToolSources` | discover enabled plugins → tool sources |
| C | `buildCapabilityInputSchema`, `buildCapabilityToolResult`, `resolveFieldBag`, `capabilityCatalogEntry`, `capabilityToolHandler` | one capability tool's schema + call handler |
| D | `isCapabilityCallableNow`, `withActivationGate`, `buildPluginCapabilityToolRegistrations`, `executablePluginToolPorts`, `registerEnabledPluginCapabilityTools`, `return {` | registration (stays) |

- **Splits** (module level above `createPluginCapabilityTools`, B then C; both generic over the same `<TPost, TDraft, TFamily>` constraints copied from `createPluginCapabilityTools`):
  1. HELPER `createCapabilitySourceLoader({ text, identityNamespace, beforeSaveHook }: CreateCapabilitySourceLoaderInput): { loadEnabledPluginCapabilityToolSources }` ← unit B verbatim (keep each "why" comment). Input field types: the matching property types of `PluginCapabilityToolsRequired<TPost, TDraft, TFamily>` (use indexed access, e.g. `PluginCapabilityToolsRequired<TPost, TDraft, TFamily>['text']`).
  2. HELPER `createCapabilityCallHandlers({ required, text, access, toPreviewDraft }: CreateCapabilityCallHandlersInput): { capabilityCatalogEntry; capabilityToolHandler }` ← unit C verbatim; inside, `type Deps = PluginCapabilityToolDeps<TPost, TDraft>;` re-declared (same as main's).
  3. Main keeps the destructure, `type Deps`, calls both helpers, and unit D.
- **Importers to update:** none (helpers are not exported; `host/index.ts` does `export * from './capability-tools.js'`, so do NOT export the new helpers).
- **After:** file ~305; `createPluginCapabilityTools` ~75; `createCapabilitySourceLoader` ~45; `createCapabilityCallHandlers` ~80.
- **Risks / notes:** confirm which destructured names each moved function reads (outline: `text`, `access`, `identityNamespace`, `beforeSaveHook`, `toPreviewDraft`, `required`) and pass exactly those. The `@file` header (on `PluginCapabilityToolText`) is untouched.
