# Split plan — Jini `packages/daemon/src/agent-executor/launch.ts`

> **50-line limit (2026-11-13):** every function in the new modules must also end ≤ 50 counted lines and cyclomatic/cognitive ≤ 10 (CONVENTIONS). `runAgent` (~70 here) splits further by its existing phases: `stageRunPrompt` (preflight + prompt/log staging) and `spawnAndDispatchRun` (spawn, confirm, handoff, dispatch), `runAgent` calling them in order. `events.ts` `wireChildLifecycle` is its own Fable-lane row.
>
> **PARTIAL PLAN.** The author stopped at the context limit. Sections 1-3 and 6 are designed. Sections 4-5 give the steps and the expected sizes, but the per-statement line counts were **not** re-measured with `outline.mjs` (see REMAINING). The executor must run `outline.mjs --check` after each step, and must stop and report if any number differs by more than ~15%.

## 1. Header
- **Path:** `/Users/la/Programming/jini-terra-d4/packages/daemon/src/agent-executor/launch.ts` (`@jini-ai/daemon`, published).
- **Over:** file 1048 counted; `createAgentExecutor` 429; nested `run` 115.
- **Phase:** **NOW.** The file is already in Jini (the move does not touch it).
- **Executor note:** Fable/Opus. Tests: `pnpm --filter @jini-ai/daemon exec vitest run <file> --maxWorkers=2`, then `pnpm --filter @jini-ai/daemon run typecheck`. The Jini clone has no `node_modules`, so the executor runs the plan in a clone that has them.
- **Package entry check:** `launch.ts` is **not** a `package.json` `exports` target. The exports are `.`, `./terminal`, `./store/*`, `./http`, `./read-only-tools`, `./scheduler`, `./tool-audit`, `./surface-exchanges`, `./session-coordination`, `./run-credentials`, `./tool-recovery`, `./chat-settings`. Its public names reach the package root through the internal barrel `src/agent-executor/index.ts` L120-142 (`export { … } from './launch.js'`), and from there through `src/agent-executor.js` and `src/index.ts`. Per rule 4, `index.ts` is an internal barrel, not a package entry, so the barrel lines are **retargeted** to the new modules and `launch.ts` does **not** re-export. The public API from `.` stays identical. Verify with a typecheck plus `rg -n "from '\.\./launch\.js'|from '\./launch\.js'" src`.
- **`events.ts` (934; `wireChildLifecycle` 335):** **planned separately.** `launch.ts` uses only the signatures of `wireChildLifecycle(ctx: WireChildLifecycleContext): StdinCloseHandle`, `runAcpDispatch`, `runPiRpcDispatch` and `writePromptToStdin`. Splitting `wireChildLifecycle` internally (it already has an explicit `ctx` object) changes neither those signatures nor the launch design below. If that split renames or moves any of the 4 exports, its importer list must include the new `launch-run-dispatch.ts` (Step 3).

## 2. Responsibility map

### Module-level declarations (L117-992)

| Declaration(s) | Unit | Job |
|---|---|---|
| `HTTP_MCP_ENV_ADAPTERS`, `HTTP_MCP_HOME_ADAPTERS`, `codexHttpMcpInput`, `httpMcpSpawnEnv`, `httpMcpPreparationMessage`, `withHttpMcpJsonPath` | → `launch-http-mcp.ts` | HTTP MCP per-def delivery shims |
| `FILESYSTEM_ADAPTERS` | → `launch-run-preflight.ts` (its only reader is `enforceFilesystemRuntime`) | per-def filesystem confinement adapters |
| `isSupportedStreamFormat`, `assessAgentExecutorCompatibility`, `isAgentExecutorSupported` | → NEW leaf `launch-compatibility.ts` (imports only `contracts.ts` types + what these three already import; never `launch*.ts`) | public def-compatibility API |
| `resolveDefAndStreamFormat` (+`ResolvedDefAndFormat`) | → `launch-phases.ts` (imports `assessAgentExecutorCompatibility` from `launch-compatibility.ts`) | phase 1 registry lookup + compatibility guard |
| `toStringEnvRecord`, `selectAgentExecutorHostEnv`, `resolveRunEnv`, `resolveLaunch` (+`ConfirmedAgentLaunchResolution`), `waitForSpawnOrError`, `resolveAgentRuntimeDeps`/`resolveProcessDeps`/`resolveMiscExecutorDeps` (+3 `Resolved*` interfaces) | stay | env + launch resolution + dependency defaults |
| `resolveImageDeliveryAndArgvBudget`, `stagePromptFile`, `stageLogFile`, `guardWindowsCommandLineBudget`, `spawnAgentChildProcess`, `prepareRunCommand`, `isStdinDrivenFormat`, `confirmChildSpawned`, `MutableRunInput`, `nativeCapabilityInput`, `validateStdoutJournalOptions`, `launchModelContext`, `stagedChildEnvOptions` | stay | spawn-path phases 2/4/11-13 |
| `computeChildEnv`, `sessionRuntimeContext`, `computeRuntimeContext` | stay | child env + runtime context |
| `computeSystemPromptOverlay`, `AgentBuildInput`, `nativeBuildOptions`, `filesystemBuildOptions`, `settingsBuildOptions`, `canRegisterRunMessageRelay`, `buildAgentBuildArgsOptions`, `hasSystemPromptOverlay`, `appendFlagOverlay`, `isContinuingOverlaySession`, `resolveSystemPromptOverlayDelivery`, `addSubagentStartSettings`, `buildRunArgs`, `prepareSystemPromptOverlayFileIfNeeded`, `defaultMkdtempInTmpdir` | → `launch-build-args.ts` | argv + system-prompt overlay delivery (phases 8-10b) |
| `createAgentExecutor` | stays (shrinks) | composition: resolve deps once, return `{ run, sendUserMessage, claimUserMessages }` |

### `createAgentExecutor` statement groups → helper

| Anchor | Goes to |
|---|---|
| L1011 `const env = …` through L1041 `const verifyFilesystem = …` | `createExecutorContext` (new, `launch-executor-context.ts`) |
| L1046 `cleanupFilesystemTemp`, L1066 `failBeforeSpawn` | `launch-executor-context.ts` as `cleanupFilesystemTemp({ ctx, runId })` and `failBeforeSpawn({ ctx, runId, code, message })`. The context object carries bound closures `ctx.failBeforeSpawn` / `ctx.cleanupFilesystemTemp` so call sites keep the `{ runId, code, message }` shape |
| L1085 `liveRunInputs`, L1086 `liveRunRelays`, L1088 `claimUserMessages`, L1091 `sendUserMessage` | `liveRunInputs`/`liveRunRelays` go into the context; `claimUserMessages` and `sendUserMessage` stay in `createAgentExecutor` (2 short closures over the context) |
| L1101 `prepareRunContext`, L1113 `enforceNativeToolPolicy`, L1132 `enforceFilesystemPaths`, L1150 `enforceFilesystemRuntime`, L1187 `resolveRunOverlay`, L1225 `resolveRunLaunch`, L1240 `selectRunModel` | → `launch-run-preflight.ts`, each taking `({ ctx, …existing fields })` |
| L1258 `bridgeProbeEntryForRun`, L1265 `wireRunInput`, L1305 `childLifecycleOptions`, L1314 `dispatchAcpPrompt`, L1357 `dispatchPiPrompt`, L1391 `dispatchStdinPrompt`, L1410 `dispatchPrompt` | → `launch-run-dispatch.ts`, each taking `({ ctx, …existing fields })` |
| L1428 `prepareRunHttpMcp` | → `launch-run-staging.ts` |
| L1450 `run` | stays nested in `createAgentExecutor` (`async function run(requiredArgs, optionalArgs = {}) { return runAgent({ ctx, requiredArgs, optionalArgs }); }`); its body → `runAgent` in new `launch-run.ts` (see below) |

### `run` statement groups → helper (in `launch-run.ts`)

| Anchors | Helper |
|---|---|
| L1451 `prepareRunContext` … L1493 `const preparedLogFile = await stageLogFile(…)` | `runAgent` part 1 (preflight + prompt/log staging): stays inline in `runAgent` |
| L1507 `let preparedHttpMcp` … L1561 `const cleanupStagedFiles = async () => {…}` | **`createRunStagedResources({ ctx, input, preparedPromptFile, preparedLogFile })`** → returns `{ resources, cleanupStagedFiles }` (`launch-run-staging.ts`). `resources` is the mutable holder below |
| L1567 `preparedHttpMcp = await prepareRunHttpMcp(…)` … L1572 `const runtimeContext = withHttpMcpJsonPath(…)` | inline in `runAgent` (writes `resources.preparedHttpMcp`) |
| L1578 `const selectedModel` … L1596 `releaseStagedResources` | **`acquireRunLock({ def, selectedModel, cleanupStagedFiles })`** → `{ runtimeLockHold, processExitedController, releaseRuntimeLock, releaseStagedResources }` (`launch-run-staging.ts`) |
| L1605 `buildRunArgs` … L1653 `const childEnv = computeChildEnv(…)` | **`stageRunArgsAndEnv({ ctx, input, def, imageDelivery, systemPromptOverlay, overlayDelivery, runtimeContext, mcpBridge, spawnEnv, resources, releaseStagedResources })`** → `{ args, childEnv }` (`launch-run-staging.ts`). It writes `resources.writtenMcpJsonPath`, `.preparedCodexHome`, `.preparedClaudeConfigDir` and `.preparedSystemPromptOverlayFile` in the same order and with the same awaits |
| L1659 `guardWindowsCommandLineBudget` … L1706 `await dispatchPrompt(…)` | inline in `runAgent` (spawn, confirm, handoff, dispatch) |

### Mutable state shared across callbacks

These are all of the mutable variables.

| Variable | Scope | Writers | Readers |
|---|---|---|---|
| `filesystemTemps` (Map) | executor | `enforceFilesystemRuntime` (`set`), `cleanupFilesystemTemp` (`delete`) | `cleanupFilesystemTemp` → `ctx.filesystemTemps` |
| `liveRunInputs` (Map) | executor | `wireRunInput` (`set` + `close` delete), `runAgent` confirm-catch (`delete`) | `sendUserMessage` → `ctx.liveRunInputs` |
| `liveRunRelays` (Map) | executor | `wireRunInput`, `dispatchAcpPrompt` (`set`), close/confirm-catch (`delete`) | `claimUserMessages`, `wireRunInput` relay fallback → `ctx.liveRunRelays` |
| `preparedHttpMcp` | run | `runAgent` (L1567), `cleanupStagedFiles` (nulls it) | `cleanupStagedFiles`, `resolveMcpBridgeForRun` gate, `withHttpMcpJsonPath`, `codexHttpMcpInput`, `httpMcpSpawnEnv`, `wireRunInput` (`!== null`) → **`resources.preparedHttpMcp`** |
| `writtenMcpJsonPath` | run | `stageRunArgsAndEnv`, `cleanupStagedFiles` (sets `undefined`) | `cleanupStagedFiles`, `wireRunInput` → `resources.writtenMcpJsonPath` |
| `preparedCodexHome`, `preparedClaudeConfigDir`, `preparedSystemPromptOverlayFile` | run | `stageRunArgsAndEnv`, `cleanupStagedFiles` (nulls) | `cleanupStagedFiles`, `stagedChildEnvOptions` → `resources.*` |

`StagedRunResources` (exported type in `launch-run-staging.ts`): `{ preparedHttpMcp: PreparedHttpMcp | null; writtenMcpJsonPath: string | undefined; preparedCodexHome: PreparedCodexHome | null; preparedClaudeConfigDir: PreparedClaudeConfigDir | null; preparedSystemPromptOverlayFile: PreparedSystemPromptOverlayFile | null }`. **Every read must go through `resources.x` at the same moment the closure read it.** Never destructure the holder early. In particular, `wireRunInput` must receive `writtenMcpJsonPath: resources.writtenMcpJsonPath` read at the call (after staging), as today.

## 3. Target layout (all in `src/agent-executor/`)

| Module | Job | Exports | Imports (no cycles) |
|---|---|---|---|
| `launch-executor-context.ts` | resolve executor deps once; failure + temp-cleanup primitives | `interface ExecutorContext` (every resolved dep from L1011-1041 + `filesystemTemps`, `liveRunInputs`, `liveRunRelays`, bound `failBeforeSpawn`, bound `cleanupFilesystemTemp`, `verifyFilesystem`), `createExecutorContext({ requiredArgs, optionalArgs }): ExecutorContext` | `launch.ts` (`selectAgentExecutorHostEnv`, `resolveAgentRuntimeDeps`, `resolveProcessDeps`, `resolveMiscExecutorDeps`, `validateStdoutJournalOptions`: the last four become `export` in `launch.ts`; they are internal, and the barrel does not list them), `contracts.ts`, `codex/home-staging.js`, `pi/options.js`, `claude/filesystem.js` |
| `launch-build-args.ts` | argv + system-prompt overlay delivery | the 15 names in §2 row 5 (public ones keep exactly their current signatures) | `contracts.ts`, `claude/subagent-start.js`, `@jini-ai/agent-runtime`, `node:fs`/`os`/`path`. **Not** `launch.ts` |
| `launch-http-mcp.ts` | HTTP MCP shims | the 6 names in §2 row 1 | `http-mcp.js`, `opencode/mcp-config.js`, `codex/home-staging.js` |
| `launch-run-preflight.ts` | pre-spawn validation + launch/model/overlay resolution | the 7 functions from L1101-1256 + `FILESYSTEM_ADAPTERS` | `launch.ts`, `launch-build-args.ts`, `launch-executor-context.ts` (type) |
| `launch-run-staging.ts` | per-run staged resources, cleanup, lock, args/env staging | `StagedRunResources`, `createRunStagedResources`, `prepareRunHttpMcp`, `acquireRunLock`, `stageRunArgsAndEnv` | `launch.ts`, `launch-build-args.ts`, `launch-http-mcp.ts`, `mcp-bridge.js`, `codex/home-staging.js`, `claude/config-dir.js`, `handoff.js`, context (type) |
| `launch-run-dispatch.ts` | wire child IO + hand over the prompt | the 7 functions from L1258-1425 | `events.js`, `message-relay.js`, `mcp-bridge-probe.js`, `launch.ts` (`isStdinDrivenFormat`), `launch-build-args.ts` (`canRegisterRunMessageRelay`), context (type) |
| `launch-run.ts` | one run, end to end | `runAgent({ ctx, requiredArgs, optionalArgs }): Promise<void>` | preflight, staging, dispatch, `launch.ts`, `launch-http-mcp.ts`, `handoff.js` |

`launch.ts` imports `createExecutorContext` + `runAgent` and nothing else new. **Cycle rule:** none of the new modules may import `launch.ts` *at runtime* if `launch.ts` imports them at runtime. `launch.ts` → `launch-run.ts` → `launch.ts` would be a cycle. **Resolution (fixed after review-d4 finding 3):** the compatibility trio moves to the leaf module `launch-compatibility.ts`, so `resolveDefAndStreamFormat` (source L343-350 calls `assessAgentExecutorCompatibility`) can live in `launch-phases.ts` without importing `launch.ts`. Move the spawn-path phase helpers (`resolveDefAndStreamFormat` group, env/launch group, spawn group from §2 rows 2-5) **out** of `launch.ts` into `launch-phases.ts`; the new modules import from `launch-phases.ts` / `launch-compatibility.ts`, never from `launch.ts`. Settled import graph (runtime edges): `launch.ts` → {`launch-executor-context`, `launch-run`}; `launch-run` → {`launch-run-preflight`, `launch-run-staging`, `launch-run-dispatch`, `launch-phases`, `launch-http-mcp`}; `launch-phases` → {`launch-compatibility`, `launch-build-args`}; preflight/staging/dispatch → {`launch-phases`, `launch-build-args`, `launch-http-mcp`, context (type only)}; `launch-compatibility` → `contracts.ts` only. Nothing imports `launch.ts` except `index.ts`. `launch.ts` keeps only `createAgentExecutor`; the 3 dep resolvers move to `launch-executor-context.ts` (only used there). The barrel `index.ts` imports each public name from its new module (the compatibility trio from `./launch-compatibility.js`), so every name in `index.ts` L120-142 is still exported from `.` and from `../agent-executor.js` (`split-parity.test.ts` checks both). `claude/filesystem.ts` L3 imports `MutableRunInput` from `../launch-phases.js`.

## 4. Steps (one commit each; tests = the 4 direct importers + the executor suites)

**Test set** (run after every step):
- `src/agent-executor/__tests__/{launch-characterization,launch-defaults-and-staging,access-approval-transport,host-env-ports,agent-executor,agent-executor-helpers,agent-executor-acp.integration,agent-executor-filesystem-policy,agent-executor-read-only-dirs,agent-executor-capability-probe,http-mcp-launch.integration,launch-relay-m1.unit,mid-run-user-message,full-cli-bash-launch-env}.test.ts`
- then `pnpm --filter @jini-ai/daemon run typecheck`

Before moving any export, run `rg -n "vi\.mock\(" src/agent-executor/__tests__`. Today the only mocks are `node:child_process` and `node:os`, so no launch path is mocked.

1. **Move the pure module-level groups first** (no closures involved): `launch-compatibility.ts` (first; leaf), `launch-build-args.ts`, `launch-http-mcp.ts`, `launch-phases.ts`. Check: `rg -n "from './launch.js'" src/agent-executor` lists only `index.ts`. Retarget the barrel lines in `index.ts` L120-142 and the 4 test imports (`launch-characterization`: `buildAgentBuildArgsOptions`/`resolveSystemPromptOverlayDelivery` → `launch-build-args.js`, `computeRuntimeContext` → `launch-phases.js`; `host-env-ports`: `resolveRunEnv`/`selectAgentExecutorHostEnv` → `launch-phases.js`, `resolveSystemPromptOverlayDelivery` → `launch-build-args.js`; `access-approval-transport`: `computeChildEnv` → `launch-phases.js`; `launch-defaults-and-staging`: `prepareSystemPromptOverlayFileIfNeeded` → `launch-build-args.js`). Also retarget `claude/filesystem.ts`. Expected `launch.ts`: about 470 + `createAgentExecutor`.
2. Extract `launch-executor-context.ts` (L1011-1077 + Maps). `createAgentExecutor` now starts with `const ctx = createExecutorContext({ requiredArgs, optionalArgs });`.
3. Extract `launch-run-preflight.ts` and `launch-run-dispatch.ts`. Every closure reference becomes `ctx.x`, and the bodies stay otherwise verbatim (keep the existing `stdinHandle!` non-null assertions in `dispatchStdinPrompt` verbatim; rule 6 forbids rewriting moved code. Flag them in the report, since rule 10 bans new ones).
4. Extract `launch-run-staging.ts` (`StagedRunResources`, `createRunStagedResources`, `acquireRunLock`, `stageRunArgsAndEnv`, `prepareRunHttpMcp`) and `launch-run.ts` (`runAgent`). All comments above each moved statement move with it, including the long "Mechanism N of 5" and "Finding 1" paragraphs.

## 5. After (expected, not re-measured)
`launch.ts` ~40; `launch-compatibility.ts` ~45; `createAgentExecutor` ~15; `runAgent` ~70; `launch-build-args.ts` ~230; `launch-phases.ts` ~260; `launch-http-mcp.ts` ~40; `launch-executor-context.ts` ~70; `launch-run-preflight.ts` ~150; `launch-run-staging.ts` ~110; `launch-run-dispatch.ts` ~170. No exception candidates expected.

## 6. Risks
- **Published package API:** every name in the barrel list (`index.ts` L120-142) must still be exported from `.` with an identical signature. Check this by typecheck and by `rg` of the barrel. Downstream (Tovu) imports `createAgentExecutor` from `@jini-ai/daemon`, so it is unaffected.
- **Await order and synchronous spawn:** `spawnAgentChildProcess` must stay a synchronous call (no `await`; see its doc). `child.once('exit', releaseRuntimeLock)` must be registered before `confirmChildSpawned`. The registry lookup in `prepareRunContext` must happen before its first await. The staging order is HTTP MCP → bridge → buildArgs → mcp.json → CODEX_HOME → CLAUDE_CONFIG_DIR → overlay file → env, and must not change.
- **Cleanup holder:** `cleanupStagedFiles` nulls each resource **before** awaiting its cleanup (idempotence under concurrent exit/failure). That code must move verbatim onto `resources.x`.
- **`failBeforeSpawn` returns `Promise<never>`.** The bound closure in the context must keep that type, or the callers' `return failBeforeSpawn(…)` narrowing breaks.

## REMAINING
- The line counts in §4-5 are estimates. Each step's `outline.mjs --check` result was not computed.
- §2 lists every module-level declaration, but the statement-level anchors for the module-level helpers that are over 100 lines were not checked. Per the outline there are none; the largest is `buildRunArgs` at 30.
- The internal design of the `events.ts` split is not in this doc (planned separately, see §1).
