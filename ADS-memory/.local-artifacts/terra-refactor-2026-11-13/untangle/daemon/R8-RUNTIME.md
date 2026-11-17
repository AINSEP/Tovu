# R8: daemon runtime takes its implementations from the host (design, 2026-11-16)

Docs only. Read with `INDEX.md` and `R7-ROUTES.md`. Bases: Jini `integ/wave-b-r2` @ `02edbb68`, Tovu `integ/wave-b-r2` @ `65302ee5`.

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
| `node:fs`, `node:fs/promises` | `launch.ts:15`, `mcp-bridge.ts:3`, `claude/{config-dir.ts:1, filesystem.ts:1, mcp-config.ts:1, subagent-start.ts:1}`, `codex/home-staging.ts:1`, `antigravity/permissions.ts:4`, `legacy-data-migration.ts:18` | stages prompt/config/overlay files, per-agent homes | **No port.** Each is a single-consumer, per-agent staging routine with `node:os`/`node:path` beside it; a file-system port here would have one implementation and mirror `node:fs` (hexagonal "bad port: mirrors an SDK"). Tests already use temp dirs. Flagged as an owner call (INDEX O-7). |
| `node-pty` | `terminal.adapter.ts:7` (`nodePty.spawn` at :62) | real PTY | file moves to the preset (Q8) |
| `node:module` `createRequire` | `terminal.adapter.ts:6` | loads the optional peer | moves with it |
| `kysely` (types) | `store/agent-sessions/{sql.ts:3, sqlite.ts:189, pglite.ts:6, postgres.ts:6}`, `store/event-log/sqlite-kernel.ts:5` | `StorageKernel<Kysely<DB>, DB>` | not an R8 edge (C3 already repointed the kernel types to core). `kysely` stays a daemon dependency. **Conflict flagged** with the lane rule "no library types in Jini domain packages": INDEX O-8. |
| `better-sqlite3`, `pg`, `@electric-sql/pglite` | daemon `peerDependencies` only; no import in `src` | — | after R8 the SQLite opener is injected; remove `better-sqlite3` from peers if no `src` file names it (VERIFY with `rg`), keep `pg`/`pglite` only if a `store/*` entry still needs them |
| `process.env` / `process.*` | `launch.ts` (3), `contracts.ts` (3), `legacy-data-migration.ts` (2), `close-status.ts` (2), `codex/home-staging.ts` (2), `continuation/run-start-handler.ts`, `mcp-bridge-probe.ts`, `claude/{subagent-start,filesystem,config-dir}.ts`, `agent-env.ts` (1 each) | host env fallback, platform checks | `hostEnv` becomes required on `createAgentExecutor` (today: "host env falls back to the process env", `launch.ts:265`). The others are measured and listed at dispatch; any that is a silent default becomes a required option, any that is `process.platform` goes through the `platform` value C5 already threads to `CommandInvocationPort`. |
| timers | `events.ts` (SIGTERM→SIGKILL escalation), pi graceful-shutdown ms | process shutdown grace | keep; already parameterized (`piGracefulShutdownMs`). Tests use fake timers. |

### 1.4 Callers of the things R8 changes

| Function | Production callers | Tests |
|---|---|---|
| `createAgentExecutor` | Jini `packages/server/src/kernel-base.ts`; `examples/minimal-host/src/index.ts`; `examples/reference-web/src/{daemon,mcp-bridge}.ts`; Tovu `agent-daemon-scope.ts` (which documents a nested-copy hazard at :522-526) | Jini 15 files (`agent-executor.test.ts` is 7,228 lines), Tovu 1 |
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
| `ProcessControlPort { listProcessSnapshots; stopProcesses; waitForProcessExit }`, `collectProcessTreePids` (pure) | `@jini-ai/core/contracts/runtime` (C5) | **landed** | `platform/process` values in `launch.ts:56`, `events.ts:36` |
| `CommandInvocationPort`, pure `planCommandInvocation` | `@jini-ai/core/contracts/runtime` (C5) | landed | `createCommandInvocation` in `launch.ts:55` |
| `FileLockPort`, `AtomicFileWriterPort` | `@jini-ai/core/contracts/runtime` (C5) | landed | `withFileLock`, `writeFileAtomicAsync` in `antigravity/permissions.ts:5` |
| `PtySpawn`, `PtyProcess`, terminal service types | `@jini-ai/core/contracts/runtime/terminal.ts` (C5) | landed | — |
| `SqliteSyncOpener`, `SqliteDb` | `@jini-ai/core/contracts/storage` (C3) | landed | — |

`ai-trace` types go to `core/contracts/ai-trace` (C6). VERIFY in C6 §2 whether `createAiTraceRecorder` and `normalizeAiUsage` are moved to core as pure functions. If yes, daemon imports them from core and no port is needed. If no, see §2.2 rows 4–5. Do not design a second answer.

### 2.2 New in R8 (daemon-local, one consumer each)

```ts
// packages/daemon/src/ports/process.ts
import type { ChildProcess, SpawnOptions } from 'node:child_process';
/** Starts one OS process. The host binds node:child_process `spawn`; tests pass a fake child. */
export type ProcessSpawnPort = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
```
Positional because it is the exact `spawn` shape the launcher's synchronous spawn → listener-registration turn depends on (`launch.ts:854-866`); wrapping it in an object port would add a call frame but no meaning. The lane brief allows positional for runtime-shaped ports. It replaces `options.spawn ?? nodeSpawn` (`launch.ts:302`) and the direct `spawn` in `mcp-bridge-probe.ts:82`.

```ts
// packages/daemon/src/ports/runtime.ts
import type { AtomicFileWriterPort, CommandInvocationPort, FileLockPort, ProcessControlPort } from '@jini-ai/core/contracts/runtime';
import type { ProcessSpawnPort } from './process.js';

/** The OS-facing implementations one agent executor needs. All required: daemon has no default for any of them. */
export interface AgentExecutorRuntimePorts {
  readonly spawn: ProcessSpawnPort;
  readonly processes: ProcessControlPort;
  readonly command: CommandInvocationPort;
  readonly fileLock: FileLockPort;
  /** Also carries `backupOriginalOnce` (core `contracts/runtime/fs.ts:13`), used by the antigravity permissions rewrite. */
  readonly writer: AtomicFileWriterPort;
}
```
`backupOriginalOnce` is already a member of core's `AtomicFileWriterPort` (verified, `core/src/contracts/runtime/fs.ts:13`), so no extra field is declared.

| # | New port | File | Signature | Replaces |
|---|---|---|---|---|
| 1 | `ProcessSpawnPort` | `ports/process.ts` | above | `nodeSpawn` defaults |
| 2 | `AgentExecutorRuntimePorts` | `ports/runtime.ts` | above | `resolveProcessDeps` defaults (`launch.ts:297-306`) |
| 3 | `EventLogConnectionOpener` | `store/event-log/ports.ts` | `(required: { filePath: string; open: SqliteSyncOpener }, optional?: { pragmas?: readonly string[] }) => SqliteDb` (the shape of `openSqliteConnection` as called at `sqlite.ts:80`; C3's worked name) | `@jini-ai/db/sqlite` import |
| 4 | `AiTraceRecorderFactory` (only if C6 keeps the recorder in agent-runtime) | `ports/ai-trace.ts` | `(required: { sink; runId; agentId }, optional?: AiTraceRecorderOptions) => AiTraceRecorder` (types from `core/contracts/ai-trace`) | `createAiTraceRecorder` at `ai-trace-lifecycle.ts:75` |
| 5 | `TerminalService` (core `contracts/runtime/terminal.ts:81`, landed by C5; core also has `PtyPort { createTerminalService }` at :95) | — (core type) | `createTerminalSessionManager({ terminalService }, optional)`: `terminalService` moves from the optional `Pick` to **required** | `createTerminalService` default at `terminal-session.ts:213` |

### 2.3 Signature changes (exported functions)

```ts
// before: createAgentExecutor(options: CreateAgentExecutorOptions)   — 14 optional overrides with concrete defaults
// after:
export function createAgentExecutor(
  required: { readonly agentRuntime: AgentRuntimePort; readonly runtime: AgentExecutorRuntimePorts; readonly hostEnv: Readonly<Record<string, string | undefined>>; /* + today's truly required fields */ },
  optional: AgentExecutorOptional = {},   // piGracefulShutdownMs, bufferedStdoutMaxBytes, onCleanupFailure, codexDisablePlugins, …
): AgentExecutor
```
- Deleted from the options type: `getAgentDef`, `resolveAgentLaunch`, `ensureAgentCapabilities`, `applyAgentLaunchEnv`, `attachAcpSession`, `attachPiRpcSession`, `preparePromptFileForAgent`, `prepareAgentLogFile`, `runtimeState`, `createCommandInvocation`, `spawn`, `listProcessSnapshots`, `collectProcessTreePids`, `stopProcesses`. (`collectProcessTreePids` is pure and in core; it is called directly, not injected.)
- Deleted functions: `resolveAgentRuntimeDeps`, `resolveProcessDeps`. `resolveMiscExecutorDeps` stays (two plain defaults, no concrete import).
- `AgentExecutor['run']`, `sendUserMessage`, `claimUserMessages` keep their contracts exactly (`contracts.ts:270`: required run fields + optional settings, `Promise<void>`).
- `createAgentExecutor` already takes two objects (verified, `launch.ts:1009`: required `Pick<…, "lifecycle">`, everything else optional; `hostEnv ?? process.env` at :1011). R8 moves `agentRuntime`, `runtime` and `hostEnv` into the required object and deletes the override fields from the optional one. Nothing else in the split changes.

`openSqliteEventLog({ file, open, clock, openConnection }, options = {})`; `withAiTracing({ lifecycle, sink[, createRecorder] }, options = {})`; `createTerminalSessionManager({ terminalService }, optional = {})`.

---

## 3. Host wiring

### 3.1 Tovu (NEW `apps/website/src/server/runtime/composition/jini-daemon-runtime.ts`; `jini-agents.ts` is C6's)

```ts
import { spawn } from 'node:child_process';
import { listProcessSnapshots, stopProcesses, waitForProcessExit } from '@jini-ai/platform/process';
import { createCommandInvocation } from '@jini-ai/platform/command';
import { runtimePorts } from './jini-runtime-ports';   // C5's worked binding: fileLock + writer
import { openSqliteConnection } from '@jini-ai/db/sqlite';
import type { AgentExecutorRuntimePorts } from '@jini-ai/daemon/ports';
import type { EventLogConnectionOpener } from '@jini-ai/daemon/store/event-log/sqlite';

/** Tovu picks the Node implementations; daemon only states the ports. A shape change fails typecheck on these lines. */
export const daemonRuntimePorts = {
  spawn,
  processes: { listProcessSnapshots, stopProcesses, waitForProcessExit },
  command: createCommandInvocation,
  fileLock: /* platform's FileLockPort object, as C5's worked binding builds it */,
  writer: /* platform's AtomicFileWriterPort object, same (it includes backupOriginalOnce) */,
} satisfies AgentExecutorRuntimePorts;
export const openEventLogConnection = openSqliteConnection satisfies EventLogConnectionOpener;
```
`fileLock`/`writer`: reuse the binding object C5 already wrote for Tovu (`jini-runtime-ports.ts`, DESIGN §3) instead of building a second one; import it here. If platform's exported functions do not match the C5 port shapes without an arrow wrapper, that is C5's worked binding to fix, not a cast here.

Use in `agent-daemon-scope.ts` (one statement): `createAgentExecutor({ agentRuntime: agentRuntimePort, runtime: daemonRuntimePorts, hostEnv, … }, { … })`. The hazard note at :522-526 (two copies of agent-runtime) is resolved by this change; the comment is rewritten to say why the port exists, not deleted.

### 3.2 Jini `server` preset (Q1 host-preset; receives the Q8 adapter)

- `packages/server/src/kernel-base.ts`: the same binding, built from the same platform/db/agent-runtime imports the preset already has. To avoid two hosts hand-copying 12 lines, the binding object is exported by the preset (`@jini-ai/server` → `nodeDaemonRuntimePorts`) and **Tovu imports it from the preset if and only if** the owner accepts a host importing a host-preset (INDEX O-9). Default in this design: each host writes its own (12 lines; no new edge).
- **Q8 move:** `packages/daemon/src/terminal.adapter.ts` → `packages/server/src/adapters/node-pty.ts`, with `terminal-optional-peer.test.ts`. `loadRealSpawnPty` keeps its name and body. Daemon `package.json` loses the `./terminal` export + `jini.entries` line and the `node-pty` peer; `server` gains both. Changeset: daemon major-or-minor per the repo's pre-1.0 rule (a removed subpath is breaking). Repoint: no production importer found outside daemon; `daemon/src/index.ts` drops its line.
- `createTerminalSessionManager` in the preset: `terminalService: createTerminalService({ loadSpawnPty: () => loadRealSpawnPty({}) , … })` (platform + the moved adapter).

### 3.3 Examples

`examples/minimal-host/src/index.ts` and `examples/reference-web/src/{daemon,mcp-bridge}.ts` get the same binding inline. `minimal-host` "imports only `@jini-ai/*`" and is the neutrality gate: it binds `@jini-ai/agent-runtime` + `@jini-ai/platform`, which a host may do.

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
| ACP / PI-RPC session | `AgentRuntimePort.sessions.attach*` | session controller's own close, driven by `events.ts`; PI grace `piGracefulShutdownMs` | `AgentRuntimePort` | the grace value still reaches `attachPiRpc` (`launch.ts:283-285` binds it today; after R8 daemon passes it in `optional`). |
| SQLite event-log connection | `openSqliteEventLog` (`store/event-log/sqlite.ts:73`) through the injected opener | the returned log's `close()` (idempotent, `:86-88`); on setup failure the `catch` closes it (`:89-92`) | `EventLogConnectionOpener` | **Opened = owned.** `createSqliteEventLog({ db })` borrows and never closes. The host that called `open…` calls `close()` at shutdown. |
| Kernel-backed stores (`agent-sessions/*`, `event-log/sqlite-kernel.ts`) | host builds the `StorageKernel` | host | — | daemon never closes a kernel it was handed. |
| PTY processes | `TerminalService` (platform) via `PtySpawn` | `TerminalSessionManager.kill`, `shutdownActive({ graceMs })` (`terminal-session.ts:336`) | `TerminalServicePort`, `PtySpawn` | the **host** calls `shutdownActive` on stop (preset: its `stop()`); daemon never installs a process signal handler. |
| File lock on a user config file | `withFileLock` in `antigravity/permissions.ts` | released when the callback settles | `FileLockPort` | lock → backup once → atomic write order is unchanged. |
| AI trace recorder | `withAiTracing`, one per run (`ai-trace-lifecycle.ts:75`) | on run outcome | recorder factory | exactly one outcome per run. |

Nothing in this table changes owner in R8 except: the **host** now also owns constructing the process/command/fs/PTY/SQLite implementations. No port has a `dispose()`: none of the bound implementations holds state (functions over the OS), so there is nothing for the host to shut down beyond what it shuts down today.

---

## 5. Tests

### 5.1 Phase 0 characterization (before any source change; extend existing suites, do not start new ones)

`agent-executor/__tests__/split-parity.test.ts` already pins exact merged env values + object identity (`:55-80`) and synchronous spawn (`:83-103`). Add, through the **existing override options** (which is what makes these tests survive the change: only the way the fakes are passed changes):

| # | Case | Asserts (can fail on) |
|---|---|---|
| R1 | Spawn error race | fake `spawn` returns a child that emits `error` on the next tick → run fails with the startup error, staged files released, lock released once. A variant with a microtask inserted between spawn and listener registration must make this test fail (prove it once, then remove the variant). |
| R2 | `run()` resolves while the child lives | no staged file deleted, lock **not** released, `sendUserMessage` still delivers. Then child exits → lock released exactly once, cleanup ran exactly once. |
| R3 | Handoff path | lock released at handoff, not again at exit. |
| R4 | Each pre-spawn refusal (native-tool policy, filesystem path, filesystem runtime, prompt budget) | error code + `releaseStagedResources` called once + `spawn` **never** called. One case per refusal (AP8). |
| R5 | Cancel | `listProcessSnapshots` called once, `stopProcesses` receives the tree pids of the fake snapshot (3 processes, the child in the middle), SIGKILL fallback when `stopProcesses` rejects; no pending timers after (AP10). |
| R6 | Failing ports (AP11) | each of `spawn`, `listProcessSnapshots`, `stopProcesses`, `command`, `fileLock`, `writer` (incl. `backupOriginalOnce`), `attachAcp`: throws an `Error`, throws a non-`Error`, rejects → the documented outcome (typed executor error or `onCleanupFailure` report), never an unhandled rejection. |
| R7 | Two executors, overlapping runs | independent temp maps, relays, cleanup logs. |
| R8 | argv/env goldens per agent def | exact argv array and exact env **values** for a pinned host env (not sorted keys). |
| R9 | Event log | `openSqliteEventLog` with a fake opener: pragmas requested = `['journal_mode = WAL']`; setup failure closes the db and rethrows the setup error; `close()` twice closes once. Borrowed `createSqliteEventLog` never closes. |
| R10 | Terminal manager | with a fake `TerminalService`: create/kill/attach/shutdown pass through; `shutdownActive` forwards `graceMs`. Existing `terminal-session.test.ts` keeps its cases. |
| R11 | Antigravity permissions | a fake `fileLock` and `writer` (incl. its `backupOriginalOnce`) record call order: lock → backup → write; a write failure leaves the backup and releases the lock. |
| R12 | AI trace | one recorder per run id; outcome recorded once on success, failure and cancel. |

Clock, UUIDs, pids and platform are injected or pinned. The real-CLI tests (`claude-bash-sandbox.live.test.ts`, `*-acp.integration.test.ts`) are not characterization; they move to `packages/integration-tests` with Q5's lane, not here.

### 5.2 Fakes (interfaces only)

| Fake | Where | Shape |
|---|---|---|
| `fakeAgentRuntimePort()` | `daemon/src/ports/__tests__/agent-runtime-port.fake.ts` (C6 §7 creates it; R8 uses and extends it) | every member a recording function with a sensible default def |
| `fakeProcessControl({ snapshots })`, `fakeSpawn()` → `{ spawn, children }` with a scriptable `FakeChild` (`EventEmitter` + `pid`, `stdin`, `stdout`, `stderr`, `kill`) | `daemon/src/ports/__tests__/fakes/process.ts` | replaces 3 × `vi.mock('node:child_process')` |
| `fakeRuntimePorts(overrides)` | same folder | builds a full `AgentExecutorRuntimePorts` from the fakes; in-memory `fileLock` (runs the callback), recording `writer` |
| `fakeEventLogOpener()` | `store/event-log/__tests__/fakes.ts` | returns a `SqliteDb` test double **or** delegates to `@jini-ai/db/testing`'s real in-memory driver for SQL-level suites (Q5 allows `/testing`; GAPS §4.3 plans that entry) |
| `fakeTerminalService()` | `daemon/src/__tests__/fakes/terminal-service.ts` | replaces `vi.mock('@jini-ai/platform')` and `vi.mock('node-pty')` |

If core ships `core/contracts/runtime/testing` fakes for `ProcessControlPort`/`FileLockPort` (DESIGN §4 says core may), use those and write only the daemon-specific ones. VERIFY before writing (`ls packages/core/src/contracts/runtime`).

Each fake that stands in for a contract gets one broken-adapter self-check (AP12): e.g. a `fakeProcessControl` whose `stopProcesses` ignores its pids must make R5 fail.

After R8 the 35 daemon test files that import `@jini-ai/agent-runtime` are in three classes; the lane reports the count of each: (a) only needed a def or a type → use the fake / core type; (b) genuinely test daemon against the real runtime → integration, move with Q5's lane (not R8); (c) used agent-runtime as a convenient real implementation of an override → switch to the fake. R8 converts (a) and (c) for the files it touches and leaves (b) listed, untouched. **No assertion is removed to make a file fit.**

---

## 6. Migration steps (each commit compiles and passes; Jini first, then the paired Tovu commit)

| Step | Content | Files | Notes |
|---|---|---|---|
| 0 | Phase 0 tests (§5.1), no source change | daemon tests | green on the unmodified tree |
| 1 | `ports/process.ts`, `ports/runtime.ts`, `store/event-log/ports.ts`, fakes + their self-checks; `./ports` export lines (C6 created the subpath) | new files only | nothing uses them yet |
| 2 | **Event-log opener** injected | `store/event-log/sqlite.ts` + its one caller (`packages/server/src/kernel-base.ts`, verified) + the preset binding | smallest, calibrates the "port + binding" rate; removes `@jini-ai/db` from daemon `dependencies` |
| 3 | **Terminal:** `terminalService` required; `terminal.adapter.ts` → preset (Q8); manifests | `terminal-session.ts`, `terminal.adapter.ts`, `index.ts`, daemon + server `package.json`, 2 tests | pure move for the adapter (one commit), then the required-port change (second commit) |
| 4 | **Antigravity permissions** take `fileLock`/`writer` | `antigravity/permissions.ts` + its caller chain up to the executor options | VERIFY how it is reached from `createAgentExecutor`; thread `runtime` down, no module-level access |
| 5 | **Process ports** required: delete `resolveProcessDeps`, the `spawn`/`listProcessSnapshots`/`stopProcesses`/`createCommandInvocation` imports and options; `mcp-bridge-probe.ts` takes `spawn` | `launch.ts`, `events.ts`, `contracts.ts`, `mcp-bridge-probe.ts`, 4 host call sites, tests | removes `@jini-ai/platform` from daemon `dependencies` together with step 3/4 and R7's two http files (whichever lands last removes the manifest line) |
| 6 | **Agent runtime:** `agentRuntime: AgentRuntimePort` required; delete `resolveAgentRuntimeDeps` and the 22-name import; `events.ts` streams/sessions through the port; `claude/filesystem.ts` through `port.filesystem`; `model-receipts.ts`, `event-translation.ts`, `session-coordination.ts` | 7 files + `contracts.ts` + hosts + tests | the largest step. Split in two commits: (6a) `launch.ts` + `contracts.ts` + hosts; (6b) `events.ts` and the 4 small files. Needs C6 landed with §4b signatures. |
| 7 | **AI trace** per C6's answer (core import, or recorder factory) | `ai-trace-lifecycle.ts` + callers | |
| 8 | Type-only repoints to `core/contracts/agents` for any line C6's applier pass did not already do | 9 files | scripted (`C6.repoint.tsv`); likely already done by C6 |
| 9 | Manifest + debt: remove `@jini-ai/agent-runtime` from daemon `dependencies` (only when R7's `model-proxy`/`xai`/`research`/`agents` pairs have landed), retire the `injection-debt.json` keys, changeset | `package.json`, `scripts/injection-debt.json` (coordinator applies) | |

Sub-lane split (LANES says 2): **R8a** = steps 0–5, 7 (needs C5 ✓, C3 ✓, Q8 ✓; **can start now**). **R8b** = steps 6, 8, 9 (needs C6).

`launch.ts` and `events.ts` are already far over the 500-line limit and several functions inside them are over 50 lines. R8 only **deletes** lines there (imports, two resolver functions, option fields) and renames call receivers (`deps.getAgentDef(x)` → `agentRuntime.defs.get(x)`). It adds no function to either file. If a call-site rewrite would push any function's complexity up (e.g. an inline `options.codexDisablePlugins ? … : …` that `resolveAgentRuntimeDeps` used to hide), the logic goes into C6's `createAgentRuntimeBindings`, which is where C6 §11 already puts the codex binding.

**Rollback:** each step reverts alone. Step 3's move reverts as a move.

---

## 7. Who owns the launcher: R8 or size-design 10

Two designs touch `agent-executor/launch.ts`. **R8 owns its dependencies; size-design 10 owns its shape, and runs after R8.**

| Question | Owner | Why |
|---|---|---|
| Which packages `launch.ts` may import; what the ports are; who binds them | **R8** (+ C6 for `AgentRuntimePort`) | It is the untangle lane; lesson 10: untangle lanes that touch a file are prerequisites. Size-10's own §5 says "run this design after R8 lands". |
| Deleting `resolveAgentRuntimeDeps` / `resolveProcessDeps` | **R8** | They exist only to supply defaults. Size-10's planned `launch/runtime-deps.ts` ("the ONLY file importing `@jini-ai/agent-runtime`") and `launch/spawn-child.ts` ("the ONLY file importing `@jini-ai/platform`") **must be dropped from that design**: after R8 no file imports either. |
| Splitting the 1,710 lines into files; hoisting the 20 closures; `ExecutorScope` / per-run state | **size-design 10, reworked** | The Codex judge returned it "needs rework" (1 blocker, 4 majors). Its rework must start from the post-R8 file and from §4's ownership table here (the judge's blocker was exactly the cleanup model). |
| Characterization tests for cleanup, spawn race, overlapping runs | **R8 Phase 0** writes them (§5.1 R1–R8); size-10 reuses them unchanged | One suite, written once, before either change. |
| `scripts/size-debt.json` entries for `launch.ts` | size-design 10 | R8 lowers line counts but does not clear the entries; path-keyed debt does not move in R8 because no code moves. |

Reconciliation edits owed to `size-designs/10-…md` (not made here; that branch is not this run's to push): delete `runtime-deps.ts` and `spawn-child.ts` from §2; replace `ExecutorScope.runtime: AgentRuntimeDeps` with the two ports; mark R8 as a hard prerequisite; adopt §4 here as the cleanup model.

---

## 8. Owner practices, checked

| # | Practice | Status |
|---|---|---|
| 1 | DI, no concrete reach | All 44 cross-package values become host-bound ports. `spawn` default and `hostEnv` → `process.env` fallback removed. **Not ported, flagged:** direct `node:fs`/`node:os` in staging helpers (O-7); remaining `process.*` reads are listed and converted or justified at dispatch. |
| 2 | `(required, optional = {})` | New/changed exported functions follow it. Exception: `ProcessSpawnPort` is positional (the `spawn` shape; lane brief's runtime-port exception). |
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
