### tovu:apps/website/src/assistant/byok-tool-surface.ts
- **Over:** `createByokToolSurface` 130 (file 485 — will exceed 500 once helpers are added, so the file splits too)
- **Phase:** after-move (MIXED) · **Batch:** size-56
- **Tests:** `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts`, `byok-tool-surface.site-capabilities.test.ts`, `byok-meta-tool-result.unit.test.ts`, `byok-google-catalog.test.ts`, `byok-image-tool-results.test.ts`, `desktop-mcp-runtime.integration.test.ts`, `tool-executor-stack.failure-redaction.test.ts`, `server/__tests__/assistant-byok-routes.test.ts`, `server/runtime/composition/modules/__tests__/assistant-byok.tool-access-lowering.integration.test.ts`, `server/runtime/composition/__tests__/agent-plugin-search-discovery.integration.test.ts` (website runner; full list = `rg -l "byok-tool-surface" apps/website/src --glob '*.test.*'`, 20 files — run all). No mocks of the module.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SEARCH_LIMIT_MAX`, `SEARCH_LIMIT_DEFAULT`, `META_TOOL_DESCRIPTORS`, `META_TOOL_IDS`, `MetaToolCatalogAudit`, `searchInputError`, `runSearchTools`, `runDescribeTool`, `runExecuteDelegatedTool`, `runTypedTool` | the three BYOK meta-tools: descriptors + one runner per branch |
| B | `ByokToolRun`, `ByokToolSurface`, deps/options types, `createDiscoveryRegistry`, `createSurfaceConnectionSource`, `attachSurfaceExtensions`, `composeSurfaceExecutor`, `registerSurfaceTools`, `withDaemonLocalTools` | assemble the surface (stays) |
| C | in `createByokToolSurface`: `catalog` + `ready` + `startFederation` + `syncInstalled` + `executeMetaTool` + returned object | the live surface (stays; closes over the mutable `catalog`) |

- **Splits** (execution order):
  1. NEW `apps/website/src/assistant/byok-tool-surface-meta-tools.ts` — job: BYOK meta-tool descriptors and their per-branch runners. Moves unit A verbatim with doc comments (the `META_TOOL_DESCRIPTORS` doc block and the "split out of `executeMetaTool`" note on `runSearchTools` move word for word). Exports `META_TOOL_DESCRIPTORS`, `META_TOOL_IDS`, type `MetaToolCatalogAudit`, `runSearchTools`, `runDescribeTool`, `runExecuteDelegatedTool`, `runTypedTool`. Imports nothing from `byok-tool-surface.ts`. `byok-tool-surface.ts` imports these and keeps `metaTools: META_TOOL_DESCRIPTORS` in its return.
  2. HELPERS in `byok-tool-surface.ts` (module level, above `createByokToolSurface`, in this order):
     - `surfaceFederationConnect({ options, desktop }: SurfaceFederationConnectInput): NonNullable<ByokToolSurfaceOptions["federationConnect"]>` ← the `options.federationConnect ?? createDefaultConnect({ resolver: … }, { bearerToken: desktop.bearerToken })` expression.
     - `awaitWithin({ start, timeoutMs }: AwaitWithinInput): Promise<{ readonly settled: boolean }>` ← `awaitFederation`'s `timer`/`Promise.race`/`clearTimeout` lines; `awaitFederation` becomes `if (!federation) return { settled: true }; return awaitWithin({ start: startFederation, timeoutMs });` (its doc stays on `awaitFederation`).
     - `unknownMetaToolError({ name }: { name: string }): ByokMetaToolResult` ← the `err(…)` call with its "Reachable in practice" comment.
     - `metaToolCatalogAudit({ options, principal, run }: MetaToolCatalogAuditInput): MetaToolCatalogAudit | undefined` ← the `catalogAudit` expression (comment moves).
     - `createByokRun({ principal, run, visibleRegistry, executeMetaTool }: CreateByokRunInput, limits = {}): ByokToolRun` ← body of `createRun` (its doc moves); `createRun` becomes a one-line adapter keeping its signature.
     - `buildDaemonCalls({ executor, visibleRegistry, deleteScope, syncInstalled }: BuildDaemonCallsInput): ByokToolSurface["daemonCalls"]` ← the `daemonCalls: { … }` literal.
- **Importers to update:** `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts` (`META_TOOL_DESCRIPTORS` → `../byok-tool-surface-meta-tools.js`). Re-check with `rg -n "META_TOOL_DESCRIPTORS|META_TOOL_IDS|runSearchTools|runTypedTool" apps/website --glob '!node_modules'` (others are comments).
- **After:** `byok-tool-surface.ts` ~345; `createByokToolSurface` ~92; `byok-tool-surface-meta-tools.ts` ~175.
- **Risks / notes:** `catalog` is a reassigned `let` read by `executeMetaTool` and rebuilt by `onAdmitted`, `ready`, `startFederation`, `syncInstalled` — all of those stay inside `createByokToolSurface`; no helper may take `catalog` by value. `exposure!` in `executeMetaTool` is existing code; keep verbatim, do not add new `!`. After-move: survey MIXED — the meta-tool runners (unit A) mirror `@jini-ai/http-kit`'s tool-catalog; they are the part a Jini move would take, and step 1 isolates them.
