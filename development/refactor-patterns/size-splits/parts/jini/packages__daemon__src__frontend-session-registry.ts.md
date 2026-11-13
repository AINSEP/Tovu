### jini:packages/daemon/src/frontend-session-registry.ts
- **Over:** `createFrontendSessionRegistry` 131
- **Phase:** now · **Batch:** size-07
- **Tests:** `src/__tests__/frontend-session-registry.test.ts`; smoke `src/http/__tests__/index.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | exported types/interfaces, `FrontendSessionCapacityError`, `assertSessionCapacity` | contract (stays) |
| B | `coversCapability`, `resolveTarget` | route a capability call to the bound surface |
| C | `invoke`, `progress`, `settle` | invocation lifecycle (pending map per session) |
| D | `sessions`/`runBindings`/`bindTokens`, `attach`, `bindRun`, `bindRunByToken`, `sessionFor`, `capabilitiesFor`, `ownsSession` | attachment + binding (stays in the factory) |

- **Splits:**
  1. HELPERS (module level, above `createFrontendSessionRegistry`, in this order):
     - `coversCapability` moves out unchanged (pure; its "why" comment moves).
     - `resolveInvocationTarget({ runBindings, runId, capabilityId }: ResolveInvocationTargetInput): AttachedSession` ← body of inner `resolveTarget` (comment moves). Inner `resolveTarget(runId, capabilityId)` call sites become `resolveInvocationTarget({ runBindings, runId, capabilityId })`.
     - `createInvocationChannel({ sessions, runBindings, newInvocationId }: CreateInvocationChannelInput): Pick<FrontendSessionRegistry, 'invoke' | 'progress' | 'settle'>` ← inner `invoke` (with its `async` "why" comment), `progress`, `settle` verbatim. Factory then does `const { invoke, progress, settle } = createInvocationChannel({ sessions, runBindings, newInvocationId });` after `bindTokens` is declared.
- **Importers to update:** none.
- **After:** file ~215; `createFrontendSessionRegistry` ~70; `createInvocationChannel` ~55.
- **Risks / notes:** `invoke` must stay `async` so a `resolveTarget` throw becomes a rejection (see its comment). If `progress`'s parameter type is inline, keep it inline (or `Parameters<FrontendSessionRegistry['progress']>[0]`).
