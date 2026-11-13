### tovu:apps/website/src/features/publish-content/tool-registrations.ts
- **Over:** `buildPublishContentRegistrations` 166 (file 357, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-57
- **Tests:** `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`, `.../__tests__/backstop-gaps-tool.test.ts`, `.../__tests__/publish-tool.test.ts`, `.../__tests__/plan-pull-tool.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `publishContentDerivedRisk`, `CATALOG_BY_ID`, `defaultProvisioning`, `MACHINE_TOKEN`, `plainSentence`, `chooseDestination`, `readReadiness` | readiness + wording helpers (stay) |
| B | `connectSiteUrl`, `suppliedPullPeer`, `selectPullPeer`, `pullHooks`, `acceptedPullReport`, `pullCounts`, `pullTitle`, `requiredPullBundleId`, `pullOverwriteKeys`, `pullToolBoundary`, `modelFacingPullError` | pull/connect helpers (stay) |
| C | handler entries `[PUBLISH_CONTENT_PUBLISH_TOOL_ID]`, `[PUBLISH_BACKSTOP_GAPS_TOOL_ID]` | publish + backstop-gap handlers |
| D | entries `[PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]`, `[PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]` | pull (plan + confirmed execute) handlers |
| E | entries `[PUBLISH_CONTENT_STATUS_TOOL_ID]`, `[PUBLISH_CONTENT_CONNECT_TOOL_ID]` | readiness status + connect handlers |

- **Splits:**
  1. HELPERS in `buildPublishContentRegistrations` (same file, directly above it, in this order):
     - `buildPublishHandlers({ routeDeps }: BuildPublishHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_PUBLISH_TOOL_ID]: ctx => pullToolBoundary(` and `[PUBLISH_BACKSTOP_GAPS_TOOL_ID]: async (ctx) => {` (~L189-203).
     - `buildPullHandlers({ routeDeps, surfaces }: BuildPullHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]` and `[PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` (~L204-271).
     - `buildConnectionHandlers({ routeDeps, findCandidate, provisioning }: BuildConnectionHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_STATUS_TOOL_ID]` and `[PUBLISH_CONTENT_CONNECT_TOOL_ID]` (~L272-354). Type `findCandidate`/`provisioning` with the types of `routeDeps.findPublishCandidate` (non-optional) and `ReturnType<typeof defaultProvisioning>` (or the existing port type it returns).
     - `buildPublishContentRegistrations` keeps `const findCandidate = …`, `const provisioning = …`, `const handlers: Record<string, ToolHandler> = { ...buildPublishHandlers({ routeDeps }), ...buildPullHandlers({ routeDeps, surfaces }), ...buildConnectionHandlers({ routeDeps, findCandidate, provisioning }) };` and its `return buildDomainRegistrations({` statement.
- **Importers to update:** none.
- **After:** file ~370; `buildPublishContentRegistrations` ~16; helpers ~16 / ~66 / ~78.
- **Risks / notes:** Computed keys (`[X_TOOL_ID]`) stay computed. If a handler in C reads `surfaces`/`findCandidate`, add it to that helper's input (outline only shows `surfaces` at the execute-pull entry and `findCandidate`/`provisioning` in E). Write-service move later leaves these handlers in place.
