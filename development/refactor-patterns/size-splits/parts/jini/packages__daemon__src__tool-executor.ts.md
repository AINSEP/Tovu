### jini:packages/daemon/src/tool-executor.ts
- **Over:** `createToolExecutor` 344 (file 455, not over; will exceed 500 once helpers are module-level unless types move)
- **Phase:** now · **Batch:** size-17 · **Executor:** Fable/Opus (audit/confirmation ordering across ~25 closures)
- **Package entry:** `src/index.ts` has `export * from './tool-executor.js'` → ADD `export * from './tool-executor-types.js'` next to it.
- **Tests:** `src/__tests__/tool-executor.test.ts`, `tool-executor.dispatch.test.ts`, `tool-executor-audit-bound.test.ts`, `forced-confirmation.test.ts`, `tool-input-normalization.test.ts`, `routing-tool-executor.test.ts`, `injected-ports.test.ts`, `src/core/__tests__/tool-audit.test.ts`, `src/http/__tests__/tool-execution-rpc.test.ts`, `src/__tests__/integration/delegated-approval-writes.integration.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| T types | `ConfirmationDecision` … `CreateToolExecutorOptions` (L67-205) | public contract |
| A audit | `audits`, `finishedAudits`, `appendEvent`, `retireAudit`, `openAudit`, `getAuditRecord` | bounded audit trail |
| B approvals | `approvalWaits`, `approvalStateChange`, `approvalRefusal`, `pendingConfirmations`, `cancelledConfirmations`, `requestConfirmation`, `confirmGate` | human approval waits and confirmation |
| C outcomes | `terminal`, `operationalFailure`, `failureResult`, `authorizationFailure`, `admitAuthorized`, `settleOutput` | terminal result + audit phase per outcome |
| D handler support | `startTimeout`, `watchTransportAbort`, `surfaceOption`, `wantsGuidance`, `prepareGuidanceSafely`, `nestedFailureMessage`, `nestedInvoker`, `AllowedInvocation`, `AdmittedCall`, `runHandler` | run one admitted handler |
| E (stays) | options, `activeControllers`, `authorize`, `assertKnownTool`, `execute`, `resumeConfirmation`, `cancel`, return | executor composition |

- **Splits:**
  1. NEW `tool-executor-types.ts` — unit T verbatim. tool-executor.ts imports the types it uses.
  2. HELPERS (module level, above `createToolExecutor`, in this order; each factory owns its maps):
     - `createAuditTrail({ now, maxAuditRecords }: CreateAuditTrailInput): AuditTrail` → `{ appendEvent; retireAudit; openAudit; getAuditRecord }` ← unit A.
     - `createApprovalGate({ delegate, appendEvent }: CreateApprovalGateInput): ApprovalGate` → `{ approvalStateChange; approvalRefusal; requestConfirmation; confirmGate; pendingConfirmations; cancelledConfirmations }` ← unit B (expose the two maps; `resumeConfirmation`/`cancel` read them). Pass `terminal` too if `confirmGate`'s body uses it (check outline `uses:`).
     - `createOutcomeRecorder({ appendEvent, approvalRefusal }: CreateOutcomeRecorderInput): OutcomeRecorder` ← unit C.
     - `startTimeout` (uses only `now` → add it to its existing params object), `watchTransportAbort`, `surfaceOption` → module level verbatim.
     - `createHandlerRunner({ options, registry, outcomes, audit, activeControllers }: CreateHandlerRunnerInput): { runHandler(call: AdmittedCall, opts): Promise<ToolExecutionResult> }` ← `wantsGuidance`, `prepareGuidanceSafely`, `nestedFailureMessage`, `nestedInvoker`, `AllowedInvocation`, `AdmittedCall`, `runHandler`.
  3. `createToolExecutor` keeps E and calls the factories at the position of their first original statement.
- **Importers to update:** `src/index.ts` (add `export *`); any file importing a unit-T type from `./tool-executor.js` (`rg -n "from '.*tool-executor(\.js)?'" src` — 25+ test files; re-point only type names that moved).
- **After:** tool-executor.ts ~370, `createToolExecutor` ~85; tool-executor-types ~100; factories ~45 / ~50 / ~45 / ~60.
- **Risks / notes:** `appendEvent` order inside every path must be unchanged (audit-bound and dispatch tests assert phase sequences). `cancel` clears `pendingConfirmations` + marks `cancelledConfirmations` — both come from the approval gate by reference.
