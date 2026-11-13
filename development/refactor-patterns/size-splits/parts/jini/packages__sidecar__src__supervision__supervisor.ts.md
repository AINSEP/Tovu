### jini:packages/sidecar/src/supervision/supervisor.ts
- **Over:** `createDaemonSupervisor` 201
- **Phase:** now · **Batch:** size-36
- **Tests:** `src/supervision/__tests__/supervisor.test.ts`, `src/supervision/__tests__/supervisor-node.l178.test.ts`, `src/__tests__/supervisor-isolation.test.ts`, `src/__tests__/supervisor.conditions.test.ts`, `src/__tests__/integration-surface.test.ts` (`pnpm --filter @jini-ai/sidecar exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `cooldown` + check, `formatGiveUp`, `parkedExitCodes`, the 11 `let`s, `isCurrentLive`, `isReady`, `hasUnreapedChild`, `reportFailure`, `cancelPendingRetry` | supervisor state + small predicates (stays) |
| B | `waitForReady`, `discoverReadiness`, `ensureReady` | readiness discovery for demand callers |
| C | `terminate`, `handleUnexpectedExit`, `attemptSpawn`, `forceFreshSpawn` | child spawn / exit / respawn lifecycle |
| D | `const supervisor: DaemonSupervisor = {` | public surface (stays) |

- **Splits** (module level above `createDaemonSupervisor`):
  1. In main, replace the 11 `let`s with ONE mutable object `const state: SupervisorRuntimeState = { parked: false, current: undefined, cancelRetry: undefined, terminating: false, spawnAttempts: 0, lastOnDemandAttemptAt: undefined, readyChild: undefined, readyWork: undefined, discoveryWork: undefined, cancelReadiness: undefined }` (interface declared above, field types = the lets' types; the "Terminal shutdown is a one-way latch" comment moves onto the `terminating` field). Every read/write `x` of those names in the function becomes `state.x`. This is the only non-move edit.
  2. HELPER `createReadiness({ state, deps, isCurrentLive, isReady }: CreateReadinessInput): { discoverReadiness; ensureReady }` ← `function waitForReady(` (with its "Discovery outlives…" comment) through `function ensureReady(`. If `ensureReady` calls a unit-C function, pass it in (C must then be created first — check; if B and C call each other, STOP and report).
  3. HELPER `createChildLifecycle({ state, deps, options, formatGiveUp, parkedExitCodes, cooldown, hasUnreapedChild, reportFailure, cancelPendingRetry, discoverReadiness }: CreateChildLifecycleInput): { terminate; attemptSpawn; forceFreshSpawn }` ← `function terminate(` through `function forceFreshSpawn(` (with its comment). Include exactly the names the bodies read.
  4. Main keeps unit A (predicates now read `state.*`), calls the helpers, then `const supervisor` and `return supervisor;`.
- **Importers to update:** none.
- **After:** file ~290; `createDaemonSupervisor` ~85; `createChildLifecycle` ~88; `createReadiness` ~52.
- **Risks / notes:** HIGH — 11 mutable lets shared across every function; the `let` → `state.x` rewrite must catch every occurrence (a missed one silently forks state). `readinessDeadline` / `awaitForCaller` are already module-level. Recommend Opus/Fable execution.
