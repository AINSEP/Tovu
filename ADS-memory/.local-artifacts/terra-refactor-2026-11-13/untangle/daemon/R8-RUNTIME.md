# R8: daemon runtime takes its implementations from the host (design, 2026-11-16)

Docs only. Read with `INDEX.md` and `R7-ROUTES.md`. Bases: Jini `integ/wave-b-r2` @ `02edbb68`, Tovu `integ/wave-b-r2` @ `65302ee5`.

**Revision 2 (2026-11-16, after the Codex judge).** The judge (`CODEX-JUDGE-r8-runtime.md`) returned *needs rework*: 1 blocker, 11 majors, 1 minor. Each finding was re-checked against the code; all 13 hold. §11 is the response table, §12 the corrected design. **Where §1–§10 and §12 disagree, §12 wins.** Superseded lines carry a *(rev 2)* marker.

**One-line result:** outside `src/http`, daemon reaches three other Jini packages through **27 import lines in 21 files**: 34 agent-runtime values, 9 platform values, 1 db value, and the rest types. The launcher already has an override seam for most of them (`resolveAgentRuntimeDeps`, `resolveProcessDeps`, `launch.ts:261-306`); each override falls back to the concrete import. R8 removes the fallbacks, so the host must pass the implementation, and moves the one Node adapter (`terminal.adapter.ts`) to the `server` preset.

**What R8 is not:** it does not split `launch.ts` (1,710 lines) or `events.ts` (1,398). §7 says which design owns that.

---

## 1. Inventory (verified; re-run command in §9)

### 1.1 Cross-package imports, outside `src/http`

`V` = value names, `T` = type-only names. Line = the `import` statement.

| File:line | From | Names |
|---|---|---|
| `agent-executor/launch.ts:22` | agent-runtime | **V (22):** `RuntimeSelectionError`, `agentCapabilities`, `planRun`, `resolveNativeToolPolicy`, `validateFilesystemLaunch`, `validateReadOnlyExtraDirs`, `bindRuntimeAgentDef`, `defaultRuntimeState`, `getRuntimeModelDiscoveryDeps`, `userToolchainBinDirs`, `applyAgentLaunchEnv`, `ensureAgentCapabilities`, `resolveModelForLaunch`, `getAgentDef`, `resolveAgentLaunch`, `attachAcpSession`, `attachPiRpcSession`, `checkPromptArgvBudget`, `checkWindowsCmdShimCommandLineBudget`, `checkWindowsDirectExeCommandLineBudget`, `prepareAgentLogFile`, `preparePromptFileForAgent`. **T (9):** `AgentRuntimeState`, `AgentLaunchResolution`, `ModelCatalogSnapshot`, `PreparedAgentLogFile`, `PreparedPromptFile`, `PromptAugmenter`, `RuntimeAgentDef`, `RuntimeBuildOptions`, `RuntimeContext` |
| `agent-executor/launch.ts:55` | platform/command | V `createCommandInvocation` |
| `agent-executor/launch.ts:56` | platform/process | V `listProcessSnapshots`, `stopProcesses` |
| `agent-executor/events.ts:24` | agent-runtime | V (5) `createClaudeStreamHandler`, `createJsonEventStreamHandler`, `createQoderStreamHandler`, `attachAcpSession`, `attachPiRpcSession`; T (5) |
| `agent-executor/events.ts:10` | agent-runtime | T `ModelCatalogSnapshot` |
| `agent-executor/events.ts:36` | platform/process | V `listProcessSnapshots`, `stopProcesses` |
| `agent-executor/contracts.ts:24` | agent-runtime | T (14), 10 of them `typeof <function>` (the override option types) |
| `agent-executor/contracts.ts:40,41` | platform/command, /process | T `typeof createCommandInvocation`, `typeof listProcessSnapshots` |
| `agent-executor/claude/filesystem.ts:2` | agent-runtime | V (3) `claudeFilesystemRuntimePaths`, `claudeFilesystemSettings`, `createClaudeFilesystemSupportProbe` |
| `agent-executor/model-receipts.ts:2` | agent-runtime | V `modelIdentityKind`; T `DiscoveredModel` |
| `agent-executor/event-translation.ts:5` | agent-runtime | V `normalizeAiUsage` |
| `agent-executor/antigravity/permissions.ts:5` | platform/fs | V (3) `backupOriginalOnce`, `withFileLock`, `writeFileAtomicAsync` |
| `session-coordination.ts:3` | agent-runtime | V `startupFailureMessage` (used at :110) |
| `ai-trace-lifecycle.ts:15` | agent-runtime | V `createAiTraceRecorder` (used at :75); T (4) |
| `terminal-session.ts:49` | platform | V `createTerminalService` (default at :213) |
| `terminal.adapter.ts:8` | platform | V `ensureSpawnHelperExecutable`, `spawnHelperCandidatePaths` |
| `store/event-log/sqlite.ts:25` | db/sqlite | V `openSqliteConnection` (used at :80) |
| 9 type-only lines | agent-runtime | `RuntimeAgentDef` in `image-prompt-delivery.ts:33`, `continuation/continuation-transport.ts:28`, `agent-executor/{http-mcp.ts:2, message-relay.ts:1, codex/home-staging.ts:10, claude/config-dir.ts:4}`; `RuntimeAgentDef`+`RuntimeLockHold` `handoff.ts:1`; `AcpMcpServerInput`+`RuntimeAgentDef` `mcp-bridge.ts:15`; `NativeCapabilities` `chat-settings.ts:2` |

**Totals outside http:** 27 lines, 21 files. agent-runtime values: 34 names in 7 files. platform values: 9 names in 5 files. db values: 1.

### 1.2 The same kind of edge inside `src/http` (files belong to R7; ports are specified here and in C6)

| File:line | From | Names | Port |
|---|---|---|---|
| `http/model-proxy.ts:85` | agent-runtime | V (5) `run{Anthropic,Azure,Google,Ollama,OpenAi}ToolTurn`; T (32) | C6 `ProviderToolTurnPort` |
| `http/xai.ts:122` | agent-runtime | V (13) OAuth PKCE functions and constants; T (6) | C6 `XaiOAuthPort` (or F1: the file leaves daemon) |
| `http/research-tavily.adapter.ts:2` | agent-runtime | V `validateBaseUrl` | C6 `BaseUrlGuardPort` |
| `http/agents.ts:20` | agent-runtime | T (3) | C6 type repoint to core |
| `http/attachments.ts:110` | platform/fs | V `writeJsonFileAtomicAsync` | C5 `AtomicFileWriterPort` |
| `http/host-tools.ts:22` | platform/command | V `createCommandInvocation` | C5 `CommandInvocationPort` |

R7's per-file recipe gains one step for these six files: "take the port as a **required** field of the route's `deps`; delete the import". They are in R7's pairs for `model-proxy`, `xai`, `research`, `agents`, `attachments`, `host-tools`. Estimate impact is in INDEX.

### 1.3 Node built-ins and vendor libraries (daemon is a Node package; B1 does not forbid these, practice 1 still applies to defaults)

| Dependency | Files:lines | What it does | R8 action |
|---|---|---|---|
| `node:child_process` | `agent-executor/launch.ts:12` (`spawn` default at :302, call at :881), `events.ts:16` (types), `contracts.ts:14` (types), `mcp-bridge-probe.ts:1` (`spawn` at :82), `http/host-tools.ts:20` | starts the agent CLI, the MCP bridge probe, an editor | `spawn` becomes a required port (`ProcessSpawnPort`, §2.2). Types stay (`ChildProcess` is Node vocabulary in a Node package). |
| `node:fs`, `node:fs/promises` | `launch.ts:15`, `mcp-bridge.ts:3`, `claude/{config-dir.ts:1, filesystem.ts:1, mcp-config.ts:1, subagent-start.ts:1}`, `codex/home-staging.ts:1`, `antigravity/permissions.ts:4`, `legacy-data-migration.ts:18` | stages prompt/config/overlay files, per-agent homes | **No port.** Each is a single-consumer, per-agent staging routine with `node:os`/`node:path` beside it; a file-system port here would have one implementation and mirror `node:fs` (hexagonal "bad port: mirrors an SDK"). Tests already use temp dirs. Flagged as an owner call (INDEX O-7). *(rev 2: superseded by §12.9; no longer called compliant)* |
| `node-pty` | `terminal.adapter.ts:7` (`nodePty.spawn` at :62) | real PTY | file moves to the preset (Q8) |
| `node:module` `createRequire` | `terminal.adapter.ts:6` | loads the optional peer | moves with it |
| `kysely` (types) | `store/agent-sessions/{sql.ts:3, sqlite.ts:189, pglite.ts:6, postgres.ts:6}`, `store/event-log/sqlite-kernel.ts:5` | `StorageKernel<Kysely<DB>, DB>` | not an R8 edge (C3 already repointed the kernel types to core). `kysely` stays a daemon dependency. **Conflict flagged** with the lane rule "no library types in Jini domain packages": INDEX O-8. |
| `better-sqlite3`, `pg`, `@electric-sql/pglite` | daemon `peerDependencies` only; no import in `src` | — | after R8 the SQLite opener is injected; remove `better-sqlite3` from peers if no `src` file names it (VERIFY with `rg`), keep `pg`/`pglite` only if a `store/*` entry still needs them |
| `process.env` / `process.*` | `launch.ts` (3), `contracts.ts` (3), `legacy-data-migration.ts` (2), `close-status.ts` (2), `codex/home-staging.ts` (2), `continuation/run-start-handler.ts`, `mcp-bridge-probe.ts`, `claude/{subagent-start,filesystem,config-dir}.ts`, `agent-env.ts` (1 each) | host env fallback, platform checks | `hostEnv` becomes required on `createAgentExecutor` (today: "host env falls back to the process env", `launch.ts:265`). The others are measured and listed at dispatch; any that is a silent default becomes a required option, any that is `process.platform` goes through the `platform` value C5 already threads to `CommandInvocationPort`. |
| timers | `events.ts` (SIGTERM→SIGKILL escalation), pi graceful-shutdown ms | process shutdown grace | keep; already parameterized (`piGracefulShutdownMs`). Tests use fake timers. *(rev 2: superseded by §12.6; C6 removes `piGracefulShutdownMs` from the executor)* |

### 1.4 Callers of the things R8 changes

| Function | Production callers | Tests |
|---|---|---|
| `createAgentExecutor` | Jini `packages/server/src/kernel-base.ts`; `examples/minimal-host/src/index.ts`; `examples/reference-web/src/{daemon,mcp-bridge}.ts`; Tovu `agent-daemon-scope.ts` (which documents a nested-copy hazard at :522-526) | Jini 15 files (`agent-executor.test.ts` is 7,228 lines), Tovu 1 *(rev 2: superseded by §12.4; Tovu desktop was missing; reference-web `mcp-bridge.ts` only names it in a comment)* |
| `createTerminalSessionManager` | `server` preset (`builtin-features.ts:416` region), `frontend-capability-tools.ts` (type) | `terminal-session.test.ts`, `terminal-optional-peer.test.ts` |
| `loadRealSpawnPty` (`@jini-ai/daemon/terminal`) | no importer found in Jini `packages/*` or Tovu outside daemon itself (`rg` at the bases) | 1 |
| `openSqliteEventLog` | Jini `packages/server/src/kernel-base.ts` only (verified) | — |
| `withAiTracing` | Jini `packages/server/src/kernel-base.ts`; Tovu `server/inbound/assistant/run-lifecycle-tracing.ts` (verified) | — |

Test coupling today: 35 daemon test files import `@jini-ai/agent-runtime`, 11 import `@jini-ai/db`, 2 `@jini-ai/platform`; 3 `vi.mock('node:child_process')`, 1 `vi.mock('@jini-ai/platform')`, 1 `vi.mock('node-pty')`, 1 `vi.mock('@jini-ai/db/kernel/pglite')`.

---

## 2. Ports

Rule used: a port lives in **core** only if C5/C6 already put it there (two or more consumers). A port with daemon as its only consumer lives in `packages/daemon/src/ports/` (B4). The host proves the match with `satisfies`.

### 2.1 Already designed elsewhere; R8 consumes them unchanged

| Port | Package / file | Status at `02edbb68` | Replaces |
|---|---|---|---|
| `AgentRuntimePort` (`defs`, `launch`, `filesystem`, `models`, `sessions`, `streams`, `failures`) | `daemon/src/ports/agent-runtime.ts`, subpath `@jini-ai/daemon/ports` (C6 §4, §4b, §11) | **not landed** | all 34 agent-runtime values outside http, incl. `startupFailureMessage` (`failures.startupMessage`) and `modelIdentityKind` (`models.identityKind`) |
| Session types (`AcpSessionController`, `PiRpcSession`, …) | `daemon/src/ports/agent-runtime-sessions.ts` (C6 §4c, restated byte for byte) | not landed | type imports in `events.ts`, `contracts.ts`, `mcp-bridge.ts` |
| `RuntimeAgentDef`, `NativeCapabilities`, `ModelCatalogSnapshot`, `AgentLaunchResolution`, … | `@jini-ai/core/contracts/agents` (C6 §2, `C6.repoint.tsv`) | not landed | the 9 type-only lines + the T names above |
| `createAgentRuntimeBindings({ runtime })` | agent-runtime (C6 §11.2), imports nothing from daemon | not landed | the body of `resolveAgentRuntimeDeps` (binds `runtimeState`, `env`, `appendPathDirs`) |
| `ProcessControlPort { listProcessSnapshots; stopProcesses; waitForProcessExit }`, `collectProcessTreePids` (pure) | `@jini-ai/core/contracts/runtime` (C5) | **landed** | `platform/process` values in `launch.ts:56`, `events.ts:36` *(rev 2: superseded by §12.2; platform functions do not fit the port without adapters)* |
| `CommandInvocationPort`, pure `planCommandInvocation` | `@jini-ai/core/contracts/runtime` (C5) | landed | `createCommandInvocation` in `launch.ts:55` *(rev 2: superseded by §12.1; no command port; the pure planner is called directly)* |
| `FileLockPort`, `AtomicFileWriterPort` | `@jini-ai/core/contracts/runtime` (C5) | landed | `withFileLock`, `writeFileAtomicAsync` in `antigravity/permissions.ts:5` |
| `PtySpawn`, `PtyProcess`, terminal service types | `@jini-ai/core/contracts/runtime/terminal.ts` (C5) | landed | — |
| `SqliteSyncOpener`, `SqliteDb` | `@jini-ai/core/contracts/storage` (C3) | landed | — |

*(rev 2)* `ai-trace`: C6 `sheets/C6.md:223` already rules that `createAiTraceRecorder` and `normalizeAiUsage` move to `core/contracts/ai-trace` as pure functions. There is one answer, it needs C6, and the recorder-factory port (row 4 below) is withdrawn.

### 2.2 New in R8 (daemon-local, one consumer each)

*(rev 2)* `ProcessSpawnPort` is no longer positional: §12.13.

*(rev 2)* `AgentExecutorRuntimePorts`, final shape: §12.1. (`backupOriginalOnce` is a member of core's `AtomicFileWriterPort`, `core/src/contracts/runtime/fs.ts:13`; that part stands.)

| # | New port | File | Signature | Replaces |
|---|---|---|---|---|
| 1 | `ProcessSpawnPort` | `ports/process.ts` | above | `nodeSpawn` defaults |
| 2 | `AgentExecutorRuntimePorts` | `ports/runtime.ts` | above | `resolveProcessDeps` defaults (`launch.ts:297-306`) |
| 3 | `EventLogConnectionOpener` | `store/event-log/ports.ts` | `(required: { filePath: string; open: SqliteSyncOpener }, optional?: { pragmas?: readonly string[] }) => SqliteDb` (the shape of `openSqliteConnection` as called at `sqlite.ts:80`; C3's worked name) | `@jini-ai/db/sqlite` import *(rev 2: superseded by §12.3; withdrawn: wrong callback shape, and no port is needed)* |
| 4 | `AiTraceRecorderFactory` (only if C6 keeps the recorder in agent-runtime) | `ports/ai-trace.ts` | `(required: { sink; runId; agentId }, optional?: AiTraceRecorderOptions) => AiTraceRecorder` (types from `core/contracts/ai-trace`) | `createAiTraceRecorder` at `ai-trace-lifecycle.ts:75` *(rev 2: superseded by §12.5; withdrawn)* |
| 5 | `TerminalService` (core `contracts/runtime/terminal.ts:81`, landed by C5; core also has `PtyPort { createTerminalService }` at :95) | — (core type) | `createTerminalSessionManager({ terminalService }, optional)`: `terminalService` moves from the optional `Pick` to **required** | `createTerminalService` default at `terminal-session.ts:213` *(rev 2: superseded by §12.10; the service is required, the loader stays opt-in)* |

### 2.3 Signature changes (exported functions)

```ts
// before: createAgentExecutor(options: CreateAgentExecutorOptions)   — 14 optional overrides with concrete defaults
// after:
export function createAgentExecutor(
  required: { readonly agentRuntime: AgentRuntimePort; readonly runtime: AgentExecutorRuntimePorts; readonly hostEnv: Readonly<Record<string, string | undefined>>; /* + today's truly required fields */ },
  optional: AgentExecutorOptional = {},   // piGracefulShutdownMs, bufferedStdoutMaxBytes, onCleanupFailure, codexDisablePlugins, … *(rev 2: superseded by §12.6)*
): AgentExecutor
```
- Deleted from the options type: `getAgentDef`, `resolveAgentLaunch`, `ensureAgentCapabilities`, `applyAgentLaunchEnv`, `attachAcpSession`, `attachPiRpcSession`, `preparePromptFileForAgent`, `prepareAgentLogFile`, `runtimeState`, `createCommandInvocation`, `spawn`, `listProcessSnapshots`, `collectProcessTreePids`, `stopProcesses`. (`collectProcessTreePids` is pure and in core; it is called directly, not injected.)
- Deleted functions: `resolveAgentRuntimeDeps`, `resolveProcessDeps`. `resolveMiscExecutorDeps` stays (two plain defaults, no concrete import).
- `AgentExecutor['run']`, `sendUserMessage`, `claimUserMessages` keep their contracts exactly (`contracts.ts:270`: required run fields + optional settings, `Promise<void>`).
- `createAgentExecutor` already takes two objects (verified, `launch.ts:1009`: required `Pick<…, "lifecycle">`, everything else optional; `hostEnv ?? process.env` at :1011). R8 moves `agentRuntime`, `runtime` and `hostEnv` into the required object and deletes the override fields from the optional one. Nothing else in the split changes.

`openSqliteEventLog({ file, open, clock, openConnection }, options = {})`; `withAiTracing({ lifecycle, sink[, createRecorder] }, options = {})`; `createTerminalSessionManager({ terminalService }, optional = {})`. *(rev 2: superseded by §12.3 and §12.10)*

---

## 3. Host wiring

### 3.1 Tovu (NEW `apps/website/src/server/runtime/composition/jini-daemon-runtime.ts`; `jini-agents.ts` is C6's)

*(rev 2)* The binding block that stood here could not typecheck (`processes`) and would have dropped every CLI argument (`command`). Bindings, with the behaviour check for each member: §12.2.

Use in `agent-daemon-scope.ts` (one statement): `createAgentExecutor({ agentRuntime: agentRuntimePort, runtime: daemonRuntimePorts, hostEnv, … }, { … })`. The hazard note at :522-526 (two copies of agent-runtime) is resolved by this change; the comment is rewritten to say why the port exists, not deleted.

### 3.2 Jini `server` preset (Q1 host-preset; receives the Q8 adapter)

- `packages/server/src/kernel-base.ts`: the same binding, built from the same platform/db/agent-runtime imports the preset already has. To avoid two hosts hand-copying 12 lines, the binding object is exported by the preset (`@jini-ai/server` → `nodeDaemonRuntimePorts`) and **Tovu imports it from the preset if and only if** the owner accepts a host importing a host-preset (INDEX O-9). Default in this design: each host writes its own (12 lines; no new edge). *(rev 2: superseded by §12.2)*
- **Q8 move:** `packages/daemon/src/terminal.adapter.ts` → `packages/server/src/adapters/node-pty.ts`, with `terminal-optional-peer.test.ts`. `loadRealSpawnPty` keeps its name and body. Daemon `package.json` loses the `./terminal` export + `jini.entries` line and the `node-pty` peer; `server` gains both. Changeset: daemon major-or-minor per the repo's pre-1.0 rule (a removed subpath is breaking). Repoint: no production importer found outside daemon; `daemon/src/index.ts` drops its line.
- `createTerminalSessionManager` in the preset: `terminalService: createTerminalService({ loadSpawnPty: () => loadRealSpawnPty({}) , … })` (platform + the moved adapter). *(rev 2: superseded by §12.10; this line silently enabled node-pty for every host)*

### 3.3 Examples

`examples/minimal-host/src/index.ts` and `examples/reference-web/src/{daemon,mcp-bridge}.ts` get the same binding inline. `minimal-host` "imports only `@jini-ai/*`" and is the neutrality gate: it binds `@jini-ai/agent-runtime` + `@jini-ai/platform`, which a host may do. *(rev 2: superseded by §12.4)*

---

## 4. Lifecycle and cleanup ownership (who creates, who releases)

The Codex review of size-design 10 found its cleanup model wrong (there is **no** `finally` in `run`; cleanup is handed to lifecycle handlers). R8 does not move any of this code, but it changes who supplies the mechanisms, so the ownership is written down and pinned first.

| Resource | Created by | Released by | Port involved | Must stay true |
|---|---|---|---|---|
| Agent child process | executor, `spawnAgentChildProcess` (`launch.ts:872-891`, `deps.spawn` at :881) | `events.ts:145-147` on cancel/abort: snapshot → tree pids → `stopProcesses`; SIGKILL fallback `events.ts:263`; normal exit by the child | `ProcessSpawnPort`, `ProcessControlPort` | Spawn and listener registration happen in **one synchronous turn** (`launch.ts:854-866`, `1666-1691`). A port that returns a promise, or a binding that wraps `spawn` in an async function, breaks the spawn-error race. The port type is synchronous for this reason. |
| Descendant processes | the agent | same tree stop | `ProcessControlPort` | `listProcessSnapshots` is O(live OS processes) per stop. It runs once per cancel, never per event (practice 12). |
| Runtime lock (`RuntimeLockHold`) | launch resolution (agent-runtime, via `AgentRuntimePort.launch`) | `releaseRuntimeLock()`: on child exit (`launch.ts:~1685`), on handoff (`~1703`), and inside `releaseStagedResources` **before** `cleanupStagedFiles` (`:1593-1595`) | `AgentRuntimePort` | Release happens exactly once; `run()` resolving must **not** release a lock a live child still needs. |
| Staged files (prompt file, log file, overlay, MCP json, per-agent homes) | `launch.ts` staging helpers + `claude/*`, `codex/*` | `cleanupStagedFiles`, passed as a callback into `wireRunInput` (`:1265`) and run by the lifecycle handlers; on pre-spawn failure via `deps.releaseStagedResources()` (`:781, 828, 847, 916`) and `failBeforeSpawn` (`:1066`) | `node:fs` direct | Fields are cleared before awaiting cleanup so a second call is a no-op. |
| Filesystem temp dirs | executor-instance map `filesystemTemps` (`:1040`) | `cleanupFilesystemTemp({ runId })` (`:1046`) | — | Keyed per run; two executors never share the map. |
| Live inputs / relays | executor-instance maps (`:1085-1086`) | on child close (`events.ts:331` `relay.close()`) | — | `sendUserMessage`/`claimUserMessages` work after `run()` has returned. |
| Process-exit abort controller | per run (`:1582`) | aborted on child exit | — | — |
| ACP / PI-RPC session | `AgentRuntimePort.sessions.attach*` | session controller's own close, driven by `events.ts`; PI grace `piGracefulShutdownMs` | `AgentRuntimePort` | the grace value still reaches `attachPiRpc` (`launch.ts:283-285` binds it today; after R8 daemon passes it in `optional`). *(rev 2: superseded by §12.6)* |
| SQLite event-log connection | `openSqliteEventLog` (`store/event-log/sqlite.ts:73`) through the injected opener | the returned log's `close()` (idempotent, `:86-88`); on setup failure the `catch` closes it (`:89-92`) | `EventLogConnectionOpener` | **Opened = owned.** `createSqliteEventLog({ db })` borrows and never closes. The host that called `open…` calls `close()` at shutdown. |
| Kernel-backed stores (`agent-sessions/*`, `event-log/sqlite-kernel.ts`) | host builds the `StorageKernel` | host | — | daemon never closes a kernel it was handed. |
| PTY processes | `TerminalService` (platform) via `PtySpawn` | `TerminalSessionManager.kill`, `shutdownActive({ graceMs })` (`terminal-session.ts:336`) | `TerminalServicePort`, `PtySpawn` | the **host** calls `shutdownActive` on stop (preset: its `stop()`); daemon never installs a process signal handler. |
| File lock on a user config file | `withFileLock` in `antigravity/permissions.ts` | released when the callback settles | `FileLockPort` | lock → backup once → atomic write order is unchanged. |
| AI trace recorder | `withAiTracing`, one per run (`ai-trace-lifecycle.ts:75`) | on run outcome | recorder factory | exactly one outcome per run. |

Nothing in this table changes owner in R8 except: the **host** now also owns constructing the process/command/fs/PTY/SQLite implementations. No port has a `dispose()`: none of the bound implementations holds state (functions over the OS), so there is nothing for the host to shut down beyond what it shuts down today.

---

## 5. Tests

### 5.1 Phase 0 characterization (before any source change; extend existing suites, do not start new ones)

`agent-executor/__tests__/split-parity.test.ts` already pins exact merged env values + object identity (`:55-80`) and synchronous spawn (`:83-103`). Add, through the **existing override options** (which is what makes these tests survive the change: only the way the fakes are passed changes): *(rev 2: superseded by §12.7; three cases needed seams that do not exist yet)*

| # | Case | Asserts (can fail on) |
|---|---|---|
| R1 | Spawn error race | fake `spawn` returns a child that emits `error` on the next tick → run fails with the startup error, staged files released, lock released once. A variant with a microtask inserted between spawn and listener registration must make this test fail (prove it once, then remove the variant). |
| R2 | `run()` resolves while the child lives | no staged file deleted, lock **not** released, `sendUserMessage` still delivers. Then child exits → lock released exactly once, cleanup ran exactly once. |
| R3 | Handoff path | lock released at handoff, not again at exit. |
| R4 | Each pre-spawn refusal (native-tool policy, filesystem path, filesystem runtime, prompt budget) | error code + `releaseStagedResources` called once + `spawn` **never** called. One case per refusal (AP8). *(rev 2: superseded by §12.7)* |
| R5 | Cancel | `listProcessSnapshots` called once, `stopProcesses` receives the tree pids of the fake snapshot (3 processes, the child in the middle), SIGKILL fallback when `stopProcesses` rejects; no pending timers after (AP10). |
| R6 | Failing ports (AP11) | each of `spawn`, `listProcessSnapshots`, `stopProcesses`, `command`, `fileLock`, `writer` (incl. `backupOriginalOnce`), `attachAcp`: throws an `Error`, throws a non-`Error`, rejects → the documented outcome (typed executor error or `onCleanupFailure` report), never an unhandled rejection. *(rev 2: superseded by §12.7)* |
| R7 | Two executors, overlapping runs | independent temp maps, relays, cleanup logs. |
| R8 | argv/env goldens per agent def | exact argv array and exact env **values** for a pinned host env (not sorted keys). |
| R9 | Event log | `openSqliteEventLog` with a fake opener: pragmas requested = `['journal_mode = WAL']`; setup failure closes the db and rethrows the setup error; `close()` twice closes once. Borrowed `createSqliteEventLog` never closes. |
| R10 | Terminal manager | with a fake `TerminalService`: create/kill/attach/shutdown pass through; `shutdownActive` forwards `graceMs`. Existing `terminal-session.test.ts` keeps its cases. |
| R11 | Antigravity permissions | a fake `fileLock` and `writer` (incl. its `backupOriginalOnce`) record call order: lock → backup → write; a write failure leaves the backup and releases the lock. *(rev 2: superseded by §12.7)* |
| R12 | AI trace | one recorder per run id; outcome recorded once on success, failure and cancel. |

Clock, UUIDs, pids and platform are injected or pinned. The real-CLI tests (`claude-bash-sandbox.live.test.ts`, `*-acp.integration.test.ts`) are not characterization; they move to `packages/integration-tests` with Q5's lane, not here.

### 5.2 Fakes (interfaces only)

| Fake | Where | Shape |
|---|---|---|
| `fakeAgentRuntimePort()` | `daemon/src/ports/__tests__/agent-runtime-port.fake.ts` (C6 §7 creates it; R8 uses and extends it) | every member a recording function with a sensible default def |
| `fakeProcessControl({ snapshots })`, `fakeSpawn()` → `{ spawn, children }` with a scriptable `FakeChild` (`EventEmitter` + `pid`, `stdin`, `stdout`, `stderr`, `kill`) | `daemon/src/ports/__tests__/fakes/process.ts` | replaces 3 × `vi.mock('node:child_process')` |
| `fakeRuntimePorts(overrides)` | same folder | builds a full `AgentExecutorRuntimePorts` from the fakes; in-memory `fileLock` (runs the callback), recording `writer` |
| `fakeEventLogOpener()` | `store/event-log/__tests__/fakes.ts` | returns a `SqliteDb` test double **or** delegates to `@jini-ai/db/testing`'s real in-memory driver for SQL-level suites (Q5 allows `/testing`; GAPS §4.3 plans that entry) *(rev 2: superseded by §12.11; no real driver behind a fake)* |
| `fakeTerminalService()` | `daemon/src/__tests__/fakes/terminal-service.ts` | replaces `vi.mock('@jini-ai/platform')` and `vi.mock('node-pty')` |

If core ships `core/contracts/runtime/testing` fakes for `ProcessControlPort`/`FileLockPort` (DESIGN §4 says core may), use those and write only the daemon-specific ones. VERIFY before writing (`ls packages/core/src/contracts/runtime`).

Each fake that stands in for a contract gets one broken-adapter self-check (AP12): e.g. a `fakeProcessControl` whose `stopProcesses` ignores its pids must make R5 fail.

After R8 the 35 daemon test files that import `@jini-ai/agent-runtime` are in three classes; the lane reports the count of each: (a) only needed a def or a type → use the fake / core type; (b) genuinely test daemon against the real runtime → integration, move with Q5's lane (not R8); (c) used agent-runtime as a convenient real implementation of an override → switch to the fake. R8 converts (a) and (c) for the files it touches and leaves (b) listed, untouched. **No assertion is removed to make a file fit.** *(rev 2: superseded by §12.11; affected tests change in the same commit)*

---

## 6. Migration steps (each commit compiles and passes; Jini first, then the paired Tovu commit)

| Step | Content | Files | Notes |
|---|---|---|---|
| — | *(rev 2)* The step table and the R8a/R8b split are replaced by §12.5. | | |

`launch.ts` and `events.ts` are already far over the 500-line limit and several functions inside them are over 50 lines. R8 only **deletes** lines there (imports, two resolver functions, option fields) and renames call receivers (`deps.getAgentDef(x)` → `agentRuntime.defs.get(x)`). It adds no function to either file. If a call-site rewrite would push any function's complexity up (e.g. an inline `options.codexDisablePlugins ? … : …` that `resolveAgentRuntimeDeps` used to hide), the logic goes into C6's `createAgentRuntimeBindings`, which is where C6 §11 already puts the codex binding.

**Rollback:** each step reverts alone. Step 3's move reverts as a move.

---

## 7. Who owns the launcher: R8 or size-design 10

Two designs touch `agent-executor/launch.ts`. **R8 owns its dependencies; size-design 10 owns its shape, and runs after R8.**

| Question | Owner | Why |
|---|---|---|
| Which packages `launch.ts` may import; what the ports are; who binds them | **R8** (+ C6 for `AgentRuntimePort`) | It is the untangle lane; lesson 10: untangle lanes that touch a file are prerequisites. Size-10's own §5 says "run this design after R8 lands". |
| Deleting `resolveAgentRuntimeDeps` / `resolveProcessDeps` | **R8** | They exist only to supply defaults. Size-10's planned `launch/runtime-deps.ts` ("the ONLY file importing `@jini-ai/agent-runtime`") and `launch/spawn-child.ts` ("the ONLY file importing `@jini-ai/platform`") **must be dropped from that design**: after R8 no file imports either. *(rev 2: superseded by §12.12; `spawn-child.ts` is **kept**)* |
| Splitting the 1,710 lines into files; hoisting the 20 closures; `ExecutorScope` / per-run state | **size-design 10, reworked** | The Codex judge returned it "needs rework" (1 blocker, 4 majors). Its rework must start from the post-R8 file and from §4's ownership table here (the judge's blocker was exactly the cleanup model). |
| Characterization tests for cleanup, spawn race, overlapping runs | **R8 Phase 0** writes them (§5.1 R1–R8); size-10 reuses them unchanged | One suite, written once, before either change. |
| `scripts/size-debt.json` entries for `launch.ts` | size-design 10 | R8 lowers line counts but does not clear the entries; path-keyed debt does not move in R8 because no code moves. |

Reconciliation edits owed to `size-designs/10-…md` (not made here; that branch is not this run's to push): delete `runtime-deps.ts` and `spawn-child.ts` from §2; replace `ExecutorScope.runtime: AgentRuntimeDeps` with the two ports; mark R8 as a hard prerequisite; adopt §4 here as the cleanup model. *(rev 2: superseded by §12.12)*

---

## 8. Owner practices, checked

| # | Practice | Status |
|---|---|---|
| 1 | DI, no concrete reach | All 44 cross-package values become host-bound ports. `spawn` default and `hostEnv` → `process.env` fallback removed. **Not ported, flagged:** direct `node:fs`/`node:os` in staging helpers (O-7); remaining `process.*` reads are listed and converted or justified at dispatch. |
| 2 | `(required, optional = {})` | New/changed exported functions follow it. Exception: `ProcessSpawnPort` is positional (the `spawn` shape; lane brief's runtime-port exception). *(rev 2: superseded by §12.13; no positional exception)* |
| 3 | ≤ 50 lines / complexity ≤ 10 | No function added to `launch.ts`/`events.ts`; new files are type files and ≤ 15-line bindings. Pre-existing breaches there are size-10's. |
| 4 | Feature slicing | `ports/` holds one port family per file. |
| 5 | No shells | Options are deleted, not deprecated. `./terminal` subpath deleted, not forwarded. `daemon/src/index.ts` line for the adapter deleted. |
| 6 | "Why" comments | Move: the `resolveAgentRuntimeDeps` doc's content about binding state/env goes to `createAgentRuntimeBindings`; the `waitForSpawnOrError` and synchronous-spawn comments stay in place; the Tovu nested-copy note is rewritten. |
| 7 | Boundaries | After R7 + R8: daemon `dependencies` = core, protocol, `smol-toml`, `kysely` (O-8). No `express`, http-kit, agent-runtime, platform, db. `terminal.adapter.ts` in the preset. |
| 8 | Fakes of interfaces | §5.2. Removes 6 `vi.mock` of other packages / Node modules. |
| 9 | Errors | Port failures surface as today's typed executor errors or `onCleanupFailure` reports (R6 pins it). No new `catch {}`. |
| 10 | No new disables / silent changes | **One deliberate, visible change:** hosts that relied on defaults must now pass ports; that is a compile error, not a silent one. |
| 11 | Smallest change, reuse | Reuses C5's landed ports, C6's port and bindings, C3's opener name, the existing override seam and `split-parity` suite. Three new type files. No fs port invented. |
| 12 | Hot-path cost | No per-event work added. `listProcessSnapshots` stays once per cancel. Port calls are direct function references (no wrapper objects per call). |

## 9. Re-run the inventory

```bash
cd packages/daemon/src
rg -n "from '@jini-ai/(agent-runtime|platform|db)[^']*'" --glob '!**/__tests__/**' --glob '!**/*.test.ts' -g '!http/**' | wc -l   # 27 (multi-line imports count once, at the `from` line)
rg -n "from '(node:child_process|node-pty|kysely|better-sqlite3|pg)'" --glob '!**/__tests__/**'
rg -n "\?\? (nodeSpawn|getAgentDef|attachAcpSession|createCommandInvocation|listProcessSnapshots|prepare\w+)" agent-executor/launch.ts      # the defaults R8 deletes
rg -c "process\.(env|platform|pid|cwd)" --glob '!**/__tests__/**' | sort -t: -k2 -nr
```

## 10. STOP conditions

- C6 is not landed, or `satisfies AgentRuntimePort` needs a cast (R8b only; R8a proceeds).
- Phase 0 is not green on the unmodified tree, or R1 cannot be made to fail by inserting an `await` before listener registration.
- A port would have to return a promise where the code today is synchronous (`spawn`, `CommandInvocationPort`).
- `createTerminalService` or `openSqliteConnection` has a signature that cannot be restated without importing a platform/db type.
- Removing a default changes what a **test** observes other than "must now pass the fake".
- Any function in a touched file gains lines or complexity.

---

## Judge response

`#` = finding number in `CODEX-JUDGE-r8-runtime.md`. Every finding was re-read against Jini `02edbb68`, Tovu `65302ee5`, the C5/C6 sheets and size-design 10 revision 2. **13 accepted, 0 rebutted.** Finding 9 is accepted with a narrower fix than the judge proposes, because the owner has since scheduled lane K.

| # | Sev. | Verdict | What I checked | What changed |
|---|---|---|---|---|
| 1 | Blocker | **Accepted** | Core `CommandInvocationPort` (`core/src/contracts/runtime/command.ts:86-89`) takes `args` in the **second** object. Platform `createCommandInvocation` (`platform/src/command.ts:27`) destructures `args` from the **first** and names its second parameter `_options`. `command: createCommandInvocation` typechecks and returns `args: []` for every call. | No command port. Daemon calls core's pure `planCommandInvocation` with two host values (§12.1). A P0 test asserts non-empty args reach `spawn`. |
| 2 | Major | **Accepted** | Core `process.ts:49-50`: `stopProcesses({ pids })`, `waitForProcessExit({ pid }, { timeoutMs })`. Platform `process.ts:570`, `:292`: `stopProcesses(pids[])`, `waitForProcessExit(pid, timeoutMs)`. | C5's three adapters are reused (§12.2), with a table of shape checks per member. |
| 3 | Major | **Accepted** | `db/src/sqlite/open.ts:63-73` calls `required.open({ filePath }, {})`. Daemon bridges to core's `(file, options)` at `store/event-log/sqlite.ts:80-83` and captures the handle before pragmas run. | The opener port is withdrawn. Daemon does the two lines itself (§12.3). Pragma-failure test added. |
| 4 | Major | **Accepted** | Tovu `apps/desktop/src/desktop-agent.ts:276` calls the executor and passes the options R8 deletes; its `createAgentExecutor?` injection type is `Parameters<typeof createAgentExecutor>` (`:103`). `agent-daemon-scope.ts:1622` and daemon `events.ts:757` call `probeMcpBridge`. `examples/reference-web/src/mcp-bridge.ts:3` is a comment. | §12.4: five production executor sites, two probe sites, all in the commit that changes their signature. |
| 5 | Major | **Accepted** | `packages/daemon/src/ports/` does not exist and `./ports` is not exported. `sheets/C6.md:223` moves both AI-trace functions to core. Tovu has no `jini-runtime-ports.ts`. | §12.5: every step re-checked against what is landed; step 7 moves to R8b; R8a creates the folder, the export line and the bindings itself. |
| 6 | Major | **Accepted** | `launch.ts:274`, `:280-282`; `sheets/C6.md:363` (codex) and `:437` (ruling c, pi) remove both options from `createAgentExecutor`. | §12.6: both options gone; lifecycle row corrected. |
| 7 | Major | **Accepted** | `antigravity/permissions.ts:49` calls the imported lock and writer; no injection. `contracts.ts:565` has no lock/writer option. Native-policy refusal (`launch.ts:1120-1126`) runs before `releaseStagedResources` exists (`:1593`); `failBeforeSpawn` (`:1066`) does not call it. | §12.7: P0 uses only seams that exist and asserts effects that happen on each path. Interface-fake tests land with the step that adds the interface. |
| 8 | Major | **Accepted** | `selectAgentExecutorHostEnv` (`launch.ts:212-222`) falls back to `defaultRuntimeState`; `appendFlagOverlay` (`:602-613`) reads `state?.capabilities ?? agentCapabilities`; `resolveSystemPromptOverlayDelivery` takes `{ state }` (`:672`); `host-env-ports.test.ts` calls them. | §12.8: replacement signatures on C6's `hostEnvNames()` and `capabilities({ defId })`, read at execution time. |
| 9 | Major | **Accepted, narrower fix** | `launch.ts:1049`, `:1157`, `claude/filesystem.ts:10` are real effects on private directories and staged secrets. O-7 was a recommendation, not an approval. | R8 no longer claims practice 1 for them. Per-CLI staging is assigned to lane K (owner decision), where it sits behind `AgentRuntimePort`. Only the launcher's own two effects need an answer (O-7, still open). §12.9. |
| 10 | Major | **Accepted** | `builtin-features.ts:400-402` forwards a loader only when the host gives one; `terminal-session.ts:210-216` installs an inert loader that rejects; test at `terminal-session.test.ts:222`. | §12.10: loader stays opt-in; tuning options listed with their new home; four tests. |
| 11 | Major | **Accepted** | `launch-defaults-and-staging.test.ts:80, :95`; `server/src/__tests__/builtin-features.terminal-lifecycle.test.ts:16-21` mocks daemon. | §12.11: affected tests change in the same commit; no real implementation behind a "fake". |
| 12 | Major | **Accepted** | `launch.ts:872-891` is real synchronous spawn/result behaviour. Size-design 10 revision 2 (`:129`) already names R8 as a prerequisite and keeps the spawn leaf. | §12.12: `spawn-child.ts` kept; only default resolution is deleted. |
| 13 | Minor | **Accepted** | `launch.ts:856-866`: the invariant is "no yield before listeners", which an object-argument adapter that returns the child directly keeps. | §12.13. |

---

## 12. Revision 2 design (supersedes the text it names)

### 12.1 Runtime ports, final shape

```ts
// packages/daemon/src/ports/runtime.ts
import type { AtomicFileWriterPort, FileLockPort, ProcessControlPort, RuntimePlatform } from '@jini-ai/core/contracts/runtime';
import type { ProcessSpawnPort } from './process.js';

/** The OS-facing things one agent executor needs. All required: daemon has no default for any of them. */
export interface AgentExecutorRuntimePorts {
  readonly spawn: ProcessSpawnPort;
  readonly processes: ProcessControlPort;
  readonly fileLock: FileLockPort;
  readonly writer: AtomicFileWriterPort;
  /** Inputs of core's pure `planCommandInvocation`. The host states them; daemon never reads `process.platform` or the ambient `ComSpec`. */
  readonly commandShell: { readonly platform: RuntimePlatform; readonly fallbackComSpec: string | undefined };
}
```

**Why there is no command port.** The planner is a pure function that already lives in core (`planCommandInvocation`); a port in front of it has one implementation and, as finding 1 shows, one more place to bind it wrong. Daemon calls it directly:

```ts
planCommandInvocation({ command, platform: runtime.commandShell.platform, env: childEnv }, { args, fallbackComSpec: runtime.commandShell.fallbackComSpec })
```
Hosts bind `{ platform: process.platform, fallbackComSpec: process.env.ComSpec }`, which is exactly what platform's wrapper read (`command.ts:28, 32-33`), whatever `hostEnv` the host passes. The `createCommandInvocation` override option is deleted; tests that injected it assert on what the spawn fake received, on a pinned `platform` (this also lets a Linux run cover the win32 branch, which the ambient default never did). `http/host-tools.ts` (R7's file) takes the same two values in its `deps`.

### 12.2 Bindings: behaviour checked member by member

"`satisfies` passes" is not the check. For every member: where each argument sits, array or object, positional or object, sync or async.

| Port member (core) | Platform function | Same call shape? | Binding |
|---|---|---|---|
| `processes.listProcessSnapshots(required?, optional?)` | `listProcessSnapshots({}, options)` | yes, both two-object | C5: `(_r = {}, o = {}) => listProcessSnapshots({}, o)` |
| `processes.stopProcesses({ pids })`, readonly array | `stopProcesses(pids: Array<…>)`, positional, mutable | **no** | C5: `({ pids }) => stopProcesses([...pids])` (the copy matters: the port's array is readonly) |
| `processes.waitForProcessExit({ pid }, { timeoutMs })` | `waitForProcessExit(pid, timeoutMs = 5000)` | **no** | C5: `({ pid }, { timeoutMs } = {}) => waitForProcessExit(pid, timeoutMs)`; an absent `timeoutMs` must reach platform as `undefined` so its 5000 default applies |
| `fileLock.withFileLock({ lockPath, run })` | same object shape (`antigravity/permissions.ts:49` calls it so today) | yes | `{ withFileLock }` |
| `writer.writeText({ filePath, content })` | `writeFileAtomicAsync({ filePath, content })` | yes; **name differs** | `writeText: writeFileAtomicAsync` |
| `writer.writeJson({ filePath, data }, { trailingNewline })` | `writeJsonFileAtomicAsync` | VERIFY the field name `data` at dispatch | `writeJson: writeJsonFileAtomicAsync` |
| `writer.backupOriginalOnce({ filePath })` | same | yes | direct |
| `spawn({ command, args }, options)` | `node:child_process.spawn(command, args, options)` | **no** (positional) | §12.13, synchronous |
| `commandShell` | values | — | §12.1 |

Daemon already carries two internal adapters of the same kind (`launch.ts:303-304`: `collectProcessTreePids`, `stopProcesses`); they are deleted with `resolveProcessDeps` because the port now has the object shape itself.

**Where the adapters live.** C5's worked block is a design, not code: `apps/website/src/server/runtime/composition/jini-runtime-ports.ts` does not exist at `65302ee5`. Five hosts need the same three adapters (Tovu website, Tovu desktop, the `server` preset, two examples), and one of them stops processes. Recommended (INDEX O-9, revised): platform exports them once, `@jini-ai/platform/runtime-ports` → `nodeRuntimePorts = { processes, fileLock, writer } satisfies …`, with C5's planned `runtime-ports.typecheck.ts` beside it. Platform implements core's ports, so the edge is platform → core, which already exists. If the answer is no, each host copies C5's block and R8a step 1 creates Tovu's file.

**Binding test (must fail on the blocker class).** In platform, against fakes of its own three functions passed as arguments to the adapter builder: `stopProcesses({ pids: [3, 2, 1] })` reaches the function as a **new** array `[3, 2, 1]`; `waitForProcessExit({ pid: 7 })` reaches it as `(7, undefined)`; with `{ timeoutMs: 10 }` as `(7, 10)`. In daemon, P0: an agent launched with args `['--mode', 'plan', 'a b', '50%']` → the spawn fake receives exactly those args (today, and after). On pinned `win32` with a `.cmd` binary: quoted, percent-escaped, `windowsVerbatimArguments: true`; an arg containing a newline is refused. A binding that drops `args` fails the first assertion.

### 12.3 Event log: no opener port

`openSqliteConnection` does three things: an optional recover hook daemon never passes, `open({ filePath }, {})`, then one `pragma` per entry. Daemon already holds the host's `SqliteSyncOpener` (`(file, options)`) and core's `SqliteDb` has `pragma` (`contracts/storage/sqlite.ts:25`). So step 2 is:

```ts
db = input.open(input.file, {});          // handle captured before anything can throw, as at sqlite.ts:81 today
db.pragma('journal_mode = WAL');
```
The `@jini-ai/db/sqlite` import goes; nothing is injected that was not injected before; `openSqliteEventLog`'s signature does **not** change, so its one caller (`packages/server/src/kernel-base.ts`) is not edited. P0 (the seam exists today, an interface fake of `SqliteSyncOpener`): `open` called once with `(file, {})`; the pragma runs before any statement is prepared; **the pragma throws → `close()` called once and the original error is rethrown**; schema failure → same; `close()` twice closes once; a borrowed `createSqliteEventLog({ db })` never closes. Break that must fail it: assign `db` after the pragma.

### 12.4 Every consumer of a changed signature

| Changed | Production callers | In which step |
|---|---|---|
| `createAgentExecutor` | Jini `packages/server/src/kernel-base.ts:192`; `examples/minimal-host/src/index.ts:71`; `examples/reference-web/src/daemon.ts:532`; Tovu `agent-daemon-scope.ts:520`; **Tovu `apps/desktop/src/desktop-agent.ts:276`** | 5 (process ports) and 6 (runtime port); each site twice |
| desktop's injected factory type `createAgentExecutor?: (...args: Parameters<typeof createAgentExecutor>) => …` (`:103`, cast at `:297`) | desktop tests that pass a fake factory | follows the signature; the cast at `:297` is removed, not widened |
| `probeMcpBridge({ entry, spawn, hostEnv }, { baseEnv, timeoutMs, now })`: `spawn` and `hostEnv` become required | daemon `events.ts:757` (`ctx.probeMcpBridge`, bound once in `launch.ts` from `runtime.spawn` and `hostEnv`); **Tovu `agent-daemon-scope.ts:1622`** | 5 |
| `createTerminalSessionManager` | `server` preset `builtin-features.ts:400` | 3 |
| `ensureAntigravityMcpPermission` | `mcp-bridge.ts:258` (already an injected dep at `:237`) | 4 |

The probe keeps, and P0 pins through its existing optional `spawn`: `JINI_DAEMON_TOKEN` removed from the child env, `JINI_RUN_ID = 'bridge-probe'`, the 2000-byte stderr tail, a result (never a rejection) on spawn error, exit and timeout, and the child reaped on every path.

### 12.5 Steps, and what R8a can really start now

Each prerequisite was checked on the base, not on a sheet.

| Step | Content | Needs | Landed at `02edbb68` / `65302ee5`? | Start now? |
|---|---|---|---|---|
| 0 | Phase 0 tests (§12.7), no source change | nothing | — | **yes** |
| 1 | `packages/daemon/src/ports/{process,runtime}.ts`, the `./ports` export line, interface fakes with self-checks, the bindings (§12.2) | C5 port types | port types **yes**. `ports/` folder and export **no** (C6 was to create them): R8a creates them, the coordinator applies the manifest line, C6 later adds files beside. Bindings **no**: R8a writes them. | **yes** |
| 2 | Event log, §12.3 | C3 `SqliteSyncOpener`, `SqliteDb.pragma` | **yes** | **yes** |
| 3 | Terminal, §12.10 (move commit, then required-service commit) | C5 terminal types, Q8, `packages/server` | **yes** | **yes** |
| 4 | Antigravity permissions take `fileLock`/`writer`; delete the forwarder file `agent-executor/antigravity-permissions.ts` (a one-line re-export) and repoint its importers | C5 `FileLockPort`, `AtomicFileWriterPort`; step 1 | **yes** | **yes** |
| 5 | Process ports required; `planCommandInvocation` direct; probe; all five hosts; affected tests | C5 `ProcessControlPort`, core planner; step 1 | **yes** | **yes**, but it edits `launch.ts` and `contracts.ts`, which C6 also edits: the coordinator runs them one after the other |
| 6 | Agent runtime port (6a `launch.ts` + hosts, 6b `events.ts` + small files) + §12.8 | C6 | **no** | no |
| 7 | AI trace: import both functions from `core/contracts/ai-trace` | C6 (it moves them) | **no** | no |
| 8 | Type repoints | C6 | no | no |
| 9 | Manifests, debt keys | 2–8 and R7's four pairs | — | last |

**R8a = steps 0–5. R8b = steps 6–9.** The first version's "steps 0–5, 7 can start now" was wrong on three points: step 7 needs C6; the `./ports` subpath did not exist; the Tovu binding it imported did not exist. With those assigned as above, 0–5 have no unlanded prerequisite. `@jini-ai/db` and `@jini-ai/platform` leave daemon's `dependencies` only in step 9, after `rg` shows no `src` importer (tests that still use them keep a dev dependency until Q5's lane).

### 12.6 Codex and Pi options follow C6 (finding 6)

`createAgentExecutor` has neither `codexDisablePlugins` nor `piGracefulShutdownMs` after C6 (`sheets/C6.md:363`, ruling (c) at `:437`). Both belong to the bound runtime's definition options (`createNativeAgentRuntime({ … }, { codex, pi })`); the port's `defs.bind` and PI session member close over them. R8 adds no wrapper that passes them again. Precedence is pinned where the binding is built (agent-runtime, C6): explicit option, then env (`PI_GRACEFUL_SHUTDOWN_MS`), then 5000. Lifecycle table row "ACP / PI-RPC session": the grace is applied inside the port's session member; daemon passes nothing.

### 12.7 Phase 0, re-scoped to what can run green today (finding 7)

Rule: a P0 case may use only a seam that exists at `02edbb68`, and asserts what that path really does.

| # | Case | Seam today | Asserts |
|---|---|---|---|
| R1–R3, R5, R7, R8 | as in §5.1 | `spawn`, `listProcessSnapshots`, `stopProcesses`, `resolveAgentLaunch` overrides | unchanged |
| R4a | Refusals **before anything is acquired** (native-tool policy, `launch.ts:1120-1126`) | override options | error code; run finished as failed with the reason on its stream; `spawn` never called; the lock fake's `release` never called because nothing was acquired; the pinned temp root has **no** entry |
| R4b | Refusals **after** acquisition (`:781, :828, :847, :916`) | same | error code; `spawn` never called; lock released **once**, and the staged files still exist at the moment it is released (lock → files, `:1594-1595`); temp root empty afterwards |
| R6 | Failing ports, only those injectable today: `spawn`, `listProcessSnapshots`, `stopProcesses`, `attachAcpSession` | override options | each as `Error`, non-`Error`, rejection → documented outcome, no unhandled rejection |
| R9 | Event log | `SqliteSyncOpener` | §12.3 |
| R10 | Terminal | `terminalService` / `loadSpawnPty` options | default-inert boot rejects `create()` with the guidance error; custom loader wins; tuning reaches the service; `shutdownActive` forwards `graceMs` |
| R11 | Antigravity permissions | the real function on a temp directory (its only seam), plus `mcp-bridge.ts:237` for order against spawn | first grant: backup written once, settings contain the rule, no lock file left; second grant: no second backup, file unchanged; invalid JSON: rejects, file and backup untouched; bad server name: rejects before any file access |
| R12 | AI trace | `withAiTracing` with a recording sink | unchanged |
| R13 | Bridge probe | optional `spawn`, `now`, `timeoutMs` | §12.4 |
| R14 | Args reach spawn | override options | §12.2 |

Added **with** the step that creates the interface, in the same commit: lock → backup → write order and lock release on write failure through `fileLock`/`writer` fakes (step 4); failing `fileLock`/`writer` fakes three ways (step 4); `runtime` required-field type tests (step 5).

### 12.8 Runtime-state helpers (R8b, finding 8)

| Today | After | Must stay true |
|---|---|---|
| `selectAgentExecutorHostEnv({ env }, { runtimeState })`, falls back to `defaultRuntimeState` (`:212-222`) | `selectAgentExecutorHostEnv({ env, hostEnvNames })`, `hostEnvNames` required, taken from `agentRuntime.launch.hostEnvNames()` (C6 `sheets/C6.md:188`) | only allowlisted names are copied; the result is an independent snapshot; host-configured names come from the port, never from scanning the env |
| `appendFlagOverlay(…, { state })` reading `state?.capabilities ?? agentCapabilities` (`:611`) | `appendFlagOverlay({ …, capabilities })` where `capabilities = agentRuntime.launch.capabilities({ defId })` (C6 `:181`) | the gate is `!== false`: **explicit `false` withholds the flag, unknown allows it**. The comment at `:605-610` moves with the line. |
| `resolveSystemPromptOverlayDelivery(input, { state })` (`:672`) | takes `{ capabilities }` the same way | the capability map is read **when the run launches**, not when the executor is built: a probe that finishes later must be seen |
| `host-env-ports.test.ts:30, :43` | same cases with a `hostEnvNames` list and a capability fake | no assertion dropped; add "unknown vs false" as two cases |

If C6 lands without `hostEnvNames` or `capabilities` on the port, R8b stops (INDEX risk 10).

### 12.9 Filesystem effects (finding 9)

Not claimed compliant. Two groups:

| Effects | Files | Owner |
|---|---|---|
| Per-CLI staging (homes, config dirs, settings, MCP json) | `agent-executor/{claude,codex,opencode,antigravity,pi,gemini}/` | **lane K** (owner decision): these folders move to `agent-runtime/defs/<cli>/`. There they are the runtime's own Node code behind `AgentRuntimePort`, which the host binds. A daemon fs port written now would be deleted by K. |
| The launcher's own: private temp directory create/cleanup (`launch.ts:1049`, `:1157`), prompt/log file staging | `launch.ts` | **open, O-7.** Smallest compliant answer if the owner wants one: a daemon-local `StagingDirPort { create({ runId }); remove({ path }) }` bound by the host (2 members, one user). Until answered, R8's exit statement names this gap. |

### 12.10 Terminal: service required, node-pty still opt-in (finding 10)

- Daemon: `createTerminalSessionManager({ terminalService }, { shutdownGraceMs, … manager-only options })`. The `createTerminalService` default and the `loadSpawnPty` option leave daemon.
- Preset (`builtin-features.ts:400`): `terminalService: createTerminalService({ loadSpawnPty: options.terminal?.loadSpawnPty ?? inertPtyLoader, ...tuning })`. **`inertPtyLoader` throws the same guidance error as today**; the preset never binds `loadRealSpawnPty` by itself. A host opts in exactly as now, importing the adapter from its new path. The error text names the new import path (the old one, `@jini-ai/daemon/terminal`, no longer exists): one visible wording change, stated in the changeset.
- Tuning options that the manager forwarded to the service (`maxEvents`, `maxBufferBytes`, `exitTailBytes` and the rest of the `definedOnly` list at `terminal-session.ts:217`) move to the place the service is built: `options.terminal` in the preset. The executor lists every one in the commit and proves none is dropped (R10 "tuning reaches the service").
- `builtin-features.terminal-lifecycle.test.ts` changes in the same commit. It wraps daemon with `vi.mock` today only to force `shutdownGraceMs: 0`. After: the preset reads `options.terminal?.shutdownGraceMs` and the test passes it. **Flagged:** that is an option whose first user is a test; it replaces a mock of another package's internals (practice 8 over practice 11).
- Tests: default-inert boot, custom loader precedence, tuning, shutdown.

### 12.11 Tests move with the change; a fake is a fake (finding 11)

- `launch-defaults-and-staging.test.ts`: the cases that call the old signature (`:80`) are updated in step 5. The case that exercises the **real** process stopper as a default (`:95`) has no default to test any more: its assertion moves to the binding test in the package that owns the binding (§12.2), where the stopper is that package's own code.
- `fakeEventLogOpener` is not created (§12.3 needs none). Where a fake `SqliteDb` is needed it is an in-memory double of core's interface. Suites that need real SQL stay on the driver they use today and belong to Q5's lane; R8 does not relabel a real driver as a fake.
- The three classes of the 35 agent-runtime-importing tests stand, with one change: a class-(b) file that calls a changed signature is updated in that commit; "left untouched" applied only to files no signature change reaches.
- Each commit reports `it(` counts before and after for the files it touched.

### 12.12 Size-design 10 (finding 12)

Reconcile against **revision 2** of `10-jini-daemon-agent-executor-launch.md` (R6 migration graph, `:129`), which already makes R8 a prerequisite:

- **Kept:** the spawn leaf (`spawn-child.ts` / `spawn-confirm` in revision 2) with `spawnAgentChildProcess`, its `{ kind: 'ok' | 'error' }` result, its callers, tests and the timing comment at `launch.ts:855-871`. After R8 it imports the `ProcessSpawnPort` type and nothing from platform.
- **Deleted by R8:** default resolution only (`resolveProcessDeps`, `resolveAgentRuntimeDeps`, the override option fields). Revision 2's `resolve-deps` leaf then holds `resolveMiscExecutorDeps` alone.
- The declaration-to-destination map is size-10's step 0b, produced on the post-R8 file. R8 moves no declaration.

### 12.13 Spawn port, object arguments (finding 13)

```ts
// packages/daemon/src/ports/process.ts
import type { ChildProcess, SpawnOptions } from 'node:child_process';
/** Starts one OS process and returns it in the same synchronous turn. Never a promise: the caller attaches 'error' listeners before yielding. */
export type ProcessSpawnPort = (required: { readonly command: string; readonly args: readonly string[] }, optional?: SpawnOptions) => ChildProcess;
// host: spawn: ({ command, args }, options = {}) => spawn(command, [...args], options)
```
The return type is `ChildProcess`, so an `async` adapter does not typecheck. R1 (the microtask race) stays and still must fail when an `await` is put before listener registration.

### 12.14 Lane K: what R8 leaves port-shaped

Lane K moves `agent-executor/{claude,codex,opencode,antigravity,pi,gemini}/` to `agent-runtime/defs/<cli>/`. agent-runtime may import only itself, core and protocol. R8 therefore keeps these rules for every file in those folders (the same applies to `amr/` and `mimo/` if K takes them):

1. **Dependencies arrive as arguments.** `fileLock`, `writer`, env and paths are parameters, as `ensureAntigravityMcpPermission({ settingsPath, serverName, fileLock, writer })` after step 4. No per-CLI file imports a value from `../launch.js`, `../events.js` or `../../ports/*`.
2. **Types come from core.** `FileLockPort`, `AtomicFileWriterPort`, `RuntimeAgentDef` are core types. `ProcessSpawnPort` and `AgentExecutorRuntimePorts` are daemon-local and must not appear in a per-CLI signature; none needs spawn today (the probe is not per-CLI).
3. **No daemon state.** No per-CLI file reads the executor's maps (`filesystemTemps`, live inputs). Cleanup stays a callback the launcher owns (§4).
4. **Direct `node:fs` stays** in those folders; agent-runtime is a Node package and K moves the calls as they are.
5. R8 step 4 and step 6 each report `rg "from '\.\./" agent-executor/<cli>/` for the folders they touch. Every remaining upward import is recorded as a lane-K item, not fixed in R8.
6. The seam the launcher calls (`deps.ensureAntigravityMcpPermission`, `mcp-bridge.ts:237`, and its siblings) is what becomes a member of `AgentRuntimePort` in K; R8 does not rename it.

### 12.15 Practices and checklists, changes only

| # | Practice | Change in revision 2 |
|---|---|---|
| 1 | DI | command planner called with host values; no `process.platform`/`ComSpec` read in daemon. Not met and said so: §12.9. |
| 2 | Argument shape | no exception left (§12.13). |
| 5 | No forwarders | step 4 deletes `agent-executor/antigravity-permissions.ts` (a re-export shell). |
| 8 | Fakes | §12.11; one `vi.mock` of daemon in the preset's tests is removed (§12.10). |
| 10 | No silent change | named: the terminal guidance text (§12.10). The first version's auto-bound node-pty is gone. |
| 11 | Smallest change | two ports withdrawn (opener, command), one withdrawn pending C6 (recorder factory). |

Judge's classes: argument placement checked per member (§12.2) · landed vs worked example separated (§12.5) · executable calls only, comment mention removed (§12.4) · latest rulings followed (§12.6, §12.12) · assertions match what each path acquires (§12.7) · opt-in, precedence and synchronous timing kept (§12.10, §12.6, §12.13) · removing an import does not remove the behaviour (§12.12) · open exceptions listed as open (§12.9).

STOP additions: a binding needs a cast; a P0 case needs a seam that is not on the base; `rg` finds an executor or probe caller not in §12.4; C6 lands without `hostEnvNames`/`capabilities`.
