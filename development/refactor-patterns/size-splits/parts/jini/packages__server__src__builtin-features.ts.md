### jini:packages/server/src/builtin-features.ts
- **Over:** file 566 lines · `createBuiltInFeatures` 426
- **Phase:** now · **Batch:** size-23
- **Tests:** `src/__tests__/builtin-features.test.ts`, `src/__tests__/builtin-features.mounts.test.ts`, `src/__tests__/delegated-principal.security.test.ts`, `src/__tests__/compose-jini-kernel.test.ts` (`pnpm --filter @jini-ai/server exec vitest run <path> --maxWorkers=2`), then `pnpm --filter @jini-ai/server run typecheck`.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| S | `LOCAL_DAEMON_PRINCIPAL`, `require`, `packageVersion`, `ANONYMOUS_DELEGATED_PRINCIPAL`, `resolveDelegatedToolPrincipal`, `BuiltInFeatureOptions`, `requireOptions`, `requireSqlite`, `buildDaemonDbOperations`, `isExecutableDetectedAgent`, `projectAgentDiagnostic`, `projectDetectedAgent` | shared feature support: identities, options type, guards, projections |
| D | `healthFeature`, `runsFeature`, `agentsFeature`, `daemonDbFeature`, `remoteRunEventsFeature`, `daemonStatusFeature` | daemon/process features |
| T | `hostToolsFeature`, `modelProxyFeature`, `activeContextFeature`, `terminalFeature`, `toolCatalogFeature`, `resolveDelegatedPrincipal` + `delegatedToolCallsFeature`, `connectorsFeature`, `researchFeature` | tool-surface features |
| V | `xaiFeature`, `memoryFeature`, `routinesFeature`, `mediaFeature`, `frontendSessionsFeature` | service features |
| M | `createBuiltInFeatures` + its `return [` list | the catalog (stays) |

- **Splits:**
  1. NEW `builtin-features-support.ts` — job: shared feature support. Moves unit S verbatim (all exports kept; `requireOptions`, `requireSqlite`, `packageVersion` now exported for the siblings). Header "why" comments on each move with it.
  2. NEW `builtin-features-daemon.ts`, `builtin-features-tools.ts`, `builtin-features-services.ts` — job: daemon / tool-surface / service features. Each feature becomes an exported factory in its module: `createHealthFeature({ options }: BuiltInFeatureFactoryInput): JiniFeature` whose body is `return defineJiniFeature({ … })` with the original object verbatim (features that do not read `options` — `modelProxy`, `activeContext`, `toolCatalog`, `connectors`, `research` — take no parameter). `createDelegatedToolCallsFeature({ options })` starts with the moved `const resolveDelegatedPrincipal = options.delegatedToolCalls?.resolvePrincipal;`. `BuiltInFeatureFactoryInput = { options: BuiltInFeatureOptions }` declared in the support module. Return type = whatever `defineJiniFeature` returns (use `ReturnType<typeof defineJiniFeature>` if no named type exists). Siblings import from `./builtin-features-support.js` only.
  3. `builtin-features.ts` keeps `createBuiltInFeatures(options: BuiltInFeatureOptions = {})` (+ its doc comment): one `const xFeature = createXFeature(…)` per feature in the ORIGINAL order, then the `return [` list unchanged.
- **Importers to update:** `src/index.ts` (`BuiltInFeatureOptions` type, `ANONYMOUS_DELEGATED_PRINCIPAL`, `LOCAL_DAEMON_PRINCIPAL` → `./builtin-features-support.js`; `createBuiltInFeatures` stays); `src/create-local-node-daemon.ts` (L49 `type BuiltInFeatureOptions` and L63 re-export `buildDaemonDbOperations, projectDetectedAgent` → `./builtin-features-support.js`); `src/compose-jini-kernel.ts` (`type BuiltInFeatureOptions` → support; `createBuiltInFeatures` stays); tests: `builtin-features.test.ts` (`projectDetectedAgent` → `../builtin-features-support.js`), `builtin-features.mounts.test.ts` (all three names → support), `delegated-principal.security.test.ts` (`resolveDelegatedToolPrincipal` → support).
- **After:** `builtin-features.ts` ~50; `createBuiltInFeatures` ~45; `builtin-features-support.ts` ~145; `-daemon.ts` ~175; `-tools.ts` ~165; `-services.ts` ~95; each factory ≤ 36.
- **Risks / notes:** features are built eagerly today in order; keep the call order identical (some `defineJiniFeature` calls may validate at construction). `require`/`packageVersion` use `createRequire(import.meta.url)` — the relative `package.json` path must still resolve from the new file's folder (same folder, so unchanged).
