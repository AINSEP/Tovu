### tovu:apps/website/src/assistant/demo-a2ui-tool.ts
- **Over:** `buildDemoA2uiRegistrations` 102 (file 164, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-03
- **Tests:** `apps/website/src/assistant/__tests__/demo-a2ui-tool.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`, `apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the three `await emitA2ui({ version: "v1.0", … })` literals | A2UI message content for each turn |
| B | `firstStep` / `secondStep` ternaries | action payload → `RoundTripStep` |
| C | handler: exchange open, abort wiring, receive/early-return, finally close; `buildDomainRegistrations` call | the round-trip flow (stays) |

- **Splits** (same file, module level, above `buildDemoA2uiRegistrations`, after `noAnswerResult`):
  1. PURE `demoCreateSurfaceMessage({ surfaceId }: DemoSurfaceMessageInput): AgentToRendererMessage` ← the `createSurface` literal (uses `CATALOG.catalogId`).
  2. PURE `demoContinueComponentsMessage({ surfaceId }: DemoSurfaceMessageInput): AgentToRendererMessage` ← the first `updateComponents` literal (root/title/status/Continue button).
  3. PURE `demoFinishComponentsMessage({ surfaceId, stepName, timestamp }: DemoFinishComponentsMessageInput): AgentToRendererMessage` ← the second `updateComponents` literal; `timestamp: string | undefined` and the text keeps `${timestamp ?? "an unknown time"}` exactly.
  4. PURE `roundTripStepFrom({ action }: RoundTripStepFromInput): RoundTripStep` ← the ternary `action ? { name: action.name, context: action.context } : { name: "unknown", context: {} }`; `action` type = `ReturnType<typeof readActionPayload>`. Used for both `firstStep` and `secondStep`.
  5. Handler becomes: `await emitA2ui(demoCreateSurfaceMessage({ surfaceId }))`, `await emitA2ui(demoContinueComponentsMessage({ surfaceId }))`, …, `await emitA2ui(demoFinishComponentsMessage({ surfaceId, stepName: firstStep.name, timestamp: firstAction?.timestamp }))`. Same awaits, same order; `validateDemoA2uiMessage` still runs inside `emitA2ui`.
- **Importers to update:** none (no export moves).
- **After:** file ~180; `buildDemoA2uiRegistrations` ~50; helpers ≤ 25.
- **Risks / notes:** the `/** Validates every outgoing message … */` comment stays on `emitA2ui`. Message objects must be built fresh per call (no shared constants) — validation may mutate nothing, but keep it identical to today.
