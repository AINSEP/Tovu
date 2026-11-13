### jini:packages/chat/src/store/runtime/run-ledger.ts
- **Over:** `createChatRunLedger` 186
- **Phase:** now (JINI 186) · **Batch:** size-28
- **Tests:** `src/store/runtime/__tests__/run-ledger.test.ts`, `run-ledger.cov-j2.test.ts`, `entry.cov-j2.test.ts`, `run-guarded-chat-store.cov-j2.test.ts`, `src/server/durable-runs/__tests__/accept.cov-j2.test.ts` (package `@jini-ai/chat`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| K checkpoint writes | `const version`, `const returnedVersion`, `recordProgress`, `writeDelta`, `notifyPersisted`, `writeFullCheckpoint` | guarded delta / full-merge checkpoint writes + receipts |
| S settle | `prop settle` body | settle one run (first terminal wins) |
| R reconcile | `prop reconcileInterrupted` body | boot-time adoption or cancel of stuck runs |
| L ledger | `const kernel`, `isSettled`, returned `durable`, `hasActiveRuns`, `unlessSettled`, `checkpoint` | ledger surface (stays) |

- **Splits** (module level, directly above `createChatRunLedger` and below `keepToolCheckpoints`, in this order; bodies verbatim with all comments):
  1. `function createCheckpointWrites({ kernel, now }: CreateCheckpointWritesInput)` with `interface CreateCheckpointWritesInput { kernel: ChatKernel<ChatDatabase>; now: () => number }`. Body: `const version = …`, `const returnedVersion = …`, then `recordProgress`, `writeDelta`, `notifyPersisted`, `writeFullCheckpoint` (with their doc comments). Returns `{ writeDelta, writeFullCheckpoint }`.
  2. `async function settleRun({ kernel, settlement }: SettleRunInput): Promise<boolean>`. Body = the current `settle` method body (`return kernel.transaction(async () => { … })`). `settlement: Parameters<ChatRunLedger["settle"]>[0]`.
  3. `async function reconcileInterruptedRuns({ kernel, now, required, optional }: ReconcileInterruptedRunsInput): Promise<number>`. Body = the current `reconcileInterrupted` method body, keeping the "A legacy stub without an attempt id…" comment. `required: NonNullable<Parameters<ChatRunLedger["reconcileInterrupted"]>[0]>`, `optional: NonNullable<Parameters<ChatRunLedger["reconcileInterrupted"]>[1]>`. If `ChatRunLedger` has no such method types, take the parameter types from the interface in `../../core/durable-runs/ledger-contracts.js` and don't loosen them.
  - In `createChatRunLedger`, delete `version`, `returnedVersion` and the four K closures, and add `const { writeDelta, writeFullCheckpoint } = createCheckpointWrites({ kernel, now });` after `const kernel`. Then `settle(settlement, _optional = {}) { return settleRun({ kernel, settlement }); },` and `async reconcileInterrupted(required = {}, optional = {}) { return reconcileInterruptedRuns({ kernel, now, required, optional }); },`. `checkpoint` stays as it is and calls the destructured writers.
- **Importers to update:** none.
- **After:** `createChatRunLedger` ~55; `createCheckpointWrites` ~58; `settleRun` ~34; `reconcileInterruptedRuns` ~46; file ~265 counted.
- **Risks / notes:** inside the reconcile loop, `endedAt = required.now ?? now()` still runs under the per-row lock, at the same point. Keep it inside the moved body and don't hoist it. `version` is a SQL fragment built once per ledger, the same as before (it's built once per `createCheckpointWrites` call, and that's once per ledger). The existing `[0]!.version` / `nativeVersion!` are moved code, so they stay.
