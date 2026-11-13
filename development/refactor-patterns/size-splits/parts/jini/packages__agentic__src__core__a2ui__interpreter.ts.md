### jini:packages/agentic/src/core/a2ui/interpreter.ts
- **Over:** `createA2uiInterpreter` 192
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/a2ui/__tests__/interpreter.test.ts`, `src/core/a2ui/__tests__/spec-fixtures.test.ts`, `src/core/a2ui/__tests__/index.test.ts`, `src/core/__tests__/args-convention.contract.test.ts` (uses `createA2uiInterpreter`). No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | interfaces, `bestEffortSurfaceId`, `buildParseFailureResult`, `runLocalFunctionAction`, `A2uiInterpreter` | types + parse-failure/local-fn helpers |
| B message handlers | closures `applyComponentsList`, `handleCreateSurface`, `handleUpdateComponents`, `handleUpdateDataModel`, `handleDeleteSurface`, `handleCallFunction`, `handleActionResponse`, `dispatchAgentMessage` | apply one agent→renderer message to surface state |
| C action building | closures `resolveActionContext`, `resolveActionTarget`, `buildAgentEventAction` | build a renderer→agent `action` envelope |
| D (stays) | `surfaces`, `listeners`, `notify`, `applyAgentMessage`, `getSurface`, `getRoot`, `resolve`, `buildAction`, return | the interpreter API |

- **Splits** (module level, above `createA2uiInterpreter`, in this order; bodies verbatim, comments move):
  1. `applyComponentsList({ catalog, surface, wireComponents }: ApplyComponentsListInput): RendererToAgentMessage[]`
  2. `handleCreateSurface({ catalog, surfaces, message }: HandleCreateSurfaceInput): RendererToAgentMessage[]`; `handleUpdateComponents({ catalog, surfaces, message })`; `handleUpdateDataModel({ surfaces, message })`; `handleDeleteSurface({ surfaces, message })`; `handleCallFunction({ catalog, message })`; `handleActionResponse({ surfaces, message })` — each keeps its `Extract<AgentToRendererMessage, {…}>` message type and `RendererToAgentMessage[]` return.
  3. `dispatchAgentMessage({ catalog, surfaces, message }: DispatchAgentMessageInput): RendererToAgentMessage[]` (its "Routes one…" comment moves).
  4. `resolveActionContext({ surfaces, catalog, context, surfaceId }: ResolveActionContextInput): Record<string, unknown>` — the inner `resolve(...)` call becomes a call to a new module-level `resolveSurfaceValue({ surfaces, catalog, surfaceId, value }, { itemBinding }?)` holding the body of the closure `resolve`; the closure `resolve` in the API stays as a one-line adapter calling it (public method shape unchanged).
  5. `resolveActionTarget({ surfaces, surfaceId, componentId }: ResolveActionTargetInput): { ok: true; surface: SurfaceState; action: Action } | { ok: false; reason: string }`.
  6. `buildAgentEventAction({ ids, surfaces, catalog, surface, surfaceId, componentId, event, … }: BuildAgentEventActionInput)` — same remaining params as today folded into the object, same return type.
  The closures `applyAgentMessage` and `buildAction` call the helpers with `{ catalog, surfaces, ids, … }`.
- **Importers to update:** none (no export moves).
- **After:** `createA2uiInterpreter` ~55; largest helper ~27; file ~300.
- **Risks / notes:** `resolve`'s optional second arg (`{ itemBinding… }`) must keep its exact name/default — copy the closure's signature into `resolveSurfaceValue`'s options object. `buildAction` reads `clock` — keep that in the closure. `notify` stays in the closure (listeners).
