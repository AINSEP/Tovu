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
