### jini:packages/daemon/src/run-lifecycle.ts
- **Over:** file 690 lines · `createRunLifecycle` 393 (its `const lifecycle: RunLifecycle = {…}` literal is 208)
- **Phase:** now · **Batch:** size-17 · **Executor:** Fable/Opus (core state machine; timers + subscriber ordering)
- **Package entry:** `src/index.ts` has `export * from './run-lifecycle.js'` → every exported name is public. ADD `export * from './run-lifecycle-types.js'` and `export * from './run-lifecycle-helpers.js'` next to it. `run-lifecycle-records.ts` / `-methods.ts` export only internal names (do not add them).
- **Tests:** `src/__tests__/run-lifecycle.test.ts`, `run-lifecycle.rehydrate.f1.test.ts`, `run-lifecycle-helpers.test.ts`, `run-lifecycle-slow-run-watchdog.test.ts`, `slow-watchdog-resume.regression.test.ts`, `characterization.test.ts`, `delegated-tool-bridge.test.ts`, `ai-trace-lifecycle.test.ts`, `src/__tests__/index.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A types | `StartRunInput` … `RunLifecycle` (L37-148), `CreateRunLifecycleInput`, `RunLifecycleInternalErrorContext` | public contract |
| B records | `RunRecord`, `TERMINAL_OUTCOME_TO_END_STATUS`, `toPublicStatus`, `toRunEvent`, `isRecord`, `readStartMetadata`, `rehydratedStatus`, `rehydratedRunRecord`, `terminalStateFromEndEntry`, `buildNewRunRecord`; from the factory: `notifySubscribers`, `settlePendingStart`, `abortable`, `parkTerminalWaiter`, `resolveTerminalWaiters` (read no factory locals) | in-memory run record + waiters |
| C helpers | `resolveIdempotentReplayRunId` … `finishStreamSubscription`, `DEFAULT_*` consts (L336-490) | exported pure steps |
| D retention | `terminalRunOrder`, `removeFromTerminalOrder`, `evictTerminalRun`, `dropEvictedRunEvents`, `enforceTerminalCap`, `trackTerminalRun`, `untrackTerminalRun` | terminal-run LRU + eviction |
| E methods | bodies of `rehydrate`+`rehydrateOne`, `start`, `cancel`, `emit`, `finish`, `resume`, `waitForTerminal`, `stream`, `handleInactivityTimeout`, `handleSlowRunNotice` | lifecycle operations |
| F (stays) | option resolution, `runs`, `idempotencyIndex`, `hydration`, `requireRun`, `appendEvent`, `appendStartOrRollback`, `reportInternalError`, state object, thin `lifecycle` literal | composition |

- **Splits** (one commit; each new module imports only earlier ones):
  1. NEW `run-lifecycle-types.ts` — unit A verbatim.
  2. NEW `run-lifecycle-records.ts` — unit B; the five factory functions become module-level verbatim (keep positional/object signatures as they are).
  3. NEW `run-lifecycle-helpers.ts` — unit C verbatim (its `// ----` banner + paragraphs). Imports `toRunEvent` from records, types from types.
  4. NEW `run-lifecycle-methods.ts` — `interface RunLifecycleState { input; eventLog; runs; idempotencyIndex; terminalRetentionMs; slowRunThresholdMs; retention: TerminalRetention; hydration: { current: Promise<void> | null }; requireRun; appendEvent; appendStartOrRollback; reportInternalError; lifecycle: () => RunLifecycle }` and:
     - `createTerminalRetention({ runs, idempotencyIndex, input, eventLog, maxTerminalRuns }: CreateTerminalRetentionInput): TerminalRetention` ← unit D (`terminalRunOrder` owned inside).
     - `rehydrateRuns({ state }: …): Promise<void>` (+ `rehydrateOne`), `startRun({ state, requiredArgs }, optionalArgs)`, `cancelRun({ state, request })`, `emitRunEvent({ state, runId, input })`, `finishRun({ state, requiredArgs }, optionalArgs)`, `resumeRun({ state, runId })`, `waitForTerminalRun({ state, runId }, { signal })`, `streamRun({ state, runId, onEvent }, options)`, `handleInactivityTimeout({ state, runId })`, `handleSlowRunNotice({ state, runId })` ← each method body verbatim with factory locals read through `state.x`; `lifecycle.emit/finish` calls inside the timeout handlers become `state.lifecycle().emit/finish` (lazy; the literal exists when timers fire).
     - `let hydration` becomes `state.hydration.current` (only `rehydrate` writes it).
  5. `createRunLifecycle` builds `state` after `reportInternalError`, then `const lifecycle: RunLifecycle = { rehydrate: (a) => rehydrateRuns({ state }), start: (r, o) => startRun({ state, requiredArgs: r }, o), … get, list, onCancelRequested, suspendSlowRunNotice, resumeSlowRunNotice stay inline (≤13 lines each) }`.
- **Importers to update:** `src/index.ts` (two `export *` lines). Internal importers (`tokens.ts`, `ai-trace-lifecycle.ts`, `delegated-tool-bridge.ts`, `remote-tool-bridge.ts`, `continuation/run-scoped-context-store.ts`, `agent-executor/events.ts`, `agent-executor/run-output.ts`, tests) → re-point each moved type/helper name (`rg -n "from '.*run-lifecycle(\.js)?'" src`); `run-lifecycle-helpers.test.ts` and `run-lifecycle-slow-run-watchdog.test.ts` import unit-C names → `../run-lifecycle-helpers.js`.
- **After:** run-lifecycle.ts ~120, `createRunLifecycle` ~92; types ~75; records ~175; helpers ~80; methods ~300.
- **Risks / notes:** every `await` and `notifySubscribers` call keeps its position inside each body. Timer callbacks (`armWatchdogIfConfigured(…, () => handleInactivityTimeout(runId))`) must call the module functions with the same `state`. Map/array identities (`runs`, `idempotencyIndex`, `terminalRunOrder`) are shared by reference — never copy them into the state.
