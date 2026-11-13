### jini:packages/chat/src/core/assistant-client/ag-ui-transport.ts
- **Over:** `createAgUiRunClient` 113
- **Phase:** now · **Batch:** size-32
- **Tests:** `src/core/assistant-client/__tests__/ag-ui-transport.test.ts`, `src/core/assistant-client/__tests__/transport.test.ts`, `src/core/assistant-client/__tests__/transport-redaction-signal.test.ts`, `src/core/assistant-client/__tests__/credential-notice-current-turn.unit.test.ts`, `src/core/__tests__/durable-run-subscription.paths.unit.test.ts`. No `vi.mock` of the file (check with `rg -n "vi\.mock\(.*ag-ui-transport" packages/chat/src`).
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | `AgUiClient`, `AgUiClientPorts`, `AgUiEventContext`, `AgUiRunClient`, `frontendBinding` | contract |
| B event translation | closures `handleAgUiEvent`, `toAgUiMessage` (no closure captures) | AG-UI event → chat handlers; ChatMessage → AG-UI Message |
| C run input | `const runAgentInput: RunAgentInput = {…}` in `startAgUiRun` | build the AG-UI request |
| D subscription | `return new Promise<{ runId: string }>(…)` in `startAgUiRun` (+ its "Deliberately racing…" comment) | drive the cold Observable, settle start |
| E (stays) | `agUiAgents`, rest of `startAgUiRun`, `reattachAgUiRun`, `fetchAgUiRunStatus`, `stopAgUiRun`, return | the run client |

- **Splits** (module level, above `createAgUiRunClient`, in this order; bodies verbatim, comments move):
  1. `handleAgUiEvent` and `toAgUiMessage` move out of the closure unchanged (same parameter lists — they are existing signatures, not new helpers; their comments move).
  2. `buildRunAgentInput({ input, threadId, runId, messages }: BuildRunAgentInputInput): RunAgentInput` ← the `runAgentInput` literal.
  3. `subscribeAgUiRun({ agent, runAgentInput, runId, input, abort, agUiAgents, collected, handlers, state, finish }: SubscribeAgUiRunInput): Promise<{ runId: string }>` ← the returned `new Promise` verbatim (all comments move). `startAgUiRun` ends with `return subscribeAgUiRun({...});`.
- **Importers to update:** none (no export moves).
- **After:** `createAgUiRunClient` ~42; `startAgUiRun` ~25; file ~160.
- **Risks / notes:** `startAgUiRun` must still be `async` and the throw on `input.signal.aborted` must stay before `agUiAgents.set`. `finish`/`settled` stay in `startAgUiRun` (closure over `collected`, `abort`). Type of `state` = `ReturnType<typeof createAgUiToAgentTranslationState>` unless an exported type exists.
