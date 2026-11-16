> **Revision 2:** read `## Revision 2` at the end first; it overrides the sections above where they differ.

# 10 — Jini `packages/daemon/src/agent-executor/launch.ts` (replaces "agent-runtime launch.ts")

**Why this target:** `packages/agent-runtime/src/launch.ts` is 93 lines, as the brief says. But the hotspot in the 2026-11-11 list (Jini #2, #7, #29) is a *different* file, `packages/daemon/src/agent-executor/launch.ts`, and it is unsplit: **1,710 lines** (1,048 code), `createAgentExecutor` 1009-1710 (**429** code), nested `run` 1450-1707 (115). Deferred on `refactor/size-jini-chat-runtime`. I designed this one.

## 1. Current shape

| lines | content |
|---|---|
| 155-176 | `assessAgentExecutorCompatibility` |
| 261-286 | `resolveAgentRuntimeDeps` — the existing seam to `@jini-ai/agent-runtime` |
| 344-372 | `resolveDefAndStreamFormat`, `resolveImageDeliveryAndArgvBudget` |
| 447-479, 949-961 | `computeChildEnv`, `stagedChildEnvOptions` |
| 578-594, 750-786 | `buildAgentBuildArgsOptions`, `buildRunArgs` |
| 664-725, 807-833 | `resolveSystemPromptOverlayDelivery`, `prepareSystemPromptOverlayFileIfNeeded` |
| 872-891 | `spawnAgentChildProcess` (uses `@jini-ai/platform/command`, `/process`) |
| 1012-1034 | executor options/ports destructuring |
| 1046-1185 | `cleanupFilesystemTemp`, `failBeforeSpawn`, `enforceNativeToolPolicy`, `enforceFilesystemPaths`, `enforceFilesystemRuntime` (33) |
| 1091-1098, 1265-1312 | `sendUserMessage`, `wireRunInput` (36), `childLifecycleOptions` |
| 1101-1111, 1187-1263, 1428-1438 | `prepareRunContext`, `resolveRunOverlay`, `resolveRunLaunch`, `selectRunModel`, `bridgeProbeEntryForRun`, `prepareRunHttpMcp` |
| 1314-1425 | `dispatchAcpPrompt` (35), `dispatchPiPrompt` (30), `dispatchStdinPrompt`, `dispatchPrompt` |
| 1450-1707 | `run`: pipeline + `cleanupStagedFiles` (30), `releaseRuntimeLock`, `releaseStagedResources`, spawn-error branch, try/finally |

Top half: pure launch planning (already small functions — file-level split). Bottom half: one closure of 20 inner functions sharing the executor's ports and per-run staged state.

## 2. Target shape

```
packages/daemon/src/agent-executor/
  launch.ts                         createAgentExecutor (~40 code lines: build scope, return { run, sendUserMessage, … })   ~110
  launch/                           PLANNING — pure, no process, no fs writes except overlay file
    compatibility.ts                155-176 + types above it                                                              ~90
    runtime-deps.ts                 261-286 + its dep types (the ONLY file importing @jini-ai/agent-runtime)              ~170
    def-and-format.ts               344-372                                                                               ~60
    child-env.ts                    373-479, 949-961                                                                      ~140
    build-args.ts                   480-594, 726-786                                                                      ~200
    system-prompt-overlay.ts        595-725, 787-833                                                                      ~190
    spawn-child.ts                  834-891 (the ONLY file importing @jini-ai/platform/command|process)                   ~70
  run/                              EXECUTION — module-level functions taking a scope
    scope.ts                        ExecutorScope (ports + options, from 1012-1034), RunStage (per-run mutable state)     ~100
    pre-spawn-guards.ts             1046-1077, 1113-1185                                                                  ~170
    run-context.ts                  1101-1111, 1187-1263, 1428-1438                                                       ~150
    run-input.ts                    1091-1098, 1265-1312                                                                  ~100
    dispatch-prompt.ts              1314-1425                                                                             ~150
    staged-resources.ts             1532-1596 (cleanupStagedFiles, releaseRuntimeLock, releaseStagedResources)            ~100
    run.ts                          run({ scope }, input): prepare → guard → stage → spawn → wire → dispatch → finally    ~140
```

15 files, largest ~200. `launch.ts` keeps its path; the folder's `index.ts` (existing package entry) repoints the names it exports to their new files. Direction: `launch.ts → run/run.ts → run/* → launch/*`; `launch/*` never imports `run/*`.

```ts
export interface ExecutorScope { readonly options: AgentExecutorOptions; readonly ports: AgentExecutorPorts; readonly runtime: AgentRuntimeDeps }
export interface RunStage { stagedFiles: string[]; overlayFile?: string; runtimeLock?: RuntimeLock; claudeConfigDir?: string }  // mutated in place
export async function run({ scope }: { scope: ExecutorScope }, input: AgentRunInput): Promise<AgentRunHandle>
export function enforceFilesystemRuntime({ scope, context }: { scope: ExecutorScope; context: RunContext }, _options = {}): Promise<PreSpawnVerdict>
```

Technique = the one already used for `attachAcpSession` → `AcpRun` context on `refactor/size-jini-chat-runtime` (3bcc2a2a): inner functions hoisted, closure state made an explicit object passed by reference. `run` becomes a ≤50-line pipeline whose **try/finally and release order are copied exactly** (`releaseStagedResources` → `releaseRuntimeLock` in today's order; every early `failBeforeSpawn` return keeps its cleanup).

## 3. Step order

0. **Characterization (no source change):** (a) golden `argv` + sorted `env` keys from `buildRunArgs`/`computeChildEnv` for each agent def × {image delivery, overlay delivery} variant; (b) `run` transcripts with fake ports (spawn, fs, lock, lifecycle) logging every port call in order: success per dispatch kind (ACP, PI, stdin) · native-tool-policy refusal · filesystem-path refusal · spawn error · throw after staging (asserts cleanup order).
1. `launch/*` leaves, one file per commit (pure moves).
2. `run/scope.ts`; convert inner functions to take `scope` **in place** (still inside `launch.ts`, still nested callers) — one commit, behaviour-identical.
3. Hoist to `run/*` one file per commit: pre-spawn-guards → run-context → run-input → dispatch-prompt → staged-resources → run.
4. Shrink `createAgentExecutor`; remove the three `launch.ts` entries from `scripts/size-debt.json`.

Gate per commit: `tsc --noEmit` in `packages/daemon`, `npm --prefix packages/daemon run test` (39 test files in `agent-executor/__tests__`), step-0 goldens.

## 4. Risks

| risk | de-risk |
|---|---|
| resource leak or double release when the finally block is re-expressed | transcripts for the two failure-after-staging scenarios; copy order, do not restructure |
| per-run state shared between concurrent runs after hoisting (a `RunStage` created once per executor instead of once per run) | `RunStage` is created inside `run`; test: two overlapping fake runs, independent cleanup logs |
| env/argv drift (secrets, flag order) | golden argv/env |
| `events.ts` (1,398 lines, `wireChildLifecycle` 336) is the sibling monster and shares types | out of scope; `childLifecycleOptions` stays the only call into it |

Risk: **high** (process lifecycle, cleanup paths).

## 5. Interaction

- **Untangle R8** (daemon runtime, wave E; needs C5, C6) rewrites exactly this file's foreign imports (`LANES-files.tsv`: line 22 `@jini-ai/agent-runtime`, lines 55-56 `@jini-ai/platform/command|process`) into `AgentRuntimePort` and consumer-owned ports, and guards by blob. Gate C0 fails any **new** file with a non-base import. So: **run this design after R8 lands.** Then no new file carries a foreign import, and `runtime-deps.ts` / `spawn-child.ts` are simply where the ports are consumed. Running it before R8 needs the coordinator to re-key two `injection-debt.json` entries (count unchanged) — an owner call.
- The daemon → package rule (self + core + protocol) is satisfied only after R8; this split adds no import.
- Check for the other chat/daemon size run noted on `refactor/size-jini-chat-runtime` before starting.

## 6. Estimate

≈16 commits. Sonnet executor **≈380k tokens** (goldens + transcripts 90k; 15 files × 16k; scope conversion 50k).


## Revision 2 (2026-11-16, after the Codex judgment)

Re-verified at Jini `integ/wave-b-r2` (02edbb68): `packages/daemon/src/agent-executor/launch.ts` 1,710 lines, 87 functions, **22 exports**; `createAgentExecutor` (1009) is 429 code lines, `run` (1450) 115. **The file contains no `finally`.** Judge: "needs rework" (1 blocker, 4 majors). **5 accepted, 0 rebutted.** `run`'s body was not re-read statement by statement in this revision; the ownership table below is built from the judge's cited lines plus the anchors measured here (`releaseRuntimeLock()` 1594 before `cleanupStagedFiles()` 1595; `cleanupStagedFiles()` also at 1435). Step 0b turns it into a line-exact sheet before any move.

### R1. Cleanup is ownership transfer, not a finalizer (replaces every "copy the `try/finally`" sentence)

| path | who cleans | what | where today |
|---|---|---|---|
| startup failure before spawn is confirmed | `run` | `releaseStagedResources`: **release the runtime lock, then clean staged files** (order is behaviour) | 1593-1595; spawn confirmation `try/catch` 1690-1696 |
| child exit | exit handler | release the lock | 1685 |
| close | lifecycle handlers that were **given** the cleanup callbacks | staged files, HTTP MCP state, written MCP path | 1265-1292, 1314-1388 |
| handoff | handoff path | release the lock | 1703 |
| `run()` resolves normally | nobody | **nothing is deleted and the lock stays held** | — |

Per-run resources are typed handles `{ cleanup(): Promise<void> }`; a handle is **cleared before its cleanup is awaited** (as today) so it cannot be consumed twice. The extraction keeps one function, `transferRunCleanup(required)`, that hands the handles to the lifecycle handlers at the same point as today; no `try/finally` is introduced anywhere.

### R2. State: executor-owned vs per-run (replaces `ExecutorScope` / `RunStage`)

- `ExecutorState` (one per `createAgentExecutor` call): filesystem temps map (1040), live inputs and relays (1085-1086), and the state behind the exported `claimUserMessages` closure (1088). Created in the factory, passed to the runner; never module-level.
- `RunState` (one per `run`): resource handles with ownership markers, HTTP MCP state, written MCP path, the process-exit `AbortController` (1507-1595).
- `ExecutorScope` keeps options, ports, runtime (read-only).

### R3. Contract (replaces `run({ scope }, input): Promise<AgentRunHandle>`)

The returned executor's `run` keeps `AgentExecutor['run']` exactly as `contracts.ts` declares it (required run fields, optional settings, `Promise<void>`). Internally: `runAgent({ scope, state, request }, optional = {}): Promise<void>` where `request` is the caller's required object and `optional` the caller's settings. No `AgentRunHandle` type is created.

### R4. Leaf map by effect, complete (overrides §2's file list where they differ)

Step 0b lists all 22 exports and every declaration → one file, and each move commit updates `agent-executor/index.ts` (which re-exports from `./launch.js`, line 142) and direct importers. Corrections to §2: `selectAgentExecutorHostEnv` (212-223) → `host-env.ts` · process/misc dependency resolution (288-318) → `resolve-deps.ts` · prompt/log **staging** (402-423) is an effect → `stage-prompt-log.ts`, not `child-env.ts` · `computeChildEnv` (447-478) alone is the pure `child-env.ts` · settings preparation (728-736) and the definition's `buildArgs` call (765) can **write shared settings** (comment 1598-1604) → `prepare-command.ts` (effectful), not "pure planning" · command preparation and spawn confirmation (893-921) → `spawn-confirm.ts` · HTTP-MCP helpers (963-992) → `http-mcp.ts`. Targets: `createAgentExecutor` ≤50 (allocate `ExecutorState`, return the contract object), `runAgent` ≤50 (stage → prepare command → spawn + confirm → transfer cleanup), every file ≤500.

### R5. Tests — extend the existing pins (`npm --prefix packages/daemon run test`)

Existing: `split-parity.test.ts` (exact merged env values and unchanged-object identity 55-80; synchronous spawn 83-103), `launch-characterization.test.ts`, `launch-defaults-and-staging.test.ts`, `launch-relay-m1.unit.test.ts`, `http-mcp-launch.integration.test.ts`. Add, with fake process/fs ports: env **values and precedence** table (MCP config vs instructions vs staged homes vs overlay overrides); spawn-error **microtask race** — the error listener is attached in the same synchronous turn as spawn (854-866, 1666-1691): a fake child that emits `error` in the next microtask must be caught; **success-path retention** — after `run()` resolves, staged files exist and the lock is held; lock released on exit, on handoff, and on startup failure **before** staged-file cleanup (order asserted); close runs each cleanup once; two overlapping runs on one executor and two executor instances do not share temps, relays or claimed messages; relay/message operations after `run()` returned still work. Sorted env **keys** are no longer used as a pin.

### R6. Migration graph

0a tests · 0b symbol/export/state sheet · 1 pure leaves (`child-env`, `host-env`, `resolve-deps`) · 2 effect leaves (`stage-prompt-log`, `prepare-command`, `spawn-confirm`, `http-mcp`), each with its `index.ts` export line · 3 `ExecutorState`/`RunState` types introduced **in place** · 4 `transferRunCleanup` in place · 5 `runAgent` extracted · 6 factory slimmed. Prerequisite unchanged: untangle R8 (wave E) first, then revalidate every line number. `pnpm guard`, `pnpm typecheck` per commit.

### R7. Owner practices check

1 DI: process, fs and clock stay ports; state is passed, never module-level · 2: `(required, optional = {})` kept at the public boundary and inside · 3: two oversized functions get explicit targets (R4) · 4: files by effect class · 5: `index.ts` is the package's existing public entry and keeps pointing at real files; no shell at `launch.ts` once emptied — **conflict flagged:** revision 1 kept `launch.ts` as a small root because it is a public entry; it stays only as the home of `createAgentExecutor`, not as a re-export file · 6: the cleanup-order and `buildArgs` comments move with their code · 7: daemon imports stay inside its allowed set; no vendor code added to core · 8: fake ports; existing suites extended · 9: startup-failure errors keep their text; **flagged:** check during 0b whether spawn-confirmation errors carry a redacted details block — not verified here · 10: no silent change; R1 forbids the one that revision 1 would have introduced · 11: no new result model · 12: per-run cost unchanged (one staging, one lock); executor maps are bounded by live runs and cleared on close — to be asserted by the overlapping-runs test.

### R8. Estimate

≈18 commits, Sonnet **≈460k tokens** (was 380k). Risk: **high**. Opus review of the step-0 sheet and after step 4.

## Judge response

| # | sev | verdict | what changed / evidence |
|---|---|---|---|
| 1 | blocker | accepted | `grep -c finally launch.ts` = 0; lock release precedes file cleanup at 1594-1595. R1 replaces the fictional finalizer with the four ownership paths and a "resolve does not clean" test |
| 2 | major | accepted | R2 separates executor-owned and per-run state; overlapping-run and two-instance tests |
| 3 | major | accepted | 22 exports; R4 assigns the missing functions and classifies by effect; `index.ts` updated per move |
| 4 | major | accepted | R3 keeps `AgentExecutor['run']` and `Promise<void>`; no new handle type |
| 5 | major | accepted | Existing `split-parity.test.ts` and four more suites found in `__tests__`; R5 extends them with values, precedence, microtask race and retention |

Accepted 5 · rebutted 0 · blockers left 0.
